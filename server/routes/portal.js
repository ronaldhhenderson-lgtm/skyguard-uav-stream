// ─────────────────────────────────────────────────────────────
//  Management Portal Routes
//  POST /api/portal/verify   →  verify passcode, return links
//  GET  /api/portal/missions →  list missions (post-auth)
// ─────────────────────────────────────────────────────────────
const express   = require('express');
const bcrypt    = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const router    = express.Router();

const { getAllMissions, getMissionById } = require('../db/index');

// ── Passcode hash (computed once at startup) ─────────────────
let _passcodeHash = null;
async function getPasscodeHash() {
  if (!_passcodeHash) {
    const raw = process.env.MANAGEMENT_PASSCODE;
    if (!raw) throw new Error('MANAGEMENT_PASSCODE not set in .env');
    _passcodeHash = await bcrypt.hash(raw, 10);
  }
  return _passcodeHash;
}
// Pre-hash on startup
getPasscodeHash().catch(console.error);

// ── Rate limiter: 5 attempts per 15 min per IP ───────────────
const verifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max:      5,
  message:  { error: 'Too many attempts. Try again in 15 minutes.', locked: true },
  standardHeaders: true,
  legacyHeaders:   false,
  skipSuccessfulRequests: true,  // don't count successful logins
});

// ── POST /api/portal/verify ──────────────────────────────────
router.post('/verify', verifyLimiter, async (req, res) => {
  try {
    const { passcode, missionId } = req.body;

    if (!passcode) {
      return res.status(400).json({ error: 'Passcode required' });
    }

    const hash  = await getPasscodeHash();
    const valid = await bcrypt.compare(passcode, hash);

    if (!valid) {
      return res.status(401).json({ error: 'Incorrect passcode', locked: false });
    }

    // Passcode correct — return mission data
    let missions;
    if (missionId) {
      const m = getMissionById(missionId);
      missions = m ? [m] : [];
    } else {
      missions = getAllMissions(50);
    }

    // Strip stream keys from response (management doesn't need them)
    const safeMissions = missions.map(m => ({
      id:             m.id,
      title:          m.title,
      status:         m.status,
      youtubeUrl:     m.youtube_watch_url,
      createdAt:      m.created_at,
      startedAt:      m.started_at,
      endedAt:        m.ended_at,
    }));

    res.json({ success: true, missions: safeMissions });

  } catch (err) {
    console.error('Portal verify error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/portal/missions (token-based, simple) ───────────
// Simple: client passes passcode as header for subsequent fetches
router.get('/missions', verifyLimiter, async (req, res) => {
  try {
    const passcode = req.headers['x-portal-passcode'];
    if (!passcode) return res.status(401).json({ error: 'Passcode header required' });

    const hash  = await getPasscodeHash();
    const valid = await bcrypt.compare(passcode, hash);
    if (!valid) return res.status(401).json({ error: 'Incorrect passcode' });

    const missions = getAllMissions(100).map(m => ({
      id:         m.id,
      title:      m.title,
      status:     m.status,
      youtubeUrl: m.youtube_watch_url,
      createdAt:  m.created_at,
      startedAt:  m.started_at,
      endedAt:    m.ended_at,
    }));

    res.json({ missions });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
