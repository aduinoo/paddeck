# PadDeck 60-second promo - frame-accurate renderer (PIL -> ffmpeg).
# Usage: python promo.py events            -> writes build/events.json (sound-effect cue sheet)
#        python promo.py render vertical   -> build/video_vertical.mp4 (silent)
#        python promo.py render landscape  -> build/video_landscape.mp4 (silent)
#        python promo.py still vertical 12.5 -> build/still.png
# All footage is the real app: demo-mode screenshots (PC name/address replaced) and the real tablet
# recording with the PC name and a personal media title blurred (frames pre-extracted to CLIPFRAMES).
import os, sys, json, math, subprocess, functools
from PIL import Image, ImageDraw, ImageFont, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
BUILD = os.path.join(HERE, 'build'); os.makedirs(BUILD, exist_ok=True)
ASSETS = os.path.join(HERE, 'assets')
CLIPFRAMES = os.environ.get('PADDECK_CLIPFRAMES', os.path.join(BUILD, 'clipframes'))
FPS, DUR = 30, 60.0
ACC = (124, 92, 255); CYAN = (90, 205, 255); YEL = (255, 204, 51); WHITE = (255, 255, 255)

def F(sz, w='b'):
    return ImageFont.truetype({'b': 'C:/Windows/Fonts/segoeuib.ttf', 'k': 'C:/Windows/Fonts/seguibl.ttf', 'r': 'C:/Windows/Fonts/segoeui.ttf', 's': 'C:/Windows/Fonts/seguisb.ttf'}[w], sz)

# ------------------------------------------------------------------ easing
def clamp(x, a=0.0, b=1.0): return max(a, min(b, x))
def eio(x): x = clamp(x); return 0.5 - 0.5 * math.cos(math.pi * x)
def eout(x): x = clamp(x); return 1 - (1 - x) ** 3
def eexpo(x): x = clamp(x); return 1 if x >= 1 else 1 - 2 ** (-10 * x)
def eback(x, s=1.7): x = clamp(x); x -= 1; return x * x * ((s + 1) * x + s) + 1
def lerp(a, b, t): return a + (b - a) * t

# ------------------------------------------------------------------ layouts
LAYOUTS = {
    'vertical': dict(W=1080, H=1920, box=(40, 650, 1000, 900), text=('center', 540, 420, 980, 108), sub_y=1655,
                     split=[(40, 640, 1000, 330), (40, 1000, 1000, 560)], split_text=('center', 540, 420, 980, 120), logo=(60, 70)),
    'landscape': dict(W=1920, H=1080, box=(620, 110, 1220, 762), text=('left', 80, 500, 500, 88), sub_y=965,
                      split=[(90, 250, 840, 560), (990, 250, 840, 560)], split_text=('center', 960, 150, 1700, 96), logo=(60, 44)),
}

# ------------------------------------------------------------------ sources
@functools.lru_cache(None)
def img(name):
    p = os.path.join(ASSETS, name + '.png')
    return Image.open(p).convert('RGB')

@functools.lru_cache(maxsize=64)
def clipframe(i):
    i = max(1, min(i, 1746))
    return Image.open(os.path.join(CLIPFRAMES, f'{i:05d}.jpg')).convert('RGB')
def clip_at(t): return clipframe(int(round(t * 30)) + 1)

# clip geometry (1280x800 recording)
def ctile(c, r): return (96 + c * 235.8 + 110.9, 140 + r * 140 + 63)
SB = {'Tada': (185, 270), 'Ring': (1171, 270)}
TAPS = {1.6: ('Task Manager', ctile(2, 2)), 3.1: ('YouTube Music', ctile(2, 1)), 4.6: ('Discord', ctile(3, 1)), 8.1: ('Chrome', ctile(4, 1)),
        9.9: ('Volume −', ctile(2, 0)), 11.2: ('Volume +', ctile(3, 0)), 12.4: ('Mute', ctile(1, 0)), 16.0: ('Lock', ctile(1, 3)),
        27.6: ('Screenshot', ctile(1, 1)), 31.5: ('Explorer', ctile(3, 2)), 33.5: ('Settings', ctile(4, 2)),
        36.6: ('Tada', SB['Tada']), 37.8: ('Tada', SB['Tada']), 40.7: ('Ring', SB['Ring'])}
CONFIRM = {1.6, 3.1, 4.6, 8.1, 16.0, 27.6, 31.5}    # taps whose PC reply appears as a message on the tablet
# demo screenshot geometry (tablet 1280x800)
def rtile(c, r): return (84 + c * 239.6 + 112, 124 + r * 148 + 67)

# ------------------------------------------------------------------ storyboard
# shot: dict(t0, t1, kind='clip'|'img'|fn, ...). cam = ((cx,cy,h),(cx,cy,h)) in source pixels, eased over the shot.
SHOTS = []; TEXTS = []; PILLS = []; GLOWS = []; EVENTS = []
def shot(t0, t1, **k): k.update(t0=t0, t1=t1); SHOTS.append(k); return k
def clip(t0, src0, speed, cam, t1=None, section=False, slot='box', **k):
    s = shot(t0, t1, kind='clip', src0=src0, speed=speed, cam=cam, section=section, slot=slot, **k); return s
def still(t0, t1, name, cam, section=False, slot='box', **k):
    return shot(t0, t1, kind='img', name=name, cam=cam, section=section, slot=slot, **k)
