var API_BASE = "http://127.0.0.1:8000";


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
    const emailEl = document.getElementById('new-user-email'); // Optional if you add it to the HTML modal
    
    const payload = { admission_no, password, role };
    if (emailEl && emailEl.value.trim() !== "") {
        payload.email = emailEl.value.trim();
    }

    const response = await fetch(`${API_BASE}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (response.ok) {
        closeModal('user-modal');
        loadUsers();
    } else {
        alert("Error adding user.");
    }
}


async function saveFood() {
    const idField = document.getElementById('edit-food-item-id');
    const id = idField ? idField.value : null;

    const has_portions = document.getElementById('food-has-portions').checked;
    const is_countable = document.getElementById('food-is-countable').checked;

    const payload = {
        name: document.getElementById('food-name').value,
        price_full: parseInt(document.getElementById('food-price').value),
        category: document.getElementById('food-category').value,
        meal_type: document.getElementById('food-meal-type').value,
        has_portions: has_portions,
        is_countable: is_countable
    };

    let url = `${API_BASE}/food-items`;
    let method = 'POST';

    if (id) {
        url = `${API_BASE}/api/food-items/${id}`;
        method = 'PATCH';
    }

    const response = await fetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (response.ok) {
        closeModal('menu-modal');
        loadFoodCatalog();
    } else {
        alert("Error saving menu item.");
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
    if (sectionId === 'menu') loadFoodCatalog();
    if (sectionId === 'stock') loadDailyStock();
    if (sectionId === 'holidays') loadHolidays();
}

document.addEventListener('DOMContentLoaded', () => {
    // Initial call once the script loads
    showSection('orders'); 

    // Auto-refresh orders when the date input changes
    const ordersDateInput = document.getElementById('admin-orders-date');
    if (ordersDateInput) {
        ordersDateInput.addEventListener('change', loadAllOrders);
    }
});

// --- Existing logic for orders and users ---
async function loadAllOrders() {
    const tbody = document.getElementById('admin-orders-body');
    if (!tbody) return;
    const dateInput = document.getElementById('admin-orders-date');
    
    if (dateInput && !dateInput.value) {
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        dateInput.value = `${yyyy}-${mm}-${dd}`;
    }

    let dateParam = '';
    if (dateInput && dateInput.value) {
        dateParam = `?date=${dateInput.value}`;
    }
    try {
        const response = await fetch(`${API_BASE}/all-bookings${dateParam}`, {
            method: 'GET',
            cache: 'no-store', // Prevent browser caching of previous empty responses
            headers: { 'Cache-Control': 'no-cache' }
        });
        
        if (!response.ok) throw new Error("Server error fetching orders");
        const orders = await response.json();
        
        if (!Array.isArray(orders) || orders.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align: center;">No orders found for this date.</td></tr>';
            return;
        }
        
        tbody.innerHTML = orders.map(order => `
            <tr>
                <td>${order.scheduled_slot}</td>
                <td>${order.user_id}</td>
                <td>${order.items && order.items.length > 0 ? order.items.map(i => i.food_item ? i.food_item.name : 'Unknown/Deleted Item').join(", ") : 'No items'}</td>
                <td>
                    ${order.status === 'collected' 
                        ? '<span style="color: #2ecc71; font-weight: bold;">Collected</span>' 
                        : `<button class="btn-action" onclick="completeOrder(${order.id})">Mark Collected</button>`}
                </td>
            </tr>
        `).join('');
    } catch (err) { 
        console.error("Error loading orders:", err); 
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: red;">Failed to load orders.</td></tr>';
    }
}

async function loadUsers() {
    const tbody = document.getElementById('admin-users-body');
    if (!tbody) return; 
    
    // Auto-inject the missing 'Email' header into the HTML table
    const table = tbody.closest('table');
    if (table) {
        const theadTr = table.querySelector('thead tr');
        if (theadTr && theadTr.children.length === 3) {
            const emailTh = document.createElement('th');
            emailTh.textContent = 'Email';
            theadTr.insertBefore(emailTh, theadTr.children[2]);
        }
    }

    tbody.innerHTML = '<tr><td colspan="4" style="text-align: center;">Loading users...</td></tr>';

    try {
        const response = await fetch(`${API_BASE}/users`, {
            method: 'GET',
            cache: 'no-store',
            headers: { 'Cache-Control': 'no-cache' }
        });

        if (!response.ok) throw new Error("Server error fetching users");
        const users = await response.json();

        if (!Array.isArray(users) || users.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align: center;">No users found.</td></tr>';
            return;
        }

        tbody.innerHTML = users.map(u => {
            const emailDisplay = u.email 
                ? `<a href="mailto:${u.email}" class="user-email-link">${u.email}</a>` 
                : '<span style="color: #888; font-style: italic;">Not Set</span>';

            return `
            <tr>
                <td><span class="user-id">${u.admission_no}</span></td>
                <td><span class="user-role">${u.role}</span></td>
                <td>${emailDisplay}</td>
                <td>
                    <button class="btn-action" onclick="editUserEmail('${u.admission_no}', '${u.email || ''}')">Edit Email</button>
                    <button class="btn-danger" onclick="deleteUser('${u.admission_no}')">Delete</button>
                </td>
            </tr>`;
        }).join('');
    } catch (err) { 
        console.error("Error loading users:", err); 
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: red;">Failed to load users.</td></tr>';
    }
}

async function editUserEmail(admissionNo, currentEmail) {
    const newEmail = prompt(`Enter new email for ${admissionNo}:`, currentEmail);
    if (newEmail === null) return; // User cancelled the prompt

    try {
        const response = await fetch(`${API_BASE}/users/${admissionNo}/email`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: newEmail })
        });

        if (response.ok) {
            loadUsers(); // Refresh the list
        } else {
            alert("Failed to update email.");
        }
    } catch (err) {
        console.error("Error updating email:", err);
    }
}

// --- MENU CATALOG MANAGEMENT ---
function openFoodModal(id = null, name = '', price = '', category = 'meal', meal_type = 'breakfast', has_portions = false, is_countable = false) {
    // Dynamically inject hidden ID field if missing
    let idField = document.getElementById('edit-food-item-id');
    if (!idField) {
        idField = document.createElement('input');
        idField.type = 'hidden';
        idField.id = 'edit-food-item-id';
        document.getElementById('food-name').parentNode.appendChild(idField);
    }

    // Dynamically inject portion checkbox if missing
    let portionsContainer = document.getElementById('food-portions-container');
    if (!portionsContainer) {
        portionsContainer = document.createElement('div');
        portionsContainer.id = 'food-portions-container';
        portionsContainer.className = 'form-group';
        portionsContainer.innerHTML = `<label><input type="checkbox" id="food-has-portions"> Has Portions (Half/Full)</label>`;
        document.getElementById('food-meal-type').parentNode.after(portionsContainer);
    }

    // Dynamically inject countable checkbox if missing
    let countableContainer = document.getElementById('food-countable-container');
    if (!countableContainer) {
        countableContainer = document.createElement('div');
        countableContainer.id = 'food-countable-container';
        countableContainer.className = 'form-group';
        countableContainer.innerHTML = `<label style="display: flex; align-items: center;"><input type="checkbox" id="food-is-countable" style="width: auto; margin-right: 10px;"> Is Countable (e.g. Appam)</label>`;
        portionsContainer.after(countableContainer);
    }
    
    // Hide the old "base stock" input from the menu modal, as stock is now managed separately
    const stockInputGrp = document.getElementById('admin-stock-input')?.closest('.form-group');
    if (stockInputGrp) stockInputGrp.style.display = 'none';

    idField.value = id || '';
    document.getElementById('food-name').value = name;
    document.getElementById('food-price').value = price;
    document.getElementById('food-category').value = category;
    document.getElementById('food-meal-type').value = meal_type;
    document.getElementById('food-has-portions').checked = has_portions;
    document.getElementById('food-is-countable').checked = is_countable;

    openModal('menu-modal');
}

async function loadFoodCatalog() {
    const container = document.getElementById('admin-menu-list');
    if (!container) return;
    
    let html = `<button class="btn-action" style="margin-bottom:15px;" onclick="openFoodModal()">+ Add New Menu Item</button>`;
    
    try {
        const response = await fetch(`${API_BASE}/food-items`);
        const items = await response.json();
        
        html += items.map(item => `
        <div class="menu-item-card">
            <h4>${item.name}</h4>
            <p class="item-category">${item.category} | ${item.meal_type}</p>
            <p class="item-category" style="font-weight: bold;">
                Price: ₹${item.price_full} | 
                Portions: ${item.has_portions ? 'Yes' : 'No'} |
                Countable: ${item.is_countable ? 'Yes' : 'No'}
            </p>
            <div style="margin-top: 10px;">
                <button class="btn-action" onclick="openFoodModal(${item.id}, '${item.name.replace(/'/g, "\\'")}', ${item.price_full}, '${item.category}', '${item.meal_type}', ${item.has_portions}, ${item.is_countable})">
                    <i class="fas fa-edit"></i> Edit Details
                </button>
                <button class="btn-danger" onclick="deleteFood(${item.id})">
                    <i class="fas fa-trash"></i> Delete
                </button>
            </div>
        </div>`).join('');
        
        container.innerHTML = html;
    } catch (err) { console.error("Catalog load failed", err); }
}

// --- DAILY STOCK MANAGEMENT ---
async function loadDailyStock() {
    // Fallback to menu container if HTML hasn't been updated with a dedicated stock container yet
    const container = document.getElementById('admin-stock-list') || document.getElementById('admin-menu-list');
    if (!container) return;
    
    const dayInput = document.getElementById('admin-stock-day');
    let dayParam = '';
    if (dayInput && dayInput.value) {
        dayParam = `?day=${dayInput.value}`;
    }
    try {
        const response = await fetch(`${API_BASE}/food-items${dayParam}`);
        const items = await response.json();

        // Add lock base stock button (for 4pm)
        let lockBtnHtml = `<button class="btn-action" style="margin-bottom:10px;" onclick="lockBreakfastBaseStock()">Lock Breakfast Base Stock (4pm)</button>`;

        const itemHtml = items.map(item => {
            return `
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
                <button class="btn-action" onclick="openEditStockModal(${item.id}, '${item.meal_type}', ${item.admin_base_stock || 0}, ${item.prebook_pool || 0}, ${item.walkin_pool || 0})">
                    <i class="fas fa-edit"></i> Edit Stock
                </button>
            </div>`;
        }).join('');

        container.innerHTML = lockBtnHtml + itemHtml;
    } catch (err) { console.error("Menu load failed", err); }
}
// Lock breakfast base stock at 4pm
async function lockBreakfastBaseStock() {
    if (!confirm('Lock base stock for all breakfast items for tomorrow?')) return;
    try {
        const response = await fetch(`${API_BASE}/admin/lock-breakfast-base-stock`, { method: 'POST' });
        if (response.ok) {
            alert('✅ Base stock locked for breakfast items for tomorrow.');
            loadDailyStock();
        } else {
            alert('❌ Failed to lock base stock.');
        }
    } catch (err) {
        alert('❌ Network error.');
    }
}

// Set buffer for breakfast item for tomorrow
async function setBreakfastBuffer(foodId) {
    const bufferVal = parseInt(document.getElementById(`buffer-input-${foodId}`).value) || 0;
    try {
        const response = await fetch(`${API_BASE}/admin/set-breakfast-buffer/${foodId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(bufferVal)
        });
        if (response.ok) {
            alert('✅ Buffer set for breakfast item.');
            loadDailyStock();
        } else {
            alert('❌ Failed to set buffer.');
        }
    } catch (err) {
        alert('❌ Network error.');
    }
}

