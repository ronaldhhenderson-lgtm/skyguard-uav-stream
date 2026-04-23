// ─────────────────────────────────────────────────────────────
//  YouTube Live Streaming API Service
//  Wraps the YouTube Data API v3 Live Streaming methods
// ─────────────────────────────────────────────────────────────
const { google }       = require('googleapis');
const { getAuthClient } = require('./auth');

function getYouTube() {
  return google.youtube({ version: 'v3', auth: getAuthClient() });
}

// ── 1. Create an unlisted LiveBroadcast ──────────────────────
async function createBroadcast(title) {
  const youtube = getYouTube();
  const now     = new Date().toISOString();

  const res = await youtube.liveBroadcasts.insert({
    part: ['snippet', 'status', 'contentDetails'],
    requestBody: {
      snippet: {
        title:              title || `Mission ${new Date().toLocaleString()}`,
        scheduledStartTime: now,
        description:        'DJI Neo 2 safety monitoring stream. Auto-generated.',
      },
      status: {
        privacyStatus:            'unlisted',   // ← key: unlisted, not public
        selfDeclaredMadeForKids:  false,
      },
      contentDetails: {
        enableAutoStart:  true,   // go live automatically when RTMP arrives
        enableAutoStop:   true,   // end automatically when RTMP disconnects
        recordFromStart:  true,   // save the VOD
        enableDvr:        true,   // allow rewind during live
        latencyPreference:'normal',
      },
    },
  });

  return res.data;
}

// ── 2. Create a LiveStream (RTMP ingest config) ───────────────
async function createStream(title) {
  const youtube = getYouTube();

  const res = await youtube.liveStreams.insert({
    part: ['snippet', 'cdn', 'status'],
    requestBody: {
      snippet: {
        title: title || `Stream ${Date.now()}`,
      },
      cdn: {
        ingestionType: 'rtmp',
        resolution:    '720p',
        frameRate:     '30fps',
      },
    },
  });

  return res.data;
}

// ── 3. Bind a stream to a broadcast ──────────────────────────
async function bindStreamToBroadcast(broadcastId, streamId) {
  const youtube = getYouTube();

  const res = await youtube.liveBroadcasts.bind({
    part:     ['id', 'contentDetails'],
    id:       broadcastId,
    streamId: streamId,
  });

  return res.data;
}

// ── 4. Transition broadcast status ───────────────────────────
//  valid transitions: 'testing' → 'live' → 'complete'
async function transitionBroadcast(broadcastId, status) {
  const youtube = getYouTube();

  const res = await youtube.liveBroadcasts.transition({
    part:           ['id', 'status'],
    id:             broadcastId,
    broadcastStatus: status,
  });

  return res.data;
}

// ── 5. End a broadcast (transition to complete) ───────────────
async function endBroadcast(broadcastId) {
  try {
    return await transitionBroadcast(broadcastId, 'complete');
  } catch (err) {
    // YouTube may throw if already complete — that's fine
    if (err.message && err.message.includes('redundantTransition')) {
      console.log('  ℹ️  Broadcast already complete.');
      return null;
    }
    throw err;
  }
}

// ── 6. Get broadcast status ───────────────────────────────────
async function getBroadcastStatus(broadcastId) {
  const youtube = getYouTube();

  const res = await youtube.liveBroadcasts.list({
    part: ['id', 'status', 'snippet'],
    id:   broadcastId,
  });

  return res.data.items?.[0] || null;
}

// ── Main: Create a full mission (broadcast + stream + bind) ──
async function createMissionBroadcast(missionTitle) {
  console.log('  📺 Creating YouTube broadcast...');
  const broadcast = await createBroadcast(missionTitle);
  const broadcastId = broadcast.id;

  console.log('  📡 Creating RTMP stream...');
  const stream = await createStream(missionTitle);
  const streamId = stream.id;

  const ingestInfo  = stream.cdn?.ingestionInfo || {};
  const rtmpBase    = ingestInfo.ingestionAddress || 'rtmp://a.rtmp.youtube.com/live2';
  const streamKey   = ingestInfo.streamName       || '';
  const fullRtmp    = `${rtmpBase}/${streamKey}`;

  console.log('  🔗 Binding stream to broadcast...');
  await bindStreamToBroadcast(broadcastId, streamId);

  const watchUrl = `https://www.youtube.com/watch?v=${broadcastId}`;

  console.log(`  ✅ Mission broadcast ready: ${watchUrl}`);
  console.log(`  🔑 RTMP: ${fullRtmp}`);

  return {
    broadcastId,
    streamId,
    watchUrl,
    rtmpIngestionUrl: rtmpBase,
    streamKey,
    fullRtmpString: fullRtmp,
  };
}

module.exports = {
  createMissionBroadcast,
  endBroadcast,
  getBroadcastStatus,
  createBroadcast,
  createStream,
  bindStreamToBroadcast,
  transitionBroadcast,
};
