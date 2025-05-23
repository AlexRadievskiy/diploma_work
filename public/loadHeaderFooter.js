function getCookie(name) {
    const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
    return match ? decodeURIComponent(match[2]) : null;
}

function setCookie(name, value) {
    document.cookie = `${name}=${encodeURIComponent(value)}; path=/`;
}

function clearCookies() {
    ['user_name', 'user_email', 'user_avatar'].forEach(n => {
        document.cookie = `${n}=; Max-Age=0; path=/`;
    });
}

async function loadTemplate(path, selector) {
    console.log(`[📦 ${path} → ${selector}]`);
    const response = await fetch(path);
    const html = await response.text();
    document.querySelector(selector).innerHTML = html;
    console.log(`[✅ ${selector}]`);
}

function showUser(name, avatarUrl) {
    const nameEl = document.getElementById('user-name');
    const avatarEl = document.getElementById('user-avatar');
    const profileBlock = document.getElementById('user-profile');
    const authBlock = document.getElementById('authenticated-actions');
    const signin = document.getElementById('g_id_signin');

    const signOutBtn = document.getElementById('sign-out-btn');
    const myTicketsBtn = document.getElementById('my-tickets-btn');

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

    if (signOutBtn) signOutBtn.style.display = name ? 'inline-block' : 'none';
    if (myTicketsBtn) myTicketsBtn.classList.toggle('hidden', !name);
}

async function checkSupportAgent(email) {
    const res = await fetch(`/api/is-support-agent?email=${encodeURIComponent(email)}`);
    const data = await res.json();

    const panelBtn = document.getElementById('support-panel-btn');
    const manageBtn = document.getElementById('manage-roles-btn');
    const manageArticlesBtn = document.getElementById('manage-articles-btn');
    const analyticsBtn = document.getElementById('analytics-btn');
    const adminDropdown = document.getElementById('admin-dropdown');

    if (data && ['junior', 'senior', 'admin'].includes(data.access_level)) {
        if (adminDropdown) adminDropdown.classList.remove('hidden');
    }

    if (panelBtn && ['junior', 'senior', 'admin'].includes(data.access_level)) {
        panelBtn.classList.remove('hidden');
    }

    if (manageBtn && ['senior', 'admin'].includes(data.access_level)) {
        manageBtn.classList.remove('hidden');
    }

    if (manageArticlesBtn && ['senior', 'admin'].includes(data.access_level)) {
        manageArticlesBtn.classList.remove('hidden');
    }

    if (analyticsBtn && ['senior', 'admin'].includes(data.access_level)) {
        analyticsBtn.classList.remove('hidden');
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
    console.log('[🔥 Отримано відповідь від Google]', response);

    const res = await fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: response.credential })
    });

    const data = await res.json();
    console.log('[✅ Відповідь від бекенду]', data);

    if (data.name && data.email) {
        console.log('[✅ Успішна автентифікація]');
        setCookie('user_name', data.name);
        setCookie('user_email', data.email);
        if (data.picture) {
            setCookie('user_avatar', data.picture);
        }

        console.log('[🔁 Перезапуск initializeHeaderFooter]');
        await initializeHeaderFooter();

        const loader = document.getElementById('auth-loader');
        if (loader) loader.classList.remove('hidden');

        setTimeout(() => {
            location.href = '/';
        }, 1500);
    } else {
        console.warn('[⚠️ Помилка автентифікації]');
    }
}

function signOut() {
    clearCookies();
    const signin = document.getElementById("g_id_signin");
    const profileBlock = document.getElementById("authenticated-actions");

    if (profileBlock) profileBlock.classList.add("hidden");
    if (signin) signin.classList.remove("hidden");
    initGoogleLogin();
    location.reload();
}

async function initializeHeaderFooter() {
    console.log('[➡️ Запуск initializeHeaderFooter]');
    await loadTemplate('/templates/header.html', 'header');
    await loadTemplate('/templates/footer.html', 'footer');

    const name = getCookie('user_name');
    const email = getCookie('user_email');
    const avatar = getCookie('user_avatar');

    const signOutBtn = document.getElementById('sign-out-btn');
    const myTicketsBtn = document.getElementById('my-tickets-btn');

    if (signOutBtn) signOutBtn.style.display = 'none';
    if (myTicketsBtn) myTicketsBtn.classList.add('hidden');

    console.log('[🔍 Перевірка cookie]', { name, email, avatar });

    if (name && email) {
        showUser(name, avatar);
        await checkSupportAgent(email);
    } else {
        console.log('[🔐 Користувач не авторизований, запуск Google автентифікації]');
        initGoogleLogin();
    }

    document.addEventListener('click', (e) => {
        if (e.target && e.target.id === 'sign-out-btn') {
            signOut();
        }
    });
}

window.addEventListener('message', async (event) => {
    if (event.data?.type === 'googleLogin') {
        console.log('[📩 Отримано облікові дані через postMessage]', event.data);

        const res = await fetch('/api/auth/google', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ credential: event.data.credential })
        });

        const data = await res.json();
        console.log('[✅ Відповідь від бекенду]', data);

        if (data.name && data.email) {
            setCookie('user_name', data.name);
            setCookie('user_email', data.email);
            if (data.picture) setCookie('user_avatar', data.picture);

            const loader = document.getElementById('auth-loader');
            if (loader) loader.classList.remove('hidden');

            setTimeout(() => location.reload(), 1500);
        }
    }
});

document.addEventListener('DOMContentLoaded', initializeHeaderFooter);
