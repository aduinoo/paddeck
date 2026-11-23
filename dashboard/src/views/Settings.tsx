import { useEffect, useState } from 'react'
import { activeProfile, exportConfig, importConfig, onBackups, send, toast, unpairLocal, updateConfig, useStore } from '../lib/store'
import type { Profile } from '../lib/types'
import { Btn, ColorPick, Confirm, Field, Icon, IconPicker, Modal, Panel, Slider, Toggle, cx, uid } from '../components/ui'
import { KeysInput } from './ActionEditor'
import { ThemeEditor, DeviceSettings } from './ThemeEditor'

type Tab = 'profiles' | 'theme' | 'focus' | 'notify' | 'integrations' | 'backup' | 'about'
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'profiles', label: 'Profiles', icon: 'Users' }, { id: 'theme', label: 'Appearance', icon: 'Palette' }, { id: 'focus', label: 'Focus mode', icon: 'Target' },
  { id: 'notify', label: 'Notifications', icon: 'Bell' }, { id: 'integrations', label: 'Integrations', icon: 'Plug' }, { id: 'backup', label: 'Backup', icon: 'Archive' }, { id: 'about', label: 'This device', icon: 'Smartphone' },
]

export function Settings() {
  const [tab, setTab] = useState<Tab>('profiles')
  return (
    <div className="h-full grid grid-cols-1 md:grid-cols-[220px_1fr] gap-[var(--gap)] min-h-0 overflow-y-auto md:overflow-visible">
      <div className="glass panel p-2 flex md:flex-col gap-1 h-fit overflow-x-auto no-scrollbar">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={cx('tap h-12 px-3 rounded-2xl flex items-center gap-3 text-[14px] font-medium text-left shrink-0', tab === t.id ? 'bg-selected' : 'text-ink-2')}><Icon name={t.icon} size={18} />{t.label}</button>
        ))}
      </div>
      <div className="min-h-0 overflow-y-auto thin-scroll pr-1">
        {tab === 'profiles' && <Profiles />}
        {tab === 'theme' && <ThemeEditor />}
        {tab === 'focus' && <FocusSettings />}
        {tab === 'notify' && <NotifySettings />}
        {tab === 'integrations' && <Integrations />}
        {tab === 'backup' && <Backup />}
        {tab === 'about' && <div className="space-y-[var(--gap)]"><DeviceSettings /><About /></div>}
      </div>
    </div>
  )
}

function Profiles() {
  const config = useStore((s) => s.config)!
  const [edit, setEdit] = useState<Profile | null>(null)
  const [del, setDel] = useState<Profile | null>(null)
  return (
    <Panel title="Profiles" icon="Users" right={<Btn size="sm" icon="Plus" onClick={() => {
      const base = activeProfile(config)!
      const p: Profile = { ...structuredClone(base), id: uid('prof'), name: 'New profile', color: '#0ea5e9', icon: 'Sparkles' }
      updateConfig((c) => { c.profiles.push(p) }); setEdit(p)
    }}>New (copy of current)</Btn>}>
      <p className="text-[13px] text-ink-3 mb-3">Each profile has its own pages, buttons, widgets, soundboard and theme. Switch from the top bar.</p>
      <div className="grid grid-cols-2 gap-2.5">
        {config.profiles.map((p) => (
          <div key={p.id} className={cx('rounded-2xl p-3 flex items-center gap-3', p.id === config.activeProfileId ? 'bg-accent/15 ring-1 ring-accent' : 'bg-surface-2')}>
            <span className="w-11 h-11 rounded-xl flex items-center justify-center text-white" style={{ background: p.color }}><Icon name={p.icon} size={20} /></span>
            <div className="flex-1 min-w-0"><div className="font-medium truncate">{p.name}</div><div className="text-[12px] text-ink-3">{p.pages.length} pages · {p.soundboard.pages.reduce((a, x) => a + x.sounds.length, 0)} sounds</div></div>
            {p.id !== config.activeProfileId && <Btn size="sm" onClick={() => updateConfig((c) => { c.activeProfileId = p.id })}>Use</Btn>}
            <button className="tap p-2 text-ink-2" onClick={() => setEdit(p)}><Icon name="Pencil" size={16} /></button>
            <button className="tap p-2 text-ink-2" onClick={() => updateConfig((c) => { c.profiles.push({ ...structuredClone(p), id: uid('prof'), name: `${p.name} copy` }) })}><Icon name="Copy" size={16} /></button>
            <button className="tap p-2 text-ink-2 disabled:opacity-30" disabled={config.profiles.length < 2} onClick={() => setDel(p)}><Icon name="Trash2" size={16} /></button>
          </div>
        ))}
      </div>
      {edit && (
        <Modal open onClose={() => setEdit(null)} title="Edit profile" footer={<Btn variant="accent" onClick={() => setEdit(null)}>Done</Btn>}>
          <ProfileFields id={edit.id} />
        </Modal>
      )}
      <Confirm open={!!del} danger title={`Delete “${del?.name}”?`} text="Its pages, buttons and soundboard will be removed." onNo={() => setDel(null)}
        onYes={() => { updateConfig((c) => { c.profiles = c.profiles.filter((x) => x.id !== del!.id); if (c.activeProfileId === del!.id) c.activeProfileId = c.profiles[0].id }); setDel(null) }} />
    </Panel>
  )
}

