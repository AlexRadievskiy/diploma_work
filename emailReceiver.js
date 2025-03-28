// emailReceiver.js
const { startListeningForEmails } = require('./imapService');

startListeningForEmails().catch(console.error);
