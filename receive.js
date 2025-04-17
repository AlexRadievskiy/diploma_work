const { processInbox } = require('./emailReceiver');

processInbox().then(() => {
    console.log('Check Complite');
    process.exit();
});
