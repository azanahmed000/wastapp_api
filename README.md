# WhatsApp Cloud Bridge — AI Society

Cloud-deployable WhatsApp automation API that runs 24/7 on free-tier platforms (Render, Railway) — even when your local machine is off.

```
Google Sheets → n8n → HTTP Request → THIS API (Cloud) → WhatsApp Web
```

---

## What Changed (v1 → v2)

| Feature | v1 (Local) | v2 (Cloud) |
|---|---|---|
| Session storage | `LocalAuth` (filesystem) | `RemoteAuth` (MongoDB Atlas) |
| QR code scanning | Terminal only | `/qr` endpoint — scan from any browser |
| Security | None | `X-API-KEY` header authentication |
| Browser stability | None | Anti-idle heartbeat engine (15s ping) |
| Deployment | Must run on your PC | Docker container on Render/Railway |
| Uptime | Only when PC is on | 24/7 always-on |

---

## Project Structure

```
whatsapp-api/
├── bridge.js               # Entry point — orchestrates startup
├── Dockerfile              # Production container for cloud deploy
├── .dockerignore           # Files excluded from Docker build
├── package.json            # Dependencies
├── .env.example            # Environment variable template
└── src/
    ├── config.js           # Centralized env var loader + validation
    ├── logger.js           # Winston logger (console only for cloud)
    ├── store.js            # MongoDB connection + MongoStore for RemoteAuth
    ├── whatsapp.js         # WhatsApp client, heartbeat, QR state
    ├── middleware.js        # API key auth + message validation
    └── routes.js           # HTTP endpoints (/send-message, /qr, /status, /health)
```

---

## Setup Guide

### Prerequisites

1. **MongoDB Atlas** (free tier): [cloud.mongodb.com](https://cloud.mongodb.com)
   - Create a free M0 cluster
   - Create a database user
   - Whitelist `0.0.0.0/0` in Network Access (for cloud deploy)
   - Copy the connection string

2. **Render** or **Railway** account (free tier)

### Step 1: Push to GitHub

```bash
cd "h:\AI club\whatsapp-api"
git init
git add .
git commit -m "WhatsApp cloud bridge v2"
git remote add origin https://github.com/YOUR_USERNAME/whatsapp-api.git
git push -u origin main
```

### Step 2: Deploy on Render

1. Go to [render.com](https://render.com) → New → **Web Service**
2. Connect your GitHub repo
3. Settings:
   - **Runtime**: Docker
   - **Instance Type**: Free
4. Environment Variables (add these):

| Variable | Value |
|---|---|
| `MONGODB_URI` | `mongodb+srv://user:pass@cluster0.xxxxx.mongodb.net/whatsapp-bridge` |
| `BOT_API_KEY` | Generate one: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `DEFAULT_COUNTRY_CODE` | `92` |

5. Click **Deploy**

### Step 3: Scan QR Code Remotely

Once deployed, open this URL on your phone browser:

```
https://your-app.onrender.com/qr
```

Scan the QR code with WhatsApp → Linked Devices → Link a Device.

---

## API Endpoints

### `POST /send-message` *(API key required)*

```bash
curl -X POST https://your-app.onrender.com/send-message \
  -H "Content-Type: application/json" \
  -H "X-API-KEY: your-secret-key" \
  -d '{"number": "+923001234567", "message": "Welcome to AI Society!"}'
```

**Response:**
```json
{ "success": true, "message": "Message sent successfully to 923001234567" }
```

### `GET /qr` *(no auth needed)*

Opens a mobile-friendly page with the QR code as a scannable image.

### `GET /status`

```json
{ "success": true, "ready": true, "message": "WhatsApp client is connected and ready." }
```

### `GET /health`

```json
{ "status": "ok", "uptime": 12345.678, "whatsappReady": true }
```

---

## n8n Integration

In your n8n HTTP Request node:

- **Method**: POST
- **URL**: `https://your-app.onrender.com/send-message`
- **Headers**: Add `X-API-KEY` = your secret key
- **Body** (JSON):

```json
{
  "number": "{{ $json.phone }}",
  "message": "Welcome to AI Society, {{ $json.name }}! 🎉"
}
```

---

## Troubleshooting

| Issue | Solution |
|---|---|
| QR code not appearing at /qr | Wait 15-30 seconds for client initialization, then refresh |
| Session lost after redeploy | Check MongoDB connection — session should auto-restore from Atlas |
| `401 Invalid API key` | Ensure `X-API-KEY` header matches `BOT_API_KEY` env var |
| Container keeps restarting | Check Render logs for errors. Ensure MongoDB URI is correct |
| Messages not sending | Visit `/status` — if not ready, visit `/qr` and re-scan |
| High memory usage | The heartbeat engine + Puppeteer flags are tuned for 512MB. If still OOM, reduce `HEARTBEAT_INTERVAL_MS` |
