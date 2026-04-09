const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const path = require('path');
const fs = require('fs');

let client;
let qrData = null;
let isAuthenticated = false;

function initWhatsApp() {
  client = new Client({
    authStrategy: new LocalAuth({
      dataPath: path.join(__dirname, '../.wwebjs_auth')
    }),
    puppeteer: {
      handleSIGINT: false,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--single-process', // <- this one element can help child process
        '--disable-gpu'
      ],
    }
  });

  client.on('qr', (qr) => {
    qrData = qr;
    isAuthenticated = false;
    console.log('--- WhatsApp QR Received ---');
    
    // Save QR to file so frontend can pick it up
    const qrPath = path.join(__dirname, '../public/whatsapp-qr.png');
    qrcode.toFile(qrPath, qr, (err) => {
      if (err) console.error('Error saving QR code:', err);
    });
  });

  client.on('ready', () => {
    console.log('✅ WhatsApp Client is Ready!');
    isAuthenticated = true;
    qrData = null;
    // Clean up QR file
    const qrPath = path.join(__dirname, '../public/whatsapp-qr.png');
    if (fs.existsSync(qrPath)) fs.unlinkSync(qrPath);
  });

  client.on('authenticated', () => {
    console.log('✅ WhatsApp Authenticated');
    isAuthenticated = true;
  });

  client.on('auth_failure', (msg) => {
    console.error('❌ WhatsApp Auth Failure:', msg);
    isAuthenticated = false;
  });

  client.on('disconnected', (reason) => {
    console.log('❌ WhatsApp Disconnected:', reason);
    isAuthenticated = false;
    client.initialize(); // Try to re-initialize
  });

  client.initialize().catch(err => console.error('Failed to initialize WhatsApp:', err));
}

async function sendWhatsAppMessage(contact, template) {
  if (!isAuthenticated) {
    throw new Error('WhatsApp not authenticated. Please scan the QR code first.');
  }

  // Extract phone number from contact (case insensitive search)
  let phone = null;
  const phoneKeys = ['phone', 'mobile', 'whatsapp', 'number', 'contact', 'telephone', 'cell'];
  
  for (const key of Object.keys(contact)) {
    if (phoneKeys.includes(key.toLowerCase())) {
      phone = contact[key];
      break;
    }
  }

  if (!phone) {
    throw new Error('No phone number found. Columns found: ' + Object.keys(contact).join(', '));
  }

  const contactName = contact.name || contact.fullname || contact.firstname || contact['first name'] || contact['contact name'] || '';
  const messageBody = template.replace(/{{\s*name\s*}}/gi, contactName);

  // Format phone number: remove any non-digit chars and ensure it has 92 (for Pak) or whatever
  // For international format, whatsapp-web.js expects 923xxxxxxxxx@c.us
  let cleanPhone = phone.toString().replace(/\D/g, '');
  
  // If no country code, default to 92 (Pakistan) - though this is a bit specific,
  // perhaps I should just ensure it ends with @c.us if it's already full format.
  if (cleanPhone.length === 10 && cleanPhone.startsWith('3')) {
      cleanPhone = '92' + cleanPhone;
  }
  
  const chatId = cleanPhone.includes('@c.us') ? cleanPhone : `${cleanPhone}@c.us`;

  try {
    const response = await client.sendMessage(chatId, messageBody);
    return { id: response.id.id, to: response.to };
  } catch (err) {
    console.error(`Failed to send WhatsApp to ${cleanPhone}:`, err);
    throw err;
  }
}

function getWhatsAppStatus() {
  return {
    authenticated: isAuthenticated,
    qrAvailable: !!qrData
  };
}

module.exports = { initWhatsApp, sendWhatsAppMessage, getWhatsAppStatus };
