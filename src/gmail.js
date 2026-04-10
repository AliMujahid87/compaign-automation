const { google } = require('googleapis');
require('dotenv').config();
const fs = require('fs');
const path = require('path');

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

  const GMAIL_TOKEN_PATH = path.join(__dirname, '../gmail_token.json');
  let token = process.env.GMAIL_TOKEN;

  if (!token && fs.existsSync(GMAIL_TOKEN_PATH)) {
    token = fs.readFileSync(GMAIL_TOKEN_PATH, 'utf8');
  }

  if (!token) throw new Error('Missing Gmail Authentication. Please click "Connect Account" in the sidebar.');

  oauth2Client.setCredentials(JSON.parse(token));

  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
  
  const keys = Object.keys(contact);
  const nameKey = keys.find(k => k.includes('name')) || keys[0];
  const emailKey = keys.find(k => k.includes('email') || k.includes('mail'));
  const emailAddr = (contact[emailKey] || '').toString().trim();
  const contactName = contact[nameKey] || 'Recipient';
  
  if (!emailAddr || !emailAddr.includes('@')) {
    throw new Error(`Invalid email: ${emailAddr || 'None'}`);
  }

  const messageBody = template.replace(/{{\s*name\s*}}/gi, contactName);
  const subject = (subjectTemplate || 'Personalized Outreach').replace(/{{\s*name\s*}}/gi, contactName);

  // Convert newlines to <br> for HTML
  const formattedHtml = messageBody.replace(/\n/g, '<br>');
  const htmlMessage = `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333;">
      ${formattedHtml}
    </div>
  `;

  let rawMessage;

  if (attachment) {
    const boundary = '____boundary____';
    const fileContent = fs.readFileSync(attachment.path).toString('base64');
    
    rawMessage = [
      `To: ${emailAddr}`,
      `Subject: ${subject}`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/html; charset=utf-8',
      '',
      htmlMessage,
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
      `To: ${emailAddr}`,
      `Subject: ${subject}`,
      'MIME-Version: 1.0',
      'Content-Type: text/html; charset=utf-8',
      '',
      htmlMessage,
    ].join('\r\n');
  }

  const encoded = Buffer.from(rawMessage).toString('base64url');
  const res = await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw: encoded },
  });
  return { status: 'sent', details: `Gmail sent successfully (ID: ${res.data.id})` };
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
