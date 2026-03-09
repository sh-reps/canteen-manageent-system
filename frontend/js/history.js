

// frontend/history.js
async function loadHistory() {
    const admissionNo = localStorage.getItem('admission_no');
    if (!admissionNo) return;

    try {
        const response = await fetch(`http://127.0.0.1:8000/order-history/${admissionNo}`);
        const orders = await response.json();
        console.log('Orders loaded:', orders); // Debug log
        const tbody = document.getElementById('history-body');
        tbody.innerHTML = "";

        if (!orders || orders.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center">No orders found</td></tr>';
            return;
        }

    orders.forEach(order => {
        const foodItems = order.items.map(i => i.food_item.name).join(", ");
        
        // Format the booking date
        const bookingDate = new Date(order.booking_date).toLocaleDateString();
        
        // Check if seats exist in the JSON response
        const seatNumbers = (order.booked_seats && order.booked_seats.length > 0) 
        ? order.booked_seats.map(s => `T${s.seat.table_number}-S${s.seat.seat_number}`).join(", ")
        : "Parcel";
        
        // Determine if order can be cancelled based on meal type and time
        const mealType = order.meal_type || 'lunch';
        const canCancel = isOrderCancellable(order, mealType);
        const cancelButton = canCancel ? `<button class="btn-danger" onclick="cancelOrder(${order.id}, '${mealType}')">Cancel</button>` : `<span class="text-disabled">Cannot Cancel</span>`;
        
        const row = `
            <tr>
                <td>${bookingDate}</td>
                <td>${order.scheduled_slot}</td>
                <td>${foodItems}</td>
                <td>${seatNumbers}</td> 
                <td><span class="status-${order.status}">${order.status}</span></td>
                <td>${cancelButton}</td>
            </tr>`;
        tbody.innerHTML += row;
    });
    } catch (err) {
        console.error("History failed to load:", err);
        const tbody = document.getElementById('history-body');
        tbody.innerHTML = '<tr><td colspan="6" class="text-center" style="color: red;">Error loading history</td></tr>';
    }
}

function isOrderCancellable(order, mealType) {
    // Can only cancel "confirmed" orders
    if (order.status !== 'confirmed') return false;
    
    // Get current time
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const currentTimeInMinutes = currentHour * 60 + currentMinute;
    
    if (mealType === 'breakfast') {
        // Breakfast: Can cancel before 7:00 AM
        return currentTimeInMinutes < (7 * 60); // 7:00 AM = 420 minutes
    } else {
        // Lunch: Can cancel before 9:00 AM
        return currentTimeInMinutes < (9 * 60); // 9:00 AM = 540 minutes
    }
}

async function cancelOrder(orderId, mealType) {
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

loadHistory();