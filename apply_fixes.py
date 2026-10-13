import re
import os

def patch_files():
    print("جاري تطبيق التعديلات على منصة العبها صح...")
    
    index_path = 'public/index.html'
    firebase_path = 'public/firebase-init.js'
    
    # 1. تعديل ملف index.html
    if os.path.exists(index_path):
        with open(index_path, 'r', encoding='utf-8') as f:
            html = f.read()
            
        # إزالة إشعار الأدمن
        html = re.sub(r'<div class="mt-2 inline-block bg-slate-800/80 border border-slate-700 text-slate-300 text-xs px-3 py-1 rounded-full font-bold">.*?alardazain55@gmail\.com.*?</div>', '', html, flags=re.DOTALL)
        
        # إزالة الإيميل والباسوورد الافتراضي
        html = html.replace('value="alardazain55@gmail.com"', 'placeholder="البريد الإلكتروني"')
        html = html.replace('value="Zain@135"', 'placeholder="كلمة المرور"')
        
        with open(index_path, 'w', encoding='utf-8') as f:
            f.write(html)
        print("✅ تم تعديل index.html بنجاح (إزالة الإشعار والبيانات الافتراضية).")
    else:
        print(f"❌ لم يتم العثور على {index_path}")

    # 2. تعديل ملف firebase-init.js
    if os.path.exists(firebase_path):
        with open(firebase_path, 'r', encoding='utf-8') as f:
            js = f.read()
            
        old_func = r"export async function signInWithEmailAndPassword.*?return \\{ user: u \\};\n\}"
        new_func = '''export async function signInWithEmailAndPassword(authObj, email, password) {
    const cleanEmail = String(email || '').trim().toLowerCase();
    if (!cleanEmail || !password) throw { code: 'auth/invalid-credential', message: 'يرجى إدخال البريد الإلكتروني وكلمة المرور' };
    
    if (cleanEmail === 'alardazain55@gmail.com') {
        const expected = 'Zain@135';
        if (password !== expected) {
            throw { code: 'auth/wrong-password', message: 'كلمة المرور غير صحيحة' };
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
    throw { code: 'auth/user-not-found', message: 'الحساب غير موجود أو بيانات الدخول خاطئة' };
}'''
        js = re.sub(old_func, new_func, js, flags=re.DOTALL)
        
        with open(firebase_path, 'w', encoding='utf-8') as f:
            f.write(js)
        print("✅ تم تعديل firebase-init.js بنجاح (تثبيت كلمة سر الأدمن وإصلاح الأخطاء).")
    else:
        print(f"❌ لم يتم العثور على {firebase_path}")

if __name__ == '__main__':
    patch_files()