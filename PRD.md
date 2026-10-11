# NearSend — Product Requirements Document

> "NearSend" is a placeholder name. Rename freely.
> Status: Draft v1 · Type: Full-stack web app (PWA + WebSocket signaling + WebRTC)

---

## 1. Summary

A simple website for sending files between nearby devices. Open the site on two devices, each sees the other in a device list, tap one, pick a file, and it transfers directly device-to-device.

It works in two modes with the same codebase:

| Mode | Internet | Who serves the site | How devices find each other |
|---|---|---|---|
| **Online** | Yes | Hosted server (your domain, HTTPS) | Devices behind the same public IP are grouped automatically; optional room code for other networks |
| **Offline (Local)** | No | One device on the Wi-Fi/hotspot runs the server | All devices open the host's `http://192.168.x.x:3000` and share one room |

Files never pass through the server in normal operation (WebRTC peer-to-peer). A server relay exists only as a fallback.

---

## 2. Problem

- Sending a file to a nearby phone/laptop usually means USB cables, messaging apps (compression, size caps, needs accounts), or cloud upload (needs internet, slow).
- AirDrop / Nearby Share are platform-locked.
- People need a cross-platform way that works with no internet and no installs.

## 3. Goals and success metrics

| Goal | Metric (target) |
|---|---|
| Fast to first transfer | Open site → file received in **≤ 30 s** for a first-time user |
| Works offline | Transfer completes on a phone hotspot with mobile data **off** |
| Reliable | **≥ 95%** of attempted transfers complete in LAN tests across supported browsers |
| Usable on any screen | No horizontal scroll or clipped controls from 320 px to 1920 px |
| Simple | No sign-up, no install, no config for the sender/receiver |

**Non-goals for v1:** accounts, cloud storage, chat, transfer history sync, native apps, Bluetooth/Wi-Fi Direct discovery.

## 4. Users

- **Student/colleague** moving documents between laptop and phone.
- **Group in a room** sharing photos or slides without internet.
- **Low-connectivity user** where data is expensive or unavailable.

## 5. Existing solutions and the gap

| Tool | Gap |
|---|---|
| AirDrop / Nearby Share | Platform-locked |
| Snapdrop / PairDrop | Need internet to reach the hosted site; not designed for offline LAN hosting |
| WhatsApp / Telegram | Accounts, compression, internet |
| Bluetooth | Slow, clunky pairing |

**Gap filled:** one codebase that runs hosted *or* self-hosted on a LAN with zero internet.

---

## 6. Scope

### In scope (v1)
- Device discovery list (devices connected to the same server/room)
- Auto-generated device name and type icon (phone / laptop / tablet)
- Send one or many files to a selected device
- Receiver accept / decline prompt
- Progress, speed, cancel
- Direct WebRTC transfer; WebSocket relay fallback
- Local server mode with printed IP + QR code
- Responsive UI (mobile + desktop)
- Installable PWA (hosted mode)

### Out of scope (v1)
- Folder transfer, resume after disconnect, end-to-end encrypted relay, accounts, history, text/clipboard sharing (candidate for v1.1)

### Hard platform limits (cannot be built in a pure web app)
- Discovering nearby devices with **no shared network** (Bluetooth / Wi-Fi Direct). Needs a native app.
- A page on `https://` cannot connect to `ws://192.168.x.x` (mixed content). Offline mode means opening the **local server's own address**, not the hosted site.
- Service workers (offline cache) need a secure context. `http://192.168.x.x` is not one, so PWA caching only helps on the hosted HTTPS origin. In local mode the server on the LAN serves the page anyway.

---

## 7. Tech stack

| Layer | Choice | Reason |
|---|---|---|
| Frontend | Vanilla HTML/CSS/JS (ES modules) | Simple, no build step, works on any host |
| Server | Node.js 18+ | One runtime for both modes |
| HTTP | `express` (static files + `/api/info`) | Minimal |
| Signaling | `ws` WebSocket | Lightweight, no extra protocol |
| Transfer | WebRTC `RTCDataChannel` | Direct P2P, no server bandwidth |
| Fallback | WebSocket binary relay | When WebRTC can't connect (AP isolation, strict NAT) |
| PWA | `manifest.json` + service worker | Installable, cached UI (hosted only) |
| Local QR | `qrcode` (npm) | Show join QR on host page/terminal |
| Hosting (online) | Any Node host with WebSocket + HTTPS (Render, Railway, VPS) | Needs persistent WS support. Static-only hosts won't work |

