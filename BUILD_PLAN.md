# NearSend — Build Plan

Follow in order. Each step ends with a **check** so you know it works before moving on. Your existing site becomes `public/`; you only add the JS modules and wire IDs/classes.

## 0. Prerequisites
- Node.js 18+ (`node -v`)
- Two devices or two browser windows for testing
- Git (optional)

## 1. Setup (M0)
```bash
mkdir nearsend && cd nearsend
npm init -y
npm i express ws qrcode-terminal
mkdir -p server public/js public/css public/icons
```
`package.json` scripts:
```json
"scripts": {
  "start": "node server/index.js",
  "dev": "node --watch server/index.js"
}
```
Move your finished site into `public/` (`index.html`, `css/style.css`).

**Check:** `npm start` serves your page at `http://localhost:3000`.

## 2. Server: rooms + signaling (M1)

`server/util.js`
```js
const os = require('os');
const crypto = require('crypto');

const ADJ = ['Grey','Quiet','Swift','Calm','Bright','Plain','Steady','Silver'];
const ANI = ['Panda','Fox','Heron','Otter','Falcon','Lynx','Badger','Crane'];

const pick = a => a[Math.floor(Math.random() * a.length)];
exports.randomName = () => `${pick(ADJ)} ${pick(ANI)}`;
exports.randomId = () => crypto.randomBytes(6).toString('base64url').slice(0, 8).toLowerCase().replace(/[^a-z0-9]/g, 'x');

exports.deviceType = ua => {
  ua = (ua || '').toLowerCase();
  if (/ipad|tablet/.test(ua)) return 'tablet';
  if (/mobi|android|iphone/.test(ua)) return 'phone';
  return 'laptop';
};

exports.lanUrls = port => {
  const out = [];
  for (const list of Object.values(os.networkInterfaces()))
    for (const i of list || [])
      if (i.family === 'IPv4' && !i.internal) out.push(`http://${i.address}:${port}`);
  return out;
};

exports.roomFor = (req, mode, code) => {
  if (code) return 'c:' + String(code).slice(0, 12).toLowerCase();
  if (mode === 'local') return 'local';
  const ip = (process.env.TRUST_PROXY === 'true' && req.headers['x-forwarded-for'])
    ? req.headers['x-forwarded-for'].split(',')[0].trim()
    : req.socket.remoteAddress;
  return 'ip:' + crypto.createHash('sha256').update(ip).digest('hex').slice(0, 16);
};
```

`server/signaling.js`
```js
const { randomId, randomName, deviceType, roomFor } = require('./util');
const rooms = new Map(); // roomId -> Map(peerId -> peer)

function broadcast(room) {
  const peers = rooms.get(room);
  if (!peers) return;
  for (const p of peers.values()) {
    const list = [...peers.values()]
      .filter(o => o.id !== p.id)
      .map(o => ({ id: o.id, name: o.name, deviceType: o.type }));
    send(p.ws, { type: 'peers', list });
  }
}
const send = (ws, obj) => ws.readyState === 1 && ws.send(JSON.stringify(obj));

