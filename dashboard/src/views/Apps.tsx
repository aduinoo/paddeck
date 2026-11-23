import { useEffect, useMemo, useRef, useState } from 'react'
import { mediaUrl, requestIcon, run, send, toast, updateConfig, upload, useStore, type AppEntry } from '../lib/store'
import { Btn, Field, Icon, Modal, Panel, cx, uid } from '../components/ui'

const FEATURED: { name: string; match: RegExp; icon: string; color: string; fallback?: any }[] = [
  { name: 'Google Chrome', match: /^google chrome$/i, icon: 'Globe', color: '#4285f4' },
  { name: 'Microsoft Edge', match: /^microsoft edge$/i, icon: 'Globe', color: '#0ea5e9' },
  { name: 'Visual Studio Code', match: /^visual studio code$/i, icon: 'Code', color: '#2563eb' },
  { name: 'Discord', match: /^discord$/i, icon: 'MessageCircle', color: '#5865f2' },
  { name: 'YouTube Music', match: /^youtube music$/i, icon: 'Music', color: '#dc2626', fallback: { type: 'ytmusic' } },
  { name: 'Blender', match: /^blender/i, icon: 'Box', color: '#ea7600' },
  { name: 'Photoshop', match: /photoshop/i, icon: 'Image', color: '#31a8ff' },
  { name: 'Illustrator', match: /illustrator/i, icon: 'PenTool', color: '#ff9a00' },
  { name: 'Steam', match: /^steam$/i, icon: 'Gamepad2', color: '#1b2838' },
  { name: 'File Explorer', match: /^file explorer$/i, icon: 'FolderOpen', color: '#f59e0b', fallback: { type: 'system', op: 'explorer' } },
  { name: 'Task Manager', match: /^task manager$/i, icon: 'Activity', color: '#22c55e', fallback: { type: 'system', op: 'taskmgr' } },
]

function AppIcon({ app, size = 52, fallback = 'AppWindow', color }: { app?: AppEntry; size?: number; fallback?: string; color?: string }) {
  const key = app ? `app:${app.id}` : ''
  const img = useStore((s) => (key ? s.icons[key] : null))
  useEffect(() => { if (app) requestIcon(key, { appId: app.appId, path: app.path }) }, [key, app])
  return (
    <span className="rounded-2xl flex items-center justify-center shrink-0 overflow-hidden" style={{ width: size, height: size, background: img ? 'transparent' : color || 'var(--surface-2)' }}>
      {img ? <img src={mediaUrl(img)} alt="" className="w-full h-full object-contain" draggable={false} /> : <Icon name={fallback} size={size * 0.45} className={color ? 'text-white' : 'text-ink-2'} />}
    </span>
  )
}

