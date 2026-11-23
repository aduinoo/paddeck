import { useState } from 'react'
import { activeProfile, useStore } from '../lib/store'
import type { Action } from '../lib/types'
import { Btn, Field, Icon, IconBtn, cx } from '../components/ui'
import { FilePicker } from '../components/FilePicker'

export const ACTION_TYPES: { type: string; label: string; icon: string; group: string }[] = [
  { type: 'app', label: 'Launch app', icon: 'AppWindow', group: 'Launch' },
  { type: 'url', label: 'Open website', icon: 'Globe', group: 'Launch' },
  { type: 'open', label: 'Open file / folder', icon: 'FolderOpen', group: 'Launch' },
  { type: 'ytmusic', label: 'YouTube Music', icon: 'Music', group: 'Launch' },
  { type: 'keys', label: 'Keyboard shortcut', icon: 'Keyboard', group: 'Input' },
  { type: 'text', label: 'Type text', icon: 'Type', group: 'Input' },
  { type: 'macro', label: 'Macro', icon: 'ListOrdered', group: 'Input' },
  { type: 'media', label: 'Media control', icon: 'Play', group: 'Media' },
  { type: 'volume', label: 'Volume', icon: 'Volume2', group: 'Audio' },
  { type: 'micMute', label: 'Toggle mic mute', icon: 'MicOff', group: 'Audio' },
  { type: 'output', label: 'Switch output', icon: 'Speaker', group: 'Audio' },
  { type: 'input', label: 'Switch microphone', icon: 'Mic', group: 'Audio' },
  { type: 'audioProfile', label: 'Audio profile', icon: 'SlidersHorizontal', group: 'Audio' },
  { type: 'sound', label: 'Play sound', icon: 'AudioLines', group: 'Audio' },
  { type: 'stopSounds', label: 'Stop all sounds', icon: 'Square', group: 'Audio' },
  { type: 'system', label: 'System', icon: 'Monitor', group: 'System' },
  { type: 'script', label: 'Run approved script', icon: 'FileCode', group: 'System' },
  { type: 'focus', label: 'Focus mode', icon: 'Target', group: 'System' },
  { type: 'discord', label: 'Discord', icon: 'MessageCircle', group: 'System' },
  { type: 'page', label: 'Go to page', icon: 'Files', group: 'PadDeck' },
  { type: 'profile', label: 'Switch profile', icon: 'Users', group: 'PadDeck' },
  { type: 'mode', label: 'Switch mode', icon: 'LayoutGrid', group: 'PadDeck' },
]

export const SYSTEM_OPS = [
  ['lock', 'Lock Windows'], ['screenshot', 'Save screenshot'], ['snip', 'Snipping tool'], ['taskmgr', 'Task Manager'],
  ['explorer', 'File Explorer'], ['settings', 'Windows Settings'], ['sound-settings', 'Sound settings'], ['display-settings', 'Display settings'],
  ['sleep', 'Sleep'], ['restart', 'Restart'], ['shutdown', 'Shut down'], ['signout', 'Sign out'], ['cancel-shutdown', 'Cancel shutdown'],
]
const MEDIA_OPS = [['toggle', 'Play / pause'], ['play', 'Play'], ['pause', 'Pause'], ['next', 'Next track'], ['prev', 'Previous track'], ['stop', 'Stop']]
const MODES = [['deck', 'Stream Deck'], ['sounds', 'Soundboard'], ['whiteboard', 'Whiteboard'], ['control', 'Control Centre'], ['audio', 'Audio'], ['apps', 'Apps'], ['draw', 'Drawing tablet'], ['display', 'Second monitor']]

export const parseKeys = (s: string) => s.split(/\s*\+\s*/).map((k) => k.trim().toLowerCase()).filter(Boolean)
export const fmtKeys = (k?: string[]) => (k || []).map((x) => (x.length === 1 ? x.toUpperCase() : x[0].toUpperCase() + x.slice(1))).join(' + ')

function Sel({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: (string[] | [string, string])[] }) {
  return (
    <select className="field" value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  )
}

