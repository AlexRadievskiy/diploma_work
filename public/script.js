window.onload = async () => {
    const username = getCookie('user_name');
    const email = getCookie('user_email');

    if (username) {
        showUser(username);
        checkSupportAgent(email);
    } else {
        initGoogleLogin();
    }

    loadContent();

    const createBtn = document.getElementById('create-ticket-btn');
    if (createBtn) {
        createBtn.addEventListener('click', () => {
            if (!username) {
                document.getElementById('g_id_signin').scrollIntoView({ behavior: 'smooth' });
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
};

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
        document.getElementById('ticket-status').textContent = data.ticket.status;
        document.getElementById('ticket-description').textContent = data.ticket.description;

        const msgBox = document.getElementById('messages');
        msgBox.innerHTML = '';

        // Поля тикета
        if (data.fields && data.fields.length > 0) {
            const fieldBox = document.createElement('div');
            fieldBox.classList.add('field-box');
            data.fields.forEach(f => {
                const el = document.createElement('p');
                el.innerHTML = `<strong>${f.field_label}:</strong> ${f.field_value}`;
                fieldBox.appendChild(el);
            });
            msgBox.appendChild(fieldBox);
        }

// Сообщения и файлы из events
        data.events.forEach(evt => {
            const div = document.createElement('div');
            div.className = 'msg ' + (evt.sender_role === 'support' ? 'support' : 'customer');

            // Определение имени отправителя
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


        // Кнопка закрытия тикета
        if (data.ticket.status !== 'closed') {
            const closeBtn = document.createElement('button');
            closeBtn.textContent = 'Закрыть тикет';
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
                }
            };
            document.querySelector('.container').appendChild(closeBtn);
        }
    }


    document.getElementById('message-form').addEventListener('submit', async (e) => {
        e.preventDefault();

        // Блокируем отправку, если тикет уже закрыт
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

function showUser(name) {
    const userInfoEl = document.getElementById('user-info');
    if (!userInfoEl) return; // 💡 если элемента нет — выходим

    userInfoEl.innerHTML = `
        <span id="user-name">${name}</span>
        <button id="sign-out-btn">Sign out</button>
        <button id="support-panel-btn" style="display: none;">Панель поддержки</button>
    `;

    document.getElementById('sign-out-btn').addEventListener('click', () => {
        document.cookie = 'user_name=; Max-Age=0';
        document.cookie = 'user_email=; Max-Age=0';
        location.reload();
    });

    document.getElementById('support-panel-btn').addEventListener('click', () => {
        window.location.href = 'support-panel.html';
    });
}


async function checkSupportAgent(email) {
    try {
        const res = await fetch(`/api/is-support-agent?email=${encodeURIComponent(email)}`);
        const data = await res.json();
        if (data.isSupportAgent) {
            const btn = document.getElementById('support-panel-btn');
            if (btn) btn.style.display = 'inline-block';
        }
    } catch (err) {
        console.error('Ошибка проверки роли поддержки:', err);
    }
}

function initGoogleLogin() {
    google.accounts.id.initialize({
        client_id: '48635369674-hpohhuqf92pkd7b56oj10rrt1t25la5v.apps.googleusercontent.com',
        callback: handleCredentialResponse
    });

    google.accounts.id.renderButton(
        document.getElementById('g_id_signin'),
        { theme: 'outline', size: 'medium' }
    );
}

async function handleCredentialResponse(response) {
    const res = await fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: response.credential })
    });

    const data = await res.json();
    showUser(data.name);
    checkSupportAgent(getCookie('user_email'));
}

async function loadContent() {
    const res = await fetch('/api/categories');
    const data = await res.json();

    const container = document.getElementById('content');
    const searchResults = document.getElementById('searchResults');

    data.forEach(cat => {
        const div = document.createElement('div');
        div.className = 'category';
        div.innerHTML = `
            <h2>${cat.name}</h2>
            <p>${cat.description || ''}</p>
            <div class="article-list">
                ${cat.articles.map(a => `<a href="article.html?id=${a.id}">${a.title}</a>`).join('')}
            </div>
        `;
        container.appendChild(div);
    });

    const searchInput = document.getElementById('searchInput');
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

function getCookie(name) {
    const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
    return match ? decodeURIComponent(match[2]) : null;
}
