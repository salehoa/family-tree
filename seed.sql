-- إنشاء مستخدم admin افتراضي (كلمة المرور: admin123)
INSERT OR IGNORE INTO users (username, password, role) VALUES 
  ('admin', '$2a$10$XQqhZz7Z7Z7Z7Z7Z7Z7Z7.Z7Z7Z7Z7Z7Z7Z7Z7Z7Z7Z7Z7Z7Zu', 'admin');

-- إنشاء عائلة تجريبية
INSERT OR IGNORE INTO families (id, name, description, created_by) VALUES 
  (1, 'عائلة الأحمد', 'شجرة عائلة الأحمد', 1);

-- إضافة أفراد تجريبيين
INSERT OR IGNORE INTO family_members (id, family_id, first_name, last_name, gender, birth_date) VALUES 
  (1, 1, 'محمد', 'الأحمد', 'male', '1950-01-01'),
  (2, 1, 'فاطمة', 'السعيد', 'female', '1955-03-15'),
  (3, 1, 'أحمد', 'الأحمد', 'male', '1975-05-20'),
  (4, 1, 'سارة', 'الحسن', 'female', '1978-08-10'),
  (5, 1, 'عمر', 'الأحمد', 'male', '2000-12-25'),
  (6, 1, 'ليلى', 'الأحمد', 'female', '2003-07-15');

-- إضافة علاقات تجريبية
INSERT OR IGNORE INTO relationships (family_id, member_id, related_member_id, relationship_type) VALUES 
  -- محمد وفاطمة زوجان
  (1, 1, 2, 'spouse'),
  (1, 2, 1, 'spouse'),
  -- أحمد ابن محمد وفاطمة
  (1, 1, 3, 'child'),
  (1, 3, 1, 'parent'),
  (1, 2, 3, 'child'),
  (1, 3, 2, 'parent'),
  -- أحمد وسارة زوجان
  (1, 3, 4, 'spouse'),
  (1, 4, 3, 'spouse'),
  -- عمر وليلى أطفال أحمد وسارة
  (1, 3, 5, 'child'),
  (1, 5, 3, 'parent'),
  (1, 4, 5, 'child'),
  (1, 5, 4, 'parent'),
  (1, 3, 6, 'child'),
  (1, 6, 3, 'parent'),
  (1, 4, 6, 'child'),
  (1, 6, 4, 'parent'),
  -- عمر وليلى أشقاء
  (1, 5, 6, 'sibling'),
  (1, 6, 5, 'sibling');

-- منح الصلاحيات للادمن على العائلة
INSERT OR IGNORE INTO family_permissions (user_id, family_id, can_edit) VALUES 
  (1, 1, 1);