exports.attach = (wss, { mode }) => {
  wss.on('connection', (ws, req) => {
    const url = new URL(req.url, 'http://x');
    const room = roomFor(req, mode, url.searchParams.get('room'));
    const peer = { id: randomId(), name: randomName(), type: deviceType(req.headers['user-agent']), room, ws, alive: true };

    if (!rooms.has(room)) rooms.set(room, new Map());
    rooms.get(room).set(peer.id, peer);

    send(ws, { type: 'hello', id: peer.id, name: peer.name, deviceType: peer.type, stun: mode === 'online' ? (process.env.STUN_URL || 'stun:stun.l.google.com:19302') : null });
    broadcast(room);

    ws.on('pong', () => (peer.alive = true));

    ws.on('message', (data, isBinary) => {
      const peers = rooms.get(room);
      if (isBinary) {                       // relay fallback: [8-byte target id][payload]
        const target = peers.get(data.subarray(0, 8).toString());
        if (target) target.ws.send(Buffer.concat([Buffer.from(peer.id), data.subarray(8)]), { binary: true });
        return;
      }
      if (data.length > 65536) return;
      let msg; try { msg = JSON.parse(data); } catch { return; }

      if (msg.type === 'signal' || msg.type === 'relay') {
        const target = peers.get(msg.to);
        if (target) send(target.ws, { ...msg, to: undefined, from: peer.id });
      } else if (msg.type === 'rename' && typeof msg.name === 'string') {
        peer.name = msg.name.trim().slice(0, 24) || peer.name;
        broadcast(room);
      }
    });

    ws.on('close', () => {
      const peers = rooms.get(room);
      peers?.delete(peer.id);
      if (peers && peers.size === 0) rooms.delete(room);
      else broadcast(room);
    });
  });

  // heartbeat
  setInterval(() => {
    for (const peers of rooms.values())
      for (const p of peers.values()) {
        if (!p.alive) { p.ws.terminate(); continue; }
        p.alive = false; p.ws.ping();
      }
  }, 15000);
};
```
Use the `server/index.js` skeleton from ARCHITECTURE.md §15 (add the terminal QR with `qrcode-terminal` for each LAN URL).

**Check:** open the site in two tabs, log the `peers` message in the console. Each tab lists the other.

## 3. Client: signaling + device list (M1/M5)

`public/js/signaling.js`
```js
export function connect({ onHello, onPeers, onSignal, onRelay, onBinary, onStatus }) {
  let ws, retry = 1000;
  const room = new URLSearchParams(location.search).get('room');

  function open() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${proto}://${location.host}/${room ? '?room=' + encodeURIComponent(room) : ''}`);
    ws.binaryType = 'arraybuffer';
    ws.onopen = () => { retry = 1000; onStatus('connected'); };
    ws.onmessage = e => {
      if (typeof e.data !== 'string') return onBinary(e.data);
      const m = JSON.parse(e.data);
      ({ hello: onHello, peers: onPeers, signal: onSignal, relay: onRelay })[m.type]?.(m);
    };
    ws.onclose = () => { onStatus('reconnecting'); setTimeout(open, retry); retry = Math.min(retry * 2, 10000); };
  }
  open();
  return {
    send: obj => ws.readyState === 1 && ws.send(JSON.stringify(obj)),
    sendBinary: buf => ws.readyState === 1 && ws.send(buf),
    get buffered() { return ws.bufferedAmount; }
  };
}
```

`ui.js` renders `peers.list` into device cards (use `textContent` for names). Wire each card's click to `app.js → pickFiles(peerId)`.

**Check:** device cards appear/disappear live when you open/close a second tab.

## 4. Client: WebRTC peer (M2)

`public/js/peer.js`
```js
export function createPeer({ remoteId, stun, signalSend, initiator, onChannel }) {
  const pc = new RTCPeerConnection({ iceServers: stun ? [{ urls: stun }] : [] });
  const pending = [];
  let remoteSet = false;

  pc.onicecandidate = e => e.candidate && signalSend({ to: remoteId, kind: 'ice', data: e.candidate });
  pc.ondatachannel = e => onChannel(e.channel);

  async function handle({ kind, data }) {
    if (kind === 'offer') {
      await pc.setRemoteDescription(data); remoteSet = true;
      pending.splice(0).forEach(c => pc.addIceCandidate(c));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      signalSend({ to: remoteId, kind: 'answer', data: pc.localDescription });
    } else if (kind === 'answer') {
      await pc.setRemoteDescription(data); remoteSet = true;
      pending.splice(0).forEach(c => pc.addIceCandidate(c));
    } else if (kind === 'ice') {
      remoteSet ? pc.addIceCandidate(data) : pending.push(data);
    }
  }

  async function start() {              // sender side
    const ch = pc.createDataChannel('f', { ordered: true });
    ch.binaryType = 'arraybuffer';
    onChannel(ch);
    await pc.setLocalDescription(await pc.createOffer());
    signalSend({ to: remoteId, kind: 'offer', data: pc.localDescription });
  }

  return { pc, handle, start, close: () => pc.close() };
}
```
Use `signalSend = m => sig.send({ type: 'signal', ...m })`.

**Check:** log `channel.onopen` between two tabs. Send a test string both ways.

## 5. Client: file transfer (M3)

Implement `transfer.js` exactly per ARCHITECTURE.md §7:
1. `sendFiles(files, channel)`: for each file send `meta`, wait for `accept`/`reject`, run the chunk loop, send `end`, wait for `done`.
2. `onChannelMessage`: string → parse control; `ArrayBuffer` → append chunk to the active receive.
3. Receiver saving: `showSaveFilePicker` if available, otherwise Blob + `<a download>`.
4. Progress callbacks → `ui.updateTransfer(tid, {bytes, size, speed, state})`.

**Check:** send 1 KB, 50 MB, 500 MB files between two tabs. Compare SHA-256 (`sha256sum` or `Get-FileHash`).

## 6. Relay fallback (M4)
- In `app.js`, start a timer when connecting. If the channel isn't open after 8 s → `peer.close()` and run `relay.js` with the same transfer logic but a transport object:
```js
// transport interface used by transfer.js
{ send(data), get buffered(), onmessage(cb), waitDrain() }
```
- DataChannel transport and WebSocket relay transport both implement this interface, so `transfer.js` is written once.
- Relay frames: control JSON as `{type:'relay', to, payload}`; chunks as `[8-byte target id][bytes]`. Incoming binary frames start with the **sender id** (the server swaps it).

**Check:** test by blocking WebRTC (disable via `chrome://flags` → "Anonymize local IPs…" off won't help; simplest is to force the timeout in code with a debug flag `?relay=1`).

