# PadDeck — Xiaomi Pad 5 ⇄ Windows PC companion

Turns a Xiaomi Pad 5 into a wireless **Stream Deck**, **PC control centre**, **pressure-sensitive drawing tablet** (Xiaomi Smart Pen) and — with Apollo — a **real second monitor**. Everything runs on your local network; no cloud, no accounts, no subscriptions.

```
 Xiaomi Pad 5 (Chrome or PadDeck Android app)            Windows PC
 ┌──────────────────────────────┐   Wi-Fi / USB tether  ┌────────────────────────────────────────┐
 │ React dashboard (PWA)        │ ── HTTP + WebSocket ──▶│ PadDeck companion (Node.js)            │
 │  Stream Deck · Control Centre│    token-authenticated │  pairing · config · action allowlist   │
 │  Audio · Soundboard · Apps   │                        │  hardware monitor · app discovery      │
 │  Drawing tablet (Pointer API)│                        │        │ JSON over stdin/stdout        │
 │  Second-monitor launcher     │                        │  PadDeckHelper.exe (C#, native)        │
 └──────────────────────────────┘                        │   Core Audio · SendInput · Windows Ink │
 Artemis/Moonlight  ◀────── H.265 stream ─────────────── │   pen injection · media controls (SMTC)│
                                                          │   soundboard playback · tray icon      │
                                                          │  Apollo + SudoVDA (virtual monitor)    │
                                                          └────────────────────────────────────────┘
```

## Install (PC)

Requirements: Windows 10 1809+ / Windows 11, Node.js 20+ (the installer offers to install it with winget).

```powershell
powershell -ExecutionPolicy Bypass -File install.ps1 -AutoStart
```

The installer compiles the native helper with the C# compiler that ships with Windows, installs dependencies, builds the dashboard if needed, creates **Start menu → PadDeck Companion**, optionally enables start-with-Windows (`-AutoStart`, per-user, no admin), starts PadDeck in the tray and opens the pairing page. No administrator rights are needed for the core app.

* Settings live in `%APPDATA%\PadDeck` (config, uploads, approved scripts, daily backups, log). Updating PadDeck never touches this folder.
* When Windows Firewall asks about **Node.js**, allow **Private networks**. (Or: Companion settings → *Allow through firewall*, which shows a UAC prompt.)

## Pair the tablet

1. On the PC: tray icon → **Show pairing QR code** (or open `http://localhost:47800/admin`).
2. On the Pad: scan the QR code with the camera (opens `http://<pc-ip>:47800/#pair=CODE` and pairs automatically) — or open `http://<pc-ip>:47800` in Chrome and type the 6-digit code.
3. Tap the ⤢ button (top right) for full screen. For a true kiosk experience install the Android app (below).

Codes are single-use and expire after 5 minutes. Each tablet gets its own 256-bit token (only its hash is stored). Remove a tablet any time on the PC settings page; turn off *Allow new tablets to pair* once you're set up.

## Android app (optional, recommended)

`android/` contains a small Kotlin app: full-screen immersive WebView, screen kept on, **automatic PC discovery** (UDP broadcast on port 47801), reconnects after Wi-Fi drops, stylus events passed straight through.

```powershell
powershell -ExecutionPolicy Bypass -File android\build-apk.ps1
```

The script downloads OpenJDK 17, the Android command-line tools and Gradle into `android\.tools` (~600 MB, once), **asks you to accept the Android SDK licence**, and produces `PadDeck.apk`. Copy it to the Pad and install it (allow *Install unknown apps* for your file manager). Long-press the status text to enter the PC address manually.

## Modes