def text(t0, t1, s, mode='main', size=None): TEXTS.append(dict(t0=t0, t1=t1, s=s, mode=mode, size=size))
def pill(t0, t1, s, anchor, shotref, side='up'): PILLS.append(dict(t0=t0, t1=t1, s=s, anchor=anchor, shot=shotref, side=side))
def glow(t0, t1, rect, shotref): GLOWS.append(dict(t0=t0, t1=t1, rect=rect, shot=shotref))
def ev(t, kind, **k): EVENTS.append(dict(t=round(t, 3), kind=kind, **k))

def segment(t0, src0, src1, speed, cam, **k):
    t1 = t0 + (src1 - src0) / speed
    s = clip(t0, src0, speed, cam, t1=t1, **k)
    return s, t1

def build():
    SHOTS.clear(); TEXTS.clear(); PILLS.clear(); GLOWS.clear(); EVENTS.clear()
    # S1 hook (custom draw 0-5); interface reveal from 2.85
    shot(0.0, 5.0, kind='hook', section=True)
    ev(0.15, 'startup'); ev(0.8, 'impact_soft'); ev(2.62, 'click'); ev(2.75, 'whoosh_big'); ev(2.88, 'impact')
    text(1.05, 2.72, 'WHAT IF YOUR ENTIRE *PC*...')
    text(3.05, 4.98, 'WAS AT YOUR *FINGERTIPS?*')
    # S2 meet PadDeck
    still(5.0, 6.7, 'desktop-editor', ((800, 480, 960), (760, 470, 780)), section=True); ev(5.0, 'whoosh_big')
    still(6.7, 8.1, 'desktop-dashboard', ((720, 450, 900), (760, 380, 640))); ev(6.7, 'whoosh')
    s = still(8.1, 9.5, 'tablet-add', ((640, 400, 800), (640, 330, 620))); ev(8.1, 'whoosh'); pill(8.3, 9.4, 'Gaming', (274, 70), s, 'down')
    s = still(9.5, 10.8, 'tablet-home', ((640, 330, 620), (640, 400, 800))); ev(9.5, 'whoosh'); pill(9.7, 10.7, 'Home', (110, 70), s, 'down')
    still(10.8, 12.0, 'tablet-control', ((640, 400, 800), (560, 360, 560))); ev(10.8, 'whoosh')
    text(5.2, 8.45, 'MEET *PADDECK*'); text(8.6, 11.95, 'YOUR PERSONAL *PC CONTROL CENTER.*')
    # S3 one tap - real tablet recording, taps synced
    t = 12.0
    s, t = segment(t, 2.6, 5.4, 1.4, ((560, 330, 520), (640, 300, 520)), section=True); ev(12.0, 'whoosh_big')
    s, t = segment(t, 7.6, 9.4, 1.4, ((860, 300, 520), (900, 290, 470)))
    text(12.15, 15.2, 'LAUNCH *APPS.*'); ev(t, 'whoosh')
    s, t = segment(t, 9.5, 12.9, 1.5, ((560, 220, 470), (520, 240, 500)))
    text(15.4, 17.5, 'CONTROL YOUR *AUDIO.*'); ev(t, 'whoosh')
    s = still(t, t + 1.6, 'tablet-add', ((760, 470, 440), (790, 487, 400)))
    glow(t + 0.35, t + 0.95, (563, 420, 224, 134), s); ev(t + 0.35, 'tick'); pill(t + 0.35, t + 1.0, 'Play / Pause', (675, 420), s)
    glow(t + 0.9, t + 1.55, (803, 420, 224, 134), s); ev(t + 0.9, 'tick'); pill(t + 0.95, t + 1.55, 'Next', (915, 420), s)
    text(t + 0.1, t + 1.55, 'PLAY YOUR *MUSIC.*'); t += 1.6; ev(t, 'whoosh')
    t_wf = t
    s, t = segment(t, 27.2, 29.6, 1.4, ((360, 330, 560), (420, 420, 640)))
    ev(t, 'whoosh'); s, t = segment(t, 1.2, 2.4, 1.0, ((640, 430, 560), (640, 450, 600)))
    s, t = segment(t, 31.1, 32.1, 1.0, ((800, 430, 560), (800, 450, 600)))
    text(t_wf + 0.1, t - 0.05, 'MANAGE YOUR *WORKFLOW.*'); ev(t, 'whoosh')
    t_sb = t
    s, t = segment(t, 36.3, 38.25, 1.0, ((360, 300, 520), (300, 290, 470)))
    text(t_sb + 0.1, 25.0, 'ALL WITH *ONE TAP.*')
    assert abs(t - 25.0) < 0.15, t
    # S4 make it yours
    shot(25.0, 28.0, kind='tiles', section=True); ev(25.0, 'whoosh_big')
    text(25.15, 27.95, 'YOUR *LAYOUT.*')
    for k in range(20): ev(25.0 + 0.15 + k * 0.075, 'snap', k=k)
    ev(27.0, 'drag'); ev(27.55, 'snap_big')
    s = still(28.0, 30.4, 'desktop-editor-add', ((420, 420, 640), (430, 330, 420)), cursor=((700, 640), (465, 292), 29.25)); ev(28.0, 'whoosh')
    ev(29.25, 'click'); ev(29.35, 'confirm_soft'); pill(29.35, 30.35, 'One click adds the tile', (465, 276), s)
    text(28.1, 30.35, 'YOUR *SHORTCUTS.*')
    s = still(30.4, 32.6, 'desktop-editor-designer', ((900, 480, 900), (1330, 470, 640))); ev(30.4, 'whoosh')
    pill(31.2, 32.5, 'Live preview', (1420, 410), s, 'down')
    s = still(32.6, 36.0, 'tablet-edit', ((640, 400, 800), (760, 520, 560))); ev(32.6, 'whoosh')
    glow(33.3, 35.9, (84, 629, 1196, 155), s); pill(33.5, 35.9, 'Tap + to add a tile', (640, 629), s)
    text(30.5, 35.95, 'YOUR *WORKFLOW.*')
    # S5 connect / tap / control - split screen, real pairing screens and real tablet replies
    still(36.0, 40.0, 'desktop-devices', ((422, 420, 330), (422, 420, 300)), slot=0, section=True, tag='PC'); ev(36.0, 'whoosh_big')
    still(36.0, 38.6, 'tablet-pair', ((640, 400, 560), (640, 400, 520)), slot=1, tag='TABLET')
    s = still(38.6, 40.0, 'tablet-home', ((302, 120, 300), (302, 90, 220)), slot=1, tag='TABLET'); ev(38.6, 'whoosh')
    ev(38.8, 'confirm'); glow(38.75, 39.95, (178, 10, 210, 48), s)
    text(36.2, 39.95, '*CONNECT.*', mode='split')
    # tablet taps (bottom) + the PC's reply message enlarged (top)
    ev(40.0, 'whoosh')
    s, t = segment(40.0, 1.2, 3.0, 0.9, ((640, 480, 640), (640, 480, 640)), slot=1, tag='TABLET')
    clip(40.0, 1.2, 0.9, ((640, 756, 70), (640, 756, 64)), t1=t, slot=0, tag='REPLY FROM YOUR PC', reply=True)
    s, t2 = segment(t, 15.6, 17.4, 0.9, ((640, 480, 640), (640, 480, 640)), slot=1, tag='TABLET')
    clip(t, 15.6, 0.9, ((640, 756, 70), (640, 756, 64)), t1=t2, slot=0, tag='REPLY FROM YOUR PC', reply=True); t = t2
    s, t2 = segment(t, 4.2, 5.6, 0.82, ((640, 480, 640), (640, 480, 640)), slot=1, tag='TABLET', t1x=46.0)
    clip(t, 4.2, 0.82, ((640, 756, 70), (640, 756, 64)), t1=46.0, slot=0, tag='REPLY FROM YOUR PC', reply=True)
    SHOTS[-2]['t1'] = 46.0
    text(40.1, 42.6, '*TAP.*', mode='split'); text(42.7, 45.95, '*CONTROL.*', mode='split')
    # S6 payoff montage on the beat (120 BPM)
    ev(46.0, 'drop')
    m = [('clip', 3.0, ((640, 290, 420), (640, 290, 360))), ('clip', 11.1, ((800, 200, 420), (800, 200, 360))),
         ('img', 'tablet-add', ((760, 487, 360), (760, 487, 300))), ('clip', 40.5, ((1060, 280, 420), (1100, 280, 360))),
         ('img', 'desktop-editor-designer', ((1200, 470, 640), (1300, 460, 520))), ('img', 'tablet-control', ((640, 400, 640), (640, 380, 520))),
         ('clip', 51.0, ((640, 420, 640), (640, 400, 560))), ('img', 'tablet-home', ((640, 330, 360), (640, 400, 800)))]
    for i, it in enumerate(m):
        a = 46.0 + i
        if it[0] == 'clip': clip(a, it[1], 1.0, it[2], t1=a + 1.0, section=(i == 0))
        else: still(a, a + 1.0, it[1], it[2], section=(i == 0))
        if i: ev(a, 'whoosh')
    text(46.2, 49.9, 'LESS *CLICKING.*'); text(50.0, 53.9, 'MORE *DOING.*')
    # S7 call to action
    shot(54.0, 60.0, kind='cta', section=True)
    ev(54.0, 'whoosh_big'); ev(54.35, 'logo'); ev(58.6, 'click'); ev(58.68, 'final')
    # tap clicks / confirmations from the recording, mapped into output time
    for sh in SHOTS:
        if sh['kind'] != 'clip' or sh.get('reply'): continue
        for tt, (lab, pt) in TAPS.items():
            src1 = sh['src0'] + (sh['t1'] - sh['t0']) * sh['speed']
            if sh['src0'] <= tt < src1 - 0.05:
                o = sh['t0'] + (tt - sh['src0']) / sh['speed']
                ev(o, 'click'); sh.setdefault('taps', []).append((o, lab, pt))
                if tt in CONFIRM: ev(o + 0.45 / sh['speed'], 'confirm' if 40 <= o < 46 else 'confirm_soft')
    EVENTS.sort(key=lambda e: e['t'])

