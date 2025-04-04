// Получение cookie по имени
function getCookie(name) {
    const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
    return match ? decodeURIComponent(match[2]) : null;
}

// Основной инициализатор
document.addEventListener('DOMContentLoaded', async () => {
    // ✅ Инициализируем хедер/футер первым
    if (typeof initializeHeaderFooter === 'function') {
        await initializeHeaderFooter();
    }

    loadContent();

    const createBtn = document.getElementById('create-ticket-btn');
    if (createBtn) {
        createBtn.addEventListener('click', () => {
            const username = getCookie('user_name');
            if (!username) {
                const signin = document.getElementById('g_id_signin');
                if (signin) signin.scrollIntoView({ behavior: 'smooth' });
                alert('Пожалуйста, авторизуйтесь, чтобы создать тикет.');
                return;
            }
            window.location.href = 'create-ticket.html';
        });
    }

    // Если это ticket.html
    if (window.location.pathname.endsWith('ticket.html')) {
        await loadTicketPage();
    }
});

async function loadTicketPage() {
    const params = new URLSearchParams(window.location.search);
    const ticketId = params.get('id');
    const userEmail = getCookie('user_email');

    if (!ticketId || !userEmail) {
        alert("Ошибка: недостаточно данных.");
        window.location.href = "/";
        return;
    }

    async function loadTicket() {
        const res = await fetch(`/api/tickets/${ticketId}?email=${encodeURIComponent(userEmail)}`);
        const data = await res.json();

        if (!data || !data.ticket) {
            alert('Тикет не найден или доступ запрещён');
            window.location.href = "/";
            return;
        }

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
            const div = document.createElement('div');
            div.className = 'msg ' + (evt.sender_role === 'support' ? 'support' : 'customer');

            let senderLabel = 'Вы';
            if (evt.sender_role === 'support') {
                senderLabel = evt.agent_name ? evt.agent_name : 'Техподдержка';
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

        const closeBtn = document.getElementById('close-ticket-btn');
        if (data.ticket.status === 'closed') {
            closeBtn.style.display = 'none';
        } else {
            closeBtn.style.display = 'block';
            closeBtn.onclick = async () => {
                if (!confirm('Вы уверены, что хотите закрыть тикет?')) return;
                const res = await fetch(`/api/support/tickets/${ticketId}/status`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status: 'closed', support_email: userEmail })
                });
                const result = await res.json();
                if (result.success) {
                    alert('Тикет закрыт');
                    await loadTicket();
                } else {
                    alert('Ошибка закрытия тикета');
                }
            };
        }
    }

    document.getElementById('message-form').addEventListener('submit', async (e) => {
        e.preventDefault();

        const statusText = document.getElementById('ticket-status').textContent;
        if (statusText === 'closed') {
            alert('Тикет закрыт. Нельзя отправить сообщение.');
            return;
        }

        const text = document.getElementById('message-text').value.trim();
        const fileInput = document.getElementById('message-file');

        if (!text && (!fileInput || !fileInput.files.length)) return;

        const formData = new FormData();
        formData.append('email', userEmail);
        formData.append('message', text);
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
            alert('Ошибка при отправке сообщения');
        }
    });

    await loadTicket();
}

async function loadContent() {
    const res = await fetch('/api/categories');
    const data = await res.json();

    const container = document.getElementById('content');
    const searchResults = document.getElementById('searchResults');
    if (!container) return;

    data.forEach(cat => {
        const div = document.createElement('div');
        div.className = 'category';
        div.innerHTML = `
            <h2>${cat.name}</h2>
            <p>${cat.description || ''}</p>
            <ul class="article-list">
                ${cat.articles.map(a => `<li><a href="article.html?id=${a.id}">${a.title}</a></li>`).join('')}
            </ul>
        `;
        container.appendChild(div);
    });

    const searchInput = document.getElementById('searchInput');
    if (!searchInput) return;

    searchInput.addEventListener('input', async (e) => {
        const query = e.target.value.toLowerCase().trim();
        searchResults.innerHTML = '';
        searchResults.style.display = 'none';

        if (query.length === 0) return;

        const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        const results = await response.json();

        if (results.length > 0) {
            results.forEach(article => {
                const a = document.createElement('a');
                a.href = `article.html?id=${article.id}`;
                a.textContent = `${article.title} (${article.category_name})`;
                searchResults.appendChild(a);
            });
            searchResults.style.display = 'block';
        }
    });
}
