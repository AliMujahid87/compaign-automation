const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const path = require('path');
const fs = require('fs');

let client;
let qrData = null;
let isAuthenticated = false;
let isInitializing = false;

function initWhatsApp() {
  if (isInitializing || isAuthenticated) {
    console.log(`--- WS Init Skip: isInitializing=${isInitializing}, isAuthenticated=${isAuthenticated} ---`);
    return;
  }
  isInitializing = true;
  
  console.log('--- Starting WhatsApp Initialization ---');
  
  // Detection logic for Chrome: In cloud environments, we let Puppeteer find its own path or use environment vars
  const isProduction = process.env.NODE_ENV === 'production';
  
  let executablePath = null;
  if (!isProduction) {
      const chromePaths = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
      ];
      for (const p of chromePaths) {
        if (fs.existsSync(p)) {
          executablePath = p;
          break;
        }
      }
  }

  try {
    client = new Client({
      authStrategy: new LocalAuth({
        dataPath: path.join(__dirname, '../.wwebjs_auth')
      }),
      puppeteer: {
        headless: true,
        executablePath: executablePath || undefined,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--no-first-run',
          '--no-zygote',
          '--single-process'
        ],
      }
    });

    console.log('--- Client instance created, attaching listeners ---');

    client.on('qr', (qr) => {
      isInitializing = false;
      qrData = qr;
      isAuthenticated = false;
      console.log('--- WhatsApp QR Received ---');
      
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
      isInitializing = false;
    });

    client.on('disconnected', (reason) => {
      console.log('❌ WhatsApp Disconnected:', reason);
      isAuthenticated = false;
      isInitializing = false;
    });

    console.log('--- Calling client.initialize() ---');
    client.initialize()
      .then(() => console.log('🚀 client.initialize() promise resolved'))
      .catch(err => {
        console.error('❌ client.initialize() error:', err);
        isInitializing = false;
      });

  } catch (err) {
    console.error('❌ WhatsApp Client Creation Error:', err);
    isInitializing = false;
  }
}

async function sendWhatsAppMessage(contact, template, countryCode = '92') {
  if (!isAuthenticated) {
    throw new Error('WhatsApp not authenticated. Please scan the QR code first.');
  }

  const keys = Object.keys(contact);
  const phoneKey = keys.find(k => k.includes('phone') || k.includes('number') || k.includes('whatsapp') || k.includes('mobile'));
  const nameKey = keys.find(k => k.includes('name')) || keys[0];
  
  if (!phoneKey || !contact[phoneKey]) {
      throw new Error(`Phone column not found. Available: ${keys.join(', ')}`);
  }

  const phone = contact[phoneKey];
  const contactName = contact[nameKey] || 'Recipient';
  const messageBody = template.replace(/{{\s*name\s*}}/gi, contactName);

  // Format phone number: remove any non-digit chars
  let cleanPhone = phone.toString().replace(/\D/g, '');
  const originalRaw = phone.toString().trim();
  
  // High-level normalization
  if (originalRaw.startsWith('+')) {
    // Already international starts with +, keep clean digits
  } else if (originalRaw.startsWith('00')) {
    cleanPhone = cleanPhone.substring(2); // Remove leading 00
  } else {
    // Handle Local numbering by prefixing the selected Country Code
    // If it starts with '0' (like 03xx or 0416), remove the leading zero
    if (cleanPhone.startsWith('0')) {
        cleanPhone = countryCode + cleanPhone.substring(1);
    } 
    // If it's a standard local number without country code, add it
    else if (!cleanPhone.startsWith(countryCode)) {
        cleanPhone = countryCode + cleanPhone;
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
