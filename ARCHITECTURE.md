# NearSend — Architecture and Protocols

## 1. System overview

```
 Device A (browser)                         Device B (browser)
   UI ── client modules                       UI ── client modules
    │  ▲                                       │  ▲
    │  │ WebSocket (signaling + peer list)     │  │
    ▼  │                                       ▼  │
 ┌───────────────────────────────────────────────────┐
 │  Node server  (express + ws)                      │
 │   • serves static site                            │
 │   • rooms + peer list                             │
 │   • forwards offer / answer / ice                 │
 │   • (fallback) relays binary file frames          │
 └───────────────────────────────────────────────────┘

 Device A ◄════════ WebRTC DataChannel (file bytes) ════════► Device B
                    direct, server not involved
```

## 2. Deployment modes

| | Online | Local (offline) |
|---|---|---|
| Server runs on | Cloud host | A laptop/phone on the same Wi-Fi/hotspot |
| URL | `https://yourdomain` | `http://<host-lan-ip>:3000` |
| Signaling | `wss://` | `ws://` (same origin as page) |
| Room | Hash of public IP (+ optional code) | Single room `local` |
| STUN | Yes | Not needed |
| Service worker | Works (HTTPS) | Not available (HTTP) |

**Mode detection (server):** env `MODE=online|local`. Default `local`.
**Client:** always connects to `location.host` using `ws://` or `wss://` matching `location.protocol`. No hardcoded URLs, so the same build works in both modes.

## 3. Folder structure

```
nearsend/
├─ package.json
├─ server/
│  ├─ index.js          # express + ws bootstrap, env, LAN IP/QR print
│  ├─ rooms.js          # Room/Peer registry
│  ├─ signaling.js      # WS message handling + validation
│  └─ util.js           # id/name generation, ip helpers, rate limit
└─ public/
   ├─ index.html
   ├─ manifest.json
   ├─ sw.js             # hosted mode only
   ├─ css/style.css
   ├─ icons/
   └─ js/
      ├─ app.js         # bootstraps, wires UI to modules
      ├─ ui.js          # DOM rendering (device list, dialogs, progress)
      ├─ signaling.js   # WS client, reconnect
      ├─ peer.js        # RTCPeerConnection per remote device
      ├─ transfer.js    # chunking, backpressure, receive/save
      └─ relay.js       # fallback transfer through WS
```

## 4. Server design

### 4.1 State
```js
rooms: Map<string, Map<string, Peer>>
Peer: { id, name, type, room, ws, lastSeen }
```

### 4.2 Connection flow
1. HTTP upgrade → `ws` connection.
2. Determine `room`: `local` (local mode) or `hash(ip)` (+ `?room=CODE` override) in online mode.
3. Generate `id` (8 chars, `[a-z0-9]`), `name` (e.g. "Grey Panda"), `type` from `User-Agent`.
4. Send `hello`, then broadcast `peers` to the room.
5. Heartbeat: server pings every 15 s; terminate if no pong within 30 s.
6. On close: remove peer, broadcast `peers`.

### 4.3 HTTP endpoints
| Route | Purpose |
|---|---|
| `GET /` and static | Serves `public/` |
| `GET /api/info` | `{ mode, urls: ["http://192.168.1.5:3000"], stun }` for the Share-address box |
| `GET /healthz` | `200 ok` for hosting health checks |

## 5. Signaling protocol (WebSocket, text = JSON)

**Server → client**

| type | Payload | When |
|---|---|---|
| `hello` | `{ id, name, deviceType, stun }` | right after connect |
| `peers` | `{ list: [{id, name, deviceType}] }` | any join/leave/rename (excludes self) |
| `signal` | `{ from, kind: "offer"\|"answer"\|"ice", data }` | forwarded from another peer |
| `error` | `{ code, message }` | validation/rate-limit |

**Client → server**

| type | Payload |
|---|---|
| `signal` | `{ to, kind, data }` |
| `rename` | `{ name }` |
| `pong` | `{}` (reply to ping, or use WS native ping) |

**Validation rules:** `to` must exist in the sender's room; message ≤ 64 KiB; unknown `type` ignored; `name` trimmed to 24 chars.

## 6. WebRTC connection flow

```
Sender A                    Server                     Receiver B
   │ createPeerConnection     │                            │
   │ createDataChannel("f")   │                            │
   │ createOffer              │                            │
   │── signal(offer, to=B) ──►│── signal(offer, from=A) ──►│
   │                          │                            │ setRemote, createAnswer
   │◄─ signal(answer, B) ─────│◄─ signal(answer, to=A) ────│
   │◄══════ ice candidates both directions via server ═════►│
   │══════════ DataChannel "open" ═════════════════════════│
```

- `iceServers`: `[]` in local mode, `[{urls: STUN}]` online (from `hello.stun`).
- DataChannel options: `{ ordered: true }` (reliable). Set `binaryType = "arraybuffer"`.
- **Timeout:** if not `open` after 8 s → close PC and use relay (§8).
- Buffer incoming ICE candidates until remote description is set.
- One `RTCPeerConnection` per remote peer; close it when the transfer queue finishes or on cancel.

## 7. File transfer protocol (over the DataChannel)

Control messages are JSON strings; file data are binary `ArrayBuffer` chunks.

