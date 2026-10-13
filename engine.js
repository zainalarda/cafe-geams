// محرك لعبة المافيا: المنطق الصارم على الخادم لمنع الغش وحماية سرية الأدوار
import { randomBytes } from 'node:crypto';

export const LIMITS = { min: 5, max: 20, name: 16, chat: 200 };
export const PHASES = ['LOBBY', 'ROLE_REVEAL', 'NIGHT', 'NIGHT_RESULT', 'DAY', 'VOTING', 'VOTE_RESULT', 'GAME_OVER'];
export const ROLE_INFO = {
    mafia: { name: 'المافيا', team: 'mafia', desc: 'تعرف زملاءك. كل ليلة تتفقون على ضحية. تفوزون عندما يتساوى عددكم مع بقية الأحياء أو يزيد.' },
    citizen: { name: 'مواطن', team: 'citizens', desc: 'لا قدرة خاصة لك. ناقش وصوّت لكشف المافيا. تفوزون بالقضاء عليهم جميعاً.' },
    doctor: { name: 'الطبيب', team: 'citizens', desc: 'كل ليلة تحمي لاعباً واحداً (يمكنك حماية نفسك). إن اختاره المافيا فلن يموت.' },
    detective: { name: 'المحقق', team: 'citizens', desc: 'كل ليلة تفحص لاعباً وتصلك نتيجة سرية: هل هو من المافيا أم لا.' },
    jester: { name: 'المهرّج', team: 'jester', desc: 'هدفك أن يصوّت عليك الجميع في النهار. إن أُخرجت بالتصويت فزت وحدك.' }
};
export const DEFAULT_TIMES = { night: 45000, day: 120000, vote: 45000, reveal: 10000, result: 8000 };

export function defaultConfig() {
    return { mafia: 'auto', doctor: true, detective: true, jester: false, jesterWins: true, tieRule: 'revote', selfVote: false, revealOnDeath: true, times: { ...DEFAULT_TIMES } };
}
export const autoMafia = n => Math.max(1, Math.floor(n / 4));

// يتحقق من صلاحية توزيع الأدوار لعدد اللاعبين، ويعيد العدّ الفعلي لكل دور
export function validateConfig(n, c, minPhase = 5000) {
    if (!Number.isInteger(n) || n < LIMITS.min || n > LIMITS.max) return { ok: false, error: `عدد اللاعبين يجب أن يكون بين ${LIMITS.min} و${LIMITS.max}.` };
    const mafia = c.mafia === 'auto' ? autoMafia(n) : Number(c.mafia);
    if (!Number.isInteger(mafia) || mafia < 1) return { ok: false, error: 'يجب أن يكون هناك فرد مافيا واحد على الأقل.' };
    if (mafia * 2 >= n) return { ok: false, error: 'عدد المافيا يجب أن يكون أقل من نصف اللاعبين.' };
    const doctor = c.doctor ? 1 : 0, detective = c.detective ? 1 : 0, jester = c.jester ? 1 : 0;
    const citizen = n - mafia - doctor - detective - jester;
    if (citizen < 0) return { ok: false, error: 'عدد الأدوار الخاصة أكبر من عدد اللاعبين.' };
    if (!['revote', 'none'].includes(c.tieRule)) return { ok: false, error: 'قاعدة التعادل غير صالحة.' };
    for (const k of Object.keys(DEFAULT_TIMES)) {
        const v = c.times && c.times[k];
        if (!Number.isFinite(v) || v < minPhase || v > 600000) return { ok: false, error: 'مدة إحدى المراحل غير صالحة.' };
    }
    return { ok: true, counts: { mafia, doctor, detective, jester, citizen } };
}

const clean = s => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim();
const err = error => ({ error });
const ok = (extra = {}) => ({ ok: true, ...extra });

export class Room {
    constructor(code, opts = {}) {
        this.code = code;
        this.clock = opts.now || Date.now;
        this.rng = opts.rng || Math.random;
        this.minPhase = opts.minPhase ?? 5000;
        this.players = new Map();
        this.seq = 0;
        this.hostId = null;
        this.config = defaultConfig();
        this.created = this.lastActive = this.clock();
        this.audit = [];
        this.resetGame();
    }

