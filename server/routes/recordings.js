// ─────────────────────────────────────────────────────────────
//  Recordings API
//  GET  /api/recordings          — list all missions + file info
//  GET  /api/recordings/verify   — POST passcode verify (alias)
// ─────────────────────────────────────────────────────────────
const express  = require('express');
const bcrypt   = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const router   = express.Router();

const { getAllMissions } = require('../db/index');
const { RECORDINGS_DIR } = require('../services/nms');
const fs   = require('fs');
const path = require('path');

// ── Passcode (same env var as portal) ────────────────────────
let _hash = null;
function getHash() {
  if (!_hash) _hash = bcrypt.hashSync(process.env.MANAGEMENT_PASSCODE || 'admin', 10);
  return _hash;
}
function ok(p) { return bcrypt.compareSync(p || '', getHash()); }

// ── Auth middleware (header: x-portal-passcode) ──────────────
function auth(req, res, next) {
  const p = req.headers['x-portal-passcode'];
  if (!ok(p)) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

// ── Rate limit for verify endpoint ──────────────────────────
const limiter = rateLimit({ windowMs: 15*60*1000, max: 5, standardHeaders: true, legacyHeaders: false });

// ── POST /api/recordings/verify ─────────────────────────────
router.post('/verify', limiter, (req, res) => {
  const { passcode } = req.body;
  if (!ok(passcode)) {
    return res.status(401).json({ success: false, error: 'Wrong passcode' });
  }
  // Return initial list
  res.json({ success: true, recordings: buildList() });
});

// ── GET /api/recordings ──────────────────────────────────────
router.get('/', auth, (req, res) => {
  res.json({ recordings: buildList() });
});

// ── Helpers ──────────────────────────────────────────────────
function buildList() {
  const missions = getAllMissions(200);
  return missions.map(m => {
    let recording = null;
    if (m.recording_path) {
      const exists = fs.existsSync(m.recording_path);
      if (exists) {
        const stat = fs.statSync(m.recording_path);
        // Build a relative URL path for downloading
        const rel = path.relative(RECORDINGS_DIR, m.recording_path).replace(/\\/g, '/');
        recording = {
          path:           rel,
          size:           stat.size,
          sizeFormatted:  fmtBytes(stat.size),
          downloadUrl:    `/recordings-file/${encodeURIComponent(rel)}`,
        };
      } else {
        recording = { path: null, size: 0, sizeFormatted: '—', downloadUrl: null };
      }
    }

    return {
      id:         m.id,
      title:      m.title,
      status:     m.status,
      createdAt:  m.created_at,
      startedAt:  m.started_at,
      endedAt:    m.ended_at,
      youtubeUrl: m.youtube_watch_url,
      recording,
    };
  });
}

function fmtBytes(b) {
  if (b < 1024)        return `${b} B`;
  if (b < 1024*1024)   return `${(b/1024).toFixed(1)} KB`;
  if (b < 1024**3)     return `${(b/1024/1024).toFixed(1)} MB`;
  return `${(b/1024**3).toFixed(2)} GB`;
}

module.exports = router;
