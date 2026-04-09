// server.js – Express backend for campaign automation
require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const fetch = require('node-fetch');
const { parseCSV } = require('./src/utils');
const { sendGmailMessage, getGmailAuthUrl, getGmailToken } = require('./src/gmail');
const { initWhatsApp, sendWhatsAppMessage, getWhatsAppStatus } = require('./src/whatsapp');

// initWhatsApp(); // Removed auto-init: only starts via button now

const app = express();
const upload = multer({ dest: 'uploads/' });

app.use(express.static('public'));
app.use(express.json());

// Gmail OAuth routes
app.get('/api/gmail/status', (req, res) => {
  res.json({ authenticated: !!process.env.GMAIL_TOKEN });
});

app.get('/api/gmail/auth', (req, res) => {
  const url = getGmailAuthUrl();
  res.redirect(url);
});

app.get('/api/gmail/callback', async (req, res) => {
  const { code } = req.query;
  try {
    const tokens = await getGmailToken(code);
    res.send(`
      <body style="font-family:sans-serif; background:#0f0f0f; color:#fff; padding:40px; text-align:center;">
        <h1>Gmail Authenticated!</h1>
        <p>Copy this and add to <code>.env</code> as <code>GMAIL_TOKEN</code>:</p>
        <textarea style="width:100%; max-width:600px; height:150px; background:#1a1a2e; color:#accent; border:1px solid #3a86ff; padding:10px; border-radius:8px;">${JSON.stringify(tokens)}</textarea>
      </body>
    `);
  } catch (err) {
    res.status(500).send('Error: ' + err.message);
  }
});

app.get('/api/whatsapp/status', (req, res) => {
  res.json(getWhatsAppStatus());
});

app.post('/api/whatsapp/init', (req, res) => {
  initWhatsApp();
  res.json({ status: 'initializing' });
});

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// POST /api/send/:platform – expects multipart/form-data with CSV, Subject and JSON body { message }
app.post('/api/send/:platform', upload.fields([
  { name: 'contacts', maxCount: 1 },
  { name: 'attachment', maxCount: 1 }
]), async (req, res) => {
  const platform = req.params.platform.toLowerCase();

  if (!req.files || !req.files.contacts) {
    return res.status(400).json({ error: 'Contacts CSV file is required' });
  }

  const csvPath = req.files.contacts[0].path;
  const attachment = req.files.attachment ? req.files.attachment[0] : null;
  const { message, subject } = req.body;

  try {
    const contacts = await parseCSV(csvPath);
    console.log('--- Debug: First Contact Data ---');
    console.log(contacts[0]);
    console.log('---------------------------------');

    const results = [];
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
        results.push({ ...contact, status: 'sent', details: sendResult });
      } catch (e) {
        results.push({ ...contact, status: 'error', details: e.message });
      }
    }

    // Return results as JSON (frontend can generate CSV download)
    res.json({ platform, results });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server listening on http://localhost:${PORT}`));
