# NearSend

NearSend is a browser-based file-sharing app designed to move files between devices without creating an account or uploading files to a cloud-storage service. It includes device discovery, pairing requests, QR invitations, transfer progress, and a responsive interface for phones, tablets, and desktop browsers.

## Features

- Browser-to-browser file transfer using WebRTC data channels when a direct connection can be established.
- WebSocket signaling for device discovery and connection negotiation.
- QR invitation generation and QR scanning through the camera, with image-upload fallback.
- Transfer acceptance/decline prompts, progress indicators, and cancellation.
- Add-to-home-screen metadata and app icons.
- Responsive layouts for narrow phones through desktop screens.

## Run locally

Requirements: Node.js 18 or newer and npm.

```bash
npm install
npm start
```

Open the local address printed by the server. For another device on the same Wi-Fi, use the computer's LAN IP address and ensure the firewall allows the server port. Camera access generally requires HTTPS or localhost; a plain HTTP LAN address may prevent browser camera APIs from working.

For development with automatic restart:

```bash
npm run dev
```

## Deploy

Vercel configuration is included. Review [VERCEL-DEPLOY.md](VERCEL-DEPLOY.md) and [DEPLOY-AND-TEST.md](DEPLOY-AND-TEST.md) before deploying. The Vercel WebSocket/signaling implementation has platform constraints; test device discovery and transfers on the deployed URL instead of assuming that local behavior proves production behavior.

## Production configuration

Environment variables understood by the standalone server and the Vercel functions:

| Variable | Purpose |
| --- | --- |
| `STUN_URL` | STUN server URL (default: Google's public STUN). |
| `TURN_URL` | TURN server URL, e.g. `turn:host:3478`. Strongly recommended: without TURN, direct connections fail on many networks and transfers fall back to the slower server relay. |
| `TURN_USERNAME` / `TURN_CREDENTIAL` | Credentials for the TURN server. |
| `SIGNAL_WS_URL` | Full WebSocket URL of a separately hosted signaling server, e.g. `wss://signaling.example.com/api/ws`. When set on the web deployment, the app connects there instead of the same-origin `/api/ws`. This is the reliable production setup, because signaling rooms are held in memory (see VERCEL-DEPLOY.md). Host the standalone server anywhere Node runs (Render, Railway, Fly.io, a VPS) with `MODE=online`. |
| `MODE` | Standalone server mode: `online` or `local` (default `local`). |
| `PORT` | Standalone server port (default `3000`). |

## QR scanner compatibility

The scanner uses `jsQR` loaded from jsDelivr to support browsers such as iOS Safari that do not implement the native `BarcodeDetector` API. Camera access still depends on browser permission and a secure context (HTTPS or localhost). If the camera cannot be opened, the scanner offers QR-image selection.

## Project structure

```text
.
├── api/                 # Vercel serverless endpoints (QR, WebSocket, info)
├── public/
│   ├── css/             # Application and legal-page styles
│   ├── icons/           # Favicon, PWA icons, and source logo
│   ├── js/              # UI, signaling, peer connection, transfer logic
│   ├── index.html       # Main application
│   ├── manifest.json    # Installable web-app metadata
│   └── ...              # Privacy, terms, and 404 pages
├── server/              # Local Node.js server and signaling implementation
├── .gitignore
├── package.json
└── vercel.json
```

## GitHub hygiene

Commit the source code, documentation, `package.json`, deployment configuration, and public assets. Do not commit `node_modules`, local `.env` files, editor folders, logs, or build/test artifacts. Never put API secrets or credentials in files served from `public/`.

## Before sharing publicly

- Test on iOS Safari and at least one Android browser at narrow widths (320–430 px), plus a laptop/desktop.
- Test camera permission denied, QR scanning, QR-image fallback, pairing acceptance/decline, and small and large file transfers.
- Test both devices on the deployed HTTPS URL and on different networks.
- Remember that direct WebRTC connectivity can fail across some network/NAT configurations; this is not guaranteed to work merely because two devices are nearby. Verify actual transfer behavior on the target deployment.


## Latest mobile fixes

- The header now keeps the NearSend logo/name aligned to the left and the device name/control aligned to the right, with compact spacing on narrow screens.
- Runtime error notices now display a useful error message and avoid repeating the same message over and over.
- Device-list messages are validated before rendering so an unexpected signaling payload does not crash the UI.
- Cache-busting references were updated for the latest CSS and JavaScript.

**Deployment note:** A successful Vercel deployment confirms that the build/deployment completed; it does not guarantee reliable multi-device discovery. The current WebSocket signaling implementation keeps its room registry in memory, which can be unreliable across separate serverless function instances. If devices still cannot discover each other after these frontend fixes, the signaling service needs a shared presence store or a persistent WebSocket host.
