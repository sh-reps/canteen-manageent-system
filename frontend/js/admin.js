var API_BASE = "";
const DEBUG_NAV_PREF_KEY = 'admin_debug_nav_enabled';
let cashierScannerStream = null;
let cashierScannerActive = false;
let cashierScannerFrameHandle = null;
let cashierScannerDetector = null;

function isDebugNavEnabled() {
    return localStorage.getItem(DEBUG_NAV_PREF_KEY) !== '0';
}

function setDebugToggleButtonState(enabled) {
    const toggleBtn = document.getElementById('debug-toggle-btn');
    if (!toggleBtn) return;

    toggleBtn.textContent = enabled ? 'Debug: On' : 'Debug: Off';
    toggleBtn.classList.toggle('off', !enabled);
    toggleBtn.setAttribute('aria-pressed', enabled ? 'true' : 'false');
}

function applyDebugNavVisibility() {
    const enabled = isDebugNavEnabled();
    const debugNav = document.getElementById('nav-clock');

    if (debugNav && !enabled && debugNav.classList.contains('active')) {
        showSection('orders');
    }

    if (debugNav) {
        debugNav.style.display = enabled ? '' : 'none';
    }

    setDebugToggleButtonState(enabled);
}

function toggleDebugNav() {
    const nextEnabled = !isDebugNavEnabled();
    localStorage.setItem(DEBUG_NAV_PREF_KEY, nextEnabled ? '1' : '0');
    applyDebugNavVisibility();
}


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
            return true;
        } else {
            alert("Failed to update order");
            return false;
        }
    } catch (err) {
        console.error("Error completing order:", err);
        return false;
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

function renderCashierOrderDetails(order) {
    const container = document.getElementById('cashier-order-details');
    if (!container) return;

    const items = (order.items || []).map(item => item.food_item?.name || 'Unknown').join(', ');
    const location = (order.booked_seats && order.booked_seats.length > 0)
        ? order.booked_seats.map(seat => `T${seat.seat.table_number}-S${seat.seat.seat_number}`).join(', ')
        : 'Parcel';

    container.innerHTML = `
        <div class="menu-item-card">
            <h4>Order #${order.id}</h4>
            <p><strong>User:</strong> ${order.user_id}</p>
            <p><strong>Date:</strong> ${order.booking_date}</p>
            <p><strong>Slot:</strong> ${order.scheduled_slot}</p>
            <p><strong>Items:</strong> ${items || 'No items'}</p>
            <p><strong>Location:</strong> ${location}${order.drop_point ? ` (${order.drop_point})` : ''}</p>
            ${order.delivery_window ? `<p class="item-category">Delivery Window: ${order.delivery_window}</p>` : ''}
            <p><strong>Status:</strong> ${order.status}</p>
            <div class="btn-group" style="margin-top:12px; flex-wrap:wrap;">
                ${order.status === 'confirmed' ? `<button class="btn-confirm" onclick="completeCashierOrder(${order.id})">Complete Order</button>` : `<span class="item-category">Order already ${order.status}.</span>`}
            </div>
        </div>
    `;
}

async function completeCashierOrder(orderId) {
    const success = await completeOrder(orderId);
    if (success) {
        lookupCashierOrders();
    }
}

function stopCashierScanner() {
    cashierScannerActive = false;
    if (cashierScannerFrameHandle) {
        cancelAnimationFrame(cashierScannerFrameHandle);
        cashierScannerFrameHandle = null;
    }
    if (cashierScannerStream) {
        cashierScannerStream.getTracks().forEach(track => track.stop());
        cashierScannerStream = null;
    }
}

function closeCashierScanner() {
    stopCashierScanner();
    closeModal('cashier-scanner-modal');
}

async function openCashierScanner() {
    const modal = document.getElementById('cashier-scanner-modal');
    const video = document.getElementById('cashier-scanner-video');
    const status = document.getElementById('cashier-scanner-status');
    if (!modal || !video || !status) return;

    stopCashierScanner();
    modal.style.display = 'flex';
    status.textContent = 'Requesting camera access...';

    try {
        cashierScannerStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: 'environment' } },
            audio: false
        });
        video.srcObject = cashierScannerStream;
        await video.play();

        if ('BarcodeDetector' in window) {
            cashierScannerDetector = new BarcodeDetector({ formats: ['code_128', 'code_39', 'ean_13', 'ean_8', 'qr_code'] });
            cashierScannerActive = true;
            status.textContent = 'Camera ready. Scan the order barcode.';
            scanCashierFrame();
        } else {
            status.textContent = 'Camera open, but this browser cannot decode barcodes. Enter the barcode manually.';
        }
    } catch (error) {
        console.error(error);
        status.textContent = 'Unable to open camera. Check permissions and try again.';
        stopCashierScanner();
    }
}

