// PadDeck Windows companion: HTTP (dashboard + API) and WebSocket server for the tablet.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import dgram from 'node:dgram';
import crypto from 'node:crypto';
import { spawn, execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import QRCode from 'qrcode';
import { log } from './log.js';
import { Store, DATA_DIR, MEDIA_DIR, SCRIPTS_DIR, BACKUP_DIR } from './store.js';
import { Auth } from './auth.js';
import { Helper } from './helper.js';
import { Monitor } from './monitor.js';
import { Apps } from './apps.js';
import { Actions } from './actions.js';

const VERSION = '1.0.0';
const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..', '..');
const DIST = path.join(ROOT, 'dashboard', 'dist');
const HELPER_EXE = path.join(ROOT, 'native', 'bin', 'PadDeckHelper.exe');
const DISCOVERY_PORT = 47801;

log.init(DATA_DIR);
const store = new Store();
const PORT = Number(process.env.PADDECK_PORT || store.state.port || 47800);
const auth = new Auth(store);
const helper = new Helper(HELPER_EXE, { tray: !process.env.PADDECK_NO_TRAY });
const monitor = new Monitor(helper, store);
const apps = new Apps(helper);
const notify = (title, text) => helper.call('sys.notify', { title, text }).catch(() => {});
const actions = new Actions({ helper, store, monitor, apps, notify });

// ---------------------------------------------------------------- helpers
function lanAddresses() {
  const out = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const a of list || []) {
      if (a.family !== 'IPv4' || a.internal || a.address.startsWith('169.254.')) continue;
      if (/vEthernet|VirtualBox|VMware|WSL|Hyper-V|Loopback/i.test(name)) continue;
      out.push({ name, address: a.address });
    }
  }
  const rank = (ip) => (ip.startsWith('192.168.') ? 0 : ip.startsWith('10.') ? 1 : 2);
  return out.sort((a, b) => rank(a.address) - rank(b.address));
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.webmanifest': 'application/manifest+json' };

function send(res, code, body, headers = {}) {
  const isObj = typeof body === 'object' && !Buffer.isBuffer(body);
  res.writeHead(code, { 'Content-Type': isObj ? 'application/json' : 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers });
  res.end(isObj ? JSON.stringify(body) : body);
}

