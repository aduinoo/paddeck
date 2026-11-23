// Installed application discovery via the Windows Start menu (Get-StartApps covers desktop
// apps, Store apps and Steam games). Apps launch via shell:AppsFolder\<AppID>.
import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { MEDIA_DIR } from './store.js';
import { log } from './log.js';

const ICON_DIR = path.join(MEDIA_DIR, 'appicons');
fs.mkdirSync(ICON_DIR, { recursive: true });

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
      execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '[Console]::OutputEncoding=[Text.Encoding]::UTF8; Get-StartApps | Select-Object Name,AppID | ConvertTo-Json -Compress'],
        { windowsHide: true, timeout: 30000, maxBuffer: 8 * 1024 * 1024 }, (err, out) => {
          this.loading = null;
          if (err) { log.warn('Get-StartApps failed', err.message); return resolve(this.list); }
          try {
            const raw = [].concat(JSON.parse(out));
            const skip = /^(uninstall|readme|help|website|support|release notes)|uninstall|\.(url|txt|chm|html?)$/i;
            this.list = raw.filter((a) => a.AppID && a.Name && !skip.test(a.Name) && !/^https?:/i.test(a.AppID))
              .map((a) => ({ name: a.Name, appId: a.AppID, kind: a.AppID.includes('!') ? 'store' : /^steam:/i.test(a.AppID) ? 'steam' : 'desktop' }))
              .sort((a, b) => a.name.localeCompare(b.name));
            this.loadedAt = Date.now();
          } catch (e) { log.warn('Start apps parse error', e.message); }
          resolve(this.list);
        });
    });
    return this.loading;
  }

  // Resolve a button's app reference: exact AppID, else best name match.
  async resolve({ appId, name }) {
    const list = await this.all();
    if (appId) { const a = list.find((x) => x.appId === appId); if (a) return a; }
    const q = (name || appId || '').toLowerCase();
    if (!q) return null;
    return list.find((x) => x.name.toLowerCase() === q)
      || list.find((x) => x.name.toLowerCase().startsWith(q))
      || list.find((x) => x.name.toLowerCase().includes(q)) || null;
  }

  async launch(ref, args) {
    const app = await this.resolve(ref);
    if (!app) throw new Error(`App not found: ${ref.name || ref.appId}`);
    if (args) {
      // Arguments need the real executable: AppIDs that are file paths (or known-folder paths).
      const exe = expandKnownFolder(app.appId);
      if (exe && fs.existsSync(exe)) { await this.helper.call('sys.shellExecute', { file: exe, args }); return app; }
    }
    await this.helper.call('sys.shellExecute', { file: 'explorer.exe', args: `shell:AppsFolder\\${app.appId}` });
    return app;
  }

  // Returns a cached PNG file name (served from /media/appicons/...)
  async icon(ref) {
    let parsing;
    if (ref.path && /\.(exe|lnk)$/i.test(ref.path) && fs.existsSync(ref.path)) parsing = ref.path;
    else {
      const app = await this.resolve(ref);
      if (!app) return null;
      parsing = `shell:AppsFolder\\${app.appId}`;
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

const KNOWN = {
  '{6D809377-6AF0-444B-8957-A3773F02200E}': process.env.ProgramW6432 || 'C:\\Program Files',
  '{7C5A40EF-A0FB-4BFC-874A-C0F2E0B9FA8E}': process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)',
  '{F38BF404-1D43-42F2-9305-67DE0B28FC23}': process.env.windir || 'C:\\Windows',
  '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}': path.join(process.env.windir || 'C:\\Windows', 'System32'),
};
function expandKnownFolder(appId) {
  const m = /^(\{[0-9A-F-]+\})\\(.*)$/i.exec(appId);
  if (m && KNOWN[m[1].toUpperCase()]) return path.join(KNOWN[m[1].toUpperCase()], m[2]);
  if (/^[a-z]:\\/i.test(appId)) return appId;
  return null;
}
