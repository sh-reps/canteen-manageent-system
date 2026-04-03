document.addEventListener('DOMContentLoaded', () => {
    fetchFlaggedUsers();

    // Add event listener for forgiving users
    const tableBody = document.querySelector('#flagged-users-table');
    tableBody.addEventListener('click', async (event) => {
        if (event.target.classList.contains('btn-forgive')) {
            const admissionNo = event.target.dataset.admissionNo;
            if (confirm(`Are you sure you want to reset flags for user ${admissionNo}?`)) {
                try {
                    const response = await fetch(`/api/admin/reset-flags/${admissionNo}`, {
                        method: 'POST',
                    });
                    if (!response.ok) {
                        throw new Error('Failed to reset flags');
                    }
                    // Refresh the table
                    fetchFlaggedUsers();
                } catch (error) {
                    console.error('Error resetting flags:', error);
                    alert('Failed to reset flags. Please try again.');
                }
            }
        }
    });
});

function calculateDepositPercentage(flags) {
    if (flags === 0) return 10;
    else if (flags === 1) return 10;
    else if (flags === 2) return 30;
    else if (flags === 3) return 50;
    else if (flags === 4) return 75;
    else return 100; // 5 or more flags
}

async function fetchFlaggedUsers() {
    try {
        const response = await fetch('/api/admin/flagged-users');
        if (!response.ok) {
            throw new Error('Failed to fetch flagged users');
        }
        const users = await response.json();
        const tableBody = document.querySelector('#flagged-users-table');
        tableBody.innerHTML = ''; // Clear existing rows

        if (users.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 20px;">No flagged users found.</td></tr>';
            return;
        }

        users.forEach(user => {
            const depositPercentage = calculateDepositPercentage(user.flags);
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${user.admission_no}</td>
                <td>${user.email || 'N/A'}</td>
                <td>${user.role}</td>
                <td style="text-align: center;">
                    <span class="flag-badge ${user.flags >= 5 ? 'max' : ''}">
                        ${user.flags}/5
                    </span>
                </td>
                <td style="text-align: center; font-weight: bold; color: ${depositPercentage === 100 ? '#c0392b' : '#e67e22'}">${depositPercentage}%</td>
                <td>${user.flagged_at ? new Date(user.flagged_at).toLocaleString() : 'N/A'}</td>
                <td style="text-align: center;"><button class="btn-danger" data-admission-no="${user.admission_no}" style="padding: 6px 12px;">Reset Flags</button></td>
            `;
            row.querySelector('button').classList.add('btn-forgive');
            tableBody.appendChild(row);
        });
    } catch (error) {
        console.error('Error fetching flagged users:', error);
        const tableBody = document.querySelector('#flagged-users-table');
        tableBody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 20px; color: #e74c3c;">Error loading data.</td></tr>';
    }
}
