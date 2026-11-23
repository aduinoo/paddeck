// Live PC state: hardware stats, peripherals/batteries, audio, media sessions.
// Polling is adaptive: fast loops only run while at least one tablet is connected.
import os from 'node:os';
import { spawn, execFile } from 'node:child_process';
import { EventEmitter } from 'node:events';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { log } from './log.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const PERIPHERALS_PS1 = path.join(here, '..', 'scripts', 'peripherals.ps1');

function cpuTimes() {
  let idle = 0, total = 0;
  for (const c of os.cpus()) { for (const v of Object.values(c.times)) total += v; idle += c.times.idle; }
  return { idle, total };
}

export class Monitor extends EventEmitter {
  constructor(helper, store) {
    super();
    this.helper = helper;
    this.store = store;
    this.state = {
      stats: { cpu: null, cpuModel: os.cpus()[0]?.model?.trim(), cores: os.cpus().length, ram: null, gpu: null, temps: { cpu: null, gpu: null, source: null }, disks: [], net: null, uptime: os.uptime(), host: os.hostname() },
      peripherals: { battery: [], inputs: [], scannedAt: null },
      audio: { outputs: [], inputs: [], sessions: [] },
      media: { sessions: [], current: null },
      screens: [],
    };
    this.clients = 0;
    this.timers = [];
    this.prevCpu = cpuTimes();
    this.prevNet = null;
    this.lastTrackKey = null;
    this.lhmFailUntil = 0;
  }

  setClients(n) { this.clients = n; }
  get active() { return this.clients > 0; }

  start() {
    const every = (ms, fn, idleMs) => {
      let last = 0;
      const t = setInterval(async () => {
        const now = Date.now();
        const period = this.active ? ms : (idleMs ?? ms * 10);
        if (now - last < period - 50) return;
        last = now;
        try { await fn(); } catch (e) { /* transient errors are expected (devices unplugging) */ }
      }, Math.min(ms, 1000));
      this.timers.push(t);
      fn().catch(() => {});
    };
    every(1000, () => this.pollStats(), 10000);
    every(1500, () => this.pollAudio(), 5000);
    every(2000, () => this.pollSessions(), 30000);
    every(1000, () => this.pollMedia(), 10000);
    every(30000, () => this.pollDisks(), 120000);
    every(60000, () => this.pollPeripherals(), 120000);
    every(30000, () => this.pollScreens(), 60000);
    this.startGpu();
  }

  stop() { this.timers.forEach(clearInterval); if (this.gpuProc) this.gpuProc.kill(); }

  set(key, value) { this.state[key] = value; this.emit('update', { [key]: value }); }

  async pollStats() {
    const cur = cpuTimes();
    const dt = cur.total - this.prevCpu.total;
    const cpu = dt > 0 ? Math.round(100 * (1 - (cur.idle - this.prevCpu.idle) / dt)) : null;
    this.prevCpu = cur;
    const total = os.totalmem(), free = os.freemem();
    const s = this.state.stats;
    s.cpu = cpu;
    s.ram = { used: total - free, total, percent: Math.round(100 * (total - free) / total) };
    s.uptime = os.uptime();
    try {
      const n = await this.helper.call('sys.net');
      const now = Date.now();
      if (this.prevNet) {
        const sec = (now - this.prevNet.t) / 1000;
        s.net = { rx: Math.max(0, (n.rx - this.prevNet.rx) / sec), tx: Math.max(0, (n.tx - this.prevNet.tx) / sec), interfaces: n.interfaces };
      }
      this.prevNet = { ...n, t: now };
    } catch {}
    await this.pollLhm();
    this.emit('update', { stats: s });
  }

  async pollDisks() { this.state.stats.disks = await this.helper.call('sys.drives'); }

  async pollScreens() {
    const screens = await this.helper.call('sys.screens');
    if (JSON.stringify(screens) !== JSON.stringify(this.state.screens)) this.set('screens', screens);
  }

