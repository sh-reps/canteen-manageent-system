const USER_API_BASE = 'http://127.0.0.1:8000';

function showUserSection(sectionId) {
    document.querySelectorAll('[id^="user-section-"]').forEach(sec => {
        sec.style.display = 'none';
    });

    const activeSection = document.getElementById(`user-section-${sectionId}`);
    if (activeSection) activeSection.style.display = 'block';

    document.querySelectorAll('[id^="user-nav-"]').forEach(item => {
        item.classList.remove('active');
    });
    const activeNav = document.getElementById(`user-nav-${sectionId}`);
    if (activeNav) activeNav.classList.add('active');

    const floatingCart = document.getElementById('floating-cart');
    if (floatingCart) {
        floatingCart.style.display = sectionId === 'menu' ? 'flex' : 'none';
    }

    if (sectionId === 'upcoming' || sectionId === 'history') loadUserOrders();
    if (sectionId === 'feedback') loadMyFeedback();
    if (sectionId === 'notifications') loadNotifications();
    if (sectionId === 'flags') loadFlagSummary();
    if (sectionId === 'incentives') loadIncentivesSummary();
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
}

function closeBarcodeModal() {
    const modal = document.getElementById('barcode-modal');
    if (modal) modal.style.display = 'none';
}

function renderOrderBarcode(order) {
    const info = document.getElementById('barcode-order-info');
    const hint = document.getElementById('barcode-order-hint');
    const svg = document.getElementById('order-barcode-svg');
    if (!info || !hint || !svg) return;

    const foodItems = (order.items || []).map(i => i.food_item?.name || 'Unknown').join(', ');
    const location = (order.booked_seats && order.booked_seats.length > 0)
        ? order.booked_seats.map(s => `T${s.seat.table_number}-S${s.seat.seat_number}`).join(', ')
        : `Parcel${order.drop_point ? ` (${order.drop_point.toUpperCase()})` : ''}`;

    info.innerHTML = `
        <h3>Order #${order.id}</h3>
        <p><strong>User:</strong> ${escapeHtml(order.user_id)}</p>
        <p><strong>Date:</strong> ${escapeHtml(order.booking_date || '-')}</p>
        <p><strong>Slot:</strong> ${escapeHtml(order.scheduled_slot || '-')}</p>
        <p><strong>Location:</strong> ${escapeHtml(location)}</p>
        <p><strong>Items:</strong> ${escapeHtml(foodItems || 'No items')}</p>
        <p><strong>Status:</strong> ${escapeHtml(order.status || '-')}</p>
    `;

    hint.textContent = 'Show this barcode at cashier mode for scanning.';

    if (typeof JsBarcode === 'function') {
        JsBarcode(svg, String(order.id), {
            format: 'CODE128',
            displayValue: true,
            fontSize: 18,
            margin: 10,
            width: 2,
            height: 90,
        });
    } else {
        svg.innerHTML = '';
        hint.textContent = 'Barcode generator unavailable. Use order # at cashier.';
    }
}

async function showOrderBarcode(orderId) {
    const modal = document.getElementById('barcode-modal');
    const info = document.getElementById('barcode-order-info');
    const hint = document.getElementById('barcode-order-hint');
    const svg = document.getElementById('order-barcode-svg');
    if (!modal || !info || !hint || !svg) return;

    info.innerHTML = '<p>Loading order details...</p>';
    hint.textContent = '';
    svg.innerHTML = '';
    modal.style.display = 'flex';

    try {
        const response = await fetch(`${USER_API_BASE}/api/cashier/order/${orderId}`);
        if (!response.ok) throw new Error('Failed to load order');
        const order = await response.json();
        renderOrderBarcode(order);
    } catch (error) {
        console.error(error);
        info.innerHTML = '<p style="color:red;">Unable to load barcode for this order.</p>';
        hint.textContent = '';
    }
}

function getDashboardNow() {
    if (typeof getSimulatedDate === 'function') return getSimulatedDate();
    return new Date();
}

