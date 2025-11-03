import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/cloudflare-workers'

type Bindings = {
  DB: D1Database
}

type Variables = {
  user?: {
    id: number
    username: string
    role: string
  }
}

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>()

// Enable CORS
app.use('/api/*', cors())

// Serve static files
app.use('/static/*', serveStatic({ root: './public' }))

// Middleware للتحقق من المصادقة
const authMiddleware = async (c: any, next: any) => {
  const authHeader = c.req.header('Authorization')
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  
  const sessionId = authHeader.substring(7)
  
  try {
    const userId = parseInt(sessionId)
    const user = await c.env.DB.prepare(
      'SELECT id, username, role FROM users WHERE id = ?'
    ).bind(userId).first()
    
    if (!user) {
      return c.json({ error: 'Invalid session' }, 401)
    }
    
    c.set('user', user)
    await next()
  } catch (error) {
    return c.json({ error: 'Invalid session' }, 401)
  }
}

// Middleware للتحقق من صلاحيات الأدمن
const adminMiddleware = async (c: any, next: any) => {
  const user = c.get('user')
  
  if (user.role !== 'admin') {
    return c.json({ error: 'Admin access required' }, 403)
  }
  
  await next()
}

// ==================== API Routes ====================

// تسجيل الدخول
app.post('/api/auth/login', async (c) => {
  const { username, password } = await c.req.json()
  
  const user = await c.env.DB.prepare(
    'SELECT * FROM users WHERE username = ?'
  ).bind(username).first()
  
  if (!user) {
    return c.json({ error: 'Invalid credentials' }, 401)
  }
  
  if (user.password !== password) {
    return c.json({ error: 'Invalid credentials' }, 401)
  }
  
  return c.json({
    token: user.id.toString(),
    user: {
      id: user.id,
      username: user.username,
      role: user.role
    }
  })
})

// تغيير كلمة المرور (للمستخدم نفسه)
app.post('/api/auth/change-password', authMiddleware, async (c) => {
  const user = c.get('user')
  const { currentPassword, newPassword } = await c.req.json()
  
  if (!currentPassword || !newPassword) {
    return c.json({ error: 'Current password and new password are required' }, 400)
  }
  
  if (newPassword.length < 6) {
    return c.json({ error: 'Password must be at least 6 characters' }, 400)
  }
  
  // التحقق من كلمة المرور الحالية
  const dbUser = await c.env.DB.prepare(
    'SELECT password FROM users WHERE id = ?'
  ).bind(user.id).first()
  
  if (!dbUser || dbUser.password !== currentPassword) {
    return c.json({ error: 'Current password is incorrect' }, 401)
  }
  
  // تحديث كلمة المرور
  await c.env.DB.prepare(
    'UPDATE users SET password = ? WHERE id = ?'
  ).bind(newPassword, user.id).run()
  
  return c.json({ success: true, message: 'Password changed successfully' })
})

// الحصول على جميع العائلات
app.get('/api/families', async (c) => {
  const families = await c.env.DB.prepare(
    'SELECT * FROM families ORDER BY created_at DESC'
  ).all()
  
  return c.json(families.results)
})

// الحصول على العائلات المسموح بها للمستخدم الحالي
app.get('/api/families/my', authMiddleware, async (c) => {
  const user = c.get('user')
  
  // المديرون يرون جميع العائلات
  if (user.role === 'admin') {
    const families = await c.env.DB.prepare(
      'SELECT * FROM families ORDER BY created_at DESC'
    ).all()
    
    return c.json(families.results)
  }
  
  // المستخدمون العاديون يرون فقط العائلات المسموح لهم بها
  const families = await c.env.DB.prepare(`
    SELECT f.* FROM families f
    INNER JOIN family_permissions fp ON f.id = fp.family_id
    WHERE fp.user_id = ? AND fp.can_edit = 1
    ORDER BY f.created_at DESC
  `).bind(user.id).all()
  
  return c.json(families.results)
})

// الحصول على تفاصيل عائلة محددة
app.get('/api/families/:id', async (c) => {
  const familyId = c.req.param('id')
  
  const family = await c.env.DB.prepare(
    'SELECT * FROM families WHERE id = ?'
  ).bind(familyId).first()
  
  if (!family) {
    return c.json({ error: 'Family not found' }, 404)
  }
  
  return c.json(family)
})

