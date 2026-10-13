import express from 'express';
import type { Request, Response } from 'express';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Room } from './engine.js';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const MIN_PHASE_MS = Number(process.env.MIN_PHASE_MS || 5000);
const ALLOWED_ORIGINS = String(process.env.ALLOWED_ORIGINS || '*').split(',').map(s => s.trim()).filter(Boolean);
const MAX_ROOMS = 300;
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const app = express();
const server = http.createServer(app);

// ==============================================================================
// 1. إدارة غرف المافيا في الذاكرة (Mafia Engine Management)
// ==============================================================================
const rooms = new Map<string, Room>();
const streams = new Map<string, Set<{ res: Response; token: string; id: string }>>();
const ipHits = new Map<string, number[]>();
const pendingBroadcasts = new Set<string>();

const norm = (c: any) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

function broadcastRoom(room: Room) {
    if (pendingBroadcasts.has(room.code)) return;
    pendingBroadcasts.add(room.code);
    setImmediate(() => {
        pendingBroadcasts.delete(room.code);
        const set = streams.get(room.code) || new Set();
        for (const s of [...set]) {
            const v = room.viewFor(s.token);
            if (v) {
                s.res.write('event: state\ndata: ' + JSON.stringify(v) + '\n\n');
            } else {
                s.res.write('event: kicked\ndata: {}\n\n');
                s.res.end();
                set.delete(s);
            }
        }
    });
}

function rateLimit(ip: string): boolean {
    const now = Date.now();
    const hits = (ipHits.get(ip) || []).filter(t => now - t < 1000);
    hits.push(now);
    ipHits.set(ip, hits);
    return hits.length > 50;
}

// ==============================================================================
// 2. المخزن الهجين للبيانات (Server-Side Hybrid Store)
// ==============================================================================
const serverDb: Record<string, any> = {
    settings: {
        platform: {
            maintenance: false,
            maintenanceMsg: "المنصة قيد الصيانة المؤقتة، يُرجى المحاولة لاحقاً.",
            announcement: "",
            defaultMaxTables: 0,
            picksPerTeam: 3,
            defaultTimer: 30,
            updatedAt: Date.now()
        }
    },
    cafes: {
        "cafe-demo": {
            cafeName: "كافيه الأصدقاء (تجريبي)",
            city: "عمان",
            phone: "0790000000",
            ownerEmail: "cafe@test.com",
            status: "active",
            createdAt: Date.now() - 86400000,
            maxTables: 10,
            games: { board: true, htns: true, race: true, mafia: true },
            notes: "مقهى تجريبي مفعل مسبقاً"
        }
    },
    cafeTables: { "cafe-demo": {} },
    tables: {},
    auditLog: {},
    gameLog: {},
    cafePublic: {
        "cafe-demo": {
            name: "كافيه الأصدقاء (تجريبي)",
            prize: { active: true, title: "قهوة مجانية للفائز", mode: "every" }
        }
    },
    leaderboard: {},
    prizeClaims: {}
};

// ==============================================================================
// 3. إعداد Express وCORS وBody Parser
// ==============================================================================
app.use((req, res, next) => {
    const origin = req.headers.origin as string;
    if (ALLOWED_ORIGINS.includes('*') || !origin) {
        res.setHeader('Access-Control-Allow-Origin', '*');
    } else if (ALLOWED_ORIGINS.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
        res.sendStatus(204);
        return;
    }
    next();
});

app.use(express.json({ limit: '2mb' }));

// ==============================================================================
// 4. مسارات المافيا الحية (Mafia SSE & REST Endpoints)
// ==============================================================================
app.get('/api/health', (req, res) => {
    res.json({ ok: true, rooms: rooms.size, serverTime: Date.now() });
});

app.get('/api/stream', (req, res) => {
    const roomCode = norm(req.query.room);
    const token = String(req.query.token || '');
    const room = rooms.get(roomCode);
    const me = room && room.byToken(token);

    if (!room || !me) {
        res.status(401).json({ error: 'جلسة غير صالحة أو الغرفة غير موجودة.' });
        return;
    }

    res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-store, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no'
    });
    res.write('retry: 2000\n\n');

    const entry = { res, token, id: me.id };
    if (!streams.has(room.code)) streams.set(room.code, new Set());
    streams.get(room.code)!.add(entry);

    room.setConnected(me.id, true);
    broadcastRoom(room);

    req.on('close', () => {
        const set = streams.get(room.code);
        if (set) set.delete(entry);
        const still = set && [...set].some(s => s.id === me.id);
        if (!still && rooms.get(room.code) === room) {
            room.setConnected(me.id, false);
            broadcastRoom(room);
        }
    });
});

app.post('/api/join', (req, res) => {
    const ip = req.socket.remoteAddress || '?';
    if (rateLimit(ip)) {
        res.status(429).json({ error: 'طلبات كثيرة، تمهّل قليلاً.' });
        return;
    }

    const { name, create, token } = req.body || {};
    let code = norm(req.body?.room);
    let room = rooms.get(code);

    if (!room) {
        if (!create) {
            res.status(404).json({ error: 'الغرفة غير موجودة. تأكد من الرمز أو أنشئ غرفة جديدة.' });
            return;
        }
        if (rooms.size >= MAX_ROOMS) {
            res.status(503).json({ error: 'الخادم ممتلئ حالياً، حاول لاحقاً.' });
            return;
        }
        if (!code) {
            do {
                code = Array.from({ length: 5 }, () => ALPHA[Math.floor(Math.random() * ALPHA.length)]).join('');
            } while (rooms.has(code));
        }
        if (code.length < 3 || code.length > 12) {
            res.status(400).json({ error: 'رمز الغرفة من 3 إلى 12 حرفاً أو رقماً.' });
            return;
        }
        room = new Room(code, { minPhase: MIN_PHASE_MS });
        rooms.set(code, room);
    }

    const r = room.join(name, token);
    if ((r as any).error) {
        res.status(400).json({ error: (r as any).error });
        return;
    }

    broadcastRoom(room);
    res.json({ room: room.code, id: (r as any).id, token: (r as any).token, rejoined: Boolean((r as any).rejoined) });
});

