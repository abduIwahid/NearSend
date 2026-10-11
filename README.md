# NearSend

Browser-based file sharing using WebRTC, with signaling and relay over WebSockets.

## Local Node.js mode

Run `npm install` then `npm start` on a computer. Open the URL printed in the terminal on both devices on the same network.

## Vercel adaptation

See [`VERCEL-DEPLOY.md`](VERCEL-DEPLOY.md). This is an experimental adaptation for Vercel's WebSocket beta. The in-memory signaling state is not shared between function instances, so reliable online discovery requires a shared Redis/pub-sub layer and must be tested before production use.

## Features

- WebRTC data-channel direct file transfer
- WebSocket signaling and relay fallback
- Multiple files and transfer progress
- Device rename and QR support
- PWA basics
