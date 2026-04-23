// Database | Node.js 22 built-in SQLite (node:sqlite)
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs   = require('fs');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH  = path.join(DATA_DIR, 'missions.db');

let db;

function getDb() {
  if (!db) throw new Error('Database not initialised.');
  return db;
}

async function initDb() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  db = new DatabaseSync(DB_PATH);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS missions (
      id                    TEXT PRIMARY KEY,
      title                 TEXT,
      youtube_broadcast_id  TEXT,
      youtube_stream_id     TEXT,
      youtube_watch_url     TEXT,
      rtmp_ingestion_url    TEXT,
      stream_key            TEXT,
      full_rtmp_string      TEXT,
      local_rtmp_string     TEXT,
      recording_path        TEXT,
      recording_size        INTEGER DEFAULT 0,
      status                TEXT DEFAULT 'idle',
      created_at            TEXT DEFAULT (datetime('now')),
      started_at            TEXT,
      ended_at              TEXT
    );
  `);
  // Idempotent migrations for existing databases
  const migrations = [
    'local_rtmp_string TEXT',
    'recording_path TEXT',
    'recording_size INTEGER DEFAULT 0',
  ];
  for (const col of migrations) {
    try { db.exec(`ALTER TABLE missions ADD COLUMN ${col}`); } catch (_) {}
  }
  console.log('  DB ready:', DB_PATH);
  return db;
}

function createMission(data) {
  getDb().prepare(`
    INSERT INTO missions
      (id, title, youtube_broadcast_id, youtube_stream_id, youtube_watch_url,
       rtmp_ingestion_url, stream_key, full_rtmp_string, local_rtmp_string, status, started_at)
    VALUES
      (:id, :title, :youtube_broadcast_id, :youtube_stream_id, :youtube_watch_url,
       :rtmp_ingestion_url, :stream_key, :full_rtmp_string, :local_rtmp_string, 'live', datetime('now'))
  `).run(data);
  return getMissionById(data.id);
}

function getMissionById(id) {
  return getDb().prepare('SELECT * FROM missions WHERE id = ?').get(id);
}

function getLatestMission() {
  return getDb().prepare('SELECT * FROM missions ORDER BY created_at DESC LIMIT 1').get();
}

function getAllMissions(limit) {
  return getDb().prepare('SELECT * FROM missions ORDER BY created_at DESC LIMIT ?').all(limit || 50);
}

function endMission(id) {
  getDb().prepare("UPDATE missions SET status = 'ended', ended_at = datetime('now') WHERE id = ?").run(id);
  return getMissionById(id);
}

function updateMissionStatus(id, status) {
  getDb().prepare('UPDATE missions SET status = ? WHERE id = ?').run(status, id);
}

function saveRecordingPath(id, filePath, fileSize) {
  getDb().prepare(
    'UPDATE missions SET recording_path = ?, recording_size = ? WHERE id = ?'
  ).run(filePath, fileSize || 0, id);
}

module.exports = {
  initDb, getDb,
  createMission, getMissionById, getLatestMission, getAllMissions,
  endMission, updateMissionStatus, saveRecordingPath,
};