function ProfileFields({ id }: { id: string }) {
  const p = useStore((s) => s.config!.profiles.find((x) => x.id === id))
  if (!p) return null
  const mut = (fn: (p: Profile) => void) => updateConfig((c) => { const x = c.profiles.find((q) => q.id === id); if (x) fn(x) })
  return (
    <>
      <Field label="Name"><input className="field" value={p.name} onChange={(e) => mut((x) => { x.name = e.target.value })} /></Field>
      <Field label="Colour"><ColorPick value={p.color} onChange={(v) => mut((x) => { x.color = v })} /></Field>
      <Field label="Icon"><IconPicker value={p.icon} onChange={(v) => mut((x) => { x.icon = v })} /></Field>
    </>
  )
}

function FocusSettings() {
  const config = useStore((s) => s.config)!
  const apps = useStore((s) => s.apps)
  const f = config.focus
  const set = (p: Partial<typeof f>) => updateConfig((c) => { Object.assign(c.focus, p) })
  const [q, setQ] = useState('')
  return (
    <Panel title="Focus mode" icon="Target">
      <p className="text-[13px] text-ink-3 mb-3">One tap from the Stream Deck, Control Centre or top bar. Turning it off restores your previous volume and notifications.</p>
      <div className="grid grid-cols-2 gap-6">
        <div>
          <Field label={`System volume: ${f.volume === null ? "don't change" : `${f.volume}%`}`}>
            <div className="flex items-center gap-3"><input type="checkbox" className="w-5 h-5" checked={f.volume !== null} onChange={(e) => set({ volume: e.target.checked ? 25 : null })} /><Slider value={f.volume ?? 25} disabled={f.volume === null} live={false} onChange={(v) => set({ volume: v })} /></div>
          </Field>
          <Field label="Switch audio profile"><select className="field" value={f.audioProfileId || ''} onChange={(e) => set({ audioProfileId: e.target.value || null })}><option value="">Don't change</option>{config.audioProfiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
          <Toggle on={f.silenceToasts} onChange={(v) => set({ silenceToasts: v })} label="Turn off Windows notifications" hint="Uses Windows' per-user notification switch (Windows 11 has no public API for Do Not Disturb itself)" />
          <Toggle on={f.muteSoundboard} onChange={(v) => set({ muteSoundboard: v })} label="Disable soundboard" />
          <Toggle on={f.minimize} onChange={(v) => set({ minimize: v })} label="Minimise all windows (Win + D)" />
        </div>
        <div>
          <Field label="Launch these apps">
            <div className="flex flex-wrap gap-1.5 mb-2">{f.launch.map((a) => <button key={a.appId} onClick={() => set({ launch: f.launch.filter((x) => x.appId !== a.appId) })} className="tap h-8 px-2.5 rounded-lg bg-accent text-white text-[12px] inline-flex items-center gap-1">{a.name}<Icon name="X" size={12} /></button>)}</div>
            <input className="field mb-2" placeholder="Search apps to add…" value={q} onChange={(e) => setQ(e.target.value)} />
            {q && <div className="max-h-40 overflow-y-auto thin-scroll space-y-1">{apps.filter((a) => a.name.toLowerCase().includes(q.toLowerCase())).slice(0, 20).map((a) => <button key={a.id} className="tap w-full text-left px-3 py-2 rounded-xl bg-surface-2 text-[13px]" onClick={() => { set({ launch: [...f.launch, { appId: a.appId || '', path: a.path, name: a.name } as any] }); setQ('') }}>{a.name}</button>)}</div>}
          </Field>
        </div>
      </div>
    </Panel>
  )
}

