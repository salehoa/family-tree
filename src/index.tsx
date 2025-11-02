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
        <title>شجرة العائلة - الذكور</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
        <link href="/static/style.css" rel="stylesheet">
    </head>
    <body class="bg-gradient-to-br from-blue-50 to-indigo-100 min-h-screen">
        <!-- Header -->
        <header class="bg-white shadow-md">
            <div class="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
                <div class="flex justify-between items-center">
                    <div class="flex items-center">
                        <i class="fas fa-sitemap text-3xl text-blue-600 ml-3"></i>
                        <h1 class="text-2xl font-bold text-gray-800">شجرة العائلة</h1>
                        <span class="mr-3 text-sm text-blue-600 bg-blue-100 px-3 py-1 rounded-full">الذكور فقط</span>
                    </div>
                    <div id="authButtons" class="flex gap-2">
                        <button onclick="showLoginModal()" class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition">
                            <i class="fas fa-sign-in-alt ml-2"></i>
                            تسجيل الدخول
                        </button>
                    </div>
                    <div id="userMenu" class="hidden flex items-center gap-3">
                        <span id="userName" class="text-gray-700"></span>
                        <button onclick="showAdminPanel()" id="adminBtn" class="hidden bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg transition">
                            <i class="fas fa-cog ml-2"></i>
                            لوحة الإدارة
                        </button>
                        <button onclick="logout()" class="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg transition">
                            <i class="fas fa-sign-out-alt ml-2"></i>
                            تسجيل الخروج
                        </button>
                    </div>
                </div>
            </div>
        </header>

        <!-- Main Content -->
        <main class="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
            <!-- Families Grid -->
            <div class="mb-6 flex justify-between items-center">
                <h2 class="text-2xl font-bold text-gray-800">
                    <i class="fas fa-users ml-2"></i>
                    العائلات
                </h2>
                <button onclick="showCreateFamilyModal()" id="createFamilyBtn" class="hidden bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition">
                    <i class="fas fa-plus ml-2"></i>
                    إضافة عائلة جديدة
                </button>
            </div>
            
            <div id="familiesGrid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <!-- Families will be loaded here -->
            </div>
        </main>

        <!-- Login Modal -->
        <div id="loginModal" class="hidden fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div class="bg-white rounded-xl shadow-2xl p-8 max-w-md w-full mx-4">
                <h2 class="text-2xl font-bold text-gray-800 mb-6 text-center">تسجيل الدخول</h2>
                <form onsubmit="login(event)" class="space-y-4">
                    <div>
                        <label class="block text-gray-700 mb-2">اسم المستخدم</label>
                        <input type="text" id="loginUsername" class="w-full border rounded-lg px-4 py-2" required>
                    </div>
                    <div>
                        <label class="block text-gray-700 mb-2">كلمة المرور</label>
                        <input type="password" id="loginPassword" class="w-full border rounded-lg px-4 py-2" required>
                    </div>
                    <div class="flex gap-3">
                        <button type="submit" class="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg transition">
                            تسجيل الدخول
                        </button>
                        <button type="button" onclick="hideLoginModal()" class="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-800 py-2 rounded-lg transition">
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
        <div id="familyModal" class="hidden fixed inset-0 bg-black bg-opacity-50 z-50">
            <div class="w-full h-full flex flex-col bg-white">
                <!-- Header with controls -->
                <div class="flex-shrink-0 flex justify-between items-center px-6 py-4 border-b bg-white shadow-sm">
                    <h2 id="familyModalTitle" class="text-2xl font-bold text-gray-800 flex-shrink-0"></h2>
                    <div class="flex gap-2 items-center flex-wrap">
                        <button onclick="zoomIn()" class="bg-blue-500 hover:bg-blue-600 text-white px-3 py-2 rounded-lg transition flex items-center gap-2" title="تكبير">
                            <i class="fas fa-search-plus"></i>
                            <span class="hidden sm:inline">تكبير</span>
                        </button>
                        <button onclick="zoomOut()" class="bg-blue-500 hover:bg-blue-600 text-white px-3 py-2 rounded-lg transition flex items-center gap-2" title="تصغير">
                            <i class="fas fa-search-minus"></i>
                            <span class="hidden sm:inline">تصغير</span>
                        </button>
                        <button onclick="resetZoom()" class="bg-blue-500 hover:bg-blue-600 text-white px-3 py-2 rounded-lg transition flex items-center gap-2" title="إعادة ضبط">
                            <i class="fas fa-redo"></i>
                            <span class="hidden sm:inline">إعادة ضبط</span>
                        </button>
                        <button onclick="showAddMemberModal()" id="addMemberBtn" class="hidden bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition flex items-center gap-2">
                            <i class="fas fa-user-plus"></i>
                            <span class="hidden sm:inline">إضافة فرد</span>
                        </button>
                        <button onclick="hideFamilyModal()" class="bg-red-500 hover:bg-red-600 text-white px-3 py-2 rounded-lg transition flex items-center gap-2" title="إغلاق">
                            <i class="fas fa-times"></i>
                            <span class="hidden sm:inline">إغلاق</span>
                        </button>
                    </div>
                </div>

                <!-- Tree container - takes remaining space -->
                <div id="familyTreeContainer" class="flex-1 overflow-hidden bg-gray-50">
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