function buildOrderRow(order, isUpcoming = false) {
    const foodItems = (order.items || []).map(i => i.food_item?.name || 'Unknown').join(', ');
    const bookingDate = new Date(order.booking_date).toLocaleDateString();
    const orderDate = order.created_at ? new Date(order.created_at).toLocaleString() : '-';
    const location = (order.booked_seats && order.booked_seats.length > 0)
        ? order.booked_seats.map(s => `T${s.seat.table_number}-S${s.seat.seat_number}`).join(', ')
        : `Parcel${order.drop_point ? ` (${order.drop_point.toUpperCase()})` : ''}`;
    const deliveryInfo = (order.order_type === 'parcel' && order.delivery_window)
        ? `<div style="font-size:0.8rem; color:#2ecc71;">Delivery: ${order.delivery_window}${(order.group_size || 1) > 1 ? ` | Group: ${order.group_size}` : ''}</div>`
        : '';

    const barcodeButton = isUpcoming && order.status === 'confirmed'
        ? `<button class="btn-action" onclick="showOrderBarcode(${order.id})"><i class="fas fa-barcode"></i> Show Barcode</button>`
        : '';

    const actionButton = order.status === 'confirmed'
        ? `${barcodeButton}<button class="btn-danger" onclick="cancelOrderFromDashboard(${order.id})">Cancel</button>`
        : `<span class="text-disabled">Cannot Cancel</span>`;

    return `
        <tr>
            <td>${bookingDate}</td>
            <td>${orderDate}</td>
            <td>${order.scheduled_slot}</td>
            <td>${escapeHtml(foodItems)}</td>
            <td>${escapeHtml(location)}</td>
            <td><span class="status-${order.status}">${order.status}</span></td>
            <td>${deliveryInfo}${actionButton}</td>
        </tr>
    `;
}

async function loadUserOrders() {
    const admissionNo = localStorage.getItem('admission_no');
    if (!admissionNo) return;

    const upcomingBody = document.getElementById('upcoming-orders-body');
    const historyBody = document.getElementById('past-orders-body');
    if (!upcomingBody || !historyBody) return;

    upcomingBody.innerHTML = '<tr><td colspan="7" class="text-center">Loading...</td></tr>';
    historyBody.innerHTML = '<tr><td colspan="7" class="text-center">Loading...</td></tr>';

    try {
        const response = await fetch(`${USER_API_BASE}/order-history/${admissionNo}`);
        if (!response.ok) throw new Error('Failed to load orders');

        const allOrders = await response.json();
        const today = getDashboardNow();
        today.setHours(0, 0, 0, 0);

        const upcomingOrders = allOrders.filter(order => {
            const [y, m, d] = order.booking_date.split('-');
            const bookingDate = new Date(y, m - 1, d);
            return bookingDate >= today && order.status === 'confirmed';
        });

        const pastOrders = allOrders.filter(order => {
            const [y, m, d] = order.booking_date.split('-');
            const bookingDate = new Date(y, m - 1, d);
            return bookingDate < today || order.status !== 'confirmed';
        }).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        upcomingBody.innerHTML = upcomingOrders.length
            ? upcomingOrders.map(order => buildOrderRow(order, true)).join('')
            : '<tr><td colspan="7" class="text-center">No upcoming orders.</td></tr>';

        historyBody.innerHTML = pastOrders.length
            ? pastOrders.map(buildOrderRow).join('')
            : '<tr><td colspan="7" class="text-center">No past orders.</td></tr>';
    } catch (error) {
        console.error(error);
        upcomingBody.innerHTML = '<tr><td colspan="7" class="text-center" style="color:red;">Failed to load orders.</td></tr>';
        historyBody.innerHTML = '<tr><td colspan="7" class="text-center" style="color:red;">Failed to load orders.</td></tr>';
    }
}

async function cancelOrderFromDashboard(orderId) {
    if (!confirm('Are you sure you want to cancel this order?')) return;

    try {
        const response = await fetch(`${USER_API_BASE}/bookings/${orderId}/cancel`, { method: 'POST' });
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || 'Failed to cancel order');
        alert(data.message || 'Order cancelled.');
        loadUserOrders();
    } catch (error) {
        console.error(error);
        alert(error.message || 'Error cancelling order');
    }
}

async function submitFeedback() {
    const admission_no = localStorage.getItem('admission_no');
    const category = document.getElementById('feedback-category')?.value;
    const subject = document.getElementById('feedback-subject')?.value?.trim();
    const message = document.getElementById('feedback-message')?.value?.trim();

    if (!subject || !message) {
        alert('Subject and message are required.');
        return;
    }

    try {
        const response = await fetch(`${USER_API_BASE}/api/feedback`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ admission_no, category, subject, message })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || 'Failed to submit feedback');

        document.getElementById('feedback-subject').value = '';
        document.getElementById('feedback-message').value = '';
        alert('Submitted successfully.');
        loadMyFeedback();
    } catch (error) {
        console.error(error);
        alert(error.message || 'Failed to submit feedback');
    }
}

