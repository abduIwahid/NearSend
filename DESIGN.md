# NearSend — Design Spec

**Principles:** simple, plain, functional. Black, white, and grays only. Depth comes from borders and soft shadows, not color. No gradients, no glow, no neon, no illustrations of robots/sparkles, no "AI" look.

## 1. Design tokens (CSS variables)

```css
:root {
  /* color: neutral scale only */
  --white:  #ffffff;
  --g-50:   #fafafa;
  --g-100:  #f4f4f4;
  --g-200:  #e6e6e6;
  --g-300:  #d0d0d0;
  --g-500:  #8a8a8a;
  --g-700:  #4a4a4a;
  --g-900:  #1a1a1a;
  --black:  #000000;

  /* semantic */
  --bg:         var(--white);
  --surface:    var(--white);
  --surface-2:  var(--g-50);
  --border:     var(--g-200);
  --text:       var(--g-900);
  --text-muted: var(--g-500);
  --accent:     var(--black);      /* primary buttons, focus ring */
  --on-accent:  var(--white);

  /* shadows */
  --shadow-sm: 0 1px 2px rgba(0,0,0,.06);
  --shadow-md: 0 4px 12px rgba(0,0,0,.08);
  --shadow-lg: 0 12px 32px rgba(0,0,0,.14);

  /* shape + spacing */
  --radius: 10px;
  --radius-sm: 6px;
  --s-1: 4px; --s-2: 8px; --s-3: 12px; --s-4: 16px; --s-5: 24px; --s-6: 32px; --s-7: 48px;

  /* type */
  --font: system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  --mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
```

**Status without color:** success/error/progress are shown with text, icon shape, and weight, not green/red.
- Progress bar: black fill on `--g-200` track.
- Error: bold text + `✕` icon + black 1 px border.
- Complete: `✓` icon + text.

(Optional later: dark theme by swapping tokens: `--bg: #0b0b0b; --surface: #151515; --text: #f2f2f2; --border: #2a2a2a`.)

## 2. Typography

| Use | Size | Weight |
|---|---|---|
| App title | 20 px | 600 |
| Section label | 12 px, uppercase, letter-spacing .06em | 600, `--text-muted` |
| Body | 16 px | 400 |
| Device name | 16 px | 600 |
| Meta (size, speed) | 13 px, `--mono` | 400, `--text-muted` |

System font stack only. No web fonts (works offline, loads instantly). Line height 1.5.

## 3. Layout

Single page, three zones.

```
┌──────────────────────────────────────────────┐
│ Header:  NearSend              [Your device]  │
├──────────────────────────────────────────────┤
│ Share box (local mode only): URL + QR         │
├──────────────────────────────────────────────┤
│ Nearby devices                                │
│ ┌────────┐ ┌────────┐ ┌────────┐             │
│ │  icon  │ │  icon  │ │  icon  │  ← grid      │
│ │ Name   │ │ Name   │ │ Name   │             │
│ │ type   │ │ type   │ │ type   │             │
│ └────────┘ └────────┘ └────────┘             │
├──────────────────────────────────────────────┤
│ Transfers (list, shown only when active)      │
├──────────────────────────────────────────────┤
│ Footer: status dot-less text: "Connected · local mode" │
└──────────────────────────────────────────────┘
```

- Content max-width **960 px**, centered, side padding 16 px (mobile) / 24 px (≥ 768 px).
- Device grid: `display:grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px;`

## 4. Responsive breakpoints

| Range | Behavior |
|---|---|
| **< 480 px** (phones) | 2-column device grid (≥ 140 px cards), full-width buttons, dialogs become bottom sheets, header stacks "Your device" under title |
| **480–767 px** | 3 columns, centered content |
| **768–1199 px** (tablet/laptop) | 4 columns, side padding 24 px |
| **≥ 1200 px** (desktop) | Max-width 960 px, drag-and-drop zone highlighted when hovering files over a device card |

Rules for all sizes:
- Mobile-first CSS (`min-width` media queries).
- Touch targets ≥ 44 × 44 px.
- No horizontal scroll from 320 px up. Test at 320, 375, 768, 1024, 1440.
- Viewport: `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`; add `padding-bottom: env(safe-area-inset-bottom)` on bottom sheets.
- Use `rem`/`%`/`grid`, avoid fixed pixel widths on containers.

