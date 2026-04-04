// C:\Canteen management system\frontend\js\clock.js
if (typeof API_BASE === 'undefined') {
    var API_BASE = "http://127.0.0.1:8000";
}

if (typeof timeOffset === 'undefined') {
    var timeOffset = 0; // Difference in ms between server and client time
}

// Helper to get the current date, respecting the mock time offset.
function getSimulatedDate() {
    return new Date(new Date().getTime() + timeOffset);
}

async function syncTimeWithServer() {
    try {
        const response = await fetch(`${API_BASE}/api/time`, {
            cache: 'no-store',
            headers: { 'Cache-Control': 'no-cache' }
        });
        if (!response.ok) {
            throw new Error('Failed to fetch time from server');
        }
        const data = await response.json();
        const serverTime = new Date(data.time);
        const clientTime = new Date();
        timeOffset = serverTime.getTime() - clientTime.getTime();
        console.log(`Time synchronized. Offset is ${timeOffset}ms`);
    } catch (error) {
        console.error("Error syncing time:", error);
        // Retry after 10 seconds if sync fails
        setTimeout(syncTimeWithServer, 10000);
    }
}

function initializeClock() {
    const clockElement = document.getElementById('system-clock');
    const mockTimeDisplay = document.getElementById('mock-time-display');
    const mockDateDisplay = document.getElementById('mock-date-display');

    if (!clockElement) return;

    const updateClock = () => {
        const now = new Date(new Date().getTime() + timeOffset); // Apply the offset
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        const timeString = `${hours}:${minutes}:${seconds}`;
        
        const dateStringForDisplay = now.toLocaleDateString('en-US', { 
            weekday: 'short', 
            year: 'numeric', 
            month: 'short', 
            day: 'numeric' 
        });
        
        clockElement.textContent = `${timeString}  |  ${dateStringForDisplay}`;

        // Also update the debug displays if they exist on the page
        if (mockTimeDisplay) {
            mockTimeDisplay.textContent = `${hours}:${minutes}:${seconds}`;
        }
    
        if (mockDateDisplay) {
            const yyyy = now.getFullYear();
            const mm = String(now.getMonth() + 1).padStart(2, '0');
            const dd = String(now.getDate()).padStart(2, '0');
            mockDateDisplay.textContent = `${yyyy}-${mm}-${dd}`;
        }

        // Automatically refresh admin data grids when the minute rolls over
        if (now.getSeconds() === 0) {
            // Use a timeout to give the backend a moment to finish its own timed logic
            setTimeout(async () => {
                // 1. Refresh Admin Page Grids (if on admin page)
                const stockSection = document.getElementById('section-stock');
                if (stockSection && stockSection.style.display === 'block' && typeof loadDailyStock === 'function') {
                    loadDailyStock();
                }
                const ordersSection = document.getElementById('section-orders');
                if (ordersSection && ordersSection.style.display === 'block' && typeof loadAllOrders === 'function') {
                    loadAllOrders();
                }

                // 2. Refresh Booking Page Data (if on booking page)
                // This ensures logicStatus and menu stock are not stale after a time change
                if (document.getElementById('menu-container') && typeof fetchLogicStatus === 'function' && typeof fetchMenu === 'function') {
                    console.log("Clock tick: Refreshing booking page data...");
                    await fetchLogicStatus();
                    await fetchMenu();
                }

            }, 1500); 
        }
    };

    // Update immediately and then every second
    updateClock();
    setInterval(updateClock, 1000);
}

async function startClockSystem() {
    await syncTimeWithServer(); // Initial sync
    initializeClock();
    setInterval(syncTimeWithServer, 60000); // Re-sync every 60 seconds
}

// Start the clock system when DOM is loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startClockSystem);
} else {
    startClockSystem();
}