export function KeysInput({ value, onChange }: { value: string[]; onChange: (k: string[]) => void }) {
  const [text, setText] = useState(fmtKeys(value))
  const quick = ['ctrl', 'shift', 'alt', 'win']
  return (
    <div>
      <input className="field" placeholder="e.g. Ctrl + Shift + S" value={text} onChange={(e) => { setText(e.target.value); onChange(parseKeys(e.target.value)) }} />
      <div className="flex flex-wrap gap-1.5 mt-2">
        {quick.map((q) => <button key={q} className="tap px-2.5 h-8 rounded-lg bg-surface-2 text-[12px]" onClick={() => { const k = [...value.filter((x) => x !== q), q]; const ordered = [...quick.filter((m) => k.includes(m)), ...k.filter((x) => !quick.includes(x))]; onChange(ordered); setText(fmtKeys(ordered)) }}>+ {q}</button>)}
        <span className="text-[11px] text-ink-3 self-center ml-1">Keys: a–z, 0–9, f1–f24, enter, esc, tab, space, up/down/left/right, printscreen, mediaplaypause…</span>
      </div>
    </div>
  )
}

export function ActionEditor({ action, onChange }: { action: Action; onChange: (a: Action) => void }) {
  const config = useStore((s) => s.config)!
  const pc = useStore((s) => s.pc)
  const apps = useStore((s) => s.apps)
  const scripts = useStore((s) => s.scripts)
  const prof = activeProfile(config)!
  const [appQ, setAppQ] = useState('')
  const [browse, setBrowse] = useState<null | 'file' | 'dir' | 'any' | 'app'>(null)
  const baseName = (p: string) => p.split(/[\\/]/).filter(Boolean).pop()?.replace(/\.(lnk|exe|url)$/i, '') || p
  const set = (patch: Partial<Action>) => onChange({ ...action, ...patch })
  const groups = [...new Set(ACTION_TYPES.map((a) => a.group))]

  return (
    <div>
      <Field label="Action">
        <div className="space-y-2">
          {groups.map((g) => (
            <div key={g} className="flex flex-wrap gap-1.5 items-center">
              <span className="text-[11px] text-ink-3 w-16">{g}</span>
              {ACTION_TYPES.filter((a) => a.group === g).map((a) => (
                <button key={a.type} onClick={() => onChange({ type: a.type })} className={cx('tap h-8 px-2.5 rounded-lg text-[12px] inline-flex items-center gap-1.5', action.type === a.type ? 'bg-accent text-white' : 'bg-surface-2')}>
                  <Icon name={a.icon} size={14} />{a.label}
                </button>
              ))}
            </div>
          ))}
        </div>
      </Field>

      {action.type === 'app' && (
        <>
          <Field label="Application" hint={action.appId || action.path ? `Selected: ${action.name || action.appId || action.path}` : `${apps.length} apps found in the Start menu, installed programs and desktop shortcuts`}>
            <div className="flex gap-2 mb-2">
              <input className="field" placeholder="Search installed apps…" value={appQ} onChange={(e) => setAppQ(e.target.value)} />
              <Btn size="sm" icon="FolderSearch" className="!h-11 shrink-0" onClick={() => setBrowse('app')}>Browse PC</Btn>
            </div>
            <div className="max-h-44 overflow-y-auto thin-scroll grid grid-cols-2 gap-1.5">
              {apps.filter((a) => a.name.toLowerCase().includes(appQ.toLowerCase())).slice(0, 120).map((a) => {
                const on = (action.appId || (action.path ? `path:${action.path}` : '')) === a.id
                return <button key={a.id} onClick={() => set({ appId: a.appId, path: a.path, name: a.name })} className={cx('tap text-left px-3 py-2 rounded-xl text-[13px] truncate', on ? 'bg-accent' : 'bg-surface-2')}>{a.name}<span className="opacity-50 text-[10px] ml-1">{a.source === 'desktop' ? 'desktop' : a.source === 'registry' ? 'installed' : a.kind === 'store' ? 'store' : ''}</span></button>
              })}
            </div>
          </Field>
          <Field label="Launch arguments (optional)" hint="Only used for desktop apps whose executable path is known"><input className="field" value={action.args || ''} onChange={(e) => set({ args: e.target.value })} /></Field>
        </>
      )}
      {action.type === 'url' && <Field label="Website URL"><input className="field" placeholder="https://" value={action.url || ''} onChange={(e) => set({ url: e.target.value })} /></Field>}
      {action.type === 'open' && (
        <>
          <Field label="Path on the PC" hint="A folder, document, image, video, program or shortcut">
            <input className="field mb-2" value={action.path || ''} onChange={(e) => set({ path: e.target.value })} placeholder="C:\Users\You\Projects\MyProject" />
            <div className="flex gap-2"><Btn size="sm" icon="Folder" onClick={() => setBrowse('dir')}>Choose folder</Btn><Btn size="sm" icon="File" onClick={() => setBrowse('file')}>Choose file</Btn></div>
          </Field>
          <Field label="Arguments (optional)"><input className="field" value={action.args || ''} onChange={(e) => set({ args: e.target.value })} /></Field>
        </>
      )}
      {action.type === 'keys' && <Field label="Key combination"><KeysInput value={action.keys || []} onChange={(k) => set({ keys: k })} /></Field>}
      {action.type === 'text' && <Field label="Text to type"><textarea className="field min-h-24" value={action.text || ''} onChange={(e) => set({ text: e.target.value })} /></Field>}
      {action.type === 'macro' && <MacroEditor steps={action.steps || []} onChange={(steps) => set({ steps })} />}
      {action.type === 'media' && <Field label="Media action"><Sel value={action.action || 'toggle'} onChange={(v) => set({ action: v })} options={MEDIA_OPS as [string, string][]} /></Field>}
      {action.type === 'volume' && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Mode"><Sel value={action.mode || 'up'} onChange={(v) => set({ mode: v })} options={[['up', 'Volume up'], ['down', 'Volume down'], ['set', 'Set to level'], ['mute', 'Toggle mute']]} /></Field>
          {action.mode === 'set' ? <Field label="Level (%)"><input type="number" className="field" value={action.value ?? 50} onChange={(e) => set({ value: Number(e.target.value) })} /></Field>
            : action.mode !== 'mute' && <Field label="Step (%)"><input type="number" className="field" value={action.step ?? 5} onChange={(e) => set({ step: Number(e.target.value) })} /></Field>}
        </div>
      )}
      {(action.type === 'output' || action.type === 'input') && (
        <Field label={action.type === 'output' ? 'Output device' : 'Microphone'} hint="Devices detected on your PC right now">
          <div className="space-y-1.5">
            {(action.type === 'output' ? pc?.audio.outputs : pc?.audio.inputs)?.map((d) => (
              <button key={d.id} onClick={() => set({ deviceId: d.id, deviceName: d.name })} className={cx('tap w-full text-left px-3 py-2.5 rounded-xl text-[13px] flex items-center gap-2', action.deviceId === d.id ? 'bg-accent text-white' : 'bg-surface-2')}>
                <Icon name={action.type === 'output' ? 'Speaker' : 'Mic'} size={15} />{d.name}
              </button>
            ))}
          </div>
        </Field>
      )}
      {action.type === 'audioProfile' && <Field label="Audio profile"><Sel value={action.id || ''} onChange={(v) => set({ id: v })} options={[['', 'Choose…'], ...config.audioProfiles.map((p) => [p.id, p.name] as [string, string])]} /></Field>}
      {action.type === 'sound' && (
        <Field label="Sound">
          <Sel value={action.soundId || ''} onChange={(v) => set({ soundId: v })} options={[['', 'Choose…'], ...prof.soundboard.pages.flatMap((p) => p.sounds.map((s) => [s.id, `${p.name} · ${s.name}`] as [string, string]))]} />
        </Field>
      )}
      {action.type === 'system' && <Field label="System action" hint="Shutdown, restart, sleep and sign-out always ask for confirmation"><Sel value={action.op || 'lock'} onChange={(v) => set({ op: v })} options={SYSTEM_OPS as [string, string][]} /></Field>}
      {action.type === 'script' && (
        <Field label="Script" hint="For safety, only scripts placed in the PadDeck scripts folder on the PC can run (Companion settings → Open scripts folder).">
          {scripts.length ? <Sel value={action.file || ''} onChange={(v) => set({ file: v })} options={[['', 'Choose…'], ...scripts.map((s) => [s, s] as [string, string])]} />
            : <div className="text-[13px] text-ink-3 p-3 rounded-xl bg-surface-2">No scripts found yet. Copy .ps1 / .bat / .cmd files into the scripts folder on the PC.</div>}
        </Field>
      )}
      {action.type === 'discord' && (
        <Field label="Discord action" hint="Mute/deafen send the keybinds you set in Discord → Settings → Keybinds (configure them in PadDeck Settings → Discord).">
          <Sel value={action.op || 'launch'} onChange={(v) => set({ op: v })} options={[['launch', 'Launch Discord'], ['mute', 'Toggle Discord mute'], ['deafen', 'Toggle Discord deafen']]} />
        </Field>
      )}
      {action.type === 'profile' && <Field label="Profile" hint="Switches the profile on the device you press it on"><Sel value={action.profileId || ''} onChange={(v) => set({ profileId: v })} options={[['', 'Choose…'], ...config.profiles.map((p) => [p.id, p.name] as [string, string])]} /></Field>}
      {action.type === 'page' && <Field label="Page"><Sel value={action.pageId || ''} onChange={(v) => set({ pageId: v })} options={[['', 'Choose…'], ...prof.pages.map((p) => [p.id, p.name] as [string, string])]} /></Field>}
      {action.type === 'mode' && <Field label="Mode"><Sel value={action.mode || 'deck'} onChange={(v) => set({ mode: v })} options={MODES as [string, string][]} /></Field>}
      <FilePicker open={!!browse} mode={browse === 'dir' ? 'dir' : browse === 'any' ? 'any' : 'file'} title={browse === 'app' ? 'Choose a program or shortcut' : undefined} onClose={() => setBrowse(null)}
        onPick={(p) => { if (browse === 'app') set({ path: p, appId: null, name: baseName(p) }); else set({ path: p, name: baseName(p) }) }} />
    </div>
  )
}

