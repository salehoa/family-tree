# توثيق واجهات API 📚

## نظرة عامة
هذا المستند يوثق جميع واجهات API المتاحة في برنامج شجرة العائلة.

**Base URL**: `http://localhost:3000` (للتطوير) أو `https://your-project.pages.dev` (للإنتاج)

---

## المصادقة (Authentication)

### تسجيل الدخول
**Endpoint**: `POST /api/auth/login`

**Request Body**:
```json
{
  "username": "admin",
  "password": "admin123"
}
```

**Response** (200 OK):
```json
{
  "token": "1",
  "user": {
    "id": 1,
    "username": "admin",
    "role": "admin"
  }
}
```

**Error Response** (401 Unauthorized):
```json
{
  "error": "Invalid credentials"
}
```

**ملاحظة**: احفظ الـ `token` واستخدمه في header `Authorization: Bearer {token}` للطلبات التي تتطلب مصادقة.

---

## العائلات (Families)

### الحصول على جميع العائلات
**Endpoint**: `GET /api/families`

**Authentication**: غير مطلوبة

**Response** (200 OK):
```json
[
  {
    "id": 1,
    "name": "عائلة الأحمد",
    "description": "شجرة عائلة الأحمد",
    "created_by": 1,
    "created_at": "2025-11-02 10:26:16",
    "updated_at": "2025-11-02 10:26:16"
  }
]
```

---

### الحصول على تفاصيل عائلة محددة
**Endpoint**: `GET /api/families/:id`

**Authentication**: غير مطلوبة

**Parameters**:
- `id` (path): معرف العائلة

**Response** (200 OK):
```json
{
  "id": 1,
  "name": "عائلة الأحمد",
  "description": "شجرة عائلة الأحمد",
  "created_by": 1,
  "created_at": "2025-11-02 10:26:16",
  "updated_at": "2025-11-02 10:26:16"
}
```

**Error Response** (404 Not Found):
```json
{
  "error": "Family not found"
}
```

---

### الحصول على أفراد عائلة محددة
**Endpoint**: `GET /api/families/:id/members`

**Authentication**: غير مطلوبة

**Parameters**:
- `id` (path): معرف العائلة

**Response** (200 OK):
```json
[
  {
    "id": 1,
    "family_id": 1,
    "first_name": "محمد",
    "last_name": "الأحمد",
    "gender": "male",
    "birth_date": "1950-01-01",
    "death_date": null,
    "bio": null,
    "photo_url": null,
    "created_at": "2025-11-02 10:26:16",
    "updated_at": "2025-11-02 10:26:16"
  }
]
```

---

### الحصول على علاقات عائلة محددة
**Endpoint**: `GET /api/families/:id/relationships`

**Authentication**: غير مطلوبة

**Parameters**:
- `id` (path): معرف العائلة

**Response** (200 OK):
```json
[
  {
    "id": 1,
    "family_id": 1,
    "member_id": 1,
    "related_member_id": 2,
    "relationship_type": "spouse",
    "member_name": "محمد",
    "related_name": "فاطمة",
    "created_at": "2025-11-02 10:26:16"
  }
]
```

---

### البحث عن العلاقة بين شخصين
**Endpoint**: `GET /api/families/:id/find-relationship`

**Authentication**: غير مطلوبة

**Parameters**:
- `id` (path): معرف العائلة
- `member1` (query): معرف الشخص الأول
- `member2` (query): معرف الشخص الثاني

**مثال**: `GET /api/families/1/find-relationship?member1=1&member2=3`

**Response** (200 OK):
```json
{
  "type": "direct",
  "relationship": "parent"
}
```

أو:
```json
{
  "type": "indirect",
  "relationship": "No direct relationship found"
}
```

---

### إنشاء عائلة جديدة
**Endpoint**: `POST /api/families`

**Authentication**: **مطلوبة** (Editor أو Admin)

**Headers**:
```
Authorization: Bearer {token}
```

**Request Body**:
```json
{
  "name": "عائلة الحسن",
  "description": "وصف العائلة"
}
```

