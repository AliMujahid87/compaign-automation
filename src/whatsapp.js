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
          console.log(`--- [SYSTEM] Found Browser at: ${p} ---`);
          break;
        }
      }
      if (!executablePath) {
          console.warn('--- [WARNING] No local Chrome/Edge found. Initializing without explicit path. ---');
      }
  }

  try {
    console.log('--- Initializing Puppeteer via whatsapp-web.js ---');
    client = new Client({
      authStrategy: new LocalAuth({
        dataPath: path.join(__dirname, '../.wwebjs_auth')
      }),
      webVersionCache: {
        type: 'remote',
        remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.3000.1018247065-alpha.html',
      },
      puppeteer: {
        headless: true,
        executablePath: executablePath || undefined,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu',
          '--proxy-server="direct://"',
          '--proxy-bypass-list=*'
        ],
      }
    });

    console.log('--- Client instance created, attaching listeners ---');

    client.on('qr', (qr) => {
      isInitializing = false;
      qrData = qr;
      isAuthenticated = false;
      console.log('--- [SIGNAL] WhatsApp QR Received! Check frontend ---');
      
      const qrPath = path.join(__dirname, '../public/whatsapp-qr.png');
      qrcode.toFile(qrPath, qr, (err) => {
        if (err) console.error('Error saving QR code:', err);
      });
    });

    client.on('ready', () => {
      console.log('✅ [SUCCESS] WhatsApp Client is Ready!');
      isAuthenticated = true;
      isInitializing = false;
      qrData = null;
      const qrPath = path.join(__dirname, '../public/whatsapp-qr.png');
      if (fs.existsSync(qrPath)) fs.unlinkSync(qrPath);
    });

    client.on('authenticated', () => {
      console.log('✅ [AUTH] WhatsApp Authenticated Successfully');
      isAuthenticated = true;
    });

    client.on('auth_failure', (msg) => {
      console.error('❌ [FAILURE] WhatsApp Auth Failure:', msg);
      isAuthenticated = false;
      isInitializing = false;
    });

    client.on('disconnected', (reason) => {
      console.log('❌ [DISCONNECTED] WhatsApp Session Ended:', reason);
      isAuthenticated = false;
      isInitializing = false;
    });

    console.log('--- Starting client.initialize() ---');
    client.initialize()
      .then(() => console.log('🚀 Client initialization promise resolved'))
      .catch(err => {
        console.error('❌ Client initialization error:', err);
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
    // Already international starts with +, use the clean digits (which includes country code)
  } else if (originalRaw.startsWith('00')) {
    cleanPhone = cleanPhone.substring(2); // Remove leading 00
  } else {
    // If it's 10 digits and country code is 1, it's likely a US number without a prefix
    if (cleanPhone.length === 10 && countryCode === '1') {
      cleanPhone = '1' + cleanPhone;
    } 
    // If it starts with '0' (like 03xx or 0416), remove the leading local zero
    else if (cleanPhone.startsWith('0')) {
        cleanPhone = countryCode + cleanPhone.substring(1);
    } 
    // If it's a standard local number without country code, add it
    else if (!cleanPhone.startsWith(countryCode)) {
        cleanPhone = countryCode + cleanPhone;
    }
  }
  
  // Final safeguard for US numbers: if it's 11 digits and starts with 1, it's already got the code
  if (cleanPhone.length === 11 && cleanPhone.startsWith('1')) {
      // US Format confirmed
  }

  const chatId = cleanPhone.includes('@c.us') ? cleanPhone : `${cleanPhone}@c.us`;

  try {
    console.log(`--- Attempting to send WA to: ${chatId} ---`);
    console.log(`--- Verifying registration for ${chatId} ---`);
    const isRegistered = await client.isRegisteredUser(chatId).catch(() => false);
    
    if (!isRegistered) {
        return { status: 'invalid', details: 'Number not registered on WhatsApp' };
    }

    console.log(`--- Sending to ${chatId} ---`);
    const msg = await client.sendMessage(chatId, messageBody);
    return { status: 'sent', messageId: msg.id._serialized };
  } catch (err) {
    console.error(`WhatsApp Send Error [${contact[Object.keys(contact)[0]]}]:`, err);
    return { status: 'error', details: err.message };
  }
}

async function resetWhatsApp() {
  console.log('--- [RESET] Resetting WhatsApp Session ---');
  if (client) {
    try { await client.destroy(); } catch (e) { console.error('Error destroying client:', e); }
  }
  client = null;
  qrData = null;
  isAuthenticated = false;
  isInitializing = false;
  
  // Clear auth data
  const authPath = path.join(__dirname, '../.wwebjs_auth');
  if (fs.existsSync(authPath)) {
    try {
      fs.rmSync(authPath, { recursive: true, force: true });
      console.log('--- [RESET] Auth data cleared successfully ---');
    } catch (e) {
      console.error('Error clearing auth data:', e);
    }
  }
  
  // Clear QR image
  const qrPath = path.join(__dirname, '../public/whatsapp-qr.png');
  if (fs.existsSync(qrPath)) fs.unlinkSync(qrPath);
}

module.exports = { initWhatsApp, sendWhatsAppMessage, getWhatsAppStatus, resetWhatsApp };