function NotifySettings() {
  const config = useStore((s) => s.config)!
  const n = config.notifications
  const set = (k: string, v: boolean) => updateConfig((c) => { c.notifications[k] = v })
  const items: [string, string, string][] = [
    ['battery', 'Low battery (mouse, keyboard, wireless devices)', 'Once per device until it is charged again'], ['tabletDisconnected', 'Tablet / PC disconnected', 'Shown on both the PC (tray) and the tablet'],
    ['audioDeviceChanged', 'Audio device changed', ''], ['micMuted', 'Microphone muted / unmuted', ''], ['connectionQuality', 'Connection quality degraded', 'When round-trip latency exceeds 250 ms'], ['appLaunched', 'Application launched', ''],
  ]
  return (
    <Panel title="Notifications" icon="Bell">
      {items.map(([k, l, h]) => <Toggle key={k} on={n[k] !== false} onChange={(v) => set(k, v)} label={l} hint={h} />)}
      <Field label={`Low battery threshold: ${config.hardware.batteryThreshold}%`}><Slider value={config.hardware.batteryThreshold} min={5} max={50} live={false} onChange={(v) => updateConfig((c) => { c.hardware.batteryThreshold = v })} /></Field>
    </Panel>
  )
}

function Integrations() {
  const config = useStore((s) => s.config)!
  return (
    <div className="grid grid-cols-2 gap-[var(--gap)]">
      <Panel title="Discord" icon="MessageCircle">
        <p className="text-[13px] text-ink-3 mb-3">Discord doesn't offer a public local API for mute/deafen. Set these same keybinds in Discord → User Settings → Keybinds (“Toggle Mute” / “Toggle Deafen”) and PadDeck will trigger them. The big mic button always works at Windows level.</p>
        <Field label="Toggle Mute keybind"><KeysInput value={config.discord.muteKeys} onChange={(k) => updateConfig((c) => { c.discord.muteKeys = k })} /></Field>
        <Field label="Toggle Deafen keybind"><KeysInput value={config.discord.deafenKeys} onChange={(k) => updateConfig((c) => { c.discord.deafenKeys = k })} /></Field>
      </Panel>
      <Panel title="YouTube Music" icon="Music">
        <p className="text-[13px] text-ink-3 mb-3">Track info, artwork, progress, seeking and play/pause/next/previous come from Windows Global Media Controls, which Chrome, Edge and the installed YouTube Music web app publish automatically – no extension or login needed. Volume controls the browser's own volume in the Windows mixer.</p>
        <Field label="URL opened by the YouTube Music button"><input className="field" value={config.youtubeMusic.url} onChange={(e) => updateConfig((c) => { c.youtubeMusic.url = e.target.value })} /></Field>
      </Panel>
      <Panel title="Temperatures" icon="Thermometer">
        <p className="text-[13px] text-ink-3 mb-3">GPU temperature comes from the NVIDIA driver. Windows has no standard API for CPU temperature without a kernel driver; PadDeck reads it from the free, open-source <b>LibreHardwareMonitor</b> (run it, then Options → Remote Web Server → Run).</p>
        <Field label="LibreHardwareMonitor data URL"><input className="field" value={config.hardware.lhmUrl} onChange={(e) => updateConfig((c) => { c.hardware.lhmUrl = e.target.value })} /></Field>
      </Panel>
    </div>
  )
}

