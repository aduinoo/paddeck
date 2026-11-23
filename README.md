# PadDeck 2.0 — Windows desktop app + Android app

PadDeck turns your Xiaomi Pad 5, Android phones and other Android tablets into a wireless **Stream Deck**, **Soundboard**, **Whiteboard**, **PC Control Centre**, **drawing tablet** for Windows apps and (with Apollo) a **real second monitor**. Everything runs on your local network: no cloud, no account, no subscription.

```
 Android phone / Xiaomi Pad 5 (PadDeck app)              Windows PC (PadDeck Desktop)
 ┌──────────────────────────────┐   Wi-Fi (LAN)          ┌────────────────────────────────────────────┐
 │ Bundled UI (WebView)         │ ── WebSocket + HTTP ──▶│ Electron shell: tray, settings window,     │
 │  Deck · Soundboard · Board   │   token authenticated  │  native file picker, start with Windows    │
 │  Control · Audio · Apps      │                        │ Companion (Node): pairing, config sync,    │
 │ Native: QR scan, discovery,  │ ◀─ UDP 47801 discover ─│  action allowlist, app discovery, boards   │
 │  file picker, kiosk mode     │                        │ PadDeckHelper.exe (C#): Core Audio, input, │
 │ PenOverlay (MotionEvent) ────┼── pen stream ─────────▶│  Windows Ink pen injection, media session, │
 └──────────────────────────────┘                        │  soundboard playback, icons                │
 Artemis/Moonlight ◀────── H.265 stream ──────────────── │ Apollo + SudoVDA (optional virtual monitor)│
                                                          └────────────────────────────────────────────┘
```

## Install

