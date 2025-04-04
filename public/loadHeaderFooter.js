// Получение cookie по имени
function getCookie(name) {
    const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
    return match ? decodeURIComponent(match[2]) : null;
}

// Установка cookie
function setCookie(name, value) {
    document.cookie = `${name}=${encodeURIComponent(value)}; path=/`;
}

// Удаление cookie
function clearCookies() {
    ['user_name', 'user_email', 'user_avatar'].forEach(n => {
        document.cookie = `${n}=; Max-Age=0; path=/`;
    });
}

// Загрузка шаблонов header и footer
async function loadTemplate(path, selector) {
    console.log(`[📦 Загрузка шаблона] ${path}`);
    const response = await fetch(path);
    const html = await response.text();
    document.querySelector(selector).innerHTML = html;
    console.log(`[✅ ${selector} загружен]`);
}

// Показываем пользователя
function showUser(name, avatarUrl = null) {
    console.log("[👤 showUser]", { name, avatarUrl });

    const nameEl = document.getElementById('user-name');
    const avatarEl = document.getElementById('user-avatar');
    const profileBlock = document.getElementById('user-profile');
    const authBlock = document.getElementById('authenticated-actions');
    const signin = document.getElementById('g_id_signin');

    if (nameEl) nameEl.textContent = name || '';

    if (avatarEl) {
        if (avatarUrl && avatarUrl.startsWith('http')) {
            avatarEl.src = avatarUrl;
            avatarEl.classList.remove('hidden');
        } else {
            avatarEl.src = '';
            avatarEl.classList.add('hidden');
        }
    }

    if (profileBlock) profileBlock.classList.toggle('hidden', !name);
    if (authBlock) authBlock.classList.toggle('hidden', !name);
    if (signin) signin.style.display = name ? 'none' : 'block';
}

// Проверка роли сотрудника
async function checkSupportAgent(email) {
    console.log("[🔒 checkSupportAgent]", email);
    try {
        const res = await fetch(`/api/is-support-agent?email=${encodeURIComponent(email)}`);
        const data = await res.json();
        if (data.isSupportAgent) {
            const btn = document.getElementById('support-panel-btn');
            if (btn) btn.classList.remove('hidden');
        }
    } catch (err) {
        console.error("[❌ Ошибка проверки роли]", err);
    }
}

// Вход через Google
function initGoogleLogin() {
    console.log("[🔐 initGoogleLogin]");
    google.accounts.id.initialize({
        client_id: '48635369674-hpohhuqf92pkd7b56oj10rrt1t25la5v.apps.googleusercontent.com',
        callback: handleCredentialResponse
    });

    google.accounts.id.renderButton(
        document.getElementById('g_id_signin'),
        { theme: 'outline', size: 'medium' }
    );
}

// Обработка Google токена
async function handleCredentialResponse(response) {
    console.log("[🔥 handleCredentialResponse вызван]", response);

    const res = await fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: response.credential })
    });

    const data = await res.json();
    console.log("[✅ Ответ от backend]", data);

    if (data.name && data.email) {
        setCookie('user_name', data.name);
        setCookie('user_email', data.email);
        if (data.picture) setCookie('user_avatar', data.picture);

        console.log("[🔁 setTimeout для reload]");
        setTimeout(() => {
            location.reload();
        }, 100);
    }
}




// Выход
function signOut() {
    clearCookies();
    location.reload();
}

// Основная инициализация
async function initializeHeaderFooter() {
    console.log("[➡️ initializeHeaderFooter старт]");

    await loadTemplate('/templates/header.html', 'header');
    await loadTemplate('/templates/footer.html', 'footer');

    const name = getCookie('user_name');
    const email = getCookie('user_email');
    const avatar = getCookie('user_avatar');

    console.log("[🔍 cookies]", { name, email, avatar });

    if (name && email) {
        showUser(name, avatar);
        checkSupportAgent(email);
    } else {
        console.log("[🔐 Нет авторизации, запускаю Google вход]");
        initGoogleLogin();
    }

    document.addEventListener('click', (e) => {
        if (e.target && e.target.id === 'sign-out-btn') {
            signOut();
        }
    });
}

document.addEventListener('DOMContentLoaded', initializeHeaderFooter);