function serveFile(res, file, cache = false) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, 'Not found');
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': cache ? 'public, max-age=31536000, immutable' : 'no-cache', 'X-Content-Type-Options': 'nosniff' });
    fs.createReadStream(file).pipe(res);
  });
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(new Error('Upload too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

const clientIp = (req) => (req.socket.remoteAddress || '').replace(/^::ffff:/, '');
const isLoopback = (req) => ['127.0.0.1', '::1'].includes(clientIp(req));
// Admin endpoints: loopback only, Host must be localhost (blocks DNS rebinding) and a custom
// header is required (blocks cross-site form posts from web pages open on the PC).
const isAdmin = (req) => isLoopback(req) && /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(req.headers.host || '') && req.headers['x-paddeck-admin'] === '1';

function bearer(req, url) {
  const h = req.headers.authorization || '';
  if (h.startsWith('Bearer ')) return h.slice(7);
  return url.searchParams.get('t');
}

// ---------------------------------------------------------------- WebSocket clients
const clients = new Set();
let disconnectTimers = new Map();

function broadcast(msg, except) {
  const s = JSON.stringify(msg);
  for (const c of clients) if (c.authed && c !== except && c.readyState === 1) c.send(s);
}

function snapshot() {
  return { ...monitor.state, focus: store.config.focus.active, version: VERSION, host: os.hostname() };
}

monitor.on('update', (patch) => broadcast({ type: 'state', patch }));

const batteryWarned = new Map();
monitor.on('peripherals', (p) => {
  const hw = store.config.hardware; const n = store.config.notifications;
  const th = Number(hw.batteryThreshold) || 20;
  for (const b of p.battery) {
    const key = b.address || b.name;
    if (b.battery <= th && !batteryWarned.get(key)) {
      batteryWarned.set(key, true);
      if (n.battery) { broadcast({ type: 'notice', kind: 'battery', level: 'warn', text: `${b.name} battery at ${b.battery}%` }); notify('Low battery', `${b.name} is at ${b.battery}%`); }
    } else if (b.battery > th + 5) batteryWarned.delete(key);
  }
});
monitor.on('notice', (n) => { if (store.config.notifications[n.kind] !== false) broadcast({ type: 'notice', ...n }); });

helper.on('sound.ended', (d) => broadcast({ type: 'soundEnded', key: d.key, error: d.error }));
helper.on('async-error', (e) => { if (!/pen|touch/i.test(e)) log.warn('helper:', e); else broadcast({ type: 'notice', kind: 'input', level: 'error', text: e }); });
helper.on('tray', (what) => {
  const url = `http://localhost:${PORT}/admin${what === 'pair' ? '#pair' : ''}`;
  if (what === 'settings' || what === 'pair') helper.call('sys.shellExecute', { file: url }).catch(() => {});
  if (what === 'restart') restart();
  if (what === 'quit') shutdown();
});

function updateTray() { helper.call('sys.trayText', { text: `PadDeck · ${[...clients].filter((c) => c.authed).length} tablet(s) connected` }).catch(() => {}); }

async function handleWs(ws, msg) {
  const reply = (m) => ws.readyState === 1 && ws.send(JSON.stringify(m));
  switch (msg.type) {
    case 'ping': return reply({ type: 'pong', t: msg.t, server: Date.now() });
    case 'action': {
      try {
        const r = await actions.execute({ ...msg.action, confirmed: !!msg.confirmed }, { device: ws.device });
        reply({ type: 'result', id: msg.id, ok: true, ...r });
        if (r.configChanged) broadcast({ type: 'config', config: store.config });
        if (msg.action?.type === 'app' && store.config.notifications.appLaunched && r.message) broadcast({ type: 'notice', kind: 'appLaunched', text: r.message });
      } catch (e) {
        reply({ type: 'result', id: msg.id, ok: false, error: e.message, needsConfirm: !!e.needsConfirm });
      }
      return;
    }
    case 'pen': {
      // Coordinates arrive normalised (0..1) against the mapped target rectangle.
      const rect = penTarget();
      helper.send('pen', { phase: msg.phase, x: Math.round(rect.x + clamp01(msg.x) * (rect.width - 1)), y: Math.round(rect.y + clamp01(msg.y) * (rect.height - 1)), p: msg.p || 0, tx: msg.tx | 0, ty: msg.ty | 0, r: msg.r | 0, b: !!msg.b, e: !!msg.e });
      return;
    }
    case 'touch': {
      const rect = penTarget();
      helper.send('touch', { contacts: (msg.contacts || []).slice(0, 10).map((c) => ({ id: c.id | 0, phase: c.phase, x: Math.round(rect.x + clamp01(c.x) * (rect.width - 1)), y: Math.round(rect.y + clamp01(c.y) * (rect.height - 1)) })) });
      return;
    }
    case 'config.set': {
      if (msg.baseRev !== undefined && msg.baseRev !== store.config.rev) return reply({ type: 'config', config: store.config, conflict: true });
      try { store.replaceConfig(msg.config); broadcast({ type: 'config', config: store.config }); }
      catch (e) { reply({ type: 'notice', level: 'error', text: e.message }); }
      return;
    }
    case 'apps.list': {
      const list = await apps.all(!!msg.refresh);
      return reply({ type: 'apps', list, scripts: actions.listScripts() });
    }
    case 'icon': {
      try { reply({ type: 'icon', key: msg.key, path: await apps.icon(msg.ref || {}) }); } catch { reply({ type: 'icon', key: msg.key, path: null }); }
      return;
    }
    case 'peripherals.scan': await monitor.pollPeripherals(); return;
    case 'display.status': return reply({ type: 'display', status: await displayStatus(), lan: lanAddresses() });
    case 'display.openHost': {
      const st = await displayStatus();
      if (!st.sunshineInstalled) return reply({ type: 'notice', level: 'error', text: 'Apollo is not installed yet - run setup-second-monitor.ps1 on the PC' });
      await helper.call('sys.shellExecute', { file: st.webUi }).catch(() => {});
      return reply({ type: 'notice', text: 'Opened the Apollo web UI on the PC' });
    }
    case 'media.seek': {
      try { await helper.call('media.control', { appId: msg.appId, action: 'seek', position: Number(msg.position) || 0 }); setTimeout(() => monitor.pollMedia().catch(() => {}), 200); }
      catch (e) { reply({ type: 'notice', level: 'error', text: `Seek not supported by this player: ${e.message}` }); }
      return;
    }
    case 'sound.preview': {
      try { await helper.call('sound.play', { key: 'preview', path: resolveMedia(msg.file), volume: msg.volume ?? 80, exclusive: true }); }
      catch (e) { reply({ type: 'notice', level: 'error', text: e.message }); }
      return;
    }
    case 'sound.master': await helper.call('sound.master', { volume: Number(msg.volume) || 0 }); return;
    case 'backups': return reply({ type: 'backups', list: store.listBackups() });
    case 'backup.create': store.backup('manual'); return reply({ type: 'backups', list: store.listBackups() });
    case 'backup.restore': {
      try { store.restore(msg.file); broadcast({ type: 'config', config: store.config }); reply({ type: 'notice', text: 'Configuration restored' }); }
      catch (e) { reply({ type: 'notice', level: 'error', text: e.message }); }
      return;
    }
    default: return;
  }
}

const clamp01 = (v) => Math.max(0, Math.min(1, Number(v) || 0));
function resolveMedia(file) {
  const f = String(file || '');
  if (path.isAbsolute(f)) return f;
  const full = path.resolve(MEDIA_DIR, f);
  if (!full.startsWith(path.resolve(MEDIA_DIR))) throw new Error('Bad media path');
  return full;
}

function penTarget() {
  const screens = monitor.state.screens;
  const t = store.config.pen.target;
  if (t === 'all' && screens.length) {
    const x = Math.min(...screens.map((s) => s.x)), y = Math.min(...screens.map((s) => s.y));
    return { x, y, width: Math.max(...screens.map((s) => s.x + s.width)) - x, height: Math.max(...screens.map((s) => s.y + s.height)) - y };
  }
  return screens.find((s) => s.name === t) || screens.find((s) => s.primary) || screens[0] || { x: 0, y: 0, width: 1920, height: 1080 };
}

// ---------------------------------------------------------------- HTTP
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = decodeURIComponent(url.pathname);
  try {
    // ---- public
    if (p === '/api/discover') return send(res, 200, { app: 'PadDeck', version: VERSION, host: os.hostname(), port: PORT });
    if (p === '/api/pair' && req.method === 'POST') {
      const body = JSON.parse((await readBody(req, 4096)).toString() || '{}');
      try { const r = auth.pair(body.code, body.name, clientIp(req)); log.info(`Paired new device "${r.device.name}" from ${clientIp(req)}`); updateTray(); notify('Tablet paired', `${r.device.name} can now control this PC`); return send(res, 200, r); }
      catch (e) { log.warn(`Pairing failed from ${clientIp(req)}: ${e.message}`); return send(res, 403, { error: e.message }); }
    }

    // ---- admin (PC only)
    if (p.startsWith('/api/admin/')) {
      if (!isAdmin(req)) return send(res, 403, { error: 'Admin API is only available on the PC itself' });
      return adminApi(req, res, p.slice('/api/admin/'.length), url);
    }

    // ---- authenticated
    if (p.startsWith('/api/') || p.startsWith('/media/')) {
      const dev = auth.verify(bearer(req, url));
      if (!dev) return send(res, 401, { error: 'Not paired' });
      if (p.startsWith('/media/')) {
        const full = path.resolve(MEDIA_DIR, p.slice(7));
        if (!full.startsWith(path.resolve(MEDIA_DIR) + path.sep)) return send(res, 403, 'Forbidden');
        return serveFile(res, full, true);
      }
      if (p === '/api/upload' && req.method === 'PUT') {
        const kind = url.searchParams.get('kind') === 'sound' ? 'sounds' : 'images';
        const orig = String(url.searchParams.get('name') || 'file');
        const ext = path.extname(orig).toLowerCase();
        const allowed = kind === 'sounds' ? ['.mp3', '.wav', '.ogg', '.m4a', '.flac'] : ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg'];
        if (!allowed.includes(ext)) return send(res, 400, { error: `Unsupported file type ${ext}` });
        const data = await readBody(req, 30 * 1024 * 1024);
        const dir = path.join(MEDIA_DIR, kind); fs.mkdirSync(dir, { recursive: true });
        const name = `${crypto.randomBytes(6).toString('hex')}-${path.basename(orig, ext).replace(/[^\w.-]+/g, '_').slice(0, 40)}${ext}`;
        fs.writeFileSync(path.join(dir, name), data);
        return send(res, 200, { file: `${kind}/${name}` });
      }
      if (p === '/api/export') return send(res, 200, store.config, { 'Content-Disposition': `attachment; filename="paddeck-config-${new Date().toISOString().slice(0, 10)}.json"` });
      if (p === '/api/import' && req.method === 'POST') {
        const cfg = JSON.parse((await readBody(req, 10 * 1024 * 1024)).toString());
        store.backup('pre-import');
        store.replaceConfig(cfg);
        broadcast({ type: 'config', config: store.config });
        return send(res, 200, { ok: true });
      }
      return send(res, 404, { error: 'Unknown endpoint' });
    }

    // ---- static dashboard
    if (p === '/admin') {
      if (!isLoopback(req)) return send(res, 403, 'The companion settings page is only available on the PC.');
      return serveFile(res, path.join(DIST, 'admin.html'));
    }
    const file = path.resolve(DIST, '.' + (p === '/' ? '/index.html' : p));
    if (file.startsWith(DIST) && fs.existsSync(file) && fs.statSync(file).isFile()) return serveFile(res, file, p.startsWith('/assets/'));
    return serveFile(res, path.join(DIST, 'index.html'));
  } catch (e) {
    log.error('HTTP error', e);
    if (!res.headersSent) send(res, 500, { error: e.message });
  }
});

