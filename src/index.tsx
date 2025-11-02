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
  
  // في التطبيق الحقيقي، سنستخدم session من KV أو قاعدة البيانات
  // هنا سنستخدم sessionId كـ userId مباشرة للتبسيط
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
  
  // في التطبيق الحقيقي، سنستخدم bcrypt للتحقق من كلمة المرور
  // هنا سنقارن مباشرة للتبسيط
  if (user.password !== password) {
    return c.json({ error: 'Invalid credentials' }, 401)
  }
  
  // في التطبيق الحقيقي، سننشئ session في KV
  // هنا سنرجع userId كـ session token
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

// الحصول على أفراد عائلة محددة
app.get('/api/families/:id/members', async (c) => {
  const familyId = c.req.param('id')
  
  const members = await c.env.DB.prepare(
    'SELECT * FROM family_members WHERE family_id = ? ORDER BY birth_date'
  ).bind(familyId).all()
  
  return c.json(members.results)
})

// الحصول على علاقات عائلة محددة
app.get('/api/families/:id/relationships', async (c) => {
  const familyId = c.req.param('id')
  
  const relationships = await c.env.DB.prepare(
    'SELECT r.*, m1.first_name as member_name, m2.first_name as related_name FROM relationships r JOIN family_members m1 ON r.member_id = m1.id JOIN family_members m2 ON r.related_member_id = m2.id WHERE r.family_id = ?'
  ).bind(familyId).all()
  
  return c.json(relationships.results)
})

// البحث عن العلاقة بين شخصين
app.get('/api/families/:id/find-relationship', async (c) => {
  const familyId = c.req.param('id')
  const member1Id = c.req.query('member1')
  const member2Id = c.req.query('member2')
  
  if (!member1Id || !member2Id) {
    return c.json({ error: 'Both member IDs are required' }, 400)
  }
  
  // البحث عن العلاقة المباشرة
  const directRelation = await c.env.DB.prepare(
    'SELECT * FROM relationships WHERE family_id = ? AND member_id = ? AND related_member_id = ?'
  ).bind(familyId, member1Id, member2Id).first()
  
  if (directRelation) {
    return c.json({
      type: 'direct',
      relationship: directRelation.relationship_type
    })
  }
  
  // البحث عن العلاقة العكسية
  const reverseRelation = await c.env.DB.prepare(
    'SELECT * FROM relationships WHERE family_id = ? AND member_id = ? AND related_member_id = ?'
  ).bind(familyId, member2Id, member1Id).first()
  
  if (reverseRelation) {
    let reverseType = reverseRelation.relationship_type
    if (reverseType === 'parent') reverseType = 'child'
    else if (reverseType === 'child') reverseType = 'parent'
    
    return c.json({
      type: 'direct',
      relationship: reverseType
    })
  }
  
  // إذا لم توجد علاقة مباشرة، نحاول إيجاد علاقة غير مباشرة
  return c.json({
    type: 'indirect',
    relationship: 'No direct relationship found'
  })
})

// إنشاء عائلة جديدة (يتطلب مصادقة)
app.post('/api/families', authMiddleware, async (c) => {
  const user = c.get('user')
  const { name, description } = await c.req.json()
  
  const result = await c.env.DB.prepare(
    'INSERT INTO families (name, description, created_by) VALUES (?, ?, ?) RETURNING *'
  ).bind(name, description || null, user.id).first()
  
  return c.json(result)
})

// تحديث عائلة (يتطلب مصادقة وصلاحيات)
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

// إضافة عضو جديد (يتطلب مصادقة وصلاحيات)
app.post('/api/families/:id/members', authMiddleware, async (c) => {
  const user = c.get('user')
  const familyId = c.req.param('id')
  const { first_name, last_name, gender, birth_date, death_date, bio, photo_url } = await c.req.json()
  
  // التحقق من الصلاحيات
  const permission = await c.env.DB.prepare(
    'SELECT * FROM family_permissions WHERE user_id = ? AND family_id = ? AND can_edit = 1'
  ).bind(user.id, familyId).first()
  
  if (!permission && user.role !== 'admin') {
    return c.json({ error: 'No permission to edit this family' }, 403)
  }
  
  const result = await c.env.DB.prepare(
    'INSERT INTO family_members (family_id, first_name, last_name, gender, birth_date, death_date, bio, photo_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING *'
  ).bind(familyId, first_name, last_name || null, gender || null, birth_date || null, death_date || null, bio || null, photo_url || null).first()
  
  return c.json(result)
})

