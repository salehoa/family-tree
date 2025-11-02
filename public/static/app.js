// Global state
let currentUser = null;
let currentFamilyId = null;
let families = [];
let familyTree = null;
let zoomLevel = 1;
let contextMenuVisible = false;
let selectedMemberId = null;

// Pan & Drag state
let isPanning = false;
let startX = 0;
let startY = 0;
let translateX = 0;
let translateY = 0;

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
    
    // Close context menu on outside click
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.context-menu') && !e.target.closest('.member-card')) {
            hideContextMenu();
        }
    });
    
    // Re-scale tree on window resize
    let resizeTimeout;
    window.addEventListener('resize', () => {
        if (familyTree) {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                autoScaleTree();
            }, 250);
        }
    });
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
    hideContextMenu();
}

async function showAdminPanel() {
    document.getElementById('adminModal').classList.remove('hidden');
    await loadAdminData();
}

function hideAdminPanel() {
    document.getElementById('adminModal').classList.add('hidden');
}

function showCreateFamilyModal() {
    const familyName = prompt('أدخل اسم العائلة:');
    if (!familyName || familyName.trim() === '') {
        return;
    }
    
    const ancestorName = prompt('أدخل اسم الجد الأكبر (الاسم الأول):');
    if (!ancestorName || ancestorName.trim() === '') {
        alert('يجب إدخال اسم الجد الأكبر');
        return;
    }
    
    createFamily(familyName.trim(), ancestorName.trim());
}

// Context menu functions
function showContextMenu(memberId, event) {
    event.stopPropagation();
    event.preventDefault(); // Prevent default touch behavior
    
    if (!currentUser) {
        return;
    }
    
    selectedMemberId = memberId;
    const menu = document.getElementById('contextMenu');
    
    // Get position from touch or mouse event
    const x = event.touches ? event.touches[0].pageX : event.pageX;
    const y = event.touches ? event.touches[0].pageY : event.pageY;
    
    // Position the menu
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';
    
    // Adjust position if menu goes off screen
    setTimeout(() => {
        const menuRect = menu.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        
        if (menuRect.right > viewportWidth) {
            menu.style.left = (viewportWidth - menuRect.width - 10) + 'px';
        }
        
        if (menuRect.bottom > viewportHeight) {
            menu.style.top = (viewportHeight - menuRect.height - 10) + 'px';
        }
    }, 10);
    
    menu.classList.add('show');
    contextMenuVisible = true;
}

function hideContextMenu() {
    const menu = document.getElementById('contextMenu');
    menu.classList.remove('show');
    contextMenuVisible = false;
    selectedMemberId = null;
}

function showAddSonModal() {
    // حفظ معرّف الأب قبل إخفاء القائمة
    const fatherId = selectedMemberId;
    hideContextMenu();
    
    const firstName = prompt('أدخل الاسم الأول للابن:');
    if (!firstName || firstName.trim() === '') {
        return;
    }
    
    addMember(currentFamilyId, {
        first_name: firstName.trim(),
        father_id: fatherId
    });
}

function showUploadPhotoModal() {
    // حفظ معرّف العضو قبل إخفاء القائمة
    const memberId = selectedMemberId;
    hideContextMenu();
    
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (file) {
            await uploadPhoto(memberId, file);
        }
    };
    input.click();
}

async function uploadPhoto(memberId, file) {
    try {
        // Check file size (max 5MB)
        if (file.size > 5 * 1024 * 1024) {
            alert('حجم الصورة كبير جداً. الحد الأقصى 5 ميجابايت');
            return;
        }
        
        // Create image element to compress
        const img = new Image();
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        // Read file as data URL
        const reader = new FileReader();
        reader.onload = (e) => {
            img.onload = async () => {
                // Calculate new dimensions (max 800px)
                let width = img.width;
                let height = img.height;
                const maxSize = 800;
                
                if (width > maxSize || height > maxSize) {
                    if (width > height) {
                        height = (height / width) * maxSize;
                        width = maxSize;
                    } else {
                        width = (width / height) * maxSize;
                        height = maxSize;
                    }
                }
                
                // Set canvas size and draw image
                canvas.width = width;
                canvas.height = height;
                ctx.drawImage(img, 0, 0, width, height);
                
                // Convert to base64 (JPEG with 0.8 quality)
                const base64 = canvas.toDataURL('image/jpeg', 0.8);
                
                try {
                    // Update member with photo URL
                    await axios.put(
                        `${API_BASE}/families/${currentFamilyId}/members/${memberId}`,
                        {
                            photo_url: base64
                        },
                        {
                            headers: {
                                'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
                                'Content-Type': 'application/json'
                            }
                        }
                    );
                    
                    // Reload tree
                    await loadFamilyTree(currentFamilyId);
                    alert('تم تحميل الصورة بنجاح');
                } catch (error) {
                    alert('فشل تحميل الصورة. حاول مرة أخرى.');
                    console.error('Upload error:', error);
                }
            };
            
            img.onerror = () => {
                alert('فشل قراءة الصورة. تأكد من أن الملف صورة صحيحة.');
            };
            
            img.src = e.target.result;
        };
        
        reader.onerror = () => {
            alert('فشل قراءة الملف');
        };
        
        reader.readAsDataURL(file);
    } catch (error) {
        alert('حدث خطأ أثناء معالجة الصورة');
        console.error('Upload error:', error);
    }
}

