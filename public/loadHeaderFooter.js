const username = getCookie('user_name');
const email = getCookie('user_email');
const avatar = getCookie('user_avatar');

// Загрузка шаблонов header и footer
async function loadTemplate(templatePath, elementSelector) {
    const response = await fetch(templatePath);
    const template = await response.text();
    document.querySelector(elementSelector).innerHTML = template;
}

// Получение cookie по имени
function getCookie(name) {
    let matches = document.cookie.match(new RegExp(
        "(?:^|; )" + name.replace(/([\.$?*|{}\(\)\[\]\\\/\+^])/g, '\\$1') + "=([^;]*)"
    ));
    return matches ? decodeURIComponent(matches[1]) : undefined;
}

// Проверка роли пользователя (сотрудник техподдержки)
async function checkSupportAgent(email) {
    const res = await fetch(`/api/support/check-agent?email=${encodeURIComponent(email)}`);
    const data = await res.json();
    if (data.isAgent) {
        document.getElementById('support-panel-btn').classList.remove('hidden');
    }
}

// Инициализация Google-авторизации
function initGoogleLogin() {
    google.accounts.id.initialize({
        client_id: "YOUR_GOOGLE_CLIENT_ID",
        callback: handleCredentialResponse
    });
    google.accounts.id.renderButton(
        document.getElementById("g_id_signin"), { theme: "outline", size: "medium" }
    );
}

// Обработка ответа Google авторизации
async function handleCredentialResponse(response) {
    const res = await fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: response.credential })
    });

    const data = await res.json();

    showUser(data.name, data.picture);
    checkSupportAgent(getCookie('user_email'));

    // ✅ Скрываем кнопку входа после авторизации
    const signin = document.getElementById('g_id_signin');
    if (signin) signin.style.display = 'none';

    // ✅ Показываем блок с авторизованным пользователем
    const authBlock = document.getElementById('authenticated-actions');
    if (authBlock) authBlock.classList.remove('hidden');
}

// Выход пользователя
function signOut() {
    document.cookie = 'user_email=; Max-Age=0; path=/';
    document.cookie = 'user_name=; Max-Age=0; path=/';
    location.reload();
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

function showUser(name, avatarUrl = null) {
    const userNameSpan = document.getElementById('user-name');
    if (userNameSpan) userNameSpan.textContent = name;

    const userAvatar = document.getElementById('user-avatar');
    if (userAvatar && avatarUrl) {
        userAvatar.src = avatarUrl;
        userAvatar.classList.remove('hidden');
    }

    const signOutBtn = document.getElementById('sign-out-btn');
    if (signOutBtn) {
        signOutBtn.addEventListener('click', () => {
            document.cookie = 'user_name=; Max-Age=0';
            document.cookie = 'user_email=; Max-Age=0';
            location.reload();
        });
    }

    const supportPanelBtn = document.getElementById('support-panel-btn');
    if (supportPanelBtn) {
        supportPanelBtn.addEventListener('click', () => {
            window.location.href = 'support-panel.html';
        });
    }

    const createTicketBtn = document.getElementById('create-ticket-btn');
    if (createTicketBtn) {
        createTicketBtn.addEventListener('click', () => {
            window.location.href = 'create-ticket.html';
        });
    }
}

// Инициализация всего функционала после загрузки хедера и футера
async function initializeHeaderFooter() {
    await loadTemplate('/templates/header.html', 'header');
    await loadTemplate('/templates/footer.html', 'footer');

    const username = getCookie('user_name');
    const email = getCookie('user_email');

    if (username && email) {
        showUser(username, avatar);
        checkSupportAgent(email);
    } else {
        initGoogleLogin();
    }

    // Обработчик выхода из аккаунта
    document.addEventListener('click', (e) => {
        if (e.target && e.target.id === 'sign-out-btn') {
            signOut();
        }
    });
}



document.addEventListener('DOMContentLoaded', initializeHeaderFooter);
