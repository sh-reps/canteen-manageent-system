// ==========================================
// 1. GLOBAL STATE & CONFIGURATION
// ==========================================
let cart = [];
let selectedSeatIds = [];
let menuItems = []; // To store items fetched from backend
let allowedFoodCount = 0;

// ==========================================
// 2. INITIALIZATION (On Page Load)
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    fetchMenu();
    // Ensure modal is hidden initially
    const modal = document.getElementById('seat-modal');
    if (modal) modal.style.display = 'none';
});

// ==========================================
// 3. CORE BOOKING FLOW LOGIC
// ==========================================

// Triggered when Dining Mode changes
function resetAndLock() {
    const type = document.getElementById('order-type').value;
    const capacitySection = document.getElementById('capacity-section');
    const sitInConfig = document.getElementById('sit-in-config');
    const parcelConfig = document.getElementById('parcel-config');
    const foodArea = document.getElementById('food-selection-area');
    
    // Reset all progress if they switch modes
    cart = [];
    selectedSeatIds = [];
    allowedFoodCount = 0;
    
    // UI Reset
    if (!type) {
        capacitySection.style.display = 'none';
        foodArea.style.opacity = "0.5";
        foodArea.style.pointerEvents = "none";
        return;
    }

    capacitySection.style.display = 'block';
    sitInConfig.style.display = (type === 'sit-in') ? 'block' : 'none';
    parcelConfig.style.display = (type === 'parcel') ? 'block' : 'none';
    
    updateLimits(); 
    renderCart();
}

// Update the allowed items based on Seats or Parcel Count
function updateLimits() {
    const type = document.getElementById('order-type').value;
    const foodArea = document.getElementById('food-selection-area');
    
    if (type === 'sit-in') {
        allowedFoodCount = selectedSeatIds.length;
        document.getElementById('seat-status').innerText = `Seats selected: ${allowedFoodCount}`;
    } else if (type === 'parcel') {
        allowedFoodCount = parseInt(document.getElementById('parcel-count').value) || 0;
    }

    document.getElementById('max-items').innerText = allowedFoodCount;

    // Only unlock food if they've set a capacity > 0
    if (allowedFoodCount > 0) {
        foodArea.style.opacity = "1";
        foodArea.style.pointerEvents = "auto";
    } else {
        foodArea.style.opacity = "0.5";
        foodArea.style.pointerEvents = "none";
        cart = []; // Clear food if they reduce capacity below cart size
    }
    
    validateFinalButton();
}

// ==========================================
// 4. SEAT MODAL LOGIC (SIT-IN ONLY)
// ==========================================
function toggleSeatUI() {
    const modal = document.getElementById('seat-modal');
    if (modal) {
        modal.style.display = 'flex';
        refreshSeatList();
    }
}

function closeSeatModal() {
    document.getElementById('seat-modal').style.display = 'none';
    updateLimits(); // Refresh the food limit based on final seat count
}

async function refreshSeatList() {
    const grid = document.getElementById('seat-grid');
    const slot = document.getElementById('time-slot').value;
    
    if (!slot) {
        grid.innerHTML = "<p>Please select a time slot first.</p>";
        return;
    }

    grid.innerHTML = "Loading...";
    try {
        const response = await fetch(`http://127.0.0.1:8000/available-seats/${slot}`);
        const seats = await response.json();

        grid.innerHTML = ""; 
        seats.forEach(seat => {
            const box = document.createElement('div');
            box.className = 'seat-box';
            box.innerText = `${seat.table_number}-${seat.seat_number}`;

            if (selectedSeatIds.includes(seat.id)) box.classList.add('selected');

            if (seat.is_occupied) {
                box.classList.add('occupied');
            } else {
                box.onclick = () => {
                    const index = selectedSeatIds.indexOf(seat.id);
                    if (index > -1) {
                        selectedSeatIds.splice(index, 1);
                        box.classList.remove('selected');
                    } else if (selectedSeatIds.length < 4) {
                        selectedSeatIds.push(seat.id);
                        box.classList.add('selected');
                    } else {
                        alert("Max 4 seats allowed!");
                    }
                    document.getElementById('seat-count-display').innerText = `Selected: ${selectedSeatIds.length}/4`;
                };
            }
            grid.appendChild(box);
        });
    } catch (err) {
        grid.innerHTML = "Error loading seats.";
    }
}

