document.addEventListener('DOMContentLoaded', async () => {
    const roleSelect = document.getElementById('new-role');
    const email = getCookie('user_email');

    const res = await fetch(`/api/is-support-agent?email=${encodeURIComponent(email)}`);
    const data = await res.json();

    if (!data || !data.access_level || ['junior', 'fired'].includes(data.access_level)) {
        alert('Access denied');
        location.href = '/';
        return;
    }

    const accessLevel = data.access_level;

    if (accessLevel === 'senior') {
        // 🔒 Отключаем senior и admin
        [...roleSelect.options].forEach(opt => {
            if (['senior', 'admin'].includes(opt.value)) {
                opt.disabled = true;
            }
        });
    }

    document.getElementById('role-form').addEventListener('submit', async (e) => {
        e.preventDefault();

        const targetEmail = document.getElementById('staff-email').value.trim();
        const newRole = roleSelect.value;

        const response = await fetch('/api/support/set-role', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ targetEmail, newRole, requesterEmail: email })
        });

        const result = await response.text();
        document.getElementById('response-msg').textContent = result;
    });
});
