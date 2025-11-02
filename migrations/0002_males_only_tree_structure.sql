-- تعديل جدول أفراد العائلة للذكور فقط مع هيكل شجري
-- إزالة حقل الجنس لأن الجميع ذكور
-- إضافة حقل father_id للهيكل الشجري

-- إنشاء جدول جديد بالهيكل المحدث
CREATE TABLE IF NOT EXISTS family_members_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  family_id INTEGER NOT NULL,
  father_id INTEGER NULL,
  first_name TEXT NOT NULL,
  last_name TEXT,
  birth_date TEXT,
  death_date TEXT,
  bio TEXT,
  photo_url TEXT,
  generation INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE,
  FOREIGN KEY (father_id) REFERENCES family_members_new(id) ON DELETE CASCADE
);

-- نسخ البيانات القديمة (الذكور فقط)
INSERT INTO family_members_new (id, family_id, father_id, first_name, last_name, birth_date, death_date, bio, photo_url)
SELECT 
  id, 
  family_id, 
  NULL as father_id,
  first_name, 
  last_name, 
  birth_date, 
  death_date, 
  bio, 
  photo_url
FROM family_members
WHERE gender = 'male' OR gender IS NULL;

-- حذف الجدول القديم
DROP TABLE IF EXISTS family_members;

-- إعادة تسمية الجدول الجديد
ALTER TABLE family_members_new RENAME TO family_members;

-- حذف جدول العلاقات (لن نحتاجه مع الهيكل الشجري)
DROP TABLE IF EXISTS relationships;

-- إنشاء الفهارس
CREATE INDEX IF NOT EXISTS idx_family_members_family_id ON family_members(family_id);
CREATE INDEX IF NOT EXISTS idx_family_members_father_id ON family_members(father_id);
CREATE INDEX IF NOT EXISTS idx_family_members_generation ON family_members(generation);
