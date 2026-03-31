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

async function markOrderNotCollected(orderId) {
    if (!confirm("Mark this order as not collected? This will flag the user.")) {
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/mark-order-not-collected/${orderId}`, {
            method: 'POST'
        });

        if (response.ok) {
            const data = await response.json();
            alert(`Order marked as not collected.\nUser now has ${data.user_flags} flag(s).`);
            loadAllOrders(); // Refresh the order list
        } else {
            const error = await response.json();
            alert("Failed to mark order as not collected: " + (error.detail || "Unknown error"));
        }
    } catch (err) {
        console.error("Error marking order as not collected:", err);
        alert("Error: " + err.message);
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
        price_half: parseInt(document.getElementById('food-price-half')?.value || 0),
        description: document.getElementById('food-description')?.value || '',
        image_url: document.getElementById('food-image-url')?.value || '',
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
    if (sectionId === 'profits') {
        setMonthlyChartStatus('Loading monthly chart...', true, false);
        // Set today's date as default in expense-date field
        const today = new Date().toISOString().split('T')[0];
        const expenseDateInput = document.getElementById('expense-date');
        if (expenseDateInput) expenseDateInput.value = today;
        loadProfitData();
    }
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
                        ? '<span style="color: #2ecc71; font-weight: bold;">✓ Collected</span>' 
                        : order.status === 'not_collected'
                        ? '<span style="color: #e74c3c; font-weight: bold;">✗ Not Collected</span>'
                        : `<button class="btn-action" onclick="completeOrder(${order.id})">Mark Collected</button>
                           <button class="btn-danger" onclick="markOrderNotCollected(${order.id})">Mark Not Collected</button>`}
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
function openFoodModal(item = null) {
    const data = item || { id: null, name: '', price_full: '', price_half: '', category: 'meal', meal_type: 'breakfast', has_portions: false, is_countable: false, description: '', image_url: '' };
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

    let priceHalfContainer = document.getElementById('food-price-half-container');
    if (!priceHalfContainer) {
        const priceInput = document.getElementById('food-price');
        if (priceInput) {
            priceHalfContainer = document.createElement('div');
            priceHalfContainer.id = 'food-price-half-container';
            priceHalfContainer.className = 'form-group';
            priceHalfContainer.innerHTML = `<label>Half Portion Price (₹)</label><input type="number" id="food-price-half" class="form-control" value="0">`;
            priceInput.parentNode.after(priceHalfContainer);
        }
    }

    let detailsContainer = document.getElementById('food-details-container');
    if (!detailsContainer) {
        const categoryInput = document.getElementById('food-category');
        if (categoryInput) {
            detailsContainer = document.createElement('div');
            detailsContainer.id = 'food-details-container';
            detailsContainer.innerHTML = `
                <div class="form-group"><label>Image URL (Optional)</label><input type="text" id="food-image-url" class="form-control" placeholder="https://..."></div>
                <div class="form-group"><label>Description (Optional)</label><textarea id="food-description" class="form-control" rows="2" placeholder="Short description..."></textarea></div>
            `;
            categoryInput.parentNode.before(detailsContainer);
        }
    }
    
    // Hide the old "base stock" input from the menu modal, as stock is now managed separately
    const stockInputGrp = document.getElementById('admin-stock-input')?.closest('.form-group');
    if (stockInputGrp) stockInputGrp.style.display = 'none';

    idField.value = data.id || '';
    document.getElementById('food-name').value = data.name || '';
    document.getElementById('food-price').value = data.price_full || '';
    if(document.getElementById('food-price-half')) document.getElementById('food-price-half').value = data.price_half || 0;
    if(document.getElementById('food-image-url')) document.getElementById('food-image-url').value = data.image_url || '';
    if(document.getElementById('food-description')) document.getElementById('food-description').value = data.description || '';
    document.getElementById('food-category').value = data.category || 'meal';
    document.getElementById('food-meal-type').value = data.meal_type || 'breakfast';
    document.getElementById('food-has-portions').checked = data.has_portions || false;
    document.getElementById('food-is-countable').checked = data.is_countable || false;

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
                Price: ₹${item.price_full} ${item.has_portions ? ` (Half: ₹${item.price_half || 0})` : ''} | 
                Portions: ${item.has_portions ? 'Yes' : 'No'} |
                Countable: ${item.is_countable ? 'Yes' : 'No'}
            </p>
            <div style="margin-top: 10px;">
                <button class="btn-action" onclick='openFoodModal(${JSON.stringify(item).replace(/'/g, "&#39;").replace(/"/g, "&quot;")})'>
                    <i class="fas fa-edit"></i> Edit Details
                </button>
                <button class="btn-confirm" onclick="openReviewsModal(${item.id}, '${item.name}')">
                    <i class="fas fa-star"></i> View Reviews
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
    const container = document.getElementById('admin-stock-list');
    if (!container) return;
    
    const dayInput = document.getElementById('admin-stock-day');
    let dayParam = '';
    if (dayInput && dayInput.value) {
        dayParam = `?day=${dayInput.value}`;
    }
    try {
        const response = await fetch(`${API_BASE}/food-items${dayParam}`);
        const items = await response.json();

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

        container.innerHTML = itemHtml;
    } catch (err) { console.error("Menu load failed", err); }
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
            alert(`✅ System time set to ${time}`);
            if (typeof syncTimeWithServer === 'function') {
                await syncTimeWithServer(); // Force the clock to re-sync immediately
            }
            loadDailyStock();
            loadDailyStock();
            loadDailyStock();
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
            alert(`✅ System date set to ${date}`);
            if (typeof syncTimeWithServer === 'function') {
                await syncTimeWithServer(); // Force the clock to re-sync immediately
            }
        } else {
            alert('❌ Failed to set system date.');
        }
    } catch (error) {
        console.error('Error setting mock date:', error);
        alert('❌ An error occurred while setting the date.');
    }
}

async function setMockDateTime() {
    const date = document.getElementById('test-date').value;
    const time = document.getElementById('test-time').value;
    
    if (!date && !time) {
        alert('Please select a date or time');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/api/admin/set-datetime`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ date: date, time: time })
        });

        if (response.ok) {
            alert(`✅ System clock updated`);
            if (typeof syncTimeWithServer === 'function') {
                await syncTimeWithServer(); // Force the clock to re-sync immediately
            }
            loadDailyStock();
            loadAllOrders();
        } else {
            alert('❌ Failed to update system clock.');
        }
    } catch (error) {
        console.error('Error updating mock clock:', error);
        alert('❌ An error occurred.');
    }
}

