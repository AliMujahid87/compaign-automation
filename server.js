// server.js – Express backend for campaign automation
require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const fetch = require('node-fetch');
const { parseCSV } = require('./src/utils');
const { sendGmailMessage, getGmailAuthUrl, getGmailToken } = require('./src/gmail');
const { initWhatsApp, sendWhatsAppMessage, getWhatsAppStatus } = require('./src/whatsapp');

const app = express();
const upload = multer({ dest: 'uploads/' });

// In-memory campaign progress for real-time polling
let currentCampaign = {
  active: false,
  results: [],
  total: 0,
  processed: 0
};

app.use(express.static('public'));
app.use(express.json());

const GMAIL_TOKEN_PATH = path.join(__dirname, 'gmail_token.json');
const fs = require('fs');

// Gmail OAuth routes
app.get('/api/gmail/status', (req, res) => {
  const hasToken = process.env.GMAIL_TOKEN || fs.existsSync(GMAIL_TOKEN_PATH);
  res.json({ authenticated: !!hasToken });
});

app.get('/api/gmail/auth', (req, res) => {
  const url = getGmailAuthUrl();
  res.redirect(url);
});

app.get('/api/gmail/callback', async (req, res) => {
  const { code } = req.query;
  try {
    const tokens = await getGmailToken(code);
    fs.writeFileSync(GMAIL_TOKEN_PATH, JSON.stringify(tokens));
    res.send(`
      <body style="font-family:sans-serif; background:#0f0f0f; color:#fff; padding:40px; text-align:center;">
        <h1 style="color: #64ffda;">Gmail Authenticated!</h1>
        <p>Your session has been saved permanently. You can close this window now.</p>
        <button onclick="window.close()" style="padding: 10px 20px; background: #3a86ff; color: #fff; border: none; border-radius: 8px; cursor: pointer;">Close Window</button>
      </body>
    `);
  } catch (err) {
    res.status(500).send('Error: ' + err.message);
  }
});

// WhatsApp endpoints
app.get('/api/whatsapp/status', (req, res) => {
  res.json(getWhatsAppStatus());
});

app.post('/api/whatsapp/init', (req, res) => {
  initWhatsApp();
  res.json({ status: 'initializing' });
});

// Health check & Progress polling
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.post('/api/csv/preview', upload.single('contacts'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const contacts = await parseCSV(req.file.path);
    res.json({ contacts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/campaign/progress', (req, res) => {
  res.json(currentCampaign);
});

// Analytics & Blacklist Routes
app.get('/api/stats', (req, res) => {
  const statsPath = path.join(__dirname, 'stats.json');
  if (fs.existsSync(statsPath)) {
    return res.json(JSON.parse(fs.readFileSync(statsPath, 'utf8')));
  }
  res.json({});
});

app.get('/api/blacklist', (req, res) => {
  const path = require('path').join(__dirname, 'blacklist.txt');
  if (fs.existsSync(path)) {
    return res.json({ content: fs.readFileSync(path, 'utf8') });
  }
  res.json({ content: "" });
});

app.post('/api/blacklist', (req, res) => {
  const path = require('path').join(__dirname, 'blacklist.txt');
  fs.writeFileSync(path, req.body.content);
  res.json({ status: 'updated' });
});

function updateStats(sentCount, leadsCount) {
    const statsPath = path.join(__dirname, 'stats.json');
    let stats = { total_messages_sent: 0, total_leads_processed: 0, last_campaign_date: null, success_rate: 0 };
    if (fs.existsSync(statsPath)) {
        try { stats = JSON.parse(fs.readFileSync(statsPath, 'utf8')); } catch(e){}
    }
    stats.total_messages_sent += sentCount;
    stats.total_leads_processed += leadsCount;
    stats.last_campaign_date = new Date().toISOString().split('T')[0];
    stats.success_rate = Math.round((stats.total_messages_sent / stats.total_leads_processed) * 100) || 0;
    fs.writeFileSync(statsPath, JSON.stringify(stats, null, 4));
}

// POST /api/send/:platform
app.post('/api/send/:platform', upload.single('attachment'), async (req, res) => {
  const platform = req.params.platform.toLowerCase();
  const attachment = req.file || null;
  const { message, subject, contactsJson } = req.body; 

  try {
    const contacts = JSON.parse(contactsJson);
    
    // Reset campaigns progress
    currentCampaign = {
      active: true,
      results: [],
      total: contacts.length,
      processed: 0
    };

    updateStats(0, contacts.length); // Increment processed count

    // Return immediately to frontend
    res.json({ status: 'started', total: contacts.length });

    // Process in background
    for (const contact of contacts) {
      try {
        let sendResult;
        switch (platform) {
          case 'gmail':
            sendResult = await sendGmailMessage(contact, message, subject, attachment);
            break;
          case 'whatsapp':
            sendResult = await sendWhatsAppMessage(contact, message);
            break;
          default:
            throw new Error('Unsupported platform');
        }
        currentCampaign.results.push({ ...contact, status: 'sent', details: sendResult });
        updateStats(1, 0); // Increment sent count
      } catch (e) {
        currentCampaign.results.push({ ...contact, status: 'error', details: e.message });
      } finally {
        currentCampaign.processed++;
      }
      // Safety Delay to mimic human behavior and improve delivery
      const delay = Math.floor(Math.random() * (10000 - 5000 + 1) + 5000); 
      await new Promise(r => setTimeout(r, delay));
    }
    currentCampaign.active = false;

  } catch (err) {
    console.error(err);
    currentCampaign.active = false;
    currentCampaign.results.push({ status: 'error', details: err.message });
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server listening on http://localhost:${PORT}`));
