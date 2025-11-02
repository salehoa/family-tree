// Global state
let currentUser = null;
let currentFamilyId = null;
let families = [];
let familyTree = null;
let zoomLevel = 1;

// API Base URL
const API_BASE = '/api';

// Initialize app
document.addEventListener('DOMContentLoaded', async () => {
    // Check for existing session
    const token = localStorage.getItem('authToken');
    if (token) {
        const user = JSON.parse(localStorage.getItem('user'));
        setCurrentUser(user, token);
    }
    
    // Load families
    await loadFamilies();
});

// Authentication functions
function setCurrentUser(user, token) {
    currentUser = user;
    localStorage.setItem('authToken', token);
    localStorage.setItem('user', JSON.stringify(user));
    
    // Update UI
    document.getElementById('authButtons').classList.add('hidden');
    document.getElementById('userMenu').classList.remove('hidden');
    document.getElementById('userName').textContent = user.username;
    
    if (user.role === 'admin') {
        document.getElementById('adminBtn').classList.remove('hidden');
    }
    
    document.getElementById('createFamilyBtn').classList.remove('hidden');
}

function logout() {
    currentUser = null;
    localStorage.removeItem('authToken');
    localStorage.removeItem('user');
    
    // Update UI
    document.getElementById('authButtons').classList.remove('hidden');
    document.getElementById('userMenu').classList.add('hidden');
    document.getElementById('createFamilyBtn').classList.add('hidden');
    
    window.location.reload();
}

async function login(event) {
    event.preventDefault();
    
    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;
    
    try {
        const response = await axios.post(`${API_BASE}/auth/login`, {
            username,
            password
        });
        
        setCurrentUser(response.data.user, response.data.token);
        hideLoginModal();
        await loadFamilies();
    } catch (error) {
        alert('فشل تسجيل الدخول. تحقق من اسم المستخدم وكلمة المرور.');
        console.error('Login error:', error);
    }
}

// Modal functions
function showLoginModal() {
    document.getElementById('loginModal').classList.remove('hidden');
}

function hideLoginModal() {
    document.getElementById('loginModal').classList.add('hidden');
    document.getElementById('loginUsername').value = '';
    document.getElementById('loginPassword').value = '';
}

function showFamilyModal(familyId) {
    currentFamilyId = familyId;
    document.getElementById('familyModal').classList.remove('hidden');
    resetZoom();
    loadFamilyTree(familyId);
}

function hideFamilyModal() {
    document.getElementById('familyModal').classList.add('hidden');
    currentFamilyId = null;
    familyTree = null;
}

function showAdminPanel() {
    alert('لوحة الإدارة قيد التطوير');
}

function showCreateFamilyModal() {
    const name = prompt('أدخل اسم العائلة:');
    if (name) {
        createFamily(name);
    }
}

function showAddMemberModal() {
    const firstName = prompt('أدخل الاسم الأول:');
    if (!firstName) return;
    
    const lastName = prompt('أدخل اسم العائلة:');
    const birthDate = prompt('تاريخ الميلاد (YYYY-MM-DD):');
    
    // اختيار الأب
    let fatherId = null;
    if (familyTree && familyTree.total_members > 0) {
        const fatherName = prompt('أدخل اسم الأب (اتركه فارغاً إذا كان الجد الأكبر):');
        if (fatherName) {
            // البحث عن الأب في الشجرة
            fatherId = findMemberByName(familyTree.tree, fatherName);
        }
    }
    
    addMember(currentFamilyId, {
        first_name: firstName,
        last_name: lastName,
        father_id: fatherId,
        birth_date: birthDate
    });
}

function findMemberByName(nodes, name) {
    for (const node of nodes) {
        if (node.first_name === name) {
            return node.id;
        }
        if (node.children && node.children.length > 0) {
            const found = findMemberByName(node.children, name);
            if (found) return found;
        }
    }
    return null;
}

// Zoom functions
function zoomIn() {
    zoomLevel = Math.min(zoomLevel + 0.1, 3);
    applyZoom();
}

function zoomOut() {
    zoomLevel = Math.max(zoomLevel - 0.1, 0.3);
    applyZoom();
}

function resetZoom() {
    zoomLevel = 1;
    applyZoom();
}

function applyZoom() {
    const container = document.getElementById('familyTreeContainer');
    const tree = container.querySelector('.tree-root');
    if (tree) {
        tree.style.transform = `scale(${zoomLevel})`;
        tree.style.transformOrigin = 'top center';
    }
}

// API functions
async function loadFamilies() {
    try {
        const response = await axios.get(`${API_BASE}/families`);
        families = response.data;
        renderFamilies();
    } catch (error) {
        console.error('Error loading families:', error);
    }
}

async function loadFamilyTree(familyId) {
    try {
        const [familyRes, treeRes] = await Promise.all([
            axios.get(`${API_BASE}/families/${familyId}`),
            axios.get(`${API_BASE}/families/${familyId}/tree`)
        ]);
        
        const family = familyRes.data;
        familyTree = treeRes.data;
        
        document.getElementById('familyModalTitle').textContent = family.name;
        
        // Show add member button if user has permission
        if (currentUser) {
            document.getElementById('addMemberBtn').classList.remove('hidden');
        }
        
        renderFamilyTree();
    } catch (error) {
        console.error('Error loading family tree:', error);
    }
}

