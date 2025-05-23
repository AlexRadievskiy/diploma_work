require('dotenv').config();
const express = require('express');
const pool = require('./db');
const marked = require('marked');
const cookieParser = require('cookie-parser');
const { OAuth2Client } = require('google-auth-library');
const { sendTicketConfirmation } = require('./mail');
const { sendTicketReply } = require('./mail');
const { startListeningForEmails } = require('./imapService');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;

const CLIENT_ID = '48635369674-hpohhuqf92pkd7b56oj10rrt1t25la5v.apps.googleusercontent.com';
const client = new OAuth2Client(CLIENT_ID);

// Создание папки для загрузок, если не существует
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const unique = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, unique + path.extname(file.originalname));
    }
});
const upload = multer({ storage });

app.use(express.static('public'));
app.use(express.json());
app.use(cookieParser());


app.use(express.static(path.join(__dirname, 'public')));
app.use('/templates', express.static(path.join(__dirname, 'templates')));

// Запуск слушателя писем
startListeningForEmails().catch(console.error);

// ... статьи и категории
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

    if (articles.length === 0) return res.status(404).json({ error: 'Article not found' });

    const article = articles[0];
    article.text_html = marked.parse(article.text || '');
    res.json(article);
});

// ... поиск
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

// ... Google auth
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
        const picture = payload.picture; // ✅ ВАЖНО!

        const [users] = await pool.query(`SELECT * FROM users WHERE google_id = ?`, [googleId]);

        let user;
        if (users.length === 0) {
            const [result] = await pool.query(`
                INSERT INTO users (name, email, google_id)
                VALUES (?, ?, ?)`, [name, email, googleId]);
            user = { id: result.insertId, name, email, picture };
        } else {
            await pool.query(`UPDATE users SET updated_date = CURRENT_TIMESTAMP WHERE google_id = ?`, [googleId]);
            user = users[0];
        }

        res.cookie('user_name', user.name, { httpOnly: false, sameSite: 'Lax' });
        res.cookie('user_email', user.email, { httpOnly: false, sameSite: 'Lax' });
        res.cookie('user_avatar', payload.picture, { httpOnly: false, sameSite: 'Lax' });

        res.json({
            name: user.name,
            email: user.email,
            picture
        });

    } catch (error) {
        console.error('Auth error:', error);
        res.status(401).json({ error: 'Invalid token' });
    }
});


