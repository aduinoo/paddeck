// Action engine. Every action from a tablet is validated against this allowlist of types;
// there is no generic "run a command line" action. Scripts may only run from the approved
// scripts folder on the PC, and destructive operations require explicit confirmation.
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { SCRIPTS_DIR, MEDIA_DIR } from './store.js';
import { log } from './log.js';

const DESTRUCTIVE = new Set(['shutdown', 'restart', 'sleep', 'signout']);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isKeyList = (k) => Array.isArray(k) && k.length > 0 && k.length <= 8 && k.every((x) => typeof x === 'string' && x.length <= 20);

function run(file, args) {
  return new Promise((resolve, reject) => execFile(file, args, { windowsHide: true, timeout: 15000 }, (e, out) => (e ? reject(e) : resolve(out))));
}

export class Actions {
  constructor({ helper, store, monitor, apps, notify }) {
    Object.assign(this, { helper, store, monitor, apps, notify });
  }

  get cfg() { return this.store.config; }

  findDevice(list, ref) {
    if (!ref) return null;
    return list.find((d) => d.id === ref.id) || list.find((d) => d.name === ref.name) || null;
  }

  async execute(action, ctx = {}, depth = 0) {
    if (!action || typeof action.type !== 'string') throw new Error('Invalid action');
    if (depth > 3) throw new Error('Macro nesting too deep');
    const h = this.helper;
    switch (action.type) {
      case 'app': {
        const app = await this.apps.launch({ appId: action.appId, name: action.name, path: action.path, id: action.id }, action.args);
        return { message: `Launched ${app.name}` };
      }
      case 'url': {
        const u = new URL(String(action.url));
        if (!['http:', 'https:', 'mailto:', 'steam:', 'spotify:', 'ms-settings:', 'discord:'].includes(u.protocol)) throw new Error('URL scheme not allowed');
        await h.call('sys.shellExecute', { file: u.href });
        return { message: `Opened ${u.host || u.protocol}` };
      }
      case 'open': { // file, folder or program path on the PC
        const p = String(action.path || '');
        if (!path.isAbsolute(p) || !fs.existsSync(p)) throw new Error('Path not found on PC');
        await h.call('sys.shellExecute', { file: p, args: action.args || '' });
        return { message: `Opened ${path.basename(p)}` };
      }
      case 'ytmusic': {
        const url = this.cfg.youtubeMusic?.url || 'https://music.youtube.com';
        const app = await this.apps.resolve({ name: 'YouTube Music' });
        if (app) { await this.apps.launch({ appId: app.appId }); return { message: 'Opened YouTube Music app' }; }
        await h.call('sys.shellExecute', { file: url });
        return { message: 'Opened YouTube Music' };
      }
      case 'keys': {
        if (!isKeyList(action.keys)) throw new Error('Invalid key combination');
        await h.call('keys.combo', { keys: action.keys, holdMs: action.holdMs || 0 });
        return {};
      }
      case 'keyState': {
        await h.call('keys.state', { key: String(action.key), down: !!action.down });
        return {};
      }
      case 'text': {
        await h.call('keys.text', { text: String(action.text || '').slice(0, 2000) });
        return {};
      }
      case 'macro': {
        const steps = Array.isArray(action.steps) ? action.steps.slice(0, 50) : [];
        for (const s of steps) {
          if (s.type === 'delay') await sleep(Math.min(10000, Math.max(0, Number(s.ms) || 0)));
          else await this.execute(s.type === 'action' ? s.action : s, ctx, depth + 1);
        }
        return { message: 'Macro finished' };
      }
      case 'media': {
        const cur = this.monitor.state.media.current;
        const act = String(action.action);
        if (!['play', 'pause', 'toggle', 'next', 'prev', 'stop', 'seek'].includes(act)) throw new Error('Unknown media action');
        try {
          await h.call('media.control', { appId: action.appId || cur?.appId, action: act, position: Number(action.position) || 0 });
        } catch (e) {
          // Fall back to global media keys when no controllable session exists.
          const key = { toggle: 'mediaplaypause', play: 'mediaplaypause', pause: 'mediaplaypause', next: 'medianext', prev: 'mediaprev', stop: 'mediastop' }[act];
          if (!key) throw e;
          await h.call('keys.combo', { keys: [key] });
        }
        setTimeout(() => this.monitor.pollMedia().catch(() => {}), 250);
        return {};
      }
      case 'volume': {
        const out = this.monitor.state.audio.outputs.find((d) => d.isDefault);
        const id = action.deviceId || null;
        if (action.mode === 'mute') { await h.call('audio.setMute', { id, flow: 'output', mute: action.value ?? null }); }
        else {
          const cur = (id ? this.monitor.state.audio.outputs.find((d) => d.id === id) : out)?.volume ?? 50;
          const step = Number(action.step) || 5;
          const v = action.mode === 'up' ? cur + step : action.mode === 'down' ? cur - step : Number(action.value);
          if (isNaN(v)) throw new Error('Invalid volume');
          await h.call('audio.setVolume', { id, flow: 'output', volume: Math.max(0, Math.min(100, v)) });
          if (action.mode !== 'set') await h.call('audio.setMute', { id, flow: 'output', mute: false });
        }
        await this.monitor.pollAudio();
        return {};
      }
      case 'micVolume': {
        await h.call('audio.setVolume', { id: action.deviceId || null, flow: 'input', volume: Math.max(0, Math.min(100, Number(action.value))) });
        await this.monitor.pollAudio();
        return {};
      }
      case 'micMute': {
        const muted = await h.call('audio.setMute', { id: action.deviceId || null, flow: 'input', mute: action.value ?? null });
        await this.monitor.pollAudio();
        return { state: muted };
      }
      case 'output':
      case 'input': {
        const list = action.type === 'output' ? this.monitor.state.audio.outputs : this.monitor.state.audio.inputs;
        const dev = this.findDevice(list, { id: action.deviceId, name: action.deviceName });
        if (!dev) throw new Error(`${action.type === 'output' ? 'Output' : 'Microphone'} not connected: ${action.deviceName || action.deviceId}`);
        await h.call('audio.setDefault', { id: dev.id, roles: action.roles || 'default' });
        await this.monitor.pollAudio();
        return { message: `${action.type === 'output' ? 'Output' : 'Microphone'}: ${dev.name}` };
      }
      case 'appVolume': {
        await h.call('audio.setSession', { pid: Number(action.pid), volume: action.volume ?? null, mute: action.mute ?? null });
        await this.monitor.pollSessions();
        return {};
      }
      case 'audioProfile': return this.applyAudioProfile(action.id);
      case 'sound': return this.playSound(action.soundId, action);
      case 'stopSounds': await h.call('sound.stop', { key: action.soundId || null }); return {};
      case 'system': return this.system(action.op, action.confirmed);
      case 'script': return this.script(action);
      case 'focus': return this.toggleFocus(action.value);
      case 'discord': return this.discord(action.op);
      case 'scroll': await h.call('mouse.scroll', { dy: Number(action.dy) || 0, dx: Number(action.dx) || 0 }); return {};
      case 'profile': {
        const prof = this.cfg.profiles.find((p) => p.id === action.profileId);
        if (!prof) throw new Error('Profile not found');
        this.cfg.activeProfileId = prof.id;
        this.store.saveConfigSoon();
        return { message: `Profile: ${prof.name}`, configChanged: true };
      }
      case 'page': case 'mode': case 'none': return {}; // handled on the tablet
      default: throw new Error(`Unknown action type: ${action.type}`);
    }
  }

