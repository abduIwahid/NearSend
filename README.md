# NearSend

NearSend is a browser-based file-sharing app for nearby devices. Open it on two devices, select a device, choose one or more files, and accept the incoming transfer on the receiving device.

- **Direct transfer:** WebRTC DataChannel keeps file bytes off the server when a direct connection succeeds.
- **Fallback:** WebSocket relay is used if direct connection setup times out.
- **Local mode:** Runs on a Wi-Fi network or phone hotspot without internet.
- **Online mode:** Can be deployed to a Node host with WebSocket support.
- No account and no database. Device lists are in memory; files are not written to the server.

## Requirements

- Node.js 18 or newer
- Two devices/browsers for real transfer testing

## Quick start (local / no internet)

1. Extract this folder on a laptop or Android phone running Termux.
2. Connect both devices to the same Wi-Fi or turn on a phone hotspot.
3. In this folder run:

   ```bash
   npm install
   npm start
   ```

4. Open one of the printed `http://...:3000` addresses on the other device, or scan the terminal QR code.
5. Leave the host terminal and browser tabs open during transfer.
6. Tap the receiving device card on the sender, choose files, then accept on the receiver.

If no LAN URL is printed, open `http://localhost:3000` on the host and check your network settings. On Windows, allow Node.js through the firewall on **Private networks**. Guest Wi-Fi may block device-to-device communication; a phone hotspot is a good test.

## Online deployment

Deploy the entire project to a Node host that supports persistent WebSocket connections. Set:

```text
MODE=online
TRUST_PROXY=true
```

Set `PORT` if the host requires it. Use HTTPS at the public edge so the browser connects over WSS. Static-only hosting (including a plain static Vercel deployment) is not sufficient for the signaling server. For cross-network pairing, append `?room=YOURCODE` to the URL on both devices. Use a non-obvious room code; room codes are not passwords.

## Useful commands

```bash
npm start
npm run dev
```

- `GET /healthz` — health check
- `GET /api/info` — mode and local URLs
- `GET /api/qr?text=http%3A%2F%2F192.168.1.5%3A3000` — QR data URL

## Limitations and honest notes

- Device discovery means devices connected to the same NearSend server/room; the browser cannot discover arbitrary devices via Bluetooth or Wi-Fi Direct.
- Local HTTP mode is intended for a trusted network. Avoid public/shared Wi-Fi for private files.
- A hosted HTTPS page cannot connect to a LAN server over insecure WebSocket. To work offline, open the local server address directly.
- WebRTC connectivity varies by network. The relay fallback can help only if both devices can reach the same server; it is slower and consumes server bandwidth.
- Without the File System Access API, received file contents are buffered in browser memory before the user saves them. Very large files may exhaust mobile memory.
- Transfers are not resumable if a device disconnects. Keep both tabs open and in the foreground, especially on iOS.
- The included checklist describes planned tests; the app has not been verified across every browser/device combination. Test with non-sensitive files before relying on it.

## Security

Incoming files require explicit acceptance. File names are sanitized before download and rendered as text. The server does not intentionally store file data. Local mode is plain HTTP, so devices on the same network may be able to observe traffic. For sensitive use, configure trusted HTTPS and review the security model before deployment.

## Project documents

- `PRD.md` — requirements and scope
- `ARCHITECTURE.md` — protocol and system design
- `DESIGN.md` — interface specification
- `BUILD_PLAN.md` — build checklist
- `TESTING.md` — manual test matrix and troubleshooting
