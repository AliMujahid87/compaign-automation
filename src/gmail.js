// src/gmail.js
const { google } = require('googleapis');
require('dotenv').config();

/**
 * Send an email via Gmail API.
 * `contact` must contain `email` and `name`.
 * `template` is a string with {{name}} placeholder.
 */
async function sendGmailMessage(contact, template) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
    process.env.GMAIL_REDIRECT_URI
  );

  const token = process.env.GMAIL_TOKEN;
  if (!token) throw new Error('Missing GMAIL_TOKEN in .env. Please authenticate via /api/gmail/auth first.');

  oauth2Client.setCredentials(JSON.parse(token));

  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
  // ... rest of the logic remains similar but uses the client for refreshing if needed
  const message = template.replace(/{{\s*name\s*}}/gi, contact.name || '');
  const rawMessage = [
    `To: ${contact.email}`,
    'Subject: Personalized Outreach',
    'Content-Type: text/html; charset=utf-8',
    '',
    message,
  ].join('\n');

  const encoded = Buffer.from(rawMessage).toString('base64url');
  const res = await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw: encoded },
  });
  return res.data;
}

function getGmailAuthUrl() {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
    process.env.GMAIL_REDIRECT_URI
  );
  return oauth2Client.generateAuthUrl({
    access_type: 'offline', // crucial for refresh token
    scope: ['https://www.googleapis.com/auth/gmail.send'],
    prompt: 'consent'
  });
}

async function getGmailToken(code) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
    process.env.GMAIL_REDIRECT_URI
  );
  const { tokens } = await oauth2Client.getToken(code);
  return tokens;
}

module.exports = { sendGmailMessage, getGmailAuthUrl, getGmailToken };
