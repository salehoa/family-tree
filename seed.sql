-- إنشاء مستخدم admin افتراضي (كلمة المرور: admin123)
-- ملاحظة: في الإصدار الحالي، كلمة المرور مخزنة كنص عادي للتبسيط
-- في الإنتاج، يجب استخدام bcrypt لتشفير كلمة المرور
INSERT OR IGNORE INTO users (username, password, role) VALUES 
  ('admin', 'admin123', 'admin');

-- إنشاء عائلة تجريبية
INSERT OR IGNORE INTO families (id, name, description, created_by) VALUES 
  (1, 'عائلة الأحمد', 'شجرة عائلة الأحمد - الذكور فقط', 1);

-- إضافة أفراد تجريبيين (ذكور فقط) مع الهيكل الشجري
-- الجيل الأول (الجد الأكبر)
INSERT OR IGNORE INTO family_members (id, family_id, father_id, first_name, last_name, birth_date, generation) VALUES 
  (1, 1, NULL, 'عبدالله', 'الأحمد', '1920-01-01', 0);

-- الجيل الثاني (أبناء عبدالله)
INSERT OR IGNORE INTO family_members (id, family_id, father_id, first_name, last_name, birth_date, generation) VALUES 
  (2, 1, 1, 'محمد', 'الأحمد', '1945-03-15', 1),
  (3, 1, 1, 'أحمد', 'الأحمد', '1948-08-20', 1),
  (4, 1, 1, 'علي', 'الأحمد', '1952-12-10', 1);

-- الجيل الثالث (أبناء محمد)
INSERT OR IGNORE INTO family_members (id, family_id, father_id, first_name, last_name, birth_date, generation) VALUES 
  (5, 1, 2, 'عبدالرحمن', 'الأحمد', '1970-05-20', 2),
  (6, 1, 2, 'عبدالعزيز', 'الأحمد', '1973-11-15', 2),
  (7, 1, 2, 'خالد', 'الأحمد', '1976-07-25', 2);

-- الجيل الثالث (أبناء أحمد)
INSERT OR IGNORE INTO family_members (id, family_id, father_id, first_name, last_name, birth_date, generation) VALUES 
  (8, 1, 3, 'فهد', 'الأحمد', '1972-02-10', 2),
  (9, 1, 3, 'سعود', 'الأحمد', '1975-09-18', 2);

-- الجيل الثالث (أبناء علي)
INSERT OR IGNORE INTO family_members (id, family_id, father_id, first_name, last_name, birth_date, generation) VALUES 
  (10, 1, 4, 'ماجد', 'الأحمد', '1978-04-22', 2),
  (11, 1, 4, 'طارق', 'الأحمد', '1982-06-30', 2);

-- الجيل الرابع (أبناء عبدالرحمن)
INSERT OR IGNORE INTO family_members (id, family_id, father_id, first_name, last_name, birth_date, generation) VALUES 
  (12, 1, 5, 'محمد', 'عبدالرحمن', '1995-03-15', 3),
  (13, 1, 5, 'عبدالله', 'عبدالرحمن', '1998-08-20', 3);

-- الجيل الرابع (أبناء عبدالعزيز)
INSERT OR IGNORE INTO family_members (id, family_id, father_id, first_name, last_name, birth_date, generation) VALUES 
  (14, 1, 6, 'أحمد', 'عبدالعزيز', '1997-01-10', 3),
  (15, 1, 6, 'سلطان', 'عبدالعزيز', '2000-05-25', 3),
  (16, 1, 6, 'فيصل', 'عبدالعزيز', '2003-11-12', 3);

-- الجيل الرابع (أبناء خالد)
INSERT OR IGNORE INTO family_members (id, family_id, father_id, first_name, last_name, birth_date, generation) VALUES 
  (17, 1, 7, 'يوسف', 'خالد', '2000-09-08', 3),
  (18, 1, 7, 'عمر', 'خالد', '2004-02-14', 3);

-- الجيل الرابع (أبناء فهد)
INSERT OR IGNORE INTO family_members (id, family_id, father_id, first_name, last_name, birth_date, generation) VALUES 
  (19, 1, 8, 'ناصر', 'فهد', '1996-07-22', 3),
  (20, 1, 8, 'سعد', 'فهد', '1999-12-05', 3);

-- منح الصلاحيات للادمن على العائلة
INSERT OR IGNORE INTO family_permissions (user_id, family_id, can_edit) VALUES 
  (1, 1, 1);
