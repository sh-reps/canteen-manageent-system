// C:\Canteen management system\frontend\js\clock.js
if (typeof API_BASE === 'undefined') {
    var API_BASE = "http://127.0.0.1:8000";
}

if (typeof timeOffset === 'undefined') {
    var timeOffset = 0; // Difference in ms between server and client time
}

async function syncTimeWithServer() {
    try {
        const response = await fetch(`${API_BASE}/api/time`);
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
    if (!clockElement) return;

    function updateClock() {
        const now = new Date(new Date().getTime() + timeOffset); // Apply the offset
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        const timeString = `${hours}:${minutes}:${seconds}`;
        
        const dateString = now.toLocaleDateString('en-US', { 
            weekday: 'short', 
            year: 'numeric', 
            month: 'short', 
            day: 'numeric' 
        });
        
        clockElement.textContent = `${timeString}  |  ${dateString}`;
    }

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