// ==========================================
// 5. FOOD SELECTION LOGIC
// ==========================================
async function fetchMenu() {
    try {
        const response = await fetch('http://127.0.0.1:8000/food-items');
        const data = await response.json();
        
        // SAFETY CHECK: Ensure data is an array before setting menuItems
        if (Array.isArray(data)) {
            menuItems = data;
        } else if (data && typeof data === 'object') {
            // If it's a single object, wrap it in an array
            menuItems = [data];
        } else {
            menuItems = [];
        }
        
        renderMenu();
    } catch (err) {
        console.error("Menu failed to load", err);
        const container = document.getElementById('cart-items-container');
        if (container) container.innerHTML = "<p style='color:red;'>Unable to load menu. Check backend connection.</p>";
    }
}

function renderMenu() {
    const modalContainer = document.getElementById('cart-items-container');
    const mainPageContainer = document.getElementById('menu-container');

    if (modalContainer) modalContainer.innerHTML = "";
    if (mainPageContainer) mainPageContainer.innerHTML = "";

    // Safety check if no items exist
    if (!menuItems || menuItems.length === 0) {
        if (mainPageContainer) mainPageContainer.innerHTML = "<p>No items available today.</p>";
        return;
    }

    menuItems.forEach(item => {
        // 1. Fill the main landing page (The big cards)
        if (mainPageContainer) {
            const card = document.createElement('div');
            card.className = 'food-card';
            card.innerHTML = `
                <h3>${item.name}</h3>
                <p class="price">₹${item.price}</p>
                <button class="plan-btn" onclick="openCartModal()">Plan This Meal</button>
            `;
            mainPageContainer.appendChild(card);
        }

        // 2. Fill the "Add Items" list inside the Planning Modal
        if (modalContainer) {
            const row = document.createElement('div');
            row.className = 'food-item-row';
            row.innerHTML = `
                <span>${item.name} (₹${item.price})</span>
                <button class="add-btn" onclick="addItemToPlan(${item.id}, '${item.name}')">+</button>
            `;
            modalContainer.appendChild(row);
        }
    });
}

function addItemToPlan(id, name) {
    if (cart.length < allowedFoodCount) {
        cart.push({ id, name });
        renderCart();
    } else {
        alert(`You can only add ${allowedFoodCount} items based on your current selection.`);
    }
    validateFinalButton();
}

function renderCart() {
    const list = document.getElementById('cart-summary-list');
    if (!list) return;
    list.innerHTML = cart.map((item, index) => `
        <li>${item.name} <button onclick="removeFromCart(${index})">x</button></li>
    `).join('');
}

function removeFromCart(index) {
    cart.splice(index, 1);
    renderCart();
    validateFinalButton();
}

// ==========================================
// 6. FINAL VALIDATION & SUBMISSION
// ==========================================

async function checkSlotAvailability() {
    const slot = document.getElementById('time-slot').value;
    const type = document.getElementById('order-type').value;

    if (type === 'parcel' && slot) {
        const response = await fetch(`http://127.0.0.1:8000/check-capacity/${slot}`);
        const data = await response.json();
        
        if (data.remaining <= 0) {
            alert("This 15-minute slot is full for parcels (Max 25). Please pick another time.");
            document.getElementById('time-slot').value = ""; 
        }
    }
    validateFinalButton();
}

function validateFinalButton() {
    const confirmBtn = document.getElementById('final-confirm');
    const type = document.getElementById('order-type').value;
    const slot = document.getElementById('time-slot').value;

    let isReady = (slot !== "" && type !== "" && cart.length === allowedFoodCount && allowedFoodCount > 0);
    confirmBtn.disabled = !isReady;
}

async function processBooking() {
    const payload = {
        admission_no: localStorage.getItem("admission_no"),
        item_ids: cart.map(i => i.id),
        scheduled_slot: document.getElementById('time-slot').value,
        order_type: document.getElementById('order-type').value,
        seat_ids: selectedSeatIds
    };

    const response = await fetch('http://127.0.0.1:8000/book-multiple', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (response.ok) {
        alert("Booking Successful!");
        location.reload();
    } else {
        alert("Booking failed. Please check capacity.");
    }
}