function MacroEditor({ steps, onChange }: { steps: any[]; onChange: (s: any[]) => void }) {
  const upd = (i: number, p: any) => onChange(steps.map((s, j) => (j === i ? { ...s, ...p } : s)))
  return (
    <Field label="Macro steps" hint="Steps run in order on the PC">
      <div className="space-y-2">
        {steps.map((s, i) => (
          <div key={i} className="flex gap-2 items-start">
            <span className="w-7 h-11 flex items-center justify-center text-[12px] text-ink-3">{i + 1}</span>
            <select className="field !w-28" value={s.type} onChange={(e) => upd(i, { type: e.target.value })}>
              <option value="keys">Keys</option><option value="text">Text</option><option value="delay">Delay</option>
            </select>
            <div className="flex-1">
              {s.type === 'keys' && <input className="field" placeholder="Ctrl + C" defaultValue={fmtKeys(s.keys)} onChange={(e) => upd(i, { keys: parseKeys(e.target.value) })} />}
              {s.type === 'text' && <input className="field" value={s.text || ''} onChange={(e) => upd(i, { text: e.target.value })} />}
              {s.type === 'delay' && <input type="number" className="field" value={s.ms ?? 100} onChange={(e) => upd(i, { ms: Number(e.target.value) })} />}
            </div>
            <IconBtn icon="Trash2" size={44} onClick={() => onChange(steps.filter((_, j) => j !== i))} />
          </div>
        ))}
        <div className="flex gap-2">
          <Btn size="sm" icon="Keyboard" onClick={() => onChange([...steps, { type: 'keys', keys: [] }])}>Keys</Btn>
          <Btn size="sm" icon="Type" onClick={() => onChange([...steps, { type: 'text', text: '' }])}>Text</Btn>
          <Btn size="sm" icon="Timer" onClick={() => onChange([...steps, { type: 'delay', ms: 200 }])}>Delay</Btn>
        </div>
      </div>
    </Field>
  )
}
