document.addEventListener('DOMContentLoaded', async () => {
    const ticketContainer = document.getElementById('ticket-container');
    const filterSelect = document.getElementById('filter-status');
    const searchInput = document.getElementById('search-email');

    async function fetchTickets(status = '', emailFilter = '') {
        const supportEmail = getCookie('user_email');
        if (!supportEmail) return alert('Support email not found in cookies');

        ticketContainer.innerHTML = 'Loading...';
        let url = `/api/support/tickets?email=${encodeURIComponent(supportEmail)}`;
        if (status) url += `&status=${status}`;
        if (emailFilter) url += `&user=${encodeURIComponent(emailFilter)}`;

        const res = await fetch(url);
        const tickets = await res.json();
        renderTickets(tickets);
    }

    function renderTickets(tickets) {
        const ticketContainer = document.getElementById('ticket-container');
        if (!tickets.length) {
            ticketContainer.innerHTML = '<p>No tickets found.</p>';
            return;
        }

        ticketContainer.innerHTML = '';
        tickets.forEach(ticket => {
            const statusClass = ticket.status.toLowerCase().replace(' ', '_');

            const div = document.createElement('div');
            div.className = `ticket-block ${statusClass}`;
            div.innerHTML = `
            <div class="ticket-header">
                <span class="status ${statusClass}">${ticket.status}</span>
                <h4>[#${ticket.id}] ${ticket.title}</h4>
            </div>

            <p><strong>User:</strong> ${ticket.user_name} (${ticket.user_email})</p>
            <p><strong>Created:</strong> ${new Date(ticket.creation_date).toLocaleString()}</p>
            <p><strong>Last update:</strong> ${new Date(ticket.last_message_date || ticket.update_date).toLocaleString()}</p>
            <p><strong>Last message:</strong> ${ticket.last_message ? ticket.last_message.slice(0, 80) + '...' : 'No messages yet'}</p>
            <button class="open-ticket-btn" data-id="${ticket.id}">
                <i class="fas fa-comments"></i> Open Chat
            </button>
        `;
            ticketContainer.appendChild(div);
        });

        document.querySelectorAll('.open-ticket-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-id');
                window.location.href = `support-chat.html?id=${id}`;
            });
        });
    }

    function getCookie(name) {
        const cookies = document.cookie.split(';');
        for (let cookie of cookies) {
            const [k, v] = cookie.trim().split('=');
            if (k === name) return decodeURIComponent(v);
        }
        return null;
    }

    filterSelect.addEventListener('change', () => {
        fetchTickets(filterSelect.value, searchInput.value.trim());
    });

    searchInput.addEventListener('input', () => {
        fetchTickets(filterSelect.value, searchInput.value.trim());
    });

    fetchTickets();
});
