// Получение cookie по имени
function getCookie(name) {
    const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
    return match ? decodeURIComponent(match[2]) : null;
}

// Основной инициализатор
document.addEventListener('DOMContentLoaded', async () => {
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

    // ❌ Логика тикета теперь в ticket.js, больше ничего здесь не нужно
});

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