// الحصول على شجرة العائلة الكاملة (هيكل شجري)
app.get('/api/families/:id/tree', async (c) => {
  const familyId = c.req.param('id')
  
  // جلب جميع الأفراد
  const members = await c.env.DB.prepare(
    'SELECT * FROM family_members WHERE family_id = ? ORDER BY generation, birth_date'
  ).bind(familyId).all()
  
  // بناء الهيكل الشجري
  const membersMap = new Map()
  const rootMembers: any[] = []
  
  // إنشاء map لجميع الأفراد
  members.results.forEach((member: any) => {
    membersMap.set(member.id, {
      ...member,
      children: []
    })
  })
  
  // بناء الشجرة
  members.results.forEach((member: any) => {
    const node = membersMap.get(member.id)
    if (member.father_id === null) {
      rootMembers.push(node)
    } else {
      const parent = membersMap.get(member.father_id)
      if (parent) {
        parent.children.push(node)
      }
    }
  })
  
  return c.json({
    family_id: familyId,
    tree: rootMembers,
    total_members: members.results.length
  })
})

// الحصول على أفراد عائلة محددة (قائمة بسيطة)
app.get('/api/families/:id/members', async (c) => {
  const familyId = c.req.param('id')
  
  const members = await c.env.DB.prepare(
    'SELECT * FROM family_members WHERE family_id = ? ORDER BY generation, birth_date'
  ).bind(familyId).all()
  
  return c.json(members.results)
})

// إنشاء عائلة جديدة
app.post('/api/families', authMiddleware, async (c) => {
  const user = c.get('user')
  const { name, description } = await c.req.json()
  
  const result = await c.env.DB.prepare(
    'INSERT INTO families (name, description, created_by) VALUES (?, ?, ?) RETURNING *'
  ).bind(name, description || null, user.id).first()
  
  return c.json(result)
})

// تحديث عائلة
app.put('/api/families/:id', authMiddleware, async (c) => {
  const user = c.get('user')
  const familyId = c.req.param('id')
  const { name, description } = await c.req.json()
  
  // التحقق من الصلاحيات
  const permission = await c.env.DB.prepare(
    'SELECT * FROM family_permissions WHERE user_id = ? AND family_id = ? AND can_edit = 1'
  ).bind(user.id, familyId).first()
  
  if (!permission && user.role !== 'admin') {
    return c.json({ error: 'No permission to edit this family' }, 403)
  }
  
  const result = await c.env.DB.prepare(
    'UPDATE families SET name = ?, description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? RETURNING *'
  ).bind(name, description || null, familyId).first()
  
  return c.json(result)
})

// حذف عائلة
app.delete('/api/families/:id', authMiddleware, async (c) => {
  const user = c.get('user')
  const familyId = c.req.param('id')
  
  // التحقق من الصلاحيات - يجب أن يكون admin أو صاحب صلاحية التحرير
  const permission = await c.env.DB.prepare(
    'SELECT * FROM family_permissions WHERE user_id = ? AND family_id = ? AND can_edit = 1'
  ).bind(user.id, familyId).first()
  
  if (!permission && user.role !== 'admin') {
    return c.json({ error: 'No permission to delete this family' }, 403)
  }
  
  // حذف جميع أعضاء العائلة أولاً
  await c.env.DB.prepare(
    'DELETE FROM family_members WHERE family_id = ?'
  ).bind(familyId).run()
  
  // حذف جميع الصلاحيات المرتبطة بالعائلة
  await c.env.DB.prepare(
    'DELETE FROM family_permissions WHERE family_id = ?'
  ).bind(familyId).run()
  
  // حذف العائلة نفسها
  await c.env.DB.prepare(
    'DELETE FROM families WHERE id = ?'
  ).bind(familyId).run()
  
  return c.json({ success: true, message: 'Family deleted successfully' })
})

