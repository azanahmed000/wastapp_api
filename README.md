# WhatsApp Local Bridge — AI Society

Local WhatsApp automation API running alongside your self-hosted n8n instance.

```
Google Sheets → n8n (local) → http://localhost:3000/send-message → WhatsApp Web
```

---

## Quick Start

```bash
cd "h:\AI club\whatsapp-api"
npm start
```

That's it. The server boots, connects to MongoDB Atlas, and prints a QR code in the terminal. Scan it and you're live.

---

## Project Structure

```
whatsapp-api/
├── bridge.js              # Entry point — npm start runs this
├── start.bat              # Double-click alternative to npm start
├── package.json           # Dependencies & scripts
├── .env                   # Environment variables (git-ignored)
├── .env.example           # Template
├── .gitignore
└── src/
    ├── config.js           # Env var loader + validation
    ├── logger.js           # Winston logger with prefix tags
    ├── store.js            # MongoDB Atlas connection + session verification
    ├── whatsapp.js         # WhatsApp client with RemoteAuth + terminal QR
    ├── middleware.js        # API key auth + message validation
    └── routes.js           # HTTP endpoints
```

---

## Environment Variables (.env)

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP server port |
| `MONGODB_URI` | — | MongoDB Atlas connection string (required) |
| `BOT_API_KEY` | — | Secret key for /send-message endpoint (required) |
| `DEFAULT_COUNTRY_CODE` | `92` | For normalizing local phone numbers |
| `CHROME_PATH` | `C:\Program Files\Google\Chrome\Application\chrome.exe` | Path to Chrome |

---

## API Endpoints

### `POST /send-message` *(API key required)*
```bash
curl -X POST http://localhost:3000/send-message ^
  -H "Content-Type: application/json" ^
  -H "X-API-KEY: your-key" ^
  -d "{\"number\": \"+923001234567\", \"message\": \"Welcome to AI Society!\"}"
```

### `GET /qr` — Browser-based QR scanning
### `GET /status` — Connection status with MongoDB session check
### `GET /health` — Server health + memory usage

---

## n8n Integration

In your local n8n HTTP Request node:

- **Method**: POST
- **URL**: `http://localhost:3000/send-message`
- **Headers**: `X-API-KEY` = your secret key
- **Body** (JSON):
```json
{
  "number": "{{ $json.phone }}",
  "message": "Welcome to AI Society, {{ $json.name }}! 🎉"
}
```