| Mode | What it does | How |
|---|---|---|
| **Stream Deck** | Pages of configurable buttons (3×2 … 8×4 grids, 4×5 portrait). Long-press a button: edit / duplicate / delete. **Edit** mode: drag to move or swap, tap empty cells to add, tap the page name for grid size, order, icon. | Actions run on the PC through an allowlist (below). |
| **Control Centre** | CPU, GPU, RAM, temps, disks, network, uptime, mouse/keyboard battery, all Bluetooth batteries, audio, YouTube Music, Discord & voice, Focus, shortcuts. **Customize** to show/hide/reorder widgets. | Node + native helper + `nvidia-smi` + PnP battery properties. |
| **Audio** | Master volume/mute, one-tap output switching, microphone switching/mute/level, per-app volume and mute, audio profiles (Gaming, Work, Meeting, Music, Silent + your own). | Windows Core Audio (`IMMDeviceEnumerator`, `IAudioEndpointVolume`, `IAudioSessionManager2`, `IPolicyConfig`). |
| **Soundboard** | Pages × categories of sounds, upload MP3/WAV/OGG/M4A/FLAC (also drag & drop), per-sound colour/icon/volume, layering, replay, stop, stop-all, master volume, preview on PC. | Plays on the **PC's** current output (WPF `MediaPlayer`), never the tablet speakers. |
| **Apps** | Featured (Chrome, Edge, VS Code, Discord, YouTube Music, Blender, Photoshop, Illustrator, Steam, Explorer, Task Manager), every Start-menu app with real icons, pinning, custom launchers with arguments and icons. | `Get-StartApps` + `shell:AppsFolder`, icons via `IShellItemImageFactory`. |
| **Drawing tablet** | Smart Pen → Windows pen with pressure, tilt, hover, side button, eraser. Mapping to main/other/all monitors, partial area, keep proportions, pressure curve, smoothing, calibration, palm rejection, finger gestures, floating shortcut bar (hold-able Ctrl/Shift/Alt/Space), left-handed layout, hide-all UI. | Pointer Events on the Pad → WebSocket → `InjectSyntheticPointerInput(PT_PEN)` on Windows (Windows Ink). |
| **Second monitor** | Real extended desktop on the Pad via Apollo + Artemis/Moonlight; live list of the monitors Windows sees. | See below. |
| **Settings** | Profiles (independent pages, buttons, widgets, soundboard, theme), themes (dark/light, accent, background incl. uploaded image, radius, spacing, button style, font, saved themes), Focus mode, notifications, Discord keybinds, YouTube Music URL, LibreHardwareMonitor URL, export/import/backups, unpair. | |

### Action types (allowlist)
`app`, `url` (http/https/mailto/steam/ms-settings/discord only), `open` (existing file/folder/program), `ytmusic`, `keys` (any combination incl. Win/media keys), `text`, `macro` (keys/text/delay steps), `media`, `volume`, `micMute`, `micVolume`, `output`, `input`, `appVolume`, `audioProfile`, `sound`, `stopSounds`, `system` (lock, screenshot, snip, Task Manager, Explorer, Settings, sleep, restart, shut down, sign out, cancel shutdown), `script`, `focus`, `discord`, `scroll`, `page`, `mode`.

There is **no** “run arbitrary command line” action. Scripts (`.ps1 .bat .cmd .exe .lnk .vbs .ahk`) run only if they are inside `%APPDATA%\PadDeck\scripts` — i.e. you approved them by putting them there on the PC. Shut down, restart, sleep and sign out are refused by the PC unless the tablet confirmed them.

## Second monitor (real extended display)

Windows only shows an extra monitor if a display driver creates one, so PadDeck reuses mature open-source tools instead of shipping its own unsigned driver:

