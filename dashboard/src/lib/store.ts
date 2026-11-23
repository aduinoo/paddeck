// Connection to the PC companion + app-wide reactive store (no external state library).
import { useSyncExternalStore } from 'react'
import type { Action, Config, PcState, Profile } from './types'

export type ConnStatus = 'unpaired' | 'connecting' | 'connected' | 'disconnected'
export interface Toast { id: number; text: string; level: 'info' | 'warn' | 'error' | 'success' }
export interface AppEntry { name: string; appId: string; kind: string }

interface Store {
  status: ConnStatus
  latency: number | null
  config: Config | null
  pc: PcState | null
  toasts: Toast[]
  apps: AppEntry[]
  scripts: string[]
  icons: Record<string, string | null>
  playing: Record<string, boolean>
  deviceName: string | null
}

const TOKEN_KEY = 'paddeck.token'
const ls = {
  get(k: string) { try { return localStorage.getItem(k) } catch { return null } },
  set(k: string, v: string) { try { localStorage.setItem(k, v) } catch { /* private mode */ } },
  del(k: string) { try { localStorage.removeItem(k) } catch { /* ignore */ } },
}

let state: Store = {
  status: ls.get(TOKEN_KEY) ? 'connecting' : 'unpaired', latency: null, config: null, pc: null,
  toasts: [], apps: [], scripts: [], icons: {}, playing: {}, deviceName: ls.get('paddeck.deviceName'),
}
const listeners = new Set<() => void>()
function set(patch: Partial<Store>) { state = { ...state, ...patch }; listeners.forEach((l) => l()) }

export function useStore<T>(sel: (s: Store) => T): T {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l) }, () => sel(state))
}
export const getState = () => state

// ------------------------------------------------------------ toasts
let toastSeq = 0
export function toast(text: string, level: Toast['level'] = 'info', ms = 2600) {
  const t = { id: ++toastSeq, text, level }
  set({ toasts: [...state.toasts.slice(-3), t] })
  setTimeout(() => set({ toasts: state.toasts.filter((x) => x.id !== t.id) }), ms)
}

// ------------------------------------------------------------ socket
let ws: WebSocket | null = null
let retry = 0
let reqSeq = 0
const pending = new Map<number, (r: any) => void>()
let pingTimer: number | undefined
let lastPong = 0
let wasConnected = false

export function token() { return ls.get(TOKEN_KEY) }

export function connect() {
  const t = token()
  if (!t) { set({ status: 'unpaired' }); return }
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return
  set({ status: 'connecting' })
  const proto = location.protocol === 'https:' ? 'wss' : 'ws'
  const sock = new WebSocket(`${proto}://${location.host}/ws`)
  ws = sock
  sock.onopen = () => sock.send(JSON.stringify({ type: 'auth', token: t }))
  sock.onmessage = (ev) => handle(JSON.parse(ev.data))
  sock.onclose = (ev) => {
    if (ws !== sock) return
    ws = null
    clearInterval(pingTimer)
    if (ev.code === 4001) { ls.del(TOKEN_KEY); set({ status: 'unpaired', config: null, pc: null }); toast('This tablet was unpaired from the PC', 'warn'); return }
    if (wasConnected && state.config?.notifications?.tabletDisconnected !== false) toast('PC connection lost – reconnecting…', 'warn')
    wasConnected = false
    set({ status: 'disconnected', latency: null })
    const delay = Math.min(8000, 400 * 2 ** retry++)
    setTimeout(connect, delay)
  }
  sock.onerror = () => { /* onclose handles */ }
}

// Reconnect immediately when the tablet wakes up or regains network.
if (typeof window !== 'undefined') {
  const kick = () => { retry = 0; if (!ws) connect() }
  window.addEventListener('online', kick)
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') kick() })
}

const msgListeners = new Set<(m: any) => void>()
export function onMessage(f: (m: any) => void) { msgListeners.add(f); return () => { msgListeners.delete(f) } }

