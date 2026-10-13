// أدوات مشتركة لصفحات الألعاب (العبها صح / المافيا / إنسان حيوان نبات / سباق الأسئلة / المتصدرين)
import { db, auth, ref, get, set, push, signInAnonymously, onAuthStateChanged } from './firebase-init.js';

export const $ = id => document.getElementById(id);
export const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const norm = s => String(s || '').trim().replace(/[\u064B-\u065F\u0670\u0640]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/\s+/g, ' ').toLowerCase();
export const GAMES = { board: 'العبها صح', htns: 'إنسان حيوان نبات', race: 'سباق الأسئلة', mafia: 'مافيا' };

export function ensureAnon() {
    return new Promise((res, rej) => {
        if (auth.currentUser) return res(auth.currentUser);
        const un = onAuthStateChanged(auth, u => { if (u) { un(); res(u); } });
        signInAnonymously(auth).catch(rej);
    });
}

// فتح الطاولة والتحقق منها (الكلمة، نوع اللعبة، كلمة المرة الواحدة المستهلكة)
export async function openTable(code, gameType) {
    const tok = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!tok) return { error: 'لا توجد كلمة سر. ارجع للصفحة الرئيسية وأدخلها.' };
    const user = await ensureAnon();
    const tRef = ref(db, 'tables/' + tok);
    const s = await get(tRef);
    if (!s.exists()) return { error: 'الكلمة غير صحيحة أو الطاولة مغلقة.' };
    const data = s.val();
    if ((data.gameType || 'board') !== gameType) return { error: 'هذه الطاولة للعبة أخرى. ارجع للصفحة الرئيسية.' };
    if (data.mode === 'single' && data.state === 'finished') return { error: 'انتهت لعبة هذه الكلمة وهي تُستخدم مرة واحدة. اطلب كلمة جديدة من الكافيه.' };
    return { tok, tRef, data, uid: user.uid };
}

const CH = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const rndCode = () => Array.from({ length: 6 }, () => CH[Math.floor(Math.random() * CH.length)]).join('');

// تسجيل النتيجة في لوحة المتصدرين، وإنشاء كود جائزة للفائز إن كان الكافيه يمنح جائزة لكل فائز
export async function recordResult({ cafeId, game, name, score, win }) {
    if (!cafeId) return null;
    const now = Date.now(), nm = String(name || 'لاعب').slice(0, 30);
    try { await set(push(ref(db, 'leaderboard/' + cafeId)), { name: nm, score: Math.max(0, Math.min(100000, Math.round(score) || 0)), game, ts: now }); } catch (e) {}
    if (!win) return null;
    try {
        const p = await get(ref(db, 'cafePublic/' + cafeId + '/prize'));
        const pr = p.exists() ? p.val() : null;
        if (!pr || !pr.active) return null;
        if (pr.mode !== 'every') return { weekly: pr.title };
        const code = rndCode();
        await set(push(ref(db, 'prizeClaims/' + cafeId)), { code, name: nm, game, title: pr.title, ts: now, claimed: false });
        return { code, title: pr.title };
    } catch (e) { return null; }
}

export function prizeHtml(r, cafeId) {
    let h = '';
    if (r && r.code) h += `<div class="prz">🎁 جائزتك: ${esc(r.title)}<br>الكود: <span dir="ltr" style="font-size:26px;letter-spacing:3px">${esc(r.code)}</span><br><small>أرِ هذه الشاشة للكاشير</small></div>`;
    else if (r && r.weekly) h += `<div class="prz">🎁 جائزة المتصدر الأسبوعي: ${esc(r.weekly)}</div>`;
    if (cafeId) h += `<a class="btn" style="text-align:center;text-decoration:none;display:inline-block;margin-top:8px" href="/leaderboard.html?cafe=${encodeURIComponent(cafeId)}">🏅 لوحة المتصدرين</a>`;
    return h;
}
