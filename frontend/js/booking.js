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
        <button onclick="addToCart(${item.id}, '${item.name}', ${item.price})">Add to Cart</button>
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
let cart = [];

function addToCart(id, name, price) {
    cart.push({ id, name, price });
    updateCartUI();
}

function updateCartUI() {
    const cartList = document.getElementById('cart-items');
    const totalDisplay = document.getElementById('cart-total');
    
    // 1. Clear the old list
    cartList.innerHTML = "";
    
    // 2. Add each item from the cart array
    cart.forEach((item, index) => {
        const div = document.createElement('div');
        div.className = 'cart-item';
        div.innerHTML = `
            <span>${item.name} - ₹${item.price}</span>
            <button onclick="removeFromCart(${index})">Remove</button>
        `;
        cartList.appendChild(div);
    });

    // 3. Update the Total Price
    const total = cart.reduce((sum, item) => sum + item.price, 0);
    totalDisplay.innerText = total;

    const checkoutBtn = document.getElementById('checkout-btn');
    if (cart.length > 0) {
        checkoutBtn.disabled = false;
        checkoutBtn.style.backgroundColor = "#2e7d32"; // Optional: make it green when active
        checkoutBtn.style.cursor = "pointer";
    } else {
        checkoutBtn.disabled = true;
        checkoutBtn.style.backgroundColor = "#ccc";
    }
}

function removeFromCart(index) {
    cart.splice(index, 1);
    updateCartUI();
}

function openCheckoutModal() {
    if (cart.length === 0) {
        alert("Your cart is empty!");
        return;
    }
    document.getElementById('booking-modal').style.display = 'block';
}

async function confirmFinalOrder() {
    const admissionNo = localStorage.getItem("admission_no");
    const slot = document.getElementById('time-slot').value;
    const type = document.getElementById('order-type').value;
    const seatId = document.getElementById('seat-id').value;

    if (cart.length === 0) {
        alert("Your cart is empty!");
        return;
    }

    // Prepare the data to match your 'BookingCreate' schema
    const payload = {
        admission_no: admissionNo,
        item_ids: cart.map(item => item.id), // Sending the whole list
        scheduled_slot: slot,
        order_type: type,
        // Only send seat_id if it's a sit-in order
        seat_id: type === 'sit-in' ? parseInt(seatId) : null 
    };

    const response = await fetch('http://127.0.0.1:8000/book-multiple', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (response.ok) {
        alert("✅ Order Confirmed! See you at " + slot);
        cart = []; // Clear the cart locally
        updateCartUI();
        closeModal();
        // Optional: Redirect to a 'My Bookings' page
    } else {
        const error = await response.json();
        alert("❌ Failed: " + (error.detail || "Unknown error"));
    }
}

    alert("All items booked successfully!");
    cart = [];
    updateCartUI();
    closeModal();


function toggleSeatSelection() {
    const type = document.getElementById('order-type').value;
    const area = document.getElementById('seat-selection-area');
    
    if (type === 'sit-in') {
        area.style.display = 'block';
        refreshSeatList(); // Load seats immediately
    } else {
        area.style.display = 'none';
    }
}

async function refreshSeatList() {
    const slot = document.getElementById('time-slot').value;
    const seatSelect = document.getElementById('seat-id');

    // 1. Show a 'Loading' state so the user knows something is happening
    seatSelect.innerHTML = "<option>Loading seats...</option>";

    try {
        const response = await fetch(`http://127.0.0.1:8000/available-seats/${slot}`);
        const seats = await response.json();

        // 2. Clear the loading message
        seatSelect.innerHTML = "";

        // 3. Populate with 4 seats per table logic
        seats.forEach(seat => {
            const option = document.createElement('option');
            option.value = seat.id;
            option.innerText = `Table ${seat.table_number} - Seat ${seat.seat_number}`;
            
            if (seat.is_occupied) {
                option.disabled = true;
                option.innerText += " (BOOKED)";
                option.style.color = "red";
            }
            seatSelect.appendChild(option);
        });
    } catch (err) {
        console.error("Failed to fetch seats:", err);
        seatSelect.innerHTML = "<option>Error loading seats</option>";
    }
}
