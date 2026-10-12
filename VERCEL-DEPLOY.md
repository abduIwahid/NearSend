# NearSend on Vercel (experimental)

This package adapts NearSend's static frontend and HTTP endpoints to Vercel and routes signaling WebSockets through `/api/ws` using Vercel Functions' WebSocket beta.

## Deploy from GitHub on mobile

1. Upload these project files to a GitHub repository. `package.json`, `vercel.json`, `api/`, and `public/` must be at the repository root.
2. Import that repository into Vercel.
3. Keep Framework Preset as **Other**.
4. Set Build Command to **Override off / blank** (no build step is needed).
5. Set Output Directory to `public` if Vercel does not read it from `vercel.json`.
6. Set Install Command to `npm install` if it is not detected automatically.
7. Deploy.

## Important limitations

- Vercel WebSocket support is in public beta and connections close when the function reaches its maximum duration, so the client reconnects.
- Current signaling rooms are stored in process memory. Vercel does not guarantee that two different clients' WebSocket connections land on the same function instance. Therefore cross-device discovery may fail intermittently or entirely. This is a demo adaptation, not production-ready until signaling state and message routing are moved to shared infrastructure (for example Redis/pub-sub).
- WebRTC direct transfer may work once peers have successfully exchanged signaling messages. WebSocket relay fallback also depends on signaling routing and may not work across separate instances.
- The original standalone local mode remains available with `npm start` on a computer, but this Vercel adaptation is for online hosting.
- Test with two devices. Do not treat a successful Vercel build as proof that file transfers work.


## Preparing offline use
Visit the deployed site while online and wait for the service worker to install. Reopen the app once after deployment so the current app shell is cached. Offline transfer uses the **Offline connection** section and manual offer/reply copy-paste; it does not use Vercel for the peer connection. This is experimental and requires a local Wi-Fi/hotspot network that permits peer-to-peer traffic.
