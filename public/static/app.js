// Global state
let currentUser = null;
let currentFamilyId = null;
let families = [];
let members = [];
let relationships = [];

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
    loadFamilyDetails(familyId);
}

function hideFamilyModal() {
    document.getElementById('familyModal').classList.add('hidden');
    currentFamilyId = null;
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
    const gender = prompt('الجنس (male/female):');
    const birthDate = prompt('تاريخ الميلاد (YYYY-MM-DD):');
    
    addMember(currentFamilyId, {
        first_name: firstName,
        last_name: lastName,
        gender: gender,
        birth_date: birthDate
    });
}

// API functions
async function loadFamilies() {
    try {
        const response = await axios.get(`${API_BASE}/families`);
        families = response.data;
        renderFamilies();
        
        // Load families for search dropdown
        const familySelect = document.getElementById('familySelect');
        familySelect.innerHTML = '<option value="">اختر العائلة</option>';
        families.forEach(family => {
            const option = document.createElement('option');
            option.value = family.id;
            option.textContent = family.name;
            familySelect.appendChild(option);
        });
    } catch (error) {
        console.error('Error loading families:', error);
    }
}

async function loadFamilyDetails(familyId) {
    try {
        const [familyRes, membersRes, relationsRes] = await Promise.all([
            axios.get(`${API_BASE}/families/${familyId}`),
            axios.get(`${API_BASE}/families/${familyId}/members`),
            axios.get(`${API_BASE}/families/${familyId}/relationships`)
        ]);
        
        const family = familyRes.data;
        members = membersRes.data;
        relationships = relationsRes.data;
        
        document.getElementById('familyModalTitle').textContent = family.name;
        
        // Show add member button if user has permission
        if (currentUser) {
            document.getElementById('addMemberBtn').classList.remove('hidden');
        }
        
        renderFamilyTree();
    } catch (error) {
        console.error('Error loading family details:', error);
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
            description: ''
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
        
        await loadFamilyDetails(familyId);
        alert('تم إضافة الفرد بنجاح');
    } catch (error) {
        alert('فشل إضافة الفرد');
        console.error('Error adding member:', error);
    }
}

async function loadFamilyForSearch() {
    const familyId = document.getElementById('familySelect').value;
    if (!familyId) return;
    
    try {
        const response = await axios.get(`${API_BASE}/families/${familyId}/members`);
        const members = response.data;
        
        const member1Select = document.getElementById('member1Select');
        const member2Select = document.getElementById('member2Select');
        
        member1Select.innerHTML = '<option value="">الشخص الأول</option>';
        member2Select.innerHTML = '<option value="">الشخص الثاني</option>';
        
        members.forEach(member => {
            const option1 = document.createElement('option');
            option1.value = member.id;
            option1.textContent = `${member.first_name} ${member.last_name || ''}`;
            member1Select.appendChild(option1);
            
            const option2 = document.createElement('option');
            option2.value = member.id;
            option2.textContent = `${member.first_name} ${member.last_name || ''}`;
            member2Select.appendChild(option2);
        });
    } catch (error) {
        console.error('Error loading family members:', error);
    }
}

async function findRelationship() {
    const familyId = document.getElementById('familySelect').value;
    const member1Id = document.getElementById('member1Select').value;
    const member2Id = document.getElementById('member2Select').value;
    
    if (!familyId || !member1Id || !member2Id) {
        alert('يرجى اختيار العائلة والشخصين');
        return;
    }
    
    if (member1Id === member2Id) {
        alert('يرجى اختيار شخصين مختلفين');
        return;
    }
    
    try {
        const response = await axios.get(`${API_BASE}/families/${familyId}/find-relationship?member1=${member1Id}&member2=${member2Id}`);
        
        const result = document.getElementById('relationshipResult');
        const text = document.getElementById('relationshipText');
        
        const relationshipNames = {
            'parent': 'والد/والدة',
            'child': 'ابن/ابنة',
            'spouse': 'زوج/زوجة',
            'sibling': 'أخ/أخت'
        };
        
        if (response.data.type === 'direct') {
            text.textContent = `العلاقة: ${relationshipNames[response.data.relationship] || response.data.relationship}`;
        } else {
            text.textContent = 'لم يتم العثور على علاقة مباشرة';
        }
        
        result.classList.remove('hidden');
    } catch (error) {
        alert('فشل البحث عن العلاقة');
        console.error('Error finding relationship:', error);
    }
}

// Render functions
function renderFamilies() {
    const grid = document.getElementById('familiesGrid');
    
    if (families.length === 0) {
        grid.innerHTML = `
            <div class="col-span-full text-center py-12">
                <i class="fas fa-tree text-6xl text-gray-300 mb-4"></i>
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
    
    if (members.length === 0) {
        container.innerHTML = `
            <div class="text-center py-12">
                <i class="fas fa-users text-6xl text-gray-300 mb-4"></i>
                <p class="text-gray-500 text-lg">لا يوجد أفراد في هذه العائلة بعد</p>
            </div>
        `;
        return;
    }
    
    // Simple list view for now
    container.innerHTML = `
        <div class="space-y-4">
            <h3 class="text-xl font-bold text-gray-800 mb-4">أفراد العائلة</h3>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                ${members.map(member => `
                    <div class="bg-white rounded-lg shadow p-4 border-r-4 ${member.gender === 'male' ? 'border-blue-500' : 'border-pink-500'}">
                        <div class="flex items-start">
                            <i class="fas ${member.gender === 'male' ? 'fa-male' : 'fa-female'} text-2xl ${member.gender === 'male' ? 'text-blue-500' : 'text-pink-500'} ml-3"></i>
                            <div class="flex-1">
                                <h4 class="font-bold text-gray-800">${member.first_name} ${member.last_name || ''}</h4>
                                ${member.birth_date ? `
                                    <p class="text-sm text-gray-600">
                                        <i class="fas fa-birthday-cake ml-1"></i>
                                        ${member.birth_date}
                                    </p>
                                ` : ''}
                                ${member.bio ? `<p class="text-sm text-gray-600 mt-2">${member.bio}</p>` : ''}
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
            
            ${relationships.length > 0 ? `
                <h3 class="text-xl font-bold text-gray-800 mt-8 mb-4">العلاقات</h3>
                <div class="space-y-2">
                    ${relationships.map(rel => {
                        const relNames = {
                            'parent': 'والد/والدة',
                            'child': 'ابن/ابنة',
                            'spouse': 'زوج/زوجة',
                            'sibling': 'أخ/أخت'
                        };
                        return `
                            <div class="bg-blue-50 rounded-lg p-3 flex items-center">
                                <i class="fas fa-link text-blue-600 ml-2"></i>
                                <span class="text-gray-700">
                                    <strong>${rel.member_name}</strong>
                                    <span class="text-blue-600 mx-2">${relNames[rel.relationship_type]}</span>
                                    <strong>${rel.related_name}</strong>
                                </span>
                            </div>
                        `;
                    }).join('')}
                </div>
            ` : ''}
        </div>
    `;
}
