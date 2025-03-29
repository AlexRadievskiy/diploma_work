window.onload = async () => {
    const username = getCookie('user_name');
    const email = getCookie('user_email');

    if (username) {
        showUser(username);
        checkSupportAgent(email); // проверка роли
    } else {
        initGoogleLogin();
    }

    loadContent();

    const createBtn = document.getElementById('create-ticket-btn');
    if (createBtn) {
        createBtn.addEventListener('click', () => {
            const username = getCookie('user_name');
            if (!username) {
                document.getElementById('g_id_signin').scrollIntoView({ behavior: 'smooth' });
                alert('Пожалуйста, авторизуйтесь, чтобы создать тикет.');
                return;
            }
            window.location.href = 'create-ticket.html';
        });
    }
};

// Отображение имени и кнопок выхода и панели поддержки
function showUser(name) {
    document.getElementById('user-info').innerHTML = `
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

// Проверка, является ли пользователь сотрудником поддержки
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

// Google вход
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

// Получение cookie по имени
function getCookie(name) {
    const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
    return match ? decodeURIComponent(match[2]) : null;
}