No database. All state is in server memory.

---

## 8. Functional requirements

### 8.1 Discovery
- **FR-1** On load, client opens a WebSocket and receives `{id, name, type}` assigned by the server.
- **FR-2** Server groups clients into a **room**:
  - Local mode: single room for everyone.
  - Online mode: room = hash of client's public IP (from `X-Forwarded-For`/socket). Optional manual room code to join across networks.
- **FR-3** Every client in a room sees a live list of the *other* devices. List updates on join/leave without refresh.
- **FR-4** User can rename their own device (stored in `localStorage`, optional).
- **FR-5** Empty state explains what to do ("Open this site on another device on the same network").

### 8.2 Connection
- **FR-6** Tapping a device opens a file picker (and drag-and-drop on desktop).
- **FR-7** Sender creates an `RTCPeerConnection` + data channel; offer/answer/ICE are relayed via the server.
- **FR-8** If the data channel is not open within **8 s**, automatically switch to relay fallback and show a small "Relay mode" badge.

### 8.3 Transfer
- **FR-9** Sender sends metadata first (name, size, type). Receiver sees a prompt: Accept / Decline.
- **FR-10** On accept, file is sent in **16 KiB chunks** with backpressure control.
- **FR-11** Both sides show progress %, transferred/total, and speed.
- **FR-12** Either side can cancel; the other side is notified and cleans up.
- **FR-13** Multiple files are queued and sent sequentially.
- **FR-14** Receiver gets a Download button (or auto-save where supported) and a completion state.
- **FR-15** Receiver verifies byte count equals declared size; mismatch shows an error.

### 8.4 Local mode extras
- **FR-16** On start, server prints all LAN IPv4 addresses and a terminal QR code.
- **FR-17** Host page shows "Share this address" with URL + QR (from `/api/info`).

### 8.5 PWA (hosted)
- **FR-18** Installable (manifest + icons). UI shell cached by service worker. Signaling still needs the server.

### User stories
1. As a user, I open the site and immediately see devices near me so I can send without typing anything.
2. As a receiver, I get a clear prompt before any file is accepted.
3. As a user with no internet, I join my friend's hotspot, scan a QR, and transfer files.
4. As a user on a phone, every button is reachable and readable without zooming.

---

## 9. Non-functional requirements

| Area | Requirement |
|---|---|
| Performance | LAN throughput ≥ 20 MB/s on Wi-Fi 5 laptop↔laptop (WebRTC); UI stays responsive during transfer |
| Page weight | < 150 KB total, no frameworks |
| Browsers | Latest 2 versions of Chrome, Edge, Firefox, Safari (iOS 15+), Samsung Internet |
| Responsive | 320 px → 1920 px, touch targets ≥ 44 px |
| Privacy | Server never stores or logs files, names, or contents; only in-memory device list |
| Security | See §12 |
| Accessibility | Keyboard navigable, visible focus, contrast ≥ 4.5:1, labels on all controls |
| Reliability | Server handles abrupt disconnects; stale peers removed within 30 s (ping/pong) |
| Limits | Max file size: bounded by device memory when saving via Blob (see Risks). Relay mode max message 64 KiB |

---

## 10. Data requirements

No persistent data. In-memory only:

```
Peer   { id: string(8), name: string, type: 'phone'|'tablet'|'laptop'|'desktop', room: string, ws: WebSocket, lastSeen: number }
Room   Map<roomId, Map<peerId, Peer>>
```

Client `localStorage`: `deviceName` (optional), `theme` (optional). Nothing else.

---

## 11. Integrations

- **STUN** (online mode only): `stun:stun.l.google.com:19302` (configurable). Not needed on LAN.
- **TURN** (optional, online mode): only if cross-network transfers are required. Relay fallback covers most cases, so skip TURN in v1.
- No other third-party APIs.

---

## 12. Security and privacy

