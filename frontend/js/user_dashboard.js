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
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
}

function getDashboardNow() {
    if (typeof getSimulatedDate === 'function') return getSimulatedDate();
    return new Date();
}

function canCancelDashboardOrder(order) {
    if (order.status !== 'confirmed') return false;
    const now = getDashboardNow();

    const [y, m, d] = order.booking_date.split('-').map(Number);
    const mealStart = new Date(y, m - 1, d, 23, 59, 59);

    if (order.meal_type === 'breakfast') {
        mealStart.setHours(7, 0, 0, 0);
    } else if (order.meal_type === 'lunch') {
        mealStart.setHours(11, 0, 0, 0);
    }

    return now < mealStart;
}

function buildOrderRow(order, includeAction = false) {
    const foodItems = (order.items || []).map(i => i.food_item?.name || 'Unknown').join(', ');
    const bookingDate = new Date(order.booking_date).toLocaleDateString();
    const orderDate = order.created_at ? new Date(order.created_at).toLocaleString() : '-';
    const location = (order.booked_seats && order.booked_seats.length > 0)
        ? order.booked_seats.map(s => `T${s.seat.table_number}-S${s.seat.seat_number}`).join(', ')
        : `Parcel${order.drop_point ? ` (${order.drop_point.toUpperCase()})` : ''}`;

    const actionButton = canCancelDashboardOrder(order)
        ? `<button class="btn-danger" onclick="cancelOrderFromDashboard(${order.id})">Cancel</button>`
        : `<span class="text-disabled">Cannot Cancel</span>`;

    return `
        <tr>
            <td>${bookingDate}</td>
            <td>${orderDate}</td>
            <td>${order.scheduled_slot}</td>
            <td>${escapeHtml(foodItems)}</td>
            <td>${escapeHtml(location)}</td>
            <td><span class="status-${order.status}">${order.status}</span></td>
            ${includeAction ? `<td>${actionButton}</td>` : ''}
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
    historyBody.innerHTML = '<tr><td colspan="6" class="text-center">Loading...</td></tr>';

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
            ? pastOrders.map(order => buildOrderRow(order, false)).join('')
            : '<tr><td colspan="6" class="text-center">No past orders.</td></tr>';
    } catch (error) {
        console.error(error);
        upcomingBody.innerHTML = '<tr><td colspan="7" class="text-center" style="color:red;">Failed to load orders.</td></tr>';
        historyBody.innerHTML = '<tr><td colspan="6" class="text-center" style="color:red;">Failed to load orders.</td></tr>';
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

document.addEventListener('DOMContentLoaded', () => {
    showUserSection('menu');
});
