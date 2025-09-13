#!/usr/bin/env node

// Script to set Telegram webhook for Railway deployment
// Usage: PUBLIC_URL=https://your-app.railway.app node scripts/set-telegram-webhook.js

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const PUBLIC_URL = process.env.PUBLIC_URL;

if (!TELEGRAM_BOT_TOKEN) {
  console.error('❌ Error: TELEGRAM_BOT_TOKEN not found in environment variables');
  process.exit(1);
}

if (!PUBLIC_URL) {
  console.error('❌ Error: PUBLIC_URL not found in environment variables');
  console.error('   Example: PUBLIC_URL=https://your-app.railway.app');
  process.exit(1);
}

const WEBHOOK_URL = `${PUBLIC_URL}/webhooks/telegram/action`;

console.log('🔧 Setting up Telegram webhook...');
console.log(`📍 Webhook URL: ${WEBHOOK_URL}`);

async function setWebhook() {
  try {
    // First, delete any existing webhook
    const deleteUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/deleteWebhook`;
    const deleteResponse = await fetch(deleteUrl);
    const deleteResult = await deleteResponse.json();
    console.log('🗑️ Deleted existing webhook:', deleteResult);

    // Set the new webhook
    const setUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook`;
    const setResponse = await fetch(setUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: WEBHOOK_URL,
        allowed_updates: ['message', 'callback_query'],
        drop_pending_updates: true, // Clear any pending messages
      }),
    });
    
    const setResult = await setResponse.json();
    
    if (setResult.ok) {
      console.log('✅ Webhook set successfully!');
      console.log('📨 Telegram will now send messages to:', WEBHOOK_URL);
      
      // Get webhook info to confirm
      const infoUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo`;
      const infoResponse = await fetch(infoUrl);
      const infoResult = await infoResponse.json();
      
      console.log('\n📊 Webhook Info:');
      console.log('  URL:', infoResult.result.url);
      console.log('  Pending updates:', infoResult.result.pending_update_count);
      console.log('  Last error:', infoResult.result.last_error_message || 'None');
      
      console.log('\n🎉 Your bot is now ready to receive messages!');
      console.log('💬 Send a message to your bot on Telegram to test it.');
    } else {
      console.error('❌ Failed to set webhook:', setResult);
    }
  } catch (error) {
    console.error('❌ Error setting webhook:', error);
  }
}

setWebhook();