// Delete member function
async function deleteMember() {
    // حفظ معرّف العضو قبل إخفاء القائمة
    const memberId = selectedMemberId;
    hideContextMenu();
    
    // التحقق من تسجيل الدخول
    if (!currentUser) {
        alert('يجب تسجيل الدخول أولاً');
        return;
    }
    
    // تأكيد الحذف
    const confirmed = confirm('هل أنت متأكد من حذف هذا العضو؟\n\nتحذير: سيتم حذف جميع الأبناء والأحفاد المرتبطين به أيضاً!');
    if (!confirmed) {
        return;
    }
    
    try {
        await axios.delete(
            `${API_BASE}/families/${currentFamilyId}/members/${memberId}`,
            {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`
                }
            }
        );
        
        // Reload tree
        await loadFamilyTree(currentFamilyId);
        alert('تم حذف العضو بنجاح');
    } catch (error) {
        alert('فشل حذف العضو. تحقق من الصلاحيات.');
        console.error('Delete error:', error);
    }
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
    resetPan();
    autoScaleTree();
}

function applyZoom() {
    const container = document.getElementById('familyTreeContainer');
    const tree = container.querySelector('.tree-root');
    if (tree) {
        tree.style.transform = `translate(${translateX}px, ${translateY}px) scale(${zoomLevel})`;
        tree.style.transformOrigin = 'center center';
    }
}

// Pan & Drag functions
function startPan(e) {
    // Don't start panning if clicking on a member card or context menu
    if (e.target.closest('.member-card') || e.target.closest('.context-menu')) {
        return;
    }
    
    isPanning = true;
    const container = document.getElementById('familyTreeContainer');
    container.style.cursor = 'grabbing';
    
    // Get the starting position
    if (e.type === 'mousedown') {
        startX = e.clientX - translateX;
        startY = e.clientY - translateY;
    } else if (e.type === 'touchstart') {
        startX = e.touches[0].clientX - translateX;
        startY = e.touches[0].clientY - translateY;
    }
}

function doPan(e) {
    if (!isPanning) return;
    
    e.preventDefault();
    
    let currentX, currentY;
    
    if (e.type === 'mousemove') {
        currentX = e.clientX;
        currentY = e.clientY;
    } else if (e.type === 'touchmove') {
        currentX = e.touches[0].clientX;
        currentY = e.touches[0].clientY;
    }
    
    translateX = currentX - startX;
    translateY = currentY - startY;
    
    applyZoom();
}

function endPan() {
    if (isPanning) {
        isPanning = false;
        const container = document.getElementById('familyTreeContainer');
        container.style.cursor = 'grab';
    }
}

function resetPan() {
    translateX = 0;
    translateY = 0;
    applyZoom();
}

function enablePanning() {
    const container = document.getElementById('familyTreeContainer');
    if (!container) return;
    
    container.style.cursor = 'grab';
    
    // Mouse events
    container.addEventListener('mousedown', startPan);
    container.addEventListener('mousemove', doPan);
    container.addEventListener('mouseup', endPan);
    container.addEventListener('mouseleave', endPan);
    
    // Touch events
    container.addEventListener('touchstart', startPan, { passive: false });
    container.addEventListener('touchmove', doPan, { passive: false });
    container.addEventListener('touchend', endPan);
}

function autoScaleTree() {
    const container = document.getElementById('familyTreeContainer');
    const tree = container.querySelector('.tree-root');
    
    if (!tree) return;
    
    // Reset pan position
    resetPan();
    
    // Reset any existing transformations to measure actual size
    tree.style.transform = 'scale(1)';
    tree.style.transformOrigin = 'center center';
    
    // Force reflow to get accurate measurements
    container.offsetHeight;
    
    // Get dimensions with a small delay to ensure DOM is fully rendered
    setTimeout(() => {
        const containerWidth = container.clientWidth;
        const containerHeight = container.clientHeight;
        const treeWidth = tree.scrollWidth;
        const treeHeight = tree.scrollHeight;
        
        // Responsive padding based on screen size
        const isMobile = window.innerWidth <= 768;
        const isSmallMobile = window.innerWidth <= 480;
        
        let paddingX, paddingY;
        
        if (isSmallMobile) {
            // Extra small screens - minimal padding
            paddingX = 30;
            paddingY = 40;
        } else if (isMobile) {
            // Mobile/tablet - reduced padding
            paddingX = 50;
            paddingY = 60;
        } else {
            // Desktop - standard padding
            paddingX = 100;
            paddingY = 100;
        }
        
        const scaleX = (containerWidth - paddingX) / treeWidth;
        const scaleY = (containerHeight - paddingY) / treeHeight;
        
        // Use the smaller scale to ensure everything fits
        // Allow more aggressive zoom out on mobile (min 0.05 for mobile, 0.1 for desktop)
        const minScale = isMobile ? 0.05 : 0.1;
        const scale = Math.max(Math.min(scaleX, scaleY, 1), minScale);
        
        console.log('Auto-scale:', {
            device: isSmallMobile ? 'small-mobile' : (isMobile ? 'mobile' : 'desktop'),
            containerWidth,
            containerHeight,
            treeWidth,
            treeHeight,
            paddingX,
            paddingY,
            scaleX: scaleX.toFixed(2),
            scaleY: scaleY.toFixed(2),
            finalScale: scale.toFixed(2)
        });
        
        // Apply the scale
        zoomLevel = scale;
        tree.style.transform = `scale(${scale})`;
        tree.style.transformOrigin = 'center center';
    }, 50);
}

// API functions
async function loadFamilies() {
    try {
        let response;
        
        // إذا كان المستخدم مسجل دخول
        if (currentUser) {
            // المديرون يرون جميع العائلات
            if (currentUser.role === 'admin') {
                response = await axios.get(`${API_BASE}/families`);
            } else {
                // المستخدمون العاديون يرون فقط العائلات المسموح لهم بها
                response = await axios.get(`${API_BASE}/families/my`, {
                    headers: {
                        'Authorization': `Bearer ${localStorage.getItem('authToken')}`
                    }
                });
            }
        } else {
            // الزوار يرون جميع العائلات (قراءة فقط)
            response = await axios.get(`${API_BASE}/families`);
        }
        
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
        
        renderFamilyTree();
    } catch (error) {
        console.error('Error loading family tree:', error);
    }
}

async function createFamily(familyName, ancestorName) {
    if (!currentUser) {
        alert('يجب تسجيل الدخول أولاً');
        return;
    }
    
    try {
        // 1. إنشاء العائلة
        const familyResponse = await axios.post(`${API_BASE}/families`, {
            name: familyName,
            description: 'شجرة عائلة ' + familyName
        }, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('authToken')}`
            }
        });
        
        const newFamilyId = familyResponse.data.id;
        
        // 2. إضافة الجد الأكبر كأول عضو في العائلة
        await axios.post(`${API_BASE}/families/${newFamilyId}/members`, {
            first_name: ancestorName,
            father_id: null  // الجد الأكبر ليس له أب
        }, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('authToken')}`
            }
        });
        
        await loadFamilies();
        alert('تم إنشاء العائلة وإضافة الجد الأكبر بنجاح');
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

async function deleteFamily(familyId, familyName) {
    if (!currentUser) {
        alert('يجب تسجيل الدخول أولاً');
        return;
    }
    
    // تأكيد الحذف
    const confirmed = confirm(`هل أنت متأكد من حذف عائلة "${familyName}"؟\n\nتحذير: سيتم حذف جميع أفراد العائلة والبيانات المرتبطة بها بشكل نهائي!`);
    if (!confirmed) {
        return;
    }
    
    try {
        await axios.delete(`${API_BASE}/families/${familyId}`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('authToken')}`
            }
        });
        
        await loadFamilies();
        alert('تم حذف العائلة بنجاح');
    } catch (error) {
        alert('فشل حذف العائلة. تحقق من الصلاحيات.');
        console.error('Error deleting family:', error);
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
        <div class="tree-node bg-white rounded-xl shadow-lg p-6 hover:shadow-xl relative">
            <div class="cursor-pointer" onclick="showFamilyModal(${family.id})">
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
            ${currentUser ? `
                <button 
                    onclick="event.stopPropagation(); deleteFamily(${family.id}, '${family.name.replace(/'/g, "\\'")}')" 
                    class="absolute top-4 left-4 text-red-500 hover:text-red-700 transition-colors"
                    title="حذف العائلة">
                    <i class="fas fa-trash text-lg"></i>
                </button>
            ` : ''}
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
        <div class="tree-root">
            ${familyTree.tree.map(root => renderTreeNode(root)).join('')}
        </div>
        
        <!-- Context Menu -->
        <div id="contextMenu" class="context-menu">
            <div class="context-menu-item" onclick="showAddSonModal()">
                <i class="fas fa-plus"></i>
                <span>إضافة ابن</span>
            </div>
            <div class="context-menu-item" onclick="showUploadPhotoModal()">
                <i class="fas fa-camera"></i>
                <span>تحميل صورة</span>
            </div>
            <div class="context-menu-item danger" onclick="deleteMember()">
                <i class="fas fa-trash"></i>
                <span>حذف</span>
            </div>
        </div>
    `;
    
    // Apply auto-scaling after DOM is fully rendered
    // Use multiple delays to ensure all images and content are loaded
    requestAnimationFrame(() => {
        setTimeout(() => {
            autoScaleTree();
            enablePanning(); // Enable pan & drag functionality
        }, 100);
    });
}

function renderTreeNode(node) {
    const hasChildren = node.children && node.children.length > 0;
    const age = calculateAge(node.birth_date, node.death_date);
    const isAlive = !node.death_date;
    
    return `
        <div class="tree-node-wrapper">
            <div class="member-card ${isAlive ? 'alive' : 'deceased'}" 
                 data-generation="${node.generation}"
                 onclick="showContextMenu(${node.id}, event)"
                 ontouchstart="showContextMenu(${node.id}, event)">
                <div class="member-photo">
                    ${node.photo_url ? 
                        `<img src="${node.photo_url}" alt="${node.first_name}">` :
                        `<i class="fas fa-male"></i>`
                    }
                </div>
                <div class="member-name">${node.first_name}</div>
                <div class="member-info">
                    ${node.birth_date ? `${node.birth_date.substring(0, 4)}` : ''}
                    ${age && isAlive ? ` (${age})` : ''}
                    ${!isAlive && node.death_date ? `<br>† ${node.death_date.substring(0, 4)}` : ''}
                </div>
                <div class="member-generation">الجيل ${node.generation + 1}</div>
                ${hasChildren ? `<div class="children-count">${node.children.length}</div>` : ''}
            </div>
            
            ${hasChildren ? `
                <div class="children-container">
                    ${node.children.map(child => renderTreeNode(child)).join('')}
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

// ==================== Admin Panel Functions ====================

let allUsers = [];
let allFamiliesForAdmin = [];
let userPermissions = {};

async function loadAdminData() {
    try {
        // Load all users
        const usersResponse = await axios.get(`${API_BASE}/admin/users`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` }
        });
        allUsers = usersResponse.data;
        
        // Load all families
        const familiesResponse = await axios.get(`${API_BASE}/families`);
        allFamiliesForAdmin = familiesResponse.data;
        
        // Load permissions for all users
        for (const user of allUsers) {
            const permsResponse = await axios.get(`${API_BASE}/admin/users/${user.id}/permissions`, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` }
            });
            userPermissions[user.id] = permsResponse.data;
        }
        
        renderAdminPanel();
    } catch (error) {
        console.error('Error loading admin data:', error);
        alert('فشل تحميل بيانات الإدارة');
    }
}

function renderAdminPanel() {
    const container = document.getElementById('adminContent');
    
    container.innerHTML = `
        <div class="mb-6">
            <button onclick="showAddUserForm()" class="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
                <i class="fas fa-user-plus mr-2"></i>
                إضافة مستخدم جديد
            </button>
        </div>
        
        <div class="space-y-4">
            ${allUsers.map(user => renderUserCard(user)).join('')}
        </div>
    `;
}

function renderUserCard(user) {
    const permissions = userPermissions[user.id] || [];
    const isAdmin = user.role === 'admin';
    
    return `
        <div class="bg-white rounded-lg shadow-md p-4 border border-gray-200">
            <div class="flex justify-between items-start mb-3">
                <div class="flex-1">
                    <div class="flex items-center gap-3 mb-2">
                        <h3 class="text-lg font-bold text-gray-800">
                            <i class="fas fa-user text-blue-600 mr-2"></i>
                            ${user.username}
                        </h3>
                        ${isAdmin ? '<span class="bg-red-100 text-red-800 text-xs px-2 py-1 rounded">مدير</span>' : '<span class="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded">مستخدم</span>'}
                    </div>
                    <p class="text-sm text-gray-600">معرّف: ${user.id}</p>
                </div>
                
                ${!isAdmin ? `
                    <div class="flex gap-2">
                        <button onclick="showEditUserForm(${user.id})" class="text-blue-600 hover:text-blue-800 px-3 py-1 rounded hover:bg-blue-50" title="تعديل">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button onclick="deleteUser(${user.id}, '${user.username}')" class="text-red-600 hover:text-red-800 px-3 py-1 rounded hover:bg-red-50" title="حذف">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                ` : ''}
            </div>
            
            ${!isAdmin ? `
                <div class="mt-4 pt-4 border-t border-gray-200">
                    <div class="flex justify-between items-center mb-3">
                        <h4 class="text-sm font-semibold text-gray-700">
                            <i class="fas fa-sitemap text-green-600 mr-1"></i>
                            العوائل المسموح بتعديلها (${permissions.length})
                        </h4>
                        <button onclick="showManagePermissions(${user.id}, '${user.username}')" class="text-green-600 hover:text-green-800 text-sm px-3 py-1 rounded hover:bg-green-50">
                            <i class="fas fa-cog mr-1"></i>
                            إدارة الصلاحيات
                        </button>
                    </div>
                    
                    ${permissions.length > 0 ? `
                        <div class="flex flex-wrap gap-2">
                            ${permissions.map(perm => `
                                <span class="bg-green-100 text-green-800 text-xs px-3 py-1 rounded-full">
                                    ${perm.family_name}
                                </span>
                            `).join('')}
                        </div>
                    ` : '<p class="text-sm text-gray-500 italic">لا توجد صلاحيات حالياً</p>'}
                </div>
            ` : '<p class="text-sm text-gray-500 italic mt-3">المدير لديه صلاحيات كاملة على جميع العوائل</p>'}
        </div>
    `;
}

function showAddUserForm() {
    const username = prompt('أدخل اسم المستخدم:');
    if (!username || username.trim() === '') return;
    
    const password = prompt('أدخل كلمة المرور:');
    if (!password || password.trim() === '') return;
    
    const isAdmin = confirm('هل تريد جعل هذا المستخدم مديراً؟\n(اضغط OK للمدير، أو Cancel للمستخدم العادي)');
    
    createUser(username.trim(), password.trim(), isAdmin ? 'admin' : 'user');
}

async function createUser(username, password, role) {
    try {
        const response = await axios.post(`${API_BASE}/admin/users`, {
            username,
            password,
            role
        }, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` }
        });
        
        console.log('User created successfully:', response.data);
        alert('تم إنشاء المستخدم بنجاح');
        await loadAdminData();
    } catch (error) {
        console.error('Error creating user:', error);
        console.error('Error details:', error.response?.data);
        console.error('Error status:', error.response?.status);
        
        let errorMessage = 'فشل إنشاء المستخدم.';
        if (error.response?.status === 409 || error.response?.data?.error?.includes('UNIQUE')) {
            errorMessage = 'اسم المستخدم موجود بالفعل. الرجاء اختيار اسم آخر.';
        } else if (error.response?.data?.error) {
            errorMessage = `خطأ: ${error.response.data.error}`;
        }
        
        alert(errorMessage);
    }
}