// ... создание тикета
app.post('/api/tickets/create', async (req, res) => {
    const { email, title, category_id, description, fields } = req.body;

    if (!email || !title || !category_id || !fields) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        const [users] = await pool.query(`SELECT * FROM users WHERE email = ?`, [email]);
        if (users.length === 0) return res.status(400).json({ error: 'User not found' });

        const user = users[0];
        if (user.is_blocked === 1) {
            return res.status(403).json({ error: 'Your account is blocked. You cannot create tickets.' });
        }

        const [result] = await pool.query(`
            INSERT INTO tickets (user_id, category_id, title, description)
            VALUES (?, ?, ?, ?)`, [user.id, category_id, title, description || null]);

        const ticketId = result.insertId;

        for (const field of fields) {
            await pool.query(`
                INSERT INTO ticket_field_values (ticket_id, field_id, field_value)
                VALUES (?, ?, ?)`, [ticketId, field.id, field.value]);
        }

        await sendTicketConfirmation(email, title, ticketId);

        res.json({ success: true, ticket_id: ticketId });
    } catch (err) {
        console.error('Ticket creation error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});


// ... список тикетов (для пользователя)
app.get('/api/tickets', async (req, res) => {
    const { email, status } = req.query;
    if (!email) return res.status(400).json({ error: 'Missing email' });

    try {
        const [users] = await pool.query(`SELECT id FROM users WHERE email = ?`, [email]);
        if (users.length === 0) return res.status(403).json({ error: 'User not found' });

        const userId = users[0].id;

        const [tickets] = await pool.query(`
            SELECT t.*, 
                (SELECT message FROM ticket_messages WHERE ticket_id = t.id ORDER BY created_date DESC LIMIT 1) AS last_message,
                (SELECT created_date FROM ticket_messages WHERE ticket_id = t.id ORDER BY created_date DESC LIMIT 1) AS last_message_date
            FROM tickets t
            WHERE t.user_id = ? ${status ? 'AND t.status = ?' : ''}
            ORDER BY t.update_date DESC
        `, status ? [userId, status] : [userId]);

        res.json(tickets);
    } catch (err) {
        console.error('Ticket list error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ... просмотр одного тикета
app.get('/api/tickets/:id', async (req, res) => {
    const ticketId = req.params.id;
    const userEmail = req.query.email;
    const forSupport = req.query.forSupport === 'true';

    if (!ticketId) return res.status(400).json({ error: 'Missing ticket id' });

    try {
        const [ticketRows] = await pool.query(`
            SELECT t.*, u.email as user_email
            FROM tickets t
            JOIN users u ON t.user_id = u.id
            WHERE t.id = ?
        `, [ticketId]);

        if (ticketRows.length === 0) return res.status(404).json({ error: 'Ticket not found' });

        const ticket = ticketRows[0];

        // Проверка доступа
        if (!forSupport) {
            const [users] = await pool.query(`SELECT id FROM users WHERE email = ?`, [userEmail]);
            if (users.length === 0 || users[0].id !== ticket.user_id) {
                return res.status(403).json({ error: 'Access denied' });
            }
        }

        // Сообщения с псевдонимом агента (если есть)
        const [messages] = await pool.query(`
            SELECT m.id, m.sender_role, m.message, m.created_date, s.agent_name
            FROM ticket_messages m
            LEFT JOIN support_staff s ON m.support_staff_id = s.id
            WHERE m.ticket_id = ?
        `, [ticketId]);

        // Вложения также с agent_name
        const [attachments] = await pool.query(`
            SELECT 
                a.message_id, 
                a.file_path, 
                a.file_name, 
                m.sender_role, 
                m.created_date,
                s.agent_name
            FROM ticket_message_attachments a
            JOIN ticket_messages m ON a.message_id = m.id
            LEFT JOIN support_staff s ON m.support_staff_id = s.id
            WHERE m.ticket_id = ?
        `, [ticketId]);

        // Динамические поля
        const [fields] = await pool.query(`
            SELECT tf.field_label, tf.field_type, tfv.field_value
            FROM ticket_field_values tfv
            JOIN ticket_fields tf ON tfv.field_id = tf.id
            WHERE tfv.ticket_id = ?
            ORDER BY tf.sort_order
        `, [ticketId]);

        // Объединение сообщений и вложений в единый поток
        const events = [];

        for (const msg of messages) {
            events.push({
                type: 'message',
                sender_role: msg.sender_role,
                message: msg.message,
                created_date: msg.created_date,
                agent_name: msg.agent_name || null
            });
        }

        for (const att of attachments) {
            events.push({
                type: 'attachment',
                sender_role: att.sender_role,
                file_path: att.file_path,
                file_name: att.file_name,
                created_date: att.created_date,
                agent_name: att.agent_name || null
            });
        }

        // Сортировка по дате
        events.sort((a, b) => new Date(a.created_date) - new Date(b.created_date));

        res.json({ ticket, fields, events });
    } catch (err) {
        console.error('Ticket fetch error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/tickets/:id/reply', upload.single('file'), async (req, res) => {
    const ticketId = req.params.id;
    const { email, message } = req.body;
    const file = req.file;

    if (!ticketId || !email || (!message && !file)) {
        return res.status(400).json({ error: 'Missing data' });
    }

    try {
        const [users] = await pool.query(`SELECT id FROM users WHERE email = ?`, [email]);
        if (users.length === 0) return res.status(403).json({ error: 'User not found' });
        const userId = users[0].id;

        const [tickets] = await pool.query(`SELECT * FROM tickets WHERE id = ? AND user_id = ?`, [ticketId, userId]);
        if (tickets.length === 0) return res.status(403).json({ error: 'Access denied' });
        if (tickets[0].status === 'closed') {
            return res.status(400).json({ error: 'Cannot reply to a closed ticket' });
        }

        let messageId = null;

        if (message && message.trim()) {
            const [result] = await pool.query(`
                INSERT INTO ticket_messages (ticket_id, sender_role, message)
                VALUES (?, 'customer', ?)`, [ticketId, message.trim()]);
            messageId = result.insertId;
        }

        if (file) {
            // если нет сообщения — создаём "пустое" системное сообщение для вложения
            if (!messageId) {
                const [msgRes] = await pool.query(`
                    INSERT INTO ticket_messages (ticket_id, sender_role, message)
                    VALUES (?, 'customer', '')`, [ticketId]);
                messageId = msgRes.insertId;
            }

            await pool.query(`
                INSERT INTO ticket_message_attachments (message_id, file_path, file_name)
                VALUES (?, ?, ?)
            `, [
                messageId,
                '/uploads/' + file.filename,
                file.originalname
            ]);
        }

        res.json({ success: true });
    } catch (err) {
        console.error('Reply with file error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/tickets/:id/close', async (req, res) => {
    const ticketId = req.params.id;
    const { email } = req.body;

    if (!email || !ticketId) return res.status(400).json({ error: 'Missing data' });

    try {
        const [users] = await pool.query(`SELECT id FROM users WHERE email = ?`, [email]);
        if (!users.length) return res.status(403).json({ error: 'User not found' });

        const userId = users[0].id;

        const [tickets] = await pool.query(`SELECT * FROM tickets WHERE id = ? AND user_id = ?`, [ticketId, userId]);
        if (!tickets.length) return res.status(403).json({ error: 'Access denied' });

        await pool.query(`UPDATE tickets SET status = 'closed' WHERE id = ?`, [ticketId]);
        res.json({ success: true });
    } catch (err) {
        console.error('Ticket close error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});


// ... проверка на саппорт агента
app.get('/api/is-support-agent', async (req, res) => {
    const email = req.query.email;
    if (!email) return res.status(400).json({ error: 'Missing email' });

    try {
        const [users] = await pool.query(`SELECT id FROM users WHERE email = ?`, [email]);
        if (users.length === 0) return res.json({ isSupportAgent: false });

        const userId = users[0].id;

        const [agents] = await pool.query(`SELECT access_level FROM support_staff WHERE user_id = ?`, [userId]);
        if (agents.length === 0) return res.json({ isSupportAgent: false });

        return res.json({ isSupportAgent: true, access_level: agents[0].access_level });
    } catch (err) {
        console.error('Support check error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ... список тикетов для саппортов
app.get('/api/support/tickets', async (req, res) => {
    const { email, status, user } = req.query;

    if (!email) return res.status(400).json({ error: 'Missing email' });

    try {
        const [userRows] = await pool.query(`SELECT id FROM users WHERE email = ?`, [email]);
        if (userRows.length === 0) return res.status(403).json({ error: 'User not found' });

        const userId = userRows[0].id;

        const [staff] = await pool.query(`SELECT id FROM support_staff WHERE user_id = ?`, [userId]);
        if (staff.length === 0) return res.status(403).json({ error: 'Not support staff' });

        let query = `
            SELECT 
                t.id, 
                t.title, 
                t.status,
                t.creation_date,
                t.update_date,
                COALESCE(u.name, 'No Name') AS user_name,
                u.email as user_email,
                (SELECT message FROM ticket_messages WHERE ticket_id = t.id ORDER BY created_date DESC LIMIT 1) as last_message,
                (SELECT created_date FROM ticket_messages WHERE ticket_id = t.id ORDER BY created_date DESC LIMIT 1) as last_message_date
            FROM tickets t
            JOIN users u ON t.user_id = u.id
            WHERE 1
        `;

        const params = [];

        if (status) {
            query += ` AND t.status = ?`;
            params.push(status);
        }

        if (user) {
            query += ` AND u.email LIKE ?`;
            params.push(`%${user}%`);
        }

        query += ` ORDER BY t.update_date DESC`;

        const [tickets] = await pool.query(query, params);
        res.json(tickets);
    } catch (err) {
        console.error('Ошибка получения тикетов:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/support/tickets/:id/reply', upload.single('file'), async (req, res) => {
    const ticketId = req.params.id;
    const { support_email, message } = req.body;

    if (!support_email || (!message && !req.file)) {
        return res.status(400).json({ error: 'Missing message or file or support_email' });
    }

    try {
        const [[staff]] = await pool.query(`
            SELECT s.id FROM support_staff s
            JOIN users u ON s.user_id = u.id
            WHERE u.email = ?
        `, [support_email]);

        if (!staff) return res.status(403).json({ error: 'Access denied' });

        const [ticketRows] = await pool.query(`SELECT * FROM tickets WHERE id = ?`, [ticketId]);
        if (ticketRows.length === 0) return res.status(404).json({ error: 'Ticket not found' });

        const ticket = ticketRows[0];

        const [msgResult] = await pool.query(`
            INSERT INTO ticket_messages (ticket_id, sender_role, message, support_staff_id)
            VALUES (?, 'support', ?, ?)
        `, [ticketId, message || '', staff.id]);

        const messageId = msgResult.insertId;

        if (req.file) {
            const filePath = `/uploads/${req.file.filename}`;
            await pool.query(`
                INSERT INTO ticket_message_attachments (message_id, file_path, file_name)
                VALUES (?, ?, ?)
            `, [messageId, filePath, req.file.originalname]);
        }

        await pool.query(`UPDATE tickets SET status = 'in_progress' WHERE id = ?`, [ticketId]);

        // Отправка email-уведомления пользователю
        if (message && message.trim()) {
            const [userRows] = await pool.query(`
                SELECT u.email, t.title
                FROM tickets t
                JOIN users u ON t.user_id = u.id
                WHERE t.id = ?
            `, [ticketId]);

            if (userRows.length) {
                const { email, title } = userRows[0];
                await sendTicketReply(email, title, ticketId, message.trim());
            }
        }

        res.json({ success: true });
    } catch (err) {
        console.error('Support reply error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});


app.post('/api/support/tickets/:id/note', async (req, res) => {
    const ticketId = req.params.id;
    const { note, support_email } = req.body;

    if (!support_email) return res.status(400).json({ error: 'Missing support email' });

    try {
        const [staff] = await pool.query(`
            SELECT s.id FROM support_staff s
            JOIN users u ON s.user_id = u.id
            WHERE u.email = ?
        `, [support_email]);

        if (staff.length === 0) return res.status(403).json({ error: 'Access denied' });

        await pool.query(`UPDATE tickets SET note = ? WHERE id = ?`, [note, ticketId]);
        res.json({ success: true });
    } catch (err) {
        console.error('Ошибка при сохранении заметки:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/support/tickets/:id/status', async (req, res) => {
    const ticketId = req.params.id;
    const { status, support_email } = req.body;

    if (!support_email || !['open', 'in_progress', 'closed'].includes(status)) {
        return res.status(400).json({ error: 'Invalid request' });
    }

    try {
        const [staff] = await pool.query(`
            SELECT s.id FROM support_staff s
            JOIN users u ON s.user_id = u.id
            WHERE u.email = ?
        `, [support_email]);

        if (staff.length === 0) return res.status(403).json({ error: 'Access denied' });

        await pool.query(`UPDATE tickets SET status = ? WHERE id = ?`, [status, ticketId]);
        res.json({ success: true });
    } catch (err) {
        console.error('Ошибка при смене статуса:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/support/users/block', async (req, res) => {
    const { email, support_email } = req.body;

    if (!email || !support_email) {
        return res.status(400).json({ error: 'Missing email or support_email' });
    }

    try {
        const [staff] = await pool.query(`
            SELECT s.id FROM support_staff s
            JOIN users u ON s.user_id = u.id
            WHERE u.email = ?
        `, [support_email]);

        if (staff.length === 0) return res.status(403).json({ error: 'Access denied' });

        const [users] = await pool.query(`SELECT id FROM users WHERE email = ?`, [email]);
        if (users.length === 0) return res.status(404).json({ error: 'User not found' });

        const userId = users[0].id;

        await pool.query(`UPDATE users SET is_blocked = 1 WHERE id = ?`, [userId]);
        await pool.query(`UPDATE tickets SET status = 'closed' WHERE user_id = ?`, [userId]);

        res.json({ success: true });
    } catch (err) {
        console.error('Ошибка при блокировке пользователя:', err);
        res.status(500).json({ error: 'Server error' });
    }
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
        console.error('Ошибка получения полей тикета:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// API загрузки вложений пользователем
app.post('/api/tickets/:id/upload', upload.single('file'), async (req, res) => {
    const ticketId = req.params.id;
    const email = req.body.email;
    const role = req.body.role; // 'customer' или 'support'

    if (!email || !role || !['customer', 'support'].includes(role)) {
        return res.status(400).json({ error: 'Missing or invalid role/email' });
    }

    try {
        let userId;
        if (role === 'customer') {
            const [users] = await pool.query(`SELECT id FROM users WHERE email = ?`, [email]);
            if (!users.length) return res.status(403).json({ error: 'User not found' });
            userId = users[0].id;

            const [tickets] = await pool.query(`SELECT * FROM tickets WHERE id = ? AND user_id = ?`, [ticketId, userId]);
            if (!tickets.length) return res.status(403).json({ error: 'Access denied' });
        } else {
            const [staff] = await pool.query(`
                SELECT s.id FROM support_staff s
                JOIN users u ON s.user_id = u.id
                WHERE u.email = ?
            `, [email]);
            if (!staff.length) return res.status(403).json({ error: 'Access denied' });
            userId = staff[0].id;
        }

        const [result] = await pool.query(`
            INSERT INTO ticket_messages (ticket_id, sender_role, support_staff_id)
            VALUES (?, ?, ?)
        `, [
            ticketId,
            role,
            role === 'support' ? userId : null
        ]);

        const messageId = result.insertId;

        await pool.query(`
            INSERT INTO ticket_message_attachments (message_id, file_path, file_name)
            VALUES (?, ?, ?)
        `, [messageId, `/uploads/${req.file.filename}`, req.file.originalname]);

        res.json({ success: true });
    } catch (err) {
        console.error('Upload error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// API загрузки вложений сотрудником
app.post('/api/support/tickets/:id/upload', upload.single('attachment'), async (req, res) => {
    const ticketId = req.params.id;
    const support_email = req.body.email;

    if (!req.file || !ticketId || !support_email) {
        return res.status(400).json({ error: 'Missing file or data' });
    }

    try {
        const [staff] = await pool.query(`
            SELECT s.id FROM support_staff s
            JOIN users u ON s.user_id = u.id
            WHERE u.email = ?
        `, [support_email]);

        if (staff.length === 0) return res.status(403).json({ error: 'Access denied' });

        const [ticket] = await pool.query(`SELECT * FROM tickets WHERE id = ?`, [ticketId]);
        if (ticket.length === 0) return res.status(404).json({ error: 'Ticket not found' });

        const [msgResult] = await pool.query(`
            INSERT INTO ticket_messages (ticket_id, sender_role, support_staff_id, message)
            VALUES (?, 'support', ?, '')
        `, [ticketId, staff[0].id]);

        await pool.query(`
            INSERT INTO ticket_message_attachments (message_id, file_path, file_name)
            VALUES (?, ?, ?)
        `, [msgResult.insertId, `/uploads/${req.file.filename}`, req.file.originalname]);

        res.json({ success: true, file: `/uploads/${req.file.filename}` });
    } catch (err) {
        console.error('Support upload error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/support/set-role', async (req, res) => {
    const { requesterEmail, targetEmail, newRole } = req.body;

    try {
        // Получаем access_level инициатора
        const [requesterRows] = await pool.query(`
            SELECT s.access_level
            FROM support_staff s
            JOIN users u ON s.user_id = u.id
            WHERE u.email = ?
        `, [requesterEmail]);

        const requester = requesterRows[0];
        if (!requester) return res.status(403).send('Access denied');

        const requesterRole = requester.access_level;

        // Защита: только senior и admin могут менять роли
        if (!['senior', 'admin'].includes(requesterRole)) {
            return res.status(403).send('Only senior or admin can assign roles');
        }

        const validRoles = ['junior', 'senior', 'admin', 'fired'];
        if (!validRoles.includes(newRole)) return res.status(400).send('Invalid role');

        // Защита: senior не может назначать senior или admin
        if (requesterRole === 'senior' && ['senior', 'admin'].includes(newRole)) {
            return res.status(403).send('Seniors can only assign junior or fired');
        }

        // Обновляем ранг целевого пользователя через email
        const [result] = await pool.query(`
            UPDATE support_staff s
            JOIN users u ON s.user_id = u.id
            SET s.access_level = ?
            WHERE u.email = ?
        `, [newRole, targetEmail]);

        if (result.affectedRows === 0) {
            return res.status(404).send('Target user not found or not support staff');
        }

        res.send(`Role updated to ${newRole}`);
    } catch (err) {
        console.error('[❌ Ошибка при установке роли]', err);
        res.status(500).send('Server error');
    }
});

// 📥 Получение всех категорий (не скрытых)
app.get('/api/knowledge/categories', async (req, res) => {
    try {
        const [rows] = await pool.query(
            'SELECT id, name, description, priority, is_hidden FROM knowledge_base_categories ORDER BY priority DESC'
        );
        res.json(rows);
    } catch (err) {
        console.error('Ошибка при загрузке категорий:', err);
        res.status(500).send('Server error');
    }
});

// 🟢 Создание категории
app.post('/api/knowledge/category', async (req, res) => {
    const { name, description, priority, is_hidden } = req.body;

    if (!name) return res.status(400).send('Category name is required');

    try {
        await pool.query(
            'INSERT INTO knowledge_base_categories (name, description, priority, is_hidden) VALUES (?, ?, ?, ?)',
            [name, description || null, priority || 0, is_hidden || 0]
        );
        res.send('Category created successfully');
    } catch (err) {
        console.error('Ошибка при создании категории:', err);
        res.status(500).send('Server error');
    }
});

// 🟡 Редактирование категории
app.put('/api/knowledge/category/:id', async (req, res) => {
    const id = req.params.id;
    const { name, description, priority, is_hidden } = req.body;

    try {
        await pool.query(
            'UPDATE knowledge_base_categories SET name = ?, description = ?, priority = ?, is_hidden = ? WHERE id = ?',
            [name, description || null, priority || 0, is_hidden || 0, id]
        );
        res.send('Category updated');
    } catch (err) {
        console.error('Ошибка при обновлении категории:', err);
        res.status(500).send('Server error');
    }
});

// 🔴 Удаление категории
app.delete('/api/knowledge/category/:id', async (req, res) => {
    const id = req.params.id;

    try {
        await pool.query('DELETE FROM knowledge_base_categories WHERE id = ?', [id]);
        res.send('Category deleted');
    } catch (err) {
        console.error('Ошибка при удалении категории:', err);
        res.status(500).send('Server error');
    }
});

// 🟢 Создание статьи
app.post('/api/knowledge/article', async (req, res) => {
    const { title, category_id, priority, text, is_hidden } = req.body;

    if (!title || !category_id || !text) {
        return res.status(400).send('Missing required fields');
    }

    try {
        await pool.query(
            'INSERT INTO knowledge_base_articles (title, text, category_id, priority, is_hidden) VALUES (?, ?, ?, ?, ?)',
            [title, text, category_id, priority || 0, is_hidden || 0]
        );
        res.send('Article saved successfully');
    } catch (err) {
        console.error('Ошибка при создании статьи:', err);
        res.status(500).send('Server error');
    }
});

// 🟡 Редактирование статьи
app.put('/api/knowledge/article/:id', async (req, res) => {
    const id = req.params.id;
    const { title, category_id, priority, text, is_hidden } = req.body;

    try {
        await pool.query(
            'UPDATE knowledge_base_articles SET title = ?, text = ?, category_id = ?, priority = ?, is_hidden = ? WHERE id = ?',
            [title, text, category_id, priority || 0, is_hidden || 0, id]
        );
        res.send('Article updated');
    } catch (err) {
        console.error('Ошибка при обновлении статьи:', err);
        res.status(500).send('Server error');
    }
});

// 🔴 Удаление статьи
app.delete('/api/knowledge/article/:id', async (req, res) => {
    const id = req.params.id;

    try {
        await pool.query('DELETE FROM knowledge_base_articles WHERE id = ?', [id]);
        res.send('Article deleted');
    } catch (err) {
        console.error('Ошибка при удалении статьи:', err);
        res.status(500).send('Server error');
    }
});

app.get('/api/knowledge/articles', async (req, res) => {
    try {
        const [rows] = await pool.query(
            'SELECT id, title, category_id, priority, is_hidden FROM knowledge_base_articles ORDER BY priority DESC'
        );
        res.json(rows);
    } catch (err) {
        console.error('Ошибка при загрузке статей:', err);
        res.status(500).send('Server error');
    }
});

app.get('/api/analytics/overview', async (req, res) => {
    try {
        const { from, to } = req.query;
        let dateFilter = '';
        const params = [];

        if (from && to) {
            dateFilter = 'WHERE creation_date BETWEEN ? AND ?';
            params.push(from, to);
        }

        const [[{ count: totalTickets }]] = await pool.query(
            `SELECT COUNT(*) as count FROM tickets ${dateFilter}`,
            params
        );

        const [statusBreakdown] = await pool.query(
            `SELECT t.status, COUNT(*) as count FROM tickets t ${dateFilter} GROUP BY t.status`,
            params
        );

        const [priorityBreakdown] = await pool.query(
            `SELECT t.priority, COUNT(*) as count FROM tickets t ${dateFilter} GROUP BY t.priority`,
            params
        );

        const [agentLoad] = await pool.query(
            `SELECT s.agent_name AS name, COUNT(*) as count
       FROM support_staff s
       JOIN ticket_messages tm ON tm.support_staff_id = s.id
       JOIN tickets t ON t.id = tm.ticket_id
       ${dateFilter}
       GROUP BY s.id
       ORDER BY count DESC`,
            params
        );

        const [categoryUsage] = await pool.query(
            `SELECT c.name, COUNT(*) as count
       FROM ticket_categories c
       JOIN tickets t ON t.category_id = c.id
       ${dateFilter}
       GROUP BY c.id`,
            params
        );

        res.json({ totalTickets, statusBreakdown, priorityBreakdown, agentLoad, categoryUsage });
    } catch (e) {
        console.error('❌ Ошибка в /api/analytics/overview:', e);
        res.status(500).json({ error: 'Analytics failed', details: e.message });
    }
});



app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
