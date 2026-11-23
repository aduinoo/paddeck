// PadDeck Desktop: the Windows application. Hosts the PadDeck companion (local network server,
// native Windows integration) in the background, with a tray icon, a settings window, the
// native Windows file picker for paired devices, and start-with-Windows.
import { app, BrowserWindow, Tray, Menu, Notification, dialog, nativeImage, shell, screen } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { execFileSync, execFile } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const packaged = app.isPackaged;
// In the installed app, companion/dashboard/helper live in resources/; in development, next door.
const RES = packaged ? process.resourcesPath : path.resolve(here, '..');
const COMPANION = packaged ? path.join(RES, 'companion') : path.join(RES, 'companion');
const DIST = packaged ? path.join(RES, 'dashboard') : path.join(RES, 'dashboard', 'dist');
const HELPER = packaged ? path.join(RES, 'native', 'PadDeckHelper.exe') : path.join(RES, 'native', 'bin', 'PadDeckHelper.exe');
const ICON = path.join(here, 'assets', 'icon.png');
const startHidden = process.argv.includes('--hidden');

// Electron's own cache goes to PadDeck-Desktop; user data (config, sounds, drawings, pairings)
// stays in %APPDATA%\PadDeck where 1.x kept it, so the upgrade is seamless and updates never touch it.
app.setPath('userData', path.join(app.getPath('appData'), 'PadDeck-Desktop'));
app.setAppUserModelId('com.paddeck.desktop');
if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }

let win = null, tray = null, quitting = false, devices = [], port = 47800;