function showEditUserForm(userId) {
    const user = allUsers.find(u => u.id === userId);
    if (!user) return;
    
    const newPassword = prompt(`تعديل كلمة مرور المستخدم: ${user.username}\n\nأدخل كلمة المرور الجديدة:`);
    if (!newPassword || newPassword.trim() === '') return;
    
    updateUserPassword(userId, newPassword.trim());
}

async function updateUserPassword(userId, newPassword) {
    try {
        await axios.put(`${API_BASE}/admin/users/${userId}`, {
            password: newPassword
        }, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` }
        });
        
        alert('تم تحديث كلمة المرور بنجاح');
        await loadAdminData();
    } catch (error) {
        console.error('Error updating user:', error);
        alert('فشل تحديث كلمة المرور');
    }
}

async function deleteUser(userId, username) {
    const confirmed = confirm(`هل أنت متأكد من حذف المستخدم "${username}"؟\n\nسيتم حذف جميع صلاحياته أيضاً.`);
    if (!confirmed) return;
    
    try {
        await axios.delete(`${API_BASE}/admin/users/${userId}`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` }
        });
        
        alert('تم حذف المستخدم بنجاح');
        await loadAdminData();
    } catch (error) {
        console.error('Error deleting user:', error);
        alert('فشل حذف المستخدم');
    }
}