**Response** (200 OK):
```json
{
  "id": 2,
  "name": "عائلة الحسن",
  "description": "وصف العائلة",
  "created_by": 1,
  "created_at": "2025-11-02 11:00:00",
  "updated_at": "2025-11-02 11:00:00"
}
```

---

### تحديث عائلة
**Endpoint**: `PUT /api/families/:id`

**Authentication**: **مطلوبة** (صاحب صلاحية أو Admin)

**Headers**:
```
Authorization: Bearer {token}
```

**Parameters**:
- `id` (path): معرف العائلة

**Request Body**:
```json
{
  "name": "عائلة الحسن المحدثة",
  "description": "وصف جديد"
}
```

**Response** (200 OK):
```json
{
  "id": 1,
  "name": "عائلة الحسن المحدثة",
  "description": "وصف جديد",
  "created_by": 1,
  "created_at": "2025-11-02 10:26:16",
  "updated_at": "2025-11-02 11:00:00"
}
```

**Error Response** (403 Forbidden):
```json
{
  "error": "No permission to edit this family"
}
```

---

### إضافة عضو جديد
**Endpoint**: `POST /api/families/:id/members`

**Authentication**: **مطلوبة** (صاحب صلاحية أو Admin)

**Headers**:
```
Authorization: Bearer {token}
```

**Parameters**:
- `id` (path): معرف العائلة

**Request Body**:
```json
{
  "first_name": "عمر",
  "last_name": "الأحمد",
  "gender": "male",
  "birth_date": "2000-01-15",
  "death_date": null,
  "bio": "سيرة ذاتية",
  "photo_url": "https://example.com/photo.jpg"
}
```

**Response** (200 OK):
```json
{
  "id": 7,
  "family_id": 1,
  "first_name": "عمر",
  "last_name": "الأحمد",
  "gender": "male",
  "birth_date": "2000-01-15",
  "death_date": null,
  "bio": "سيرة ذاتية",
  "photo_url": "https://example.com/photo.jpg",
  "created_at": "2025-11-02 11:00:00",
  "updated_at": "2025-11-02 11:00:00"
}
```

---

### إضافة علاقة جديدة
**Endpoint**: `POST /api/families/:id/relationships`

**Authentication**: **مطلوبة** (صاحب صلاحية أو Admin)

**Headers**:
```
Authorization: Bearer {token}
```

**Parameters**:
- `id` (path): معرف العائلة

**Request Body**:
```json
{
  "member_id": 1,
  "related_member_id": 7,
  "relationship_type": "child"
}
```

**أنواع العلاقات المتاحة**:
- `parent` - والد/والدة
- `child` - ابن/ابنة
- `spouse` - زوج/زوجة
- `sibling` - أخ/أخت

**Response** (200 OK):
```json
{
  "id": 20,
  "family_id": 1,
  "member_id": 1,
  "related_member_id": 7,
  "relationship_type": "child",
  "created_at": "2025-11-02 11:00:00"
}
```

---

## الإدارة (Admin Only)

### الحصول على جميع المستخدمين
**Endpoint**: `GET /api/admin/users`

**Authentication**: **مطلوبة** (Admin فقط)

**Headers**:
```
Authorization: Bearer {token}
```

**Response** (200 OK):
```json
[
  {
    "id": 1,
    "username": "admin",
    "role": "admin",
    "created_at": "2025-11-02 10:26:16"
  }
]
```

**Error Response** (403 Forbidden):
```json
{
  "error": "Admin access required"
}
```

---

### إنشاء مستخدم جديد
**Endpoint**: `POST /api/admin/users`

**Authentication**: **مطلوبة** (Admin فقط)

**Headers**:
```
Authorization: Bearer {token}
```

**Request Body**:
```json
{
  "username": "editor1",
  "password": "password123",
  "role": "editor"
}
```

**الأدوار المتاحة**:
- `admin` - مسؤول كامل الصلاحيات
- `editor` - محرر (يحتاج صلاحيات لكل عائلة)

