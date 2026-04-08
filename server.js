// server.js – Express backend for campaign automation
require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const { parseCSV } = require('./src/utils');
const { sendLinkedInMessage } = require('./src/linkedin');
const { sendGmailMessage, getGmailAuthUrl, getGmailToken } = require('./src/gmail');
const { sendDiscordMessage } = require('./src/discord');

const app = express();
const upload = multer({ dest: 'uploads/' });

app.use(express.static('public'));
app.use(express.json());

// Gmail OAuth routes
app.get('/api/gmail/auth', (req, res) => {
  const url = getGmailAuthUrl();
  res.redirect(url);
});

app.get('/api/gmail/callback', async (req, res) => {
  const { code } = req.query;
  try {
    const tokens = await getGmailToken(code);
    // In a real app, save this to a database. For this local tool, we'll suggest adding it to .env
    res.send(`
      <h1>Authentication Successful!</h1>
      <p>Please copy the following token and add it to your <code>.env</code> file as <code>GMAIL_TOKEN</code>:</p>
      <textarea style="width:100%; height:200px;">${JSON.stringify(tokens)}</textarea>
    `);
  } catch (err) {
    res.status(500).send('Error retrieving token: ' + err.message);
  }
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
    const results = [];
    for (const contact of contacts) {
      try {
        let sendResult;
        switch (platform) {
          case 'linkedin':
            sendResult = await sendLinkedInMessage(contact, message, subject);
            break;
          case 'gmail':
            sendResult = await sendGmailMessage(contact, message, subject, attachment);
            break;
          case 'discord':
            sendResult = await sendDiscordMessage(contact, message, subject, attachment);
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
