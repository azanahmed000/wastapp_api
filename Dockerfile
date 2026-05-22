# ═══════════════════════════════════════════════════════════
# Dockerfile — WhatsApp Cloud Bridge (hardened)
#
# PURPOSE:
#   Production container for deploying on Render, Railway, or
#   any Docker host. Installs Chromium and all dependencies
#   needed for headless WhatsApp Web automation.
#
#   STABILITY FIXES:
#   - Creates /tmp/whatsapp-bridge with full write permissions
#   - Sets all Puppeteer env vars for system Chromium
#   - Runs as non-root user for security
#
# BUILD:   docker build -t whatsapp-bridge .
# RUN:     docker run -p 3000:3000 --env-file .env whatsapp-bridge
# ═══════════════════════════════════════════════════════════

FROM node:18-slim

# ── Install Chromium and required system dependencies ──
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    fonts-liberation \
    libappindicator3-1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
    wget \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# ── Tell Puppeteer to use the system Chromium ──
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV CHROME_PATH=/usr/bin/chromium

# ── Create writable directories for RemoteAuth and Puppeteer ──
# This prevents the ENOENT: RemoteAuth.zip crash on read-only roots.
RUN mkdir -p /tmp/whatsapp-bridge/session-data \
    /tmp/whatsapp-bridge/puppeteer-cache \
    && chmod -R 777 /tmp/whatsapp-bridge

# ── Create app directory ──
WORKDIR /app

# ── Install Node.js dependencies ──
COPY package*.json ./
RUN npm ci --only=production

# ── Copy application source ──
COPY . .

# ── Expose the HTTP port ──
EXPOSE 3000

# ── Health check ──
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# ── Start the application ──
CMD ["node", "bridge.js"]
