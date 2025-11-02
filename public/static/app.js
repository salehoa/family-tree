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

function showAdminPanel() {
    alert('لوحة الإدارة قيد التطوير');
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
    const formData = new FormData();
    formData.append('photo', file);
    
    try {
        // Convert file to base64
        const reader = new FileReader();
        reader.onload = async (e) => {
            const base64 = e.target.result;
            
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
        };
        reader.readAsDataURL(file);
    } catch (error) {
        alert('فشل تحميل الصورة');
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
