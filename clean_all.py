import re
import os

def final_cleanup():
    print("جاري التنظيف الشامل لجميع ملفات الواجهة...")
    paths = ['index.html', 'public/index.html']
    
    for path in paths:
        if os.path.exists(path):
            with open(path, 'r', encoding='utf-8') as f:
                html = f.read()
                
            # إزالة مربع الأدمن الافتراضي
            html = re.sub(r'<div[^>]*?inline-block[^>]*?bg-slate-800[^>]*?>.*?alardazain55@gmail\.com.*?</div>', '', html, flags=re.DOTALL | re.IGNORECASE)
            
            # مسح الإيميل الافتراضي
            html = html.replace('value="alardazain55@gmail.com"', '')
            
            # مسح الباسوورد الافتراضي
            html = html.replace('value="Zain@135"', '')
            
            with open(path, 'w', encoding='utf-8') as f:
                f.write(html)
            print(f"✅ تم تنظيف الملف: {path}")
        else:
            print(f"⚠️ لم يتم العثور على الملف: {path}")

if __name__ == '__main__':
    final_cleanup()