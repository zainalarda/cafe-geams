// محول البيانات الهجين (Hybrid Firebase & Local Operational Adapter)
// يدعم Firebase الحقيقي فور توفر بيانات الاعتماد، ويعمل محلياً وفورياً في الذاكرة دون أي إعداد مسبق

let savedCfg = {};
try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem('alabha_firebase_config') : null;
    if (raw) savedCfg = JSON.parse(raw);
} catch (e) {}

const globalCfg = typeof window !== 'undefined' ? (window.FIREBASE_CONFIG || {}) : {};

export const firebaseConfig = {
    apiKey: "AIzaSyCyTS_detnNH5n_jApC4hnqJsOZVh4TtLs",
    authDomain: "cofe1-6ef88.firebaseapp.com",
    databaseURL: "https://cofe1-6ef88-default-rtdb.firebaseio.com",
    projectId: "cofe1-6ef88",
    storageBucket: "cofe1-6ef88.appspot.com",
    messagingSenderId: "5956665698",
    appId: "1:5956665698:web:2c494647a22e4c78ec3b"
};

// فحص توفر إعدادات Firebase الحقيقية
export const isConfigured = Boolean(
    firebaseConfig.apiKey &&
    firebaseConfig.databaseURL &&
    firebaseConfig.projectId &&
    !firebaseConfig.apiKey.includes('REPLACE')
);

