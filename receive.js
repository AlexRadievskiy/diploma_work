const { processInbox } = require('./emailReceiver');

processInbox().then(() => {
    console.log('Проверка завершена');
    process.exit();
});