async function resetMockTime() {
    if (!confirm("Are you sure you want to reset the system clock to real time?")) {
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/api/admin/reset-time`, {
            method: 'POST'
        });

        if (response.ok) {
            alert('✅ System time has been reset.');
            if (typeof syncTimeWithServer === 'function') {
                await syncTimeWithServer(); // Force the clock to re-sync immediately
            }
        } else {
            alert('❌ Failed to reset system time.');
        }
    } catch (error) {
        console.error('Error resetting mock time:', error);
        alert('❌ An error occurred while resetting the time.');
    }
}

async function seedFakeOrders() {
    const date = document.getElementById('seed-date').value;

    if (!date) {
        alert("Please select a date to seed orders.");
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/admin/seed-orders`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ date })
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

async function clearFakeOrders() {
    const date = document.getElementById('seed-date').value;

    if (!date) {
        alert("Please select a date first.");
        return;
    }

    if (!confirm(`⚠️ ARE YOU SURE?\n\nThis will delete ALL orders for ${date} and reset the stock pools to 0. This cannot be undone.`)) {
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/admin/clear-orders`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ date })
        });

        const data = await response.json();
        if (response.ok) {
            alert(`✅ ${data.message}`);
            loadAllOrders(); // Refresh orders grid
            loadDailyStock(); // Refresh stock table
        } else {
            alert(`❌ Error: ${data.detail}`);
        }
    } catch (error) {
        console.error("Error clearing orders:", error);
        alert("❌ Network error.");
    }
}

//walk in edit
async function updateWalkinStock(foodId, newAmount) {
    const day = document.getElementById('admin-stock-day').value;
    if (!day) return alert("Please select a day first.");
    // Allows admin to manually sync physical sales to the app
    await fetch(`${API_BASE}/api/stock/${day}/${foodId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walkin_pool: newAmount })
    });
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
    const day = document.getElementById('admin-stock-day').value; // e.g., 'monday'
    if (!day) return alert("Please select a day from the dropdown.");

    const payload = {
        admin_base_stock: parseInt(document.getElementById('edit-base-stock').value),
        prebook_pool: parseInt(document.getElementById('edit-prebook-pool').value),
        walkin_pool: parseInt(document.getElementById('edit-walkin-pool').value)
    };
    try {
        const response = await fetch(`${API_BASE}/api/stock/${day}/${foodId}`, {
            method: 'PATCH',
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

// --- REVIEWS MANAGEMENT ---
async function openReviewsModal(foodId, foodName) {
    const modal = document.getElementById('reviews-modal');
    if (!modal) {
        alert('Reviews modal not found!');
        return;
    }
    
    // Set food info
    document.getElementById('review-food-name').textContent = foodName;
    document.getElementById('review-food-id').value = foodId;
    
    // Load reviews
    await loadFoodReviewsAdmin(foodId);
    
    openModal('reviews-modal');
}

async function loadFoodReviewsAdmin(foodId) {
    const reviewsContainer = document.getElementById('reviews-list-admin');
    reviewsContainer.innerHTML = '<p style="text-align: center; color: #999;">Loading reviews...</p>';
    
    try {
        const response = await fetch(`${API_BASE}/api/reviews/food/${foodId}`);
        if (!response.ok) throw new Error('Failed to fetch reviews');
        
        const data = await response.json();
        
        if (!data.reviews || data.reviews.length === 0) {
            reviewsContainer.innerHTML = '<p style="text-align: center; color: #999;">No reviews yet.</p>';
            return;
        }
        
        let html = `<div style="margin-bottom: 15px;">
            <strong>Average Rating: ${data.average_rating}/5</strong> (${data.total_reviews} review${data.total_reviews !== 1 ? 's' : ''})
        </div>`;
        
        html += data.reviews.map(review => {
            let stars = '';
            for (let i = 0; i < 5; i++) {
                stars += i < review.rating ? '⭐' : '☆';
            }
            return `
                <div style="background: #1a1a1a; padding: 12px; border: 1px solid #333; border-radius: 6px; margin-bottom: 10px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <strong>${review.user_id}</strong>
                        <span style="font-size: 0.8rem; color: #999;">${new Date(review.created_at).toLocaleString()}</span>
                    </div>
                    <div style="color: #f39c12; margin-bottom: 8px;">${stars} ${review.rating}/5</div>
                    ${review.review_text ? `<p style="margin: 8px 0; color: #bbb;">${review.review_text}</p>` : ''}
                    <button class="btn-danger" onclick="deleteReviewAdmin(${review.id}, ${document.getElementById('review-food-id').value})" style="padding: 6px 12px; font-size: 0.85rem;">
                        <i class="fas fa-trash"></i> Delete
                    </button>
                </div>
            `;
        }).join('');
        
        reviewsContainer.innerHTML = html;
    } catch (error) {
        console.error('Error loading reviews:', error);
        reviewsContainer.innerHTML = '<p style="text-align: center; color: #e74c3c;">Error loading reviews</p>';
    }
}

async function deleteReviewAdmin(reviewId, foodId) {
    if (!confirm('Delete this review?')) return;
    
    const adminId = localStorage.getItem('admission_no'); // Get logged-in admin's ID
    
    try {
        const response = await fetch(`${API_BASE}/api/reviews/${reviewId}?admission_no=${adminId}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            await loadFoodReviewsAdmin(foodId);
        } else {
            alert('Failed to delete review');
        }
    } catch (error) {
        console.error('Error deleting review:', error);
        alert('Error deleting review');
    }
}

// --- PROFIT MANAGEMENT ---
let currentWeekDate = new Date();

function getWeekStartEnd(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day;
    const monday = new Date(d.setDate(diff));
    const sunday = new Date(d.setDate(diff + 6));
    return {
        start: monday.toISOString().split('T')[0],
        end: sunday.toISOString().split('T')[0],
        startObj: monday,
        endObj: sunday
    };
}

async function loadProfitData() {
    const week = getWeekStartEnd(currentWeekDate);
    const chartLoadPromise = loadMonthlyChart();
    
    try {
        const response = await fetch(`${API_BASE}/api/admin/weekly-profit?week_start=${week.start}`);
        if (!response.ok) throw new Error('Failed to fetch profit data');
        
        const data = await response.json();
        
        // Update summary
        document.getElementById('week-range').textContent = `${data.week_start_date} to ${data.week_end_date}`;
        document.getElementById('total-revenue').textContent = data.total_revenue;
        document.getElementById('total-expenses').textContent = data.total_expenses;
        document.getElementById('net-profit').textContent = data.net_profit;
        
        // Display expenses
        displayExpenses(data.daily_expenses || []);

        // Ensure chart request finishes too
        await chartLoadPromise;
    } catch (error) {
        console.error('Error loading profit data:', error);
        alert('Error loading profit data');
        await chartLoadPromise;
    }
}

function displayExpenses(expenses) {
    const container = document.getElementById('expenses-list');
    
    if (!expenses || expenses.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #999;">No expenses recorded for this week.</p>';
        return;
    }
    
    let html = '';
    expenses.forEach(expense => {
        html += `
            <div style="padding: 10px; background: #f8f9fa; border-radius: 4px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <strong>${expense.expense_date}</strong> - ₹${expense.amount}
                    ${expense.description ? `<br><small style="color: #666;">${expense.description}</small>` : ''}
                </div>
                <button class="btn-danger" onclick="deleteExpense('${expense.expense_date}')" style="padding: 4px 8px; font-size: 0.8rem;">Delete</button>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

async function saveExpense() {
    const expenseDate = document.getElementById('expense-date').value;
    const amount = parseInt(document.getElementById('expense-amount').value) || 0;
    const description = document.getElementById('expense-description').value;
    const saveBtn = event?.target;
    
    if (!expenseDate) {
        alert('Please select an expense date');
        return;
    }
    
    if (amount <= 0) {
        alert('Please enter a valid amount');
        return;
    }
    
    // Show loading state
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';
    }
    
    try {
        const response = await fetch(`${API_BASE}/api/admin/daily-expenses`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                expense_date: expenseDate,
                amount: amount,
                description: description || null
            })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            // Show visual feedback
            const notification = document.createElement('div');
            notification.style.cssText = 'position: fixed; top: 20px; right: 20px; background: #2ecc71; color: white; padding: 15px 20px; border-radius: 6px; box-shadow: 0 2px 10px rgba(0,0,0,0.2); z-index: 10000; font-weight: bold;';
            notification.textContent = `✅ Expense saved! ₹${amount} on ${expenseDate}`;
            document.body.appendChild(notification);
            setTimeout(() => notification.remove(), 3000);
            
            // Clear form
            document.getElementById('expense-date').value = '';
            document.getElementById('expense-amount').value = '';
            document.getElementById('expense-description').value = '';
            
            // Refresh the display
            await loadProfitData();
        } else {
            alert(`❌ Failed to save expense: ${data.detail || 'Unknown error'}`);
        }
    } catch (error) {
        console.error('Error saving expense:', error);
        alert(`❌ Error saving expense: ${error.message}`);
    } finally {
        // Reset button
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.textContent = 'Save Expense';
        }
    }
}

async function deleteExpense(expenseDate) {
    if (!confirm('Delete this expense?')) return;
    
    try {
        // First, get the expense ID
        const response = await fetch(`${API_BASE}/api/admin/daily-expenses?week_start=${expenseDate}`);
        const expenses = await response.json();
        const expense = expenses.find(e => e.expense_date === expenseDate);
        
        if (!expense) {
            alert('Expense not found');
            return;
        }
        
        const deleteResponse = await fetch(`${API_BASE}/api/admin/daily-expenses/${expense.id}`, {
            method: 'DELETE'
        });
        
        if (deleteResponse.ok) {
            await loadProfitData(); // Refresh the display
        } else {
            alert('Failed to delete expense');
        }
    } catch (error) {
        console.error('Error deleting expense:', error);
        alert('Error deleting expense');
    }
}

let profitChart = null;

function setMonthlyChartStatus(message = '', show = false, isError = false) {
    const statusEl = document.getElementById('monthly-chart-status');
    if (!statusEl) return;

    statusEl.textContent = message;
    statusEl.style.display = show ? 'block' : 'none';
    statusEl.style.color = isError ? '#ffd2d2' : '#cbd5d6';
    statusEl.style.background = isError ? 'rgba(231, 76, 60, 0.2)' : 'rgba(255, 255, 255, 0.08)';
}

async function loadMonthlyChart() {
    setMonthlyChartStatus('Loading monthly chart...', true, false);

    try {
        // Let backend pick month/year from its own (possibly mocked) clock to avoid an extra API round-trip.
        const response = await fetch(`${API_BASE}/api/admin/monthly-profit`);
        if (!response.ok) throw new Error('Failed to fetch monthly data');
        
        const data = await response.json();
        
        console.log('Monthly profit data:', data);
        
        if (!data.weeks || data.weeks.length === 0) {
            console.warn('No weeks data available');
            const chartCanvas = document.getElementById('profit-chart');
            if (chartCanvas) chartCanvas.style.display = 'none';
            setMonthlyChartStatus('No monthly data available yet.', true, false);
            return;
        }

        const chartCanvas = document.getElementById('profit-chart');
        if (chartCanvas) chartCanvas.style.display = 'block';
        setMonthlyChartStatus('', false, false);
        
        // Prepare chart data
        const labels = data.weeks.map((w, i) => `Week ${i + 1}`);
        const profitData = data.weeks.map(w => w.profit || 0);
        const revenueData = data.weeks.map(w => w.revenue || 0);
        const expenseData = data.weeks.map(w => w.expenses || 0);
        
        console.log('Chart labels:', labels);
        console.log('Profit data:', profitData);
        
        renderProfitChart(labels, profitData, revenueData, expenseData);
        setMonthlyChartStatus('', false, false);
    } catch (error) {
        console.error('Error loading monthly chart:', error);
        const chartCanvas = document.getElementById('profit-chart');
        if (chartCanvas) chartCanvas.style.display = 'none';
        setMonthlyChartStatus('Failed to load monthly chart data.', true, true);
    }
}

function renderProfitChart(labels, profitData, revenueData, expenseData) {
    const canvas = document.getElementById('profit-chart');
    if (!canvas) {
        console.error('Canvas element not found');
        return;
    }
    
    // Check if Chart.js is available
    if (typeof Chart === 'undefined') {
        console.error('Chart.js not loaded');
        return;
    }
    
    // Destroy existing chart if it exists
    if (profitChart) {
        profitChart.destroy();
    }
    
    const ctx = canvas.getContext('2d');
    console.log('Creating chart with labels:', labels, 'data:', { profitData, revenueData, expenseData });
    
    profitChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Revenue',
                    data: revenueData,
                    backgroundColor: 'rgba(72, 201, 176, 0.78)',
                    borderColor: '#48c9b0',
                    borderWidth: 1.2,
                    borderRadius: 8,
                    borderSkipped: false,
                    maxBarThickness: 34
                },
                {
                    label: 'Expenses',
                    data: expenseData,
                    backgroundColor: 'rgba(255, 107, 107, 0.75)',
                    borderColor: '#ff6b6b',
                    borderWidth: 1.2,
                    borderRadius: 8,
                    borderSkipped: false,
                    maxBarThickness: 34
                },
                {
                    label: 'Net Profit',
                    data: profitData,
                    backgroundColor: '#f4d35e',
                    borderColor: '#f4d35e',
                    borderWidth: 1,
                    type: 'line',
                    borderWidth: 3,
                    fill: false,
                    pointBackgroundColor: '#1a1a1a',
                    pointBorderColor: '#f4d35e',
                    pointBorderWidth: 2.5,
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    tension: 0.32
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            interaction: {
                mode: 'index',
                intersect: false
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    align: 'start',
                    labels: {
                        color: '#e7ecef',
                        usePointStyle: true,
                        boxWidth: 10,
                        boxHeight: 10,
                        padding: 16,
                        font: { size: 12, weight: '600' }
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(12, 14, 17, 0.94)',
                    borderColor: 'rgba(255, 255, 255, 0.15)',
                    borderWidth: 1,
                    padding: 12,
                    titleColor: '#f5f7f8',
                    bodyColor: '#dce3e6',
                    displayColors: true,
                    callbacks: {
                        label(context) {
                            const value = context.parsed.y ?? 0;
                            return `${context.dataset.label}: Rs ${value.toLocaleString()}`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        color: '#c6d0d4',
                        maxTicksLimit: 6,
                        callback(value) {
                            return `Rs ${Number(value).toLocaleString()}`;
                        }
                    },
                    grid: {
                        color: 'rgba(255, 255, 255, 0.09)',
                        drawBorder: false
                    }
                },
                x: {
                    ticks: {
                        color: '#d7dfe2',
                        font: { weight: '600' }
                    },
                    grid: {
                        color: 'rgba(255, 255, 255, 0.05)',
                        drawBorder: false
                    }
                }
            }
        }
    });
}