async function adminApi(req, res, route, url) {
  const body = req.method === 'POST' ? JSON.parse((await readBody(req, 65536)).toString() || '{}') : {};
  switch (route) {
    case 'state': {
      const { code, expires } = auth.currentCode();
      const addrs = lanAddresses();
      const ip = body.ip || url.searchParams.get('ip') || addrs[0]?.address || 'localhost';
      const pairUrl = `http://${ip}:${PORT}/#pair=${code}`;
      return send(res, 200, {
        version: VERSION, host: os.hostname(), port: PORT, addresses: addrs, pairUrl, code, expires,
        qr: await QRCode.toString(pairUrl, { type: 'svg', margin: 1, color: { dark: '#0b0b12', light: '#ffffff' } }),
        devices: store.state.devices.map(({ tokenHash, ...d }) => ({ ...d, online: [...clients].some((c) => c.device?.id === d.id) })),
        settings: { port: store.state.port, autoStart: await getAutoStart(), allowNewPairing: store.state.allowNewPairing, notifications: store.config.notifications, pen: store.config.pen, hardware: store.config.hardware },
        dataDir: DATA_DIR, scripts: actions.listScripts(), logs: log.tail(300), screens: monitor.state.screens,
        helperRunning: !!helper.proc, display: await displayStatus(),
      });
    }
    case 'rotate': auth.rotate(); return send(res, 200, { ok: true });
    case 'revoke': {
      auth.revoke(body.id);
      for (const c of clients) if (c.device?.id === body.id) c.close(4001, 'Revoked');
      log.info(`Revoked device ${body.id}`);
      return send(res, 200, { ok: true });
    }
    case 'settings': {
      if (body.port !== undefined) { const n = Number(body.port); if (!(n >= 1024 && n <= 65535)) return send(res, 400, { error: 'Port must be 1024-65535' }); store.state.port = n; }
      if (body.allowNewPairing !== undefined) store.state.allowNewPairing = !!body.allowNewPairing;
      if (body.autoStart !== undefined) await setAutoStart(!!body.autoStart);
      if (body.notifications) Object.assign(store.config.notifications, body.notifications);
      if (body.hardware) Object.assign(store.config.hardware, body.hardware);
      if (body.pen) Object.assign(store.config.pen, body.pen);
      store.saveState(); store.saveConfigSoon();
      if (body.notifications || body.hardware || body.pen) broadcast({ type: 'config', config: store.config });
      return send(res, 200, { ok: true, restartNeeded: body.port !== undefined && Number(body.port) !== PORT });
    }
    case 'restart': send(res, 200, { ok: true }); return restart();
    case 'open': {
      const dir = { data: DATA_DIR, scripts: SCRIPTS_DIR, backups: BACKUP_DIR, media: MEDIA_DIR }[body.which];
      if (dir) await helper.call('sys.shellExecute', { file: dir });
      return send(res, 200, { ok: true });
    }
    case 'firewall': {
      // Needs administrator rights: Windows shows a UAC prompt, the user decides.
      const args = `advfirewall firewall add rule name="PadDeck companion" dir=in action=allow protocol=TCP localport=${PORT} profile=private`;
      await helper.call('sys.shellExecute', { file: 'netsh.exe', args, verb: 'runas' }).catch((e) => { throw new Error(`Firewall rule not added: ${e.message}`); });
      return send(res, 200, { ok: true });
    }
    case 'test-notify': notify('PadDeck', 'Notifications are working'); return send(res, 200, { ok: true });
    default: return send(res, 404, { error: 'Unknown admin route' });
  }
}

