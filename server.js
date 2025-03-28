const express = require('express');
const pool = require('./db');
const marked = require('marked');
const cookieParser = require('cookie-parser');
const { OAuth2Client } = require('google-auth-library');

const app = express();
const PORT = 3000;

// ЗАМЕНИ ЭТО НА СВОЙ CLIENT_ID ОТ GOOGLE
const CLIENT_ID = '48635369674-hpohhuqf92pkd7b56oj10rrt1t25la5v.apps.googleusercontent.com';

const client = new OAuth2Client(CLIENT_ID);

app.use(express.static('public'));
app.use(express.json());
app.use(cookieParser());

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

app.post('/api/auth/google', async (req, res) => {
    const { credential } = req.body;
    if (!credential) return res.status(400).json({ error: 'Missing token' });

    try {
        const ticket = await client.verifyIdToken({
            idToken: credential,
            audience: CLIENT_ID,
        });

        const payload = ticket.getPayload();
        const googleId = payload.sub;
        const email = payload.email;
        const name = payload.name;

        const [users] = await pool.query(`SELECT * FROM users WHERE google_id = ?`, [googleId]);

        let user;
        if (users.length === 0) {
            const [result] = await pool.query(`
        INSERT INTO users (name, email, google_id)
        VALUES (?, ?, ?)`, [name, email, googleId]);
            user = { id: result.insertId, name };
        } else {
            // ✅ обновим updated_date
            await pool.query(`UPDATE users SET updated_date = CURRENT_TIMESTAMP WHERE google_id = ?`, [googleId]);
            user = users[0];
        }

        res.cookie('user_name', user.name, { httpOnly: false, sameSite: 'Lax' });
        res.json({ name: user.name });

    } catch (error) {
        console.error('Auth error:', error);
        res.status(401).json({ error: 'Invalid token' });
    }
});


app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