# ------------------------------------------------------------------ voice-over / subtitles
VO = json.load(open(os.path.join(BUILD, 'vo', 'lines.json')))
KEYWORDS = ['entire PC', 'tap', 'PadDeck', 'Stream Deck', 'apps', 'audio', 'workflow', 'music', 'shortcuts', 'one tap away', 'yours',
            'buttons', 'workspace', 'tablet', 'control deck', 'Less clicking', 'what matters', 'take control', 'easier, faster', 'applications']
def sub_chunks():
    out = []
    for ln in VO:
        words = ln['text'].split(); chunks = []; cur = []
        for w in words:
            cur.append(w)
            if len(' '.join(cur)) > 30 or w.endswith(('.', '?', '!')) or (w.endswith(',') and len(' '.join(cur)) > 18):
                chunks.append(' '.join(cur)); cur = []
        if cur: chunks.append(' '.join(cur))
        total = sum(len(c) + 4 for c in chunks); t = ln['start']
        for c in chunks:
            d = ln['dur'] * (len(c) + 4) / total; out.append((t, t + d, c)); t += d
    return out
SUBS = sub_chunks()

def mark_keywords(s):
    low = s
    for k in sorted(KEYWORDS, key=len, reverse=True):
        i = low.lower().find(k.lower())
        if i >= 0 and '*' not in low[max(0, i - 1):i + len(k) + 1]:
            low = low[:i] + '*' + low[i:i + len(k)] + '*' + low[i + len(k):]
    return low

