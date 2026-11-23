// Installed application discovery (Start menu + registry + desktop shortcuts), launching,
// icon extraction and a read-only file browser for picking files/folders from the tablet.
import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MEDIA_DIR } from './store.js';
import { log } from './log.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const APPS_PS1 = path.join(here, '..', 'scripts', 'apps.ps1');
const ICON_DIR = path.join(MEDIA_DIR, 'appicons');
fs.mkdirSync(ICON_DIR, { recursive: true });

const norm = (s) => String(s || '').toLowerCase().replace(/\(.*?\)|x64|x86|64-bit|\d+(\.\d+)+|- en-us|version/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const SKIP_NAME = /^(uninstall|readme|help|website|support|release notes|license)|uninstall|\.(txt|chm|html?)$/i;
const SKIP_PATH = /OfficeClickToRun|\\Package Cache\\|unins\d*\.exe$/i;

export class Apps {
  constructor(helper) {
    this.helper = helper;
    this.list = [];
    this.loadedAt = 0;
    this.loading = null;
  }

  async all(force = false) {
    if (!force && this.list.length && Date.now() - this.loadedAt < 10 * 60 * 1000) return this.list;
    if (this.loading) return this.loading;
    this.loading = new Promise((resolve) => {
      execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', APPS_PS1],
        { windowsHide: true, timeout: 60000, maxBuffer: 16 * 1024 * 1024 }, (err, out) => {
          this.loading = null;
          if (err) { log.warn('App discovery failed', err.message); return resolve(this.list); }
          try {
            const raw = [].concat(JSON.parse(out));
            const seen = new Map();
            for (const a of raw) {
              if (!a.name || SKIP_NAME.test(a.name) || (a.path && SKIP_PATH.test(a.path))) continue;
              const key = norm(a.name);
              if (!key || seen.has(key)) continue;
              const id = a.appId || `path:${a.path}`;
              seen.set(key, { id, name: a.name.replace(/\s+\d+(\.\d+){1,3}$/, ''), appId: a.appId || null, path: a.path || null, source: a.source,
                kind: a.appId ? (a.appId.includes('!') ? 'store' : /^steam:/i.test(a.appId) ? 'steam' : 'desktop') : a.source });
            }
            this.list = [...seen.values()].sort((x, y) => x.name.localeCompare(y.name));
            this.loadedAt = Date.now();
            log.info(`Discovered ${this.list.length} applications`);
          } catch (e) { log.warn('App discovery parse error', e.message); }
          resolve(this.list);
        });
    });
    return this.loading;
  }

  // Resolve a reference: exact id/appId/path, else best name match.
  async resolve({ appId, name, path: p, id }) {
    const list = await this.all();
    const byId = id || appId || (p && `path:${p}`);
    if (byId) { const a = list.find((x) => x.id === byId || x.appId === byId); if (a) return a; }
    if (p && fs.existsSync(p)) return { id: `path:${p}`, name: name || path.basename(p), path: p, appId: null };
    const q = norm(name || appId || '');
    if (!q) return null;
    return list.find((x) => norm(x.name) === q) || list.find((x) => norm(x.name).startsWith(q)) || list.find((x) => norm(x.name).includes(q)) || null;
  }

  async launch(ref, args) {
    const app = await this.resolve(ref);
    if (!app) throw new Error(`App not found: ${ref.name || ref.appId || ref.path}`);
    if (app.path) {
      await this.helper.call('sys.shellExecute', { file: app.path, args: args || '' });
      return app;
    }
    if (args) {
      const exe = expandKnownFolder(app.appId);
      if (exe && fs.existsSync(exe)) { await this.helper.call('sys.shellExecute', { file: exe, args }); return app; }
    }
    await this.helper.call('sys.shellExecute', { file: 'explorer.exe', args: `shell:AppsFolder\\${app.appId}` });
    return app;
  }

  // Cached PNG icon for an app, file or folder (served from /media/appicons/...)
  async icon(ref) {
    let parsing;
    if (ref.path && fs.existsSync(ref.path)) parsing = path.normalize(ref.path);
    else {
      const app = await this.resolve(ref);
      if (!app) return null;
      parsing = app.path || `shell:AppsFolder\\${app.appId}`;
    }
    const file = crypto.createHash('sha1').update(parsing).digest('hex').slice(0, 16) + '.png';
    const full = path.join(ICON_DIR, file);
    if (!fs.existsSync(full)) {
      const data = await this.helper.call('sys.shellIcon', { name: parsing, size: 128 });
      if (!data) return null;
      fs.writeFileSync(full, Buffer.from(data.split(',')[1], 'base64'));
    }
    return `appicons/${file}`;
  }
}

// ---------------------------------------------------------------- file browser (read-only listing)
const home = os.homedir();
export function places() {
  const p = [
    ['Desktop', path.join(home, 'Desktop'), 'Monitor'], ['Documents', path.join(home, 'Documents'), 'FileText'],
    ['Downloads', path.join(home, 'Downloads'), 'Download'], ['Pictures', path.join(home, 'Pictures'), 'Image'],
    ['Videos', path.join(home, 'Videos'), 'Film'], ['Music', path.join(home, 'Music'), 'Music'],
  ].filter(([, d]) => fs.existsSync(d)).map(([name, p, icon]) => ({ name, path: p, icon, type: 'dir' }));
  for (let c = 67; c <= 90; c++) {
    const d = `${String.fromCharCode(c)}:\\`;
    try { if (fs.existsSync(d)) p.push({ name: `${String.fromCharCode(c)}: drive`, path: d, icon: 'HardDrive', type: 'dir' }); } catch {}
  }
  return p;
}

export function listDir(dir) {
  const full = path.resolve(String(dir || home));
  const entries = [];
  for (const d of fs.readdirSync(full, { withFileTypes: true })) {
    if (d.name.startsWith('$') || /^(desktop\.ini|thumbs\.db|ntuser)/i.test(d.name)) continue;
    const p = path.join(full, d.name);
    let isDir = d.isDirectory();
    let size = null, mtime = null;
    try { const st = fs.statSync(p); isDir = st.isDirectory(); size = isDir ? null : st.size; mtime = st.mtimeMs; } catch { continue; }
    entries.push({ name: d.name, path: p, type: isDir ? 'dir' : 'file', ext: isDir ? '' : path.extname(d.name).slice(1).toLowerCase(), size, mtime });
  }
  entries.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name, undefined, { numeric: true }) : a.type === 'dir' ? -1 : 1));
  const parent = path.dirname(full);
  return { path: full, parent: parent !== full ? parent : null, entries: entries.slice(0, 2000) };
}

const KNOWN = {
  '{6D809377-6AF0-444B-8957-A3773F02200E}': process.env.ProgramW6432 || 'C:\\Program Files',
  '{7C5A40EF-A0FB-4BFC-874A-C0F2E0B9FA8E}': process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)',
  '{F38BF404-1D43-42F2-9305-67DE0B28FC23}': process.env.windir || 'C:\\Windows',
  '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}': path.join(process.env.windir || 'C:\\Windows', 'System32'),
};
function expandKnownFolder(appId) {
  const m = /^(\{[0-9A-F-]+\})\\(.*)$/i.exec(appId || '');
  if (m && KNOWN[m[1].toUpperCase()]) return path.join(KNOWN[m[1].toUpperCase()], m[2]);
  if (/^[a-z]:\\/i.test(appId || '')) return appId;
  return null;
}