async function deleteFood(id) {
    if (confirm("Are you sure you want to remove this item?")) {
        await fetch(`${API_BASE}/food-items/${id}`, { method: 'DELETE' });
        loadFoodCatalog();
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
            loadDailyStock();
        } else {
            alert(`❌ Error executing ${timePoint} logic`);
        }
    } catch (error) {
        console.error(`Error triggering ${timePoint}:`, error);
        alert(`❌ Network error: ${error.message}`);
    }
}

async function setMockTime() {
    const time = document.getElementById('test-time').value;
    if (!time) {
        alert('Please select a time');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/api/admin/set-time`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ time: time })
        });

        if (response.ok) {
            document.getElementById('mock-time-display').innerText = time || 'Real Time';
            alert(`✅ System time set to ${time}`);
        } else {
            alert('❌ Failed to set system time.');
        }
    } catch (error) {
        console.error('Error setting mock time:', error);
        alert('❌ An error occurred while setting the time.');
    }
}

async function setMockDate() {
    const date = document.getElementById('test-date').value;
    if (!date) {
        alert('Please select a date');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/api/admin/set-date`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ date: date })
        });

        if (response.ok) {
            document.getElementById('mock-date-display').innerText = date;
            alert(`✅ System date set to ${date}`);
        } else {
            alert('❌ Failed to set system date.');
        }
    } catch (error) {
        console.error('Error setting mock date:', error);
        alert('❌ An error occurred while setting the date.');
    }
}