  // NVIDIA: nvidia-smi streams utilisation + temperature once per second (one long-lived process).
  startGpu() {
    const run = () => {
      const p = spawn('nvidia-smi', ['--query-gpu=name,utilization.gpu,temperature.gpu,memory.used,memory.total', '--format=csv,noheader,nounits', '-lms', '1000'], { windowsHide: true });
      this.gpuProc = p;
      let buf = '';
      p.stdout.on('data', (d) => {
        buf += d;
        let i;
        while ((i = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
          const [name, util, temp, mu, mt] = line.split(',').map((x) => x.trim());
          if (!name) continue;
          const num = (x) => (x === undefined || isNaN(Number(x)) ? null : Number(x));
          this.state.stats.gpu = { name, usage: num(util), memUsed: num(mu) && num(mu) * 1048576, memTotal: num(mt) && num(mt) * 1048576, source: 'nvidia-smi' };
          this.state.stats.temps.gpu = num(temp);
        }
      });
      p.on('error', () => { this.state.stats.gpu = { name: null, usage: null, source: null }; });
      p.on('exit', () => { this.gpuProc = null; setTimeout(run, 15000); });
    };
    run();
  }

  // Optional CPU temperature via LibreHardwareMonitor's built-in web server (Options > Remote Web Server).
  async pollLhm() {
    const url = this.store.config.hardware?.lhmUrl;
    if (!url || Date.now() < this.lhmFailUntil) return;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(800) });
      const data = await res.json();
      let cpuTemp = null, gpuTemp = null;
      const walk = (node, ctx) => {
        const img = node.ImageURL || '';
        const c = img.includes('cpu') ? 'cpu' : img.includes('nvidia') || img.includes('ati') || img.includes('intel') && img.includes('gpu') ? 'gpu' : ctx;
        if (node.Type === 'Temperature' || /°C/.test(node.Value || '')) {
          const v = parseFloat(String(node.Value).replace(',', '.'));
          if (!isNaN(v)) {
            if (c === 'cpu' && (cpuTemp === null || /package|tctl|tdie/i.test(node.Text))) cpuTemp = v;
            if (c === 'gpu' && gpuTemp === null && /core|gpu/i.test(node.Text)) gpuTemp = v;
          }
        }
        for (const ch of node.Children || []) walk(ch, c);
      };
      walk(data, null);
      const t = this.state.stats.temps;
      t.cpu = cpuTemp; t.source = 'LibreHardwareMonitor';
      if (gpuTemp !== null && t.gpu === null) t.gpu = gpuTemp;
    } catch {
      this.state.stats.temps.cpu = null;
      this.lhmFailUntil = Date.now() + 30000;
    }
  }

  pollPeripherals() {
    return new Promise((resolve) => {
      execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', PERIPHERALS_PS1], { windowsHide: true, timeout: 30000 }, (err, out) => {
        if (err) { log.warn('Peripheral scan failed', err.message); return resolve(); }
        try {
          const p = JSON.parse(out);
          p.battery = [].concat(p.battery || []);
          p.inputs = [].concat(p.inputs || []);
          p.scannedAt = Date.now();
          // Sleeping Bluetooth devices sometimes don't answer one scan; keep their last real
          // reading (with its timestamp) for up to 10 minutes rather than flicker to "Unavailable".
          for (const b of p.battery) b.readAt = p.scannedAt;
          for (const old of this.state.peripherals.battery || []) {
            if (!p.battery.some((b) => b.address === old.address) && p.scannedAt - (old.readAt || 0) < 10 * 60 * 1000 && p.inputs.some((i) => i.address === old.address) !== false) p.battery.push(old);
          }
          this.set('peripherals', p);
          this.emit('peripherals', p);
        } catch (e) { log.warn('Peripheral scan parse error', e.message); }
        resolve();
      });
    });
  }

  async pollAudio() {
    const a = await this.helper.call('audio.list');
    const prev = this.state.audio;
    const changed = JSON.stringify(a.outputs) !== JSON.stringify(prev.outputs) || JSON.stringify(a.inputs) !== JSON.stringify(prev.inputs);
    if (!changed) return;
    const prevOut = prev.outputs.find((d) => d.isDefault)?.id, prevIn = prev.inputs.find((d) => d.isDefault)?.id;
    const prevMic = prev.inputs.find((d) => d.isDefault)?.muted;
    this.state.audio = { ...prev, outputs: a.outputs, inputs: a.inputs };
    this.emit('update', { audio: this.state.audio });
    const out = a.outputs.find((d) => d.isDefault), inp = a.inputs.find((d) => d.isDefault);
    if (prev.outputs.length && out && out.id !== prevOut) this.emit('notice', { kind: 'audioDeviceChanged', text: `Audio output: ${out.name}` });
    if (prev.inputs.length && inp && inp.id !== prevIn) this.emit('notice', { kind: 'audioDeviceChanged', text: `Microphone: ${inp.name}` });
    if (prev.inputs.length && inp && inp.id === prevIn && inp.muted !== prevMic) this.emit('notice', { kind: 'micMuted', text: inp.muted ? 'Microphone muted' : 'Microphone live' });
  }

  async pollSessions() {
    const sessions = await this.helper.call('audio.sessions');
    if (JSON.stringify(sessions) !== JSON.stringify(this.state.audio.sessions)) {
      this.state.audio = { ...this.state.audio, sessions };
      this.emit('update', { audio: this.state.audio });
    }
  }

  // Picks the YouTube Music session: installed YT Music web app (Chrome/Edge PWA id), a pinned
  // session, then any browser session, then whatever Windows considers current.
  pickMedia(sessions) {
    const pinned = this.store.config.youtubeMusic?.pinnedAppId;
    const YTM_APP = 'cinhimbnkkaeohfgghhklpknlkffjgod';
    return sessions.find((s) => pinned && s.appId === pinned)
      || sessions.find((s) => s.appId?.includes(YTM_APP))
      || sessions.find((s) => /chrome|msedge|edge|brave|opera|firefox/i.test(s.appId) && s.status === 'playing')
      || sessions.find((s) => s.isCurrent)
      || sessions[0] || null;
  }

  async pollMedia() {
    let sessions = await this.helper.call('media.state', { art: false });
    let cur = this.pickMedia(sessions);
    const key = cur ? `${cur.appId}|${cur.title}|${cur.artist}` : null;
    if (key && key !== this.lastTrackKey) {
      sessions = await this.helper.call('media.state', { art: true });
      cur = this.pickMedia(sessions);
      this.lastTrackKey = key;
      const art = cur?.art || null;
      if (art !== this.state.mediaArt) this.set('mediaArt', art);
    }
    if (!cur && this.state.mediaArt) { this.lastTrackKey = null; this.set('mediaArt', null); }
    const isYtm = !!cur && (cur.appId?.includes('cinhimbnkkaeohfgghhklpknlkffjgod') || /chrome|msedge/i.test(cur.appId || ''));
    this.set('media', { sessions: sessions.map(({ art, ...s }) => s), current: cur ? { ...cur, isBrowser: isYtm } : null });
  }
}