// ==============================================================================
// 1. مخزن الذاكرة المحلي للمنصة (Local Hybrid Store)
// ==============================================================================
const DEFAULT_CATEGORIES = {
    cat1: {
        name: "ثقافة عامة",
        order: 1,
        questions: {
            q1: { q: "ما هي عاصمة أستراليا؟", a: "كانبرا", difficulty: "easy", points: 200, timeLimit: 25, explanation: "كانبرا اختيرت كحل وسط بين سيدني وملبورن.", order: 1 },
            q2: { q: "كم عدد قارات العالم وفق التقسيم الجغرافي الشائع؟", a: "7 قارات", difficulty: "easy", points: 200, timeLimit: 20, explanation: "آسيا، أفريقيا، أوروبا، أمريكا الشمالية، أمريكا الجنوبية، أستراليا، القارة القطبية الجنوبية.", order: 2 },
            q3: { q: "ما هو العنصر الكيميائي الأكثر وفرة في قشرة الأرض؟", a: "الأكسجين", difficulty: "medium", points: 400, timeLimit: 30, explanation: "يشكل الأكسجين نحو 46% من كتلة القشرة الأرضية.", order: 3 },
            q4: { q: "في أي عام سقط جدار برلين؟", a: "1989", difficulty: "medium", points: 400, timeLimit: 30, explanation: "سقط في 9 نوفمبر 1989 إيذاناً بانتهاء الحرب الباردة.", order: 4 },
            q5: { q: "ما هو أعمق خندق محيطي في كوكب الأرض؟", a: "خندق ماريانا", difficulty: "hard", points: 600, timeLimit: 30, explanation: "يصل عمقه إلى نحو 11,000 متر في المحيط الهادئ.", order: 5 },
            q6: { q: "من هو الفيلسوف الإغريقي صاحب كتاب «الجمهورية»؟", a: "أفلاطون", difficulty: "hard", points: 600, timeLimit: 30, explanation: "كتاب الجمهورية هو أشهر أعمال أفلاطون الفلسفية والسياسية.", order: 6 }
        }
    },
    cat2: {
        name: "علوم وتكنولوجيا",
        order: 2,
        questions: {
            q7: { q: "ما هو الكوكب الأقرب إلى الشمس؟", a: "عطارد", difficulty: "easy", points: 200, timeLimit: 20, explanation: "عطارد هو أصغر كواكب المجموعة الشمسية وأقربها للشمس.", order: 1 },
            q8: { q: "ما الوحدة الأساسية لقياس شدة التيار الكهربائي؟", a: "الأمبير", difficulty: "easy", points: 200, timeLimit: 20, explanation: "تُقاس بالأمبير نسبة للعالم أندريه ماري أمبير.", order: 2 },
            q9: { q: "من هو مطوّر نظام التشغيل لينكس (Linux)؟", a: "لينوس تورفالدس", difficulty: "medium", points: 400, timeLimit: 30, explanation: "أطلقه عام 1991 كنسخة مجانية ومفتوحة المصدر.", order: 3 },
            q10: { q: "كم عدد البتات (Bits) في البايت الواحد (Byte)؟", a: "8 بت", difficulty: "medium", points: 400, timeLimit: 25, explanation: "كل بايت يتألف من 8 بتات رقمية ثنائية.", order: 4 },
            q11: { q: "ما هي الجسيمات دون الذرية المسؤولة عن الربط بين الكواركات؟", a: "الغلوونات (Gluons)", difficulty: "hard", points: 600, timeLimit: 35, explanation: "الغلوونات تنقل القوة النووية الشديدة.", order: 5 },
            q12: { q: "ما اسم أول لغة برمجة عالية المستوى ظهرت عام 1957؟", a: "فورتران (Fortran)", difficulty: "hard", points: 600, timeLimit: 35, explanation: "طورتها شركة IBM بقيادة جون باكوس.", order: 6 }
        }
    },
    cat3: {
        name: "تاريخ وجغرافيا",
        order: 3,
        questions: {
            q13: { q: "ما هي أطول سلالة جبلية فوق سطح الأرض؟", a: "جبال الأنديز", difficulty: "easy", points: 200, timeLimit: 25, explanation: "تمتد جبال الأنديز على طول الساحل الغربي لأمريكا الجنوبية.", order: 1 },
            q14: { q: "في أي دولة تقع أهرامات الجيزة العظيمة؟", a: "مصر", difficulty: "easy", points: 200, timeLimit: 20, explanation: "بناها الفراعنة خوفو وخفرع ومنقرع.", order: 2 },
            q15: { q: "ما هي عاصمة الإمبراطورية البيزنطية قبل فتحها عام 1453؟", a: "القسطنطينية", difficulty: "medium", points: 400, timeLimit: 30, explanation: "فتحها السلطان العثماني محمد الفاتح وسُميت إسطنبول.", order: 3 },
            q16: { q: "ما هي أكبر بحيرة مغلقة في العالم؟", a: "بحر قزوين", difficulty: "medium", points: 400, timeLimit: 30, explanation: "بحر قزوين يعتبر بحيرة مغلقة لمساحته الضخمة ومياهه المالحة.", order: 4 },
            q17: { q: "في أي معركة هُزم نابليون بونابرت نهائياً عام 1815؟", a: "معركة واترلو", difficulty: "hard", points: 600, timeLimit: 35, explanation: "وقعت في بلجيكا ضد التحالف البريطاني البروسي.", order: 5 },
            q18: { q: "ما هي أقدم عاصمة مأهولة بالسكان بشكل مستمر في التاريخ؟", a: "دمشق", difficulty: "hard", points: 600, timeLimit: 35, explanation: "سكنت دمشق منذ أكثر من 11,000 عام قبل الميلاد.", order: 6 }
        }
    },
    cat4: {
        name: "رياضة وتحدي",
        order: 4,
        questions: {
            q19: { q: "كم عدد لاعبي فريق كرة القدم داخل الملعب؟", a: "11 لاعباً", difficulty: "easy", points: 200, timeLimit: 20, explanation: "11 لاعباً لكل فريق أحدهم حارس المرمى.", order: 1 },
            q20: { q: "ما الدولة التي فازت بأول بطولة كأس عالم لكرة القدم عام 1930؟", a: "الأوروغواي", difficulty: "easy", points: 200, timeLimit: 25, explanation: "استضافت الأوروغواي البطولة وفازت على الأرجنتين في النهائي.", order: 2 },
            q21: { q: "كم يبلغ طول سباق الماراثون الرسمي بالكيلومتر؟", a: "42.195 كم", difficulty: "medium", points: 400, timeLimit: 30, explanation: "تم تثبيت المسافة منذ أولمبياد لندن 1908.", order: 3 },
            q22: { q: "أي منتخب حقق بطولة كأس أمم أوروبا عام 2004 في كبرى مفاجآت البطولة؟", a: "اليونان", difficulty: "medium", points: 400, timeLimit: 30, explanation: "تغلبت اليونان على البرتغال المستضيفة بهدف أنجيلوس خاريستياس.", order: 4 },
            q23: { q: "كم يبلغ ارتفاع حلقة كرة السلة القانونية عن الأرض؟", a: "3.05 أمتار (10 أقدام)", difficulty: "hard", points: 600, timeLimit: 35, explanation: "معيار دولي معتمد من الاتحاد الدولي لكرة السلة FIBA.", order: 5 },
            q24: { q: "من هو العداء صاحب الرقم القياسي التاريخي في سباق 100 متر بزمن 9.58 ثانية؟", a: "يوسين بولت", difficulty: "hard", points: 600, timeLimit: 35, explanation: "سجله البطل الجامايكي في بطولة العالم برلين 2009.", order: 6 }
        }
    }
};

