let allArticles = [];

window.onload = async () => {
    const res = await fetch('/api/categories');
    const data = await res.json();

    const container = document.getElementById('content');
    const searchResults = document.getElementById('searchResults');

    // собираем статьи в один массив
    data.forEach(cat => {
        cat.articles.forEach(article => {
            allArticles.push({
                id: article.id,
                title: article.title,
                category: cat.name
            });
        });

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

    // обработка поиска
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
};
