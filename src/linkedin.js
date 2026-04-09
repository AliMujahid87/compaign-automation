// src/linkedin.js
const fetch = require('node-fetch');
require('dotenv').config();

/**
 * Send a LinkedIn message via API
 * Note: LinkedIn API for private messages usually requires specific partner access
 * or using the Social Actions API. For a simple campaign, we often use the
 * 'Share' or 'Postal' API for posting, or a third-party automation tool.
 * 
 * This is a boilerplate for integration using the member-to-member messaging API 
 * if authorized, OR a simple post share.
 */
async function sendLinkedInMessage(contact, template) {
  const token = process.env.LINKEDIN_TOKEN;
  if (!token) throw new Error('Missing LINKEDIN_TOKEN in .env');

  const accessToken = typeof token === 'string' && token.startsWith('{') 
    ? JSON.parse(token).access_token 
    : token;

  const linkedinId = contact.linkedinid || contact.linkedin_id || contact.profile;
  if (!linkedinId) throw new Error('LinkedIn ID missing in CSV');

  // Personalize template
  let message = template;
  for (const key in contact) {
    const regex = new RegExp(`{{${key}}}`, 'g');
    message = message.replace(regex, contact[key]);
  }

  // LinkedIn Messaging API (Member-to-Member)
  // URL: https://api.linkedin.com/v2/messages
  // Note: This requires the 'w_messages' scope which is restricted.
  
  try {
    const response = await fetch('https://api.linkedin.com/v2/messages', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0'
      },
      body: JSON.stringify({
        recipients: [linkedinId],
        subject: 'Personalized Outreach',
        body: message
      })
    });

    const data = await response.json();
    if (data.error) throw new Error(data.message || 'LinkedIn API Error');
    
    return data;
  } catch (err) {
    // If messages API fails, it might be due to restriction.
    // We log success for the sake of the demo, or provide clear error.
    throw new Error(`LinkedIn Send Failed: ${err.message}`);
  }
}

module.exports = { sendLinkedInMessage };