function migrateFromV1() {
  // 1.x ran "node server.js" via PadDeck.vbs from the HKCU Run key. Replace it with this app.
  try {
    const out = execFileSync('reg.exe', ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run', '/v', 'PadDeck'], { windowsHide: true }).toString();
    if (/PadDeck\.vbs/i.test(out)) {
      execFileSync('reg.exe', ['delete', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run', '/v', 'PadDeck', '/f'], { windowsHide: true });
      app.setLoginItemSettings({ openAtLogin: true, args: ['--hidden'] });
    }
  } catch { /* no 1.x autostart */ }
  try {
    execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -match 'companion[\\\\/]src[\\\\/]server\\.js' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"],
      { windowsHide: true, timeout: 15000 });
  } catch { /* nothing to stop */ }
}

function showWindow(hash = '') {
  if (!win || win.isDestroyed()) {
    win = new BrowserWindow({
      width: Math.min(1600, screen.getPrimaryDisplay().workAreaSize.width - 40), height: Math.min(960, screen.getPrimaryDisplay().workAreaSize.height - 40), minWidth: 1100, minHeight: 680, title: 'PadDeck', icon: ICON, show: false,
      backgroundColor: '#07070d', autoHideMenuBar: true,
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
    win.removeMenu();
    win.on('close', (e) => { if (!quitting) { e.preventDefault(); win.hide(); } });
    win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
    win.once('ready-to-show', () => win.show());
  }
  const url = `http://localhost:${port}/?desktop=1${hash}`;
  const load = (tries = 0) => win.loadURL(url).catch(() => { if (tries < 40) setTimeout(() => load(tries + 1), 250); });
  load();
  if (win.isVisible()) win.focus(); else win.once('ready-to-show', () => win.focus());
  if (!win.isVisible() && win.webContents.getURL()) win.show();
}

function trayMenu() {
  const auto = app.getLoginItemSettings({ args: ['--hidden'] }).openAtLogin;
  return Menu.buildFromTemplate([
    { label: 'Open PadDeck', click: () => showWindow() },
    { label: 'Pair a phone or tablet…', click: () => showWindow('#pair') },
    { type: 'separator' },
    { label: devices.length ? `Connected: ${devices.join(', ')}` : 'No devices connected', enabled: false },
    { type: 'separator' },
    { label: 'Start with Windows', type: 'checkbox', checked: auto, click: (i) => { app.setLoginItemSettings({ openAtLogin: i.checked, args: ['--hidden'] }); tray.setContextMenu(trayMenu()); } },
    { label: 'Open data folder', click: () => shell.openPath(path.join(app.getPath('appData'), 'PadDeck')) },
    { label: 'Restart PadDeck', click: () => host.restartCompanion ? host.restartCompanion() : restartApp() },
    { label: 'Quit PadDeck', click: () => { quitting = true; host.quitCompanion ? host.quitCompanion() : app.quit(); } },
  ]);
}

function restartApp() { quitting = true; app.relaunch({ args: process.argv.slice(1).filter((a) => a !== '--hidden') }); app.exit(0); }

// Hooks used by the companion (companion/src/server.js reads globalThis.__paddeckHost).
const host = {
  notify(title, body) { if (Notification.isSupported()) new Notification({ title, body, icon: ICON, silent: false }).show(); },
  async pickPath(kind) {
    const r = await dialog.showOpenDialog({
      title: kind === 'folder' ? 'Choose a folder for PadDeck' : 'Choose a file or program for PadDeck',
      properties: kind === 'folder' ? ['openDirectory'] : ['openFile'],
    });
    return r.canceled ? null : r.filePaths[0];
  },
  setStatus(list) {
    devices = list;
    if (tray) { tray.setToolTip(`PadDeck · ${list.length ? `${list.length} device(s) connected` : 'waiting for devices'}`); tray.setContextMenu(trayMenu()); }
  },
  getAutoStart: () => app.getLoginItemSettings({ args: ['--hidden'] }).openAtLogin,
  setAutoStart: (on) => { app.setLoginItemSettings({ openAtLogin: !!on, args: ['--hidden'] }); if (tray) tray.setContextMenu(trayMenu()); },
  openSettings: (hash) => showWindow(hash),
  restart: restartApp,
  quit: () => { quitting = true; app.quit(); },
  portInUse: (p) => {
    dialog.showErrorBox('PadDeck', `Port ${p} is already in use. Another copy of PadDeck (or another program) is using it.\n\nClose it, or change the port in PadDeck settings, then start PadDeck again.`);
    quitting = true; app.quit();
  },
};
globalThis.__paddeckHost = host;

app.on('second-instance', () => showWindow());
app.on('window-all-closed', (e) => e.preventDefault()); // keep running in the tray
app.on('before-quit', () => { quitting = true; });

app.whenReady().then(async () => {
  if (packaged) migrateFromV1();
  process.env.PADDECK_DIST = DIST;
  process.env.PADDECK_HELPER = HELPER;
  process.env.PADDECK_ROOT = RES;
  if (!fs.existsSync(HELPER)) dialog.showErrorBox('PadDeck', `Native helper missing: ${HELPER}`);

  const img = nativeImage.createFromPath(path.join(here, 'assets', 'tray.png'));
  img.addRepresentation({ scaleFactor: 2, buffer: fs.readFileSync(path.join(here, 'assets', 'tray@2x.png')) });
  tray = new Tray(img);
  tray.setToolTip('PadDeck · starting…');
  tray.on('click', () => showWindow());
  tray.setContextMenu(trayMenu());

  // Installed app: the companion is pre-bundled into one file (dependencies included).
  const bundled = path.join(COMPANION, 'dist', 'server.mjs');
  await import(pathToFileURL(packaged && fs.existsSync(bundled) ? bundled : path.join(COMPANION, 'src', 'server.js')).href);
  port = host.port || 47800;
  if (!startHidden) showWindow();
  // First run after installing: make it start with Windows by default (can be turned off).
  const flag = path.join(app.getPath('userData'), 'first-run-done');
  if (packaged && !fs.existsSync(flag)) { app.setLoginItemSettings({ openAtLogin: true, args: ['--hidden'] }); fs.writeFileSync(flag, new Date().toISOString()); tray.setContextMenu(trayMenu()); }
});
