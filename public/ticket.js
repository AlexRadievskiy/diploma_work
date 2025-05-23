document.addEventListener('DOMContentLoaded', async () => {
    if (window.location.pathname.endsWith('ticket.html')) {
        await loadTicketPage();
    }
});

async function loadTicketPage() {
    const params = new URLSearchParams(window.location.search);
    const ticketId = params.get('id');
    const userEmail = getCookie('user_email');

    if (!ticketId || !userEmail) {
        alert("Помилка: недостатньо даних.");
        window.location.href = "/";
        return;
    }

    let currentTicketStatus = null;

    async function loadTicket() {
        const res = await fetch(`/api/tickets/${ticketId}?email=${encodeURIComponent(userEmail)}`);
        const data = await res.json();

        if (!data || !data.ticket) {
            alert('Звернення не знайдено або доступ заборонено');
            window.location.href = "/";
            return;
        }

        currentTicketStatus = data.ticket.status.toLowerCase();

        document.getElementById('ticket-title').textContent = data.ticket.title;
        const statusElement = document.getElementById('ticket-status');
        statusElement.textContent = data.ticket.status;
        statusElement.className = 'status ' + data.ticket.status.toLowerCase().replace(' ', '_');
        document.getElementById('ticket-description').textContent = data.ticket.description;

        const msgBox = document.getElementById('messages');
        msgBox.innerHTML = '';

        const fieldContainer = document.getElementById('ticket-fields');
        fieldContainer.innerHTML = '';
        if (data.fields && data.fields.length > 0) {
            data.fields.forEach(f => {
                const el = document.createElement('p');
                el.innerHTML = `<strong>${f.field_label}:</strong> ${f.field_value}`;
                fieldContainer.appendChild(el);
            });
        }

        data.events.forEach(evt => {
            if (evt.type === 'message' && (!evt.message || evt.message.trim() === '')) return;

            const div = document.createElement('div');
            div.className = 'msg ' + (evt.sender_role === 'support' ? 'support' : 'customer');

            let senderLabel = 'Ви';
            if (evt.sender_role === 'support') {
                senderLabel = evt.agent_name ? evt.agent_name : 'Підтримка';
            }

            if (evt.type === 'message') {
                div.innerHTML = `
                    <strong>${senderLabel}:</strong><br>
                    ${evt.message}<br>
                    <small>${new Date(evt.created_date).toLocaleString()}</small>
                `;
            } else if (evt.type === 'attachment') {
                const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(evt.file_path);
                div.innerHTML = `
                    <strong>${senderLabel}:</strong><br>
                    ${isImage
                    ? `<img src="${evt.file_path}" style="max-width:300px;"><br>`
                    : `<a href="${evt.file_path}" target="_blank">${evt.file_name}</a><br>`}
                    <small>${new Date(evt.created_date).toLocaleString()}</small>
                `;
            }

            msgBox.appendChild(div);
        });

        msgBox.scrollTop = msgBox.scrollHeight;

        const closeBtn = document.getElementById('close-ticket-btn');
        const form = document.getElementById('message-form');
        const textArea = document.getElementById('message-text');
        const fileInput = document.getElementById('message-file');
        const submitBtn = form.querySelector('button[type="submit"]');

        if (currentTicketStatus === 'closed') {
            closeBtn.style.display = 'none';
            textArea.disabled = true;
            fileInput.disabled = true;
            submitBtn.disabled = true;
            submitBtn.textContent = 'Звернення закрите';
            submitBtn.style.backgroundColor = '#6c757d';
            submitBtn.style.cursor = 'not-allowed';
        } else {
            closeBtn.style.display = 'block';
            closeBtn.onclick = async () => {
                if (!confirm('Ви дійсно хочете закрити звернення?')) return;
                const res = await fetch(`/api/support/tickets/${ticketId}/status`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status: 'closed', support_email: userEmail })
                });
                const result = await res.json();
                if (result.success) {
                    alert('Звернення закрито');
                    await loadTicket();
                } else {
                    alert('Не вдалося закрити звернення');
                }
            };
        }
    }

    await loadTicket();

    document.getElementById('message-form').addEventListener('submit', async (e) => {
        e.preventDefault();

        const resStatus = await fetch(`/api/tickets/${ticketId}?email=${encodeURIComponent(userEmail)}`);
        const dataStatus = await resStatus.json();

        if (!dataStatus || !dataStatus.ticket || dataStatus.ticket.status.toLowerCase() === 'closed') {
            alert('Звернення закрите. Надсилання повідомлення неможливе.');
            await loadTicket();
            return;
        }

        const text = document.getElementById('message-text').value.trim();
        const fileInput = document.getElementById('message-file');
        if (!text && (!fileInput || !fileInput.files.length)) return;

        const formData = new FormData();
        formData.append('email', userEmail);
        if (text) formData.append('message', text);
        if (fileInput && fileInput.files.length) {
            formData.append('file', fileInput.files[0]);
        }

        const res = await fetch(`/api/tickets/${ticketId}/reply`, {
            method: 'POST',
            body: formData
        });

        if (res.ok) {
            document.getElementById('message-text').value = '';
            if (fileInput) fileInput.value = '';
            await loadTicket();
        } else {
            alert('Не вдалося надіслати повідомлення');
        }
    });
}

function getCookie(name) {
    const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
    return match ? decodeURIComponent(match[2]) : null;
}