// ---------------------------------------------------------------- autostart (HKCU Run, no admin needed)
const RUN_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
const launcherVbs = path.join(ROOT, 'PadDeck.vbs');
function getAutoStart() {
  return new Promise((r) => execFile('reg.exe', ['query', RUN_KEY, '/v', 'PadDeck'], { windowsHide: true }, (e, out) => r(!e && /PadDeck/.test(out))));
}
function setAutoStart(on) {
  const args = on ? ['add', RUN_KEY, '/v', 'PadDeck', '/t', 'REG_SZ', '/d', `wscript.exe "${launcherVbs}"`, '/f'] : ['delete', RUN_KEY, '/v', 'PadDeck', '/f'];
  return new Promise((r) => execFile('reg.exe', args, { windowsHide: true }, () => r()));
}

// Second-monitor stack status (virtual display driver + Sunshine host).
async function displayStatus() {
  const pf = process.env.ProgramW6432 || 'C:\\Program Files';
  const apollo = fs.existsSync(path.join(pf, 'Apollo', 'sunshine.exe'));
  const sunshine = fs.existsSync(path.join(pf, 'Sunshine', 'sunshine.exe'));
  const running = await new Promise((r) => execFile('tasklist.exe', ['/FI', 'IMAGENAME eq sunshine.exe', '/NH'], { windowsHide: true }, (e, out) => r(!e && /sunshine\.exe/i.test(out))));
  const virtualScreens = monitor.state.screens.filter((s) => /virtual|idd|mtt|sudo|parsec/i.test(`${s.monitor} ${s.adapter}`));
  return { apolloInstalled: apollo, sunshineInstalled: apollo || sunshine, hostRunning: running, virtualDisplay: virtualScreens.length > 0, virtualScreens, webUi: 'https://localhost:47990' };
}