## 7. UI integration + responsive (M5)
Follow DESIGN.md. Checklist:
- [ ] Tokens in `:root`
- [ ] Device grid + empty state
- [ ] Receive dialog (modal desktop, bottom sheet < 480 px)
- [ ] Transfer rows with progress
- [ ] Share box fed by `GET /api/info` (hide if `mode !== 'local'`)
- [ ] Toasts
- [ ] Test at 320 / 375 / 768 / 1024 / 1440 px

## 8. PWA (M7, hosted only)
`manifest.json`
```json
{
  "name": "NearSend",
  "short_name": "NearSend",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#111111",
  "icons": [
    { "src": "/icons/192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```
`sw.js`
```js
const V = 'v1';
const ASSETS = ['/', '/css/style.css', '/js/app.js', '/js/ui.js', '/js/signaling.js', '/js/peer.js', '/js/transfer.js', '/js/relay.js'];
self.addEventListener('install', e => e.waitUntil(caches.open(V).then(c => c.addAll(ASSETS))));
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(keys => Promise.all(keys.filter(k => k !== V).map(k => caches.delete(k))))));
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (u.pathname.startsWith('/api/')) return;
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
```
Register in `app.js` only if `'serviceWorker' in navigator && location.protocol === 'https:'`.

## 9. Local-mode packaging (M6)
- README "Quick start (no internet)":
  1. Turn on hotspot or join the same Wi-Fi.
  2. `npm start` on the host.
  3. Others open the printed URL or scan the QR.
- Windows firewall: allow Node.js on **Private** networks (prompt on first run) or `netsh advfirewall firewall add rule name="NearSend" dir=in action=allow protocol=TCP localport=3000`.
- Phone as host: install Termux → `pkg install nodejs git` → clone → `npm i` → `npm start`.
- Optional HTTPS on LAN: `mkcert -install && mkcert 192.168.1.5`, then pass cert/key to `https.createServer`.

## 10. Deploy online (M7)
1. Push to GitHub.
2. Create a web service on a Node host with WebSocket support (Render, Railway, Fly.io, or a VPS behind Nginx/Caddy).
3. Set env: `MODE=online`, `TRUST_PROXY=true`, `PORT` (if required).
4. Start command: `npm start`. Health check: `/healthz`.
5. Confirm `wss://` works and two devices on the same network see each other.

Nginx WebSocket snippet:
```nginx
location / {
  proxy_pass http://127.0.0.1:3000;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_set_header X-Forwarded-For $remote_addr;
  proxy_read_timeout 3600s;
}
```

## 11. Task checklist

**Server**
- [ ] Express static + `/api/info` + `/healthz`
- [ ] WS rooms, hello/peers/signal/relay
- [ ] Heartbeat + cleanup
- [ ] Message size limit, rate limit per IP
- [ ] LAN URL + QR in terminal
- [ ] Security headers

**Client**
- [ ] WS client with reconnect
- [ ] Device list render + rename
- [ ] RTCPeerConnection + DataChannel
- [ ] Transfer protocol (meta/accept/chunks/end/done/cancel)
- [ ] Backpressure
- [ ] Save (File System Access + Blob fallback)
- [ ] Receive dialog
- [ ] Progress, speed, cancel
- [ ] 8 s timeout → relay
- [ ] Multi-file queue
- [ ] Wake Lock while transferring (`navigator.wakeLock?.request('screen')`)
- [ ] Filename sanitizing, `textContent` everywhere

**UI / UX**
- [ ] Tokens + monochrome theme
- [ ] Responsive at all breakpoints
- [ ] Empty/error/relay states
- [ ] Accessibility checklist (DESIGN.md §7)

**Release**
- [ ] README
- [ ] PWA assets
- [ ] Online deploy
- [ ] Test matrix (TESTING.md)
