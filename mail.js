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
        from: `"Support Team" <${process.env.EMAIL_USER}>`,
        to,
        subject: `[Ticket #${ticketId}] ${ticketTitle} Confirmation`,
        html: `
            <div style="font-family: Arial, sans-serif; color: #333; line-height: 1.6;">
                <div style="text-align: center; margin-bottom: 20px;">
                    <img src="https://images.ixigo.com/image/upload/why-ixigo/5390cf1e5644eced244bb1a8006bd040-syxpz.png" alt="Company Logo" style="max-width: 100%; height: auto;">
                </div>
                <h2 style="border-bottom: 1px solid #eee; padding-bottom: 10px;">Ticket Confirmation</h2>
                <p>Dear Customer,</p>
                <p>We have successfully received your support ticket. Below are the details for your reference:</p>
                <p>
                    <strong>Title:</strong> ${ticketTitle}<br>
                    <strong>Ticket ID:</strong> ${ticketId}
                </p>
                <p>
                    You can view and manage your ticket by clicking on the following link:
                    <br>
                    <a href="${url}" style="color: #1a73e8; text-decoration: none;">View Your Ticket</a>
                </p>
                <p>If you have any additional questions or require further assistance, please do not hesitate to contact our support team by replying to this email.</p>
                <p>Thank you for choosing our services.</p>
                <p>Sincerely,<br>The Support Team</p>
            </div>
        `
    });
}

async function sendTicketReply(to, ticketTitle, ticketId, message) {
    const url = `${process.env.BASE_URL}/ticket.html?id=${ticketId}`;

    await transporter.sendMail({
        from: `"Support Team" <${process.env.EMAIL_USER}>`,
        to,
        subject: `[Ticket #${ticketId}] Response from Support`,
        html: `
            <div style="font-family: Arial, sans-serif; color: #333; line-height: 1.6;">
                <h2 style="border-bottom: 1px solid #eee; padding-bottom: 10px;">New Reply on Your Ticket</h2>
                <p>Your ticket <strong>${ticketTitle}</strong> has received a response from our support team:</p>
                <blockquote style="background:#f9f9f9;padding:10px;border-left:3px solid #ccc;">${message}</blockquote>
                <p>You can reply by responding to this email or using the chat interface below:</p>
                <p><a href="${url}">${url}</a></p>
                <p>Sincerely,<br>The Support Team</p>
            </div>
        `
    });
}

module.exports = {
    sendTicketConfirmation,
    sendTicketReply
};
