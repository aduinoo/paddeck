# Final export: mux video + mix (loudness-normalised), write SRT, voice-over WAV and thumbnail into marketing/.
import os, json, subprocess, shutil
from PIL import Image, ImageDraw, ImageFont, ImageFilter
HERE = os.path.dirname(os.path.abspath(__file__)); B = os.path.join(HERE, 'build'); OUT = os.path.dirname(HERE)

def run(a): subprocess.run(a, check=True)
def srt_time(t):
    ms = int(round(t * 1000)); h, ms = divmod(ms, 3600000); m, ms = divmod(ms, 60000); s, ms = divmod(ms, 1000)
    return f'{h:02d}:{m:02d}:{s:02d},{ms:03d}'

def export_videos():
    for L, name in (('vertical', 'PadDeck_Promo_60s_Vertical.mp4'), ('landscape', 'PadDeck_Promo_60s_Landscape.mp4')):
        v = os.path.join(B, f'video_{L}.mp4')
        if not os.path.exists(v): print('missing', v); continue
        run(['ffmpeg', '-v', 'error', '-y', '-i', v, '-i', os.path.join(B, 'mix.wav'), '-map', '0:v', '-map', '1:a', '-c:v', 'copy',
             '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000', '-c:a', 'aac', '-b:a', '192k', '-t', '60', '-movflags', '+faststart',
             os.path.join(OUT, name)])
        print('wrote', name)

def export_srt():
    subs = json.load(open(os.path.join(B, 'events.json')))['subs']
    with open(os.path.join(OUT, 'PadDeck_Promo_Subtitles.srt'), 'w', encoding='utf8') as f:
        for i, (a, b, s) in enumerate(subs, 1): f.write(f'{i}\n{srt_time(a)} --> {srt_time(b)}\n{s}\n\n')

def export_vo():
    run(['ffmpeg', '-v', 'error', '-y', '-i', os.path.join(B, 'vo_track.wav'), '-af', 'loudnorm=I=-16:TP=-1.5', '-ar', '48000', '-ac', '1',
         os.path.join(OUT, 'PadDeck_Promo_Voiceover.wav')])

def thumbnail():
    W, H = 1280, 720; A = os.path.join(HERE, 'assets')
    BLK = lambda s: ImageFont.truetype('C:/Windows/Fonts/seguibl.ttf', s); BD = lambda s: ImageFont.truetype('C:/Windows/Fonts/segoeuib.ttf', s)
    im = Image.new('RGB', (W, H)); d = ImageDraw.Draw(im)
    for y in range(H): t = y / H; d.line([(0, y), (W, y)], fill=(int(6 + 10 * t), int(5 + 5 * t), int(14 + 30 * t)))
    glow = Image.new('RGB', (W, H)); g = ImageDraw.Draw(glow)
    g.ellipse([560, 20, 1380, 760], fill=(100, 70, 240)); g.ellipse([-260, 380, 380, 980], fill=(20, 100, 160))
    im = Image.blend(im, glow.filter(ImageFilter.GaussianBlur(170)), 0.6).convert('RGBA')
    shot = Image.open(os.path.join(A, 'tablet-home.png')).convert('RGB'); sw = 720; sh = int(shot.height * sw / shot.width)
    shot = shot.resize((sw, sh), Image.LANCZOS); pad = 20
    dev = Image.new('RGBA', (sw + 2 * pad, sh + 2 * pad), (0, 0, 0, 0)); dd = ImageDraw.Draw(dev)
    dd.rounded_rectangle([0, 0, dev.width - 1, dev.height - 1], 40, fill=(16, 16, 22, 255), outline=(90, 90, 120, 255), width=3)
    m = Image.new('L', (sw, sh), 0); ImageDraw.Draw(m).rounded_rectangle([0, 0, sw - 1, sh - 1], 18, fill=255); dev.paste(shot, (pad, pad), m)
    dev = dev.rotate(-10, expand=True, resample=Image.BICUBIC); x0, y0 = 540, 120
    shadow = Image.new('RGBA', (W, H), (0, 0, 0, 0)); shadow.paste((0, 0, 0, 210), (x0 + 24, y0 + 36), dev.split()[3])
    im.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(30))); im.alpha_composite(dev, (x0, y0))
    # tap ring on the Microphone tile
    d = ImageDraw.Draw(im); cx, cy = 735, 272
    for r, a in ((70, 120), (52, 255)): d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=(255, 214, 64, a), width=8)
    d.ellipse([cx - 18, cy - 18, cx + 18, cy + 18], fill=(255, 230, 120, 230))
    logo = Image.open(os.path.join(A, 'icon.png')).convert('RGBA').resize((72, 72)); im.alpha_composite(logo, (56, 50))
    d.text((144, 56), 'PadDeck', font=BD(48), fill=(255, 255, 255))
    def T(xy, s, f, col): d.text(xy, s, font=f, fill=col, stroke_width=6, stroke_fill=(6, 5, 16))
    T((50, 180), 'YOUR PC', BLK(120), (255, 255, 255)); T((50, 310), 'IN ONE', BLK(120), (255, 255, 255)); T((50, 440), 'TAP.', BLK(150), (90, 205, 255))
    d.rounded_rectangle([56, 622, 470, 684], 31, fill=(124, 92, 255)); d.text((84, 628), 'FREE · OPEN SOURCE', font=BD(36), fill=(255, 255, 255))
    im.convert('RGB').save(os.path.join(OUT, 'PadDeck_Promo_Thumbnail.png'), optimize=True)

if __name__ == '__main__':
    export_srt(); export_vo(); thumbnail(); export_videos()
