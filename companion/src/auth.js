// Pairing + device tokens. A short-lived 6-digit code (shown on the PC as text and QR) is
// exchanged once for a 256-bit device token. Only SHA-256 hashes of tokens are stored.
import crypto from 'node:crypto';

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const CODE_TTL = 5 * 60 * 1000;

export class Auth {
  constructor(store) {
    this.store = store;
    this.code = null;
    this.codeExpires = 0;
    this.attempts = new Map(); // ip -> [timestamps]
    this.rotate();
  }

  rotate() {
    this.code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
    this.codeExpires = Date.now() + CODE_TTL;
    return this.code;
  }

  currentCode() {
    if (Date.now() > this.codeExpires) this.rotate();
    return { code: this.code, expires: this.codeExpires };
  }

  rateLimited(ip) {
    const now = Date.now();
    const list = (this.attempts.get(ip) || []).filter((t) => now - t < 60_000);
    list.push(now);
    this.attempts.set(ip, list);
    return list.length > 8;
  }

  pair(code, name, ip) {
    if (!this.store.state.allowNewPairing) throw new Error('Pairing is disabled in the companion settings');
    if (this.rateLimited(ip)) throw new Error('Too many attempts. Wait a minute and try again.');
    const cur = this.currentCode();
    const a = Buffer.from(String(code || '').padEnd(6)); const b = Buffer.from(cur.code);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new Error('Wrong or expired pairing code');
    const token = crypto.randomBytes(32).toString('base64url');
    const device = { id: crypto.randomUUID(), name: String(name || 'Tablet').slice(0, 60), tokenHash: sha(token), pairedAt: Date.now(), lastSeen: Date.now(), lastIp: ip };
    this.store.state.devices.push(device);
    this.store.saveState();
    this.rotate(); // single use
    return { token, device: { id: device.id, name: device.name } };
  }

  // PadDeck Desktop's own editor window: a built-in device whose token is re-issued on demand
  // to callers on this PC only (enforced by the admin API).
  desktopToken() {
    const token = crypto.randomBytes(32).toString('base64url');
    let d = this.store.state.devices.find((x) => x.builtin === 'desktop');
    if (!d) { d = { id: 'desktop', name: 'PadDeck Desktop', builtin: 'desktop', pairedAt: Date.now() }; this.store.state.devices.push(d); }
    d.tokenHash = sha(token); d.lastSeen = Date.now();
    this.store.saveState();
    return token;
  }

  verify(token) {
    if (!token || typeof token !== 'string') return null;
    const h = sha(token);
    return this.store.state.devices.find((d) => d.tokenHash === h) || null;
  }

  revoke(id) {
    const before = this.store.state.devices.length;
    this.store.state.devices = this.store.state.devices.filter((d) => d.id !== id);
    this.store.saveState();
    return before !== this.store.state.devices.length;
  }

  touch(device, ip) { device.lastSeen = Date.now(); device.lastIp = ip; }
}