async function loadMyFeedback() {
    const admissionNo = localStorage.getItem('admission_no');
    const list = document.getElementById('my-feedback-list');
    if (!admissionNo || !list) return;

    list.innerHTML = '<p>Loading...</p>';
    try {
        const response = await fetch(`${USER_API_BASE}/api/feedback/me/${admissionNo}`);
        if (!response.ok) throw new Error('Failed to load feedback');
        const rows = await response.json();

        if (!rows.length) {
            list.innerHTML = '<p>No submissions yet.</p>';
            return;
        }

        list.innerHTML = rows.map(r => `
            <div class="menu-item-card" style="margin-bottom:10px;">
                <h4>${escapeHtml(r.subject)}</h4>
                <p class="item-category">${escapeHtml(r.category)} | ${r.created_at ? new Date(r.created_at).toLocaleString() : '-'}</p>
                <p>${escapeHtml(r.message)}</p>
                <p class="item-category">Status: ${escapeHtml(r.status)}</p>
            </div>
        `).join('');
    } catch (error) {
        console.error(error);
        list.innerHTML = '<p style="color:red;">Failed to load submissions.</p>';
    }
}

async function loadNotifications() {
    const admissionNo = localStorage.getItem('admission_no');
    const list = document.getElementById('notification-list');
    if (!admissionNo || !list) return;

    list.innerHTML = '<p>Loading notifications...</p>';
    try {
        const response = await fetch(`${USER_API_BASE}/api/notifications/${admissionNo}`);
        if (!response.ok) throw new Error('Failed to load notifications');
        const rows = await response.json();

        if (!rows.length) {
            list.innerHTML = '<p>No notifications yet.</p>';
            return;
        }

        list.innerHTML = rows.map(n => {
            const isFlag = n.type === 'flag';
            return `
                <div class="menu-item-card" style="margin-bottom:10px; border-color:${isFlag ? '#e74c3c' : '#3498db'};">
                    <h4>${escapeHtml(n.title || 'Notification')}</h4>
                    <p>${escapeHtml(n.message || '')}</p>
                    <p class="item-category">${n.created_at ? new Date(n.created_at).toLocaleString() : ''}</p>
                </div>
            `;
        }).join('');
    } catch (error) {
        console.error(error);
        list.innerHTML = '<p style="color:red;">Failed to load notifications.</p>';
    }
}

async function loadFlagSummary() {
    const admissionNo = localStorage.getItem('admission_no');
    const card = document.getElementById('flag-summary-card');
    if (!admissionNo || !card) return;

    card.innerHTML = '<p>Loading flag status...</p>';
    try {
        const response = await fetch(`${USER_API_BASE}/api/users/${admissionNo}/flag-summary`);
        if (!response.ok) throw new Error('Failed to fetch flag summary');
        const data = await response.json();

        card.innerHTML = `
            <h3>${escapeHtml(data.admission_no)}</h3>
            <p><strong>Current Flags:</strong> ${data.flags}/5</p>
            <p><strong>Deposit Percentage:</strong> ${data.deposit_percentage}%</p>
            <p><strong>Last Flagged:</strong> ${data.last_flagged_at ? new Date(data.last_flagged_at).toLocaleString() : 'N/A'}</p>
            <p class="item-category">Keep flags low to retain best booking terms.</p>
        `;
    } catch (error) {
        console.error(error);
        card.innerHTML = '<p style="color:red;">Failed to load flag summary.</p>';
    }
}

async function loadIncentivesSummary() {
    const admissionNo = localStorage.getItem('admission_no');
    const card = document.getElementById('incentives-summary-card');
    if (!admissionNo || !card) return;

    card.innerHTML = '<p>Loading incentives...</p>';
    try {
        const response = await fetch(`${USER_API_BASE}/api/users/${admissionNo}/flag-summary`);
        if (!response.ok) throw new Error('Failed to fetch incentives data');
        const data = await response.json();

        let tier = 'Bronze';
        let perk = 'Keep maintaining good booking behavior to unlock better incentives.';
        if (data.flags <= 1) {
            tier = 'Gold';
            perk = 'Best booking terms, lowest deposit pressure, and priority trust level.';
        } else if (data.flags === 2) {
            tier = 'Silver';
            perk = 'Moderate deposit terms with room to return to Gold by avoiding no-shows.';
        } else if (data.flags === 3) {
            tier = 'Bronze';
            perk = 'Booking still available, but incentives are reduced until your flag count improves.';
        } else if (data.flags === 4) {
            tier = 'Watchlist';
            perk = 'You are close to restriction. Fewer incentives until flags are cleared.';
        } else {
            tier = 'Restricted';
            perk = 'Booking restrictions apply at maximum flags. Contact admin for reset.';
        }

        card.innerHTML = `
            <h3>${tier} Tier</h3>
            <p><strong>Current Flags:</strong> ${data.flags}/5</p>
            <p><strong>Deposit Percentage:</strong> ${data.deposit_percentage}%</p>
            <p>${perk}</p>
        `;
    } catch (error) {
        console.error(error);
        card.innerHTML = '<p style="color:red;">Failed to load incentives.</p>';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    showUserSection('menu');
});