- Receiver must **accept** every transfer. Nothing is auto-saved without consent.
- Validate every WebSocket message: JSON schema, max size (64 KiB text), `to` must be a peer in the sender's room.
- Rate limit connections per IP (e.g. 20/min) and messages per socket.
- Do not trust client-supplied `name`: strip to 24 chars, escape on render (`textContent`, never `innerHTML`).
- Sanitize incoming file names before download (strip path separators, control chars).
- Hosted mode: HTTPS/WSS only; security headers (`Content-Security-Policy`, `X-Content-Type-Options`, `Referrer-Policy`).
- Local mode: traffic is plain HTTP on a trusted LAN. Warn users not to use public Wi-Fi for local mode. Provide optional `mkcert` HTTPS instructions.
- Anyone on the same room sees your device name. Online mode: use IP grouping + optional room code, never a global list.

---

## 13. Milestones (solo dev, part-time estimate)

| # | Milestone | Output | Est. |
|---|---|---|---|
| M0 | Project setup | Repo, folder structure, `npm start` | 0.5 d |
| M1 | Signaling + discovery | WS server, rooms, live device list | 1–2 d |
| M2 | WebRTC connection | Offer/answer/ICE working between two tabs | 1–2 d |
| M3 | File transfer | Chunking, backpressure, accept/decline, progress | 2–3 d |
| M4 | Relay fallback | Binary relay over WS + auto-switch | 1–2 d |
| M5 | UI integration | Connect existing site to the client modules, responsive pass | 1–2 d |
| M6 | Local mode | LAN IP print, QR, `/api/info`, README | 1 d |
| M7 | PWA + hosting | Manifest, SW, deploy online version | 1 d |
| M8 | Testing + fixes | Device/browser matrix, bug fixes | 2–3 d |

Total ≈ 2–3 weeks part-time.

---

## 14. Risks and assumptions

| Risk | Impact | Mitigation |
|---|---|---|
| **AP / client isolation** on router or guest Wi-Fi blocks device-to-device | Direct connection impossible | Relay fallback only works if both can reach the *server*; recommend phone hotspot or non-isolated network. Show a clear error |
| **Chrome mDNS ICE candidates** (`xxxx.local`) fail on networks that block multicast | WebRTC fails on some LANs | 8 s timeout → relay fallback |
| **Large files in memory** (Blob) crash mobile browsers | Failed receive | Use File System Access API where available (desktop Chromium, secure context); otherwise warn above ~500 MB on mobile |
| **iOS Safari** limits (no File System Access, background tab suspension) | Interrupted transfers | Keep screen on (Wake Lock where supported), show "keep this tab open" notice |
| Hosted page cannot talk to LAN server (mixed content) | User confusion | Explain in UI: "Offline? open the address shown on the host device" |
| Static hosts (Netlify/Vercel static) lack WebSockets | Online mode won't work | Use a Node-capable host |
| Firewall on host blocks port 3000 | Others can't connect | README checklist |

**Assumptions:** the existing frontend (HTML/CSS) is reusable; all devices have a modern browser; at least one device can host (laptop, or phone via Termux).

---

## 15. Deployment and maintenance

- **Online:** deploy `server/` + `public/` to a Node host with WSS. Set `PORT`, `STUN_URL` env vars. Monitor uptime only; no data to back up.
- **Local:** `git clone` → `npm install` → `npm start`. Share the printed URL/QR.
- Maintenance: update `ws`/`express` dependencies quarterly; re-test on new browser releases.

## 16. Future enhancements
- Send text / clipboard
- Folder transfer (zip on the fly)
- Resume interrupted transfers
- Room codes with PIN for cross-network sharing
- Optional TURN for strict NATs
- Native wrapper (Capacitor) with Nearby Connections for true no-network discovery
- Dark theme toggle

## 17. Glossary

| Term | Meaning |
|---|---|
| **Signaling** | Exchanging connection info (offer/answer/ICE) through a server so two browsers can connect |
| **WebRTC** | Browser API for direct peer-to-peer connections |
| **DataChannel** | WebRTC channel for arbitrary data (files) |
| **STUN / TURN** | Helpers for connecting across NAT (STUN finds your public address, TURN relays traffic) |
| **ICE** | Process of finding the best network path between peers |
| **LAN** | Local network (same Wi-Fi/hotspot) |
| **AP isolation** | Router setting that stops Wi-Fi clients from talking to each other |
| **PWA** | Website installable like an app, with cached assets |
