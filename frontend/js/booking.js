// ==========================================
// 1. GLOBAL STATE & CONFIGURATION
// ==========================================
let cart = [];
let selectedSeatIds = [];
let menuItems = []; // To store items fetched from backend
let allowedFoodCount = 0;
const SIT_IN_SLOTS = ["12:00:00", "12:25:00", "12:50:00", "13:15:00"]; // Match backend format

// ==========================================
// 2. INITIALIZATION (On Page Load)
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    fetchMenu();
    resetAndLock();
   
    // Ensure modal is hidden initially
    const modal = document.getElementById('seat-modal');
    if (modal) modal.style.display = 'none';
});

// ==========================================
// 3. CORE BOOKING FLOW LOGIC
// ==========================================

// Triggered when Dining Mode changes
// Update this function in your booking.js

function resetAndLock() {
    const type = document.getElementById('order-type').value;
    const timeSlotPicker = document.getElementById('time-slot');
    const capacitySection = document.getElementById('capacity-section');
    const sitInConfig = document.getElementById('sit-in-config');

    // Reset state
    cart = [];
    selectedSeatIds = [];
    allowedFoodCount = 0;

    // Clear and refill the Time Slot dropdown
    timeSlotPicker.innerHTML = '<option value="">Choose Time...</option>';

    if (type === 'sit-in') {
        const sitInSlots = ["12:00", "12:25", "12:50", "13:15"];
        sitInSlots.forEach(time => {
            let opt = document.createElement('option');
            opt.value = time;
            opt.text = `${time} - ${calculateEndTime(time)}`;
            timeSlotPicker.appendChild(opt);
        });
        sitInConfig.style.display = 'block';
        document.getElementById('sit-in-config').style.display = 'block';
        document.getElementById('parcel-config').style.display = 'none';
    } else if (type === 'parcel') {
        // Keep your 15-min intervals for parcels if you like
        const parcelSlots = ["12:00", "12:15", "12:30", "12:45", "13:00", "13:15", "13:30"];
        parcelSlots.forEach(time => {
            let opt = document.createElement('option');
            opt.value = time;
            opt.text = time;
            timeSlotPicker.appendChild(opt);
        });
        document.getElementById('sit-in-config').style.display = 'none';
        document.getElementById('parcel-config').style.display = 'block';
    }

    capacitySection.style.display = type ? 'block' : 'none';
    updateLimits(); 
    renderCart();
}

function calculateEndTime(startTime) {
    const [h, m] = startTime.split(':').map(Number);
    let newM = m + 25;
    return `${h}:${newM === 60 ? '00' : newM}`;
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
        
        menuItems = Array.isArray(data) ? data : [data];
        
        // This is the key: call renderMenu() only after menuItems is populated
        renderMenu(); 
    } catch (err) {
        console.error("Menu failed to load", err);
    }
}

function renderMenu() {
    const modalContainer = document.getElementById('cart-items-container');
    const mainPageContainer = document.getElementById('menu-container');
    const slot = document.getElementById('time-slot').value;

    // Clear previous views
    if (modalContainer) modalContainer.innerHTML = "";
    if (mainPageContainer) mainPageContainer.innerHTML = "";

    // Determine Meal Type based on current real-world time if no slot is selected
    let currentMealType;
    if (slot) {
        const hour = parseInt(slot.split(':')[0]);
        currentMealType = (hour >= 11) ? 'lunch' : 'breakfast';
    } else {
        const now = new Date();
        currentMealType = (now.getHours() >= 11) ? 'lunch' : 'breakfast';
    }

    const filteredItems = menuItems.filter(item => item.meal_type === currentMealType);

    // 1. RENDER MAIN PAGE (Works even without a slot selected)
    if (mainPageContainer) {
        if (filteredItems.length === 0) {
            mainPageContainer.innerHTML = `<p>No ${currentMealType} items available right now.</p>`;
        } else {
            filteredItems.forEach(item => {
                const card = document.createElement('div');
                card.className = 'food-card';
                card.innerHTML = `
                    <h3>${item.name}</h3>
                    <p class="price">₹${item.price_full}</p>
                    <button class="plan-btn" onclick="openCartModal()">Plan This Meal</button>
                `;
                mainPageContainer.appendChild(card);
            });
        }
    }

    // 2. RENDER PLANNING MODAL (Strictly requires a slot)
    if (modalContainer) {
        if (!slot) {
            modalContainer.innerHTML = "<p class='status-msg'>Please select a time slot first to add items.</p>";
        } else {
            filteredItems.forEach(item => {
                const row = document.createElement('div');
                row.className = 'food-item-row';
                row.innerHTML = `
                    <div class="item-details">
                        <span class="item-name">${item.name} (₹${item.price_full})</span>
                        <span class="item-meta">${item.category}</span>
                    </div>
                    <button class="add-btn" onclick='addItemToPlan(${JSON.stringify(item)})'>+</button>
                `;
                modalContainer.appendChild(row);
            });
        }
    }
}
// Updated logic for Breakfast/Lunch and Category constraints
function addItemToPlan(item) {
    const mealCount = cart.filter(i => i.category === 'meal').length;
    const curryCount = cart.filter(i => i.category === 'curry').length;
    const sideCount = cart.filter(i => i.category === 'side').length;

    // 1. Capacity Check: Seats reserved define the max meals
    if (item.category === 'meal' && mealCount >= allowedFoodCount) {
        alert(`You have reserved ${allowedFoodCount} seats. Max ${allowedFoodCount} meals allowed.`);
        return;
    }

    // 2. Dependency Check: Must have a Meal before adding Curry or Side
    if (mealCount === 0 && (item.category === 'curry' || item.category === 'side')) {
        alert("Please add a Main Meal (e.g., Rice, Biriyani, or Appam) first!");
        return;
    }

    // 3. Ratio Check: 1 Curry and 1 Side per Meal
    if (item.category === 'curry' && curryCount >= mealCount) {
        alert("You can only add one Curry per Meal selected.");
        return;
    }
    if (item.category === 'side' && sideCount >= mealCount) {
        alert("You can only add one Side Dish per Meal selected.");
        return;
    }

    // 4. Portion Logic
    if (item.has_portions) {
        openPortionModal(item); // Pops up Half/Full options
    } else {
        addToCart(item.id, item.name, 'Full', item.price_full, item.category); // Fixed items like Omelette
    }
}

function openPortionModal(item) {
    const modal = document.getElementById('portion-modal'); // Make sure this exists in your HTML!
    modal.style.display = 'flex';
    
    document.getElementById('half-btn').onclick = () => {
        addToCart(item.id, item.name, 'Half', item.price_half, item.category);
        modal.style.display = 'none';
    };
    document.getElementById('full-btn').onclick = () => {
        addToCart(item.id, item.name, 'Full', item.price_full, item.category);
        modal.style.display = 'none';
    };
}

function addToCart(id, name, portion, price, category) {
    cart.push({ id, name, portion, price, category });
    renderCart();
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