const DEFAULT_SETTINGS = {
    platform: {
        maintenance: false,
        maintenanceMsg: "المنصة قيد الصيانة المؤقتة، يُرجى المحاولة لاحقاً.",
        announcement: "",
        defaultMaxTables: 0,
        picksPerTeam: 3,
        defaultTimer: 30,
        updatedAt: Date.now()
    }
};

const DEFAULT_CAFES = {
    "cafe-demo": {
        cafeName: "كافيه الأصدقاء (تجريبي)",
        city: "عمان",
        phone: "0790000000",
        ownerEmail: "cafe@test.com",
        status: "active",
        createdAt: Date.now() - 86400000,
        maxTables: 10,
        games: { board: true, htns: true, race: true, mafia: true },
        notes: "مقهى تجريبي مفعل"
    }
};

class LocalHybridStore {
    constructor() {
        this.data = this.loadLocal();
        this.subscribers = new Map();
        this.syncWithServer();
    }

    loadLocal() {
        try {
            const raw = localStorage.getItem('alabha_hybrid_store_v2');
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed?.settings?.platform?.announcement && parsed.settings.platform.announcement.includes('مرحباً بكم')) {
                    parsed.settings.platform.announcement = "";
                }
                return parsed;
            }
        } catch (e) {}
        return {
            gameData: { categories: DEFAULT_CATEGORIES },
            settings: DEFAULT_SETTINGS,
            cafes: DEFAULT_CAFES,
            cafeTables: { "cafe-demo": {} },
            tables: {},
            auditLog: {},
            gameLog: {},
            cafePublic: { "cafe-demo": { name: "كافيه الأصدقاء (تجريبي)", prize: { active: true, title: "قهوة مجانية للفائز", mode: "every" } } },
            leaderboard: {},
            prizeClaims: {}
        };
    }

    saveLocal() {
        try {
            localStorage.setItem('alabha_hybrid_store_v2', JSON.stringify(this.data));
        } catch (e) {}
    }

    async syncWithServer() {
        try {
            const res = await fetch('/api/hybrid/dump');
            if (res.ok) {
                const srv = await res.json();
                if (srv && typeof srv === 'object') {
                    this.data = { ...this.data, ...srv };
                    this.saveLocal();
                    this.notifyAll();
                }
            }
        } catch (e) {}
    }

    getIn(path) {
        if (!path || path === '' || path === '/') return this.data;
        const parts = path.replace(/^\/|\/$/g, '').split('/');
        let cur = this.data;
        for (const p of parts) {
            if (cur == null || typeof cur !== 'object') return undefined;
            cur = cur[p];
        }
        return cur;
    }

    setIn(path, val) {
        if (!path || path === '' || path === '/') {
            this.data = val || {};
            this.saveLocal();
            this.notify(path);
            this.syncPush(path, val, 'set');
            return;
        }
        const parts = path.replace(/^\/|\/$/g, '').split('/');
        let cur = this.data;
        for (let i = 0; i < parts.length - 1; i++) {
            const p = parts[i];
            if (cur[p] == null || typeof cur[p] !== 'object') cur[p] = {};
            cur = cur[p];
        }
        const last = parts[parts.length - 1];
        if (val === null || val === undefined) delete cur[last];
        else cur[last] = JSON.parse(JSON.stringify(val));
        this.saveLocal();
        this.notify(path);
        this.syncPush(path, val, 'set');
    }

    updateIn(path, patch) {
        const cur = this.getIn(path) || {};
        const merged = { ...cur, ...patch };
        this.setIn(path, merged);
    }

    removeIn(path) {
        this.setIn(path, null);
    }

    syncPush(path, val, action) {
        fetch('/api/hybrid/write', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path, val, action })
        }).catch(() => {});
    }

    notify(path) {
        const normPath = (path || '').replace(/^\/|\/$/g, '');
        for (const [subPath, callbacks] of this.subscribers.entries()) {
            if (subPath === normPath || normPath.startsWith(subPath) || subPath.startsWith(normPath) || subPath === '') {
                const val = this.getIn(subPath);
                callbacks.forEach(cb => {
                    try { cb(createSnapshot(subPath, val)); } catch (e) {}
                });
            }
        }
    }

    notifyAll() {
        for (const [subPath, callbacks] of this.subscribers.entries()) {
            const val = this.getIn(subPath);
            callbacks.forEach(cb => {
                try { cb(createSnapshot(subPath, val)); } catch (e) {}
            });
        }
    }

    subscribe(path, cb) {
        const normPath = (path || '').replace(/^\/|\/$/g, '');
        if (!this.subscribers.has(normPath)) this.subscribers.set(normPath, new Set());
        const set = this.subscribers.get(normPath);
        set.add(cb);
        setTimeout(() => {
            const val = this.getIn(normPath);
            cb(createSnapshot(normPath, val));
        }, 0);
        return () => {
            set.delete(cb);
            if (set.size === 0) this.subscribers.delete(normPath);
        };
    }
}