### 1. Windows — PadDeck Desktop
Run **`PadDeck-Setup-2.0.0.exe`** (in `desktop\release\`). Per-user install, no administrator rights. It creates **Desktop** and **Start menu** shortcuts, starts PadDeck in the system tray and turns on *Start with Windows* (switch it off in the tray menu or settings).

* Upgrading from 1.x: your settings, pairings, sounds and profiles in `%APPDATA%\PadDeck` are kept. On first start PadDeck 2.0 backs up the old configuration, adds the new template profiles (Work, Gaming, Productivity, Creative, Music), removes the old 1.x autostart entry and stops the old background server.
* Windows SmartScreen may warn because the installer isn't code-signed: *More info → Run anyway*.
* If Windows Firewall asks about PadDeck, allow **Private** networks.

### 2. Android — PadDeck app
Open PadDeck Desktop → **Get the Android app** and scan the QR code with the phone/tablet camera (it downloads `PadDeck.apk` from your PC), or copy `PadDeck.apk` over USB. Open it and allow *Install unknown apps* when Android asks. Works on Android 8.0+ phones and tablets, portrait and landscape.

### 3. Pair
Desktop app → **Pair a phone or tablet** shows a QR code and a 6-digit code. In the Android app tap **Scan QR code** (or pick your PC from the automatically discovered list and type the code). Pair as many devices as you like; each gets its own token and appears in *Paired devices* where you can remove it.

## Navigation
**Stream Deck · Soundboard · Whiteboard · Control Centre** are the main sections; **Audio, Apps, Drawing Tablet, Second Monitor, Settings** are one tap away (side rail on tablets, bottom bar + *More* on phones).

| Section | Highlights |
|---|---|
| **Stream Deck** | Grids 3×2 … 8×4 (4×5 portrait). Buttons: title, Lucide icon / emoji / uploaded image / real app or file icon, colour or two-colour gradient, text colour, 1–3 cell size, toggle state, confirmation. Edit mode: drag to move/swap, long-press for duplicate/delete. Phones reflow the same buttons into a compact grid. |
| **App & file detection** | Start menu (desktop + Microsoft Store + Office + Steam), installed-programs registry, desktop shortcuts — merged and de-duplicated (162 apps found on the test PC, including games such as VALORANT and Marvel Rivals). **Browse PC** lists folders/files with icons; **Pick on PC…** opens the native Windows picker on the PC. |
| **Actions** | Launch app, open file/folder/website, keyboard shortcut, macro, type text, approved script (.ps1/.bat in the scripts folder), switch output/mic, mic mute, volume, play/stop sounds, audio profile, switch profile, change page/section, lock, screenshot, media controls, Focus mode, Discord, system power actions (always confirmed). |
| **Soundboard** | Upload MP3/WAV/OGG/M4A/FLAC (drag & drop too), names, icons or emoji, colours, categories, pages, play/stop/replay, layering, per-sound + master volume, preview on PC, output switcher. Audio plays on the **PC**, never on the phone/tablet. |
| **Whiteboard** | Infinite canvas, pen / pencil / marker / highlighter with pressure, eraser (and the pen's eraser button), line, arrow, rectangle, circle, text, selection (move, duplicate, delete), undo/redo, colour palette + HEX, size, opacity, white/grid/dots/dark/transparent backgrounds, palm rejection (fingers pan & pinch-zoom once a pen is used), hideable toolbar. Autosaved on the PC (`%APPDATA%\PadDeck\whiteboards`), drawing library, **export PNG / PDF** to `Documents\PadDeck`. |
| **Control Centre** | CPU, GPU (+temps), RAM, disks, network, uptime, mouse & keyboard battery, all Bluetooth batteries, audio, YouTube Music, Discord & voice, Focus, shortcuts. Customizable widgets. |
| **Audio** | One-tap output & microphone switching, master/mic volume & mute, per-app volume & mute, audio profiles. Windows Core Audio. |
| **YouTube Music** | Title, artist, album art, progress, seek, play/pause/next/previous via Windows media sessions (Chrome, Edge, installed YouTube Music app). |
| **Drawing Tablet** | Pen → real Windows pen (Windows Ink): pressure, tilt, hover, side button, eraser. In the Android app the pen is captured natively (`MotionEvent`, incl. batched samples) and streamed straight to the PC. Monitor mapping, partial area, proportions, pressure curve, smoothing, calibration, palm rejection, shortcut bar. |
| **Second Monitor** | Real extended display via Apollo + Artemis/Moonlight (see below). |
| **Themes** | Dark, Light, Midnight, AMOLED, Minimal, Custom. Edit primary/secondary accent, background, panel, button, text, border and selected colours with a colour picker or HEX (e.g. `#01B6BE`); radius, spacing, button style, font, background image; save themes. Themes sync to every device — or set a theme for one device only. |
| **Profiles** | Default + Work, Gaming, Productivity, Creative, Music + your own; each with its own pages, buttons, soundboard and theme. Each device can follow the PC's profile or pick its own; layouts can be forced to phone/tablet per device. |

## Second monitor (real extended display)
Windows only creates an extra monitor through a display driver. PadDeck uses [Apollo](https://github.com/ClassicOldSong/Apollo) (GPL-3.0, includes the signed SudoVDA virtual display driver, NVENC encoding) with [Artemis](https://github.com/ClassicOldSong/moonlight-android/releases) or Moonlight on Android.

```powershell
powershell -ExecutionPolicy Bypass -File setup-second-monitor.ps1
```
**Needs your authorisation once:** the Apollo installer adds a driver and service, so Windows shows a UAC prompt. Then pair Artemis with the PIN in Apollo's web UI (`https://localhost:47990`) and start *Desktop*: Windows gets a new monitor at the tablet's resolution that you can extend, arrange and rotate. USB: enable USB tethering on the device and connect Artemis to the tethered address.

## Security
Pairing codes are single-use and expire after 5 minutes; tokens are 256-bit and stored only as hashes. Every command is validated against an allowlist — there is no “run any command line” action; scripts run only from `%APPDATA%\PadDeck\scripts`; shutdown/restart/sleep/sign-out need confirmation. The settings window/admin API is only reachable from the PC itself. The whiteboard/file APIs require a paired device.

## Data & backup
`%APPDATA%\PadDeck`: `config.json` (profiles, pages, buttons, themes, device preferences), `companion.json` (pairings), `media\` (uploads, icons), `whiteboards\`, `scripts\`, `backups\` (daily + before every import/restore/migration). Settings → Backup: export, import, restore. Uninstalling PadDeck keeps this folder.

## Troubleshooting
| Problem | Fix |
|---|---|
| App can't find the PC | Same Wi-Fi (not a guest network); PadDeck Desktop running (tray icon); allow PadDeck through the firewall on Private networks; enter the address shown in the desktop app manually. |
| Pairing code rejected | Single-use, expires after 5 min — press *New code*. |
| Shortcuts don't reach an app | Apps running as administrator ignore input from normal apps (Windows UIPI). |
| Mouse battery “Unavailable” | 2.4 GHz dongles (e.g. Fantech) report battery only to vendor software; Bluetooth devices work. |
| CPU temperature unavailable | Run LibreHardwareMonitor → Options → Remote Web Server. |
| Pen strokes don't show in an app | Photoshop: keep *Use Windows Ink* on. Krita: Tablet input API → *Windows 8+ Pointer Input*. |
| Smart Pen button does nothing | MIUI may reserve it: Settings → Additional settings → Xiaomi Smart Pen → turn off its shortcuts. |
| Logs | Desktop window → Log, or `%APPDATA%\PadDeck\companion.log`. |

## Known limitations
* Windows' pen-injection API accepts 1,024 pressure levels; the Smart Pen's 4,096 are forwarded at full precision and quantised by Windows.
* Charging state of Bluetooth peripherals isn't exposed by Windows.
* Soundboard output follows the Windows default device (switchable from the Soundboard page); routing it to a different device than other apps needs an undocumented Windows API that rejects every device ID on this Windows 11 build.
* Discord mute/deafen use your Discord keybinds (no public local API); the mic button mutes at Windows level.
* Windows 11 Do Not Disturb has no public API; Focus mode toggles Windows notifications instead.
* The installer and APK aren't code-signed.

## Development
```powershell
cd native; powershell -ExecutionPolicy Bypass -File build.ps1      # PadDeckHelper.exe
cd dashboard; npm install; npm run build                          # UI (used by both apps)
cd desktop; npm install; npm start                                # run PadDeck Desktop
cd desktop; npm run dist                                          # build the Windows installer
powershell -ExecutionPolicy Bypass -File android\build-apk.ps1     # build PadDeck.apk
```
Environment variables for the companion: `PADDECK_PORT`, `PADDECK_DATA`, `PADDECK_NO_TRAY=1`.
