# NearSend — Testing and Troubleshooting

## 1. Test matrix

| Sender → Receiver | Chrome | Edge | Firefox | Safari (iOS) | Samsung Internet |
|---|---|---|---|---|---|
| Windows laptop → Android phone | ☐ | ☐ | ☐ | n/a | ☐ |
| Android → Windows | ☐ | ☐ | ☐ | n/a | ☐ |
| iPhone → Windows | ☐ | ☐ | ☐ | ☐ | n/a |
| Windows → iPhone | ☐ | ☐ | ☐ | ☐ | n/a |
| Laptop → Laptop | ☐ | ☐ | ☐ | n/a | n/a |

Run each row in **both** modes: online (hosted) and local (hotspot, mobile data off).

## 2. Functional tests

| ID | Test | Expected |
|---|---|---|
| T1 | Open site on A, then B | Each sees the other within 1 s |
| T2 | Close tab on B | A's list updates within ~1 s (up to 30 s on abrupt network loss) |
| T3 | A sends 1 KB text file | B prompted, accepts, file identical |
| T4 | A sends 50 MB file | Progress moves smoothly, SHA-256 matches |
| T5 | A sends 500 MB file (desktop receiver) | Completes, UI responsive, memory stable if File System Access API is used |
| T6 | B declines | A shows "Declined", no data sent |
| T7 | A cancels mid-transfer | B shows "Cancelled", partial data discarded |
| T8 | B cancels mid-transfer | A shows "Cancelled" |
| T9 | Send 5 files in one go | Sequential, each prompted/accepted once per batch or per file (as designed), all complete |
| T10 | Force WebRTC failure (`?relay=1`) | Falls back to relay, badge visible, file intact |
| T11 | Kill the server mid-transfer | Both show clear failure; reconnect banner appears; restart restores device list |
| T12 | Rename device | Other devices see the new name |
| T13 | Name containing `<script>` | Rendered as plain text |
| T14 | File named `../../x.exe` | Sanitized to a safe name on save |
| T15 | 3+ devices in the room | Every device lists the other two; transfers don't cross |
| T16 | Online mode, two devices on different networks | Not listed to each other (unless same `?room=` code) |
| T17 | Local mode with mobile data off | Everything works |
| T18 | Hosted `https://` page, try to reach a LAN server | Documented limitation: not supported; use the LAN URL |

## 3. Responsive checks

| Width | Verify |
|---|---|
| 320 px | No horizontal scroll, 2 device columns, buttons full width |
| 375 px | Bottom-sheet dialog, safe-area padding on notch phones |
| 768 px | 3–4 columns, header in one row |
| 1024 px | Content centered, max-width 960 px |
| 1440 px | Same layout, hover shadows visible, drag-and-drop highlight |

Also: rotate phone portrait ↔ landscape; zoom text to 200%; keyboard-only run-through.

## 4. Performance and reliability checks
- Throughput on same Wi-Fi: record MB/s for laptop↔laptop and laptop↔phone. Target ≥ 20 MB/s for laptop↔laptop.
- 30-minute idle: device list still correct (heartbeat works).
- 10 rapid join/leave cycles: no ghost devices.
- Server memory after 100 connects/disconnects: returns to baseline (no leak in `rooms`).
- Lighthouse (hosted): Performance ≥ 90, Accessibility ≥ 95, PWA installable.

## 5. Security checks
- [ ] Oversized WS message (> 64 KiB text) is dropped
- [ ] Invalid JSON ignored without crash
- [ ] `signal` to a peer in a different room is ignored
- [ ] No user input reaches `innerHTML`
- [ ] Rate limiting triggers on > 20 connections/min from one IP
- [ ] Security headers present (check with browser dev tools → Network)
- [ ] Server logs contain no file names or contents

## 6. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Other device can't open the URL | Different network, or firewall | Same Wi-Fi/hotspot; allow port 3000 in firewall; check IP with `ipconfig` / `ip a` |
| Page loads but no devices appear | Router **AP/client isolation** | Use a phone hotspot or disable isolation; guest Wi-Fi often has it on |
| Devices listed but "connecting…" then relay | mDNS/ICE blocked on the network | Normal fallback. Relay works but slower |
| Works on laptop, not iPhone | HTTP page on iOS with restricted APIs, or Low Power Mode throttling | Keep screen on and tab in foreground; use Blob receive path |
| Download fails at high size on phone | Blob in memory too large | Send smaller files or receive on desktop (File System Access API) |
| Hosted site can't connect to LAN device | Mixed content (`https` → `ws://`) | Open the LAN `http://` URL directly |
| Service worker not registering on LAN | HTTP isn't a secure context | Expected. Only hosted HTTPS uses the PWA cache |
| WS drops every ~60 s online | Proxy idle timeout | Heartbeat every 15 s; raise `proxy_read_timeout` |
| Everyone shows up in one list online | Users behind the same public IP (campus/office NAT) | Expected. Use `?room=CODE` to separate groups |
| Nobody sees each other online though on same Wi-Fi | Server reading proxy IP, not client IP | Set `TRUST_PROXY=true` and forward `X-Forwarded-For` |

## 7. Release checklist
- [ ] T1–T18 pass on at least: Chrome desktop, Chrome Android, Safari iOS
- [ ] Local mode verified with mobile data off
- [ ] Online mode verified over `wss://`
- [ ] Responsive checks done
- [ ] README up to date (quick start, firewall, limits)
- [ ] `CACHE_VERSION` bumped in `sw.js`
- [ ] Dependencies audited (`npm audit`)
