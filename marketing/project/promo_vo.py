# Voice-over for the PadDeck 60 s promo: generated female neural voice (Microsoft "Aria", en-US).
import os, subprocess, sys, json
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'build', 'vo'); os.makedirs(OUT, exist_ok=True)
VOICE = 'en-US-AriaNeural'
# (start time in the video, text, rate)
LINES = [
    (0.9, "What if you could control your entire PC with just a tap?", '+0%'),
    (5.3, "Meet PadDeck. Your personal Stream Deck, designed to make controlling your computer easier, faster and more convenient.", '+16%'),
    (12.4, "Launch your favourite apps, control your audio, manage your workflow, play your music and access your favourite shortcuts. Everything is just one tap away.", '+4%'),
    (25.4, "Make it yours. Add your favourite applications, organize your buttons and build a workspace that fits the way you work.", '+4%'),
    (36.6, "Connect your tablet to your desktop and turn it into your own customizable control deck.", '+0%'),
    (47.0, "Less clicking around. More time doing what matters.", '-4%'),
    (54.8, "Ready to take control? Give PadDeck a try.", '-2%'),
]
def dur(p):
    return float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', p], capture_output=True, text=True).stdout)
if __name__ == '__main__':
    info = []
    for i, (t, text, rate) in enumerate(LINES):
        mp3 = os.path.join(OUT, f'line{i}.mp3'); wav = mp3[:-4] + '.wav'
        subprocess.run([sys.executable, '-m', 'edge_tts', '--voice', VOICE, f'--rate={rate}', '--text', text, '--write-media', mp3], check=True, capture_output=True)
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', mp3, '-af', 'silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse', '-ar', '48000', '-ac', '1', wav], check=True)
        d = dur(wav); info.append({'start': t, 'text': text, 'dur': round(d, 3), 'file': wav})
        print(f'{t:5.1f} +{d:4.2f} -> {t + d:5.2f}  {text[:50]}')
    json.dump(info, open(os.path.join(OUT, 'lines.json'), 'w'), indent=1)