function showManagePermissions(userId, username) {
    const user = allUsers.find(u => u.id === userId);
    if (!user) return;
    
    const permissions = userPermissions[userId] || [];
    const permissionFamilyIds = permissions.map(p => p.family_id);
    
    const container = document.getElementById('adminContent');
    
    container.innerHTML = `
        <div class="mb-6">
            <button onclick="renderAdminPanel()" class="text-blue-600 hover:text-blue-800 mb-4">
                <i class="fas fa-arrow-right mr-2"></i>
                رجوع إلى قائمة المستخدمين
            </button>
            
            <h3 class="text-xl font-bold text-gray-800 mb-2">
                <i class="fas fa-cog text-green-600 mr-2"></i>
                إدارة صلاحيات: ${username}
            </h3>
            <p class="text-sm text-gray-600 mb-4">
                اختر العوائل التي يمكن لهذا المستخدم تعديلها
            </p>
        </div>
        
        <div class="space-y-3">
            ${allFamiliesForAdmin.map(family => {
                const hasPermission = permissionFamilyIds.includes(family.id);
                return `
                    <div class="bg-white rounded-lg shadow-sm p-4 border ${hasPermission ? 'border-green-500 bg-green-50' : 'border-gray-200'} flex justify-between items-center">
                        <div class="flex items-center gap-3">
                            <i class="fas fa-sitemap ${hasPermission ? 'text-green-600' : 'text-gray-400'}"></i>
                            <span class="font-medium ${hasPermission ? 'text-green-800' : 'text-gray-800'}">${family.name}</span>
                        </div>
                        
                        ${hasPermission ? `
                            <button onclick="removePermission(${userId}, ${family.id}, '${username}')" class="bg-red-500 text-white px-4 py-2 rounded-lg hover:bg-red-600 text-sm">
                                <i class="fas fa-times mr-1"></i>
                                إزالة الصلاحية
                            </button>
                        ` : `
                            <button onclick="addPermission(${userId}, ${family.id}, '${username}')" class="bg-green-500 text-white px-4 py-2 rounded-lg hover:bg-green-600 text-sm">
                                <i class="fas fa-plus mr-1"></i>
                                منح الصلاحية
                            </button>
                        `}
                    </div>
                `;
            }).join('')}
        </div>
        
        ${allFamiliesForAdmin.length === 0 ? '<p class="text-center text-gray-500 mt-8">لا توجد عوائل متاحة</p>' : ''}
    `;
}

async function addPermission(userId, familyId, username) {
    try {
        await axios.post(`${API_BASE}/admin/permissions`, {
            user_id: userId,
            family_id: familyId,
            can_edit: true
        }, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` }
        });
        
        // Reload permissions for this user
        const permsResponse = await axios.get(`${API_BASE}/admin/users/${userId}/permissions`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` }
        });
        userPermissions[userId] = permsResponse.data;
        
        // Re-render the permissions page
        showManagePermissions(userId, username);
    } catch (error) {
        console.error('Error adding permission:', error);
        alert('فشل منح الصلاحية');
    }
}

async function removePermission(userId, familyId, username) {
    try {
        await axios.delete(`${API_BASE}/admin/permissions/${userId}/${familyId}`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` }
        });
        
        // Reload permissions for this user
        const permsResponse = await axios.get(`${API_BASE}/admin/users/${userId}/permissions`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` }
        });
        userPermissions[userId] = permsResponse.data;
        
        // Re-render the permissions page
        showManagePermissions(userId, username);
    } catch (error) {
        console.error('Error removing permission:', error);
        alert('فشل إزالة الصلاحية');
    }
}