// ---------------------------------------------------------------- WebSocket
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 2 * 1024 * 1024 });
wss.on('connection', (ws, req) => {
  ws.ip = clientIp(req);
  ws.authed = false;
  clients.add(ws);
  const authTimer = setTimeout(() => { if (!ws.authed) ws.close(4000, 'Auth timeout'); }, 5000);
  ws.on('message', async (raw) => {
    let msg; try { msg = JSON.parse(raw); } catch { return; }
    if (!ws.authed) {
      if (msg.type !== 'auth') return;
      const dev = auth.verify(msg.token);
      if (!dev) { ws.send(JSON.stringify({ type: 'auth', ok: false })); return ws.close(4001, 'Not paired'); }
      ws.authed = true; ws.device = dev; clearTimeout(authTimer);
      auth.touch(dev, ws.ip); store.saveState();
      clearTimeout(disconnectTimers.get(dev.id));
      monitor.setClients([...clients].filter((c) => c.authed).length);
      ws.send(JSON.stringify({ type: 'auth', ok: true, device: { id: dev.id, name: dev.name } }));
      ws.send(JSON.stringify({ type: 'config', config: store.config }));
      ws.send(JSON.stringify({ type: 'state', patch: snapshot(), full: true }));
      log.info(`Tablet connected: ${dev.name} (${ws.ip})`);
      updateTray();
      return;
    }
    handleWs(ws, msg).catch((e) => log.warn('ws handler', e.message));
  });
  ws.on('close', () => {
    clients.delete(ws);
    monitor.setClients([...clients].filter((c) => c.authed).length);
    if (ws.authed) {
      // Release anything the tablet was holding (pen contact, held modifier keys).
      helper.send('pen', { phase: 'leave', x: 0, y: 0 });
      for (const k of ['ctrl', 'shift', 'alt', 'space']) helper.call('keys.state', { key: k, down: false }).catch(() => {});
      log.info(`Tablet disconnected: ${ws.device.name}`);
      updateTray();
      const id = ws.device.id, name = ws.device.name;
      disconnectTimers.set(id, setTimeout(() => {
        if (![...clients].some((c) => c.device?.id === id) && store.config.notifications.tabletDisconnected) notify('Tablet disconnected', `${name} lost its connection to this PC`);
      }, 15000));
    }
  });
  ws.on('error', () => {});
});