async function scanCashierFrame() {
    const video = document.getElementById('cashier-scanner-video');
    const status = document.getElementById('cashier-scanner-status');
    if (!cashierScannerActive || !cashierScannerDetector || !video) return;

    try {
        const barcodes = await cashierScannerDetector.detect(video);
        if (barcodes && barcodes.length > 0) {
            const barcodeValue = (barcodes[0].rawValue || '').trim();
            if (barcodeValue) {
                cashierScannerActive = false;
                if (status) status.textContent = `Barcode detected: ${barcodeValue}`;
                const input = document.getElementById('cashier-barcode-input');
                if (input) input.value = barcodeValue;
                stopCashierScanner();
                closeModal('cashier-scanner-modal');
                await lookupCashierOrders();
                return;
            }
        }
    } catch (error) {
        // Keep scanning; the barcode may not be in frame yet.
        console.debug('Barcode scan retry:', error);
    }

    if (cashierScannerActive) {
        cashierScannerFrameHandle = requestAnimationFrame(scanCashierFrame);
    }
}

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
        is_countable: is_countable,
        is_veg: document.getElementById('food-is-veg')?.checked ?? true
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

    if (sectionId === 'clock' && !isDebugNavEnabled()) {
        return;
    }

    if (sectionId !== 'cashier') {
        closeCashierScanner();
    }
    
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
    if (sectionId === 'feedback') loadAdminFeedback();
    if (sectionId === 'notifications') {
        toggleNotificationTarget();
        loadAdminNotifications();
    }
    if (sectionId === 'cashier') {
        const cashierInput = document.getElementById('cashier-barcode-input');
        const cashierDetails = document.getElementById('cashier-order-details');
        if (cashierInput) cashierInput.value = '';
        if (cashierDetails) cashierDetails.innerHTML = '';
    }
    if (sectionId === 'analytics') loadMenuAnalytics();
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
    applyDebugNavVisibility();

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
                    ${order.delivery_window ? `<div style="font-size:0.8rem; color:#2ecc71; margin-bottom:6px;">Delivery: ${order.delivery_window}</div>` : ''}
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
    const data = item || { id: null, name: '', price_full: '', price_half: '', category: 'meal', meal_type: 'breakfast', has_portions: false, is_countable: false, is_veg: true, description: '', image_url: '' };
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
    if (document.getElementById('food-is-veg')) {
        document.getElementById('food-is-veg').checked = (data.is_veg !== false);
    }

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
                Countable: ${item.is_countable ? 'Yes' : 'No'} |
                Type: ${item.is_veg === false ? 'Non-veg' : 'Veg'}
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
            let errorMessage = 'Failed to update system clock.';
            try {
                const errData = await response.json();
                errorMessage = errData.detail || errData.message || errorMessage;
            } catch (_) {
                // Keep default message if body is not JSON
            }
            alert(`❌ ${errorMessage}`);
        }
    } catch (error) {
        console.error('Error updating mock clock:', error);
        alert(`❌ An error occurred: ${error.message}`);
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
    const countInput = document.getElementById('seed-count');
    const count = countInput ? parseInt(countInput.value, 10) : 200;

    if (!date) {
        alert("Please select a date to seed orders.");
        return;
    }

    if (!Number.isFinite(count) || count < 1) {
        alert("Please enter a valid order count (minimum 1).");
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/admin/seed-orders`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ date, count })
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
                <span>${h.date} - <strong>${h.day_type || 'holiday'}</strong>${h.label ? ` (${h.label})` : ''}</span>
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
    const typeInput = document.getElementById('holiday-type');
    const labelInput = document.getElementById('holiday-label');
    const date = dateInput.value;
    if (!date) return alert("Please select a date");

    try {
        const response = await fetch(`${API_BASE}/api/holidays`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                date,
                day_type: typeInput ? typeInput.value : 'holiday',
                label: labelInput ? labelInput.value : null
            })
        });

        if (response.ok) {
            dateInput.value = "";
            if (labelInput) labelInput.value = "";
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
let selectedMonthlyChartDate = null;

function formatMonthInputValue(dateObj) {
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
}

function ensureMonthlyChartPickerInitialized() {
    const monthInput = document.getElementById('monthly-chart-month');
    if (!monthInput) return;

    if (!selectedMonthlyChartDate) {
        selectedMonthlyChartDate = new Date();
    }

    monthInput.value = formatMonthInputValue(selectedMonthlyChartDate);
}

function onMonthlyChartMonthChange() {
    const monthInput = document.getElementById('monthly-chart-month');
    if (!monthInput || !monthInput.value) return;

    const [yearStr, monthStr] = monthInput.value.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    if (!Number.isFinite(year) || !Number.isFinite(month)) return;

    selectedMonthlyChartDate = new Date(year, month - 1, 1);
    loadMonthlyChart();
}

function shiftMonthlyChart(deltaMonths) {
    if (!selectedMonthlyChartDate) {
        selectedMonthlyChartDate = new Date();
    }

    selectedMonthlyChartDate = new Date(
        selectedMonthlyChartDate.getFullYear(),
        selectedMonthlyChartDate.getMonth() + deltaMonths,
        1
    );

    ensureMonthlyChartPickerInitialized();
    loadMonthlyChart();
}

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
    ensureMonthlyChartPickerInitialized();
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
            <div style="padding: 10px; background: #15212a; border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; color: #dce6ec;">
                <div>
                    <strong>${expense.expense_date}</strong> - ₹${expense.amount}
                    ${expense.description ? `<br><small style="color: #9eb2be;">${expense.description}</small>` : ''}
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
        if (!selectedMonthlyChartDate) {
            selectedMonthlyChartDate = new Date();
        }

        const year = selectedMonthlyChartDate.getFullYear();
        const month = selectedMonthlyChartDate.getMonth() + 1;

        const response = await fetch(`${API_BASE}/api/admin/monthly-profit?year=${year}&month=${month}`);
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

function toggleNotificationTarget() {
    const target = document.getElementById('notify-target')?.value || 'global';
    const userLabel = document.getElementById('notify-user-label');
    const userInput = document.getElementById('notify-user-id');
    const shouldShow = target === 'personal';
    if (userLabel) userLabel.style.display = shouldShow ? 'block' : 'none';
    if (userInput) userInput.style.display = shouldShow ? 'block' : 'none';
}

async function loadAdminFeedback() {
    const tbody = document.getElementById('admin-feedback-body');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="7" class="text-center">Loading...</td></tr>';

    try {
        const response = await fetch(`${API_BASE}/api/admin/feedback`);
        if (!response.ok) throw new Error('Failed to load feedback');
        const rows = await response.json();

        if (!rows.length) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center">No suggestions or complaints yet.</td></tr>';
            return;
        }

        tbody.innerHTML = rows.map(r => `
            <tr>
                <td>${r.created_at ? new Date(r.created_at).toLocaleString() : '-'}</td>
                <td>${r.user_id}</td>
                <td>${r.category}</td>
                <td>${r.subject}</td>
                <td>${r.message}</td>
                <td><span class="status-${r.status}">${r.status}</span></td>
                <td>
                    <select onchange="updateFeedbackStatus(${r.id}, this.value)">
                        <option value="open" ${r.status === 'open' ? 'selected' : ''}>open</option>
                        <option value="in_review" ${r.status === 'in_review' ? 'selected' : ''}>in_review</option>
                        <option value="resolved" ${r.status === 'resolved' ? 'selected' : ''}>resolved</option>
                    </select>
                </td>
            </tr>
        `).join('');
    } catch (error) {
        console.error(error);
        tbody.innerHTML = '<tr><td colspan="7" class="text-center" style="color:red;">Failed to load feedback</td></tr>';
    }
}

async function updateFeedbackStatus(id, status) {
    try {
        const response = await fetch(`${API_BASE}/api/admin/feedback/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status })
        });
        if (!response.ok) throw new Error('Failed to update status');
        loadAdminFeedback();
    } catch (error) {
        console.error(error);
        alert('Failed to update feedback status');
    }
}