* **PC:** [Apollo](https://github.com/ClassicOldSong/Apollo) (GPL-3.0, Sunshine fork) with the bundled **SudoVDA** virtual display driver; NVENC hardware encoding on your RTX 4060.
* **Pad:** [Artemis](https://github.com/ClassicOldSong/moonlight-android/releases) (Moonlight fork made for Apollo) or Moonlight; hardware HEVC decoding, touch input.

```powershell
powershell -ExecutionPolicy Bypass -File setup-second-monitor.ps1
```
**Requires your authorisation:** the Apollo installer adds a display driver and a service, so Windows shows a UAC prompt. Then follow the steps the script prints (Apollo web UI at `https://localhost:47990`, pair Artemis with the PIN, start *Desktop*). The tablet then appears in **Settings → System → Display** where you can extend, arrange, rotate (portrait) and drag windows onto it. Resolution, FPS (up to 120) and bitrate are set in Artemis. USB: enable USB tethering on the Pad and connect Artemis to the tethered address.

Evaluated alternatives: SuperDisplay / spacedesk / Duet (closed-source, some paid), XDisplay/PadDisplay (unmaintained). Apollo+Artemis is open source, actively maintained, and the only option that auto-creates a virtual monitor matching the tablet.

## Troubleshooting

| Problem | Fix |
|---|---|
| Tablet shows “PC not reachable” | Same Wi-Fi (not a guest network)? Companion running (tray icon)? Allow Node.js through the firewall (Private). Try `http://<pc-ip>:47800/api/discover` in the tablet browser. |
| Pairing code rejected | Codes are single-use and expire after 5 min — tap *New code*. Check *Allow new tablets to pair*. After 8 wrong tries wait a minute. |
| Wrong network address in the QR | Pick the right adapter in the drop-down under the QR code (VPN/virtual adapters are hidden automatically). |
| Keyboard shortcuts don't reach a program | Programs running as administrator ignore input from non-elevated processes (Windows UIPI). Run the companion elevated only if you need that. |
| Mouse/keyboard battery “Unavailable” | Windows only knows batteries that the device reports over Bluetooth (Battery Service). 2.4 GHz dongles (e.g. Fantech, Logitech Unifying/Lightspeed, Razer HyperSpeed) report only to their vendor software. Tap ⇅ on the widget to pick which device is your mouse/keyboard. |
| CPU temperature unavailable | Windows has no driver-free API for CPU temperature. Run LibreHardwareMonitor → Options → Remote Web Server → Run (port 8085). |
| Pen strokes don't appear | Keep the companion's settings page closed over the target area; check *Map tablet to* in pen settings; in Photoshop make sure *Use Windows Ink* is on (default) / in Krita set *Tablet input API* to *Windows 8+ Pointer Input*. |
| Smart Pen side button does nothing | MIUI can reserve the Smart Pen buttons for its own shortcuts — disable them in Pad Settings → Additional settings → Xiaomi Smart Pen. |
| Seek bar disabled for YouTube Music | The player didn't advertise seeking to Windows for that track; play/pause/next/previous still work. |
| Something else | PC settings page → Log, or `%APPDATA%\PadDeck\companion.log`. *Restart companion* from the tray. |

## Honest limitations

* **Pen pressure resolution:** the Smart Pen reports 4,096 levels; Windows' pen-injection API accepts 0–1,024, so Windows apps see 1,024 levels. Pressure is forwarded as a full-precision float and only quantised at that last step.
* **Charging status** of Bluetooth peripherals isn't exposed by Windows' battery property, so it is shown as “not reported” rather than guessed.
* **Discord:** Discord has no public local API for mute/deafen (its RPC voice scopes need Discord approval). PadDeck triggers the keybinds you set in Discord. The big microphone button mutes at Windows level, which works in every app.
* **Do Not Disturb:** Windows 11 has no public API for Focus/DND; Focus mode switches Windows' per-user “Notifications” toggle instead and restores it afterwards.
* **YouTube Music volume** controls the browser's volume in the Windows mixer (all tabs of that browser).
* **PWA install:** Chrome only installs PWAs from HTTPS origins; over local HTTP use the Android app or Chrome → *Add to Home screen*.

## Test record (performed on the development PC: i5-14500HX, RTX 4060 Laptop, 2560×1600 internal + 1920×1080 external)

| Area | Result |
|---|---|
| Pairing via QR URL, wrong code (403), unauthenticated API (401), WebSocket auth, auto-reconnect after companion restart | ✅ |
| Action allowlist: unconfirmed shutdown refused, `javascript:` URL refused, script path traversal refused | ✅ |
| Output switching Headphones (CH331) ↔ Speakers (Realtek) and back | ✅ |
| Microphone mute/unmute (MV7), master volume set/up/down, audio profile “Work” → 45 % | ✅ |
| Per-app sessions listed with real icons (Chrome, Edge WebView2, Telegram, System sounds) | ✅ |
| Soundboard: `tada.wav` played on the PC output, end event received | ✅ |
| App launch (Calculator via Start-menu AppID), media keys fallback, volume keys | ✅ |
| Config change persisted to disk (rev 1 → 2) | ✅ |
| CPU %, RAM, GPU % + temperature (nvidia-smi), disks, network, uptime | ✅ |
| Batteries: ECHO 96 BT1 keyboard 69 %, 8BitDo controller 62 %, Go4 Pro 100 %; Fantech 2.4 GHz mouse correctly “Unavailable” | ✅ |
| 171 Start-menu apps detected with icons | ✅ |
| **Windows pen injection:** a browser page on each monitor received `pointerType = "pen"` with pressure 0.03 → 1.00 and tiltX 40°, strokes drawn with pressure-dependent width; also drew in Paint | ✅ |
| Dashboard UI at the Pad 5 viewport (1280×800 CSS px) — all modes render | ✅ |
| **Not testable here:** the physical Xiaomi Pad 5 + Smart Pen (capture side uses the standard Pointer Events API), Apollo/Artemis (needs your UAC approval), the Android APK build (needs the SDK licence accepted). |

## Development

```powershell
# companion (uses native\bin\PadDeckHelper.exe; build it first with native\build.ps1)
cd companion; npm install; npm start
# dashboard with hot reload, proxied to the companion on :47800
cd dashboard; npm install; npm run dev
```
Environment variables: `PADDECK_PORT`, `PADDECK_DATA` (data folder), `PADDECK_NO_TRAY=1`.
