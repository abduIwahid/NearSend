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


## Offline mode (experimental)

NearSend now caches its app shell as a PWA after you visit it online. When both devices are offline, open the already-cached app on both devices, connect them to the same Wi-Fi or a phone hotspot (mobile data can be off), then use the **Offline connection** panel. Device 1 creates an offer code and shares it with Device 2; Device 2 pastes it into the other-device field and creates a reply code; Device 1 pastes the reply and connects. Exchange the text by a method available to you (for example, temporarily reconnecting to a local network or using a computer to transfer the text); no server is involved in the offline pairing itself. After connected, use **Choose files to send offline**.

**Limitations:** this is an experimental browser-only flow and has not been end-to-end tested across all browsers/devices. Both devices must be on a network that allows peer-to-peer local traffic. Some mobile browsers/networks may not expose usable local ICE candidates, and the current pairing uses no STUN/TURN servers. The connection text is large and manual copy/paste is used instead of QR. The receiver must keep the app open and accept the incoming file. Very large files may use substantial device memory because received chunks are assembled in memory. The app must be opened online once before going offline so its assets are cached.
