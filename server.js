const express = require('express');
const pool = require('./db');
const marked = require('marked');
const app = express();
const PORT = 3000;

app.use(express.static('public'));
app.use(express.json());

app.get('/api/categories', async (req, res) => {
    const [categories] = await pool.query(`
    SELECT * FROM knowledge_base_categories
    WHERE is_hidden = 0
    ORDER BY priority DESC
  `);

    for (const category of categories) {
        const [articles] = await pool.query(`
      SELECT id, title FROM knowledge_base_articles
      WHERE is_hidden = 0 AND category_id = ?
      ORDER BY priority DESC
    `, [category.id]);
        category.articles = articles;
    }

    res.json(categories);
});

app.get('/api/articles/:id', async (req, res) => {
    const [articles] = await pool.query(`
    SELECT * FROM knowledge_base_articles
    WHERE id = ? AND is_hidden = 0
  `, [req.params.id]);

    if (articles.length === 0) {
        return res.status(404).json({ error: 'Article not found' });
    }

    const article = articles[0];
    article.text_html = marked.parse(article.text || '');

    res.json(article);
});

app.get('/api/search', async (req, res) => {
    const query = req.query.q;
    if (!query) return res.json([]);

    const [results] = await pool.query(`
    SELECT a.id, a.title, c.name as category_name
    FROM knowledge_base_articles a
    JOIN knowledge_base_categories c ON a.category_id = c.id
    WHERE a.is_hidden = 0 AND c.is_hidden = 0
      AND (LOWER(a.title) LIKE ? OR LOWER(a.text) LIKE ?)
    ORDER BY a.priority DESC
    LIMIT 10
  `, [`%${query.toLowerCase()}%`, `%${query.toLowerCase()}%`]);

    res.json(results);
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