async function createFamily(name) {
    if (!currentUser) {
        alert('يجب تسجيل الدخول أولاً');
        return;
    }
    
    try {
        await axios.post(`${API_BASE}/families`, {
            name: name,
            description: 'شجرة عائلة ' + name
        }, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('authToken')}`
            }
        });
        
        await loadFamilies();
        alert('تم إنشاء العائلة بنجاح');
    } catch (error) {
        alert('فشل إنشاء العائلة');
        console.error('Error creating family:', error);
    }
}

async function addMember(familyId, memberData) {
    if (!currentUser) {
        alert('يجب تسجيل الدخول أولاً');
        return;
    }
    
    try {
        await axios.post(`${API_BASE}/families/${familyId}/members`, memberData, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('authToken')}`
            }
        });
        
        await loadFamilyTree(familyId);
        alert('تم إضافة الفرد بنجاح');
    } catch (error) {
        alert('فشل إضافة الفرد');
        console.error('Error adding member:', error);
    }
}

// Render functions
function renderFamilies() {
    const grid = document.getElementById('familiesGrid');
    
    if (families.length === 0) {
        grid.innerHTML = `
            <div class="col-span-full text-center py-12">
                <i class="fas fa-sitemap text-6xl text-gray-300 mb-4"></i>
                <p class="text-gray-500 text-lg">لا توجد عائلات بعد</p>
            </div>
        `;
        return;
    }
    
    grid.innerHTML = families.map(family => `
        <div class="tree-node bg-white rounded-xl shadow-lg p-6 cursor-pointer hover:shadow-xl" onclick="showFamilyModal(${family.id})">
            <div class="flex items-center mb-4">
                <i class="fas fa-sitemap text-3xl text-blue-600 ml-3"></i>
                <h3 class="text-xl font-bold text-gray-800">${family.name}</h3>
            </div>
            ${family.description ? `<p class="text-gray-600 mb-4">${family.description}</p>` : ''}
            <div class="flex justify-between items-center text-sm text-gray-500">
                <span>
                    <i class="fas fa-calendar ml-1"></i>
                    ${new Date(family.created_at).toLocaleDateString('ar-EG')}
                </span>
                <span class="text-blue-600 hover:text-blue-800">
                    عرض الشجرة
                    <i class="fas fa-arrow-left mr-1"></i>
                </span>
            </div>
        </div>
    `).join('');
}

function renderFamilyTree() {
    const container = document.getElementById('familyTreeContainer');
    
    if (!familyTree || familyTree.tree.length === 0) {
        container.innerHTML = `
            <div class="text-center py-12">
                <i class="fas fa-users text-6xl text-gray-300 mb-4"></i>
                <p class="text-gray-500 text-lg">لا يوجد أفراد في هذه العائلة بعد</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = `
        <div class="tree-root" style="min-width: max-content;">
            ${familyTree.tree.map(root => renderTreeNode(root)).join('')}
        </div>
    `;
    
    applyZoom();
}

function renderTreeNode(node, level = 0) {
    const hasChildren = node.children && node.children.length > 0;
    const age = calculateAge(node.birth_date, node.death_date);
    const isAlive = !node.death_date;
    
    return `
        <div class="tree-node-wrapper" style="margin-right: ${level * 40}px;">
            <div class="flex items-start mb-4">
                ${level > 0 ? '<div class="tree-line"></div>' : ''}
                <div class="member-card bg-white rounded-lg shadow-md p-4 hover:shadow-lg transition ${isAlive ? 'border-r-4 border-blue-500' : 'border-r-4 border-gray-400'}">
                    <div class="flex items-center gap-3">
                        <div class="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                            <i class="fas fa-male text-2xl text-blue-600"></i>
                        </div>
                        <div>
                            <h4 class="font-bold text-gray-800 text-lg">${node.first_name} ${node.last_name || ''}</h4>
                            ${node.birth_date ? `
                                <p class="text-sm text-gray-600">
                                    <i class="fas fa-birthday-cake ml-1"></i>
                                    ${node.birth_date}
                                    ${age ? `<span class="mr-2">(${age} ${isAlive ? 'سنة' : 'سنة عند الوفاة'})</span>` : ''}
                                </p>
                            ` : ''}
                            ${node.death_date ? `
                                <p class="text-sm text-red-600">
                                    <i class="fas fa-cross ml-1"></i>
                                    ${node.death_date}
                                </p>
                            ` : ''}
                            ${node.bio ? `<p class="text-sm text-gray-600 mt-1">${node.bio}</p>` : ''}
                            <p class="text-xs text-gray-500 mt-1">الجيل ${node.generation + 1}</p>
                        </div>
                    </div>
                    ${hasChildren ? `
                        <div class="mt-2 text-sm text-blue-600">
                            <i class="fas fa-users ml-1"></i>
                            ${node.children.length} ${node.children.length === 1 ? 'ابن' : 'أبناء'}
                        </div>
                    ` : ''}
                </div>
            </div>
            ${hasChildren ? `
                <div class="children-container">
                    ${node.children.map(child => renderTreeNode(child, level + 1)).join('')}
                </div>
            ` : ''}
        </div>
    `;
}

function calculateAge(birthDate, deathDate) {
    if (!birthDate) return null;
    
    const birth = new Date(birthDate);
    const end = deathDate ? new Date(deathDate) : new Date();
    
    let age = end.getFullYear() - birth.getFullYear();
    const monthDiff = end.getMonth() - birth.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && end.getDate() < birth.getDate())) {
        age--;
    }
    
    return age;
}