  async system(op, confirmed) {
    const h = this.helper;
    if (DESTRUCTIVE.has(op) && !confirmed) throw Object.assign(new Error('Confirmation required'), { needsConfirm: true });
    switch (op) {
      case 'lock': await h.call('sys.lock'); return { message: 'PC locked' };
      case 'screenshot': { const f = await h.call('sys.screenshot'); return { message: `Saved ${path.basename(f)} (also on clipboard)` }; }
      case 'snip': await h.call('keys.combo', { keys: ['win', 'shift', 's'] }); return {};
      case 'taskmgr': await h.call('sys.shellExecute', { file: 'taskmgr.exe' }); return { message: 'Task Manager opened' };
      case 'explorer': await h.call('sys.shellExecute', { file: 'explorer.exe' }); return { message: 'File Explorer opened' };
      case 'settings': await h.call('sys.shellExecute', { file: 'ms-settings:' }); return { message: 'Settings opened' };
      case 'sound-settings': await h.call('sys.shellExecute', { file: 'ms-settings:sound' }); return {};
      case 'display-settings': await h.call('sys.shellExecute', { file: 'ms-settings:display' }); return {};
      case 'shutdown': await run('shutdown.exe', ['/s', '/t', '5']); return { message: 'Shutting down in 5 seconds' };
      case 'restart': await run('shutdown.exe', ['/r', '/t', '5']); return { message: 'Restarting in 5 seconds' };
      case 'signout': await run('shutdown.exe', ['/l']); return {};
      case 'sleep': await h.call('sys.sleep'); return { message: 'Going to sleep' };
      case 'cancel-shutdown': await run('shutdown.exe', ['/a']); return { message: 'Shutdown cancelled' };
      default: throw new Error(`Unknown system action ${op}`);
    }
  }