app.post('/api/action', (req, res) => {
    const code = norm(req.body?.room);
    const room = rooms.get(code);
    if (!room) {
        res.status(404).json({ error: 'الغرفة غير موجودة.' });
        return;
    }

    const r = room.act(req.body?.token, req.body);
    if ((r as any).error) {
        res.status(400).json({ error: (r as any).error });
        return;
    }

    broadcastRoom(room);
    res.json({ ok: true });
});

app.post('/api/leave', (req, res) => {
    const code = norm(req.body?.room);
    const room = rooms.get(code);
    if (!room) {
        res.status(404).json({ error: 'الغرفة غير موجودة.' });
        return;
    }

    const me = room.byToken(req.body?.token);
    if (!me) {
        res.status(401).json({ error: 'جلسة غير صالحة.' });
        return;
    }

    room.leave(me.id);
    broadcastRoom(room);
    res.json({ ok: true });
});

// ==============================================================================
// 5. مسارات المخزن الهجين (Hybrid Store Sync Endpoints)
// ==============================================================================
app.get('/api/hybrid/dump', (req, res) => {
    res.json(serverDb);
});

app.post('/api/hybrid/write', (req, res) => {
    const { path: p, val } = req.body || {};
    if (!p) {
        res.status(400).json({ error: 'Invalid path' });
        return;
    }
    const parts = String(p).replace(/^\/|\/$/g, '').split('/');
    let cur = serverDb;
    for (let i = 0; i < parts.length - 1; i++) {
        const seg = parts[i];
        if (cur[seg] == null || typeof cur[seg] !== 'object') cur[seg] = {};
        cur = cur[seg];
    }
    const last = parts[parts.length - 1];
    if (val === null || val === undefined) delete cur[last];
    else cur[last] = val;

    res.json({ ok: true });
});

// ==============================================================================
// 6. تقديم صفحات الويب الثابتة (Static Files & Game Pages)
// ==============================================================================
// مسارات واضحة ومباشرة لكل صفحة
app.get(['/', '/admin', '/admin.html'], (req, res) => {
    const f = path.join(__dirname, 'public', 'index.html');
    if (fs.existsSync(f)) res.sendFile(f);
    else res.sendFile(path.join(__dirname, 'index.html'));
});

app.get(['/games', '/games.html', '/play', '/play.html'], (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'games.html'));
});

app.get(['/player', '/player.html', '/board', '/board.html'], (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'player.html'));
});

app.get(['/mafia', '/mafia.html'], (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'mafia.html'));
});

app.get(['/leaderboard', '/leaderboard.html'], (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'leaderboard.html'));
});

app.get(['/htns', '/htns.html'], (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'htns.html'));
});

app.get(['/race', '/race.html'], (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'race.html'));
});

// مسار تنزيل كود المشروع الكامل بصيغة ZIP
app.get(['/download', '/download-project', '/api/download', '/download.zip'], (req, res) => {
    const zipPath = path.join(__dirname, 'public', 'cafe-games-project.zip');
    if (fs.existsSync(zipPath)) {
        res.download(zipPath, 'cafe-games-full-project.zip');
    } else {
        res.status(404).send('Archive not found');
    }
});

// خدمة الملفات الثابتة من المجلدات
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(__dirname));

// ==============================================================================
// 7. مؤقتات الخادم التلقائية
// ==============================================================================
// فحص أطوار غرف المافيا كل 250 مللي ثانية
setInterval(() => {
    for (const r of rooms.values()) {
        if (r.tick()) broadcastRoom(r);
    }
}, 250);

// إرسال ping للحفاظ على استقرار SSE
setInterval(() => {
    for (const s of streams.values()) {
        for (const e of s) {
            try { e.res.write(': ping\n\n'); } catch (err) {}
        }
    }
}, 15000);

// تنظيف الغرف الخاملة كل 30 ثانية
setInterval(() => {
    for (const [c, r] of rooms) {
        if (r.isIdle(10 * 60 * 1000, 3 * 3600 * 1000)) {
            rooms.delete(c);
            const set = streams.get(c);
            if (set) {
                for (const e of set) try { e.res.end(); } catch (err) {}
            }
            streams.delete(c);
        }
    }
    ipHits.clear();
}, 30000);

// ==============================================================================
// 8. تشغيل الخادم وربط Vite في بيئة التطوير
// ==============================================================================
async function startServer() {
    if (process.env.NODE_ENV !== 'production') {
        try {
            const { createServer: createViteServer } = await import('vite');
            const vite = await createViteServer({
                server: { middlewareMode: true },
                appType: 'custom'
            });
            app.use(vite.middlewares);
        } catch (e) {
            console.log('Running in Express direct static mode');
        }
    }

    server.listen(PORT, '0.0.0.0', () => {
        console.log(`=======================================================`);
        console.log(`🎮 منصة «العبها صح» والألعاب الجماعية تعمل الآن بنجاح!`);
        console.log(`🌐 الرابط: http://localhost:${PORT}`);
        console.log(`=======================================================`);
    });
}

startServer();

export { app, server, rooms };
