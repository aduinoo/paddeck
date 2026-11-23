// Persistent storage in %APPDATA%\PadDeck (never inside the install folder, so updates
// can't overwrite user data). Atomic writes + rolling backups.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { defaultConfig } from './defaults.js';
import { log } from './log.js';

export const DATA_DIR = process.env.PADDECK_DATA || path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'PadDeck');
export const MEDIA_DIR = path.join(DATA_DIR, 'media');
export const SCRIPTS_DIR = path.join(DATA_DIR, 'scripts');
export const BACKUP_DIR = path.join(DATA_DIR, 'backups');
for (const d of [DATA_DIR, MEDIA_DIR, SCRIPTS_DIR, BACKUP_DIR]) fs.mkdirSync(d, { recursive: true });

const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const STATE_FILE = path.join(DATA_DIR, 'companion.json'); // port, paired devices (not exported)

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) {
    if (fs.existsSync(file)) log.error(`Could not parse ${file}: ${e.message}`);
    return fallback;
  }
}

function writeAtomic(file, data) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

// Fill in keys that newer versions added, without touching the user's values.
function mergeDefaults(target, defaults) {
  if (Array.isArray(defaults) || typeof defaults !== 'object' || defaults === null) return target;
  for (const k of Object.keys(defaults)) {
    if (!(k in target)) target[k] = defaults[k];
    else if (target[k] && typeof target[k] === 'object' && !Array.isArray(target[k])) mergeDefaults(target[k], defaults[k]);
  }
  return target;
}

export class Store {
  constructor() {
    let cfg = readJson(CONFIG_FILE, null);
    if (!cfg) {
      // Try the most recent backup before falling back to defaults.
      const b = this.listBackups()[0];
      if (b && fs.existsSync(CONFIG_FILE)) { cfg = readJson(path.join(BACKUP_DIR, b.file), null); if (cfg) log.warn(`Recovered config from backup ${b.file}`); }
    }
    const def = defaultConfig();
    this.config = cfg ? mergeDefaults(cfg, def) : def;
    if (!cfg) this.saveConfig();
    this.state = mergeDefaults(readJson(STATE_FILE, {}), { port: 47800, devices: [], autoStart: false, allowNewPairing: true });
    this.saveTimer = null;
    this.lastBackupDay = null;
  }

  saveConfig() {
    writeAtomic(CONFIG_FILE, this.config);
    const day = new Date().toISOString().slice(0, 10);
    if (this.lastBackupDay !== day) { this.lastBackupDay = day; this.backup('auto'); }
  }

  saveConfigSoon() { clearTimeout(this.saveTimer); this.saveTimer = setTimeout(() => this.saveConfig(), 300); }

  saveState() { writeAtomic(STATE_FILE, this.state); }

  replaceConfig(next) {
    if (!next || typeof next !== 'object' || !Array.isArray(next.profiles) || next.profiles.length === 0) throw new Error('Invalid configuration');
    next.rev = (this.config.rev || 0) + 1;
    this.config = mergeDefaults(next, defaultConfig());
    this.saveConfigSoon();
    return this.config;
  }

  backup(kind = 'manual') {
    const name = `config-${new Date().toISOString().replace(/[:.]/g, '-')}-${kind}.json`;
    writeAtomic(path.join(BACKUP_DIR, name), this.config);
    const all = this.listBackups();
    for (const b of all.filter((b) => b.file.endsWith('-auto.json')).slice(14)) fs.rmSync(path.join(BACKUP_DIR, b.file), { force: true });
    return name;
  }

  listBackups() {
    try {
      return fs.readdirSync(BACKUP_DIR).filter((f) => f.endsWith('.json'))
        .map((f) => ({ file: f, size: fs.statSync(path.join(BACKUP_DIR, f)).size, time: fs.statSync(path.join(BACKUP_DIR, f)).mtimeMs }))
        .sort((a, b) => b.time - a.time);
    } catch { return []; }
  }

  restore(file) {
    if (!/^[\w.-]+\.json$/.test(file)) throw new Error('Bad backup name');
    const data = readJson(path.join(BACKUP_DIR, file), null);
    if (!data) throw new Error('Backup unreadable');
    this.backup('pre-restore');
    return this.replaceConfig(data);
  }
}