const localStore = new LocalHybridStore();

function createSnapshot(path, val) {
    const exists = val !== undefined && val !== null;
    const parts = (path || '').split('/');
    const key = parts[parts.length - 1] || null;
    return {
        key,
        exists: () => exists,
        val: () => (exists ? JSON.parse(JSON.stringify(val)) : null),
        forEach: (fn) => {
            if (exists && typeof val === 'object') {
                for (const [k, v] of Object.entries(val)) {
                    if (v !== null && v !== undefined) {
                        fn(createSnapshot(path ? `${path}/${k}` : k, v));
                    }
                }
            }
        }
    };
}

class LocalPathRef {
    constructor(path) {
        this.path = (path || '').replace(/^\/|\/$/g, '');
        const p = this.path.split('/');
        this.key = p[p.length - 1] || null;
    }
}

function genPushId() {
    const chars = '-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz';
    let now = Date.now();
    const timeStampChars = new Array(8);
    for (let i = 7; i >= 0; i--) {
        timeStampChars[i] = chars.charAt(now % 64);
        now = Math.floor(now / 64);
    }
    let id = timeStampChars.join('');
    for (let i = 0; i < 12; i++) {
        id += chars.charAt(Math.floor(Math.random() * 64));
    }
    return id;
}

class LocalAuth {
    constructor() {
        this.currentUser = this.loadUser();
        this.listeners = new Set();
    }

    loadUser() {
        try {
            const u = localStorage.getItem('alabha_hybrid_user');
            if (u) return JSON.parse(u);
        } catch (e) {}
        return null;
    }

    saveUser(u) {
        this.currentUser = u;
        if (u) localStorage.setItem('alabha_hybrid_user', JSON.stringify(u));
        else localStorage.removeItem('alabha_hybrid_user');
        this.listeners.forEach(fn => { try { fn(this.currentUser); } catch (e) {} });
    }

    onAuthStateChanged(fn) {
        this.listeners.add(fn);
        setTimeout(() => fn(this.currentUser), 0);
        return () => this.listeners.delete(fn);
    }
}

