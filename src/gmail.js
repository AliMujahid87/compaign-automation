const { google } = require('googleapis');
require('dotenv').config();
const fs = require('fs');

/**
 * Send an email via Gmail API.
 * `contact` must contain `email` and `name`.
 * `template` is a string with {{name}} placeholder.
 */
async function sendGmailMessage(contact, template, subjectTemplate, attachment = null) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
    process.env.GMAIL_REDIRECT_URI
  );

  const token = process.env.GMAIL_TOKEN;
  if (!token) throw new Error('Missing GMAIL_TOKEN in .env. Please authenticate via /api/gmail/auth first.');

  oauth2Client.setCredentials(JSON.parse(token));

  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
  
  const contactName = contact.name || contact.fullname || contact.firstname || contact['first name'] || contact['contact name'] || '';
  const messageBody = template.replace(/{{\s*name\s*}}/gi, contactName);
  const subject = (subjectTemplate || 'Personalized Outreach').replace(/{{\s*name\s*}}/gi, contactName);

  let rawMessage;

  if (attachment) {
    const boundary = '____boundary____';
    const fileContent = fs.readFileSync(attachment.path).toString('base64');
    
    rawMessage = [
      `To: ${contact.email}`,
      `Subject: ${subject}`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/plain; charset=utf-8',
      '',
      messageBody,
      '',
      `--${boundary}`,
      `Content-Type: ${attachment.mimetype}; name="${attachment.originalname}"`,
      'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename="${attachment.originalname}"`,
      '',
      fileContent,
      `--${boundary}--`
    ].join('\r\n');
  } else {
    rawMessage = [
      `To: ${contact.email}`,
      `Subject: ${subject}`,
      'Content-Type: text/html; charset=utf-8',
      '',
      messageBody,
    ].join('\n');
  }

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
