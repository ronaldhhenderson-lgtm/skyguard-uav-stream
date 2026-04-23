// ─────────────────────────────────────────────────────────────
//  DJI Neo 2  |  Main Server
//  • Express HTTP (port 3000) — web pages + REST API
//  • node-media-server RTMP (port 1935) — receives drone stream
//    and records it to server/recordings/
// ─────────────────────────────────────────────────────────────
require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const path       = require('path');
const fs         = require('fs');
const { initDb, getMissionById, saveRecordingPath } = require('./db/index');
const { initNms, startRelay, getLocalIp, RECORDINGS_DIR } = require('./services/nms');

const app      = express();
const PORT     = parseInt(process.env.PORT)      || 3000;
const RTMP_PORT = parseInt(process.env.RTMP_PORT) || 1935;

// ── Middleware ───────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ── Static frontends ─────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ── Serve recording files (with passcode in query param) ─────
const bcrypt = require('bcryptjs');
let _phash = null;
function checkPasscode(p) {
  if (!_phash) _phash = bcrypt.hashSync(process.env.MANAGEMENT_PASSCODE || 'admin', 10);
  return bcrypt.compareSync(p || '', _phash);
}

app.get('/recordings-file/*', (req, res) => {
  // Accept passcode from query param ?p=xxx OR header x-portal-passcode
  const p = req.query.p || req.headers['x-portal-passcode'] || '';
  if (!checkPasscode(p)) return res.status(401).send('Unauthorized');

  const relPath  = decodeURIComponent(req.params[0]);
  const filePath = path.join(RECORDINGS_DIR, relPath);

  // Prevent path traversal
  if (!filePath.startsWith(RECORDINGS_DIR)) return res.status(403).send('Forbidden');
  if (!fs.existsSync(filePath)) return res.status(404).send('Not found');

  const filename = path.basename(filePath);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', 'video/x-flv');
  fs.createReadStream(filePath).pipe(res);
});

// ── API Routes ───────────────────────────────────────────────
app.use('/api/mission',    require('./routes/mission'));
app.use('/api/portal',     require('./routes/portal'));
app.use('/api/recordings', require('./routes/recordings'));

// ── OAuth callback (used once during setup) ──────────────────
app.get('/oauth/callback', (req, res) => {
  const code = req.query.code;
  if (!code) return res.status(400).send('No code received.');
  res.send(`
    <html><body style="font-family:sans-serif;padding:40px;background:#f5f5f0;">
      <h2>OAuth Code Received</h2>
      <p>Copy the code below and paste it into your terminal:</p>
      <pre style="background:#1e2d1e;color:#a8d4a6;padding:16px;border-radius:8px;font-size:14px;word-break:break-all;">${code}</pre>
      <p style="color:#888;font-size:13px;">You can close this tab.</p>
    </body></html>
  `);
});

// ── Health check ─────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

// ── Start everything ─────────────────────────────────────────
async function start() {
  try {
    await initDb();

    // ── Start RTMP server ───────────────────────────────────
    initNms(RTMP_PORT, {
      onStreamStart: (sessionId, missionId) => {
        // If we have a YouTube RTMP URL, start relaying to it
        try {
          const mission = getMissionById(missionId);
          if (mission && mission.full_rtmp_string) {
            startRelay(sessionId, missionId, mission.full_rtmp_string, RTMP_PORT);
          }
        } catch (err) {
          console.error('  Relay start error:', err.message);
        }
      },
      onStreamEnd: (sessionId, missionId, filePath, fileSize) => {
        if (filePath) {
          try {
            saveRecordingPath(missionId, filePath, fileSize);
            const mb = (fileSize / 1024 / 1024).toFixed(1);
            console.log(`\n  Recording saved: ${mb} MB  →  ${filePath}`);
          } catch (err) {
            console.error('  Save recording path error:', err.message);
          }
        }
      },
    });

    // ── Start HTTP server ───────────────────────────────────
    const localIp = getLocalIp();
    app.listen(PORT, () => {
      console.log('');
      console.log('  DJI Neo 2 Stream Server');
      console.log('  ─────────────────────────────────────────');
      console.log(`  HTTP server:       http://localhost:${PORT}`);
      console.log(`  RTMP server:       rtmp://localhost:${RTMP_PORT}`);
      console.log('');
      console.log('  Pages (open in browser):');
      console.log(`    Officer App:     http://localhost:${PORT}/officer/`);
      console.log(`    Mgmt Portal:     http://localhost:${PORT}/portal/`);
      console.log(`    Recordings:      http://localhost:${PORT}/recordings/`);
      console.log('');
      console.log('  Your LAN IP (paste into DJI Fly on same WiFi):');
      console.log(`    rtmp://${localIp}:${RTMP_PORT}/live/<missionId>`);
      console.log('');
      console.log('  Recording files saved to:');
      console.log(`    ${RECORDINGS_DIR}`);
      console.log('');
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();
