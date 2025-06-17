require('dotenv').config();
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

/**
 * Функція для відправлення листа з підтвердженням заявки.
 * @param {string} to - Адреса отримувача
 * @param {string} ticketTitle - Назва заявки
 * @param {number|string} ticketId - Ідентифікатор заявки
 */
async function sendTicketConfirmation(to, ticketTitle, ticketId) {
    const url = `${process.env.BASE_URL}/ticket.html?id=${ticketId}`;

    await transporter.sendMail({
        from: `"Служба підтримки" <${process.env.EMAIL_USER}>`,
        to,
        subject: `[Заявка №${ticketId}] ${ticketTitle} — Підтвердження`,
        html: `
            <div style="font-family: Arial, sans-serif; color: #333; line-height: 1.6;">
                <div style="text-align: center; margin-bottom: 20px;">
                    <img src="https://images.ixigo.com/image/upload/why-ixigo/5390cf1e5644eced244bb1a8006bd040-syxpz.png" alt="Логотип компанії" style="max-width: 100%; height: auto;">
                </div>
                <h2 style="border-bottom: 1px solid #eee; padding-bottom: 10px;">Підтвердження заявки</h2>
                <p>Шановний(а) користувачу,</p>
                <p>Ми успішно отримали вашу заявку до служби підтримки. Нижче наведені деталі для вашого ознайомлення:</p>
                <p>
                    <strong>Назва:</strong> ${ticketTitle}<br>
                    <strong>ID заявки:</strong> ${ticketId}
                </p>
                <p>
                    Ви можете переглянути або керувати своєю заявкою за наступним посиланням:
                    <br>
                    <a href="${url}" style="color: #1a73e8; text-decoration: none;">Переглянути заявку</a>
                </p>
                <p>Якщо у вас виникнуть додаткові питання або потрібна допомога, просто відповідайте на цей лист — наша команда вам допоможе.</p>
                <p>Дякуємо, що обрали наш сервіс.</p>
                <p>З повагою,<br>Команда підтримки</p>
            </div>
        `
    });
}

/**
 * Функція для відправлення відповіді на заявку.
 * @param {string} to - Адреса отримувача
 * @param {string} ticketTitle - Назва заявки
 * @param {number|string} ticketId - Ідентифікатор заявки
 * @param {string} message - Повідомлення від служби підтримки
 */
async function sendTicketReply(to, ticketTitle, ticketId, message) {
    const url = `${process.env.BASE_URL}/ticket.html?id=${ticketId}`;

    await transporter.sendMail({
        from: `"Служба підтримки" <${process.env.EMAIL_USER}>`,
        to,
        subject: `[Заявка №${ticketId}] Відповідь від служби підтримки`,
        html: `
            <div style="font-family: Arial, sans-serif; color: #333; line-height: 1.6;">
                <h2 style="border-bottom: 1px solid #eee; padding-bottom: 10px;">Нова відповідь на вашу заявку</h2>
                <p>На вашу заявку <strong>${ticketTitle}</strong> була надана відповідь від нашої служби підтримки:</p>
                <blockquote style="background:#f9f9f9;padding:10px;border-left:3px solid #ccc;">${message}</blockquote>
                <p>Ви можете відповісти, надіславши листа у відповідь, або скористатися інтерфейсом чату за посиланням нижче:</p>
                <p><a href="${url}">${url}</a></p>
                <p>З повагою,<br>Команда підтримки</p>
            </div>
        `
    });
}

module.exports = {
    sendTicketConfirmation,
    sendTicketReply
};
