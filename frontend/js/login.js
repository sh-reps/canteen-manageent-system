// Global logout function for all pages
function logout() {
    localStorage.clear();
    window.location.href = '/';
}
// login.js - Ensure this is at the top level
async function login() {
    const admission_no = document.getElementById('admission_no').value.trim();
    const password = document.getElementById('password').value;
    const errorMsg = document.getElementById('error-message');

    try {
        const response = await fetch('/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ admission_no, password })
        });

        const data = await response.json();

        if (response.ok) {
            localStorage.setItem('admission_no', data.admission_no);
            localStorage.setItem('role', data.role);

            // Use absolute paths to prevent 404s
            if (data.role === 'admin') {
                window.location.href = '/admin'; 
            } else {
                window.location.href = '/booking';
            }
        } else {
            errorMsg.innerText = data.detail || "Invalid Credentials";
        }
    } catch (error) {
        errorMsg.innerText = "Connection Refused. Ensure FastAPI is running on port 8000.";
    }
}