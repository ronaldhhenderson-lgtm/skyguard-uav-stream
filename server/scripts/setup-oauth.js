// ─────────────────────────────────────────────────────────────
//  One-time OAuth2 Setup Script
//  Run: node scripts/setup-oauth.js
//  Opens a browser URL, you paste the code back, tokens saved.
// ─────────────────────────────────────────────────────────────
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const readline  = require('readline');
const { createOAuth2Client, getAuthUrl, exchangeCodeForTokens } = require('../services/auth');

async function main() {
  console.log('\n  🔐 DJI Stream App — OAuth2 Setup\n');

  if (!process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID.includes('YOUR_CLIENT_ID')) {
    console.error('  ❌ GOOGLE_CLIENT_ID not set in .env');
    console.error('     Copy .env.example → .env and fill in your credentials.\n');
    process.exit(1);
  }

  const client  = createOAuth2Client();
  const authUrl = getAuthUrl(client);

  console.log('  Step 1: Open this URL in your browser:\n');
  console.log('  ' + authUrl + '\n');
  console.log('  Step 2: Log in with your YouTube channel\'s Google account.');
  console.log('  Step 3: Allow the permissions.');
  console.log('  Step 4: The browser will show a code — copy and paste it below.\n');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  rl.question('  Paste the code here: ', async (code) => {
    rl.close();
    try {
      const tokens = await exchangeCodeForTokens(client, code.trim());
      console.log('\n  ✅ Success! Tokens saved to server/tokens.json');
      console.log('  Refresh token:', tokens.refresh_token ? '✓ received' : '⚠️  not received (re-run with a fresh consent)');
      console.log('\n  You can now start the server: npm start\n');
    } catch (err) {
      console.error('\n  ❌ Error exchanging code:', err.message);
      console.error('     Make sure you copied the full code and try again.\n');
      process.exit(1);
    }
  });
}

main();
