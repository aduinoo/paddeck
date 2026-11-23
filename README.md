# PadDeck 2.1 — wireless Stream Deck for Windows + Android

PadDeck turns your Xiaomi Pad 5 (and any Android tablet or phone) into a fully customizable wireless Stream Deck for your Windows PC, with a proper **Stream Deck Editor** on the desktop. Everything runs on your local network — no cloud, no account, no subscription.

```
 Android tablet / phone (PadDeck app)                     Windows PC (PadDeck Desktop)
 ┌──────────────────────────────┐   Wi-Fi (LAN)          ┌────────────────────────────────────────────┐
 │ Stream Deck controller       │ ── WebSocket + HTTP ──▶│ Electron app: Stream Deck Editor, tray,    │
 │  pages · folders · tiles     │   token authenticated  │  native file picker, start with Windows    │
 │  Soundboard · Audio          │ ◀── live config sync ──│ Companion (Node): pairing, config + merge, │
 │  Control Centre · Apps       │                        │  action allowlist, app discovery           │
 │ QR pairing · LAN discovery   │ ◀─ UDP 47801 discover ─│ PadDeckHelper.exe (C#): Core Audio, keys,  │
 └──────────────────────────────┘                        │  media sessions, soundboard, icons         │
                                                          └────────────────────────────────────────────┘
```

## Install
1. **Windows:** run `desktop\release\PadDeck-Setup-2.1.0.exe` (per-user, no admin). Desktop + Start-menu shortcuts, tray icon, starts with Windows. Upgrades from 2.0/1.x keep all settings, sounds and pairings (a backup is made first).
2. **Android:** PadDeck Desktop → **Devices** → *Get the Android app* QR (downloads `PadDeck.apk` from your PC) → install (allow *Install unknown apps*). Android 8+, phones and tablets. Installs over 2.0 keeping its pairing.
3. **Pair:** Devices → QR code / 6-digit code; in the app tap **Scan QR code** (or pick your PC from the discovered list). Pair as many devices as you like.

## PadDeck Desktop
Sidebar: **Dashboard · Stream Deck Editor · Applications · Soundboard · Audio Control · Profiles · Devices · Settings**.

### Stream Deck Editor
The tablet's grid on your PC screen.
* **Add**: library of everything installed (search, categories) — press **Add** or drag onto a cell; files & folders through the Windows file picker; folders (groups); ready-made actions (Windows controls, shortcuts, macros, media, audio, Discord, navigation, scripts); soundboard sounds. Click an empty cell first to choose where new tiles go.
* **Organise**: drag tiles to move or swap; drop on a page tab to move to that page; drop on a folder to put it inside; double-click a folder to open it; **Move to…** / arrow buttons / arrow keys as a non-drag alternative; Duplicate (Ctrl+D), Delete (Del), **Undo / Redo** (Ctrl+Z / Ctrl+Y).
* **Button designer** with live preview: title, Lucide icon, emoji, uploaded image or the real app/file icon, background colour or two-colour gradient + angle, text colour, icon position (top/left/right/icon only), font size, corner radius, size 1–3 × 1–3, hide title, confirmation, toggle states (active title/icon/colours, following mic mute, speaker mute, music playing or Focus).
* Pages (grid 3×2 … 8×4, Stream Deck XL = 8×4), folders, profiles; page navigation tiles (next / previous / back / specific page) and profile-switch tiles.
* Tiles that open files or folders show **Unavailable** if the target was moved or deleted.

### Applications
Discovered from the Start menu (desktop, Microsoft Store, Office, Steam), installed-programs registry entries, desktop shortcuts and common installation folders — merged, de-duplicated and categorised (Browsers, Communication, Office, Creative, Development, Games, Media, System, Utilities). Shows icon, name and install path; launch, favourite, or **Add** to any page/folder in one click; **Rescan** any time.

### Everything else
Soundboard (upload MP3/WAV/OGG/M4A/FLAC, categories, pages, colours, icons/emoji, per-sound + master volume, layering, stop/replay/stop-all, plays through the PC's output), Audio Control (outputs, microphones, mute, levels, per-app volume/mute, audio profiles — Windows Core Audio), Dashboard (CPU/GPU/RAM/disk/network/temps, mouse & keyboard battery, YouTube Music with artwork + seek, Discord & voice), Profiles, Devices (pairing QR, APK QR, paired devices, port, firewall, logs, folders), Settings (themes: Dark, Light, Midnight, AMOLED, Minimal, Custom with 8 colours + HEX, saved themes; Focus mode; notifications; Discord keybinds; backup/restore).

## Android app
Landscape-first Stream Deck controller: pages, folders, toggles, soundboard, audio, hardware widgets. **Edit** on the tablet: drag tiles, long-press for Edit / Duplicate / Move to page / Delete, tap empty cells to add from the same library, Undo/Redo. Phones get a compact portrait layout (reflowed grid, bottom navigation); layout can be forced per device. Each device can follow the PC's profile or keep its own.

## Synchronisation
One shared configuration on the PC; every edit (tile, page, profile, theme) is pushed to all connected devices instantly over WebSocket. Edits are sent as replayable changes: if two devices edit at the same time the later one is merged on top of the newer configuration instead of overwriting it, and stale saves are rejected. Devices reconnect automatically and show their connection status.

## Security
Single-use pairing codes (5 min), per-device 256-bit tokens (stored hashed), action allowlist (no arbitrary command lines), scripts only from `%APPDATA%\PadDeck\scripts`, confirmation for shutdown/restart/sleep/sign-out. The desktop editor authenticates through a loopback-only endpoint; admin/settings APIs only answer on the PC itself.

## Data
`%APPDATA%\PadDeck`: `config.json` (profiles, pages, tiles, themes, device preferences), `companion.json` (pairings), `media\`, `scripts\`, `backups\` (daily and before every import/restore/migration). Export / import / restore in Settings → Backup. Uninstalling keeps this folder.

## Removed in 2.1
Second monitor, drawing tablet, whiteboard, stylus/pen transmission and Windows Ink integration were removed from the apps, the companion, the native helper, the Android app and the installer. Your existing settings were migrated (retired buttons removed); files in `%APPDATA%\PadDeck\whiteboards` from 2.0 are left untouched. PadDeck never installed a virtual display driver, so there is nothing to uninstall.

## Troubleshooting
| Problem | Fix |
|---|---|
| Device can't find the PC | Same Wi-Fi; PadDeck running (tray); allow it through the firewall on Private networks; enter the address from Devices manually. |
| Pairing code rejected | Single-use, expires after 5 minutes — press *New code*. |
| Shortcut doesn't reach an app | Apps running as administrator ignore input from normal apps (Windows UIPI). |
| Tile shows Unavailable | Its file/folder was moved or deleted — edit the tile and pick it again. |
| Mouse battery Unavailable | 2.4 GHz dongles report battery only to vendor software; Bluetooth devices work. |
| CPU temperature unavailable | Run LibreHardwareMonitor → Options → Remote Web Server. |

## Development
```powershell
cd native; powershell -ExecutionPolicy Bypass -File build.ps1      # PadDeckHelper.exe
cd dashboard; npm install; npm run build                          # UI used by desktop + Android
cd desktop; npm install; npm run dist                             # Windows installer (bundles the companion)
powershell -ExecutionPolicy Bypass -File android\build-apk.ps1     # PadDeck.apk
```
