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
document.addEventListener('DOMContentLoaded', () => {
    // Display the student's Admission Number from local storage
    const admissionNo = localStorage.getItem("admission_no");
    document.getElementById('display-admission').innerText = `Welcome, ${admissionNo}`;
    
    loadMenu();
});

async function loadMenu() {
    try {
        const response = await fetch('http://127.0.0.1:8000/menu');
        const items = await response.json();
        const container = document.getElementById('menu-container');

        if (items.length === 0) {
            container.innerHTML = "<p>No items available for today yet.</p>";
            return;
        }

        // Generate HTML for each food item
        container.innerHTML = items.map(item => `
            <div class="food-card">
                <h3>${item.name}</h3>
                <p class="price">₹${item.price}</p>
                <p class="stock">Available: ${item.base_stock} portions</p>
                <button onclick="openBookingModal(${item.id}, '${item.name}')">Book Now</button>
            </div>
        `).join('');
    } catch (error) {
        console.error("Error loading menu:", error);
    }
}

let selectedItemId = null;

function openBookingModal(itemId, itemName) {
    selectedItemId = itemId;
    document.getElementById('booking-modal').style.display = 'block';
    // You can also update a title in the modal to show the item name
}

function closeModal() {
    document.getElementById('booking-modal').style.display = 'none';
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