// إضافة عضو جديد (ذكر فقط)
app.post('/api/families/:id/members', authMiddleware, async (c) => {
  const user = c.get('user')
  const familyId = c.req.param('id')
  const { first_name, last_name, father_id, birth_date, death_date, bio, photo_url } = await c.req.json()
  
  // التحقق من الصلاحيات
  const permission = await c.env.DB.prepare(
    'SELECT * FROM family_permissions WHERE user_id = ? AND family_id = ? AND can_edit = 1'
  ).bind(user.id, familyId).first()
  
  if (!permission && user.role !== 'admin') {
    return c.json({ error: 'No permission to edit this family' }, 403)
  }
  
  // حساب الجيل
  let generation = 0
  if (father_id) {
    const father = await c.env.DB.prepare(
      'SELECT generation FROM family_members WHERE id = ?'
    ).bind(father_id).first()
    
    if (father) {
      generation = (father.generation || 0) + 1
    }
  }
  
  const result = await c.env.DB.prepare(
    'INSERT INTO family_members (family_id, father_id, first_name, last_name, birth_date, death_date, bio, photo_url, generation) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *'
  ).bind(familyId, father_id || null, first_name, last_name || null, birth_date || null, death_date || null, bio || null, photo_url || null, generation).first()
  
  return c.json(result)
})

// تحديث عضو
app.put('/api/families/:familyId/members/:memberId', authMiddleware, async (c) => {
  const user = c.get('user')
  const familyId = c.req.param('familyId')
  const memberId = c.req.param('memberId')
  const updates = await c.req.json()
  
  // التحقق من الصلاحيات
  const permission = await c.env.DB.prepare(
    'SELECT * FROM family_permissions WHERE user_id = ? AND family_id = ? AND can_edit = 1'
  ).bind(user.id, familyId).first()
  
  if (!permission && user.role !== 'admin') {
    return c.json({ error: 'No permission to edit this family' }, 403)
  }
  
  // Get current member data
  const currentMember = await c.env.DB.prepare(
    'SELECT * FROM family_members WHERE id = ? AND family_id = ?'
  ).bind(memberId, familyId).first()
  
  if (!currentMember) {
    return c.json({ error: 'Member not found' }, 404)
  }
  
  // Merge updates with current data
  const first_name = updates.first_name !== undefined ? updates.first_name : currentMember.first_name
  const last_name = updates.last_name !== undefined ? updates.last_name : currentMember.last_name
  const father_id = updates.father_id !== undefined ? updates.father_id : currentMember.father_id
  const birth_date = updates.birth_date !== undefined ? updates.birth_date : currentMember.birth_date
  const death_date = updates.death_date !== undefined ? updates.death_date : currentMember.death_date
  const bio = updates.bio !== undefined ? updates.bio : currentMember.bio
  const photo_url = updates.photo_url !== undefined ? updates.photo_url : currentMember.photo_url
  
  // حساب الجيل إذا تغير الأب
  let generation = currentMember.generation
  if (updates.father_id !== undefined && father_id) {
    const father = await c.env.DB.prepare(
      'SELECT generation FROM family_members WHERE id = ?'
    ).bind(father_id).first()
    
    if (father) {
      generation = (father.generation || 0) + 1
    }
  } else if (updates.father_id !== undefined && !father_id) {
    generation = 0
  }
  
  const result = await c.env.DB.prepare(
    'UPDATE family_members SET first_name = ?, last_name = ?, father_id = ?, birth_date = ?, death_date = ?, bio = ?, photo_url = ?, generation = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND family_id = ? RETURNING *'
  ).bind(first_name, last_name || null, father_id || null, birth_date || null, death_date || null, bio || null, photo_url || null, generation, memberId, familyId).first()
  
  return c.json(result)
})

// حذف عضو
app.delete('/api/families/:familyId/members/:memberId', authMiddleware, async (c) => {
  const user = c.get('user')
  const familyId = c.req.param('familyId')
  const memberId = c.req.param('memberId')
  
  // التحقق من الصلاحيات
  const permission = await c.env.DB.prepare(
    'SELECT * FROM family_permissions WHERE user_id = ? AND family_id = ? AND can_edit = 1'
  ).bind(user.id, familyId).first()
  
  if (!permission && user.role !== 'admin') {
    return c.json({ error: 'No permission to edit this family' }, 403)
  }
  
  await c.env.DB.prepare(
    'DELETE FROM family_members WHERE id = ? AND family_id = ?'
  ).bind(memberId, familyId).run()
  
  return c.json({ success: true })
})

// ==================== Admin Routes ====================

// الحصول على جميع المستخدمين
app.get('/api/admin/users', authMiddleware, adminMiddleware, async (c) => {
  const users = await c.env.DB.prepare(
    'SELECT id, username, role, created_at FROM users ORDER BY created_at DESC'
  ).all()
  
  return c.json(users.results)
})