**Response** (200 OK):
```json
{
  "id": 2,
  "username": "editor1",
  "role": "editor",
  "created_at": "2025-11-02 11:00:00"
}
```

---

### حذف مستخدم
**Endpoint**: `DELETE /api/admin/users/:id`

**Authentication**: **مطلوبة** (Admin فقط)

**Headers**:
```
Authorization: Bearer {token}
```

**Parameters**:
- `id` (path): معرف المستخدم

**Response** (200 OK):
```json
{
  "success": true
}
```

---

### منح صلاحيات تعديل
**Endpoint**: `POST /api/admin/permissions`

**Authentication**: **مطلوبة** (Admin فقط)

**Headers**:
```
Authorization: Bearer {token}
```

**Request Body**:
```json
{
  "user_id": 2,
  "family_id": 1
}
```

**Response** (200 OK):
```json
{
  "id": 1,
  "user_id": 2,
  "family_id": 1,
  "can_edit": 1,
  "created_at": "2025-11-02 11:00:00"
}
```

---

### إلغاء صلاحيات تعديل
**Endpoint**: `DELETE /api/admin/permissions/:userId/:familyId`

**Authentication**: **مطلوبة** (Admin فقط)

**Headers**:
```
Authorization: Bearer {token}
```

**Parameters**:
- `userId` (path): معرف المستخدم
- `familyId` (path): معرف العائلة

**Response** (200 OK):
```json
{
  "success": true
}
```

---

## أكواد الأخطاء

| الكود | المعنى | الوصف |
|------|---------|--------|
| 200 | OK | الطلب نجح |
| 400 | Bad Request | خطأ في البيانات المرسلة |
| 401 | Unauthorized | غير مصادق (token مفقود أو خاطئ) |
| 403 | Forbidden | ليس لديك صلاحيات |
| 404 | Not Found | المورد غير موجود |
| 500 | Internal Server Error | خطأ في الخادم |

---

## أمثلة Curl

### تسجيل الدخول
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'
```

### الحصول على العائلات
```bash
curl http://localhost:3000/api/families
```

### إنشاء عائلة جديدة
```bash
curl -X POST http://localhost:3000/api/families \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer 1" \
  -d '{"name":"عائلة جديدة","description":"وصف"}'
```

### إضافة عضو
```bash
curl -X POST http://localhost:3000/api/families/1/members \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer 1" \
  -d '{"first_name":"أحمد","last_name":"محمد","gender":"male","birth_date":"1990-01-01"}'
```

### البحث عن علاقة
```bash
curl "http://localhost:3000/api/families/1/find-relationship?member1=1&member2=3"
```

---

## ملاحظات مهمة

1. **المصادقة المبسطة**: نظام المصادقة الحالي مبسط للتطوير. في الإنتاج، استخدم:
   - JWT tokens
   - bcrypt لتشفير كلمات المرور
   - Cloudflare KV لتخزين الجلسات
   - معدل الحد (Rate Limiting)

2. **CORS**: CORS مفعل على `/api/*` لجميع المصادر. قد تحتاج لتقييده في الإنتاج.

3. **Validation**: يفضل إضافة Validation أقوى للبيانات المدخلة باستخدام مكتبة مثل Zod.

4. **Pagination**: الـ APIs الحالية لا تدعم Pagination. أضفها عند التعامل مع بيانات كبيرة.

5. **Soft Delete**: حالياً الحذف نهائي. يمكن إضافة Soft Delete بإضافة حقل `deleted_at`.

---

## أدوات الاختبار

### Postman Collection
يمكنك استخدام Postman لاختبار الـ APIs. قم بإنشاء Collection جديد وأضف الـ endpoints.

### Thunder Client (VS Code)
إضافة Thunder Client في VS Code ممتازة لاختبار الـ APIs.

### HTTPie
```bash
# تثبيت HTTPie
pip install httpie

# مثال
http POST localhost:3000/api/auth/login username=admin password=admin123
```