# ------------------------------------------------------------------ drawing helpers
def rich_line_img(s, font, base, hi, stroke=0):
    """Render a line where *words* are highlighted. Returns RGBA image."""
    parts = []; on = False
    for seg in s.split('*'):
        if seg: parts.append((seg, hi if on else base))
        on = not on
    d0 = ImageDraw.Draw(Image.new('RGBA', (1, 1)))
    w = sum(d0.textlength(p, font=font) for p, _ in parts); asc, desc = font.getmetrics()
    im = Image.new('RGBA', (int(w) + 16 + stroke * 2, asc + desc + 16 + stroke * 2), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    x = 8 + stroke
    for p, col in parts:
        d.text((x, 8 + stroke), p, font=font, fill=col, stroke_width=stroke, stroke_fill=(6, 6, 16))
        x += d.textlength(p, font=font)
    return im

def wrap_rich(s, font, maxw):
    words = s.split(' '); lines = []; cur = ''
    d0 = ImageDraw.Draw(Image.new('RGBA', (1, 1)))
    for w in words:
        test = (cur + ' ' + w).strip()
        if d0.textlength(test.replace('*', ''), font=font) > maxw and cur:
            # keep highlight markers balanced across the break
            if cur.count('*') % 2: cur += '*'; w = '*' + w
            lines.append(cur); cur = w
        else: cur = test
    lines.append(cur); return lines

@functools.lru_cache(None)
def big_text_lines(s, mode, L):
    lay = LAYOUTS[L]; spec = lay['split_text'] if mode == 'split' else lay['text']
    align, x, y, maxw, size = spec
    while True:
        f = F(size, 'k'); lines = wrap_rich(s, f, maxw)
        if len(lines) <= (2 if L == 'vertical' or mode == 'split' else 3) or size < 50: break
        size -= 6
    return [rich_line_img(l, f, WHITE, CYAN) for l in lines], spec, size

@functools.lru_cache(None)
def sub_img(s, L):
    f = F(52 if L == 'vertical' else 44, 'b')
    line = rich_line_img(mark_keywords(s), f, WHITE, YEL)
    pad = 26; bg = Image.new('RGBA', (line.width + pad * 2, line.height + 18), (0, 0, 0, 0))
    ImageDraw.Draw(bg).rounded_rectangle([0, 0, bg.width - 1, bg.height - 1], 24, fill=(8, 8, 18, 200))
    bg.alpha_composite(line, (pad, 6)); return bg

@functools.lru_cache(None)
def pill_img(s, L):
    f = F(30 if L == 'vertical' else 26, 'b'); d0 = ImageDraw.Draw(Image.new('RGBA', (1, 1)))
    w = int(d0.textlength(s, font=f)) + 44; h = 54 if L == 'vertical' else 48
    im = Image.new('RGBA', (w + 4, h + 4), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    d.rounded_rectangle([2, 2, w + 1, h + 1], h // 2, fill=(124, 92, 255, 240), outline=(200, 190, 255, 255), width=2)
    d.text((24, (h - f.size) // 2 - 2), s, font=f, fill=WHITE); return im

@functools.lru_cache(None)
def round_mask(w, h, r=34):
    m = Image.new('L', (w, h), 0); ImageDraw.Draw(m).rounded_rectangle([0, 0, w - 1, h - 1], r, fill=255); return m

@functools.lru_cache(None)
def box_glow(w, h):
    pad = 90; im = Image.new('RGBA', (w + pad * 2, h + pad * 2), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    d.rounded_rectangle([pad + 10, pad + 24, pad + w - 10, pad + h + 10], 40, fill=(0, 0, 0, 190))
    sh = im.filter(ImageFilter.GaussianBlur(30))
    g = Image.new('RGBA', im.size, (0, 0, 0, 0)); ImageDraw.Draw(g).rounded_rectangle([pad - 6, pad - 6, pad + w + 6, pad + h + 6], 44, fill=(110, 80, 255, 90))
    sh.alpha_composite(g.filter(ImageFilter.GaussianBlur(26)))
    ImageDraw.Draw(sh).rounded_rectangle([pad - 1, pad - 1, pad + w, pad + h], 35, outline=(120, 110, 200, 120), width=2)
    return sh

@functools.lru_cache(None)
def background(L):
    lay = LAYOUTS[L]; W, H = lay['W'], lay['H']
    im = Image.new('RGB', (W, H)); d = ImageDraw.Draw(im)
    for y in range(H):
        t = y / H; d.line([(0, y), (W, y)], fill=(int(7 + 9 * t), int(6 + 5 * t), int(16 + 26 * t)))
    return im

@functools.lru_cache(None)
def blob(size, col):
    im = Image.new('RGBA', (size, size), (0, 0, 0, 0)); ImageDraw.Draw(im).ellipse([size * 0.2, size * 0.2, size * 0.8, size * 0.8], fill=col + (120,))
    return im.filter(ImageFilter.GaussianBlur(size // 7))

@functools.lru_cache(None)
def logo_img(sz):
    return Image.open(os.path.join(ASSETS, 'icon.png')).convert('RGBA').resize((sz, sz), Image.LANCZOS)

@functools.lru_cache(None)
def tag_img(s, L):
    f = F(24 if L == 'vertical' else 22, 'b'); d0 = ImageDraw.Draw(Image.new('RGBA', (1, 1)))
    w = int(d0.textlength(s, font=f)) + 50; im = Image.new('RGBA', (w, 40), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    d.rounded_rectangle([0, 0, w - 1, 39], 20, fill=(10, 10, 22, 220), outline=(90, 205, 255, 200), width=2)
    d.ellipse([16, 14, 28, 26], fill=(80, 220, 120)); d.text((36, 6), s, font=f, fill=WHITE); return im

# ------------------------------------------------------------------ camera
def crop_rect(src, cx, cy, h, aspect):
    W, H = src.size; w = h * aspect
    if w > W: w = W; h = w / aspect
    if h > H: h = H; w = h * aspect
    x0 = clamp(cx - w / 2, 0, W - w); y0 = clamp(cy - h / 2, 0, H - h)
    return (x0, y0, x0 + w, y0 + h)

def slot_box(sh, lay):
    s = sh.get('slot', 'box'); return lay['box'] if s == 'box' else lay['split'][s]

def shot_state(sh, t, lay):
    """Return (source image, crop rect, box) for a camera shot at time t."""
    bx, by, bw, bh = slot_box(sh, lay); u = (t - sh['t0']) / max(1e-6, sh['t1'] - sh['t0'])
    (c0, c1) = sh['cam']; e = eio(u)
    cx, cy, h = lerp(c0[0], c1[0], e), lerp(c0[1], c1[1], e), lerp(c0[2], c1[2], e)
    # punch-in transition on entry
    if sh.get('reply'): h = (300 - 20 * e) / (bw / bh) if bw / bh > 2 else (250 - 15 * e) / (bw / bh); cy = 756 if bw / bh > 2 else 748
    p = eout((t - sh['t0']) / 0.22); h *= 1 + 0.10 * (1 - p)
    if sh['kind'] == 'clip':
        src = clip_at(sh['src0'] + (t - sh['t0']) * sh['speed'])
    else:
        src = img(sh['name'])
    return src, crop_rect(src, cx, cy, h, bw / bh), (bx, by, bw, bh)

def map_pt(pt, crop, box):
    x0, y0, x1, y1 = crop; bx, by, bw, bh = box
    return (bx + (pt[0] - x0) * bw / (x1 - x0), by + (pt[1] - y0) * bh / (y1 - y0))

def draw_box(canvas, src, crop, box, alpha=1.0, glowon=True):
    bx, by, bw, bh = [int(v) for v in box]
    frame = src.resize((bw, bh), Image.BICUBIC, box=crop)
    if glowon:
        g = box_glow(bw, bh); canvas.alpha_composite(g if alpha >= 1 else fade(g, alpha), (bx - 90, by - 90))
    m = round_mask(bw, bh)
    if alpha < 1: m = m.point(lambda v: int(v * alpha))
    canvas.paste(frame, (bx, by), m)

def fade(im, a):
    if a >= 0.999: return im
    r = im.copy(); r.putalpha(r.getchannel('A').point(lambda v: int(v * a))); return r

# ------------------------------------------------------------------ overlays
def draw_text_item(canvas, it, t, L):
    lines, spec, size = big_text_lines(it['s'], it['mode'], L)
    align, x, y, maxw, _ = spec
    lh = int(size * 1.08); total = lh * len(lines); top = y - total / 2
    for i, li in enumerate(lines):
        a_in = eout((t - it['t0'] - i * 0.07) / 0.28); a_out = 1 - clamp((t - (it['t1'] - 0.18)) / 0.18)
        a = clamp(min(a_in, a_out));
        if a <= 0: continue
        dy = (1 - a_in) * 46; sc = 1 + 0.04 * (1 - a_in)
        im = li if sc == 1 else li.resize((int(li.width * sc), int(li.height * sc)), Image.BILINEAR)
        px = x - im.width / 2 if align == 'center' else x - 8
        canvas.alpha_composite(fade(im, a), (int(px), int(top + i * lh + dy - 8)))

def draw_ring(d, x, y, u):
    if 0 <= u <= 1:
        r = 22 + 58 * eout(u); a = int(255 * (1 - u))
        d.ellipse([x - r, y - r, x + r, y + r], outline=(255, 214, 64, a), width=7)
    if 0 <= u <= 0.45:
        r = 20 * (1 - u); d.ellipse([x - r, y - r, x + r, y + r], fill=(255, 230, 120, int(230 * (1 - u / 0.45))))

def cursor_img():
    im = Image.new('RGBA', (60, 80), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    pts = [(4, 4), (4, 58), (18, 45), (28, 70), (38, 66), (28, 41), (46, 41)]
    d.polygon(pts, fill=WHITE, outline=(10, 10, 20)); d.line(pts + [pts[0]], fill=(10, 10, 20), width=3)
    return im
CURSOR = cursor_img()

# ------------------------------------------------------------------ custom scenes
def scene_hook(canvas, t, L, lay):
    W, H = lay['W'], lay['H']; bx, by, bw, bh = lay['box']; cxb, cyb = bx + bw / 2, by + bh / 2
    d = ImageDraw.Draw(canvas)
    if t < 2.85:
        if t < 0.8:
            canvas.paste((0, 0, 0), [0, 0, W, H]); return
        # glowing button
        u = (t - 0.8) / 0.45; s = 230 * eback(u) * (0.92 if 2.55 <= t < 2.72 else 1.0)
        pulse = 0.5 + 0.5 * math.sin((t - 0.8) * 6)
        dark = 1 - eout((t - 0.8) / 0.6)
        if dark > 0: canvas.alpha_composite(Image.new('RGBA', (W, H), (0, 0, 0, int(255 * dark))))
        if s > 4:
            gsz = int(s * 2.6); g = blob(520, (110, 80, 255)).resize((gsz, gsz)); canvas.alpha_composite(fade(g, 0.6 + 0.4 * pulse), (int(cxb - gsz / 2), int(cyb - gsz / 2)))
            lg = logo_img(max(8, int(s))); canvas.alpha_composite(lg, (int(cxb - s / 2), int(cyb - s / 2)))
        if 2.62 <= t < 2.85:
            dd = ImageDraw.Draw(canvas); draw_ring(dd, cxb, cyb, (t - 2.62) / 0.5)
        return
    # reveal: box grows out of the button while the camera pulls back from the Microphone tile
    u = eexpo((t - 2.85) / 1.3)
    s0 = 230; rx = lerp(cxb - s0 / 2, bx, u); ry = lerp(cyb - s0 / 2, by, u); rw = lerp(s0, bw, u); rh = lerp(s0, bh, u)
    src = img('tablet-home'); h = lerp(150, 800, eexpo((t - 2.85) / 1.9))
    tc = rtile(0, 0); cx = lerp(tc[0], 640, eio((t - 2.85) / 1.9)); cy = lerp(tc[1], 400, eio((t - 2.85) / 1.9))
    crop = crop_rect(src, cx, cy, h, rw / rh)
    draw_box(canvas, src, crop, (rx, ry, rw, rh))
    fl = 1 - clamp((t - 2.85) / 0.25)
    if fl > 0: canvas.alpha_composite(Image.new('RGBA', (W, H), (255, 255, 255, int(150 * fl))))

def scene_tiles(canvas, t, L, lay):
    bx, by, bw, bh = lay['box']; src = img('tablet-home'); u0 = t - 25.0
    panel = Image.new('RGBA', (bw, bh), (14, 14, 26, 255)); canvas.alpha_composite(box_glow(bw, bh), (bx - 90, by - 90))
    canvas.paste(panel, (bx, by), round_mask(bw, bh))
    cols, rows = 5, 4; gap = 16; tw = (bw - 60 - gap * (cols - 1)) / cols; th = tw * 134 / 224
    gx = bx + 30; gy = by + (bh - (rows * th + (rows - 1) * gap)) / 2
    order = [(c, r) for r in range(rows) for c in range(cols)]
    swap = None
    for k, (c, r) in enumerate(order):
        tc = rtile(c, r); tile = src.crop((int(tc[0] - 112), int(tc[1] - 67), int(tc[0] + 112), int(tc[1] + 67))).resize((int(tw), int(th)), Image.BICUBIC)
        land = 0.15 + k * 0.075; fu = (u0 - (land - 0.32)) / 0.32
        if fu <= 0: continue
        e = eback(fu, 1.4)
        tx, ty = gx + c * (tw + gap), gy + r * (th + gap)
        ang = (k * 137.5) % 360; dist = 900
        sx = tx + math.cos(math.radians(ang)) * dist * (1 - e); sy = ty + math.sin(math.radians(ang)) * dist * (1 - e)
        # drag & swap Discord <-> Chrome at the end
        if (c, r) in ((3, 1), (4, 1)) and u0 > 2.0:
            v = eio((u0 - 2.0) / 0.55); other = (4, 1) if (c, r) == (3, 1) else (3, 1)
            ox, oy = gx + other[0] * (tw + gap), gy + other[1] * (th + gap)
            sx, sy = lerp(tx, ox, v), lerp(ty, oy, v) - math.sin(math.pi * v) * 40
            if (c, r) == (3, 1): swap = (tile, sx, sy, v); continue
        m = round_mask(int(tw), int(th), 18); canvas.paste(tile, (int(sx), int(sy)), m)
    if swap:
        tile, sx, sy, v = swap; sc = 1 + 0.12 * math.sin(math.pi * v)
        tl = tile.resize((int(tile.width * sc), int(tile.height * sc)))
        sh = Image.new('RGBA', (tl.width + 60, tl.height + 60), (0, 0, 0, 0)); ImageDraw.Draw(sh).rounded_rectangle([30, 40, tl.width + 30, tl.height + 40], 18, fill=(0, 0, 0, int(150 * math.sin(math.pi * v))))
        canvas.alpha_composite(sh.filter(ImageFilter.GaussianBlur(12)), (int(sx - 30), int(sy - 30)))
        canvas.paste(tl, (int(sx - (tl.width - tile.width) / 2), int(sy - (tl.height - tile.height) / 2)), round_mask(tl.width, tl.height, 18))

def scene_cta(canvas, t, L, lay):
    W, H = lay['W'], lay['H']; u = t - 54.0
    dark = eout(u / 0.4); canvas.alpha_composite(Image.new('RGBA', (W, H), (4, 4, 10, int(235 * dark))))
    cx = W / 2; vert = L == 'vertical'
    ly = H * (0.30 if vert else 0.24)
    s = 220 * eback((u - 0.35) / 0.5) if vert else 200 * eback((u - 0.35) / 0.5)
    if s > 4:
        pulse = 0.5 + 0.5 * math.sin(u * 3.2); gsz = int(s * 3); g = blob(520, (110, 80, 255)).resize((gsz, gsz))
        canvas.alpha_composite(fade(g, 0.55 + 0.35 * pulse), (int(cx - gsz / 2), int(ly - gsz / 2)))
        canvas.alpha_composite(logo_img(int(s)), (int(cx - s / 2), int(ly - s / 2)))
    def center_text(s_, y, size, t0, t1=99, col=WHITE, hi=CYAN, wt='k'):
        a = clamp(min(eout((t - t0) / 0.3), 1 - clamp((t - t1) / 0.2)))
        if a <= 0: return
        im = big_cache(s_, size, col, hi, wt); dy = (1 - eout((t - t0) / 0.3)) * 30
        canvas.alpha_composite(fade(im, a), (int(cx - im.width / 2), int(y + dy)))
    base = ly + (s / 2 if s else 110) + (70 if vert else 40)
    center_text('PadDeck', base, 76 if vert else 72, 54.5, wt='b')
    center_text('TAKE *CONTROL.*', base + (130 if vert else 120), 104 if vert else 112, 54.6, 56.25)
    center_text('TRY *PADDECK.*', base + (130 if vert else 120), 104 if vert else 112, 56.3)
    center_text('YOUR PC. YOUR RULES.', base + (270 if vert else 255), 46 if vert else 44, 57.0, col=(190, 192, 215), wt='s')
    # GET STARTED button
    a = eback((t - 57.4) / 0.45)
    if a > 0:
        press = 0.93 if 58.6 <= t < 58.75 else 1.0
        bw_, bh_ = (520 if vert else 460) * a * press, (118 if vert else 100) * a * press
        by_ = base + (380 if vert else 335)
        btn = Image.new('RGBA', (int(bw_) + 120, int(bh_) + 120), (0, 0, 0, 0)); dd = ImageDraw.Draw(btn)
        glow_a = 140 + int(80 * math.sin(u * 5))
        dd.rounded_rectangle([60, 60, 60 + bw_, 60 + bh_], bh_ / 2, fill=(124, 92, 255, glow_a)); btn = btn.filter(ImageFilter.GaussianBlur(22))
        dd = ImageDraw.Draw(btn); dd.rounded_rectangle([60, 60, 60 + bw_, 60 + bh_], bh_ / 2, fill=(124, 92, 255, 255), outline=(210, 200, 255), width=3)
        if a > 0.6:
            f = F(int((44 if vert else 38) * a * press), 'k'); tw = dd.textlength('GET STARTED', font=f)
            dd.text((60 + bw_ / 2 - tw / 2, 60 + bh_ / 2 - f.size * 0.62), 'GET STARTED', font=f, fill=WHITE)
        canvas.alpha_composite(btn, (int(cx - bw_ / 2 - 60), int(by_ - 60)))
        if t >= 58.6:
            dd2 = ImageDraw.Draw(canvas); draw_ring(dd2, cx + bw_ * 0.18, by_ + bh_ * 0.55, (t - 58.6) / 0.6)
        center_text('github.com/aduinoo/paddeck', by_ + (bh_ if bh_ else 100) + (50 if vert else 36), 40 if vert else 34, 57.8, col=(150, 200, 255), wt='s')
        if 57.9 <= t < 59.6 and t < 58.6:
            # cursor glides onto the button
            v = eio((t - 57.9) / 0.7); px = lerp(cx + 360, cx + bw_ * 0.18, v); py = lerp(by_ + 260, by_ + bh_ * 0.55, v)
            canvas.alpha_composite(CURSOR, (int(px), int(py)))
    fo = clamp((t - 59.55) / 0.45)
    if fo > 0: canvas.alpha_composite(Image.new('RGBA', (W, H), (0, 0, 0, int(255 * fo))))

@functools.lru_cache(None)
def big_cache(s, size, col, hi, wt): return rich_line_img(s, F(size, wt), col, hi)

# ------------------------------------------------------------------ frame
def render(t, L):
    lay = LAYOUTS[L]; W, H = lay['W'], lay['H']
    canvas = background(L).convert('RGBA')
    # drifting glow blobs
    b1 = blob(1300, (70, 45, 190)); b2 = blob(1100, (20, 90, 150))
    canvas.alpha_composite(b1, (int(W * 0.45 + 160 * math.sin(t * 0.21)) - 650, int(H * 0.25 + 120 * math.cos(t * 0.17)) - 650))
    canvas.alpha_composite(b2, (int(W * 0.1 + 140 * math.cos(t * 0.19)) - 550, int(H * 0.8 + 100 * math.sin(t * 0.23)) - 550))
    active = [s for s in SHOTS if s['t0'] <= t < s['t1']]
    custom = [s for s in active if s['kind'] in ('hook', 'tiles', 'cta')]
    for sh in active:
        if sh['kind'] == 'hook': scene_hook(canvas, t, L, lay)
        elif sh['kind'] == 'tiles': scene_tiles(canvas, t, L, lay)
        elif sh['kind'] == 'cta': scene_cta(canvas, t, L, lay)
        elif sh['kind'] in ('clip', 'img'):
            src, crop, box = shot_state(sh, t, lay); draw_box(canvas, src, crop, box)
            sh['_state'] = (crop, box)
            if sh.get('tag'):
                ti = tag_img(sh['tag'], L); canvas.alpha_composite(ti, (int(box[0] + 18), int(box[1] + 18)))
            d = ImageDraw.Draw(canvas)
            for (o, lab, pt) in sh.get('taps', []):
                if o - 0.05 <= t <= o + 0.9:
                    x, y = map_pt(pt, crop, box); draw_ring(d, x, y, (t - o + 0.05) / 0.6)
            if sh.get('cursor'):
                p0, p1, tc = sh['cursor']; v = eio((t - sh['t0'] - 0.2) / (tc - sh['t0'] - 0.25))
                x, y = map_pt((lerp(p0[0], p1[0], v), lerp(p0[1], p1[1], v)), crop, box)
                if t >= tc: draw_ring(d, x, y, (t - tc) / 0.6)
                canvas.alpha_composite(CURSOR, (int(x - 4), int(y - 4)))
    for g in GLOWS:
        if g['t0'] <= t < g['t1'] and '_state' in g['shot'] and g['shot']['t0'] <= t < g['shot']['t1']:
            crop, box = g['shot']['_state']; x, y, w, h = g['rect']
            (ax, ay), (bx2, by2) = map_pt((x, y), crop, box), map_pt((x + w, y + h), crop, box)
            ax, ay = max(ax, box[0] + 6), max(ay, box[1] + 6); bx2, by2 = min(bx2, box[0] + box[2] - 6), min(by2, box[1] + box[3] - 6)
            a = clamp(min((t - g['t0']) / 0.15, (g['t1'] - t) / 0.15)); pulse = 0.7 + 0.3 * math.sin((t - g['t0']) * 10)
            ov = Image.new('RGBA', canvas.size, (0, 0, 0, 0)); od = ImageDraw.Draw(ov)
            od.rounded_rectangle([ax - 4, ay - 4, bx2 + 4, by2 + 4], 20, outline=(255, 214, 64, int(255 * a * pulse)), width=6)
            canvas.alpha_composite(ov)
    for p in PILLS:
        if p['t0'] <= t < p['t1'] and '_state' in p['shot'] and p['shot']['t0'] <= t < p['shot']['t1']:
            crop, box = p['shot']['_state']; x, y = map_pt(p['anchor'], crop, box)
            im = pill_img(p['s'], L); a = eback((t - p['t0']) / 0.3); out = clamp((p['t1'] - t) / 0.15)
            if a <= 0.02: continue
            sc = max(0.05, a); im2 = im.resize((max(1, int(im.width * sc)), max(1, int(im.height * sc))))
            yy = y - im2.height - 14 if p['side'] == 'up' else y + 30
            xx = clamp(x - im2.width / 2, box[0] + 10, box[0] + box[2] - im2.width - 10)
            canvas.alpha_composite(fade(im2, out), (int(xx), int(yy)))
    # flash on section changes
    for sh in SHOTS:
        if sh.get('section') and sh['t0'] > 0.5 and 0 <= t - sh['t0'] < 0.14:
            canvas.alpha_composite(Image.new('RGBA', (W, H), (255, 255, 255, int(70 * (1 - (t - sh['t0']) / 0.14)))))
    for it in TEXTS:
        if it['t0'] <= t < it['t1']: draw_text_item(canvas, it, t, L)
    if not any(s['kind'] == 'cta' for s in custom) and t >= 5.0:
        lg = logo_img(56); canvas.alpha_composite(lg, lay['logo']); ImageDraw.Draw(canvas).text((lay['logo'][0] + 70, lay['logo'][1] + 4), 'PadDeck', font=F(36, 'b'), fill=WHITE)
    for (a, b, s) in SUBS:
        if a <= t < b:
            im = sub_img(s, L); al = clamp(min((t - a) / 0.08, (b - t) / 0.08 + 0.5))
            canvas.alpha_composite(fade(im, al), (int(W / 2 - im.width / 2), int(lay['sub_y'] - im.height / 2)))
    return canvas.convert('RGB')

def main():
    build()
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'events'
    if cmd == 'events':
        json.dump({'events': EVENTS, 'subs': SUBS}, open(os.path.join(BUILD, 'events.json'), 'w'), indent=0)
        print(len(EVENTS), 'events', len(SUBS), 'subtitle cues'); return
    L = sys.argv[2]
    if cmd == 'still':
        for tt in sys.argv[3:]:
            render(float(tt), L).save(os.path.join(BUILD, f'still_{L}_{tt}.png'))
        return
    lay = LAYOUTS[L]; out = os.path.join(BUILD, f'video_{L}.mp4')
    p = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f"{lay['W']}x{lay['H']}", '-r', str(FPS), '-i', '-',
                          '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', out], stdin=subprocess.PIPE)
    n = int(DUR * FPS)
    for i in range(n):
        p.stdin.write(render(i / FPS, L).tobytes())
        if i % 150 == 0: print(L, i, '/', n, flush=True)
    p.stdin.close(); p.wait(); print('done', out)

if __name__ == '__main__':
    main()