// ---------------------------------------------------------------- discovery (UDP, used by the Android app)
const udp = dgram.createSocket({ type: 'udp4', reuseAddr: true });
udp.on('message', (m, rinfo) => {
  if (m.toString().trim() !== 'PADDECK_DISCOVER') return;
  const reply = Buffer.from(JSON.stringify({ app: 'PadDeck', host: os.hostname(), port: PORT, version: VERSION }));
  udp.send(reply, rinfo.port, rinfo.address);
});
udp.on('error', (e) => log.warn('Discovery socket', e.message));

// ---------------------------------------------------------------- lifecycle
function restart() {
  log.info('Restarting companion');
  closeAll(() => {
    const child = spawn(process.execPath, process.argv.slice(1), { detached: true, stdio: 'ignore', windowsHide: true, env: process.env });
    child.unref();
    process.exit(0);
  });
}
function shutdown() { log.info('Quitting companion'); closeAll(() => process.exit(0)); }
function closeAll(done) {
  monitor.stop(); helper.stop();
  for (const c of clients) c.close(1001, 'Companion stopping');
  try { udp.close(); } catch {}
  server.close(); setTimeout(done, 1200);
}
process.on('SIGINT', shutdown);
process.on('uncaughtException', (e) => log.error('Uncaught', e));
process.on('unhandledRejection', (e) => log.error('Unhandled rejection', e));

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    log.error(`Port ${PORT} is in use - PadDeck is probably already running. Opening its settings page.`);
    spawn('explorer.exe', [`http://localhost:${PORT}/admin`], { detached: true, stdio: 'ignore' }).unref();
    process.exit(0);
  }
  log.error('Server error', e);
});

server.listen(PORT, '0.0.0.0', () => {
  helper.start();
  helper.once('ready', () => { monitor.start(); apps.all().catch(() => {}); updateTray(); });
  try { udp.bind(DISCOVERY_PORT); } catch {}
  const a = lanAddresses()[0];
  log.info(`PadDeck companion ${VERSION} listening on port ${PORT}`);
  log.info(`Tablet URL: http://${a ? a.address : 'localhost'}:${PORT}   Settings: http://localhost:${PORT}/admin   Data: ${DATA_DIR}`);
  if (!fs.existsSync(DIST)) log.warn(`Dashboard build not found at ${DIST}. Run the installer or "npm run build" in dashboard/.`);
});
