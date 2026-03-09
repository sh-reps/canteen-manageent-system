// Initialize and update the system clock
function initializeClock() {
    const clockElement = document.getElementById('system-clock');
    if (!clockElement) return;

    function updateClock() {
        const now = new Date();
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

    // Update immediately
    updateClock();
    
    // Update every second
    setInterval(updateClock, 1000);
}

// Initialize clock when DOM is loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeClock);
} else {
    initializeClock();
}
