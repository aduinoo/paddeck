// Connection to the PC companion + app-wide reactive store (no external state library).
// Works both when served by the PC (same origin) and when bundled inside the Android app,
// where the PC address comes from discovery / QR pairing and is stored locally.
import { useSyncExternalStore } from 'react'
import type { Action, Config, PcState, Profile } from './types'

export type ConnStatus = 'unpaired' | 'connecting' | 'connected' | 'disconnected'
export interface Toast { id: number; text: string; level: 'info' | 'warn' | 'error' | 'success' }
export interface AppEntry { id: string; name: string; appId: string | null; path: string | null; kind: string; source?: string; category?: string }
export interface DevicePrefs { layout?: 'auto' | 'phone' | 'tablet'; profileId?: string | null; nav?: string[]; themeOverride?: boolean; theme?: any }

// Native bridge exposed by the PadDeck Android app (undefined in a normal browser).
export interface AndroidBridge {
  version(): string; scanQr(): void; discover(): void; changePc(): void; vibrate?(ms: number): void
}
export const android: AndroidBridge | undefined = (globalThis as any).PadDeckAndroid

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
  deviceId: string | null
  server: string
  paths: Record<string, boolean>
  canUndo: boolean
  canRedo: boolean
}

const TOKEN_KEY = 'paddeck.token'
const ls = {
  get(k: string) { try { return localStorage.getItem(k) } catch { return null } },
  set(k: string, v: string) { try { localStorage.setItem(k, v) } catch { /* private mode */ } },
  del(k: string) { try { localStorage.removeItem(k) } catch { /* ignore */ } },
}

// PadDeck Desktop's own window (Electron) runs the same UI as the editor.
export const isDesktop = /Electron/i.test(navigator.userAgent) || new URLSearchParams(location.search).has('desktop')
// Same-origin when the PC serves the page; otherwise the stored PC address.
const servedByPc = /^https?:$/.test(location.protocol) && !/appassets\.androidplatform\.net$/.test(location.hostname) && location.port !== '5173'
const initialServer = servedByPc ? location.origin : (ls.get('paddeck.server') || '')

let state: Store = {
  status: ls.get(TOKEN_KEY) && initialServer ? 'connecting' : 'unpaired', latency: null, config: null, pc: null,
  toasts: [], apps: [], scripts: [], icons: {}, playing: {}, deviceName: ls.get('paddeck.deviceName'), deviceId: ls.get('paddeck.deviceId'),
  server: initialServer, paths: {}, canUndo: false, canRedo: false,
}
if (isDesktop) state.status = 'connecting'
const listeners = new Set<() => void>()
function set(patch: Partial<Store>) { state = { ...state, ...patch }; listeners.forEach((l) => l()) }

export function useStore<T>(sel: (s: Store) => T): T {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l) }, () => sel(state))
}
export const getState = () => state
export const apiUrl = (p: string) => `${state.server}${p}`
export const isServedByPc = servedByPc

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

let desktopAuthTried = false
export function connect() {
  if (isDesktop && !desktopAuthTried) {
    // The desktop editor is on the PC itself: fetch a local device token from the loopback-only API.
    desktopAuthTried = true
    fetch('/api/admin/desktop-token', { method: 'POST', headers: { 'X-PadDeck-Admin': '1', 'Content-Type': 'application/json' }, body: '{}' })
      .then((r) => r.json()).then((j) => { ls.set(TOKEN_KEY, j.token); connect() })
      .catch(() => setTimeout(() => { desktopAuthTried = false; connect() }, 1000))
    return
  }
  const t = token()
  if (!t || !state.server) { set({ status: 'unpaired' }); return }
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return
  set({ status: 'connecting' })
  const sock = new WebSocket(`${state.server.replace(/^http/, 'ws')}/ws`)
  ws = sock
  sock.onopen = () => sock.send(JSON.stringify({ type: 'auth', token: t }))
  sock.onmessage = (ev) => handle(JSON.parse(ev.data))
  sock.onclose = (ev) => {
    if (ws !== sock) return
    ws = null
    clearInterval(pingTimer)
    if (ev.code === 4001) { ls.del(TOKEN_KEY); if (isDesktop) { desktopAuthTried = false; setTimeout(connect, 300); return } set({ status: 'unpaired', config: null, pc: null }); toast('This device was unpaired from the PC', 'warn'); return }
    if (wasConnected && state.config?.notifications?.tabletDisconnected !== false) toast('PC connection lost – reconnecting…', 'warn')
    wasConnected = false
    set({ status: 'disconnected', latency: null })
    const delay = Math.min(8000, 400 * 2 ** retry++)
    setTimeout(connect, delay)
  }
  sock.onerror = () => { /* onclose handles */ }
}

