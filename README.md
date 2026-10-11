# NearSend

Send files between nearby devices from a browser. Works online (hosted) or fully offline on a local network (hotspot/Wi-Fi, no internet).

## Docs

| File | Read it for |
|---|---|
| [PRD.md](PRD.md) | Purpose, scope, requirements, risks, milestones |
| [ARCHITECTURE.md](ARCHITECTURE.md) | System design, signaling + transfer protocols, server skeleton |
| [DESIGN.md](DESIGN.md) | Black/white UI tokens, layout, responsive rules, components |
| [BUILD_PLAN.md](BUILD_PLAN.md) | Step-by-step build with code and checklists |
| [TESTING.md](TESTING.md) | Test matrix, troubleshooting, release checklist |

## Quick start (no internet)

1. Connect all devices to the same Wi-Fi, or turn on one phone's hotspot.
2. On the host device: `npm install && npm start`
3. Others open the printed URL (e.g. `http://192.168.1.5:3000`) or scan the QR code.
4. Tap a device → choose a file → receiver accepts.

## Quick start (online)

Deploy to a Node host with WebSocket support, set `MODE=online` and `TRUST_PROXY=true`. Devices on the same public IP see each other automatically; use `?room=CODE` to pair across networks.

## Limits (by design of web browsers)

- Needs a shared network or the same server. Browsers can't discover devices over Bluetooth or Wi-Fi Direct.
- Offline mode means opening the **local server's address**, not the hosted site.
- Routers with client isolation block device-to-device traffic. Use a phone hotspot.
- Large receives on phones are limited by memory.
