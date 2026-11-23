// Supervises PadDeckHelper.exe (native Windows integration) and exposes a promise RPC.
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import { log } from './log.js';

export class Helper extends EventEmitter {
  constructor(exePath, { tray = true } = {}) {
    super();
    this.exePath = exePath;
    this.tray = tray;
    this.seq = 0;
    this.pending = new Map();
    this.proc = null;
    this.stopping = false;
    this.restarts = 0;
  }

  start() {
    if (!fs.existsSync(this.exePath)) throw new Error(`Native helper not found at ${this.exePath}. Run install.ps1 (it builds the helper).`);
    const args = this.tray ? [] : ['--no-tray'];
    const p = spawn(this.exePath, args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    this.proc = p;
    let buf = '';
    p.stdout.setEncoding('utf8');
    p.stdout.on('data', (chunk) => {
      buf += chunk;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 1);
        if (!line.trim()) continue;
        let msg; try { msg = JSON.parse(line); } catch { continue; }
        if (msg.event) { this.emit(msg.event, msg.data); continue; }
        const cb = this.pending.get(msg.id);
        if (cb) { this.pending.delete(msg.id); clearTimeout(cb.timer); msg.ok ? cb.resolve(msg.result) : cb.reject(new Error(msg.error)); }
        else if (!msg.ok) this.emit('async-error', msg.error);
      }
    });
    p.stderr.on('data', (d) => log.warn('helper stderr', String(d).trim()));
    p.on('exit', (code) => {
      for (const cb of this.pending.values()) { clearTimeout(cb.timer); cb.reject(new Error('Native helper exited')); }
      this.pending.clear();
      this.proc = null;
      if (this.stopping) return;
      this.restarts++;
      log.error(`Native helper exited (code ${code}); restarting`);
      setTimeout(() => this.start(), Math.min(10000, 500 * this.restarts));
    });
    p.stdin.on('error', () => {});
  }

  call(cmd, args = {}, timeoutMs = 15000) {
    if (!this.proc) return Promise.reject(new Error('Native helper not running'));
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`${cmd} timed out`)); }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.proc.stdin.write(JSON.stringify({ id, cmd, args }) + '\n');
    });
  }

  // Fire-and-forget (used for high-rate pen/touch events). Errors surface as 'async-error'.
  send(cmd, args) {
    if (this.proc) this.proc.stdin.write(JSON.stringify({ cmd, args }) + '\n');
  }

  stop() {
    this.stopping = true;
    if (this.proc) { try { this.proc.stdin.end(); } catch {} setTimeout(() => { try { this.proc && this.proc.kill(); } catch {} }, 1500); }
  }
}
