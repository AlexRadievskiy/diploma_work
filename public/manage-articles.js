let editingArticleId = null;
let editingCategoryId = null;

document.addEventListener('DOMContentLoaded', async () => {
    const email = getCookie('user_email');
    const res = await fetch(`/api/is-support-agent?email=${encodeURIComponent(email)}`);
    const data = await res.json();
    if (!data || !['admin', 'senior'].includes(data.access_level)) {
        alert('Доступ заборонено');
        location.href = '/';
        return;
    }

    await loadCategories();
    await loadArticles();

    document.getElementById('article-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const payload = {
            title: document.getElementById('title').value.trim(),
            category_id: document.getElementById('category').value,
            priority: parseInt(document.getElementById('priority').value),
            text: document.getElementById('markdown').value,
            is_hidden: document.getElementById('is-hidden').checked ? 1 : 0
        };

        const url = editingArticleId
            ? `/api/knowledge/article/${editingArticleId}`
            : '/api/knowledge/article';
        const method = editingArticleId ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const result = await response.text();
        document.getElementById('response-msg').textContent = result;

        editingArticleId = null;
        resetArticleForm();
        await loadArticles();
    });

    document.getElementById('category-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const payload = {
            name: document.getElementById('category-name').value.trim(),
            description: document.getElementById('category-description').value,
            priority: parseInt(document.getElementById('category-priority').value),
            is_hidden: document.getElementById('category-hidden').checked ? 1 : 0
        };

        const url = editingCategoryId
            ? `/api/knowledge/category/${editingCategoryId}`
            : '/api/knowledge/category';
        const method = editingCategoryId ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const result = await response.text();
        document.getElementById('category-response').textContent = result;

        editingCategoryId = null;
        resetCategoryForm();
        await loadCategories();
    });

    document.getElementById('cancel-article-edit').addEventListener('click', () => {
        editingArticleId = null;
        resetArticleForm();
    });

    document.getElementById('cancel-category-edit').addEventListener('click', () => {
        editingCategoryId = null;
        resetCategoryForm();
    });
});

function resetArticleForm() {
    const form = document.getElementById('article-form');
    form.reset();
    document.getElementById('article-form-title').textContent = '➕ Створити Статтю';
    document.getElementById('cancel-article-edit').style.display = 'none';
    form.closest('.editor-block').style.border = '';
    document.getElementById('title').focus();
}

function resetCategoryForm() {
    const form = document.getElementById('category-form');
    form.reset();
    document.getElementById('category-form-title').textContent = '➕ Створити Категорію';
    document.getElementById('cancel-category-edit').style.display = 'none';
    form.closest('.editor-block').style.border = '';
    document.getElementById('category-name').focus();
}

async function loadCategories() {
    const select = document.getElementById('category');
    const list = document.getElementById('category-list');
    select.innerHTML = '';
    list.innerHTML = '';

    const res = await fetch('/api/knowledge/categories');
    const data = await res.json();

    data.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat.id;
        opt.textContent = cat.name;
        select.appendChild(opt);

        const li = document.createElement('li');
        li.innerHTML = `
      <strong>${cat.name}</strong> (пріоритет ${cat.priority})
      <div>
        <button onclick="editCategory(${cat.id}, \`${cat.name}\`, \`${cat.description || ''}\`, ${cat.priority}, ${cat.is_hidden})">✏️</button>
        <button onclick="deleteCategory(${cat.id})">🗑️</button>
      </div>
    `;
        list.appendChild(li);
    });
}

async function loadArticles() {
    const list = document.getElementById('article-list');
    list.innerHTML = '';
    const res = await fetch('/api/knowledge/articles');
    const data = await res.json();

    data.forEach(article => {
        const li = document.createElement('li');
        li.innerHTML = `
      <strong>${article.title}</strong> (пріоритет ${article.priority})
      <div>
        <button onclick="editArticle(${article.id})">✏️</button>
        <button onclick="deleteArticle(${article.id})">🗑️</button>
      </div>
    `;
        list.appendChild(li);
    });
}

async function editArticle(id) {
    const res = await fetch('/api/knowledge/articles');
    const data = await res.json();
    const article = data.find(a => a.id === id);
    if (!article) return;

    editingArticleId = id;
    document.getElementById('article-form-title').textContent = `✏️ Редагувати Статтю #${id}`;
    document.getElementById('cancel-article-edit').style.display = 'inline-block';
    document.getElementById('title').value = article.title;
    document.getElementById('category').value = article.category_id;
    document.getElementById('priority').value = article.priority;
    document.getElementById('markdown').value = article.text || '';
    document.getElementById('is-hidden').checked = article.is_hidden === 1;
    document.getElementById('article-form').closest('.editor-block').style.border = '2px solid orange';
    document.getElementById('title').focus();
}

function editCategory(id, name, desc, priority, is_hidden) {
    editingCategoryId = id;
    document.getElementById('category-form-title').textContent = `✏️ Редагувати Категорію #${id}`;
    document.getElementById('cancel-category-edit').style.display = 'inline-block';
    document.getElementById('category-name').value = name;
    document.getElementById('category-description').value = desc || '';
    document.getElementById('category-priority').value = priority;
    document.getElementById('category-hidden').checked = is_hidden === 1;
    document.getElementById('category-form').closest('.editor-block').style.border = '2px solid orange';
    document.getElementById('category-name').focus();
}

async function deleteCategory(id) {
    if (!confirm('Видалити цю категорію?')) return;
    await fetch(`/api/knowledge/category/${id}`, { method: 'DELETE' });
    await loadCategories();
}

async function deleteArticle(id) {
    if (!confirm('Видалити цю статтю?')) return;
    await fetch(`/api/knowledge/article/${id}`, { method: 'DELETE' });
    await loadArticles();
}
