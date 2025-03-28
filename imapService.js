require('dotenv').config();
const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const pool = require('./db');

const client = new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

async function startListeningForEmails() {
    await client.connect();
    await client.mailboxOpen('INBOX');

    console.log('📥 Ожидание новых писем...');

    client.on('exists', async () => {
        const message = await client.fetchOne('*', { source: true });

        const parsed = await simpleParser(message.source);
        const subject = parsed.subject || '';
        let body = parsed.text?.trim() || '';

        body = body
            .split('\n')
            .filter(line =>
                !line.trim().startsWith('>') &&
                !/^On .*wrote:/.test(line) &&
                !/^From:/.test(line) &&
                !/^Sent:/.test(line) &&
                !/^To:/.test(line) &&
                !/^Subject:/.test(line) &&
                !/^---+/.test(line) &&
                !/^Сб, .*г\./i.test(line)
            )
            .join('\n')
            .trim();

        const ticketIdMatch = subject.match(/\[Ticket\s+#(\d+)]/i);
        if (!ticketIdMatch) return;

        const ticketId = parseInt(ticketIdMatch[1]);

        const [tickets] = await pool.query(`SELECT * FROM tickets WHERE id = ?`, [ticketId]);
        if (tickets.length === 0) return;
        if (tickets[0].status === 'closed') return;

        const userEmail = parsed.from?.value?.[0]?.address || null;

        const [users] = await pool.query(`SELECT id FROM users WHERE email = ?`, [userEmail]);
        if (users.length === 0) return;

        const userId = users[0].id;
        if (tickets[0].user_id !== userId) return;

        const [exist] = await pool.query(`
      SELECT COUNT(*) as cnt FROM ticket_messages
      WHERE ticket_id = ? AND message = ? AND sender_role = 'customer'
    `, [ticketId, body]);

        if (exist[0].cnt > 0) return;

        await pool.query(`
      INSERT INTO ticket_messages (ticket_id, sender_role, message)
      VALUES (?, 'customer', ?)
    `, [ticketId, body]);

        console.log(`✅ Новое сообщение в тикет #${ticketId} от ${userEmail}`);
    });
}

module.exports = {
    startListeningForEmails
};
