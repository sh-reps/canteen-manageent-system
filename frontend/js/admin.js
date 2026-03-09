const API_BASE = "http://127.0.0.1:8000";


async function deleteUser(admissionNo) {
    if (!confirm(`Are you sure you want to delete user ${admissionNo}?`)) return;

    try {
        const response = await fetch(`${API_BASE}/users/${admissionNo}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            alert("User deleted successfully");
            loadUsers(); // Refresh the list
        } else {
            alert("Failed to delete user");
        }
    } catch (err) {
        console.error("Error deleting user:", err);
    }
}

async function completeOrder(orderId) {
    try {
        const response = await fetch(`${API_BASE}/complete-order/${orderId}`, {
            method: 'POST'
        });

        if (response.ok) {
            loadAllOrders(); // Refresh the order list
        } else {
            alert("Failed to update order");
        }
    } catch (err) {
        console.error("Error completing order:", err);
    }
}

// Utility to open/close modals
function openModal(id) { document.getElementById(id).style.display = 'flex'; }
function closeModal(id) { document.getElementById(id).style.display = 'none'; }

// Save New User
async function saveUser() {
    const admission_no = document.getElementById('new-user-id').value;
    const password = document.getElementById('new-user-pass').value;
    const role = document.getElementById('new-user-role').value;

    const response = await fetch(`${API_BASE}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ admission_no, password, role })
    });

    if (response.ok) {
        closeModal('user-modal');
        loadUsers();
    } else {
        alert("Error adding user.");
    }
}


