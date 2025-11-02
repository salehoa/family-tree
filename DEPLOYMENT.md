# دليل النشر والتطوير 🚀

## متطلبات النشر

### 1. حساب Cloudflare
- تأكد من أن لديك حساب على Cloudflare
- احصل على API Token من [هنا](https://dash.cloudflare.com/profile/api-tokens)
- الصلاحيات المطلوبة:
  - Account.Cloudflare Pages: Edit
  - Account.D1: Edit
  - User.User Details: Read

### 2. تثبيت Wrangler CLI
```bash
npm install -g wrangler
wrangler login
```

## خطوات النشر على Cloudflare Pages

### 1. إنشاء قاعدة بيانات D1 في الإنتاج
```bash
# إنشاء قاعدة بيانات
npx wrangler d1 create family-tree-db

# نسخ database_id الذي يظهر في النتيجة
# مثال: xxxx-xxxx-xxxx-xxxx-xxxx
```

### 2. تحديث ملف wrangler.jsonc
```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "family-tree",
  "compatibility_date": "2025-11-02",
  "pages_build_output_dir": "./dist",
  "compatibility_flags": [
    "nodejs_compat"
  ],
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "family-tree-db",
      "database_id": "ضع-هنا-database_id-من-الخطوة-السابقة"
    }
  ]
}
```

### 3. تطبيق Migrations على قاعدة البيانات
```bash
# تطبيق الـ migrations على قاعدة البيانات الإنتاجية
npm run db:migrate:prod

# إضافة بيانات تجريبية (اختياري)
npx wrangler d1 execute family-tree-db --file=./seed.sql
```

### 4. بناء ونشر المشروع
```bash
# بناء المشروع
npm run build

# إنشاء مشروع Cloudflare Pages
npx wrangler pages project create family-tree \
  --production-branch main \
  --compatibility-date 2025-11-02

# النشر
npm run deploy:prod
```

### 5. ربط قاعدة البيانات بالمشروع
```bash
# ربط D1 بمشروع Pages
npx wrangler pages deployment create \
  --project-name=family-tree \
  dist
```

## التطوير المحلي

### بيئة التطوير
```bash
# تثبيت المكتبات
npm install

# بناء المشروع
npm run build

# تهيئة قاعدة البيانات المحلية
npm run db:migrate:local
npm run db:seed

# تشغيل الخادم المحلي
npm run dev:sandbox

# أو باستخدام PM2
pm2 start ecosystem.config.cjs
```

### إعادة تعيين قاعدة البيانات المحلية
```bash
npm run db:reset
```

### الأوامر المفيدة
```bash
# عرض قائمة العمليات
pm2 list

# عرض السجلات
pm2 logs family-tree --nostream

# إعادة تشغيل
pm2 restart family-tree

# إيقاف
pm2 stop family-tree

# حذف من PM2
pm2 delete family-tree
```

## أمان الإنتاج

### 1. تغيير كلمة مرور الأدمن
```sql
-- تنفيذ هذا الأمر على قاعدة البيانات الإنتاجية
UPDATE users 
SET password = 'كلمة-مرور-قوية-جداً' 
WHERE username = 'admin';
```

**ملاحظة مهمة**: في الإصدار الحالي، يتم تخزين كلمة المرور كنص عادي. في الإنتاج، يجب:
- استخدام bcrypt لتشفير كلمة المرور
- استخدام JWT للجلسات
- استخدام Cloudflare KV لتخزين الجلسات

### 2. استخدام المتغيرات البيئية
أنشئ ملف `.dev.vars` للتطوير المحلي:
```
JWT_SECRET=your-secret-key-here
ADMIN_PASSWORD_HASH=bcrypt-hashed-password
```

**لا تضف هذا الملف إلى git!**

### 3. إضافة Secrets للإنتاج
```bash
# إضافة JWT Secret
npx wrangler pages secret put JWT_SECRET --project-name family-tree

# إضافة أي secrets أخرى حسب الحاجة
```

## التحديثات والصيانة

### تحديث الكود
```bash
# عمل commit للتغييرات
git add .
git commit -m "وصف التغييرات"

# بناء ونشر
npm run deploy:prod
```

### إضافة Migration جديد
```bash
# إنشاء ملف migration جديد
# migrations/0002_add_new_feature.sql

# تطبيقه محلياً للاختبار
npm run db:migrate:local

# إذا كان كل شيء جيد، طبقه على الإنتاج
npm run db:migrate:prod
```

### عمل Backup لقاعدة البيانات
```bash
# تصدير البيانات من الإنتاج
npx wrangler d1 execute family-tree-db \
  --command="SELECT * FROM families" \
  > families_backup.json

npx wrangler d1 execute family-tree-db \
  --command="SELECT * FROM family_members" \
  > members_backup.json
```

## استكشاف الأخطاء

### الخادم لا يعمل
```bash
# التحقق من المنفذ
fuser -k 3000/tcp

# إعادة البناء والتشغيل
npm run build
pm2 restart family-tree
```

### مشاكل قاعدة البيانات
```bash
# إعادة تعيين قاعدة البيانات المحلية
npm run db:reset

# فحص قاعدة البيانات
npx wrangler d1 execute family-tree-db --local \
  --command="SELECT name FROM sqlite_master WHERE type='table'"
```

### مشاكل النشر
```bash
# التحقق من حالة Wrangler
npx wrangler whoami

# عرض سجلات النشر
npx wrangler pages deployment list --project-name family-tree
```

## المراقبة والتحليل

### Cloudflare Analytics
- ادخل إلى [Cloudflare Dashboard](https://dash.cloudflare.com)
- اختر مشروعك
- انتقل إلى Analytics لرؤية:
  - عدد الطلبات
  - معدل الاستجابة
  - الأخطاء

### السجلات
```bash
# عرض سجلات real-time
npx wrangler pages deployment tail --project-name family-tree
```

## التكاليف

### Cloudflare Pages (Free Tier)
- ✅ 500 builds شهرياً
- ✅ Unlimited requests
- ✅ Unlimited bandwidth

### Cloudflare D1 (Free Tier)
- ✅ 5GB storage
- ✅ 5 million reads/day
- ✅ 100,000 writes/day

**ملاحظة**: المشروع الحالي يعمل بشكل كامل على الطبقة المجانية!

## الدعم الفني

### المستندات الرسمية
- [Cloudflare Pages](https://developers.cloudflare.com/pages/)
- [Cloudflare D1](https://developers.cloudflare.com/d1/)
- [Hono Framework](https://hono.dev/)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/)

### المجتمع
- [Cloudflare Discord](https://discord.gg/cloudflaredev)
- [Hono Discord](https://discord.gg/hono)

## الأسئلة الشائعة

### س: كيف أضيف مستخدمين جدد؟
**ج**: سجل الدخول كـ admin واستخدم API endpoint:
```bash
POST /api/admin/users
{
  "username": "newuser",
  "password": "password123",
  "role": "editor"
}
```

### س: كيف أمنح صلاحيات التعديل لمستخدم؟
**ج**: استخدم API endpoint:
```bash
POST /api/admin/permissions
{
  "user_id": 2,
  "family_id": 1
}
```

### س: كيف أحذف عائلة؟
**ج**: حالياً لا يوجد API endpoint للحذف. يمكنك تنفيذ SQL مباشرة:
```sql
DELETE FROM families WHERE id = ?;
```

### س: هل يمكن استيراد بيانات من ملف Excel؟
**ج**: نعم، يمكنك كتابة script لتحويل Excel إلى SQL INSERT statements.