    // ---------- أدوات ----------
    touch() { this.lastActive = this.clock(); }
    p(id) { return this.players.get(id) || null; }
    byToken(token) { if (!token) return null; for (const p of this.players.values()) if (p.token === token) return p; return null; }
    alive() { return [...this.players.values()].filter(p => p.alive); }
    aliveOf(role) { return this.alive().filter(p => p.role === role); }
    log(kind, text) { this.events.push({ r: this.round, k: kind, text, t: this.clock() }); if (this.events.length > 300) this.events.shift(); }
    note(msg) { this.audit.push({ t: this.clock(), msg }); if (this.audit.length > 500) this.audit.shift(); }
    shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(this.rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
    setPhase(ph, ms) { this.phase = ph; this.endsAt = ms ? this.clock() + ms : null; }

    resetGame() {
        this.phase = 'LOBBY'; this.endsAt = null; this.round = 0; this.events = []; this.winner = null;
        this.night = null; this.votes = {}; this.candidates = []; this.revoted = false; this.lastVotes = null; this.lastNight = null;
        this.chat = { lobby: [], day: [], mafia: [], dead: [] };
        for (const p of this.players.values()) { p.role = null; p.alive = true; p.inbox = []; p.stats = null; p.diedAt = null; p.cause = null; }
    }

    // ---------- الانضمام والاتصال ----------
    join(rawName, token) {
        const known = this.byToken(token);
        if (known) { known.connected = true; this.touch(); return ok({ id: known.id, token: known.token, rejoined: true }); }
        if (this.phase !== 'LOBBY') return err('اللعبة بدأت بالفعل، لا يمكن الانضمام الآن.');
        const name = clean(rawName).slice(0, LIMITS.name);
        if (!name) return err('اكتب اسماً للانضمام.');
        if (this.players.size >= LIMITS.max) return err(`الغرفة ممتلئة (${LIMITS.max} لاعباً).`);
        for (const p of this.players.values()) if (p.name.toLowerCase() === name.toLowerCase()) return err('هذا الاسم مستخدم في الغرفة، اختر اسماً آخر.');
        const id = 'p' + (++this.seq);
        const player = { id, name, token: randomBytes(16).toString('hex'), connected: true, alive: true, role: null, inbox: [], stats: null, joinedAt: this.clock(), lastChat: 0 };
        this.players.set(id, player);
        if (!this.hostId) this.hostId = id;
        this.touch(); this.note(`join ${id}`);
        return ok({ id, token: player.token });
    }
    setConnected(id, flag) {
        const p = this.p(id); if (!p) return;
        p.connected = !!flag; this.touch();
        if (!flag && id === this.hostId) this.migrateHost();
    }
    migrateHost() {
        const cand = [...this.players.values()].filter(p => p.connected).sort((a, b) => a.joinedAt - b.joinedAt)[0];
        if (cand && cand.id !== this.hostId) { this.hostId = cand.id; this.log('info', `${cand.name} أصبح مضيف الغرفة.`); }
    }
    leave(id) {
        const p = this.p(id); if (!p) return;
        if (this.phase === 'LOBBY') { this.players.delete(id); if (this.hostId === id) { this.hostId = null; this.migrateHost(); if (!this.hostId) this.hostId = [...this.players.keys()][0] || null; } }
        else this.setConnected(id, false);
        this.touch();
    }
    kick(hostId, targetId) {
        if (hostId !== this.hostId) return err('للمضيف فقط.');
        if (this.phase !== 'LOBBY') return err('لا يمكن الطرد بعد بدء اللعبة.');
        if (targetId === hostId || !this.players.has(targetId)) return err('لاعب غير صالح.');
        this.players.delete(targetId); this.touch(); return ok();
    }

    // ---------- الإعدادات والبدء ----------
    updateConfig(id, patch) {
        if (id !== this.hostId) return err('للمضيف فقط.');
        if (this.phase !== 'LOBBY') return err('لا يمكن تعديل الإعدادات بعد بدء اللعبة.');
        const c = JSON.parse(JSON.stringify(this.config)), pt = patch || {};
        if ('mafia' in pt) c.mafia = pt.mafia === 'auto' ? 'auto' : Number(pt.mafia);
        for (const k of ['doctor', 'detective', 'jester', 'jesterWins', 'selfVote', 'revealOnDeath']) if (k in pt) c[k] = !!pt[k];
        if ('tieRule' in pt) c.tieRule = pt.tieRule;
        if (pt.times) for (const k of Object.keys(DEFAULT_TIMES)) if (k in pt.times) c.times[k] = Number(pt.times[k]);
        for (const k of Object.keys(DEFAULT_TIMES)) if (!Number.isFinite(c.times[k]) || c.times[k] < this.minPhase || c.times[k] > 600000) return err('مدة إحدى المراحل غير صالحة.');
        if (!['revote', 'none'].includes(c.tieRule)) return err('قاعدة التعادل غير صالحة.');
        if (c.mafia !== 'auto' && (!Number.isInteger(c.mafia) || c.mafia < 1 || c.mafia > 9)) return err('عدد المافيا غير صالح.');
        this.config = c; this.touch(); return ok();
    }
    start(id) {
        if (id !== this.hostId) return err('للمضيف فقط.');
        if (this.phase !== 'LOBBY') return err('اللعبة بدأت بالفعل.');
        for (const p of [...this.players.values()]) if (!p.connected) this.players.delete(p.id);
        if (!this.players.has(this.hostId)) this.migrateHost();
        const n = this.players.size, v = validateConfig(n, this.config, this.minPhase);
        if (!v.ok) return err(v.error);
        const roles = [];
        for (const [r, k] of Object.entries(v.counts)) for (let i = 0; i < k; i++) roles.push(r);
        this.shuffle(roles);
        let i = 0;
        for (const p of this.players.values()) {
            p.role = roles[i++]; p.alive = true; p.inbox = [];
            p.stats = { votesCast: 0, votesReceived: 0, correctVotes: 0, saves: 0, found: 0 };
        }
        this.events = []; this.round = 0; this.winner = null; this.chat.day = []; this.chat.mafia = []; this.chat.dead = [];
        this.log('info', `بدأت اللعبة بـ ${n} لاعبين: ${v.counts.mafia} مافيا و${n - v.counts.mafia} من الباقين.`);
        this.setPhase('ROLE_REVEAL', this.config.times.reveal);
        this.touch(); this.note('start'); return ok();
    }
    newRound(id) {
        if (id !== this.hostId) return err('للمضيف فقط.');
        if (this.phase !== 'GAME_OVER') return err('اللعبة لم تنتهِ بعد.');
        for (const p of [...this.players.values()]) if (!p.connected) this.players.delete(p.id);
        this.resetGame(); this.touch(); return ok();
    }

    // ---------- الإجراءات ----------
    act(token, a) {
        const me = this.byToken(token);
        if (!me) return err('جلسة غير صالحة.');
        this.touch();
        const t = a && a.type;
        switch (t) {
            case 'config': return this.updateConfig(me.id, a.patch);
            case 'start': return this.start(me.id);
            case 'kick': return this.kick(me.id, a.target);
            case 'newRound': return this.newRound(me.id);
            case 'night': return this.actNight(me, a.target);
            case 'vote': return this.actVote(me, a.target);
            case 'chat': return this.actChat(me, a.channel, a.text);
            case 'skip': return this.actSkip(me);
            default: return err('إجراء غير معروف.');
        }
    }
    actNight(me, target) {
        if (this.phase !== 'NIGHT') return err('ليست مرحلة الليل.');
        if (!me.alive) return err('أنت خارج الجولة.');
        if (!['mafia', 'doctor', 'detective'].includes(me.role)) return err('ليس لدورك إجراء ليلي.');
        if (this.night.done[me.id]) return err('نفّذت إجراءك لهذه الليلة بالفعل.');
        const t = this.p(target);
        if (!t || !t.alive) return err('هدف غير صالح.');
        if (me.role === 'mafia' && t.role === 'mafia') return err('لا يمكنك استهداف زميلك.');
        if (me.role === 'detective' && t.id === me.id) return err('لا يمكنك فحص نفسك.');
        if (me.role === 'mafia') this.night.mafiaVotes[me.id] = t.id;
        else this.night[me.role] = t.id;
        this.night.done[me.id] = true;
        if (this.nightComplete()) this.resolveNight();
        return ok();
    }
    nightComplete() {
        return this.alive().filter(p => ['mafia', 'doctor', 'detective'].includes(p.role)).every(p => this.night.done[p.id]);
    }
    actVote(me, target) {
        if (this.phase !== 'VOTING') return err('ليست مرحلة التصويت.');
        if (!me.alive) return err('اللاعب الذي خرج من الجولة لا يستطيع التصويت.');
        if (me.id in this.votes) return err('صوّتّ بالفعل ولا يمكن تغيير الصوت.');
        let t = null;
        if (target !== null && target !== undefined) {
            t = this.p(target);
            if (!t || !t.alive || !this.candidates.includes(t.id)) return err('هدف غير صالح للتصويت.');
            if (t.id === me.id && !this.config.selfVote) return err('لا يمكنك التصويت لنفسك.');
        }
        this.votes[me.id] = t ? t.id : null;
        if (this.alive().every(p => p.id in this.votes)) this.resolveVote();
        return ok();
    }
    actChat(me, channel, text) {
        const msg = clean(text).slice(0, LIMITS.chat);
        if (!msg) return err('الرسالة فارغة.');
        const now = this.clock();
        if (now - me.lastChat < 700) return err('تمهّل قليلاً قبل إرسال رسالة أخرى.');
        let ch = channel;
        if (this.phase === 'LOBBY') ch = 'lobby';
        else if (this.phase === 'GAME_OVER') ch = 'day';
        else if (ch === 'day') { if (!me.alive) return err('الأموات لا يكتبون في دردشة الأحياء.'); if (!['DAY', 'VOTING'].includes(this.phase)) return err('الدردشة العامة مفتوحة في النهار فقط.'); }
        else if (ch === 'mafia') { if (me.role !== 'mafia' || !me.alive) return err('هذه الدردشة للمافيا الأحياء فقط.'); if (this.phase !== 'NIGHT') return err('دردشة المافيا مفتوحة في الليل فقط.'); }
        else if (ch === 'dead') { if (me.alive) return err('هذه الدردشة للأموات فقط.'); }
        else return err('قناة غير معروفة.');
        me.lastChat = now;
        const list = this.chat[ch]; list.push({ id: this.seq + '-' + now + '-' + list.length, from: me.id, name: me.name, text: msg, t: now });
        if (list.length > 100) list.shift();
        return ok();
    }
    actSkip(me) {
        if (me.id !== this.hostId) return err('للمضيف فقط.');
        if (this.phase !== 'DAY') return err('يمكن تخطي النقاش في النهار فقط.');
        this.startVoting(); return ok();
    }

    // ---------- تقدّم المراحل ----------
    tick() {
        if (this.endsAt && this.clock() >= this.endsAt) { this.advance(); return true; }
        return false;
    }
    advance() {
        switch (this.phase) {
            case 'ROLE_REVEAL': return this.startNight();
            case 'NIGHT': return this.resolveNight();
            case 'NIGHT_RESULT': return this.winner ? this.gameOver() : this.startDay();
            case 'DAY': return this.startVoting();
            case 'VOTING': return this.resolveVote();
            case 'VOTE_RESULT': return this.winner ? this.gameOver() : this.startNight();
        }
    }
    startNight() {
        this.round++; this.lastVotes = null; this.lastNight = null;
        this.night = { mafiaVotes: {}, doctor: null, detective: null, done: {} };
        this.log('phase', `الليلة ${this.round}: يغفو الجميع… والمافيا تستيقظ.`);
        this.setPhase('NIGHT', this.config.times.night);
    }
    resolveNight() {
        if (this.phase !== 'NIGHT') return;
        const tally = {};
        for (const m of this.aliveOf('mafia')) { const v = this.night.mafiaVotes[m.id]; if (v) tally[v] = (tally[v] || 0) + 1; }
        const max = Math.max(0, ...Object.values(tally));
        let killId = null;
        if (max > 0) { const tops = Object.keys(tally).filter(k => tally[k] === max); killId = tops.length === 1 ? tops[0] : tops[Math.floor(this.rng() * tops.length)]; }
        const doc = this.aliveOf('doctor')[0];
        const saved = !!(killId && this.night.doctor && this.night.doctor === killId);
        if (saved && doc) doc.stats.saves++;
        const det = this.aliveOf('detective')[0];
        if (det && this.night.detective) {
            const t = this.p(this.night.detective);
            if (t) {
                const isMafia = t.role === 'mafia';
                det.inbox.push({ round: this.round, target: t.id, name: t.name, isMafia });
                if (isMafia) det.stats.found++;
            }
        }
        let victim = null;
        if (killId && !saved) victim = this.p(killId);
        this.lastNight = { victimId: victim ? victim.id : null, saved };
        if (victim) { this.kill(victim, 'night'); this.log('death', `قُتل ${victim.name} هذه الليلة.${this.config.revealOnDeath ? ` كان ${ROLE_INFO[victim.role].name}.` : ''}`); }
        else if (saved) this.log('save', 'حاولت المافيا اغتيال أحدهم، لكن الطبيب أنقذه! لم يمت أحد.');
        else this.log('info', 'ليلة هادئة، لم يمت أحد.');
        this.checkWin();
        this.setPhase('NIGHT_RESULT', this.config.times.result);
    }
    startDay() {
        this.log('phase', `النهار ${this.round}: النقاش مفتوح. من تظنون أنه المافيا؟`);
        this.setPhase('DAY', this.config.times.day);
    }
    startVoting() {
        this.votes = {}; this.candidates = this.alive().map(p => p.id); this.revoted = false;
        this.log('phase', 'بدأ التصويت.');
        this.setPhase('VOTING', this.config.times.vote);
    }
    resolveVote() {
        if (this.phase !== 'VOTING') return;
        const tally = {}, detail = {};
        for (const v of this.alive()) {
            const tid = this.votes[v.id] ?? null;
            detail[v.name] = tid ? (this.p(tid) ? this.p(tid).name : null) : null;
            if (tid && this.p(tid)) {
                tally[tid] = (tally[tid] || 0) + 1;
                v.stats.votesCast++; this.p(tid).stats.votesReceived++;
                if (this.p(tid).role === 'mafia' && v.role !== 'mafia') v.stats.correctVotes++;
            }
        }
        this.lastVotes = detail;
        const ids = Object.keys(tally), max = Math.max(0, ...Object.values(tally));
        let out = null;
        if (!ids.length) this.log('info', 'امتنع الجميع عن التصويت، لم يخرج أحد.');
        else {
            const tops = ids.filter(k => tally[k] === max);
            if (tops.length === 1) out = this.p(tops[0]);
            else if (this.config.tieRule === 'revote' && !this.revoted) {
                this.revoted = true; this.candidates = tops; this.votes = {};
                this.log('info', `تعادل بين ${tops.map(k => (this.p(k) ? this.p(k).name : k)).join(' و')}. جولة تصويت إضافية بينهم فقط.`);
                this.setPhase('VOTING', this.config.times.vote); return;
            } else this.log('info', 'تعادل في التصويت، لم يخرج أحد.');
        }
        if (out) {
            this.kill(out, 'vote');
            this.log('death', `صوّت اللاعبون لإخراج ${out.name}.${this.config.revealOnDeath ? ` كان ${ROLE_INFO[out.role].name}.` : ''}`);
            if (out.role === 'jester' && this.config.jesterWins) this.winner = 'jester';
        }
        this.lastVoteOut = out ? out.id : null;
        this.checkWin();
        this.setPhase('VOTE_RESULT', this.config.times.result);
    }
    kill(p, cause) { p.alive = false; p.diedAt = this.round; p.cause = cause; }
    checkWin() {
        if (this.winner) return;
        const m = this.aliveOf('mafia').length, others = this.alive().length - m;
        if (m === 0) this.winner = 'citizens';
        else if (m >= others) this.winner = 'mafia';
    }
    gameOver() {
        const names = { citizens: 'فاز المواطنون! تم القضاء على المافيا.', mafia: 'فازت المافيا! سيطروا على المدينة.', jester: 'فاز المهرّج! نجح في خداعكم جميعاً.' };
        this.log('end', names[this.winner]);
        this.setPhase('GAME_OVER', null); this.note('gameover ' + this.winner);
    }

    // ---------- العرض المفلتر لكل لاعب (لا يخرج أي سر لغير صاحبه) ----------
    viewFor(token) {
        const me = this.byToken(token);
        if (!me) return null;
        const over = this.phase === 'GAME_OVER', inGame = this.phase !== 'LOBBY';
        const isMafia = me.role === 'mafia';
        const canSee = p => over || p.id === me.id || (isMafia && p.role === 'mafia') || (!p.alive && this.config.revealOnDeath && inGame);
        const players = [...this.players.values()].map(p => ({
            id: p.id, name: p.name, alive: p.alive, connected: p.connected, host: p.id === this.hostId,
            role: inGame && canSee(p) ? p.role : null,
            diedAt: p.diedAt, cause: p.cause,
            voted: this.phase === 'VOTING' ? p.id in this.votes : undefined
        }));
        const v = { code: this.code, phase: this.phase, round: this.round, endsAt: this.endsAt, serverNow: this.clock(), hostId: this.hostId,
            config: this.config, players, log: this.events.slice(-80), winner: this.winner, candidates: this.phase === 'VOTING' ? this.candidates : [],
            revote: this.revoted && this.phase === 'VOTING', lastVotes: ['VOTE_RESULT', 'GAME_OVER'].includes(this.phase) ? this.lastVotes : null,
            lastNight: ['NIGHT_RESULT', 'DAY'].includes(this.phase) ? { saved: !!(this.lastNight && this.lastNight.saved) } : null };
        if (this.phase === 'LOBBY') { const c = validateConfig(this.players.size, this.config, this.minPhase); v.configCheck = c.ok ? { ok: true, counts: c.counts } : { ok: false, error: c.error }; }
        const m = { id: me.id, name: me.name, alive: me.alive, isHost: me.id === this.hostId, role: inGame ? me.role : null, inbox: inGame ? me.inbox : [] };
        if (inGame && me.role) {
            m.roleInfo = ROLE_INFO[me.role];
            if (isMafia) { m.teammates = [...this.players.values()].filter(p => p.role === 'mafia' && p.id !== me.id).map(p => ({ id: p.id, name: p.name, alive: p.alive })); }
        }
        if (this.phase === 'NIGHT' && me.alive && ['mafia', 'doctor', 'detective'].includes(me.role)) {
            const kind = { mafia: 'kill', doctor: 'protect', detective: 'check' }[me.role];
            m.night = { kind, done: !!this.night.done[me.id], targets: this.alive().filter(p => !(me.role === 'mafia' && p.role === 'mafia') && !(me.role === 'detective' && p.id === me.id)).map(p => p.id) };
            if (isMafia) {
                m.night.mafiaVotes = {};
                for (const [k, t] of Object.entries(this.night.mafiaVotes)) {
                    const fromP = this.p(k), toP = this.p(t);
                    if (fromP && toP) m.night.mafiaVotes[fromP.name] = toP.name;
                }
            }
        }
        if (this.phase === 'VOTING') m.vote = { can: me.alive && !(me.id in this.votes), done: me.id in this.votes, mine: this.votes[me.id] ?? null, count: Object.keys(this.votes).length, total: this.alive().length };
        v.me = m;
        const chat = { lobby: this.chat.lobby, day: this.chat.day };
        if (over || isMafia) chat.mafia = this.chat.mafia;
        if (over || !me.alive) chat.dead = this.chat.dead;
        v.chat = chat;
        if (over) {
            v.stats = [...this.players.values()].map(p => ({ id: p.id, name: p.name, role: p.role, alive: p.alive, diedAt: p.diedAt, cause: p.cause, ...(p.stats || {}) }));
        }
        return v;
    }
    isIdle(ttl, maxAge) {
        const now = this.clock(), anyConn = [...this.players.values()].some(p => p.connected);
        return (!anyConn && now - this.lastActive > ttl) || now - this.lastActive > maxAge;
    }
}