// إنشاء مستخدم جديد
app.post('/api/admin/users', authMiddleware, adminMiddleware, async (c) => {
  try {
    const { username, password, role } = await c.req.json()
    
    // التحقق من أن الحقول مطلوبة
    if (!username || !password || !role) {
      return c.json({ error: 'Username, password, and role are required' }, 400)
    }
    
    // التحقق من أن role صحيح
    if (role !== 'admin' && role !== 'user') {
      return c.json({ error: 'Role must be either "admin" or "user"' }, 400)
    }
    
    // التحقق من عدم وجود المستخدم
    const existingUser = await c.env.DB.prepare(
      'SELECT id FROM users WHERE username = ?'
    ).bind(username).first()
    
    if (existingUser) {
      return c.json({ error: 'Username already exists' }, 409)
    }
    
    const result = await c.env.DB.prepare(
      'INSERT INTO users (username, password, role) VALUES (?, ?, ?) RETURNING id, username, role, created_at'
    ).bind(username, password, role).first()
    
    return c.json(result)
  } catch (error: any) {
    console.error('Error creating user:', error)
    return c.json({ error: 'Failed to create user: ' + error.message }, 500)
  }
})

// تحديث مستخدم (كلمة المرور)
app.put('/api/admin/users/:id', authMiddleware, adminMiddleware, async (c) => {
  const userId = c.req.param('id')
  const { password } = await c.req.json()
  
  await c.env.DB.prepare(
    'UPDATE users SET password = ? WHERE id = ?'
  ).bind(password, userId).run()
  
  return c.json({ success: true })
})

// حذف مستخدم
app.delete('/api/admin/users/:id', authMiddleware, adminMiddleware, async (c) => {
  const userId = c.req.param('id')
  
  // حذف صلاحيات المستخدم أولاً
  await c.env.DB.prepare(
    'DELETE FROM family_permissions WHERE user_id = ?'
  ).bind(userId).run()
  
  // ثم حذف المستخدم
  await c.env.DB.prepare(
    'DELETE FROM users WHERE id = ?'
  ).bind(userId).run()
  
  return c.json({ success: true })
})

// جلب صلاحيات مستخدم معين
app.get('/api/admin/users/:id/permissions', authMiddleware, adminMiddleware, async (c) => {
  const userId = c.req.param('id')
  
  const permissions = await c.env.DB.prepare(`
    SELECT fp.*, f.name as family_name
    FROM family_permissions fp
    JOIN families f ON fp.family_id = f.id
    WHERE fp.user_id = ?
    ORDER BY f.name
  `).bind(userId).all()
  
  return c.json(permissions.results)
})

// منح صلاحيات
app.post('/api/admin/permissions', authMiddleware, adminMiddleware, async (c) => {
  const { user_id, family_id } = await c.req.json()
  
  const result = await c.env.DB.prepare(
    'INSERT OR REPLACE INTO family_permissions (user_id, family_id, can_edit) VALUES (?, ?, 1) RETURNING *'
  ).bind(user_id, family_id).first()
  
  return c.json(result)
})

// إلغاء صلاحيات
app.delete('/api/admin/permissions/:userId/:familyId', authMiddleware, adminMiddleware, async (c) => {
  const userId = c.req.param('userId')
  const familyId = c.req.param('familyId')
  
  await c.env.DB.prepare(
    'DELETE FROM family_permissions WHERE user_id = ? AND family_id = ?'
  ).bind(userId, familyId).run()
  
  return c.json({ success: true })
})

// ==================== Main Page ====================

