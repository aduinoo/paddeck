# PadDeck promo soundtrack: original synthesized music + sound effects (no third-party samples),
# timed to build/events.json, mixed under the voice-over with ducking.
import os, json, numpy as np
from scipy.signal import butter, sosfilt, fftconvolve
from scipy.io import wavfile

HERE = os.path.dirname(os.path.abspath(__file__)); B = os.path.join(HERE, 'build')
SR = 48000; DUR = 60.0; N = int(SR * DUR); BPM = 120; BEAT = 60 / BPM
rng = np.random.default_rng(7)

def sec(x): return int(round(x * SR))
def tt(d): return np.arange(int(d * SR)) / SR
def lp(x, f, o=2): return sosfilt(butter(o, f, 'low', fs=SR, output='sos'), x)
def hp(x, f, o=2): return sosfilt(butter(o, f, 'high', fs=SR, output='sos'), x)
def bp(x, lo, hi, o=2): return sosfilt(butter(o, [lo, hi], 'band', fs=SR, output='sos'), x)
def env(d, a=0.005, r=None, curve=4.0):
    t = tt(d); e = np.minimum(1, t / max(a, 1e-4))
    if r is None: r = d
    return e * np.exp(-curve * t / r)
def add(buf, x, t0, g=1.0):
    i = sec(t0)
    if i >= len(buf): return
    x = x[:len(buf) - i]; buf[i:i + len(x)] += g * x
def saw(f, d, voices=3, det=0.006):
    t = tt(d); out = np.zeros_like(t)
    for v in range(voices):
        ff = f * (1 + det * (v - (voices - 1) / 2)); ph = rng.random()
        out += 2 * ((t * ff + ph) % 1) - 1
    return out / voices
def sq(f, d): t = tt(d); return np.sign(np.sin(2 * np.pi * f * t))
def sine(f, d): return np.sin(2 * np.pi * f * tt(d))
def reverb(x, secs=1.6, mix=0.3, seed=1):
    r = np.random.default_rng(seed); n = sec(secs); ir = r.standard_normal(n) * np.exp(-5 * np.arange(n) / n)
    ir = lp(ir, 6000); ir /= np.sqrt((ir ** 2).sum())
    return (1 - mix) * x + mix * fftconvolve(x, ir)[:len(x)] * 0.9
def note(n): return 440 * 2 ** ((n - 69) / 12)   # MIDI -> Hz

