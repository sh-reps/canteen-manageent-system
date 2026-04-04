let logicStatus = {lunch_1am: false, breakfast_7am: false, breakfast_5pm: false};
// Global logout function for navbar button
function logout() {
    localStorage.clear();
    window.location.href = '/';
}
// ==========================================
// 1. GLOBAL STATE & CONFIGURATION
// ==========================================
let cart = []; // Now an array of { item: {...}, quantity: #, portion: '...', price: # }
let selectedSeatIds = [];
let menuItems = []; // To store items fetched from backend
let allowedFoodCount = 0;
let selectedDate = null; // To store the selected booking date
let currentViewMode = 'pre-order';
let currentMealType = 'breakfast';
let blockedHolidayDates = [];
let eventDates = [];
const SIT_IN_SLOTS = ["12:00:00", "12:25:00", "12:50:00", "13:15:00"]; // Match backend format
let cachedUserFlags = null;

// ==========================================
// 2. INITIALIZATION (On Page Load)
// ==========================================
document.addEventListener('DOMContentLoaded', () => {

    fetchLogicStatus().then(() => {
        fetchMenu();
        initializeNav();
    });
});

async function fetchLogicStatus() {
    try {
        const res = await fetch('http://127.0.0.1:8000/stock-logic-status');
        if (res.ok) {
            logicStatus = await res.json();
        }
    } catch (e) { logicStatus = {lunch_1am: false, breakfast_7am: false}; }
}

window.showFoodInfo = function(item) {
    let modal = document.getElementById('food-info-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'food-info-modal';
        modal.className = 'modal-overlay';
        modal.style.zIndex = '9999999';
        document.body.appendChild(modal);
    }
    
    const priceHtml = item.has_portions 
        ? `<strong>Full:</strong> ₹${item.price_full} &nbsp;|&nbsp; <strong>Half:</strong> ₹${item.price_half || 'N/A'}` 
        : `<strong>Price:</strong> ₹${item.price_full}`;

    // --- Conditionally build the stock information block ---
    let stockHtml = '';
    const now = getSimulatedDate();
    const today = new Date(now);
    today.setHours(0,0,0,0);
    
    // If no date is selected yet (viewing from main menu), smartly default to the relevant date
    let selDate;
    if (selectedDate) {
        selDate = new Date(selectedDate);
    } else {
        selDate = new Date(today);
        // If today's cutoff has passed, users viewing the main menu are likely planning for tomorrow
        if (currentMealType === 'breakfast' && logicStatus.breakfast_5pm) {
            selDate.setDate(selDate.getDate() + 1);
        }
    }
    selDate.setHours(0,0,0,0);
    const isToday = selDate.getTime() === today.getTime();

    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const isTomorrow = selDate.getTime() === tomorrow.getTime();
    const selYear = selDate.getFullYear();
    const selMonth = String(selDate.getMonth() + 1).padStart(2, '0');
    const selDay = String(selDate.getDate()).padStart(2, '0');
    const selDateString = `${selYear}-${selMonth}-${selDay}`;
    const isWeekendDate = selDate.getDay() === 0 || selDate.getDay() === 6;
    const isHolidayDate = blockedHolidayDates.includes(selDateString);
    const isEventDate = eventDates.includes(selDateString);
    const isWorkingDay = !isHolidayDate && (!isWeekendDate || isEventDate);

    let isOver = false;
    let overMessage = "";
    if (isToday) {
        const currentHour = now.getHours();
        const currentMins = now.getMinutes();
        if (currentMealType === 'breakfast' && (currentHour > 9 || (currentHour === 9 && currentMins >= 30))) {
            isOver = true;
            overMessage = "Breakfast over for today.";
        } else if (currentMealType === 'lunch' && currentHour >= 14) {
            isOver = true;
            overMessage = "Lunch over for today.";
        }
    }

    let showStock = false;
    let stockCount = 0;
    let stockPoolName = '';

    // Determine which pool to show based on view mode and logic status
    if (currentViewMode === 'pre-order') {
        stockPoolName = 'Pre-order';
        if (currentMealType === 'lunch' && isToday && logicStatus.lunch_1am) {
            showStock = true;
            stockCount = item.prebook_pool;
        } else if (currentMealType === 'breakfast' && (isToday || (isTomorrow && logicStatus.breakfast_5pm))) {
            showStock = true;
            stockCount = item.prebook_pool;
        }
    } else if (currentViewMode === 'walk-in') {
        stockPoolName = 'Walk-in';
        if (currentMealType === 'lunch' && isToday) {
            showStock = true;
            stockCount = item.walkin_pool;
        } else if (currentMealType === 'breakfast') {
            if (isToday && logicStatus.breakfast_7am) { // Today's breakfast after 7am
                showStock = true;
                stockCount = item.walkin_pool;
            } else if (isTomorrow && logicStatus.breakfast_5pm) { // Tomorrow's breakfast walk-in pool is visible after 5pm today
                showStock = true;
                stockCount = item.walkin_pool;
            }
        } else if (currentMealType === 'snack' && isToday) { // Snacks are always walk-in for today
            showStock = true;
            stockCount = item.walkin_pool;
        }
    }

    // Bypassing status/stock labels for non-working days and for drinks.
    if (isWorkingDay) {
        if (isOver && isToday) {
            stockHtml = `
                <div style="background: #ffeaea; padding: 12px; border-radius: 6px; margin-bottom: 15px; font-size: 0.9rem; border: 1px solid #ffb3b3; text-align: left;">
                    <strong style="color: #d9534f; display: block; margin-bottom: 5px;">Service Ended</strong>
                    <span style="color: #333;">${overMessage}</span>
                </div>
            `;
        } else if (showStock && item.category !== 'drink') {
            // Only show stock info if there was an initial base stock (pre-orders),
            // or if there is currently stock in the pool. This prevents showing "Sold Out"
            // for items that had zero pre-orders and thus a zero-sized buffer.
            if (item.admin_base_stock > 0 || stockCount > 0) {
                const dayName = selDate.toLocaleDateString('en-US', { weekday: 'long' });
                const stockMessage = stockCount > 0 ? `Only <strong>${stockCount}</strong> left` : 'Sold Out';
                stockHtml = `
                    <div style="background: #e9f5ff; padding: 12px; border-radius: 6px; margin-bottom: 15px; font-size: 0.9rem; border: 1px solid #b3d9ff; text-align: left;">
                        <strong style="color: #0056b3; display: block; margin-bottom: 5px;">${stockPoolName} Stock for ${dayName}</strong>
                        <span style="color: #333;">${stockMessage}</span>
                    </div>
                `;
            }
        }
    }

    const imgHtml = item.image_url ? `<img src="${item.image_url}" alt="${item.name}" style="width: 100%; border-radius: 8px; margin-bottom: 15px; max-height: 180px; object-fit: cover; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">` : '';
    
    modal.innerHTML = `
        <div class="modal-content booking-card" style="max-width: 450px; max-height: 85vh; overflow-y: auto; text-align: center; background: #111a22; color: #deeaef; position: relative; padding: 25px; border: 1px solid rgba(255,255,255,0.12);">
            <button class="close-x" onclick="document.getElementById('food-info-modal').style.display='none'" style="position: absolute; top: 10px; right: 15px; font-size: 1.5rem; background: transparent; border: none; cursor: pointer; color: #deeaef;">&times;</button>
            ${imgHtml}
            <h3 style="color: #f0f6f9; margin-bottom: 10px; font-size: 1.4rem;">${item.name}</h3>
            <p style="margin-bottom: 15px; font-size: 0.95rem; color: #aec0cb; line-height: 1.4;">${item.description || 'No description available for this item.'}</p>
            ${stockHtml}
            <div style="background: #15212a; padding: 12px; border-radius: 6px; margin-bottom: 20px; font-size: 1.1rem; border: 1px solid rgba(255,255,255,0.12); color:#e2edf2;">
                ${priceHtml}
            </div>
            
            <!-- Reviews Section -->
            <div id="reviews-section-${item.id}" style="margin-top: 20px; border-top: 2px solid rgba(255,255,255,0.14); padding-top: 15px; text-align: left;">
                <div id="reviews-loading-${item.id}" style="text-align: center; color: #999;">Loading reviews...</div>
            </div>
            
            <button class="btn-confirm" onclick="document.getElementById('food-info-modal').style.display='none'" style="width: 100%; margin-top: 15px;">Close</button>
        </div>
    `;
    modal.style.display = 'flex';
    
    // Load reviews
    loadFoodReviews(item.id);
};

