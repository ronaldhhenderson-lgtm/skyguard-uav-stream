# SkyGuard — DJI Neo 2 Safety UAV Monitoring Platform

**Henderson Transpacific（香港）有限公司**

A self-hosted server that receives a live video stream from a DJI Neo 2 drone, records it locally, and optionally relays it to YouTube Live as an unlisted broadcast — all controlled through a simple web interface.

---

## Features

- 📡 **Local RTMP recording** — receives the drone stream on your LAN, saves `.flv` files automatically
- 📺 **YouTube Live relay** — optionally streams to an unlisted, not-made-for-kids YouTube broadcast via ffmpeg
- 🔐 **Passcode-protected portals** — management and recordings pages require a passcode
- 📂 **Recordings library** — auto-generated webpage listing every flight with file size, duration, and download link
- 🌐 **Bilingual landing page** — Traditional Chinese / English, Apple-style, Day/Night mode

---

## Requirements

- **Node.js 22+** (uses built-in `node:sqlite`)
- **ffmpeg** (optional — only needed for YouTube relay)
- A **Google Cloud project** with YouTube Data API v3 enabled (optional — only needed for YouTube)
- DJI Neo 2 with **Basic Remote** on the same Wi-Fi as your server computer

---

## Quick Start

### 1. Install dependencies

```bash
cd server
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `server/.env`:

```env
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3000/oauth/callback
MANAGEMENT_PASSCODE=choose-a-secure-passcode
PORT=3000
RTMP_PORT=1935
```

### 3. Link your YouTube account (optional)

```bash
npm run setup-oauth
```

Follow the printed instructions — opens a browser URL, you paste the auth code back. Tokens are saved to `tokens.json` (never committed).

### 4. Start the server

```bash
npm start
```

### 5. Point DJI Fly at your server

In DJI Fly → Live Stream → Custom RTMP, enter:

```
rtmp://<your-computer-lan-ip>:1935/live/<any-mission-id>
```

The Safety Officer web UI at `http://localhost:3000/officer` will show the exact address.

---

## Pages

| URL | Description |
|-----|-------------|
| `http://localhost:3000/officer` | Safety Officer — start/end missions, get RTMP address |
| `http://localhost:3000/portal` | Management portal — view YouTube links (passcode required) |
| `http://localhost:3000/recordings` | Recordings library — browse and download flight files (passcode required) |
| `landing-page.html` | Marketing landing page (open directly in browser) |

---

## Project Structure

```
server/
├── server.js              # Express entry point
├── services/
│   ├── nms.js             # RTMP server (node-media-server) + local recording
│   ├── youtube.js         # YouTube Live API wrapper
│   └── auth.js            # Google OAuth2
├── routes/
│   ├── mission.js         # /api/mission — start/end flights
│   ├── portal.js          # /api/portal — management portal
│   └── recordings.js      # /api/recordings — recordings library
├── db/
│   └── index.js           # SQLite database (node:sqlite)
├── public/
│   ├── officer/           # Safety Officer UI
│   ├── portal/            # Management portal UI
│   └── recordings/        # Recordings library UI
├── scripts/
│   └── setup-oauth.js     # One-time YouTube account linking
├── .env.example           # Environment variable template
└── package.json
landing-page.html          # Product landing page
QUICK-START.html           # Plain-English setup guide
```

---

## Security Notes

- **Never commit** `.env` or `tokens.json` — both are in `.gitignore`
- The `MANAGEMENT_PASSCODE` protects the portal and recordings pages
- YouTube broadcasts are created as **unlisted** and **not made for kids**
- Recording file downloads are authenticated via passcode query parameter

---

## License

Proprietary — Henderson Transpacific（香港）有限公司. All rights reserved.
