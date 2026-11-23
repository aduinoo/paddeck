# PadDeck 60-second promo – editing project

The promo is built entirely from code, so it can be re-rendered exactly.

| File | What it does |
|---|---|
| `promo_vo.py` | Generates the female voice-over (Microsoft neural TTS voice **Aria**, en-US) line by line and trims silence → `build/vo/` |
| `promo.py` | The storyboard and frame renderer: scenes, camera moves, animated text, tap rings, labels, subtitles, transitions. Writes the sound-effect cue sheet (`events`) and renders `vertical` (1080×1920) or `landscape` (1920×1080) at 30 fps |
| `promo_audio.py` | Synthesizes the original music track (120 BPM, A minor, build and drop at 0:46) and every sound effect, places them on the cue sheet and mixes them under the voice-over with ducking |
| `promo_export.py` | Muxes video + mix (loudness-normalised to −14 LUFS), writes the SRT, voice-over WAV and thumbnail into `marketing/` |
| `assets/` | Clean screenshots of the real app captured in demo mode (PC name shows "MY-PC", example network address) and the PadDeck icon |
| `stems/` | Rendered music, sound-effect and voice-over stems (48 kHz WAV) |

## Rebuild

```powershell
cd marketing\project
python promo_vo.py
$env:PADDECK_CLIPFRAMES = "<folder of privacy-blurred frames from the tablet recording>"
python promo.py events
python promo_audio.py
python promo.py render vertical
python promo.py render landscape
python promo_export.py
```

Requires Python 3.12 with Pillow, NumPy, SciPy and `edge-tts`, plus `ffmpeg` on PATH.

## Footage and privacy

- **Tablet footage** comes from a real recording of PadDeck on a tablet. Before use, every frame was extracted with the PC name (under the logo) blurred, and the media title in the Control Centre blurred. The recording itself and the extracted frames are **not** included because they come from a personal device.
- **Desktop footage** uses demo-mode screenshots (`assets/`), which replace the PC name, network address and user folder with examples.
- A second screen recording that showed personal accounts, messages and an email address was **not used at all**.
- Nothing is faked: every tap shown is a real tap from the recording, and the "reply from your PC" messages are the real confirmations PadDeck shows after the PC carries out the action.

## Audio licensing

All music and sound effects are synthesized from scratch in `promo_audio.py` — no samples, loops or third-party tracks — so they are free to use with the MIT-licensed project. The voice-over is generated with Microsoft Edge's neural text-to-speech.
