async function register() {
    const admission_no = document.getElementById('reg_admission_no').value;
    const password = document.getElementById('reg_password').value;
    const message = document.getElementById('reg-message');

    const response = await fetch('http://127.0.0.1:8000/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ admission_no, password })
    });

    const data = await response.json();

    if (response.ok) {
        message.style.color = "green";
        message.innerText = "Registration successful! Redirecting to login...";
        setTimeout(() => window.location.href = 'index.html', 2000);
    } else {
        message.style.color = "red";
        message.innerText = data.detail || "Registration failed";
    }
}