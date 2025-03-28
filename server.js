require('dotenv').config();
const express = require('express');
const pool = require('./db');
const marked = require('marked');
const cookieParser = require('cookie-parser');
const { OAuth2Client } = require('google-auth-library');
const { sendTicketConfirmation } = require('./mail');
const { startListeningForEmails } = require('./imapService'); // Заменено здесь

const app = express();
const PORT = 3000;

const CLIENT_ID = '48635369674-hpohhuqf92pkd7b56oj10rrt1t25la5v.apps.googleusercontent.com';
const client = new OAuth2Client(CLIENT_ID);

app.use(express.static('public'));
app.use(express.json());
app.use(cookieParser());

// Запуск обработки новых писем каждые 30 секунд
startListeningForEmails().catch(console.error);

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

app.get('/api/ticket-categories', async (req, res) => {
    try {
        const [rows] = await pool.query(`SELECT id, name, description FROM ticket_categories`);
        res.json(rows);
    } catch (err) {
        console.error('Ошибка получения категорий тикетов:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

app.get('/api/ticket-fields', async (req, res) => {
    const categoryId = req.query.category_id;
    if (!categoryId) return res.status(400).json({ error: 'Missing category_id' });

    try {
        const [rows] = await pool.query(`
            SELECT id, category_id, field_name, field_label, field_type, is_required, options
            FROM ticket_fields
            WHERE category_id = ?
            ORDER BY sort_order ASC
        `, [categoryId]);

        res.json(rows);
    } catch (err) {
        console.error('Ошибка получения полей:', err);
        res.status(500).json({ error: 'Server error' });
    }
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
            await pool.query(`UPDATE users SET updated_date = CURRENT_TIMESTAMP WHERE google_id = ?`, [googleId]);
            user = users[0];
        }

        res.cookie('user_name', user.name, { httpOnly: false, sameSite: 'Lax' });
        res.cookie('user_email', user.email, { httpOnly: false, sameSite: 'Lax' });
        res.json({ name: user.name });

    } catch (error) {
        console.error('Auth error:', error);
        res.status(401).json({ error: 'Invalid token' });
    }
});

app.post('/api/tickets/create', async (req, res) => {
    const { email, title, category_id, description, fields } = req.body;

    if (!email || !title || !category_id || !fields) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        const [users] = await pool.query(`SELECT * FROM users WHERE email = ?`, [email]);
        if (users.length === 0) {
            return res.status(400).json({ error: 'User not found' });
        }
        const user = users[0];

        const [result] = await pool.query(`
            INSERT INTO tickets (user_id, category_id, title, description)
            VALUES (?, ?, ?, ?)
        `, [user.id, category_id, title, description || null]);

        const ticketId = result.insertId;

        for (const field of fields) {
            await pool.query(`
                INSERT INTO ticket_field_values (ticket_id, field_id, field_value)
                VALUES (?, ?, ?)
            `, [ticketId, field.id, field.value]);
        }

        await sendTicketConfirmation(email, title, ticketId);

        res.json({ success: true, ticket_id: ticketId });
    } catch (err) {
        console.error('Ticket creation error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

app.get('/api/tickets/:id', async (req, res) => {
    const ticketId = req.params.id;
    const userEmail = req.query.email;

    if (!ticketId || !userEmail) {
        return res.status(400).json({ error: 'Missing ticket id or email' });
    }

    try {
        const [users] = await pool.query(`SELECT id FROM users WHERE email = ?`, [userEmail]);
        if (users.length === 0) return res.status(403).json({ error: 'User not found' });
        const userId = users[0].id;

        const [tickets] = await pool.query(`SELECT * FROM tickets WHERE id = ? AND user_id = ?`, [ticketId, userId]);
        if (tickets.length === 0) return res.status(403).json({ error: 'Access denied' });

        const [messages] = await pool.query(`
            SELECT sender_role, message, created_date
            FROM ticket_messages
            WHERE ticket_id = ?
            ORDER BY created_date ASC
        `, [ticketId]);

        res.json({ ticket: tickets[0], messages });
    } catch (err) {
        console.error('Ticket fetch error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/tickets/:id/reply', async (req, res) => {
    const ticketId = req.params.id;
    const { email, message } = req.body;

    if (!ticketId || !email || !message) {
        return res.status(400).json({ error: 'Missing data' });
    }

    try {
        const [users] = await pool.query(`SELECT id FROM users WHERE email = ?`, [email]);
        if (users.length === 0) return res.status(403).json({ error: 'User not found' });

        const userId = users[0].id;

        const [tickets] = await pool.query(`SELECT * FROM tickets WHERE id = ? AND user_id = ?`, [ticketId, userId]);
        if (tickets.length === 0) return res.status(403).json({ error: 'Access denied' });

        await pool.query(`
            INSERT INTO ticket_messages (ticket_id, sender_role, message)
            VALUES (?, 'customer', ?)
        `, [ticketId, message]);

        res.json({ success: true });
    } catch (err) {
        console.error('Reply error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