## 5. Components

### 5.1 Device card
- Surface white, 1 px `--border`, radius 10, `--shadow-sm`.
- Contents: simple line icon (phone / tablet / laptop, inline SVG, 1.5 px stroke, black), name, device type in muted text.
- Hover (pointer devices): `--shadow-md`, border `--g-300`. Active: `translateY(1px)`.
- Focus: 2 px solid `--black` outline, 2 px offset.
- Click/tap → opens file picker. Desktop: also accepts dropped files.

### 5.2 Your device chip (header)
- Pill: `--g-100` background, name text, tap to rename (inline input).

### 5.3 Buttons
| Type | Style |
|---|---|
| Primary | `--black` bg, white text, radius 6, height 44 px, `--shadow-sm` |
| Secondary | White bg, 1 px `--black` border, black text |
| Text/Danger | Text only, underline on hover (cancel/decline) |

Disabled: `opacity .4`, no shadow.

### 5.4 Receive dialog (modal / bottom sheet on phones)
```
Incoming file
──────────────────
Grey Panda wants to send:
report-final.pdf  ·  4.2 MB
[ Decline ]      [ Accept ]
```
- Backdrop `rgba(0,0,0,.4)`. Dialog white, `--shadow-lg`, radius 12 (top corners only on phones).
- Focus trapped; `Esc` = decline. Primary button = Accept.

### 5.5 Transfer row
```
report-final.pdf                     ↑ Sending to Grey Panda
████████████░░░░░░░░  62%    12.4 MB/s    [Cancel]
```
- Progress: 6 px bar, radius 3, black fill.
- States as text + icon: `Waiting…`, `Sending 62%`, `Done ✓`, `Declined`, `Failed ✕ (reason)`, `Relay` badge (outlined small label).
- Completed receive row shows a **Save** button when auto-save isn't possible.

### 5.6 Empty state
Centered muted text: "No devices found. Open this page on another device connected to the same Wi-Fi."
Beneath: small outlined list of 2 tips (same network / hotspot works without internet). No illustration.

### 5.7 Share box (local mode)
- Bordered card: label "Join from another device", URL in mono, QR (black on white, 128 px), **Copy** button.

### 5.8 Toasts
- Bottom center, black bg, white text, radius 6, auto-dismiss 3 s. Used for "Reconnecting…", "Copied", errors.

## 6. Motion
- Transitions 120–160 ms, `ease-out`, only on `box-shadow`, `transform`, `opacity`.
- Device cards fade/scale in (opacity 0→1, `scale(.98)`→1).
- `@media (prefers-reduced-motion: reduce)` → no transitions.

## 7. Accessibility checklist
- [ ] Contrast ≥ 4.5:1 (muted text `#8a8a8a` on white is only ~3.5:1. Use `--g-700` `#4a4a4a` for small body text, keep `--g-500` for large/secondary only)
- [ ] Device cards are `<button>` elements with `aria-label="Send file to Grey Panda"`
- [ ] Device list is `aria-live="polite"` so joins/leaves are announced
- [ ] Progress uses `<progress>` or `role="progressbar"` with `aria-valuenow`
- [ ] Dialog uses `role="dialog"`, `aria-modal="true"`, focus trap, returns focus on close
- [ ] Never rely on color alone (already monochrome)
- [ ] Works with keyboard only: Tab, Enter/Space, Esc

## 8. Copy (plain, short)
| Where | Text |
|---|---|
| Title | NearSend |
| Subtitle | Send files to nearby devices. |
| Empty | No devices found. Open this page on another device on the same network. |
| Waiting | Waiting for Grey Panda to accept… |
| Receive | Grey Panda wants to send you 1 file (4.2 MB). |
| Relay note | Direct connection failed. Using relay (slower). |
| Keep open | Keep this tab open until the transfer finishes. |
| Offline hint | No internet? Join a hotspot and open the address shown on the host device. |

## 9. Do / Don't

| Do | Don't |
|---|---|
| White background, black text, gray borders, soft shadows | Gradients, glassmorphism, glow, neon, purple/blue "AI" palettes |
| Plain line icons | Sparkles, robots, brain icons, "magic" wording |
| System fonts | Heavy web fonts or animations |
| Short literal labels | Marketing language |
