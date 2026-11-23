# Frequently asked questions

[Back to README](../README.md)

**What is a Stream Deck?**
A panel of buttons that each do something on your computer with one press — mute your mic, open an app, play a sound. PadDeck turns your Android tablet or phone into one.

**Is PadDeck free?**
Yes. It's open source under the MIT License. No subscription, no account.

**Do I need the internet?**
No. Your PC and tablet talk directly over your home Wi-Fi. Only tiles you set up to open websites need the internet.

**Do I need to keep the PadDeck window open on the PC?**
No. Closing the window leaves PadDeck running in the system tray. Quit it from the tray icon's menu.

**Does it start with Windows?**
Yes, by default. Turn it off in **Devices → General & security → Start with Windows** or in the tray menu.

**Can I connect more than one device?**
Yes — tablet and phone at the same time, as many as you like. Each can even use a different profile and layout (Settings → This device).

**Will changes on my PC show up on my tablet?**
Instantly. Every edit is saved on the PC and pushed to all connected devices. If two devices edit at the same moment, PadDeck merges the changes instead of overwriting one.

**Can I use PadDeck from outside my home?**
Not out of the box — both devices must be on the same network. A private VPN such as Tailscale can connect them from elsewhere.

**Does it work with iPad or iPhone?**
There's no iOS app. You can open the PC's address (shown in **Devices**) in Safari and pair with the 6-digit code.

**Can someone else on my Wi-Fi control my PC?**
Only devices you pair with a code shown on your PC screen. Codes work once and expire after 5 minutes. You can remove devices and switch off new pairings in **Devices**.

**Will the Shut down button switch off my PC by accident?**
No. Shut down, Restart, Sleep and Sign out always ask for confirmation. Shut down and Restart wait 5 seconds before starting.

**Where are my buttons and sounds stored?**
On your PC in `%APPDATA%\PadDeck`. Uninstalling or updating PadDeck doesn't delete them. Export or restore them in **Settings → Backup**.

**Can I add any program or file?**
Yes. Use the Application library (found automatically) or add any file, folder, program or shortcut through **Add → Files**.

**Can I run my own scripts?**
Yes, safely: copy `.ps1`, `.bat` or `.cmd` files into the **Approved scripts** folder (Devices → Approved scripts), then add an **Approved script** tile. PadDeck refuses scripts from anywhere else.

**Why does the microphone button show "Live"?**
"Live" means your microphone is **on** and others can hear you. It turns red and says **Muted** when muted. It is a status button, not a mode.

**Does PadDeck work with Discord?**
The big microphone button mutes your mic in every app, including Discord. Dedicated *Discord mute/deafen* tiles press the keyboard shortcuts you set in Discord (Discord → User Settings → Keybinds; set the same keys in PadDeck → Settings → Integrations).

**Does it support Spotify?**
Play/Pause, Next and Previous work with any player that supports Windows media controls, including Spotify. The music widget is built for YouTube Music but shows whichever player is active.

**Can my tablet act as a second screen or drawing tablet?**
No. Those features were removed in PadDeck 2.1 so it can focus on being an excellent Stream Deck.

**Why does Windows/Android warn me when installing?**
The installer and APK aren't signed with paid certificates. Click *More info → Run anyway* on Windows; allow *Install unknown apps* on Android.
