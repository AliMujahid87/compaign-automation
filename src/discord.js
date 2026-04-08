// src/discord.js
const fetch = require('node-fetch');
require('dotenv').config();

/**
 * Send a Discord message via bot token (DM) or webhook.
 * `contact` should contain either `discordId` (user ID) or `webhookUrl`.
 * `template` is a string with {{name}} placeholder.
 */
async function sendDiscordMessage(contact, template) {
  const message = template.replace(/{{\s*name\s*}}/gi, contact.name || '');

  // Prefer webhook if provided (simpler, no DM creation needed)
  if (contact.webhookUrl) {
    const res = await fetch(contact.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: message }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Discord webhook error: ${res.status} – ${err}`);
    }
    return await res.json();
  }

  // Otherwise use bot token to open a DM channel and send a message
  const botToken = process.env.DISCORD_BOT_TOKEN;
  if (!botToken) throw new Error('Missing DISCORD_BOT_TOKEN in .env');
  if (!contact.discordId) throw new Error('Contact missing discordId for bot messaging');

  // 1️⃣ Create DM channel
  const dmRes = await fetch(`https://discord.com/api/v10/users/@me/channels`, {
    method: 'POST',
    headers: { Authorization: `Bot ${botToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipient_id: contact.discordId }),
  });
  if (!dmRes.ok) {
    const err = await dmRes.text();
    throw new Error(`Discord DM channel error: ${dmRes.status} – ${err}`);
  }
  const dmData = await dmRes.json();

  // 2️⃣ Send message to the channel
  const msgRes = await fetch(`https://discord.com/api/v10/channels/${dmData.id}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bot ${botToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: message }),
  });
  if (!msgRes.ok) {
    const err = await msgRes.text();
    throw new Error(`Discord send message error: ${msgRes.status} – ${err}`);
  }
  return await msgRes.json();
}

module.exports = { sendDiscordMessage };
