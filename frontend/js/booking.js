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

//------------------ Cart Management ------------------
let cart = [];
function addToCart(id, name, price) {
    cart.push({ id, name, price });
    updateCartUI();
}

function updateCartUI() {
    const cartList = document.getElementById('cart-items');
    const totalDisplay = document.getElementById('cart-total');
    const checkoutBtn = document.getElementById('checkout-btn');

    // 1. Generate the HTML for all items in one go
    cartList.innerHTML = cart.map((item, index) => {
        // If it's a scalable item (like Porotta), show the number input
        if (item.category === 'scalable') {
            return `
                <div class="cart-item">
                    <span>${item.name} (Set) - ₹${item.price}</span>
                    <div class="qty-controls">
                        <input type="number" min="2" max="6" value="${item.quantity || 2}" 
                               onchange="updateQty(${index}, this.value)">
                        <button onclick="removeFromCart(${index})">❌</button>
                    </div>
                </div>`;
        }
        
        // Otherwise, show the standard row
        return `
            <div class="cart-item">
                <span>${item.name} - ₹${item.price}</span>
                <button onclick="removeFromCart(${index})">❌</button>
            </div>`;
    }).join('');

    // 2. Update the Total Price (Price * Quantity for scalable items)
    const total = cart.reduce((sum, item) => {
        const qty = item.category === 'scalable' ? (item.quantity || 2) : 1;
        return sum + (item.price * qty);
    }, 0);
    totalDisplay.innerText = total;

    // 3. Handle Button State
    if (cart.length > 0) {
        checkoutBtn.disabled = false;
        checkoutBtn.style.backgroundColor = "#2e7d32";
        checkoutBtn.style.cursor = "pointer";
    } else {
        checkoutBtn.disabled = true;
        checkoutBtn.style.backgroundColor = "#ccc";
        checkoutBtn.style.cursor = "not-allowed";
    }
}

function removeFromCart(index) {
    cart.splice(index, 1);
    updateCartUI();
}

function updateQty(index, newQty) {
    cart[index].quantity = parseInt(newQty);
    updateCartUI(); // Refresh the total price
}

function openCheckoutModal() {
    if (cart.length === 0) {
        alert("Your cart is empty!");
        return;
    }
    document.getElementById('booking-modal').style.display = 'block';
}
//------------------ Final Order Confirmation ------------------
async function confirmFinalOrder() {
    // 1. Get the basic order info
    const timeSlotEl = document.getElementById('time-slot');
    const orderTypeEl = document.getElementById('order-type');

    // 2. Safety Check: If these don't exist, stop here
    if (!timeSlotEl || !orderTypeEl) {
        console.error("Missing critical elements: check IDs for time-slot or order-type");
        return;
    }

    // 3. Prepare the data for the backend
    const payload = {
        admission_no: localStorage.getItem("admission_no"),
        item_ids: cart.map(item => item.id),
        scheduled_slot: timeSlotEl.value,
        order_type: orderTypeEl.value,
        // Use our array of selected boxes, or an empty list if take-away
        seat_ids: orderTypeEl.value === 'sit-in' ? selectedSeatIds : []
    };

    console.log("Sending payload:", payload);

    try {
        const response = await fetch('http://127.0.0.1:8000/book-multiple', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            alert("✅ Success! Your food and seats are reserved.");
            cart = []; 
            location.reload(); // Refresh to clear everything
        } else {
            const err = await response.json();
            alert("❌ Booking Failed: " + (err.detail || "Unknown error"));
        }
    } catch (error) {
        console.error("Fetch Error:", error);
    }
}
   // alert("All items booked successfully!");
    cart = [];
    updateCartUI();
    closeModal();

// seat selection logic
let selectedSeatIds = [];

async function refreshSeatList() {
    const slot = document.getElementById('time-slot').value;
    const grid = document.getElementById('seat-grid');
    grid.innerHTML = "Loading...";

    const response = await fetch(`http://127.0.0.1:8000/available-seats/${slot}`);
    const seats = await response.json();

    grid.innerHTML = ""; // Clear loader
    seats.forEach(seat => {
        const box = document.createElement('div');
        box.className = 'seat-box';
        // Display Table No - Seat No
        box.innerHTML = `T${seat.table_number}<br>S${seat.seat_number}`;

        if (seat.is_occupied) {
            box.classList.add('occupied');
        } else {
            // Check if this seat was already selected by the user
            if (selectedSeatIds.includes(seat.id)) box.classList.add('selected');
            
            box.onclick = () => {
                if (selectedSeatIds.includes(seat.id)) {
                    selectedSeatIds = selectedSeatIds.filter(id => id !== seat.id);
                    box.classList.remove('selected');
                } else if (selectedSeatIds.length < 4) {
                    selectedSeatIds.push(seat.id);
                    box.classList.add('selected');
                } else {
                    alert("Max 4 seats allowed!");
                }
                updateSeatCounter();
            };
        }
        grid.appendChild(box);
    });
}

function toggleSeatUI() {
    const orderTypeElement = document.getElementById('order-type');
    const seatModal = document.getElementById('seat-modal');

    // 1. Check if the elements exist
    if (!orderTypeElement || !seatModal) {
        console.error("Critical Error: 'order-type' or 'seat-modal' not found in HTML!");
        return;
    }

    const orderType = orderTypeElement.value;

    // 2. Logic to show/hide the pop-up
    if (orderType === 'sit-in') {
        seatModal.style.display = 'flex'; // Use 'flex' to center the pop-up
        refreshSeatList(); // Load the boxes
    } else {
        seatModal.style.display = 'none';
        selectedSeatIds = []; // Clear seats if they switch to take-away
        updateSeatCounter();
    }
}


function updateSeatCounter() {
    document.getElementById('seat-count-display').innerText = `Seats selected: ${selectedSeatIds.length}/4`;
}
function closeSeatModal() {
    document.getElementById('seat-modal').style.display = 'none';
}

