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



## Current scope
NearSend currently supports online device discovery, connection requests, QR invitation generation, and browser-based file transfer. Offline pairing is intentionally disabled. QR generation uses the `/api/qr` endpoint; make sure `api/qr.js` and the `qrcode` dependency are deployed together.


## File transfer size limits

The current browser transfer code does **not** define a fixed maximum file size. Files are sent over the WebRTC data channel in 16 KiB chunks. The receiver stores all received chunks in browser memory and then builds a `Blob`, so the practical maximum depends on the devices' available memory and browser behavior; very large files can fail, especially on phones.

The WebSocket relay is a fallback path, not the intended bulk-transfer path. The server currently accepts WebSocket messages up to 128 KiB, and the relay implementation forwards binary frames up to 64 KiB plus an 8-byte peer identifier. The current 16 KiB chunks fit within those relay frame checks. This is not a 64 KiB maximum file size because a file is split into many chunks.

Vercel's HTTP Function request/response payload limit of 4.5 MB applies to HTTP Function bodies, not to WebRTC data sent directly between browsers. Vercel WebSocket connections are supported, but connections are pinned to a function instance and future connections are not guaranteed to land on the same instance. This project currently keeps signaling rooms in process memory, so device discovery/pairing can fail when clients connect to different instances. For production reliability, move signaling/presence to shared infrastructure (for example Redis/pub-sub) and test across separate devices.

**Practical recommendation:** ordinary KB/MB files and a 100 MB target are reasonable to test, but 100 MB is not a guaranteed maximum. For reliable large-file support, implement disk-backed/streamed receiving where browser APIs permit it, add transfer integrity checks and resume support, and test on lower-memory mobile devices.