// إضافة علاقة (يتطلب مصادقة وصلاحيات)
app.post('/api/families/:id/relationships', authMiddleware, async (c) => {
  const user = c.get('user')
  const familyId = c.req.param('id')
  const { member_id, related_member_id, relationship_type } = await c.req.json()
  
  // التحقق من الصلاحيات
  const permission = await c.env.DB.prepare(
    'SELECT * FROM family_permissions WHERE user_id = ? AND family_id = ? AND can_edit = 1'
  ).bind(user.id, familyId).first()
  
  if (!permission && user.role !== 'admin') {
    return c.json({ error: 'No permission to edit this family' }, 403)
  }
  
  const result = await c.env.DB.prepare(
    'INSERT INTO relationships (family_id, member_id, related_member_id, relationship_type) VALUES (?, ?, ?, ?) RETURNING *'
  ).bind(familyId, member_id, related_member_id, relationship_type).first()
  
  return c.json(result)
})

// ==================== Admin Routes ====================

// الحصول على جميع المستخدمين (Admin فقط)
app.get('/api/admin/users', authMiddleware, adminMiddleware, async (c) => {
  const users = await c.env.DB.prepare(
    'SELECT id, username, role, created_at FROM users ORDER BY created_at DESC'
  ).all()
  
  return c.json(users.results)
})

// إنشاء مستخدم جديد (Admin فقط)
app.post('/api/admin/users', authMiddleware, adminMiddleware, async (c) => {
  const { username, password, role } = await c.req.json()
  
  const result = await c.env.DB.prepare(
    'INSERT INTO users (username, password, role) VALUES (?, ?, ?) RETURNING id, username, role, created_at'
  ).bind(username, password, role).first()
  
  return c.json(result)
})

// حذف مستخدم (Admin فقط)
app.delete('/api/admin/users/:id', authMiddleware, adminMiddleware, async (c) => {
  const userId = c.req.param('id')
  
  await c.env.DB.prepare(
    'DELETE FROM users WHERE id = ?'
  ).bind(userId).run()
  
  return c.json({ success: true })
})

// منح صلاحيات (Admin فقط)
app.post('/api/admin/permissions', authMiddleware, adminMiddleware, async (c) => {
  const { user_id, family_id } = await c.req.json()
  
  const result = await c.env.DB.prepare(
    'INSERT OR REPLACE INTO family_permissions (user_id, family_id, can_edit) VALUES (?, ?, 1) RETURNING *'
  ).bind(user_id, family_id).first()
  
  return c.json(result)
})

// إلغاء صلاحيات (Admin فقط)
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
        <title>شجرة العائلة</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
        <style>
            body {
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            }
            .tree-node {
                transition: all 0.3s ease;
            }
            .tree-node:hover {
                transform: scale(1.05);
                box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            }
        </style>
    </head>
    <body class="bg-gradient-to-br from-blue-50 to-indigo-100 min-h-screen">
        <!-- Header -->
        <header class="bg-white shadow-md">
            <div class="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
                <div class="flex justify-between items-center">
                    <div class="flex items-center">
                        <i class="fas fa-tree text-3xl text-green-600 ml-3"></i>
                        <h1 class="text-2xl font-bold text-gray-800">شجرة العائلة</h1>
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
            <!-- Search Section -->
            <div class="bg-white rounded-xl shadow-lg p-6 mb-8">
                <h2 class="text-xl font-bold text-gray-800 mb-4">
                    <i class="fas fa-search ml-2"></i>
                    البحث عن العلاقة بين شخصين
                </h2>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <select id="familySelect" class="border rounded-lg px-4 py-2" onchange="loadFamilyForSearch()">
                        <option value="">اختر العائلة</option>
                    </select>
                    <select id="member1Select" class="border rounded-lg px-4 py-2">
                        <option value="">الشخص الأول</option>
                    </select>
                    <select id="member2Select" class="border rounded-lg px-4 py-2">
                        <option value="">الشخص الثاني</option>
                    </select>
                </div>
                <button onclick="findRelationship()" class="mt-4 bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg transition">
                    <i class="fas fa-link ml-2"></i>
                    البحث عن العلاقة
                </button>
                <div id="relationshipResult" class="mt-4 hidden">
                    <div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
                        <p class="text-blue-800 font-semibold" id="relationshipText"></p>
                    </div>
                </div>
            </div>

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

        <!-- Family Details Modal -->
        <div id="familyModal" class="hidden fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto">
            <div class="bg-white rounded-xl shadow-2xl p-8 max-w-6xl w-full mx-4 my-8">
                <div class="flex justify-between items-center mb-6">
                    <h2 id="familyModalTitle" class="text-2xl font-bold text-gray-800"></h2>
                    <button onclick="hideFamilyModal()" class="text-gray-600 hover:text-gray-800">
                        <i class="fas fa-times text-2xl"></i>
                    </button>
                </div>
                
                <div class="mb-6">
                    <button onclick="showAddMemberModal()" id="addMemberBtn" class="hidden bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition">
                        <i class="fas fa-user-plus ml-2"></i>
                        إضافة فرد جديد
                    </button>
                </div>

                <div id="familyTreeContainer" class="bg-gray-50 rounded-lg p-6 overflow-x-auto">
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
