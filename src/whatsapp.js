const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

let client;
let isReady = false;

/**
 * Initializes the WhatsApp client
 */
const initWhatsApp = () => {
    client = new Client({
        authStrategy: new LocalAuth(), // Saves session locally so you don't have to scan every time
        puppeteer: {
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
        }
    });

    client.on('qr', (qr) => {
        console.log('--- WHATSAPP QR CODE ---');
        console.log('Scan this code with your WhatsApp app:');
        qrcode.generate(qr, { small: true });
    });

    client.on('ready', () => {
        console.log('✅ WhatsApp client is ready!');
        isReady = true;
    });

    client.on('authenticated', () => {
        console.log('✅ WhatsApp Authenticated!');
    });

    client.on('auth_failure', (msg) => {
        console.error('❌ WhatsApp Auth failure:', msg);
    });

    client.initialize();
};

/**
 * Sends a WhatsApp message
 * @param {Object} contact - The contact object from CSV
 * @param {string} template - The message template
 * @returns {Promise<Object>}
 */
const sendWhatsAppMessage = async (contact, template) => {
    if (!isReady) {
        throw new Error('WhatsApp client is not ready. Please scan the QR code in the terminal first.');
    }

    // Extract number and clean it
    let number = contact.phone || contact.number || contact.contact;
    if (!number) throw new Error('Phone number missing in CSV');

    // Remove any non-numeric characters
    number = number.toString().replace(/\D/g, '');

    // Add 92 (Pakistan) prefix if not present and the number seems local (optional, but good for UX)
    // Actually, it's better to expect the user to provide the full international format
    // or just append whatever country code is standard.
    // For now, let's assume the user provides a format that works or we try to fix it.
    if (!number.startsWith('92') && number.length === 10) {
        number = '92' + number;
    } else if (number.startsWith('0') && number.length === 11) {
        number = '92' + number.substring(1);
    }

    const chatId = number + "@c.us";

    // Personalize template
    let message = template;
    for (const key in contact) {
        const regex = new RegExp(`{{${key}}}`, 'g');
        message = message.replace(regex, contact[key]);
    }

    try {
        const response = await client.sendMessage(chatId, message);
        return { messageId: response.id.id };
    } catch (err) {
        throw new Error(`Failed to send WhatsApp message: ${err.message}`);
    }
};

module.exports = {
    initWhatsApp,
    sendWhatsAppMessage,
    getWhatsAppStatus: () => isReady
};