app.get('/', (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>عوائل القريتين</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
        <link href="/static/style.css" rel="stylesheet">
    </head>
    <body class="bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 min-h-screen">
        <!-- Header -->
        <header class="bg-white/80 backdrop-blur-lg shadow-lg border-b border-gray-100 sticky top-0 z-40">
            <div class="max-w-7xl mx-auto px-4 py-5 sm:px-6 lg:px-8">
                <div class="flex justify-between items-center">
                    <div class="flex items-center gap-4">
                        <div class="w-12 h-12 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg transform hover:scale-110 transition-transform duration-200">
                            <i class="fas fa-sitemap text-2xl text-white"></i>
                        </div>
                        <div>
                            <h1 class="text-2xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">عوائل القريتين</h1>
                            <p class="text-sm text-gray-500">شجرة العائلة الرقمية</p>
                        </div>
                    </div>
                    <div id="authButtons" class="flex gap-3">
                        <button onclick="showLoginModal()" class="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white px-6 py-2.5 rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 flex items-center gap-2">
                            <i class="fas fa-sign-in-alt"></i>
                            <span>تسجيل الدخول</span>
                        </button>
                    </div>
                    <div id="userMenu" class="hidden relative">
                        <button onclick="toggleUserDropdown()" class="flex items-center gap-2 bg-gradient-to-r from-gray-100 to-gray-50 hover:from-gray-200 hover:to-gray-100 px-4 py-2 rounded-xl transition-all duration-200 shadow-md hover:shadow-lg">
                            <i class="fas fa-user-circle text-2xl text-blue-600"></i>
                            <span id="userName" class="text-gray-700 font-semibold"></span>
                            <i class="fas fa-chevron-down text-gray-500 text-sm"></i>
                        </button>
                        
                        <!-- Dropdown Menu -->
                        <div id="userDropdown" class="hidden absolute left-0 mt-2 w-64 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden z-50 animate-fadeIn">
                            <button onclick="showAdminPanel(); toggleUserDropdown();" id="adminBtnDropdown" class="hidden w-full text-right px-4 py-3 hover:bg-gradient-to-r hover:from-purple-50 hover:to-pink-50 transition-all duration-200 flex items-center gap-3 border-b border-gray-100">
                                <div class="w-10 h-10 bg-gradient-to-br from-purple-600 to-pink-600 rounded-xl flex items-center justify-center">
                                    <i class="fas fa-cog text-white"></i>
                                </div>
                                <div class="flex-1">
                                    <div class="font-semibold text-gray-800">لوحة الإدارة</div>
                                    <div class="text-xs text-gray-500">إدارة المستخدمين والصلاحيات</div>
                                </div>
                            </button>
                            
                            <button onclick="showChangePasswordModal(); toggleUserDropdown();" class="w-full text-right px-4 py-3 hover:bg-gradient-to-r hover:from-blue-50 hover:to-cyan-50 transition-all duration-200 flex items-center gap-3 border-b border-gray-100">
                                <div class="w-10 h-10 bg-gradient-to-br from-blue-500 to-cyan-600 rounded-xl flex items-center justify-center">
                                    <i class="fas fa-key text-white"></i>
                                </div>
                                <div class="flex-1">
                                    <div class="font-semibold text-gray-800">تغيير كلمة المرور</div>
                                    <div class="text-xs text-gray-500">تحديث كلمة المرور الخاصة بك</div>
                                </div>
                            </button>
                            
                            <button onclick="logout()" class="w-full text-right px-4 py-3 hover:bg-gradient-to-r hover:from-red-50 hover:to-rose-50 transition-all duration-200 flex items-center gap-3">
                                <div class="w-10 h-10 bg-gradient-to-br from-red-500 to-rose-600 rounded-xl flex items-center justify-center">
                                    <i class="fas fa-sign-out-alt text-white"></i>
                                </div>
                                <div class="flex-1">
                                    <div class="font-semibold text-gray-800">تسجيل الخروج</div>
                                    <div class="text-xs text-gray-500">إنهاء الجلسة الحالية</div>
                                </div>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </header>

        <!-- Main Content -->
        <main class="max-w-7xl mx-auto px-4 py-12 sm:px-6 lg:px-8">
            <!-- Families Grid -->
            <div class="mb-10 flex justify-between items-center">
                <div>
                    <h2 class="text-3xl font-bold bg-gradient-to-r from-gray-800 to-gray-600 bg-clip-text text-transparent mb-2 flex items-center gap-3">
                        <i class="fas fa-users text-blue-600"></i>
                        العائلات المسجلة
                    </h2>
                    <p class="text-gray-500">اضغط على أي عائلة لعرض شجرة العائلة الكاملة</p>
                </div>
                <button onclick="showCreateFamilyModal()" id="createFamilyBtn" class="hidden bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white px-6 py-3 rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 flex items-center gap-2">
                    <i class="fas fa-plus"></i>
                    <span>إضافة عائلة جديدة</span>
                </button>
            </div>
            
            <div id="familiesGrid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <!-- Families will be loaded here -->
            </div>
        </main>

        <!-- Login Modal -->
        <div id="loginModal" class="hidden fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fadeIn">
            <div class="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4 transform transition-all">
                <div class="text-center mb-8">
                    <div class="w-16 h-16 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
                        <i class="fas fa-sign-in-alt text-2xl text-white"></i>
                    </div>
                    <h2 class="text-3xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">تسجيل الدخول</h2>
                    <p class="text-gray-500 mt-2">أدخل بيانات الدخول الخاصة بك</p>
                </div>
                <form onsubmit="login(event)" class="space-y-6">
                    <div>
                        <label class="block text-gray-700 font-semibold mb-3">اسم المستخدم</label>
                        <div class="relative">
                            <i class="fas fa-user absolute right-4 top-1/2 -translate-y-1/2 text-gray-400"></i>
                            <input type="text" id="loginUsername" class="w-full border-2 border-gray-200 focus:border-blue-500 rounded-xl px-12 py-3 transition-colors outline-none" placeholder="أدخل اسم المستخدم" required>
                        </div>
                    </div>
                    <div>
                        <label class="block text-gray-700 font-semibold mb-3">كلمة المرور</label>
                        <div class="relative">
                            <i class="fas fa-lock absolute right-4 top-1/2 -translate-y-1/2 text-gray-400"></i>
                            <input type="password" id="loginPassword" class="w-full border-2 border-gray-200 focus:border-blue-500 rounded-xl px-12 py-3 transition-colors outline-none" placeholder="أدخل كلمة المرور" required>
                        </div>
                    </div>
                    <div class="flex gap-3 pt-4">
                        <button type="submit" class="flex-1 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white py-3 rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 font-semibold">
                            تسجيل الدخول
                        </button>
                        <button type="button" onclick="hideLoginModal()" class="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-3 rounded-xl transition-all duration-200 font-semibold">
                            إلغاء
                        </button>
                    </div>
                </form>
            </div>
        </div>

        <!-- Change Password Modal -->
        <div id="changePasswordModal" class="hidden fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fadeIn">
            <div class="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4 transform transition-all">
                <div class="text-center mb-8">
                    <div class="w-16 h-16 bg-gradient-to-br from-blue-500 to-cyan-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
                        <i class="fas fa-key text-2xl text-white"></i>
                    </div>
                    <h2 class="text-3xl font-bold bg-gradient-to-r from-blue-500 to-cyan-600 bg-clip-text text-transparent">تغيير كلمة المرور</h2>
                    <p class="text-gray-500 mt-2">أدخل كلمة المرور الحالية والجديدة</p>
                </div>
                <form onsubmit="changePassword(event)" class="space-y-6">
                    <div>
                        <label class="block text-gray-700 font-semibold mb-3">كلمة المرور الحالية</label>
                        <div class="relative">
                            <i class="fas fa-lock absolute right-4 top-1/2 -translate-y-1/2 text-gray-400"></i>
                            <input type="password" id="currentPassword" class="w-full border-2 border-gray-200 focus:border-blue-500 rounded-xl px-12 py-3 transition-colors outline-none" placeholder="أدخل كلمة المرور الحالية" required>
                        </div>
                    </div>
                    <div>
                        <label class="block text-gray-700 font-semibold mb-3">كلمة المرور الجديدة</label>
                        <div class="relative">
                            <i class="fas fa-key absolute right-4 top-1/2 -translate-y-1/2 text-gray-400"></i>
                            <input type="password" id="newPassword" class="w-full border-2 border-gray-200 focus:border-blue-500 rounded-xl px-12 py-3 transition-colors outline-none" placeholder="أدخل كلمة المرور الجديدة (6 أحرف على الأقل)" minlength="6" required>
                        </div>
                    </div>
                    <div>
                        <label class="block text-gray-700 font-semibold mb-3">تأكيد كلمة المرور الجديدة</label>
                        <div class="relative">
                            <i class="fas fa-check-circle absolute right-4 top-1/2 -translate-y-1/2 text-gray-400"></i>
                            <input type="password" id="confirmPassword" class="w-full border-2 border-gray-200 focus:border-blue-500 rounded-xl px-12 py-3 transition-colors outline-none" placeholder="أعد إدخال كلمة المرور الجديدة" required>
                        </div>
                    </div>
                    <div class="flex gap-3 pt-4">
                        <button type="submit" class="flex-1 bg-gradient-to-r from-blue-500 to-cyan-600 hover:from-blue-600 hover:to-cyan-700 text-white py-3 rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 font-semibold">
                            تغيير كلمة المرور
                        </button>
                        <button type="button" onclick="hideChangePasswordModal()" class="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-3 rounded-xl transition-all duration-200 font-semibold">
                            إلغاء
                        </button>
                    </div>
                </form>
            </div>
        </div>

        <!-- Admin Panel Modal -->
        <div id="adminModal" class="hidden fixed inset-0 bg-black bg-opacity-50 z-50">
            <div class="w-full h-full flex items-center justify-center p-4">
                <div class="bg-white rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col">
                    <!-- Header -->
                    <div class="flex justify-between items-center px-6 py-4 border-b bg-gradient-to-r from-blue-600 to-indigo-600">
                        <h2 class="text-2xl font-bold text-white flex items-center gap-2">
                            <i class="fas fa-user-shield"></i>
                            لوحة الإدارة
                        </h2>
                        <button onclick="hideAdminPanel()" class="text-white hover:text-gray-200 text-2xl px-2">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    
                    <!-- Content -->
                    <div id="adminContent" class="flex-1 overflow-y-auto p-6">
                        <!-- Admin content will be rendered here -->
                    </div>
                </div>
            </div>
        </div>

        <!-- Family Tree Modal -->
        <div id="familyModal" class="hidden fixed inset-0 bg-black/70 backdrop-blur-sm z-50 animate-fadeIn">
            <div class="w-full h-full flex flex-col bg-gradient-to-br from-gray-50 to-blue-50">
                <!-- Header with controls - Modern Design -->
                <div class="flex-shrink-0 flex justify-between items-center px-6 py-5 border-b border-gray-200/50 bg-white/95 backdrop-blur-xl shadow-xl">
                    <div class="flex items-center gap-3">
                        <div class="w-12 h-12 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg">
                            <i class="fas fa-sitemap text-xl text-white"></i>
                        </div>
                        <div>
                            <h2 id="familyModalTitle" class="text-2xl font-bold bg-gradient-to-r from-gray-800 to-gray-600 bg-clip-text text-transparent"></h2>
                            <p class="text-sm text-gray-500">شجرة العائلة التفاعلية</p>
                        </div>
                    </div>
                    <div class="flex gap-2 items-center flex-wrap">
                        <button onclick="zoomIn()" class="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white px-4 py-2.5 rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 flex items-center gap-2 group" title="تكبير">
                            <i class="fas fa-search-plus group-hover:scale-110 transition-transform"></i>
                            <span class="hidden sm:inline font-semibold">تكبير</span>
                        </button>
                        <button onclick="zoomOut()" class="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white px-4 py-2.5 rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 flex items-center gap-2 group" title="تصغير">
                            <i class="fas fa-search-minus group-hover:scale-110 transition-transform"></i>
                            <span class="hidden sm:inline font-semibold">تصغير</span>
                        </button>
                        <button onclick="resetZoom()" class="bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white px-4 py-2.5 rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 flex items-center gap-2 group" title="إعادة ضبط">
                            <i class="fas fa-redo group-hover:rotate-180 transition-transform duration-500"></i>
                            <span class="hidden sm:inline font-semibold">إعادة ضبط</span>
                        </button>
                        <button onclick="showAddMemberModal()" id="addMemberBtn" class="hidden bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white px-4 py-2.5 rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 flex items-center gap-2 group">
                            <i class="fas fa-user-plus group-hover:scale-110 transition-transform"></i>
                            <span class="hidden sm:inline font-semibold">إضافة فرد</span>
                        </button>
                        <button onclick="hideFamilyModal()" class="bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 text-white px-4 py-2.5 rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 flex items-center gap-2 group" title="إغلاق">
                            <i class="fas fa-times group-hover:rotate-90 transition-transform duration-300"></i>
                            <span class="hidden sm:inline font-semibold">إغلاق</span>
                        </button>
                    </div>
                </div>

                <!-- Tree container - takes remaining space -->
                <div id="familyTreeContainer" class="flex-1 overflow-hidden bg-gradient-to-br from-gray-50 via-blue-50 to-indigo-50 relative">
                    <!-- Decorative background pattern -->
                    <div class="absolute inset-0 opacity-5" style="background-image: radial-gradient(circle at 25px 25px, #3b82f6 2%, transparent 0%), radial-gradient(circle at 75px 75px, #6366f1 2%, transparent 0%); background-size: 100px 100px;"></div>
                    
                    <!-- Family tree will be rendered here -->
                </div>
            </div>
        </div>

        <script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
        <script src="/static/app.js"></script>
    </body>
    </html>
  `)
})

export default app