async function loadFoodReviews(foodId) {
    try {
        const response = await fetch(`http://127.0.0.1:8000/api/reviews/food/${foodId}`);
        const data = await response.json();
        
        const reviewsSection = document.getElementById(`reviews-section-${foodId}`);
        const admission_no = localStorage.getItem('admission_no');
        const userRole = localStorage.getItem('role');
        
        // Average rating display
        let ratingStars = '';
        if (data.average_rating > 0) {
            const fullStars = Math.floor(data.average_rating);
            const hasHalfStar = data.average_rating % 1 >= 0.5;
            for (let i = 0; i < 5; i++) {
                if (i < fullStars) ratingStars += '⭐';
                else if (i === fullStars && hasHalfStar) ratingStars += '⭐';
                else ratingStars += '☆';
            }
        }
        
        let reviewsHtml = `
            <div style="margin-bottom: 15px;">
                <h4 style="margin: 0 0 8px 0; color: #222;">Customer Reviews</h4>
                ${data.average_rating > 0 ? `
                    <div style="font-size: 1.2rem; color: #f39c12; margin-bottom: 5px;">${ratingStars} ${data.average_rating}/5 (${data.total_reviews} review${data.total_reviews !== 1 ? 's' : ''})</div>
                ` : `
                    <div style="font-size: 0.9rem; color: #999;">No reviews yet. Be the first to review!</div>
                `}
            </div>
        `;
        
        // Review submission form
        if (admission_no) {
            reviewsHtml += `
                <div style="background: #15212a; padding: 12px; border-radius: 6px; margin-bottom: 15px; border: 1px solid rgba(255,255,255,0.1);">
                    <h5 style="margin: 0 0 10px 0; color: #e7eff4; font-size: 0.95rem;">Your Review</h5>
                    <div style="display: flex; gap: 5px; margin-bottom: 10px; justify-content: center;">
                        ${[1,2,3,4,5].map(i => `
                            <button class="star-btn" data-rating="${i}" onclick="setRating(${foodId}, ${i})" style="background: none; border: none; font-size: 1.5rem; cursor: pointer; opacity: 0.5; transition: opacity 0.2s;">☆</button>
                        `).join('')}
                    </div>
                    <textarea id="review-text-${foodId}" placeholder="Share your thoughts..." style="width: 100%; padding: 8px; border: 1px solid rgba(255,255,255,0.16); border-radius: 4px; font-size: 0.9rem; resize: vertical; min-height: 60px; background:#0f171d; color:#deeaef;"></textarea>
                    <button onclick="submitReview(${foodId})" style="width: 100%; margin-top: 8px; padding: 8px; background: #2ecc71; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">Submit Review</button>
                </div>
            `;
        }
        
        // Display reviews
        if (data.reviews && data.reviews.length > 0) {
            reviewsHtml += `<div style="max-height: 300px; overflow-y: auto;">`;
            data.reviews.forEach(review => {
                let stars = '';
                for (let i = 0; i < 5; i++) {
                    stars += i < review.rating ? '⭐' : '☆';
                }
                
                const canDelete = admission_no === review.user_id || userRole === 'admin';
                reviewsHtml += `
                    <div style="background: #132029; padding: 12px; border: 1px solid rgba(255,255,255,0.12); border-radius: 4px; margin-bottom: 8px; text-align: left;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;">
                            <strong style="color: #e6eff4;">${review.user_id}</strong>
                            <span style="font-size: 0.8rem; color: #999;">${new Date(review.created_at).toLocaleDateString()}</span>
                        </div>
                        <div style="color: #f39c12; font-size: 0.9rem; margin-bottom: 5px;">${stars} ${review.rating}/5</div>
                        ${review.review_text ? `<p style="margin: 5px 0; font-size: 0.9rem; color: #b8c7d0;">${review.review_text}</p>` : ''}
                        ${canDelete ? `<button onclick="deleteReview(${review.id}, ${foodId})" style="font-size: 0.8rem; padding: 4px 8px; background: #e74c3c; color: white; border: none; border-radius: 3px; cursor: pointer;">Delete</button>` : ''}
                    </div>
                `;
            });
            reviewsHtml += `</div>`;
        }
        
        reviewsSection.innerHTML = reviewsHtml;
        
    } catch (error) {
        console.error("Error loading reviews:", error);
        document.getElementById(`reviews-section-${foodId}`).innerHTML = `<p style="color: #e74c3c;">Error loading reviews</p>`;
    }
}

function setRating(foodId, rating) {
    // Update visual rating
    document.querySelectorAll(`#reviews-section-${foodId} .star-btn`).forEach((btn, i) => {
        btn.style.opacity = i < rating ? '1' : '0.5';
    });
    // Store rating for submission
    window.currentRating = rating;
}