  // Scripts: only .ps1/.bat/.cmd/.exe files that live inside %APPDATA%\PadDeck\scripts.
  async script({ file, args, confirmed, confirm }) {
    const full = path.resolve(SCRIPTS_DIR, String(file || ''));
    if (!full.startsWith(path.resolve(SCRIPTS_DIR) + path.sep)) throw new Error('Scripts must be inside the PadDeck scripts folder');
    if (!fs.existsSync(full)) throw new Error(`Script not found: ${file}`);
    const ext = path.extname(full).toLowerCase();
    const argList = Array.isArray(args) ? args.map(String) : [];
    if (ext === '.ps1') await this.helper.call('sys.shellExecute', { file: 'powershell.exe', args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', `"${full}"`, ...argList.map((a) => `"${a.replace(/"/g, '')}"`)].join(' ') });
    else if (['.bat', '.cmd', '.exe', '.lnk', '.vbs', '.ahk'].includes(ext)) await this.helper.call('sys.shellExecute', { file: full, args: argList.map((a) => `"${a.replace(/"/g, '')}"`).join(' ') });
    else throw new Error('Unsupported script type');
    log.info(`Script launched: ${file}`);
    return { message: `Ran ${path.basename(full)}` };
  }

  listScripts() {
    try { return fs.readdirSync(SCRIPTS_DIR).filter((f) => /\.(ps1|bat|cmd|exe|lnk|vbs|ahk)$/i.test(f)); } catch { return []; }
  }

  async applyAudioProfile(id) {
    const p = this.cfg.audioProfiles.find((x) => x.id === id);
    if (!p) throw new Error('Audio profile not found');
    const h = this.helper;
    const st = this.monitor.state.audio;
    const missing = [];
    if (p.output) { const d = this.findDevice(st.outputs, p.output); if (d) await h.call('audio.setDefault', { id: d.id, roles: 'all' }); else missing.push(p.output.name); }
    if (p.input) { const d = this.findDevice(st.inputs, p.input); if (d) await h.call('audio.setDefault', { id: d.id, roles: 'all' }); else missing.push(p.input.name); }
    if (p.volume !== null && p.volume !== undefined) await h.call('audio.setVolume', { flow: 'output', volume: p.volume });
    if (p.systemMuted !== null && p.systemMuted !== undefined) await h.call('audio.setMute', { flow: 'output', mute: !!p.systemMuted });
    if (p.micVolume !== null && p.micVolume !== undefined) await h.call('audio.setVolume', { flow: 'input', volume: p.micVolume });
    if (p.micMuted !== null && p.micMuted !== undefined) await h.call('audio.setMute', { flow: 'input', mute: !!p.micMuted });
    this.cfg.activeAudioProfileId = p.id;
    this.store.saveConfigSoon();
    await this.monitor.pollAudio();
    return { message: missing.length ? `${p.name} applied (not connected: ${missing.join(', ')})` : `${p.name} profile applied`, configChanged: true };
  }

  allSounds() {
    const out = [];
    for (const prof of this.cfg.profiles) for (const pg of prof.soundboard?.pages || []) for (const s of pg.sounds) out.push(s);
    return out;
  }

  async playSound(soundId, opts = {}) {
    const s = this.allSounds().find((x) => x.id === soundId);
    if (!s) throw new Error('Sound not found');
    if (this.cfg.focus?.active && this.cfg.focus.muteSoundboard) throw new Error('Soundboard is muted while Focus mode is on');
    const file = s.file && path.isAbsolute(s.file) ? s.file : path.join(MEDIA_DIR, String(s.file || ''));
    const prof = this.cfg.profiles.find((p) => p.id === this.cfg.activeProfileId) || this.cfg.profiles[0];
    await this.helper.call('sound.master', { volume: prof.soundboard?.masterVolume ?? 100 });
    await this.helper.call('sound.play', { key: s.id, path: file, volume: opts.volume ?? s.volume ?? 100, exclusive: !!opts.restart });
    return { playing: s.id };
  }

  async toggleFocus(value) {
    const f = this.cfg.focus;
    const on = value === undefined || value === null ? !f.active : !!value;
    const h = this.helper;
    if (on) {
      const out = this.monitor.state.audio.outputs.find((d) => d.isDefault);
      f.restore = { volume: out?.volume ?? null, audioProfileId: this.cfg.activeAudioProfileId || null };
      if (f.audioProfileId) await this.applyAudioProfile(f.audioProfileId).catch((e) => log.warn(e.message));
      if (f.volume !== null && f.volume !== undefined) await h.call('audio.setVolume', { flow: 'output', volume: f.volume });
      if (f.silenceToasts) await setToasts(false).catch((e) => log.warn('Toast toggle failed', e.message));
      if (f.muteSoundboard) await h.call('sound.stop', { key: null });
      if (f.minimize) await h.call('keys.combo', { keys: ['win', 'd'] });
      for (const a of f.launch || []) await this.apps.launch(a).catch((e) => log.warn(e.message));
    } else {
      if (f.restore?.volume !== null && f.restore?.volume !== undefined) await h.call('audio.setVolume', { flow: 'output', volume: f.restore.volume });
      if (f.silenceToasts) await setToasts(true).catch(() => {});
    }
    f.active = on;
    this.store.saveConfigSoon();
    await this.monitor.pollAudio();
    return { message: on ? 'Focus mode on' : 'Focus mode off', configChanged: true };
  }

  async discord(op) {
    const d = this.cfg.discord;
    switch (op) {
      case 'launch': {
        const app = await this.apps.resolve({ appId: 'com.squirrel.Discord.Discord', name: 'Discord' });
        if (!app) throw new Error('Discord is not installed');
        await this.apps.launch({ appId: app.appId });
        return { message: 'Discord launched' };
      }
      // Discord has no public local API for mute/deafen; these send the keybinds configured
      // in Discord (User Settings > Keybinds) which Discord listens for globally.
      case 'mute': await this.helper.call('keys.combo', { keys: d.muteKeys, holdMs: 30 }); return { message: 'Sent Discord mute keybind' };
      case 'deafen': await this.helper.call('keys.combo', { keys: d.deafenKeys, holdMs: 30 }); return { message: 'Sent Discord deafen keybind' };
      default: throw new Error('Unknown Discord action');
    }
  }
}

// Windows' "Notifications" master switch (HKCU ToastEnabled). Windows 11's Do Not Disturb has
// no public API; turning toasts off is the supported per-user equivalent and applies immediately
// to new toast notifications.
async function setToasts(enabled) {
  await run('reg.exe', ['add', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\PushNotifications', '/v', 'ToastEnabled', '/t', 'REG_DWORD', '/d', enabled ? '1' : '0', '/f']);
}