# ------------------------------------------------------------------ music
CH = [(57, 60, 64), (53, 57, 60), (48, 52, 55), (55, 59, 62)]  # Am F C G
ROOT = [45, 41, 48, 43]
def chord_at(t): return int(t // 2) % 4

kick = np.zeros(N); snare = np.zeros(N); hats = np.zeros(N); bass = np.zeros(N); pad = np.zeros(N); arp = np.zeros(N); lead = np.zeros(N); fx = np.zeros(N)

def kick_hit(g=1.0):
    d = 0.42; t = tt(d); f = 46 + 110 * np.exp(-t * 28); ph = 2 * np.pi * np.cumsum(f) / SR
    k = np.sin(ph) * np.exp(-t * 7.5); k[:120] += rng.standard_normal(120) * 0.25 * np.linspace(1, 0, 120)
    return np.tanh(k * 1.6) * g
def clap_hit():
    d = 0.3; n = rng.standard_normal(sec(d)); e = np.zeros(sec(d))
    for o in (0, 0.011, 0.022): e[sec(o):] += np.exp(-np.arange(sec(d) - sec(o)) / SR * (40 if o < 0.02 else 14))
    return bp(n, 900, 6000) * e * 0.55
def hat(open_=False):
    d = 0.22 if open_ else 0.05; n = hp(rng.standard_normal(sec(d)), 7000, 4)
    return n * env(d, 0.001, d, 5 if open_ else 6) * (0.22 if open_ else 0.16)

def sections(t):
    if t < 0.8: return set()
    if t < 2.85: return {'pad_swell'}
    if t < 5.0: return {'pad', 'arp_soft'}
    if t < 12.0: return {'pad', 'kick', 'hat', 'bass'}
    if t < 42.0: return {'pad', 'kick', 'hat', 'bass', 'clap', 'arp'}
    if t < 46.0: return {'pad', 'build', 'bass'} | ({'kick'} if t < 45.5 else set())
    if t < 54.0: return {'pad', 'kick', 'hat', 'ohat', 'bass', 'clap', 'arp', 'lead'}
    return {'pad_out', 'arp_soft'}

# step through 16th notes
for i in range(int(DUR / (BEAT / 4))):
    t = i * BEAT / 4; s = sections(t); step = i % 16; c = chord_at(t)
    if 'kick' in s and step % 4 == 0: add(kick, kick_hit(1.15 if t >= 46 else 1.0), t)
    if 'clap' in s and step in (4, 12): add(snare, clap_hit(), t)
    if 'hat' in s and step % 4 == 2: add(hats, hat(), t)
    if 'hat' in s and t >= 12 and step % 2 == 1: add(hats, hat() * 0.5, t)
    if 'ohat' in s and step % 8 == 6: add(hats, hat(True), t)
    if 'bass' in s and step % 2 == 0:
        f = note(ROOT[c] - 12 + (12 if step in (6, 14) else 0)); d = BEAT / 2 * 0.9
        b = lp(saw(f, d, 2, 0.003), 700 if t < 46 else 1100) * env(d, 0.004, d, 2.0)
        b += 0.6 * sine(f, d) * env(d, 0.004, d, 2.0)
        add(bass, b, t, 0.42)
    if ('arp' in s or 'arp_soft' in s) and True:
        seq = [0, 1, 2, 1, 2, 0, 1, 2]
        n_ = CH[c][seq[step % 8]] + (12 if step >= 8 else 0) + 12
        d = BEAT / 4 * 1.6; a = lp(sq(note(n_), d) * 0.5 + saw(note(n_), d, 1), 3500) * env(d, 0.002, d, 7)
        add(arp, a, t, 0.10 if 'arp_soft' in s else 0.13)
    if 'lead' in s and step % 4 == 0:
        n_ = CH[c][(step // 4) % 3] + 24; d = BEAT * 0.9
        l = lp(saw(note(n_), d, 3, 0.01), 5000) * env(d, 0.01, d, 3)
        add(lead, l, t, 0.07)
    if 'build' in s:
        u = (t - 42) / 4; every = 4 if u < 0.5 else (2 if u < 0.8 else 1)
        if step % every == 0 and t < 45.5: add(snare, clap_hit() * (0.4 + 0.6 * u), t, 0.8)

# pads: one chord per bar
for bar in range(30):
    t = bar * 2.0; s = sections(t + 0.01) | sections(t + 1.9)
    if not s & {'pad', 'pad_swell', 'pad_out'}: continue
    c = chord_at(t); d = 2.3
    p = sum(saw(note(n), d, 3, 0.008) for n in CH[c]) / 3 + 0.5 * saw(note(CH[c][0] - 12), d, 2)
    cut = 900 if 'pad_swell' in s else (1600 if t < 46 else 2400)
    p = lp(p, cut) * np.minimum(1, tt(d) / 0.4) * np.minimum(1, (d - tt(d)) / 0.4)
    add(pad, p, t, 0.11)
# swell into the hook
sw = tt(2.1); add(fx, lp(rng.standard_normal(len(sw)), 2500) * (sw / 2.1) ** 2 * 0.10, 0.75)
# riser into the drop (42-45.9)
d = 3.9; r = tt(d); f = 200 + 2800 * (r / d) ** 2
riser = bp(rng.standard_normal(len(r)), 300, 7000) * (r / d) ** 2 * 0.25
riser += 0.05 * np.sin(2 * np.pi * np.cumsum(f) / SR) * (r / d)
add(fx, riser, 42.0)

# sidechain pump on sustained parts
pump = np.ones(N)
for i in range(int(DUR / BEAT)):
    t = i * BEAT
    if 'kick' in sections(t):
        k = sec(t); L = sec(0.3); pump[k:k + L] = np.minimum(pump[k:k + L], 0.35 + 0.65 * (np.arange(min(L, N - k)) / L) ** 0.7)
music_mono_dry = kick * 0.55 + bass * pump + hats + snare * 0.6
wet = reverb((pad + arp + lead) * pump + fx, 1.8, 0.35)
L_ = music_mono_dry + wet + reverb(snare * 0.2, 1.2, 1.0, 3)
R_ = music_mono_dry + reverb((pad + arp + lead) * pump + fx, 1.8, 0.35, 2) + reverb(snare * 0.2, 1.2, 1.0, 4)
music = np.stack([L_, R_], 1)
# outro fade
fade = np.ones(N); fade[sec(59.2):] = np.linspace(1, 0, N - sec(59.2)); music *= fade[:, None]
music /= np.abs(music).max() + 1e-9

# ------------------------------------------------------------------ sound effects
def s_click():
    d = 0.06; x = hp(rng.standard_normal(sec(d)), 2500) * env(d, 0.0005, 0.012, 1) * 0.6
    x += sine(2100, d) * env(d, 0.0005, 0.02, 1.5) * 0.25 + sine(140, d) * env(d, 0.001, 0.04, 2) * 0.5
    return x
def s_tick(): return s_click()[:sec(0.04)] * 0.6
def s_snap(k=0):
    d = 0.08; f = 1500 + 90 * (k % 8)
    return sine(f, d) * env(d, 0.0005, 0.03, 2) * 0.35 + hp(rng.standard_normal(sec(d)), 4000) * env(d, 0.0005, 0.01, 1) * 0.3 + sine(180, d) * env(d, 0.001, 0.04, 2) * 0.3
def s_confirm(soft=False):
    out = np.zeros(sec(0.6)); notes = [1318.5] if soft else [987.8, 1318.5]
    for j, f in enumerate(notes):
        d = 0.45; x = (sine(f, d) + 0.3 * sine(f * 2, d)) * env(d, 0.003, 0.25, 3)
        add(out, x, j * 0.07)
    return out * (0.12 if soft else 0.2)
def s_whoosh(big=False):
    d = 0.7 if big else 0.38; t = tt(d); n = rng.standard_normal(len(t)); out = np.zeros(len(t))
    blocks = 24
    for b in range(blocks):   # sweeping band
        a, z = b * len(t) // blocks, (b + 1) * len(t) // blocks; u = b / blocks
        fc = 300 + (3500 if big else 2500) * np.sin(np.pi * u)
        seg = bp(n, max(80, fc * 0.6), min(16000, fc * 1.6))[a:z]; out[a:z] = seg
    e = np.sin(np.pi * np.clip(t / d, 0, 1)) ** 2
    x = out * e * (0.35 if big else 0.22)
    if big: x += lp(rng.standard_normal(len(t)), 200) * e * 0.3
    return x
def s_impact(g=1.0, d=1.4):
    t = tt(d); f = 34 + 70 * np.exp(-t * 6); x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 3.2)
    x += lp(rng.standard_normal(len(t)), 900) * np.exp(-t * 14) * 0.7
    return reverb(np.tanh(x * 1.5), 2.2, 0.35, 9) * 0.55 * g
def s_startup():
    d = 1.3; out = np.zeros(sec(d + 1.0))
    for j, n in enumerate([57, 64, 69, 72, 76]):
        x = (sine(note(n), 1.2) * 0.6 + 0.4 * saw(note(n), 1.2, 2)) ; x = lp(x, 2500 + j * 800) * env(1.2, 0.02, 1.0, 3)
        add(out, x, j * 0.12)
    sweep = tt(d); out[:len(sweep)] += bp(rng.standard_normal(len(sweep)), 1500, 9000) * (sweep / d) * 0.05
    return reverb(out, 2.0, 0.45, 5) * 0.32
def s_drag():
    d = 0.5; t = tt(d); return bp(rng.standard_normal(len(t)), 500, 2500) * np.sin(np.pi * t / d) * 0.12
def s_logo():
    out = np.zeros(sec(3.0))
    for j, n in enumerate([69, 73, 76, 81, 85]):
        d = 2.4; x = (sine(note(n), d) + 0.25 * sine(note(n) * 3, d)) * env(d, 0.004, 1.5, 3); add(out, x, j * 0.05)
    return reverb(out, 2.5, 0.5, 6) * 0.22
def s_final():
    out = np.zeros(sec(2.0))
    for j, n in enumerate([81, 85, 88]):
        d = 1.2; x = (sine(note(n), d) + 0.3 * sine(note(n) * 2, d)) * env(d, 0.003, 0.6, 3); add(out, x, j * 0.09)
    out = reverb(out, 2.0, 0.4, 8) * 0.28; imp = s_impact(0.35, 1.0); out[:len(imp)] += imp; return out

ev = json.load(open(os.path.join(B, 'events.json')))
sfx = np.zeros(N)
for e in ev['events']:
    k, t0 = e['kind'], e['t']
    x = {'click': s_click, 'tick': s_tick, 'confirm': lambda: s_confirm(False), 'confirm_soft': lambda: s_confirm(True),
         'whoosh': s_whoosh, 'whoosh_big': lambda: s_whoosh(True), 'impact': s_impact, 'impact_soft': lambda: s_impact(0.45, 1.0),
         'startup': s_startup, 'drop': lambda: s_impact(1.1, 1.8), 'logo': s_logo, 'final': s_final, 'drag': s_drag,
         'snap': lambda: s_snap(e.get('k', 0)), 'snap_big': lambda: s_snap(3) * 1.6}[k]()
    if k.startswith('whoosh'): t0 -= 0.18 if k == 'whoosh' else 0.32   # whoosh peaks on the cut
    if k == 'logo': add(sfx, s_whoosh(True)[::-1] * 0.6, t0 - 0.62)  # reverse swell into the logo
    add(sfx, x, max(0, t0))
sfx = np.tanh(sfx * 1.2) / 1.2

# ------------------------------------------------------------------ voice-over track + ducking
vo = np.zeros(N); active = np.zeros(N)
for ln in json.load(open(os.path.join(B, 'vo', 'lines.json'))):
    sr, x = wavfile.read(ln['file']); x = x.astype(np.float64) / 32768.0
    if x.ndim > 1: x = x.mean(1)
    add(vo, x, ln['start']); a = sec(ln['start']); active[a:a + len(x)] = 1
vo = hp(vo, 80) / (np.abs(vo).max() + 1e-9) * 0.89
# smooth duck envelope (attack 80 ms, release 300 ms)
duck = np.ones(N); g = 1.0; target_lo = 0.34
step_a = 1 / sec(0.08); step_r = 1 / sec(0.30)
act_ds = active[::48]; dd = np.ones(len(act_ds))
for i in range(len(act_ds)):
    g = max(target_lo, g - step_a * 48) if act_ds[i] else min(1.0, g + step_r * 48); dd[i] = g
duck = np.repeat(dd, 48)[:N]

mix = music * (0.38 * duck)[:, None] + (sfx * 0.55)[:, None] + vo[:, None]
mix /= max(1.0, np.abs(mix).max() / 0.97)
def w(name, x): wavfile.write(os.path.join(B, name), SR, (np.clip(x, -1, 1) * 32767).astype(np.int16))
w('vo_track.wav', vo); w('music.wav', music * 0.9); w('sfx.wav', sfx); w('mix.wav', mix)
print('peaks: music', round(np.abs(music).max(), 2), 'sfx', round(np.abs(sfx).max(), 2), 'vo', round(np.abs(vo).max(), 2))
