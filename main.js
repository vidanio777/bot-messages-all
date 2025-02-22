// Автор скрипта - vidanio
// Мои соц сети - vk.com/vidanio t.me/vidanio
// Просьба, при пересливе скрипта указывайте автора

const { VK } = require('vk-io');
const { Sequelize, DataTypes } = require('sequelize');
const fs = require('fs');

const vk = new VK({
    token: 'token' // Сюда вписываете свой токен сообщества
});

const adminIds = [841590300, 760580933]; // Cюда через запятую, как уже вписано нужно добавить свой VK ID. Его можно узнать прописав команду /test

const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: 'sms_db.sqlite',
    logging: false
});

const Task = sequelize.define('Task', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    text: {
        type: DataTypes.STRING,
        allowNull: false
    },
    interval: {
        type: DataTypes.INTEGER,
        allowNull: false
    }
});

let smsTimers = {};

async function initializeDatabase() {
    await sequelize.sync();
    const tasks = await Task.findAll();
    tasks.forEach(task => {
        smsTimers[task.id] = setInterval(() => sendSMS(task.text), task.interval * 1000);
    });
}

async function sendSMS(text) {
    try {
        const response = await vk.api.messages.getConversations({ count: 200 });
        console.log(response);
        if (response && response.items) {
            const items = response.items.filter(item => item.conversation.peer.type === 'user');
            if (items.length > 0) {
                for (let chat of items) {
                    const peerId = chat.conversation.peer.id;
                    try {
                        await vk.api.messages.send({
                            peer_id: peerId,
                            message: text,
                            random_id: Math.floor(Math.random() * 1000000)
                        });
                    } catch (error) {
                        console.log(`Ошибка отправки в чат ${peerId}`);
                    }
                }
            }
        }
    } catch (error) {
        console.error('Ошибка получения чатов:', error);
    }
}

vk.updates.on('message', async (context) => {
    const message = context.text;
    if (context.isOutbox) return;

    const senderId = context.senderId;

    if (message === '/test') {
        return context.reply(`ok\nТвой ID: ${senderId}`);
    }

    if (message.startsWith('/sms')) {
        if (!adminIds.includes(senderId)) {
            return context.reply('Доступ запрещен');
        }

        const text = message.replace('/sms', '').trim();
        if (!text) {
            return context.reply('Вы не указали текст для отправки!');
        }
        await sendSMS(text);
        return context.reply('Сообщение успешно отправлено всем чатам!');
    }

    if (message.startsWith('/datesms')) {
        if (!adminIds.includes(senderId)) {
            return context.reply('Доступ запрещен');
        }

        const args = message.replace('/datesms', '').trim().split(' ');
        const interval = parseInt(args.pop(), 10);
        const text = args.join(' ');

        if (!text || isNaN(interval) || interval <= 0) {
            return context.reply('Неправильный формат команды. Использование: /datesms [текст] [интервал в секундах]');
        }

        const newSMS = await Task.create({ text, interval });
        smsTimers[newSMS.id] = setInterval(() => sendSMS(newSMS.text), newSMS.interval * 1000);
        return context.reply(`Задача с ID ${newSMS.id} успешно создана!`);
    }

    if (message.startsWith('/allsms')) {
        if (!adminIds.includes(senderId)) {
            return context.reply('Доступ запрещен');
        }

        const tasks = await Task.findAll();
        if (tasks.length === 0) {
            return context.reply('Активных задач нет.');
        }

        let responseText = 'Активные задачи:\n';
        tasks.forEach(task => {
            responseText += `ID: ${task.id}, Текст: "${task.text}", Интервал: ${task.interval} секунд\n`;
        });

        return context.reply(responseText);
    }

    if (message.startsWith('/deletesms')) {
        if (!adminIds.includes(senderId)) {
            return context.reply('Доступ запрещен');
        }

        const id = parseInt(message.replace('/deletesms', '').trim(), 10);
        if (isNaN(id)) {
            return context.reply('Неправильный формат команды. Использование: /deletesms [ID]');
        }

        await Task.destroy({ where: { id } });
        clearInterval(smsTimers[id]);
        delete smsTimers[id];
        return context.reply(`Задача с ID ${id} успешно удалена.`);
    }
});

async function validateToken() {
    try {
        await vk.api.users.get();
        console.log('Токен валиден.');
        initializeDatabase().then(() => {
            console.log('База данных инициализирована и задачи запущены.');
            vk.updates.startPolling();
        }).catch(error => {
            console.error('Ошибка инициализации базы данных:', error);
        });
    } catch (error) {
        console.error('Ошибка валидации токена:', error);
    }
}

validateToken();