| Direction | Message | Meaning |
|---|---|---|
| S→R | `{t:"meta", tid, name, size, mime, index, total}` | Offer a file (index/total for multi-file) |
| R→S | `{t:"accept", tid}` / `{t:"reject", tid}` | User decision |
| S→R | *binary chunks* (16 384 bytes) | File data in order |
| S→R | `{t:"end", tid}` | All bytes sent |
| R→S | `{t:"done", tid, received}` | Receiver confirms byte count |
| either | `{t:"cancel", tid}` | Abort |

`tid` = random 8-char transfer id.

### 7.1 Sender loop (with backpressure)
```js
const CHUNK = 16 * 1024;
const HIGH = 1 * 1024 * 1024;     // pause above 1 MB buffered
channel.bufferedAmountLowThreshold = 256 * 1024;

async function sendFile(file, channel) {
  let offset = 0;
  while (offset < file.size) {
    if (channel.bufferedAmount > HIGH) {
      await new Promise(r => channel.addEventListener('bufferedamountlow', r, { once: true }));
    }
    const buf = await file.slice(offset, offset + CHUNK).arrayBuffer();
    channel.send(buf);
    offset += buf.byteLength;
    updateProgress(offset, file.size);
  }
  channel.send(JSON.stringify({ t: 'end', tid }));
}
```

### 7.2 Receiver saving strategy
| Condition | Strategy |
|---|---|
| `showSaveFilePicker` available (desktop Chromium, secure context) | Stream chunks straight to disk, so there's no memory limit |
| Otherwise | Collect chunks in an array → `new Blob(chunks)` → `<a download>` |

On the Blob path, show a warning for files above ~500 MB on mobile.

### 7.3 Progress and speed
- Progress = bytes done / size. Speed = rolling average over last 1 s.
- Update the DOM at most every 100 ms (`requestAnimationFrame` throttle).

### 7.4 Receiver checks
- `received === size` on `end`, otherwise show an error and send `cancel`.
- Sanitize `name`: remove `/ \ : * ? " < > |` and control chars; max 120 chars.

## 8. Relay fallback (WebSocket)

Used when the DataChannel does not open in 8 s, or errors mid-transfer before start.

- Same control messages (§7) but wrapped: `{type:"relay", to, payload}` for JSON.
- Binary frames: `[8-byte ASCII target id][chunk bytes]`. Server swaps the first 8 bytes to the **sender id** and forwards.
- Chunk size 32 KiB; use `ws.bufferedAmount` for backpressure (same loop as §7.1).
- Server never stores data; it pipes frames and drops them if the target is gone.
- UI shows a "Relay" badge. Speed will be lower and consumes host bandwidth.
- Both devices must reach the **server**; this fixes WebRTC/mDNS problems but **not** AP isolation between the device and router itself.

## 9. Client state machine (per transfer)

```
IDLE ─select file→ CONNECTING ─open→ AWAITING_ACCEPT ─accept→ SENDING ─done→ COMPLETE
                      │                   │                       │
                      └─timeout→ RELAY    └─reject→ DECLINED      └─cancel/error→ FAILED
```

Receiver: `IDLE → PROMPT → RECEIVING → COMPLETE | FAILED | DECLINED`.

## 10. Reconnection
- WS drops → retry with backoff 1 s, 2 s, 4 s … max 10 s. Show "Reconnecting…".
- On reconnect the server assigns a new `id`; the client re-renders the list. Active transfers fail with a clear message (no resume in v1).

## 11. Device naming and type
- Name: `<Adjective> <Animal>` from small lists (e.g. "Grey Panda"). Kept simple and neutral.
- Type from `navigator.userAgent` (server-side parse of the upgrade request): `phone`, `tablet`, `laptop/desktop`.

## 12. PWA
- `manifest.json`: name, short_name, `display: standalone`, `background_color: #ffffff`, `theme_color: #111111`, 192/512 px icons.
- `sw.js`: cache-first for `/`, `/css/*`, `/js/*`, `/icons/*`. **Never cache** `/api/*` or WebSocket. Register only when `location.protocol === 'https:'` or hostname is `localhost`.
- Bump a `CACHE_VERSION` constant on every release.

## 13. Local-mode helpers (server startup output)
```
NearSend running (local mode)
  http://192.168.1.5:3000
  http://10.42.0.1:3000
[terminal QR code]
```
- Enumerate `os.networkInterfaces()`, keep IPv4, non-internal.
- Prefer showing private ranges (`192.168.*`, `10.*`, `172.16–31.*`).

## 14. Environment variables
| Var | Default | Use |
|---|---|---|
| `PORT` | `3000` | HTTP/WS port |
| `MODE` | `local` | `local` or `online` |
| `STUN_URL` | `stun:stun.l.google.com:19302` | Online mode ICE |
| `TRUST_PROXY` | `false` | Set `true` behind a reverse proxy to read `X-Forwarded-For` |

## 15. Server skeleton

```js
// server/index.js
const http = require('http');
const express = require('express');
const { WebSocketServer } = require('ws');
const { attach } = require('./signaling');
const { lanUrls } = require('./util');

const PORT = process.env.PORT || 3000;
const MODE = process.env.MODE || 'local';

const app = express();
app.use(express.static('public'));
app.get('/healthz', (_, res) => res.send('ok'));
app.get('/api/info', (req, res) =>
  res.json({ mode: MODE, urls: lanUrls(PORT), stun: process.env.STUN_URL || null }));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, maxPayload: 128 * 1024 });
attach(wss, { mode: MODE });

server.listen(PORT, '0.0.0.0', () => {
  console.log(`NearSend running (${MODE} mode)`);
  lanUrls(PORT).forEach(u => console.log('  ' + u));
});
```