// Reconnect immediately when the device wakes up or regains network.
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
        ls.set('paddeck.deviceName', m.device.name); ls.set('paddeck.deviceId', m.device.id)
        set({ status: 'connected', deviceName: m.device.name, deviceId: m.device.id, icons: {} })
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
    case 'config': onConfig(m); break
    case 'paths': set({ paths: { ...state.paths, ...m.exists } }); break
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

// Request/response over the socket for messages that answer with a typed reply.
export function ask<T = any>(msg: Record<string, any>, replyType: string, timeout = 120000): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = ++reqSeq
    const off = onMessage((m) => { if (m.type === replyType && (m.id === undefined || m.id === id)) { off(); clearTimeout(t); resolve(m) } })
    const t = setTimeout(() => { off(); reject(new Error('No answer from PC')) }, timeout)
    if (!send({ ...msg, id })) { off(); clearTimeout(t); reject(new Error('Not connected to PC')) }
  })
}

// ------------------------------------------------------------ config editing & sync
// Every edit is a mutation function. Unacknowledged mutations are kept so that when another
// device saves first (or edits arrive while ours are in flight) they are replayed on top of the
// newer configuration instead of silently overwriting it.
const clientId = Math.random().toString(36).slice(2)
let pendingMuts: ((c: Config) => void)[] = []
let sentCount = 0
let saveTimer: number | undefined
const undoStack: Config[] = []
const redoStack: Config[] = []
let lastUndoPush = 0

function scheduleSave() {
  clearTimeout(saveTimer)
  saveTimer = window.setTimeout(() => {
    if (!state.config || !pendingMuts.length) return
    if (send({ type: 'config.set', config: state.config, baseRev: state.config.rev, clientId })) sentCount = pendingMuts.length
  }, 250)
}

function onConfig(m: any) {
  if (m.by === clientId && !m.conflict) {
    pendingMuts.splice(0, sentCount); sentCount = 0
  } else if (m.conflict) sentCount = 0
  let next: Config = m.config
  if (pendingMuts.length) {
    next = structuredClone(m.config)
    for (const f of pendingMuts) { try { f(next) } catch { /* edit no longer applies */ } }
    if (m.conflict || m.by !== clientId) toast(`Merged with changes made on ${m.device || m.by || 'another device'}`, 'info')
    scheduleSave()
  } else if (m.by && m.by !== clientId && m.device && m.device !== state.deviceName && state.config) {
    // quiet: live sync from another device
  }
  set({ config: next })
}

export function updateConfig(mut: (c: Config) => void, opts: { history?: boolean } = {}) {
  if (!state.config) return
  if (opts.history !== false) {
    const now = Date.now()
    if (now - lastUndoPush > 600) { undoStack.push(state.config); if (undoStack.length > 60) undoStack.shift(); redoStack.length = 0 }
    lastUndoPush = now
  }
  const next: Config = structuredClone(state.config)
  mut(next)
  pendingMuts.push(mut)
  set({ config: next, canUndo: undoStack.length > 0, canRedo: redoStack.length > 0 })
  scheduleSave()
}

function restoreSnapshot(snap: Config) {
  const keep = structuredClone(snap)
  updateConfig((c) => { const rev = c.rev; Object.keys(c).forEach((k) => delete (c as any)[k]); Object.assign(c, structuredClone(keep), { rev }) }, { history: false })
}
export function undo() {
  const snap = undoStack.pop(); if (!snap || !state.config) return
  redoStack.push(state.config); restoreSnapshot(snap)
  set({ canUndo: undoStack.length > 0, canRedo: true }); toast('Undone', 'info', 1200)
}
export function redo() {
  const snap = redoStack.pop(); if (!snap || !state.config) return
  undoStack.push(state.config); restoreSnapshot(snap)
  set({ canUndo: true, canRedo: redoStack.length > 0 })
}

// Tiles that open files/folders ask the PC whether their targets still exist.
export function checkPaths(paths: string[]) {
  const list = [...new Set(paths.filter(Boolean))]
  if (list.length) send({ type: 'paths.check', paths: list })
}

// Per-device preferences (layout, profile, theme override) live in the shared config so they
// survive reinstalls, keyed by this device's pairing id.
export function devicePrefs(c: Config | null): DevicePrefs {
  if (!c || !state.deviceId) return {}
  return ((c as any).devicePrefs || {})[state.deviceId] || {}
}
export function setDevicePrefs(patch: Partial<DevicePrefs>) {
  const id = state.deviceId; if (!id) return
  updateConfig((c: any) => { c.devicePrefs = c.devicePrefs || {}; c.devicePrefs[id] = { ...(c.devicePrefs[id] || {}), ...patch } })
}