function handle(m: any) {
  msgListeners.forEach((f) => f(m))
  switch (m.type) {
    case 'auth':
      if (m.ok) {
        retry = 0; wasConnected = true
        ls.set('paddeck.deviceName', m.device.name)
        set({ status: 'connected', deviceName: m.device.name, icons: {} })
        clearInterval(pingTimer)
        lastPong = Date.now()
        pingTimer = window.setInterval(() => {
          if (Date.now() - lastPong > 8000) { ws?.close(); return } // dead connection
          send({ type: 'ping', t: performance.now() })
        }, 2000)
        send({ type: 'apps.list' })
      }
      break
    case 'pong': {
      lastPong = Date.now()
      const lat = Math.round(performance.now() - m.t)
      if (state.latency !== null && lat > 250 && state.latency <= 250 && state.config?.notifications?.connectionQuality !== false) toast(`Connection quality degraded (${lat} ms)`, 'warn')
      set({ latency: lat })
      break
    }
    case 'config': set({ config: m.config }); if (m.conflict) toast('Settings were changed on another device – reloaded', 'warn'); break
    case 'state': set({ pc: m.full || !state.pc ? { ...(state.pc || {}), ...m.patch } : { ...state.pc, ...m.patch } }); break
    case 'result': { const cb = pending.get(m.id); if (cb) { pending.delete(m.id); cb(m) } break }
    case 'notice': toast(m.text, m.level === 'error' ? 'error' : m.level === 'warn' ? 'warn' : 'info', m.level === 'error' ? 4500 : 2600); break
    case 'apps': set({ apps: m.list, scripts: m.scripts || [] }); break
    case 'icon': set({ icons: { ...state.icons, [m.key]: m.path } }); break
    case 'soundEnded': { const p = { ...state.playing }; delete p[m.key]; set({ playing: p }); if (m.error) toast(`Sound failed: ${m.error}`, 'error'); break }
    case 'backups': backupsListeners.forEach((f) => f(m.list)); break
  }
}

export function send(msg: object) { if (ws && ws.readyState === WebSocket.OPEN) { ws.send(JSON.stringify(msg)); return true } return false }

export function run(action: Action, opts: { confirmed?: boolean; quiet?: boolean } = {}): Promise<any> {
  return new Promise((resolve) => {
    const id = ++reqSeq
    if (!send({ type: 'action', id, action, confirmed: !!opts.confirmed })) { toast('Not connected to PC', 'error'); return resolve({ ok: false }) }
    const timer = setTimeout(() => { pending.delete(id); resolve({ ok: false, error: 'timeout' }) }, 20000)
    pending.set(id, (r) => {
      clearTimeout(timer)
      if (!r.ok && !r.needsConfirm) toast(r.error, 'error', 4000)
      else if (r.ok && r.message && !opts.quiet) toast(r.message, 'success')
      if (r.ok && action.type === 'sound') set({ playing: { ...state.playing, [action.soundId]: true } })
      resolve(r)
    })
  })
}

// ------------------------------------------------------------ config editing
let saveTimer: number | undefined
export function updateConfig(mut: (c: Config) => void) {
  if (!state.config) return
  const next: Config = structuredClone(state.config)
  mut(next)
  set({ config: next })
  clearTimeout(saveTimer)
  const base = state.config.rev
  saveTimer = window.setTimeout(() => send({ type: 'config.set', config: next, baseRev: base }), 250)
}

export function activeProfile(c: Config | null): Profile | null {
  if (!c) return null
  return c.profiles.find((p) => p.id === c.activeProfileId) || c.profiles[0]
}

// ------------------------------------------------------------ pairing & uploads
export async function pair(code: string, name: string) {
  const r = await fetch('/api/pair', { method: 'POST', body: JSON.stringify({ code, name }), headers: { 'Content-Type': 'application/json' } })
  const j = await r.json()
  if (!r.ok) throw new Error(j.error || 'Pairing failed')
  ls.set(TOKEN_KEY, j.token)
  ls.set('paddeck.deviceName', j.device.name)
  connect()
}

export function unpairLocal() { ls.del(TOKEN_KEY); ws?.close(); set({ status: 'unpaired', config: null, pc: null }) }

export async function upload(file: File, kind: 'sound' | 'image'): Promise<string> {
  const r = await fetch(`/api/upload?kind=${kind}&name=${encodeURIComponent(file.name)}`, { method: 'PUT', body: file, headers: { Authorization: `Bearer ${token()}` } })
  const j = await r.json()
  if (!r.ok) throw new Error(j.error || 'Upload failed')
  return j.file
}

export const mediaUrl = (file?: string | null) => (file ? (file.startsWith('data:') ? file : `/media/${file}?t=${encodeURIComponent(token() || '')}`) : '')

export async function exportConfig() {
  const r = await fetch('/api/export', { headers: { Authorization: `Bearer ${token()}` } })
  const blob = await r.blob()
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `paddeck-config-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
}

export async function importConfig(file: File) {
  const text = await file.text()
  JSON.parse(text)
  const r = await fetch('/api/import', { method: 'POST', body: text, headers: { Authorization: `Bearer ${token()}` } })
  if (!r.ok) throw new Error((await r.json()).error || 'Import failed')
}

const backupsListeners = new Set<(l: any[]) => void>()
export function onBackups(f: (l: any[]) => void) { backupsListeners.add(f); return () => backupsListeners.delete(f) }

// Icons for app-launch buttons (fetched once, cached by the companion as PNG)
export function requestIcon(key: string, ref: { appId?: string; name?: string; path?: string }) {
  if (key in state.icons) return
  set({ icons: { ...state.icons, [key]: null } })
  send({ type: 'icon', key, ref })
}
