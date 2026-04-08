// server.js – Express backend for campaign automation
require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const fetch = require('node-fetch');
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

// LinkedIn OAuth routes
app.get('/api/linkedin/auth', (req, res) => {
  const scope = encodeURIComponent('openid profile email w_member_social'); 
  const url = `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${process.env.LINKEDIN_CLIENT_ID}&redirect_uri=${encodeURIComponent(process.env.LINKEDIN_REDIRECT_URI)}&scope=${scope}`;
  res.redirect(url);
});

app.get('/api/linkedin/callback', async (req, res) => {
  const { code, error, error_description } = req.query;
  
  if (error) {
    return res.status(500).send(`<h1>Auth Error: ${error}</h1><p>${error_description}</p>`);
  }

  try {
    const response = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: process.env.LINKEDIN_CLIENT_ID,
        client_secret: process.env.LINKEDIN_CLIENT_SECRET,
        redirect_uri: process.env.LINKEDIN_REDIRECT_URI,
      }),
    });
    const data = await response.json();
    
    if (data.access_token) {
      res.send(`
        <body style="font-family:sans-serif; background:#0f0f0f; color:#fff; padding:40px; text-align:center;">
          <h1 style="color:#3a86ff;">LinkedIn Authenticated!</h1>
          <p>Copy the token below and add it to your <code>.env</code> file as <code>LINKEDIN_TOKEN</code>:</p>
          <textarea onclick="this.select()" style="width:100%; max-width:600px; height:150px; background:#1a1a2e; color:#3a86ff; border:2px solid #3a86ff; padding:15px; border-radius:12px; font-family:monospace; font-size:14px; outline:none; cursor:pointer;" readonly>${data.access_token}</textarea>
          <p style="margin-top:20px; opacity:0.7;">After saving <code>.env</code>, don't forget to restart your server!</p>
        </body>
      `);
    } else {
      res.status(500).send(`
        <body style="font-family:sans-serif; background:#0f0f0f; color:#fff; padding:40px; text-align:center;">
          <h1 style="color:#ff4b2b;">Token Exchange Failed</h1>
          <p>LinkedIn returned the following response:</p>
          <pre style="background:#1a1a2e; color:#ff4b2b; padding:20px; border-radius:8px; display:inline-block; text-align:left; border:1px solid #ff4b2b;">${JSON.stringify(data, null, 2)}</pre>
          <br><br>
          <a href="/" style="color:#3a86ff; text-decoration:none;">Go back and try again</a>
        </body>
      `);
    }
  } catch (err) {
    res.status(500).send('Error: ' + err.message);
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
    console.log('--- Debug: First Contact Data ---');
    console.log(contacts[0]);
    console.log('---------------------------------');
    
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
