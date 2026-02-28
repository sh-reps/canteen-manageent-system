async function login() {
    const admission_no = document.getElementById('admission_no').value;
    const password = document.getElementById('password').value;
    const errorMsg = document.getElementById('error-message');

    try {
        const response = await fetch(`http://127.0.0.1:8000/login?admission_no=${admission_no}&password=${password}`, {
            method: 'POST'
        });

        const data = await response.json();

        if (response.ok) {
            // Save the user info locally so they stay logged in during their session
            localStorage.setItem('user_role', data.role);
            localStorage.setItem('admission_no', data.admission_no);

            // Redirect based on role
            if (data.role === 'admin') {
                window.location.href = 'admin.html';
            } else {
                window.location.href = 'booking.html';
            }
        } else {
            errorMsg.innerText = data.detail;
        }
    } catch (error) {
        errorMsg.innerText = "Cannot connect to server. Is FastAPI running?";
    }
    // Inside your login function...
    if (response.ok) {
        const data = await response.json();
        
        // Store the ID in the browser's memory
        localStorage.setItem("admission_no", data.admission_no);
        localStorage.setItem("user_role", data.role);
        
        // Redirect based on role
        if (data.role === 'admin') {
            window.location.href = "admin.html";
        } else {
            window.location.href = "booking.html";
        }
    } 
}