function Backup() {
  const [list, setList] = useState<any[]>([])
  const [restore, setRestore] = useState<string | null>(null)
  useEffect(() => { const off = onBackups(setList); send({ type: 'backups' }); return () => { off() } }, [])
  return (
    <div className="grid grid-cols-2 gap-[var(--gap)]">
      <Panel title="Export & import" icon="ArrowDownUp">
        <p className="text-[13px] text-ink-3 mb-3">All settings are saved automatically on the PC in %APPDATA%\PadDeck (updates never touch this folder). A backup is made every day and before every import/restore.</p>
        <div className="flex flex-wrap gap-2">
          <Btn icon="Download" onClick={exportConfig}>Export configuration</Btn>
          <label className="tap h-11 px-4 rounded-2xl bg-surface-2 inline-flex items-center gap-2 text-[14px] font-medium cursor-pointer"><Icon name="Upload" size={17} />Import…
            <input type="file" hidden accept=".json,application/json" onChange={async (e) => { const f = e.target.files?.[0]; if (f) { try { await importConfig(f); toast('Configuration imported', 'success') } catch (er: any) { toast(er.message, 'error') } } }} /></label>
          <Btn icon="Archive" onClick={() => send({ type: 'backup.create' })}>Back up now</Btn>
        </div>
      </Panel>
      <Panel title="Backups on the PC" icon="History">
        <div className="space-y-1.5 max-h-80 overflow-y-auto thin-scroll">
          {list.map((b) => (
            <div key={b.file} className="flex items-center gap-3 rounded-xl bg-surface-2 px-3 py-2">
              <div className="flex-1 min-w-0"><div className="text-[13px]">{new Date(b.time).toLocaleString()}</div><div className="text-[11px] text-ink-3 truncate">{b.file.replace(/^config-[\d-T]+Z?-?/, '').replace('.json', '')} · {(b.size / 1024).toFixed(0)} KB</div></div>
              <Btn size="sm" onClick={() => setRestore(b.file)}>Restore</Btn>
            </div>
          ))}
          {list.length === 0 && <div className="text-[13px] text-ink-3">No backups yet.</div>}
        </div>
      </Panel>
      <Confirm open={!!restore} title="Restore this backup?" text="Your current configuration is backed up first, then replaced." onNo={() => setRestore(null)} onYes={() => { send({ type: 'backup.restore', file: restore }); setRestore(null) }} />
    </div>
  )
}

function About() {
  const name = useStore((s) => s.deviceName)
  const pc = useStore((s) => s.pc)
  const [ask, setAsk] = useState(false)
  return (
    <Panel title="This tablet" icon="Tablet">
      <div className="text-[14px] space-y-1.5 mb-4">
        <div>Paired as <b>{name}</b> with <b>{pc?.host}</b> · companion v{pc?.version}</div>
        <div className="text-ink-3 text-[13px]">Screen {screen.width}×{screen.height} @ {devicePixelRatio}x · {navigator.userAgent.match(/Android [\d.]+/)?.[0] || navigator.platform}</div>
      </div>
      <div className="text-[13px] text-ink-3 mb-4">Tip: for a kiosk-style experience use the PadDeck Android app (full-screen, keeps the screen awake, auto-discovers the PC) or Chrome's menu → Add to Home screen.</div>
      <Btn variant="danger" icon="Unlink" onClick={() => setAsk(true)}>Unpair this tablet</Btn>
      <Confirm open={ask} danger title="Unpair this tablet?" text="You'll need a new pairing code from the PC to reconnect." onNo={() => setAsk(false)} onYes={() => { setAsk(false); unpairLocal() }} />
    </Panel>
  )
}