async function sendNotification() {
    const target = document.getElementById('notify-target')?.value || 'global';
    const user_id = document.getElementById('notify-user-id')?.value?.trim();
    const title = document.getElementById('notify-title')?.value?.trim();
    const message = document.getElementById('notify-message')?.value?.trim();
    const created_by = localStorage.getItem('admission_no');

    if (!title || !message) {
        alert('Title and message are required');
        return;
    }
    if (target === 'personal' && !user_id) {
        alert('User Admission No is required for personal notifications');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/api/admin/notifications`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ target, user_id, title, message, created_by })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || 'Failed to send notification');

        document.getElementById('notify-title').value = '';
        document.getElementById('notify-message').value = '';
        if (document.getElementById('notify-user-id')) document.getElementById('notify-user-id').value = '';
        alert('Notification sent successfully');
        loadAdminNotifications();
    } catch (error) {
        console.error(error);
        alert(error.message || 'Failed to send notification');
    }
}

async function loadAdminNotifications() {
    const container = document.getElementById('admin-notification-list');
    if (!container) return;
    container.innerHTML = '<p>Loading...</p>';

    try {
        const response = await fetch(`${API_BASE}/api/admin/notifications`);
        if (!response.ok) throw new Error('Failed to load notifications');
        const list = await response.json();

        if (!list.length) {
            container.innerHTML = '<p>No notifications sent yet.</p>';
            return;
        }

        container.innerHTML = list.map(n => `
            <div class="menu-item-card" style="margin-bottom:10px;">
                <h4>${n.title}</h4>
                <p class="item-category">${n.user_id ? `Personal: ${n.user_id}` : 'Global'}</p>
                <p>${n.message}</p>
                <p class="item-category">${n.created_at ? new Date(n.created_at).toLocaleString() : '-'}</p>
            </div>
        `).join('');
    } catch (error) {
        console.error(error);
        container.innerHTML = '<p style="color:red;">Failed to load notifications</p>';
    }
}

async function runSpecialDayPrediction() {
    const date = document.getElementById('special-predict-date')?.value;
    const resultEl = document.getElementById('special-day-prediction-result');
    if (!date) return alert('Please select a target date');
    if (resultEl) resultEl.textContent = 'Calculating...';

    try {
        const response = await fetch(`${API_BASE}/api/admin/special-day-prediction?target_date=${date}`);
        if (!response.ok) throw new Error('Prediction request failed');
        const data = await response.json();
        if (resultEl) {
            resultEl.textContent = `Recommended multiplier x${data.recommended_stock_multiplier} (Regular avg ${data.regular_daily_avg}, Special avg ${data.special_daily_avg})`;
        }
    } catch (error) {
        console.error(error);
        if (resultEl) resultEl.textContent = 'Failed to calculate prediction';
    }
}

async function lookupCashierOrders() {
    const barcode = document.getElementById('cashier-barcode-input')?.value?.trim();
    const container = document.getElementById('cashier-order-details');
    if (!barcode) return alert('Scan or enter order barcode');
    if (!container) return;

    container.innerHTML = '<p>Loading...</p>';
    try {
        const response = await fetch(`${API_BASE}/api/cashier/order/${barcode}`);
        if (!response.ok) throw new Error('No order found');
        const order = await response.json();
        renderCashierOrderDetails(order);
    } catch (error) {
        console.error(error);
        container.innerHTML = '<p style="color:red;">Unable to fetch the scanned order.</p>';
    }
}

async function loadMenuAnalytics() {
    const days = parseInt(document.getElementById('analytics-days')?.value || '30', 10);
    const tbody = document.getElementById('menu-analytics-body');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="7" class="text-center">Loading...</td></tr>';

    try {
        const response = await fetch(`${API_BASE}/api/admin/menu-analytics?days=${days}`);
        if (!response.ok) throw new Error('Failed to fetch analytics');
        const rows = await response.json();

        if (!rows.length) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center">No analytics data yet.</td></tr>';
            return;
        }

        tbody.innerHTML = rows.map(row => `
            <tr>
                <td>${row.name}</td>
                <td>${row.category}</td>
                <td>${row.meal_type}</td>
                <td>${row.quantity_sold}</td>
                <td>Rs ${row.revenue}</td>
                <td>${row.avg_rating}</td>
                <td>${row.review_count}</td>
            </tr>
        `).join('');
    } catch (error) {
        console.error(error);
        tbody.innerHTML = '<tr><td colspan="7" class="text-center" style="color:red;">Failed to load analytics.</td></tr>';
    }
}