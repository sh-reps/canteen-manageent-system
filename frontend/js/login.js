async function login() {
    console.log("Login button clicked!");
    const admission_no = document.getElementById('admission_no').value;
    const password = document.getElementById('password').value;
    const errorMsg = document.getElementById('error-message');

    try {
        const admission_no = document.getElementById('admission_no').value;
    const password = document.getElementById('password').value;

    const response = await fetch('http://127.0.0.1:8000/login', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json' // Tell FastAPI to expect JSON
        },
        body: JSON.stringify({ 
            admission_no: admission_no, 
            password: password 
        })
    });
    localStorage.setItem('user_admission_no', admission_no);
    const data = await response.json();

        // Inside login.js
        if (response.ok) {
            const data = await response.json();
            localStorage.setItem("admission_no", data.admission_no); // Consistent key
            window.location.href = "/booking";
        

            // Redirect based on role
            if (data.role === 'admin') {
                window.location.href = 'admin.html';
            } else {
                window.location.href = "/booking";
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