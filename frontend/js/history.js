

// frontend/history.js
async function loadHistory() {
    const admissionNo = localStorage.getItem('user_admission_no');
    if (!admissionNo) return;

    try {
        const response = await fetch(`http://127.0.0.1:8000/order-history/${admissionNo}`);
        const orders = await response.json();
        const tbody = document.getElementById('history-body');
        tbody.innerHTML = "";

        // history.js inside loadHistory()
    orders.forEach(order => {
        const foodItems = order.items.map(i => i.food_item.name).join(", ");
        
        // Check if seats exist in the JSON response
        const seatDisplay = (order.booked_seats && order.booked_seats.length > 0) 
        ? order.booked_seats.map(s => `T${s.seat.table_number}-S${s.seat.seat_number}`).join(", ")
        : "Parcel";
            const row = `
            <tr>
                <td>${order.booking_date}</td>
                <td>${order.scheduled_slot}</td>
                <td>${foodItems}</td>
                <td>${seatNumbers}</td> <td><span class="status-${order.status}">${order.status}</span></td>
            </tr>`;
        tbody.innerHTML += row;
    });
    } catch (err) {
        console.error("History failed to load:", err);
    }
}
loadHistory();