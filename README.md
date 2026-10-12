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
