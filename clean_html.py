import re
import os

def final_cleanup():
    print("جاري التنظيف النهائي لواجهة تسجيل الدخول...")
    index_path = 'public/index.html'
    
    if os.path.exists(index_path):
        with open(index_path, 'r', encoding='utf-8') as f:
            html = f.read()
            
        # 1. إزالة المربع الذي يحتوي على كلمة "الادمن الافتراضي" والإيميل تماماً
        html = re.sub(r'<div[^>]*?inline-block[^>]*?bg-slate-800[^>]*?>.*?alardazain55@gmail\.com.*?</div>', '', html, flags=re.DOTALL | re.IGNORECASE)
        
        # 2. التأكد من مسح القيمة الافتراضية من خانة الإيميل
        html = re.sub(r'value\s*=\s*["\']alardazain55@gmail\.com["\']', '', html, flags=re.IGNORECASE)
        
        # 3. التأكد من مسح القيمة الافتراضية من خانة الباسوورد
        html = re.sub(r'value\s*=\s*["\']Zain@135["\']', '', html, flags=re.IGNORECASE)
        
        with open(index_path, 'w', encoding='utf-8') as f:
            f.write(html)
        print("✅ تم مسح الإيميل الافتراضي والمربع العلوي من واجهة الدخول بنجاح!")
        print("💡 لا تنسَ إعادة رفع مجلد المشروع إلى Netlify ليتم تحديث الموقع الفعلي.")
    else:
        print(f"❌ لم يتم العثور على ملف {index_path}")

if __name__ == '__main__':
    final_cleanup()