export function activeProfile(c: Config | null): Profile | null {
  if (!c) return null
  const pref = devicePrefs(c).profileId
  return c.profiles.find((p) => p.id === pref) || c.profiles.find((p) => p.id === c.activeProfileId) || c.profiles[0]
}
export function switchProfile(id: string) {
  setDevicePrefs({ profileId: id })
}

// ------------------------------------------------------------ pairing & uploads
export function setServer(url: string) {
  const s = url.replace(/\/+$/, '').replace(/#.*$/, '')
  ls.set('paddeck.server', s)
  set({ server: s })
}

export async function pair(code: string, name: string, server?: string) {
  if (server) setServer(server)
  if (!state.server) throw new Error('Enter the PC address first')
  const r = await fetch(apiUrl('/api/pair'), { method: 'POST', body: JSON.stringify({ code, name }), headers: { 'Content-Type': 'application/json' } })
  const j = await r.json()
  if (!r.ok) throw new Error(j.error || 'Pairing failed')
  ls.set(TOKEN_KEY, j.token)
  ls.set('paddeck.deviceName', j.device.name); ls.set('paddeck.deviceId', j.device.id)
  set({ deviceId: j.device.id, deviceName: j.device.name })
  connect()
}

// Parses QR contents like http://192.168.0.5:47800/#pair=123456
export function parsePairUrl(text: string): { server: string; code: string } | null {
  try {
    const u = new URL(text.trim())
    const m = /pair=(\d{6})/.exec(u.hash || u.search)
    if (!m) return null
    return { server: `${u.protocol}//${u.host}`, code: m[1] }
  } catch { return null }
}

export function unpairLocal() { ls.del(TOKEN_KEY); ws?.close(); set({ status: 'unpaired', config: null, pc: null }) }

const authHeaders = () => ({ Authorization: `Bearer ${token()}` })
export async function api(path: string, init: RequestInit = {}) {
  const r = await fetch(apiUrl(path), { ...init, headers: { ...authHeaders(), ...(init.headers || {}) } })
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `Request failed (${r.status})`)
  return r
}

export async function upload(file: File | Blob, kind: 'sound' | 'image', name?: string): Promise<string> {
  const r = await api(`/api/upload?kind=${kind}&name=${encodeURIComponent(name || (file as File).name || 'file')}`, { method: 'PUT', body: file })
  return (await r.json()).file
}

export const mediaUrl = (file?: string | null) => (file ? (file.startsWith('data:') ? file : `${state.server}/media/${file}?t=${encodeURIComponent(token() || '')}`) : '')

export async function exportConfig() {
  const r = await api('/api/export')
  const blob = await r.blob()
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `paddeck-config-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
}

export async function importConfig(file: File) {
  const text = await file.text()
  JSON.parse(text)
  await api('/api/import', { method: 'POST', body: text })
}

const backupsListeners = new Set<(l: any[]) => void>()
export function onBackups(f: (l: any[]) => void) { backupsListeners.add(f); return () => backupsListeners.delete(f) }

// Icons for apps, files and folders (fetched once, cached by the companion as PNG)
export function requestIcon(key: string, ref: { appId?: string | null; name?: string; path?: string | null; id?: string }) {
  if (key in state.icons) return
  set({ icons: { ...state.icons, [key]: null } })
  send({ type: 'icon', key, ref })
}

// ------------------------------------------------------------ layout (phone vs tablet)
function computeLayout(): 'phone' | 'tablet' | 'desktop' {
  if (isDesktop) return 'desktop'
  const pref = devicePrefs(state.config).layout
  if (pref === 'phone' || pref === 'tablet') return pref
  return Math.min(window.innerWidth, window.innerHeight) < 600 || window.innerWidth < 760 ? 'phone' : 'tablet'
}
const layoutListeners = new Set<() => void>()
if (typeof window !== 'undefined') {
  window.addEventListener('resize', () => layoutListeners.forEach((l) => l()))
  window.addEventListener('orientationchange', () => setTimeout(() => layoutListeners.forEach((l) => l()), 150))
}
// Screen orientation (follows rotation; the Android app rotates freely).
const isPortrait = () => window.innerHeight > window.innerWidth
export function useOrientation(): 'portrait' | 'landscape' {
  return useSyncExternalStore((l) => { layoutListeners.add(l); return () => layoutListeners.delete(l) }, () => (isPortrait() ? 'portrait' : 'landscape'))
}
export function useLayout(): 'phone' | 'tablet' | 'desktop' {
  useStore((s) => devicePrefs(s.config).layout)
  return useSyncExternalStore((l) => { layoutListeners.add(l); return () => layoutListeners.delete(l) }, computeLayout)
}
