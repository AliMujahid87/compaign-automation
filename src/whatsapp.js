const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const path = require('path');
const fs = require('fs');

let client;
let qrData = null;
let isAuthenticated = false;
let isInitializing = false;

function initWhatsApp() {
  if (isInitializing || isAuthenticated) return;
  isInitializing = true;
  
  console.log('--- Starting WhatsApp Initialization ---');
  client = new Client({
    authStrategy: new LocalAuth({
      dataPath: path.join(__dirname, '../.wwebjs_auth')
    }),
    puppeteer: {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-extensions'
      ],
    }
  });

  client.on('qr', (qr) => {
    isInitializing = false;
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
    isInitializing = false;
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
    // Try to re-initialize
    if (client) {
        client.initialize().catch(err => console.error('Re-init failed', err));
    }
  });

  client.initialize().then(() => {
    console.log('🚀 WhatsApp Initialized call successful');
  }).catch(err => {
    console.error('❌ Failed to initialize WhatsApp:', err);
    isInitializing = false;
  });
}

async function sendWhatsAppMessage(contact, template) {
  if (!isAuthenticated) {
    throw new Error('WhatsApp not authenticated. Please scan the QR code first.');
  }

  // Extract phone number from contact (Fuzzy search)
  let phone = null;
  const keywords = ['phone', 'mobile', 'whatsapp', 'number', 'contact', 'telephone', 'cell'];
  
  for (const key of Object.keys(contact)) {
    const lowerKey = key.toLowerCase().replace(/[^a-z]/g, ''); // Remove spaces/special chars
    if (keywords.some(kw => lowerKey.includes(kw))) {
      phone = contact[key];
      break;
    }
  }

  if (!phone) {
    throw new Error('No phone number column found. Your CSV headers: ' + Object.keys(contact).join(', '));
  }

  const contactName = contact.name || contact.fullname || contact.firstname || contact['first name'] || contact['contact name'] || '';
  const messageBody = template.replace(/{{\s*name\s*}}/gi, contactName);

  // Format phone number: remove any non-digit chars
  let cleanPhone = phone.toString().replace(/\D/g, '');
  
  // Handle local Pakistan format (03xx...) -> convert to 923xx...
  if (cleanPhone.startsWith('0')) {
      cleanPhone = '92' + cleanPhone.substring(1);
  } else if (cleanPhone.length === 10 && cleanPhone.startsWith('3')) {
      cleanPhone = '92' + cleanPhone;
  }
  
  const chatId = cleanPhone.includes('@c.us') ? cleanPhone : `${cleanPhone}@c.us`;

  try {
    console.log(`--- Attempting to send WA to: ${chatId} ---`);
    const response = await client.sendMessage(chatId, messageBody);
    console.log(`✅ Success for ${cleanPhone}`);
    return { id: response.id.id, to: response.to };
  } catch (err) {
    console.error(`❌ Error for ${cleanPhone}:`, err.message);
    throw new Error(err.message || 'Unknown WhatsApp Error');
  }
}

function getWhatsAppStatus() {
  return {
    authenticated: isAuthenticated,
    qrAvailable: !!qrData
  };
}

module.exports = { initWhatsApp, sendWhatsAppMessage, getWhatsAppStatus };