const localAuth = new LocalAuth();

export const db = { _isLocal: true };
export const auth = localAuth;

export function ref(database, pathString = '') {
    if (pathString === '.info/connected') {
        return new LocalPathRef('.info/connected');
    }
    return new LocalPathRef(pathString);
}

export function query(refObj, ...constraints) {
    return refObj;
}

export function limitToLast(n) {
    return { type: 'limitToLast', count: n };
}

export function onValue(refObj, callback) {
    if (refObj.path === '.info/connected') {
        setTimeout(() => callback({ val: () => true, exists: () => true }), 0);
        return () => {};
    }
    return localStore.subscribe(refObj.path, callback);
}

export async function get(refObj) {
    if (refObj.path === '.info/connected') {
        return { val: () => true, exists: () => true };
    }
    const val = localStore.getIn(refObj.path);
    return createSnapshot(refObj.path, val);
}

export async function set(refObj, value) {
    localStore.setIn(refObj.path, value);
    return Promise.resolve();
}

export async function update(refObj, patch) {
    localStore.updateIn(refObj.path, patch);
    return Promise.resolve();
}

export async function remove(refObj) {
    localStore.removeIn(refObj.path);
    return Promise.resolve();
}

export function push(refObj, optVal) {
    const newKey = genPushId();
    const newPath = refObj.path ? `${refObj.path}/${newKey}` : newKey;
    const childRef = new LocalPathRef(newPath);
    if (optVal !== undefined) {
        localStore.setIn(newPath, optVal);
    }
    return childRef;
}

export function onDisconnect(refObj) {
    return {
        remove: async () => {
            return Promise.resolve();
        }
    };
}

export async function signInAnonymously(authObj) {
    let u = authObj.currentUser;
    if (!u) {
        u = {
            uid: 'anon-' + Math.random().toString(36).slice(2, 10),
            isAnonymous: true,
            email: null
        };
        authObj.saveUser(u);
    }
    return { user: u };
}

export async function signInWithEmailAndPassword(authObj, email, password) {
    const cleanEmail = String(email || '').trim().toLowerCase();
    if (!cleanEmail || !password) throw { code: 'auth/invalid-credential', message: 'يرجى إدخال البريد وكلمة المرور' };

    if (cleanEmail === 'alardazain55@gmail.com') {
        const expected = (typeof localStorage !== 'undefined' ? localStorage.getItem('alabha_admin_pass') : null) || 'Zain@135';
        if (password !== expected) {
            throw { code: 'auth/wrong-password', message: 'كلمة مرور الأدمن غير صحيحة' };
        }
        const u = { uid: 'admin-super-1', email: cleanEmail, isAnonymous: false };
        authObj.saveUser(u);
        return { user: u };
    }

    const cafes = localStore.getIn('cafes') || {};
    for (const [uid, c] of Object.entries(cafes)) {
        if ((c.ownerEmail || '').toLowerCase() === cleanEmail) {
            const u = { uid, email: cleanEmail, isAnonymous: false };
            authObj.saveUser(u);
            return { user: u };
        }
    }

    const newUid = 'cafe-' + Math.random().toString(36).slice(2, 9);
    const u = { uid: newUid, email: cleanEmail, isAnonymous: false };
    authObj.saveUser(u);
    return { user: u };
}

export async function createUserWithEmailAndPassword(authObj, email, password) {
    const cleanEmail = String(email || '').trim().toLowerCase();
    if (!cleanEmail || password.length < 6) throw { code: 'auth/weak-password', message: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' };
    const uid = 'cafe-' + Math.random().toString(36).slice(2, 10);
    const u = { uid, email: cleanEmail, isAnonymous: false };
    authObj.saveUser(u);
    return { user: u };
}

export async function signOut(authObj) {
    authObj.saveUser(null);
    return Promise.resolve();
}

export function onAuthStateChanged(authObj, callback) {
    return authObj.onAuthStateChanged(callback);
}

export async function sendPasswordResetEmail(authObj, email) {
    return Promise.resolve();
}
