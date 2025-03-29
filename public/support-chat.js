document.addEventListener('DOMContentLoaded', async () => {
    const params = new URLSearchParams(window.location.search);
    const ticketId = params.get('id');
    if (!ticketId) return alert('Missing ticket ID');

    const supportEmail = getCookie('user_email');
    if (!supportEmail) return alert('Unauthorized');

    const ticketInfoDiv = document.getElementById('ticket-info');
    const chatMessagesDiv = document.getElementById('chat-messages');
    const ticketFieldsDiv = document.getElementById('ticket-fields');
    const replySection = document.getElementById('reply-section');
    const replyText = document.getElementById('reply-text');
    const sendBtn = document.getElementById('send-reply');
    const fileInput = document.getElementById('message-file');

    const noteTextarea = document.getElementById('ticket-note');
    const saveNoteBtn = document.getElementById('save-note-btn');
    const statusSelect = document.getElementById('ticket-status');
    const changeStatusBtn = document.getElementById('change-status-btn');
    const blockUserBtn = document.getElementById('block-user-btn');

    let currentTicket = null;

    async function fetchTicketData() {
        const res = await fetch(`/api/tickets/${ticketId}?forSupport=true`);
        if (!res.ok) {
            alert('Failed to load ticket');
            return;
        }

        const data = await res.json();
        currentTicket = data.ticket;

        renderTicketInfo(data.ticket);
        renderFields(data.fields);
        renderMessages(data.events);

        if (data.ticket.status !== 'closed') {
            replySection.classList.remove('hidden');
        } else {
            replySection.innerHTML = '<p><em>This ticket is closed. You cannot reply.</em></p>';
        }
    }

    function renderTicketInfo(ticket) {
        ticketInfoDiv.innerHTML = `
            <h3>${ticket.title}</h3>
            <p><strong>Status:</strong> ${ticket.status}</p>
            <p><strong>User:</strong> ${ticket.user_email}</p>
            <p><strong>Created:</strong> ${new Date(ticket.creation_date).toLocaleString()}</p>
        `;
        statusSelect.value = ticket.status;
        noteTextarea.value = ticket.note || '';
    }

    function renderFields(fields) {
        ticketFieldsDiv.innerHTML = '<h4>📝 Ticket Fields</h4>';
        for (const field of fields) {
            const div = document.createElement('div');
            div.className = 'field-block';
            div.innerHTML = `<strong>${field.field_label}:</strong><br><span>${escapeHtml(field.field_value)}</span>`;
            ticketFieldsDiv.appendChild(div);
        }
    }

    function renderMessages(events) {
        chatMessagesDiv.innerHTML = '';
        for (const evt of events) {
            const div = document.createElement('div');
            div.className = 'chat-message ' + evt.sender_role;

            let sender = evt.sender_role === 'support'
                ? (evt.agent_name || 'Support')
                : 'Customer';

            if (evt.type === 'message') {
                if (!evt.message) continue;
                div.innerHTML = `
                    <div class="meta">${sender} - ${new Date(evt.created_date).toLocaleString()}</div>
                    <div class="body">${escapeHtml(evt.message)}</div>
                `;
            } else if (evt.type === 'attachment') {
                const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(evt.file_path);
                div.innerHTML = `
                    <div class="meta">${sender} - ${new Date(evt.created_date).toLocaleString()}</div>
                    <div class="body">
                        ${isImage
                    ? `<img src="${evt.file_path}" style="max-width:300px;"><br>`
                    : `<a href="${evt.file_path}" target="_blank">${evt.file_name}</a><br>`}
                    </div>
                `;
            }

            chatMessagesDiv.appendChild(div);
        }
    }

    sendBtn.addEventListener('click', async () => {
        const message = replyText.value.trim();
        const file = fileInput.files[0];

        if (!message && !file) return;

        const formData = new FormData();
        formData.append('support_email', supportEmail);
        if (message) formData.append('message', message);
        if (file) formData.append('file', file);

        const res = await fetch(`/api/support/tickets/${ticketId}/reply`, {
            method: 'POST',
            body: formData
        });

        const result = await res.json();
        if (result.success) {
            replyText.value = '';
            fileInput.value = '';
            await fetchTicketData();
        } else {
            alert(result.error || 'Error sending message');
        }
    });

    saveNoteBtn.onclick = async () => {
        const note = noteTextarea.value;
        const res = await fetch(`/api/support/tickets/${ticketId}/note`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ note, support_email: supportEmail })
        });

        const result = await res.json();
        alert(result.success ? 'Note saved!' : result.error || 'Error saving note');
    };

    changeStatusBtn.onclick = async () => {
        const status = statusSelect.value;
        const res = await fetch(`/api/support/tickets/${ticketId}/status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status, support_email: supportEmail })
        });

        const result = await res.json();
        if (result.success) {
            alert('Status updated');
            await fetchTicketData();
        } else {
            alert(result.error || 'Error updating status');
        }
    };

    blockUserBtn.onclick = async () => {
        if (!confirm('Are you sure you want to block this user?')) return;

        const res = await fetch(`/api/support/users/block`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: currentTicket.user_email, support_email: supportEmail })
        });

        const result = await res.json();
        if (result.success) {
            alert('User blocked and all tickets closed');
            await fetchTicketData();
        } else {
            alert(result.error || 'Error blocking user');
        }
    };

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.innerText = text;
        return div.innerHTML;
    }

    function getCookie(name) {
        const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
        return match ? decodeURIComponent(match[2]) : null;
    }

    fetchTicketData();
});
