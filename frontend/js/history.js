

// frontend/history.js
function generateOrderRow(order) {
    const foodItems = order.items.map(i => i.food_item.name).join(", ");
    const bookingDate = new Date(order.booking_date).toLocaleDateString();
    let orderDate = order.created_at ? new Date(order.created_at).toLocaleString() : '-';
    const seatNumbers = (order.booked_seats && order.booked_seats.length > 0) 
        ? order.booked_seats.map(s => `T${s.seat.table_number}-S${s.seat.seat_number}`).join(", ")
        : `Parcel${order.drop_point ? ` (${order.drop_point.toUpperCase()})` : ''}`;
    const deliveryInfo = order.delivery_window ? `<div style="font-size:0.8rem; color:#2ecc71;">Delivery: ${order.delivery_window}</div>` : '';
    
    // Show cancel button only for 'confirmed' orders. The backend will validate the time.
    const actionButton = order.status === 'confirmed'
        ? `<button class="btn-danger" onclick="cancelOrder(${order.id})">Cancel</button>`
        : `<span class="text-disabled">Cannot Cancel</span>`;
    
    return `
        <tr>
            <td>${bookingDate}</td>
            <td>${orderDate}</td>
            <td>${order.scheduled_slot}</td>
            <td>${foodItems}</td>
            <td>${seatNumbers}${deliveryInfo}</td> 
            <td><span class="status-${order.status}">${order.status}</span></td>
            <td>${actionButton}</td>
        </tr>`;
}

async function loadHistory() {
    const admissionNo = localStorage.getItem('admission_no');
    if (!admissionNo) return;

    const originalTbody = document.getElementById('history-body');
    if (!originalTbody) {
        console.error("#history-body not found. Cannot render orders.");
        return;
    }
    const originalTable = originalTbody.closest('table');
    const container = originalTable ? originalTable.parentElement : document.body;

    // Change page title
    const h1 = container.querySelector('h1');
    if (h1) h1.textContent = "My Bookings";
    document.title = "My Bookings";

    // Hide original table, we will replace it with a new structure
    originalTable.style.display = 'none';

    // Create new sections if they don't exist to avoid duplicating on re-calls
    if (!document.getElementById('upcoming-orders-section')) {
        const upcomingSection = document.createElement('div');
        upcomingSection.id = 'upcoming-orders-section';
        upcomingSection.innerHTML = `
            <h2>Upcoming Pre-Booked Orders</h2>
            <p>These are your active bookings. You can cancel them before the cut-off time for a refund.</p>
            <table class="table">
                ${originalTable.querySelector('thead').outerHTML}
                <tbody id="upcoming-orders-body"></tbody>
            </table>
        `;
        container.insertBefore(upcomingSection, originalTable);

        const pastSection = document.createElement('div');
        pastSection.id = 'past-orders-section';
        pastSection.style.marginTop = '40px';
        pastSection.innerHTML = `
            <h2>Order History</h2>
            <p>These are your past, collected, or cancelled orders.</p>
            <table class="table">
                ${originalTable.querySelector('thead').outerHTML}
                <tbody id="past-orders-body"></tbody>
            </table>
        `;
        container.appendChild(pastSection);
    }

    const upcomingTbody = document.getElementById('upcoming-orders-body');
    const pastTbody = document.getElementById('past-orders-body');
    upcomingTbody.innerHTML = '<tr><td colspan="7" class="text-center">Loading...</td></tr>';
    pastTbody.innerHTML = '<tr><td colspan="7" class="text-center">Loading...</td></tr>';

    try {
        const response = await fetch(`http://127.0.0.1:8000/order-history/${admissionNo}`);

        if (!response.ok) {
            const text = await response.text();
            console.error("Server error:", text);
            upcomingTbody.innerHTML = `<tr><td colspan="7" class="text-center" style="color: red;">Server error: ${text}</td></tr>`;
            pastTbody.innerHTML = `<tr><td colspan="7" class="text-center" style="color: red;">Server error: ${text}</td></tr>`;
            return;
        }

        const allOrders = await response.json();
        
        const today = getSimulatedDate();
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
        }).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)); // Sort past orders newest first

        // Render upcoming orders
        upcomingTbody.innerHTML = "";
        if (upcomingOrders.length === 0) {
            upcomingTbody.innerHTML = '<tr><td colspan="7" class="text-center">No upcoming pre-booked orders found.</td></tr>';
        } else {
            upcomingOrders.forEach(order => {
                upcomingTbody.innerHTML += generateOrderRow(order);
            });
        }

        // Render past orders
        pastTbody.innerHTML = "";
        if (pastOrders.length === 0) {
            pastTbody.innerHTML = '<tr><td colspan="7" class="text-center">No past orders found.</td></tr>';
        } else {
            pastOrders.forEach(order => {
                pastTbody.innerHTML += generateOrderRow(order);
            });
        }

    } catch (err) {
        console.error("History failed to load:", err);
        upcomingTbody.innerHTML = '<tr><td colspan="7" class="text-center" style="color: red;">Error loading upcoming orders.</td></tr>';
        pastTbody.innerHTML = '<tr><td colspan="7" class="text-center" style="color: red;">Error loading order history.</td></tr>';
    }
}

async function cancelOrder(orderId) {
    if (!confirm('Are you sure you want to cancel this order? Items will be returned to the stock pool.')) {
        return;
    }
    
    try {
        const response = await fetch(`http://127.0.0.1:8000/bookings/${orderId}/cancel`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        
        if (response.ok) {
            const data = await response.json();
            alert(`✅ ${data.message}`);
            loadHistory(); // Refresh the history
        } else {
            const error = await response.json();
            alert(`❌ ${error.detail || 'Error cancelling order'}`);
        }
    } catch (error) {
        console.error('Error cancelling order:', error);
        alert(`❌ Network error: ${error.message}`);
    }
}

document.addEventListener('DOMContentLoaded', loadHistory);