export function AppsView() {
  const apps = useStore((s) => s.apps)
  const config = useStore((s) => s.config)!
  const [q, setQ] = useState('')
  const [adding, setAdding] = useState(false)
  const lp = useRef<number | undefined>(undefined)
  const favs = config.favoriteApps
  const launch = (a: AppEntry) => run({ type: 'app', appId: a.appId, path: a.path, name: a.name })
  const toggleFav = (a: AppEntry) => { updateConfig((c) => { c.favoriteApps = c.favoriteApps.includes(a.id) ? c.favoriteApps.filter((x) => x !== a.id) : [...c.favoriteApps, a.id] }); toast(favs.includes(a.id) ? `Unpinned ${a.name}` : `Pinned ${a.name}`) }
  const filtered = useMemo(() => apps.filter((a) => a.name.toLowerCase().includes(q.toLowerCase())), [apps, q])
  const press = (a: AppEntry) => ({
    onPointerDown: () => { lp.current = window.setTimeout(() => { lp.current = -1; navigator.vibrate?.(15); toggleFav(a) }, 550) },
    onPointerUp: () => { const t = lp.current; clearTimeout(t); if (t !== -1) launch(a) },
    onPointerLeave: () => clearTimeout(lp.current),
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  })

  return (
    <div className="h-full flex flex-col gap-[var(--gap)] min-h-0 overflow-y-auto lg:overflow-visible">
      <Panel title="Featured" icon="Star">
        <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(118px, 1fr))' }}>
          {FEATURED.map((f) => {
            const app = apps.find((a) => f.match.test(a.name))
            const available = !!app || !!f.fallback
            return (
              <button key={f.name} disabled={!available} onClick={() => (app ? launch(app) : run(f.fallback))}
                className={cx('tap rounded-2xl p-3 flex flex-col items-center gap-2 bg-surface-2/60', !available && 'opacity-40')}>
                <AppIcon app={app} fallback={f.icon} color={f.color} />
                <span className="text-[12.5px] font-medium text-center leading-tight line-clamp-2">{f.name}</span>
                {!available && <span className="text-[10px] text-ink-3 -mt-1">Not installed</span>}
              </button>
            )
          })}
        </div>
      </Panel>
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-[var(--gap)] flex-1 min-h-0">
        <Panel title={`All apps · ${apps.length}`} icon="LayoutGrid" right={<button className="tap text-ink-3" onClick={() => send({ type: 'apps.list', refresh: true })}><Icon name="RefreshCw" size={15} /></button>}>
          <input className="field mb-3" placeholder="Search installed apps…" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="flex-1 min-h-0 overflow-y-auto thin-scroll -mr-2 pr-2">
            <div className="grid gap-1.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))' }}>
              {filtered.map((a) => (
                <button key={a.id} {...press(a)} className="tap flex items-center gap-3 rounded-2xl p-2 hover:bg-surface-2 text-left">
                  <AppIcon app={a} size={40} />
                  <span className="text-[13.5px] truncate flex-1">{a.name}</span>
                  {favs.includes(a.id) && <Icon name="Pin" size={13} className="text-accent shrink-0" />}
                </button>
              ))}
            </div>
            {apps.length === 0 && <div className="text-ink-3 text-[13px] p-4">Loading applications from the PC's Start menu…</div>}
          </div>
        </Panel>
        <div className="flex flex-col gap-[var(--gap)] min-h-0">
          <Panel title="Pinned" icon="Pin" className="flex-1 min-h-0">
            <div className="overflow-y-auto thin-scroll space-y-1.5 min-h-0">
              {favs.map((id) => apps.find((a) => a.id === id)).filter(Boolean).map((a) => (
                <button key={a!.id} {...press(a!)} className="tap w-full flex items-center gap-3 rounded-2xl p-2 bg-surface-2/60 text-left">
                  <AppIcon app={a!} size={38} /><span className="text-[13.5px] truncate flex-1">{a!.name}</span>
                </button>
              ))}
              {favs.length === 0 && <div className="text-[12px] text-ink-3">Long-press any app to pin it.</div>}
            </div>
          </Panel>
          <Panel title="Custom launchers" icon="SquarePlus" right={<Btn size="sm" icon="Plus" onClick={() => setAdding(true)}>Add</Btn>}>
            <div className="space-y-1.5 max-h-56 overflow-y-auto thin-scroll">
              {config.apps.map((a) => (
                <div key={a.id} className="flex items-center gap-3 rounded-2xl p-2 bg-surface-2/60">
                  <button className="tap flex items-center gap-3 flex-1 min-w-0 text-left" onClick={() => run(a.appId ? { type: 'app', appId: a.appId, args: a.args } : { type: 'open', path: a.path, args: a.args })}>
                    <span className="w-9 h-9 rounded-xl bg-surface flex items-center justify-center overflow-hidden">{a.image ? <img src={mediaUrl(a.image)} className="w-full h-full object-cover" alt="" /> : <Icon name={a.icon || 'Rocket'} size={18} />}</span>
                    <span className="min-w-0"><span className="block text-[13.5px] truncate">{a.name}</span><span className="block text-[11px] text-ink-3 truncate">{a.path || a.appId} {a.args}</span></span>
                  </button>
                  <button className="tap p-2 text-ink-3" onClick={() => updateConfig((c) => { c.apps = c.apps.filter((x) => x.id !== a.id) })}><Icon name="Trash2" size={16} /></button>
                </div>
              ))}
              {config.apps.length === 0 && <div className="text-[12px] text-ink-3">Register any program, game, folder or file on the PC with custom launch arguments.</div>}
            </div>
          </Panel>
        </div>
      </div>
      {adding && <AddApp onClose={() => setAdding(false)} />}
    </div>
  )
}

function AddApp({ onClose }: { onClose: () => void }) {
  const [a, setA] = useState({ id: uid('app'), name: '', path: '', args: '', icon: 'Rocket', image: '' as string | undefined })
  return (
    <Modal open onClose={onClose} title="Add custom launcher" footer={<><Btn onClick={onClose}>Cancel</Btn>
      <Btn variant="accent" disabled={!a.name || !a.path} onClick={() => { updateConfig((c) => { c.apps.push({ ...a, image: a.image || undefined }) }); onClose() }}>Add</Btn></>}>
      <Field label="Name"><input className="field" value={a.name} onChange={(e) => setA({ ...a, name: e.target.value })} /></Field>
      <Field label="Path on the PC" hint={'Program, game, folder or file, e.g. C:\\Games\\MyGame\\game.exe'}><input className="field" value={a.path} onChange={(e) => setA({ ...a, path: e.target.value })} /></Field>
      <Field label="Launch arguments (optional)"><input className="field" value={a.args} onChange={(e) => setA({ ...a, args: e.target.value })} placeholder="--fullscreen" /></Field>
      <Field label="Custom icon (optional)">
        <label className="tap h-10 px-3 rounded-xl bg-surface-2 inline-flex items-center gap-1.5 text-[13px] cursor-pointer"><Icon name="ImageUp" size={15} />{a.image ? 'Icon uploaded' : 'Upload image'}
          <input type="file" hidden accept="image/*" onChange={async (e) => { const f = e.target.files?.[0]; if (f) { try { setA({ ...a, image: await upload(f, 'image') }) } catch (er: any) { toast(er.message, 'error') } } }} /></label>
      </Field>
    </Modal>
  )
}
