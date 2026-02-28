async function confirmBooking() {
    // Retrieve the logged-in student's ID from browser memory
    const admissionNo = localStorage.getItem("admission_no");
    
    const bookingData = {
        admission_no: admissionNo,
        item_id: selectedItemId,
        scheduled_slot: document.getElementById('time-slot').value,
        order_type: document.getElementById('order-type').value
    };

    const response = await fetch('http://127.0.0.1:8000/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bookingData)
    });
   
}
async function loadMenu() {
    const response = await fetch('http://127.0.0.1:8000/menu');
    const items = await response.json();
    const container = document.getElementById('menu-container');
    
    container.innerHTML = items.map(item => `
        <div class="food-card">
            <h3>${item.name}</h3>
            <p>Price: ₹${item.price}</p>
            <p>Available: ${item.base_stock}</p>
            <button onclick="openBookingModal(${item.id})">Book Now</button>
        </div>
    `).join('');
}

async function placeOrder(itemId) {
    const admission_no = localStorage.getItem("admission_no"); // Retrieve the ID
    const slot = document.getElementById('time-slot').value;
    const type = document.getElementById('order-type').value;

    const response = await fetch('http://127.0.0.1:8000/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            admission_no: admission_no,
            item_id: itemId,
            scheduled_slot: slot,
            order_type: type
        })
    });

    const result = await response.json();
    alert(result.message || result.detail);
}