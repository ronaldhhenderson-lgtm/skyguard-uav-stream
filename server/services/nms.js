// ─────────────────────────────────────────────────────────────
//  Local RTMP Server  |  node-media-server
//  • Receives the RTMP stream from DJI Fly
//  • Records to server/recordings/ as .flv files
//  • Optionally relays to YouTube via ffmpeg (if installed)
// ─────────────────────────────────────────────────────────────
const NodeMediaServer = require('node-media-server');
const path            = require('path');
const fs              = require('fs');
const os              = require('os');
const { spawn }       = require('child_process');

const RECORDINGS_DIR = path.join(__dirname, '..', 'recordings');

// ── Get LAN IP (so DJI Fly on the same WiFi can reach us) ───
function getLocalIp() {
  const interfaces = os.networkInterfaces();
  // Prefer WiFi-ish names first
  const preferred = ['Wi-Fi', 'wlan0', 'en0', 'eth0'];
  for (const name of [...preferred, ...Object.keys(interfaces)]) {
    const list = interfaces[name];
    if (!list) continue;
    for (const iface of list) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return '127.0.0.1';
}

// ── Find the most recently written .flv file in a directory ─
function findLatestRecording(dir) {
  if (!fs.existsSync(dir)) return null;
  let latest = null, latestTime = 0;
  function walk(d) {
    try {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const full = path.join(d, e.name);
        if (e.isDirectory()) {
          walk(full);
        } else if (e.name.endsWith('.flv') || e.name.endsWith('.mp4')) {
          const t = fs.statSync(full).mtimeMs;
          if (t > latestTime) { latestTime = t; latest = full; }
        }
      }
    } catch (_) {}
  }
  walk(dir);
  return latest;
}

// ── Active ffmpeg relay processes (keyed by NMS session ID) ─
const relayProcesses = {};

// ── Start a YouTube relay for a given mission ────────────────
function startRelay(sessionId, missionId, youtubeRtmpUrl, rtmpPort) {
  const ffmpegBin = process.env.FFMPEG_PATH || 'ffmpeg';
  const proc = spawn(ffmpegBin, [
    '-re',
    '-i', `rtmp://127.0.0.1:${rtmpPort}/live/${missionId}`,
    '-c',  'copy',
    '-f',  'flv',
    youtubeRtmpUrl,
  ], { stdio: 'pipe' });

  relayProcesses[sessionId] = proc;

  proc.on('error', err => {
    if (err.code === 'ENOENT') {
      console.log('\n  ℹ️  ffmpeg not found — recording locally only (YouTube relay skipped).');
      console.log('     Install ffmpeg to enable simultaneous YouTube streaming.');
    } else {
      console.error('\n  ⚠️  Relay error:', err.message);
    }
    delete relayProcesses[sessionId];
  });

  proc.on('close', code => {
    if (code && code !== 0) console.log(`\n  ℹ️  Relay process exited (code ${code})`);
    delete relayProcesses[sessionId];
  });

  console.log(`\n  🔄 YouTube relay started for mission ${missionId}`);
}

function stopRelay(sessionId) {
  if (relayProcesses[sessionId]) {
    relayProcesses[sessionId].kill('SIGTERM');
    delete relayProcesses[sessionId];
  }
}

// ── Main init ────────────────────────────────────────────────
//  callbacks: {
//    onStreamStart(sessionId, missionId)   — stream just arrived
//    onStreamEnd(sessionId, missionId, filePath, fileSize)
//  }
function initNms(rtmpPort, callbacks = {}) {
  if (!fs.existsSync(RECORDINGS_DIR)) fs.mkdirSync(RECORDINGS_DIR, { recursive: true });

  const config = {
    rtmp: {
      port:         rtmpPort,
      chunk_size:   60000,
      gop_cache:    true,
      ping:         30,
      ping_timeout: 60,
    },
    // We use a separate HTTP port for HLS preview (optional)
    http: {
      port:        rtmpPort + 1000,   // e.g. 2935 — not critical
      mediaroot:   RECORDINGS_DIR,
      allow_origin: '*',
    },
    logType: 1, // 0=silent, 1=error only, 2=info, 3=debug
  };

  const nms = new NodeMediaServer(config);

  // ── Stream arrives ──────────────────────────────────────────
  nms.on('prePublish', (id, StreamPath) => {
    const missionId = StreamPath.split('/').pop();
    console.log(`\n  📡 RTMP stream received → mission: ${missionId}`);
    if (callbacks.onStreamStart) callbacks.onStreamStart(id, missionId);
  });

  // ── Stream ends → find the .flv and report it ───────────────
  nms.on('donePublish', (id, StreamPath) => {
    const missionId = StreamPath.split('/').pop();
    console.log(`\n  📴 RTMP stream ended → mission: ${missionId}`);

    stopRelay(id);

    // Give NMS a moment to flush and close the file
    setTimeout(() => {
      const recDir = path.join(RECORDINGS_DIR, 'live', missionId);
      const file   = findLatestRecording(recDir);
      const size   = file ? fs.statSync(file).size : 0;
      if (callbacks.onStreamEnd) callbacks.onStreamEnd(id, missionId, file, size);
    }, 2000);
  });

  nms.run();
  return nms;
}

module.exports = { initNms, startRelay, stopRelay, getLocalIp, RECORDINGS_DIR };
