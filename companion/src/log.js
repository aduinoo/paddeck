// Small ring-buffer logger: console + rotating file + in-memory tail for the settings page.
import fs from 'node:fs';
import path from 'node:path';

const ring = [];
let file = null;

function write(level, args) {
  const msg = args.map((a) => (a instanceof Error ? a.stack || a.message : typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
  const entry = { t: new Date().toISOString(), level, msg };
  ring.push(entry);
  if (ring.length > 500) ring.shift();
  const line = `${entry.t} [${level}] ${msg}\n`;
  if (level === 'error') process.stderr.write(line); else process.stdout.write(line);
  if (file) {
    try {
      fs.appendFileSync(file, line);
      if (fs.statSync(file).size > 2 * 1024 * 1024) fs.renameSync(file, file + '.1');
    } catch {}
  }
}

export const log = {
  init(dir) { file = path.join(dir, 'companion.log'); },
  info: (...a) => write('info', a),
  warn: (...a) => write('warn', a),
  error: (...a) => write('error', a),
  tail: (n = 200) => ring.slice(-n),
};
