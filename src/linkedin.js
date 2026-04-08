// src/linkedin.js
const fetch = require('node-fetch');
require('dotenv').config();

/**
 * Send a LinkedIn message (InMail / connection request) to a contact.
 * `contact` should contain at least `linkedinId` and `name` fields.
 * `template` is a string with {{name}} placeholder.
 */
async function sendLinkedInMessage(contact, template) {
  const token = process.env.LINKEDIN_TOKEN;
  if (!token) throw new Error('Missing LINKEDIN_TOKEN in .env');

  const message = template.replace(/{{\s*name\s*}}/gi, contact.name || '');
  const payload = {
    recipients: [{ "personUrn": `urn:li:person:${contact.linkedinId}` }],
    subject: 'Personalized Outreach',
    body: message,
  };

  const response = await fetch('https://api.linkedin.com/v2/messaging/conversations', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`LinkedIn API error: ${response.status} – ${err}`);
  }
  return await response.json();
}

module.exports = { sendLinkedInMessage };
