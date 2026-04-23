// ─────────────────────────────────────────────────────────────
//  Mission Routes
//  POST /api/mission/start  →  create YouTube broadcast + local RTMP address
//  POST /api/mission/end    →  end broadcast, recording saved locally
//  GET  /api/mission/status/:id
//  GET  /api/mission/latest
//  GET  /api/mission/all
// ─────────────────────────────────────────────────────────────
const express  = require('express');
const { v4: uuidv4 } = require('uuid');
const router   = express.Router();

const { createMissionBroadcast, endBroadcast, getBroadcastStatus } = require('../services/youtube');
const { createMission, getMissionById, getAllMissions, getLatestMission, endMission } = require('../db/index');
const { getLocalIp } = require('../services/nms');

const RTMP_PORT = parseInt(process.env.RTMP_PORT) || 1935;

// ── POST /api/mission/start ──────────────────────────────────
router.post('/start', async (req, res) => {
  try {
    const missionId    = uuidv4();
    const missionTitle = req.body.title || `Mission ${new Date().toLocaleString('en-AU')}`;

    console.log(`\n  Starting mission: ${missionId}`);

    // Build the local RTMP address (what DJI Fly will push to)
    const localIp         = getLocalIp();
    const localRtmpString = `rtmp://${localIp}:${RTMP_PORT}/live/${missionId}`;

    // Try to create a YouTube broadcast for live monitoring + VOD storage
    let yt = null;
    try {
      yt = await createMissionBroadcast(missionTitle);
      console.log(`  YouTube broadcast created: ${yt.watchUrl}`);
    } catch (err) {
      // YouTube not configured or token missing — local recording still works
      console.log(`  YouTube not available (${err.message}) — recording locally only.`);
    }

    // Save to DB
    const mission = createMission({
      id:                   missionId,
      title:                missionTitle,
      youtube_broadcast_id: yt?.broadcastId  || null,
      youtube_stream_id:    yt?.streamId     || null,
      youtube_watch_url:    yt?.watchUrl     || null,
      rtmp_ingestion_url:   yt?.rtmpIngestionUrl || null,
      stream_key:           yt?.streamKey    || null,
      full_rtmp_string:     yt?.fullRtmpString || null,  // YouTube RTMP (for relay)
      local_rtmp_string:    localRtmpString,             // Local RTMP (for DJI Fly)
    });

    res.json({
      success:         true,
      missionId:       missionId,
      title:           missionTitle,
      // fullRtmpString is the LOCAL address — this is what the officer pastes into DJI Fly
      fullRtmpString:  localRtmpString,
      localRtmpString: localRtmpString,
      youtubeWatchUrl: yt?.watchUrl || null,
      hasYouTube:      !!yt,
      status:          'live',
      instructions: {
        step1: 'Copy the RTMP string shown on screen',
        step2: 'Make sure your phone is on the SAME WiFi as this computer',
        step3: 'DJI Fly → GO FLY → Transmission → Live Streaming → RTMP',
        step4: 'Paste RTMP string into the RTMP Address field',
        step5: 'Set Resolution: 720p, Bitrate: 3-5 Mbps → Tap Start',
      },
    });

  } catch (err) {
    console.error('  Mission start error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/mission/end ────────────────────────────────────
router.post('/end', async (req, res) => {
  try {
    const { missionId } = req.body;
    if (!missionId) return res.status(400).json({ error: 'missionId required' });

    const mission = getMissionById(missionId);
    if (!mission) return res.status(404).json({ error: 'Mission not found' });
    if (mission.status === 'ended') return res.json({ success: true, message: 'Already ended', mission });

    console.log(`\n  Ending mission: ${missionId}`);

    // End YouTube broadcast (if we have one)
    if (mission.youtube_broadcast_id) {
      try {
        await endBroadcast(mission.youtube_broadcast_id);
      } catch (err) {
        console.log(`  YouTube end error (non-fatal): ${err.message}`);
      }
    }

    // Update DB
    const updated = endMission(missionId);

    res.json({
      success:         true,
      missionId:       missionId,
      youtubeWatchUrl: mission.youtube_watch_url || null,
      status:          'ended',
      note:            mission.youtube_watch_url
        ? 'YouTube VOD will be available within ~15 minutes. Local recording saved on this computer.'
        : 'Mission ended. Local recording being saved to server/recordings/',
      mission:         updated,
    });

  } catch (err) {
    console.error('  Mission end error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/mission/status/:id ──────────────────────────────
router.get('/status/:id', async (req, res) => {
  try {
    const mission = getMissionById(req.params.id);
    if (!mission) return res.status(404).json({ error: 'Mission not found' });

    let ytStatus = null;
    if (mission.youtube_broadcast_id) {
      try { ytStatus = await getBroadcastStatus(mission.youtube_broadcast_id); } catch (_) {}
    }

    res.json({ mission, youtubeLiveStatus: ytStatus?.status?.recordingStatus || null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/mission/latest ──────────────────────────────────
router.get('/latest', (req, res) => {
  const mission = getLatestMission();
  if (!mission) return res.json({ mission: null });
  res.json({ mission });
});

// ── GET /api/mission/all ─────────────────────────────────────
router.get('/all', (req, res) => {
  const missions = getAllMissions(100);
  res.json({ missions });
});

module.exports = router;
