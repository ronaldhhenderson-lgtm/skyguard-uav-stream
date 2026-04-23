// ─────────────────────────────────────────────────────────────
//  Google OAuth2 Service
//  Loads credentials from .env and tokens from tokens.json
// ─────────────────────────────────────────────────────────────
const { google } = require('googleapis');
const path       = require('path');
const fs         = require('fs');

const TOKENS_PATH = path.join(__dirname, '..', 'tokens.json');

// ── Build the OAuth2 client ──────────────────────────────────
function createOAuth2Client() {
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/oauth/callback'
  );

  // Load tokens if they exist
  if (fs.existsSync(TOKENS_PATH)) {
    const tokens = JSON.parse(fs.readFileSync(TOKENS_PATH, 'utf8'));
    client.setCredentials(tokens);

    // Auto-save refreshed tokens
    client.on('tokens', (newTokens) => {
      const existing = JSON.parse(fs.readFileSync(TOKENS_PATH, 'utf8'));
      const merged   = { ...existing, ...newTokens };
      fs.writeFileSync(TOKENS_PATH, JSON.stringify(merged, null, 2));
    });
  } else {
    console.warn('  ⚠️  tokens.json not found. Run: npm run setup-oauth');
  }

  return client;
}

// ── Get the OAuth URL for first-time setup ───────────────────
function getAuthUrl(client) {
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt:      'consent',
    scope: [
      'https://www.googleapis.com/auth/youtube.force-ssl',
    ],
  });
}

// ── Exchange auth code for tokens and save ───────────────────
async function exchangeCodeForTokens(client, code) {
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);
  fs.writeFileSync(TOKENS_PATH, JSON.stringify(tokens, null, 2));
  console.log('  ✅ Tokens saved to', TOKENS_PATH);
  return tokens;
}

// ── Singleton OAuth2 client ──────────────────────────────────
let _client;
function getAuthClient() {
  if (!_client) _client = createOAuth2Client();
  return _client;
}

module.exports = { getAuthClient, getAuthUrl, exchangeCodeForTokens, createOAuth2Client };