async function saveFood() {
    const adminStock = parseInt(document.getElementById('admin-stock-input').value);
    const mealType = document.getElementById('food-meal-type').value;

    // Logic: Breakfast starts with 10% Walk-in, Lunch starts all Pre-book
    let prebook = adminStock;
    let walkin = 0;

    if (mealType === 'breakfast') {
        prebook = Math.floor(adminStock * 0.9);
        walkin = adminStock - prebook;
    }

    const payload = {
        name: document.getElementById('food-name').value,
        price_full: parseInt(document.getElementById('food-price').value),
        category: document.getElementById('food-category').value,
        meal_type: mealType,
        admin_base_stock: adminStock, // The starting number
        prebook_pool: prebook,
        walkin_pool: walkin,
        is_walkin_only: document.getElementById('food-category').value === 'snack'
    };

    const response = await fetch(`${API_BASE}/food-items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (response.ok) {
        closeModal('menu-modal');
        loadAdminMenu();
    }
}

// Move this OUTSIDE any listeners so the HTML can "see" it
function showSection(sectionId) {
    console.log("Switching to section:", sectionId);
    
    // 1. Hide all sections
    document.querySelectorAll('.admin-section').forEach(s => s.style.display = 'none');
    
    // 2. Show targeted section
    const activeSection = document.getElementById(`section-${sectionId}`);
    if (activeSection) activeSection.style.display = 'block';

    // 3. Update Sidebar UI
    document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
    const activeNav = document.getElementById(`nav-${sectionId}`);
    if (activeNav) activeNav.classList.add('active');

    // 4. Load Data
    if (sectionId === 'orders') loadAllOrders();
    if (sectionId === 'users') loadUsers();
    if (sectionId === 'menu') loadAdminMenu();
}

document.addEventListener('DOMContentLoaded', () => {
    // Initial call once the script loads
    showSection('orders'); 
});

// --- Existing logic for orders and users ---
async function loadAllOrders() {
    const tbody = document.getElementById('admin-orders-body');
    if (!tbody) return;
    try {
        const response = await fetch(`${API_BASE}/all-bookings`);
        const orders = await response.json();
        tbody.innerHTML = orders.map(order => `
            <tr>
                <td>${order.scheduled_slot}</td>
                <td>${order.user_id}</td>
                <td>${order.items.map(i => i.food_item.name).join(", ")}</td>
                <td><button class="btn-action" onclick="completeOrder(${order.id})">Collected</button></td>
            </tr>
        `).join('');
    } catch (err) { console.error(err); }
}

async function loadUsers() {
    const tbody = document.getElementById('admin-users-body');
    if (!tbody) return;
    try {
        const response = await fetch(`${API_BASE}/users`);
        const users = await response.json();
        tbody.innerHTML = users.map(u => `
            <tr>
                <td>${u.admission_no}</td>
                <td>${u.role}</td>
                <td><button class="btn-danger" onclick="deleteUser('${u.admission_no}')">Delete</button></td>
            </tr>
        `).join('');
    } catch (err) { console.error(err); }
}

// admin.js additions
async function loadAdminMenu() {
    const container = document.getElementById('admin-menu-list');
    if (!container) return;

    try {
        const response = await fetch(`${API_BASE}/food-items`);
        const items = await response.json();
        
        const itemHtml = items.map(item => `
            <div class="menu-item-card">
                <h4>${item.name}</h4>
                <p class="item-category">${item.category} | ${item.meal_type}</p>
                <div class="stock-info">
                    <div class="stock-row">
                        <span class="label">Base Stock:</span>
                        <span class="value">${item.admin_base_stock || 0}</span>
                    </div>
                    <div class="stock-row">
                        <span class="label">Pre-book:</span>
                        <span class="value">${item.prebook_pool || 0}</span>
                    </div>
                    <div class="stock-row">
                        <span class="label">Walk-in:</span>
                        <span class="value">${item.walkin_pool || 0}</span>
                    </div>
                </div>
                <button class="btn-action" onclick="openEditStockModal(${item.id}, ${item.admin_base_stock || 0})">
                    <i class="fas fa-edit"></i> Edit Stock
                </button>
            </div>
        `).join('');
        
        container.innerHTML = itemHtml;
    } catch (err) { console.error("Menu load failed", err); }
}

async function deleteFood(id) {
    if (confirm("Are you sure you want to remove this item?")) {
        await fetch(`${API_BASE}/food-items/${id}`, { method: 'DELETE' });
        loadAdminMenu();
    }
}

// Debugging Utilities for Stock Logic

async function triggerLogic(timePoint) {
    // Sends a request to the backend to force a rollover logic check
    try {
        const response = await fetch(`${API_BASE}/admin/trigger-logic/${timePoint}`, { method: 'POST' });
        if (response.ok) {
            const data = await response.json();
            alert(`✅ ${data.message}`);
            loadAllOrders();
            loadAdminMenu();
        } else {
            alert(`❌ Error executing ${timePoint} logic`);
        }
    } catch (error) {
        console.error(`Error triggering ${timePoint}:`, error);
        alert(`❌ Network error: ${error.message}`);
    }
}

function setMockTime() {
    const time = document.getElementById('test-time').value;
    if (!time) {
        alert('Please select a time');
        return;
    }
    localStorage.setItem('mock_system_time', time);
    document.getElementById('mock-time-display').innerText = time || 'Real Time';
    alert(`✅ System time set to ${time}`);
    // Your frontend logic will now check this localStorage value instead of new Date()
}

//walk in edit
async function updateWalkinStock(foodId, newAmount) {
    // Allows admin to manually sync physical sales to the app
    await fetch(`${API_BASE}/food-items/${foodId}/stock`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walkin_pool: newAmount })
    });
    loadAdminMenu();
}

//stock edit

function openEditStockModal(id, base, pre, walk) {
    document.getElementById('edit-food-id').value = id;
    document.getElementById('edit-base-stock').value = base;
    openModal('edit-stock-modal');
}

async function saveStockEdit() {
    const foodId = document.getElementById('edit-food-id').value;
    
    // Construct the payload based on the StockUpdate schema
    const payload = {
        admin_base_stock: parseInt(document.getElementById('edit-base-stock').value)
    };

    try {
        const response = await fetch(`${API_BASE}/food-items/${foodId}/stock`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            closeModal('edit-stock-modal');
            loadAdminMenu(); // Refresh the grid to show new numbers
        } else {
            console.error("Supabase Update Failed");
        }
    } catch (error) {
        console.error("Network error during stock update:", error);
    }
}