async function submitReview(foodId) {
    const admission_no = localStorage.getItem('admission_no');
    const rating = window.currentRating || 0;
    const review_text = document.getElementById(`review-text-${foodId}`).value;
    
    if (rating === 0) {
        alert('Please select a rating');
        return;
    }
    
    try {
        const response = await fetch('http://127.0.0.1:8000/api/reviews', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ admission_no, food_id: foodId, rating, review_text })
        });
        
        const data = await response.json();
        if (response.ok) {
            alert('✅ Review submitted successfully!');
            window.currentRating = 0;
            document.getElementById(`review-text-${foodId}`).value = '';
            loadFoodReviews(foodId); // Reload reviews
        } else {
            alert('Error: ' + (data.detail || 'Failed to submit review'));
        }
    } catch (error) {
        console.error("Error submitting review:", error);
        alert('Error submitting review');
    }
}

async function deleteReview(reviewId, foodId) {
    if (!confirm('Delete this review?')) return;
    
    const admission_no = localStorage.getItem('admission_no');
    
    try {
        const response = await fetch(`http://127.0.0.1:8000/api/reviews/${reviewId}?admission_no=${admission_no}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            alert('Review deleted');
            loadFoodReviews(foodId); // Reload reviews
        } else {
            alert('Failed to delete review');
        }
    } catch (error) {
        console.error("Error deleting review:", error);
        alert('Error deleting review');
    }
};

function initializeNav() {
    const container = document.querySelector('.container') || document.body;
    if (!container) return;

    // Create Nav Panels for Pre-order / Walk-in (The top-level toggle)
    const navDiv = document.createElement('div');
    navDiv.className = 'nav-panels';
    navDiv.innerHTML = `
        <button class="toggle-btn view-mode-btn active" data-mode="pre-order" onclick="setViewMode('pre-order')">🍱 Pre-order Menu</button>
        <button class="toggle-btn view-mode-btn" data-mode="walk-in" onclick="setViewMode('walk-in')">🚶 Walk-in Menu</button>
    `;

    // Find the menu container to insert the nav before it
    const menuContainer = document.getElementById('menu-container');
    if (menuContainer) {
        menuContainer.parentNode.insertBefore(navDiv, menuContainer);
    } else {
        container.prepend(navDiv);
    }

    // Create Meal Type Toggles
    const mealDiv = document.createElement('div');
    mealDiv.className = 'meal-type-toggles';
    mealDiv.innerHTML = `
        <button class="toggle-btn meal-toggle-btn active" data-type="breakfast" onclick="setMealType('breakfast')">Breakfast</button>
        <button class="toggle-btn meal-toggle-btn" data-type="lunch" onclick="setMealType('lunch')">Lunch</button>
        <button class="toggle-btn meal-toggle-btn" data-type="snack" id="snack-toggle" style="display:none" onclick="setMealType('snack')">Snacks</button>
    `;
    navDiv.after(mealDiv);
}

function setViewMode(mode) {
    currentViewMode = mode;
    if (mode === 'pre-order' && currentMealType === 'snack') {
        currentMealType = 'breakfast';
    }
    const snackToggle = document.getElementById('snack-toggle');
    if (snackToggle) snackToggle.style.display = (mode === 'walk-in') ? 'inline-block' : 'none';
    
    document.querySelectorAll('.view-mode-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
    updateMealToggleUI();
    renderMenu();
}

function setMealType(type) {
    currentMealType = type;
    updateMealToggleUI();
    renderMenu();
}

function updateMealToggleUI() {
    document.querySelectorAll('.meal-toggle-btn').forEach(b => b.classList.toggle('active', b.dataset.type === currentMealType));
}

function openCartModal() {
    const modal = document.getElementById('cart-modal');
    if (!modal) return;

// Expose openCartModal globally for inline HTML onclick
window.openCartModal = openCartModal;
window.closeCartModal = closeCartModal;

    // Also attach event listeners to close buttons in case HTML onclick is missing
    const closeBtns = modal.querySelectorAll('.close-x, .close-btn');
    closeBtns.forEach(btn => {
        btn.removeEventListener('click', closeCartModal); // prevent duplicates
        btn.addEventListener('click', closeCartModal);
    });

    // --- NUCLEAR OPTION: Inject Styles directly to bypass browser caching ---
    if (!document.getElementById('dynamic-date-styles')) {
        const style = document.createElement('style');
        style.id = 'dynamic-date-styles';
        style.innerHTML = `
            .date-radio-label { flex: 0 0 70px; display: flex; flex-direction: column; align-items: center; padding: 10px 5px; background: #f8f9fa; border-radius: 10px; cursor: pointer; border: 2px solid #ddd; transition: all 0.2s; margin-right: 5px; }
            .date-radio-label span { font-size: 0.75rem; color: #666; text-transform: uppercase; margin-bottom: 2px; }
            .date-radio-label strong { font-size: 1.1rem; color: #222; }
            .date-radio-label input { display: none; }
            .date-radio-label.selected-tile { background: rgba(46, 204, 113, 0.15) !important; border-color: #2ecc71 !important; }
            .date-radio-label.disabled { opacity: 0.4; cursor: not-allowed; border-color: transparent; }
        `;
        document.head.appendChild(style);
    }

    // 2. Ensure we have a fresh container for Step 1 inside the modal
    let dateSection = document.getElementById('modal-date-section');

    if (!dateSection) {
        dateSection = document.createElement('div');
        dateSection.id = 'modal-date-section';
        // Hardcode CSS inline to guarantee visibility no matter what CSS file is cached
        dateSection.style.cssText = "background: #1a1a1a; padding: 15px; border-radius: 12px; margin-bottom: 20px; border: 1px solid #444; display: block !important;";
        
        dateSection.innerHTML = `
            <h4 style="margin: 0 0 15px 0; color: #fff; font-size: 0.85rem; text-transform: uppercase; border-bottom: 1px solid #444; padding-bottom: 8px;">
                <span style="background: #2ecc71; color: white; padding: 2px 8px; border-radius: 4px; margin-right: 10px;">Step 1</span> 
                Select Booking Date
            </h4>
            <div id="date-tiles-wrapper" style="display: flex; gap: 8px; overflow-x: auto; padding-bottom: 5px;"></div>
        `;

        // Bulletproof placement: Force insertion right above "Dining Mode"
        const orderTypeSelect = document.getElementById('order-type');
        if (orderTypeSelect) {
            const formGroup = orderTypeSelect.closest('.form-group');
            if (formGroup && formGroup.parentNode) {
                formGroup.parentNode.insertBefore(dateSection, formGroup);
            } else {
                orderTypeSelect.parentNode.insertBefore(dateSection, orderTypeSelect);
            }
        } else {
            // Fallback to the first child of the modal
            const modalContent = modal.querySelector('.booking-card') || modal;
            modalContent.insertBefore(dateSection, modalContent.children[1] || modalContent.firstChild);
        }
    }

    modal.style.display = 'flex';
    initializeDatePicker();
    renderMenu();
}

function closeCartModal() {
    const modal = document.getElementById('cart-modal');
    if (modal) modal.style.display = 'none';
}

async function initializeDatePicker() {
    const tilesWrapper = document.getElementById('date-tiles-wrapper');
    if (!tilesWrapper) return;

    // Skip if already populated
    if (tilesWrapper.children.length > 0 && !tilesWrapper.innerHTML.includes("Loading")) return;
    
    tilesWrapper.innerHTML = "<span style='color:#888; font-size:0.9rem;'>Loading dates...</span>";

    blockedHolidayDates = [];
    eventDates = [];
    try {
        // Force a 2.5 second timeout so a bad server connection doesn't freeze the UI forever
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2500);
        const response = await fetch('http://127.0.0.1:8000/api/holidays', { signal: controller.signal });
        clearTimeout(timeoutId);
        
        if (response.ok) {
            const holidays = await response.json();
            blockedHolidayDates = holidays
                .filter(h => !h.day_type || h.day_type === 'holiday')
                .map(h => h.date);
            eventDates = holidays
                .filter(h => h.day_type === 'event' || h.day_type === 'working_day')
                .map(h => h.date);
        }
    } catch (err) {
        console.warn("Holiday fetch failed, proceeding with standard weekends.");
    }
    tilesWrapper.innerHTML = ""; // Clear loader


    const today = getSimulatedDate();
    today.setHours(0,0,0,0);
    const dayOfWeek = today.getDay(); // 0=Sun, 6=Sat
    let startDate, endDate;
    if (dayOfWeek === 6) {
        // If today is Saturday, show only next week (Sunday to Saturday)
        startDate = new Date(today);
        startDate.setDate(today.getDate() + 1 - dayOfWeek + 7); // Next week's Sunday
        endDate = new Date(startDate);
        endDate.setDate(startDate.getDate() + 6); // Next week's Saturday
    } else {
        // If today is Sunday through Friday, show only this week (today through Saturday)
        startDate = new Date(today);
        endDate = new Date(today);
        endDate.setDate(today.getDate() + (6 - dayOfWeek));
    }

    let firstAvailableDate = null;
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        const date = new Date(d);
        // Local timezone safe date formatting
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const dateString = `${year}-${month}-${day}`;

        const isEventDay = eventDates.includes(dateString);
        const isWeekend = date.getDay() === 0 || date.getDay() === 6;
        const isHoliday = blockedHolidayDates.includes(dateString);

        const loopDateZero = new Date(date);
        loopDateZero.setHours(0,0,0,0);
        const isPast = loopDateZero < today;
        const isDisabled = ((isWeekend && !isEventDay) || isHoliday || isPast);

        const radioId = `date-${dateString}`;
        const label = document.createElement('label');
        label.className = 'date-radio-label';
        if (isDisabled) {
            label.classList.add('disabled');
        }

        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = 'booking_date';
        radio.id = radioId;
        radio.value = dateString;
        radio.disabled = isDisabled;
        radio.addEventListener('change', onDateChange);

        label.appendChild(radio);
        label.insertAdjacentHTML('beforeend', `<span>${date.toDateString().slice(0, 3)}</span><strong>${date.getDate()}</strong>`);
        tilesWrapper.appendChild(label);

        if (!isDisabled && !firstAvailableDate) {
            firstAvailableDate = dateString;
        }
    }

    if (firstAvailableDate) {
        // Only query inside the newly generated tiles to avoid invisible phantom inputs
        const firstRadio = tilesWrapper.querySelector(`input[value="${firstAvailableDate}"]`);
        if (firstRadio) {
            firstRadio.checked = true;
            firstRadio.closest('.date-radio-label').classList.add('selected-tile');
            selectedDate = firstAvailableDate;
        }
    }

    // Initial data load
    onDateChange();
    // Add meal type picker after date selection
    addMealTypePicker();
}

function addMealTypePicker() {
    let mealTypeSection = document.getElementById('modal-mealtype-section');
    if (!mealTypeSection) {
        mealTypeSection = document.createElement('div');
        mealTypeSection.id = 'modal-mealtype-section';
        mealTypeSection.style.cssText = "background: #142028; padding: 15px; border-radius: 12px; margin-bottom: 20px; border: 1px solid rgba(255,255,255,0.12); display: block !important;";
        mealTypeSection.innerHTML = `
            <h4 style=\"margin: 0 0 15px 0; color: #e5edf2; font-size: 0.85rem; text-transform: uppercase; border-bottom: 1px solid rgba(255,255,255,0.14); padding-bottom: 8px;\">
                <span style=\"background: #2ecc71; color: white; padding: 2px 8px; border-radius: 4px; margin-right: 10px;\">Step 2</span> 
                Select Meal Type
            </h4>
            <div id=\"meal-type-radio-group\" style=\"display: flex; gap: 16px;\">
                <label style=\"color:#d8e4ea; font-weight: 500; cursor: pointer;\"><input type=\"radio\" name=\"modal-mealtype\" value=\"breakfast\" checked> Breakfast</label>
                <label style=\"color:#d8e4ea; font-weight: 500; cursor: pointer;\"><input type=\"radio\" name=\"modal-mealtype\" value=\"lunch\"> Lunch</label>
            </div>
        `;
        // Insert after date section
        const dateSection = document.getElementById('modal-date-section');
        if (dateSection && dateSection.parentNode) {
            dateSection.parentNode.insertBefore(mealTypeSection, dateSection.nextSibling);
        }
    }
    // Add event listeners
    const radios = mealTypeSection.querySelectorAll('input[name="modal-mealtype"]');
    radios.forEach(radio => {
        radio.addEventListener('change', onMealTypeChange);
    });
    // Set initial state
    onMealTypeChange();
    // Ensure updateLimits is called on order type and parcel count changes
    const orderType = document.getElementById('order-type');
    if (orderType) orderType.addEventListener('change', updateLimits);
    const parcelCount = document.getElementById('parcel-count');
    if (parcelCount) {
        parcelCount.value = parcelCount.value || 1;
        parcelCount.addEventListener('change', updateLimits);
    }
}

function onMealTypeChange() {
    const mealType = document.querySelector('input[name="modal-mealtype"]:checked').value;
    currentMealType = mealType;
    // Update order type options
    const orderType = document.getElementById('order-type');
    const sitInConfig = document.getElementById('sit-in-config');
    const parcelConfig = document.getElementById('parcel-config');
    const capacitySection = document.getElementById('capacity-section');
    if (orderType) {
        if (mealType === 'breakfast') {
            // Only sit-in allowed
            orderType.value = 'sit-in';
            orderType.querySelector('option[value="parcel"]').style.display = 'none';
            orderType.querySelector('option[value="sit-in"]').style.display = '';
            orderType.disabled = true;
            // Always show sit-in config for breakfast
            if (sitInConfig) sitInConfig.style.display = 'block';
            if (parcelConfig) parcelConfig.style.display = 'none';
            if (capacitySection) capacitySection.style.display = 'block';
        } else {
            // Both allowed
            orderType.disabled = false;
            orderType.querySelector('option[value="parcel"]').style.display = '';
            orderType.querySelector('option[value="sit-in"]').style.display = '';
            // Show/hide based on order type
            if (sitInConfig) sitInConfig.style.display = (orderType.value === 'sit-in') ? 'block' : 'none';
            if (parcelConfig) parcelConfig.style.display = (orderType.value === 'parcel') ? 'block' : 'none';
            if (capacitySection) capacitySection.style.display = orderType.value ? 'block' : 'none';
        }
    }
    // Update time slot options
    updateTimeSlotsForMealType(mealType);
}

function updateTimeSlotsForMealType(mealType) {
    const timeSlotPicker = document.getElementById('time-slot');
    if (!timeSlotPicker) return;
    timeSlotPicker.innerHTML = '<option value="">Choose Time...</option>';
    if (mealType === 'breakfast') {
        // 8:00, 8:30, 9:00
        const breakfastSlots = ["08:00", "08:30", "09:00"];
        breakfastSlots.forEach(time => {
            let opt = document.createElement('option');
            opt.value = time;
            opt.text = `${time} - ${calculateEndTimeBreakfast(time)}`;
            timeSlotPicker.appendChild(opt);
        });
    } else {
        // Lunch slots as before
        const sitInSlots = ["12:00", "12:25", "12:50", "13:15"];
        const parcelSlots = ["12:00", "12:15", "12:30", "12:45", "13:00", "13:15", "13:30"];
        const orderType = document.getElementById('order-type');
        if (orderType && orderType.value === 'sit-in') {
            sitInSlots.forEach(time => {
                let opt = document.createElement('option');
                opt.value = time;
                opt.text = `${time} - ${calculateEndTime(time)}`;
                timeSlotPicker.appendChild(opt);
            });
        } else {
            parcelSlots.forEach(time => {
                let opt = document.createElement('option');
                opt.value = time;
                opt.text = time;
                timeSlotPicker.appendChild(opt);
            });
        }
    }
}

function calculateEndTimeBreakfast(startTime) {
    const [h, m] = startTime.split(':').map(Number);
    const newM = m + 30;
    const newH = h + Math.floor(newM / 60);
    const finalM = newM % 60;
    return `${newH}:${finalM.toString().padStart(2, '0')}`;
}

function onDateChange() {
    const wrapper = document.getElementById('date-tiles-wrapper');
    if (!wrapper) return;
    
    // Wipe highlight from all tiles
    wrapper.querySelectorAll('.date-radio-label').forEach(lbl => {
        lbl.classList.remove('selected-tile');
    });

    const selectedRadio = wrapper.querySelector('input[name="booking_date"]:checked');
    if (selectedRadio) {
        // Apply robust highlight class
        selectedRadio.closest('.date-radio-label').classList.add('selected-tile');
        selectedDate = selectedRadio.value;
        console.log("Selected date:", selectedDate);
        resetAndLock();
        fetchMenu();
    }
}


// ==========================================
// 3. CORE BOOKING FLOW LOGIC
// ==========================================

// Triggered when Dining Mode changes
// Update this function in your booking.js

function resetAndLock() {
    const typeEl = document.getElementById('order-type');
    if (!typeEl) return; // Crash prevention!
    const type = typeEl.value;
    
    const timeSlotPicker = document.getElementById('time-slot');
    const capacitySection = document.getElementById('capacity-section');
    const sitInConfig = document.getElementById('sit-in-config');
    const parcelConfig = document.getElementById('parcel-config');
    const parcelDropPoint = document.getElementById('parcel-drop-point');

    // Reset state
    cart = [];
    selectedSeatIds = [];
    allowedFoodCount = 0;
    if (parcelDropPoint) parcelDropPoint.value = '';

    if (timeSlotPicker) {
        timeSlotPicker.innerHTML = '<option value="">Choose Time...</option>';
        if (currentMealType === 'breakfast') {
            // Always show breakfast slots for breakfast
            const breakfastSlots = ["08:00", "08:30", "09:00"];
            breakfastSlots.forEach(time => {
                let opt = document.createElement('option');
                opt.value = time;
                opt.text = `${time} - ${calculateEndTimeBreakfast(time)}`;
                timeSlotPicker.appendChild(opt);
            });
        } else if (type === 'sit-in') {
            const sitInSlots = ["12:00", "12:25", "12:50", "13:15"];
            sitInSlots.forEach(time => {
                let opt = document.createElement('option');
                opt.value = time;
                opt.text = `${time} - ${calculateEndTime(time)}`;
                timeSlotPicker.appendChild(opt);
            });
        } else if (type === 'parcel') {
            const parcelSlots = ["12:00", "12:15", "12:30", "12:45", "13:00", "13:15", "13:30"];
            parcelSlots.forEach(time => {
                let opt = document.createElement('option');
                opt.value = time;
                opt.text = time;
                timeSlotPicker.appendChild(opt);
            });
        }
    }

    if (sitInConfig) sitInConfig.style.display = (type === 'sit-in') ? 'block' : 'none';
    if (parcelConfig) parcelConfig.style.display = (type === 'parcel') ? 'block' : 'none';
    if (capacitySection) capacitySection.style.display = type ? 'block' : 'none';

    updateLimits(); 
    renderCart();
}

function calculateEndTime(startTime) {
    const [h, m] = startTime.split(':').map(Number);
    const newM = m + 25;
    const newH = h + Math.floor(newM / 60);
    const finalM = newM % 60;
    return `${newH}:${finalM.toString().padStart(2, '0')}`;
}


// Update the allowed items based on Seats or Parcel Count
function updateLimits() {
    const typeEl = document.getElementById('order-type');
    if (!typeEl) return;
    const type = typeEl.value;
    const foodArea = document.getElementById('food-selection-area');
    
    if (type === 'sit-in') {
        allowedFoodCount = selectedSeatIds.length;
        const seatStatus = document.getElementById('seat-status');
        if(seatStatus) seatStatus.innerText = `Seats selected: ${allowedFoodCount}`;
    } else if (type === 'parcel') {
        const pCount = document.getElementById('parcel-count');
        allowedFoodCount = pCount ? (parseInt(pCount.value) || 0) : 0;
    }

    const maxItems = document.getElementById('max-items');
    if (maxItems) maxItems.innerText = allowedFoodCount;

    if (foodArea) {
        if (allowedFoodCount > 0) {
            foodArea.style.opacity = "1";
            foodArea.style.pointerEvents = "auto";
        } else {
            foodArea.style.opacity = "0.5";
            foodArea.style.pointerEvents = "none";
            cart = []; 
        }
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
    
    if (!slot || !selectedDate) {
        grid.innerHTML = "<p>Please select a date and time slot first.</p>";
        return;
    }

    // NEW: Determine which seating section to show based on the user's role.
    // We'll assume 'admin' users book in the 'staff' section.
    const userRole = localStorage.getItem('role') || 'student'; // Default to 'student' if role is not found
    const section = (userRole === 'staff' || userRole === 'admin') ? 'staff' : 'student';

    // NEW: Update the modal title to inform the user which section they are seeing.
    const seatPicker = document.getElementById('seat-modal');
    if (seatPicker) {
        const title = seatPicker.querySelector('.modal-header h2'); // Assumes an <h2> exists in your modal header
        if (title) {
            title.textContent = `Select Seat (${section.charAt(0).toUpperCase() + section.slice(1)} Section)`;
        }
    }

    grid.innerHTML = "Loading...";
    try {
        const response = await fetch(`http://127.0.0.1:8000/available-seats/${section}/${slot}/${selectedDate}`);
        const seats = await response.json();

        grid.innerHTML = ""; 
        seats.forEach(seat => {
            const box = document.createElement('div');
            box.className = 'seat-box';
            const prefix = seat.section === 'staff' ? 'S' : '';
            box.innerText = `${prefix}${seat.table_number}-${seat.seat_number}`;

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
        // Determine the selected booking day (e.g., 'monday')
        let dayParam = '';
        let targetDateForFetch = null;

        if (typeof selectedDate === 'string' && selectedDate) {
            targetDateForFetch = new Date(selectedDate);
        } else {
            // Smart default for main menu fetching
            const today = getSimulatedDate();
            targetDateForFetch = new Date(today);
            if (currentMealType === 'breakfast' && logicStatus.breakfast_5pm) {
                targetDateForFetch.setDate(targetDateForFetch.getDate() + 1);
            }
        }
        
        dayParam = targetDateForFetch.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();

        let url = 'http://127.0.0.1:8000/food-items';
        if (dayParam) {
            url += `?day=${dayParam}`;
        }
        const response = await fetch(url);
        const data = await response.json();
        console.log('Fetched menu data:', data);
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
    const slotInput = document.getElementById('time-slot');
    const slot = slotInput ? slotInput.value : "";

    console.log('Rendering menuItems:', menuItems);
    const filteredItems = menuItems.filter(item => {
        if (currentMealType === 'snack') return item.category === 'snack';
        return item.meal_type === currentMealType;
    });
    console.log('Filtered menuItems:', filteredItems);

    if (modalContainer) modalContainer.innerHTML = "";
    if (mainPageContainer) mainPageContainer.innerHTML = "";

    // 1. RENDER MAIN PAGE (Works even without a slot selected)
    if (mainPageContainer) {
        if (filteredItems.length === 0) {
            mainPageContainer.innerHTML = `<p>No ${currentMealType} items available right now.</p>`;
        } else {
            let isFutureDay = false;
            if (selectedDate) {
                const today = getSimulatedDate();
                const selDate = new Date(selectedDate);
                today.setHours(0,0,0,0);
                selDate.setHours(0,0,0,0);
                isFutureDay = selDate > today;
            }
            filteredItems.forEach(item => {
                const card = document.createElement('div');
                card.className = 'food-card';
                let planBtn = '';
                let infoMsg = '';

                if (currentViewMode === 'walk-in' || currentMealType === 'snack') {
                    planBtn = '';
                    infoMsg = '<div class="info-msg">Walk-in only. Purchase at counter.</div>';
                } else {
                    planBtn = `<button class="plan-btn" onclick="openCartModal()">Order Now</button>`;
                    infoMsg = '';
                }

                card.innerHTML = `
                    ${item.image_url ? `<img src="${item.image_url}" alt="${item.name}" style="width: 100%; height: 120px; object-fit: cover; border-radius: 6px; cursor: pointer; margin-bottom: 10px;" onclick='showFoodInfo(${JSON.stringify(item).replace(/'/g, "&#39;").replace(/"/g, "&quot;")})'>` : ''}
                    <h3>${item.name} <button onclick='showFoodInfo(${JSON.stringify(item).replace(/'/g, "&#39;").replace(/"/g, "&quot;")})' style="background:none; border:none; cursor:pointer; color:#3498db; padding: 0; font-size: 1.1rem;" title="View Info">ℹ️</button></h3>
                    <p class="price">₹${item.price_full}</p>
                    ${planBtn}
                    ${infoMsg}
                `;
                mainPageContainer.appendChild(card);
            });
        }
    }

    // 2. RENDER PLANNING MODAL (Strictly requires a slot)
    if (modalContainer) {
            if (!slot) {
                modalContainer.innerHTML = "<p class='status-msg'>Select an <b>Order Type</b> and <b>Time Slot</b> to view the menu.</p>";
            } else { // Slot is selected, render the menu items
                const today = getSimulatedDate();
                today.setHours(0,0,0,0);
                const selDate = new Date(selectedDate);
                selDate.setHours(0,0,0,0);
                const isToday = selDate.getTime() === today.getTime();

                const tomorrow = new Date(today);
                tomorrow.setDate(tomorrow.getDate() + 1);
                const isTomorrow = selDate.getTime() === tomorrow.getTime();

                let isStockApplicable = false;
                if (currentMealType === 'lunch' && isToday && logicStatus.lunch_1am) {
                    isStockApplicable = true;
                } else if (currentMealType === 'breakfast') {
                    // For today's breakfast, stock is always checked (as it was set yesterday)
                    // For tomorrow's breakfast, it's checked only after 5pm today.
                    if (isToday || (isTomorrow && logicStatus.breakfast_5pm)) {
                        isStockApplicable = true;
                    }
                }

                filteredItems.forEach(item => {
                    const row = document.createElement('div');
                    row.className = 'food-item-row';

                    let isItemDisabled = false;
                    if (isStockApplicable && item.category !== 'drink') {
                        const stockPool = currentViewMode === 'pre-order' ? item.prebook_pool : item.walkin_pool;
                        if (stockPool <= 0) {
                            isItemDisabled = true;
                        }
                    }

                    row.innerHTML = `
                        <div class="item-details">
                            <span class="item-name">${item.name} <button onclick='showFoodInfo(${JSON.stringify(item).replace(/'/g, "&#39;").replace(/"/g, "&quot;")})' style="background:none; border:none; cursor:pointer; color:#3498db; padding: 0; margin-right: 5px;" title="View Info">ℹ️</button>(₹${item.price_full})</span>
                            <span class="item-meta">${item.category}</span>
                        </div>
                        <button class="add-btn" onclick='addItemToPlan(${JSON.stringify(item).replace(/'/g, "&#39;").replace(/"/g, "&quot;")})' ${isItemDisabled ? 'style="background-color: #ccc; cursor: not-allowed;"' : ''}>+</button>
                    `;
                    modalContainer.appendChild(row);
                });
            }
        }
}

// Updated logic for Breakfast/Lunch and Category constraints
function addItemToPlan(item) {
    let requiresStockCheck = false;
    if (selectedDate) {
        const today = getSimulatedDate();
        const selDate = new Date(selectedDate);
        today.setHours(0,0,0,0);
        selDate.setHours(0,0,0,0);
        
        let isToday = selDate.getTime() === today.getTime();
        
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        let isTomorrow = selDate.getTime() === tomorrow.getTime();

        if (currentMealType === 'lunch' && isToday && logicStatus.lunch_1am) {
            requiresStockCheck = true;
        } else if (currentMealType === 'breakfast') {
            if (isToday) requiresStockCheck = true;
            if (isTomorrow && logicStatus.breakfast_5pm) requiresStockCheck = true;
        }
    }

    if (requiresStockCheck && item.category !== 'drink') {
        const availableStock = currentViewMode === 'pre-order' ? item.prebook_pool : item.walkin_pool;
        if (availableStock <= 0) {
            alert(`❌ ${item.name} is out of stock!`);
            return;
        }
        // Check if already added (against available stock)
        const cartEntry = cart.find(i => i.item.id === item.id);
        const itemCountInCart = cartEntry ? cartEntry.quantity : 0;
        if (itemCountInCart >= availableStock) {
            alert(`❌ Only ${availableStock} of ${item.name} available. You've already added ${itemCountInCart}.`);
            return;
        }
    }

    // For countable items, the entire batch counts as 1 meal/seat. Otherwise, count by quantity.
    const mealCount = cart.filter(i => i.item.category === 'meal').reduce((sum, i) => sum + (i.item.is_countable ? 1 : i.quantity), 0);
    const curryCount = cart.filter(i => i.item.category === 'curry').reduce((sum, i) => sum + (i.item.is_countable ? 1 : i.quantity), 0);
    const sideCount = cart.filter(i => i.item.category === 'side').reduce((sum, i) => sum + (i.item.is_countable ? 1 : i.quantity), 0);

    // 1. Capacity Check: Seats reserved define the max meals
    const isExistingCountable = item.is_countable && cart.some(i => i.item.id === item.id);
    if (item.category === 'meal' && mealCount >= allowedFoodCount && !isExistingCountable) {
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

    // 4. Portion & Countable Logic
    if (item.is_countable) {
        openQuantityModal(item, requiresStockCheck);
    } else if (item.has_portions) {
        openPortionModal(item); // Pops up Half/Full options
    } else {
        addToCart(item, 1, 'Full', item.price_full); // Fixed items like Omelette
    }
}

function openQuantityModal(item, requiresStockCheck) {
    // --- Calculate Limits Before Opening Modal ---
    const availableStock = currentViewMode === 'pre-order' ? item.prebook_pool : item.walkin_pool;
    const cartEntry = cart.find(i => i.item.id === item.id);
    const itemCountInCart = cartEntry ? cartEntry.quantity : 0;
    
    let maxFromStock = requiresStockCheck ? (availableStock - itemCountInCart) : 999;
    
    // Countable item constraints: Max 5 total per item, Min 2 initially (or 1 if adding to existing)
    let maxAllowed = Math.min(maxFromStock, 5 - itemCountInCart);
    let minAllowed = itemCountInCart >= 2 ? 1 : 2;

    if (maxAllowed <= 0) {
        alert(`You have reached the maximum limit (5) for ${item.name} or it is out of stock.`);
        return;
    }
    
    if (maxAllowed < minAllowed) {
        alert(`Not enough stock to meet the minimum order of ${minAllowed}.`);
        return;
    }

    let modal = document.getElementById('quantity-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'quantity-modal';
        modal.className = 'modal-overlay';
        modal.style.zIndex = '999999'; // Ensure it strictly appears above the cart modal
        document.body.appendChild(modal);
    }

    let currentQty = minAllowed;

    // Always inject fresh HTML to guarantee structure and wipe old event listeners
    modal.innerHTML = `
        <div class="modal-content booking-card" style="max-width: 320px; text-align: center; background: #111a22; color: #dce7ed; border: 1px solid rgba(255,255,255,0.12);">
            <h3 id="qty-item-name" style="color: #eef5f8;">${item.name}</h3>
            <p style="margin-bottom: 15px; color: #9fb3bf;">Select quantity (Min: ${minAllowed}, Max: ${maxAllowed})</p>
            <div style="display: flex; justify-content: center; align-items: center; gap: 20px; margin-bottom: 20px;">
                <button type="button" id="qty-minus" class="btn-action" style="padding: 10px; font-size: 1.5rem; width: 50px; margin-top: 0; line-height: 1;">-</button>
                <span id="qty-value" style="font-size: 1.5rem; font-weight: bold; color: #e8f1f5; min-width: 30px; display: inline-block;">${currentQty}</span>
                <button type="button" id="qty-plus" class="btn-action" style="padding: 10px; font-size: 1.5rem; width: 50px; margin-top: 0; line-height: 1;">+</button>
            </div>
            <div class="btn-group" style="display: flex; gap: 10px;">
                <button type="button" id="qty-confirm" class="btn-confirm" style="margin-top: 0;">Add to Cart</button>
                <button type="button" id="qty-cancel" class="btn-action" style="margin-top: 0; background: #888;">Cancel</button>
            </div>
        </div>
    `;

    const qtyValue = document.getElementById('qty-value');
    const plusBtn = document.getElementById('qty-plus');
    const minusBtn = document.getElementById('qty-minus');
    const confirmBtn = document.getElementById('qty-confirm');
    
    modal.style.display = 'flex';

    // --- UI Update Function ---
    function updateUI() {
        qtyValue.innerText = currentQty;
        plusBtn.disabled = currentQty >= maxAllowed;
        minusBtn.disabled = currentQty <= minAllowed;
        confirmBtn.disabled = maxAllowed === 0;
    }

    // --- Event Listeners ---
    minusBtn.onclick = (e) => { 
        e.preventDefault();
        if (currentQty > minAllowed) {
            currentQty--;
            updateUI();
        }
    };
    
    plusBtn.onclick = (e) => { 
        e.preventDefault();
        if (currentQty < maxAllowed) {
            currentQty++;
            updateUI();
        }
    };
    
    document.getElementById('qty-cancel').onclick = (e) => { e.preventDefault(); modal.style.display = 'none'; };
    
    confirmBtn.onclick = (e) => {
        e.preventDefault();
        if (currentQty > maxAllowed) {
            alert(`You can only add up to ${maxAllowed} more of this item.`);
            return;
        }
        addToCart(item, currentQty, 'Full', item.price_full);
        modal.style.display = 'none';
    };

    // --- Initial State ---
    updateUI();
}

function openPortionModal(item) {
    let modal = document.getElementById('portion-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'portion-modal';
        modal.className = 'modal-overlay';
        modal.style.zIndex = '999999'; // Ensure it's on top
        document.body.appendChild(modal);
    }

    modal.innerHTML = `
        <div class="modal-content booking-card" style="max-width: 320px; text-align: center; background: #111a22; color: #dce7ed; border: 1px solid rgba(255,255,255,0.12);">
            <h3 style="color: #eef5f8;">Select Portion for ${item.name}</h3>
            <p style="margin-bottom: 20px; color: #9fb3bf;">Choose between a half or full portion.</p>
            <div class="btn-group" style="display: flex; gap: 10px; justify-content: center;">
                <button type="button" id="portion-half-btn" class="btn-action" style="margin-top: 0; flex-grow: 1;">Half (₹${item.price_half})</button>
                <button type="button" id="portion-full-btn" class="btn-confirm" style="margin-top: 0; flex-grow: 1;">Full (₹${item.price_full})</button>
            </div>
            <button type="button" id="portion-cancel-btn" class="btn-action" style="margin-top: 15px; background: #888; width: 100%;">Cancel</button>
        </div>
    `;
    
    modal.style.display = 'flex';
    
    document.getElementById('portion-half-btn').onclick = () => {
        addToCart(item, 1, 'Half', item.price_half);
        modal.style.display = 'none';
    };
    document.getElementById('portion-full-btn').onclick = () => {
        addToCart(item, 1, 'Full', item.price_full);
        modal.style.display = 'none';
    };
    document.getElementById('portion-cancel-btn').onclick = () => {
        modal.style.display = 'none';
    };
}

function editCartItem(cartId) {
    const itemIndex = cart.findIndex(i => i.cartId === cartId);
    if (itemIndex === -1) return;

    const itemToEdit = cart[itemIndex].item;
    
    // Remove the item from the cart before re-triggering the add flow
    cart.splice(itemIndex, 1);
    
    // Update UI
    renderCart();
    validateFinalButton();

    // Trigger the add flow again for this item, which will open the relevant modal
    addItemToPlan(itemToEdit);
}

function addToCart(item, quantity, portion, price) {
    // Generate a highly compatible unique ID for this specific cart entry
    const cartId = Date.now().toString() + Math.random().toString().slice(2);
    cart.push({ cartId, item, quantity, portion, price });
    renderCart();
    validateFinalButton();
}

function getCartTotal() {
    return cart.reduce((sum, cartItem) => sum + (cartItem.price * cartItem.quantity), 0);
}

function updateCartTotalDisplay() {
    const totalEl = document.getElementById('total-val');
    if (!totalEl) return;
    totalEl.innerText = getCartTotal().toFixed(2);
}

function calculateDepositPercentageFromFlags(flags) {
    if (flags === 0) return 10;
    if (flags === 1) return 10;
    if (flags === 2) return 30;
    if (flags === 3) return 50;
    if (flags === 4) return 75;
    return 100;
}

async function getCurrentUserFlags() {
    if (cachedUserFlags !== null) return cachedUserFlags;

    const admissionNo = localStorage.getItem('admission_no');
    if (!admissionNo) return 0;

    try {
        const response = await fetch(`http://127.0.0.1:8000/users/${admissionNo}/flags`);
        if (!response.ok) return 0;

        const data = await response.json();
        cachedUserFlags = Number.isFinite(data.flags) ? data.flags : 0;
        return cachedUserFlags;
    } catch (error) {
        console.error('Failed to fetch user flags:', error);
        return 0;
    }
}

async function updatePaymentPreview() {
    const amountEl = document.getElementById('payment-amount');
    const percentageEl = document.getElementById('payment-deposit-percentage');
    if (!amountEl || !percentageEl) return;

    const total = getCartTotal();
    const flags = await getCurrentUserFlags();
    const depositPercentage = calculateDepositPercentageFromFlags(flags);
    const depositAmount = (total * depositPercentage) / 100;

    percentageEl.innerText = String(depositPercentage);
    amountEl.innerText = depositAmount.toFixed(2);
}

function renderCart() {
    const list = document.getElementById('cart-summary-list');
    if (!list) return;
    list.innerHTML = cart.map(cartItem => {
        let name = cartItem.item.name;
        if (cartItem.item.has_portions && cartItem.portion) name += ` (${cartItem.portion})`;
        if (cartItem.quantity > 1) name += ` (x${cartItem.quantity})`;

        const editBtn = (cartItem.item.is_countable || cartItem.item.has_portions)
            ? `<button class="edit-cart-item-btn" onclick="editCartItem('${cartItem.cartId}')">Edit</button>`
            : '';

        return `<li data-cart-id="${cartItem.cartId}">
                    <span>${name}</span>
                    <div class="cart-item-actions">
                        ${editBtn}
                        <button class="remove-cart-item-btn" onclick="removeFromCart('${cartItem.cartId}')">x</button>
                    </div>
                </li>`;
    }).join('');

    updateCartTotalDisplay();
}

function removeFromCart(cartId) {
    cart = cart.filter(item => item.cartId !== cartId);
    renderCart();
    validateFinalButton();
}

// ==========================================
// 6. FINAL VALIDATION & SUBMISSION
// ==========================================

async function checkSlotAvailability() {
    const slot = document.getElementById('time-slot').value;
    const type = document.getElementById('order-type').value;

    if (type === 'parcel' && slot && selectedDate) {
        const response = await fetch(`http://127.0.0.1:8000/check-capacity/${slot}/${selectedDate}`);
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
    const dropPointEl = document.getElementById('parcel-drop-point');
    const dropPoint = dropPointEl ? dropPointEl.value : '';
    const mealCount = cart.filter(i => i.item.category === 'meal').reduce((sum, i) => sum + (i.item.is_countable ? 1 : i.quantity), 0);
    // New Rule: The number of main meals must exactly match the number of seats/parcels selected.
    let isReady = (slot !== "" && type !== "" && mealCount > 0 && mealCount === allowedFoodCount && allowedFoodCount > 0);
    if (type === 'parcel') {
        isReady = isReady && dropPoint !== '';
    }
    confirmBtn.disabled = !isReady;
}


async function onConfirmAndPay() {
    // Only require payment for pre-order bookings
    if (currentViewMode === 'pre-order') {
        await updatePaymentPreview();
        document.getElementById('payment-modal').style.display = 'flex';
    } else {
        processBooking();
    }
}

function closePaymentModal() {
    document.getElementById('payment-modal').style.display = 'none';
}

function completeDummyPayment() {
    closePaymentModal();
    processBooking();
}

async function processBooking() {
    const dropPointEl = document.getElementById('parcel-drop-point');
    const payload = {
        admission_no: localStorage.getItem("admission_no"),
        items: cart.map(cartItem => ({
            item_id: cartItem.item.id,
            quantity: cartItem.quantity
        })),
        scheduled_slot: document.getElementById('time-slot').value,
        order_type: document.getElementById('order-type').value,
        drop_point: dropPointEl ? dropPointEl.value : null,
        booking_date: selectedDate,
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
        const err = await response.json();
        alert(`Booking failed: ${err.detail}`);
    }
}