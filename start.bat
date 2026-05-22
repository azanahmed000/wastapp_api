@echo off
title WhatsApp API - AI Society
echo ============================================
echo   WhatsApp Onboarding API - AI Society
echo ============================================
echo.
echo Starting server...
echo.

set PUPPETEER_SKIP_DOWNLOAD=true

cd /d "h:\AI club\whatsapp-api"
node server.js

pause
