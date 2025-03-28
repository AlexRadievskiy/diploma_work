require('dotenv').config();
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

async function sendTicketConfirmation(to, ticketTitle, ticketId) {
    const url = `${process.env.BASE_URL}/ticket.html?id=${ticketId}`;

    await transporter.sendMail({
        from: `"Support Team" <${process.env.EMAIL_USER}>`,
        to,
        subject: `[Ticket #${ticketId}] ${ticketTitle}`,
        html: `
            <h2>Ваш тикет принят</h2>
            <p>Мы получили ваш запрос: <strong>${ticketTitle}</strong></p>
            <p>Вы можете отслеживать и отвечать на тикет по ссылке:</p>
            <a href="${url}">${url}</a>
            <p>Если у вас будут дополнительные вопросы, просто ответьте на это письмо.</p>
        `
    });
}

module.exports = {
    sendTicketConfirmation
};
