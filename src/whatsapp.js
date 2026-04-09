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
  
  // Try to find local Chrome on Windows
  const chromePaths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
  ];
  let executablePath = null;
  for (const p of chromePaths) {
    if (fs.existsSync(p)) {
      executablePath = p;
      break;
    }
  }

  client = new Client({
    authStrategy: new LocalAuth({
      dataPath: path.join(__dirname, '../.wwebjs_auth')
    }),
    puppeteer: {
      headless: true, // Keep headless true for server, but use local chrome
      executablePath: executablePath || undefined,
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

  const phoneKey = Object.keys(contact).find(k => 
    ['phone', 'number', 'whatsapp', 'mobile', 'contact', 'telephone', 'cell'].includes(k.toLowerCase())
  );
  
  if (!phoneKey || !contact[phoneKey]) {
      throw new Error(`No phone column found. Headers: ${Object.keys(contact).join(', ')}`);
  }

  const phone = contact[phoneKey];
  const contactName = contact.name || contact.fullname || contact.firstname || contact['first name'] || contact['contact name'] || '';
  const messageBody = template.replace(/{{\s*name\s*}}/gi, contactName);

  // Format phone number: remove any non-digit chars
  let cleanPhone = phone.toString().replace(/\D/g, '');
  
  // High-level normalization
  if (phone.toString().trim().startsWith('+')) {
    // Already international starts with +, keep clean digits
  } else if (phone.toString().trim().startsWith('00')) {
    cleanPhone = cleanPhone.substring(2); // Remove leading 00
  } else {
    // Handle local Pakistan format (03xx...) -> convert to 923xx...
    if (cleanPhone.startsWith('0') && cleanPhone.length === 11) {
        cleanPhone = '92' + cleanPhone.substring(1);
    } else if (cleanPhone.startsWith('3') && cleanPhone.length === 10) {
        cleanPhone = '92' + cleanPhone;
    }
  }
  
  const chatId = cleanPhone.includes('@c.us') ? cleanPhone : `${cleanPhone}@c.us`;

  try {
    console.log(`--- Attempting to send WA to: ${chatId} ---`);
    console.log(`--- Verifying registration for ${chatId} ---`);
    const isRegistered = await client.isRegisteredUser(chatId).catch(() => false);
    
    if (!isRegistered) {
        return { status: 'error', details: 'Number not registered on WhatsApp' };
    }

    console.log(`--- Sending to ${chatId} ---`);
    const msg = await client.sendMessage(chatId, messageBody);
    return { status: 'sent', messageId: msg.id._serialized };
  } catch (err) {
    console.error(`WhatsApp Send Error [${contact[Object.keys(contact)[0]]}]:`, err);
    return { status: 'error', details: err.message };
  }
}

function getWhatsAppStatus() {
  return {
    authenticated: isAuthenticated,
    qrAvailable: !!qrData
  };
}

module.exports = { initWhatsApp, sendWhatsAppMessage, getWhatsAppStatus };
