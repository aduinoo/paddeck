# Troubleshooting

Find your problem below and follow the numbered steps in order. [Back to README](../README.md)

> 🔎 **Tip:** PadDeck explains most failures in a short message at the bottom of the tablet screen. On the PC, **Devices → Log** shows what happened recently.

---

### 1. The tablet can't connect to the PC
1. On the PC, check the blue PadDeck icon is in the system tray. If not, open **PadDeck** from the Start menu.
2. Check the PC and tablet are on the **same Wi-Fi network** (same name). Not a guest network.
3. On the PC, open **Devices** and click **Allow through firewall**, then **Yes** in the Windows prompt.
4. In Windows **Settings → Network & internet → Wi-Fi → your network**, set **Network profile type** to **Private**.
5. On the tablet, type the address shown under the QR code (e.g. `http://192.168.1.20:47800`) into **PC address**.
6. Restart PadDeck: right-click the tray icon → **Restart PadDeck**.

### 2. The tablet doesn't discover the PC (empty "PCs found" list)
1. Tap **Search again** on the pairing screen.
2. Some routers block the "find devices" broadcast (UDP port 47801). Use **Scan QR code** or type the address instead — both work without discovery.
3. Disable any VPN on the PC or tablet while pairing.

### 3. The connection keeps dropping
1. Keep the tablet within good Wi-Fi range; prefer 5 GHz Wi-Fi.
2. On Android, turn off battery optimisation for PadDeck: Settings → Apps → PadDeck → Battery → **No restrictions**.
3. Stop the PC from sleeping while you use PadDeck: Windows Settings → System → Power → Screen and sleep.
4. Reserve an IP address for your PC in your router so its address never changes.
5. PadDeck reconnects by itself — wait for **Connected** after waking the tablet.

### 4. Buttons don't respond
1. Look at the top bar: it must say **Connected**. If it says *Connecting…* or *Disconnected*, see problem 1.
2. Read the message at the bottom of the screen after tapping — it says why an action failed.
3. **Keyboard shortcuts don't reach a program that runs as administrator** (Windows blocks this for safety). Run that program normally, or run PadDeck as administrator.
4. Make sure you're not in **Edit** mode (tiles wiggle). Tap **Done**.

### 5. An application won't open / the tile says "Unavailable"
1. The app may have been uninstalled or moved. On the PC open **Applications** and click **Rescan**.
2. Edit the tile (Edit → tap the tile) and choose the app again.
3. File/folder tiles show **Unavailable** when the file was moved, renamed or deleted — pick it again in the tile's Action tab.

### 6. The microphone button doesn't mute
1. PadDeck mutes your **default** Windows microphone. Open **Audio** and check which microphone is highlighted.
2. Tap the microphone you actually use to make it the default.
3. Discord and other apps may use their own microphone setting — set them to *Default*, or use the **Discord mute** button (requires a Discord keybind, see the [User Guide](USER_GUIDE.md#using-microphone-controls)).

### 7. Media buttons (Play/Pause, Previous, Next) do nothing
1. Something must be playing or paused in an app that supports Windows media controls (Chrome, Edge, YouTube Music, Spotify, most media players).
2. Start playback once on the PC, then try again.
3. If several players are open, choose one in **Control Centre → YouTube Music → Auto-select player**.

### 8. The soundboard makes no sound
1. Sounds play on the **PC**, not the tablet. Check the speaker/headphones shown at the top of the Soundboard and tap it to switch output.
2. Check the PC volume and the soundboard's own volume slider.
3. **Focus mode** mutes the soundboard — tap **Focus** again to turn it off.
4. If you see *"Sound failed: …"*, the file may be damaged or in an unsupported format. Use MP3 or WAV.

### 9. PadDeck won't start on the PC
1. Make sure it isn't already running (check the tray, including the hidden-icons arrow).
2. If a message says **port 47800 is already in use**, another program is using it: restart the PC, or change PadDeck's port in **Devices → General & security → Network port** and restart PadDeck.
3. Reinstall PadDeck — your settings are kept.

### 10. Network or firewall restrictions
1. Office, school, hotel and public networks often block device-to-device traffic. Use a home network or your phone's hotspot (connect both the PC and tablet to it).
2. Third-party security software (antivirus with firewall) may need PadDeck allowed on port **47800 (TCP)** and **47801 (UDP)**.

### 11. "App not installed" on Android
1. Uninstall any older PadDeck app first, then install again (buttons are stored on the PC).
2. Allow installs from your browser/file manager: Settings → Apps → Special access → **Install unknown apps**.

### 12. Mouse or keyboard battery shows "Unavailable"
Only devices that report battery to Windows over **Bluetooth** show a percentage. USB dongle (2.4 GHz) mice and keyboards usually report battery only to their maker's software — PadDeck shows *Unavailable* instead of guessing.

### 13. CPU temperature says "Temp unavailable"
Windows doesn't provide CPU temperature to normal apps. Install the free **LibreHardwareMonitor**, open *Options → Remote Web Server → Run*, and PadDeck will read it.