async function seedFakeOrders() {
    const date = document.getElementById('seed-date').value;
    const meal_type = document.getElementById('seed-meal-type').value;

    if (!date) {
        alert("Please select a date to seed orders.");
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/admin/seed-orders`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ date, meal_type })
        });

        const data = await response.json();
        if (response.ok) {
            alert(`✅ ${data.message}`);
            loadAllOrders(); // Refresh orders grid to show the new fake ones
        } else {
            alert(`❌ Error: ${data.detail}`);
        }
    } catch (error) {
        console.error("Error seeding orders:", error);
        alert("❌ Network error.");
    }
}

//walk in edit
async function updateWalkinStock(foodId, newAmount) {
    // Allows admin to manually sync physical sales to the app
    await fetch(`${API_BASE}/food-items/${foodId}/stock`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walkin_pool: newAmount })
    });
    loadDailyStock();
}

//stock edit

function openEditStockModal(id, meal_type, base, prebook, walkin) {
    document.getElementById('edit-food-id').value = id;
    document.getElementById('edit-base-stock').value = base;
    document.getElementById('edit-prebook-pool').value = prebook;
    document.getElementById('edit-walkin-pool').value = walkin;
    
    openModal('edit-stock-modal');
}

async function saveStockEdit() {
    const foodId = document.getElementById('edit-food-id').value;
    const day = document.getElementById('admin-stock-day').value;
    const admin_base_stock = parseInt(document.getElementById('edit-base-stock').value) || 0;
    const prebook_pool = parseInt(document.getElementById('edit-prebook-pool').value) || 0;
    const walkin_pool = parseInt(document.getElementById('edit-walkin-pool').value) || 0;
    const payload = {
        day: day,
        admin_base_stock: admin_base_stock,
        prebook_pool: prebook_pool,
        walkin_pool: walkin_pool,
        breakfast_buffer: 0
    };
    try {
        const response = await fetch(`${API_BASE}/food-items/${foodId}/stock`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (response.ok) {
            closeModal('edit-stock-modal');
            loadDailyStock(); // Refresh the grid to show new numbers
        } else {
            console.error("Stock Update Failed");
            alert("Failed to update stock.");
        }
    } catch (error) {
        console.error("Network error during stock update:", error);
    }
}

async function loadHolidays() {
    const list = document.getElementById('holiday-list');
    if (!list) return;
    try {
        const response = await fetch(`${API_BASE}/api/holidays`);
        const holidays = await response.json();
        list.innerHTML = holidays.map(h => `
            <li>
                <span>${h.date}</span>
                <button class="btn-danger" onclick="deleteHoliday(${h.id})">
                    <i class="fas fa-trash"></i>
                </button>
            </li>
        `).join('');
    } catch (err) {
        console.error("Failed to load holidays:", err);
    }
}

async function addHoliday() {
    const dateInput = document.getElementById('holiday-date');
    const date = dateInput.value;
    if (!date) return alert("Please select a date");

    try {
        const response = await fetch(`${API_BASE}/api/holidays`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ date })
        });

        if (response.ok) {
            dateInput.value = "";
            loadHolidays();
        } else {
            const err = await response.json();
            alert(err.detail || "Failed to add holiday");
        }
    } catch (err) {
        console.error("Error adding holiday:", err);
    }
}

async function deleteHoliday(id) {
    if (!confirm("Remove this holiday?")) return;
    try {
        await fetch(`${API_BASE}/api/holidays/${id}`, { method: 'DELETE' });
        loadHolidays();
    } catch (err) {
        console.error("Error deleting holiday:", err);
    }
}