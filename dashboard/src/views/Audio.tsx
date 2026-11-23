import { useState } from 'react'
import { requestIcon, run, mediaUrl, updateConfig, useStore } from '../lib/store'
import type { AudioDevice, AudioProfile } from '../lib/types'
import { Btn, ColorPick, Confirm, Field, Icon, IconBtn, IconPicker, Modal, Panel, Slider, cx, uid } from '../components/ui'
import { useEffect } from 'react'

const devIcon = (d: AudioDevice, input: boolean) => {
  const n = `${d.name} ${d.description}`.toLowerCase()
  if (input) return /headset|hands-free/.test(n) ? 'Headset' : /array|built|realtek|intel/.test(n) ? 'Laptop' : /cam|brio|webcam/.test(n) ? 'Webcam' : 'Mic'
  return /headphone|headset|buds|airpods/.test(n) ? 'Headphones' : /monitor|hdmi|display|nvidia/.test(n) ? 'Monitor' : /speaker|realtek/.test(n) ? 'Speaker' : 'AudioLines'
}

export function AudioView() {
  const pc = useStore((s) => s.pc)
  const config = useStore((s) => s.config)!
  const [editing, setEditing] = useState<AudioProfile | null>(null)
  if (!pc) return null
  const out = pc.audio.outputs.find((d) => d.isDefault)
  const mic = pc.audio.inputs.find((d) => d.isDefault)

  return (
    <div className="h-full grid grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] gap-[var(--gap)] min-h-0">
      <div className="flex flex-col gap-[var(--gap)] min-h-0 overflow-y-auto thin-scroll pr-1">
        <Panel title="Master volume" icon="Volume2" right={<span className="text-[12px] text-ink-3 truncate max-w-[220px]">{out?.name}</span>}>
          <div className="flex items-center gap-4">
            <IconBtn icon={out?.muted ? 'VolumeX' : 'Volume2'} size={56} active={!!out?.muted} onClick={() => run({ type: 'volume', mode: 'mute' }, { quiet: true })} label="Mute" />
            <Slider value={out?.volume ?? 0} onChange={(v) => run({ type: 'volume', mode: 'set', value: v }, { quiet: true })} />
            <span className="text-[30px] font-semibold tabular-nums w-[84px] text-right">{out?.volume ?? '–'}<span className="text-[15px] text-ink-3">%</span></span>
          </div>
        </Panel>
        <Panel title="Output devices" icon="Speaker">
          <div className="grid grid-cols-2 gap-2.5">
            {pc.audio.outputs.map((d) => (
              <button key={d.id} onClick={() => !d.isDefault && run({ type: 'output', deviceId: d.id, deviceName: d.name })}
                className={cx('tap rounded-2xl p-3.5 text-left flex items-center gap-3 min-h-[72px]', d.isDefault ? 'bg-accent text-white shadow-[0_10px_30px_-12px_var(--accent)]' : 'bg-surface-2')}>
                <span className={cx('w-11 h-11 rounded-xl flex items-center justify-center shrink-0', d.isDefault ? 'bg-white/20' : 'bg-surface')}><Icon name={devIcon(d, false)} size={21} /></span>
                <span className="min-w-0 flex-1"><span className="block text-[14px] font-medium truncate">{d.name.replace(/\s*\(.*\)$/, '')}</span>
                  <span className={cx('block text-[12px] truncate', d.isDefault ? 'text-white/75' : 'text-ink-3')}>{/\((.*)\)/.exec(d.name)?.[1] || d.description} · {d.muted ? 'muted' : `${d.volume}%`}{d.isDefaultComm ? ' · calls' : ''}</span></span>
                {d.isDefault && <Icon name="CircleCheck" size={20} />}
              </button>
            ))}
          </div>
        </Panel>
        <Panel title="Microphone" icon="Mic">
          <div className="flex items-center gap-4 mb-3">
            <button onClick={() => run({ type: 'micMute' }, { quiet: true })} className={cx('tap w-[92px] h-[92px] rounded-[26px] flex flex-col items-center justify-center gap-1 text-white shrink-0', !mic ? 'bg-ink-3' : mic.muted ? 'bg-bad shadow-[0_10px_30px_-10px_#ef4444]' : 'bg-ok shadow-[0_10px_30px_-10px_#22c55e]')}>
              <Icon name={!mic ? 'MicOff' : mic.muted ? 'MicOff' : 'Mic'} size={34} /><span className="text-[11px] font-semibold">{!mic ? 'N/A' : mic.muted ? 'MUTED' : 'LIVE'}</span>
            </button>
            <div className="flex-1 min-w-0">
              <div className="text-[15px] font-medium truncate">{mic?.name || 'No microphone available'}</div>
              <div className="flex items-center gap-3"><Slider value={mic?.volume ?? 0} disabled={!mic} onChange={(v) => run({ type: 'micVolume', value: v }, { quiet: true })} /><span className="tabular-nums w-11 text-right text-[15px]">{mic?.volume ?? '–'}%</span></div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {pc.audio.inputs.map((d) => (
              <button key={d.id} onClick={() => !d.isDefault && run({ type: 'input', deviceId: d.id, deviceName: d.name })}
                className={cx('tap rounded-2xl px-3 py-2.5 text-left flex items-center gap-2.5', d.isDefault ? 'bg-accent text-white' : 'bg-surface-2')}>
                <Icon name={devIcon(d, true)} size={18} /><span className="flex-1 truncate text-[13px]">{d.name}</span>{d.muted && <Icon name="MicOff" size={14} className={d.isDefault ? '' : 'text-bad'} />}
              </button>
            ))}
          </div>
        </Panel>
      </div>
      <div className="flex flex-col gap-[var(--gap)] min-h-0">
        <Panel title="Audio profiles" icon="SlidersHorizontal" right={<Btn size="sm" icon="Plus" onClick={() => setEditing({ id: uid('ap'), name: 'New profile', icon: 'Headphones', color: '#7c5cff', output: null, input: null, volume: 50, micVolume: null, micMuted: null, systemMuted: false })}>New</Btn>}>
          <div className="grid grid-cols-3 gap-2">
            {config.audioProfiles.map((p) => (
              <ProfileCard key={p.id} p={p} active={config.activeAudioProfileId === p.id} onEdit={() => setEditing(p)} />
            ))}
          </div>
        </Panel>
        <Panel title="App volume" icon="SlidersVertical" className="flex-1 min-h-0">
          <div className="overflow-y-auto thin-scroll -mr-2 pr-2 space-y-1.5 min-h-0">
            {pc.audio.sessions.length === 0 && <div className="text-[13px] text-ink-3">No applications are using audio.</div>}
            {[...pc.audio.sessions].sort((a, b) => Number(b.active) - Number(a.active)).map((s) => <SessionRow key={s.pid} s={s} />)}
          </div>
        </Panel>
      </div>
      {editing && <ProfileEditor profile={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

function SessionRow({ s }: { s: { pid: number; name: string; path: string | null; volume: number; muted: boolean; active: boolean } }) {
  const icons = useStore((st) => st.icons)
  const key = s.path ? `file:${s.path}` : null
  useEffect(() => { if (s.path) requestIcon(`file:${s.path}`, { path: s.path }) }, [s.path])
  const img = key ? icons[key] : null
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-surface-2/60 px-3 py-1.5">
      <span className="w-9 h-9 rounded-xl bg-surface flex items-center justify-center shrink-0 overflow-hidden">
        {img ? <img src={mediaUrl(img)} className="w-7 h-7" alt="" /> : <Icon name={s.pid === 0 ? 'Bell' : 'AppWindow'} size={17} className="text-ink-2" />}
      </span>
      <div className="w-[120px] min-w-0"><div className="text-[13px] font-medium truncate">{s.name}</div><div className="text-[11px] text-ink-3">{s.active ? '● playing' : 'idle'}</div></div>
      <Slider value={s.volume} onChange={(v) => run({ type: 'appVolume', pid: s.pid, volume: v }, { quiet: true })} className="!h-9" />
      <span className="tabular-nums text-[12px] w-9 text-right">{s.volume}%</span>
      <button onClick={() => run({ type: 'appVolume', pid: s.pid, mute: !s.muted }, { quiet: true })} className={cx('tap w-9 h-9 rounded-xl flex items-center justify-center', s.muted ? 'bg-bad text-white' : 'text-ink-2')}><Icon name={s.muted ? 'VolumeX' : 'Volume2'} size={17} /></button>
    </div>
  )
}

function ProfileCard({ p, active, onEdit }: { p: AudioProfile; active: boolean; onEdit: () => void }) {
  const t = useStoreTimer(onEdit)
  return (
    <button {...t} onClick={() => run({ type: 'audioProfile', id: p.id })}
      className={cx('tap rounded-2xl p-3 text-left flex flex-col gap-2 min-h-[96px] relative', active ? 'text-white' : 'bg-surface-2')}
      style={active ? { background: p.color, boxShadow: `0 10px 30px -12px ${p.color}` } : undefined}>
      <span className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: active ? 'rgba(255,255,255,.2)' : p.color, color: '#fff' }}><Icon name={p.icon} size={18} /></span>
      <span className="text-[14px] font-semibold">{p.name}</span>
      <span className={cx('text-[11px] leading-tight line-clamp-2', active ? 'text-white/80' : 'text-ink-3')}>{[p.output?.name, p.volume !== null && `${p.volume}%`, p.systemMuted && 'muted', p.micMuted && 'mic off'].filter(Boolean).join(' · ') || 'Volume only'}</span>
      <span onClick={(e) => { e.stopPropagation(); onEdit() }} className="absolute top-2 right-2 w-8 h-8 rounded-lg flex items-center justify-center opacity-70"><Icon name="Pencil" size={14} /></span>
    </button>
  )
}

function useStoreTimer(onLong: () => void) {
  let timer: number | undefined
  return {
    onPointerDown: () => { timer = window.setTimeout(onLong, 600) },
    onPointerUp: () => clearTimeout(timer), onPointerLeave: () => clearTimeout(timer),
  }
}

function ProfileEditor({ profile, onClose }: { profile: AudioProfile; onClose: () => void }) {
  const pc = useStore((s) => s.pc)!
  const config = useStore((s) => s.config)!
  const [p, setP] = useState<AudioProfile>(structuredClone(profile))
  const [askDel, setAskDel] = useState(false)
  const exists = config.audioProfiles.some((x) => x.id === p.id)
  const set = (x: Partial<AudioProfile>) => setP((o) => ({ ...o, ...x }))
  const save = () => { updateConfig((c) => { const i = c.audioProfiles.findIndex((x) => x.id === p.id); if (i >= 0) c.audioProfiles[i] = p; else c.audioProfiles.push(p) }); onClose() }
  const tri = (v: boolean | null, on: string, off: string, cb: (v: boolean | null) => void) => (
    <div className="flex gap-1.5">{[[null, "Don't change"], [false, off], [true, on]].map(([val, l]: any) => <button key={String(val)} onClick={() => cb(val)} className={cx('tap h-9 px-3 rounded-xl text-[12px]', v === val ? 'bg-accent text-white' : 'bg-surface-2')}>{l}</button>)}</div>
  )
  const devPick = (list: AudioDevice[], cur: { id: string; name: string } | null, cb: (d: { id: string; name: string } | null) => void, input: boolean) => (
    <div className="grid grid-cols-2 gap-1.5">
      <button onClick={() => cb(null)} className={cx('tap px-3 py-2 rounded-xl text-[13px] text-left', !cur ? 'bg-accent text-white' : 'bg-surface-2')}>Keep current</button>
      {list.map((d) => <button key={d.id} onClick={() => cb({ id: d.id, name: d.name })} className={cx('tap px-3 py-2 rounded-xl text-[13px] text-left truncate flex items-center gap-2', cur?.id === d.id ? 'bg-accent text-white' : 'bg-surface-2')}><Icon name={devIcon(d, input)} size={14} />{d.name}</button>)}
      {cur && !list.some((d) => d.id === cur.id) && <div className="col-span-2 text-[12px] text-warn">“{cur.name}” is not connected right now – it will be used when available.</div>}
    </div>
  )
  return (
    <Modal open wide onClose={onClose} title={exists ? `Edit “${profile.name}”` : 'New audio profile'} footer={<>
      {exists && <Btn variant="ghost" icon="Trash2" className="!text-bad mr-auto" onClick={() => setAskDel(true)}>Delete</Btn>}
      <Btn onClick={onClose}>Cancel</Btn><Btn variant="accent" icon="Check" onClick={save}>Save</Btn></>}>
      <div className="grid grid-cols-2 gap-6">
        <div>
          <Field label="Name"><input className="field" value={p.name} onChange={(e) => set({ name: e.target.value })} /></Field>
          <Field label="Output device">{devPick(pc.audio.outputs, p.output, (d) => set({ output: d }), false)}</Field>
          <Field label="Microphone">{devPick(pc.audio.inputs, p.input, (d) => set({ input: d }), true)}</Field>
        </div>
        <div>
          <Field label={`System volume: ${p.volume === null ? "don't change" : `${p.volume}%`}`}>
            <div className="flex items-center gap-3"><input type="checkbox" checked={p.volume !== null} onChange={(e) => set({ volume: e.target.checked ? 50 : null })} className="w-5 h-5 accent-[var(--accent)]" /><Slider value={p.volume ?? 50} disabled={p.volume === null} live={false} onChange={(v) => set({ volume: v })} /></div>
          </Field>
          <Field label={`Microphone volume: ${p.micVolume === null ? "don't change" : `${p.micVolume}%`}`}>
            <div className="flex items-center gap-3"><input type="checkbox" checked={p.micVolume !== null} onChange={(e) => set({ micVolume: e.target.checked ? 80 : null })} className="w-5 h-5 accent-[var(--accent)]" /><Slider value={p.micVolume ?? 80} disabled={p.micVolume === null} live={false} onChange={(v) => set({ micVolume: v })} /></div>
          </Field>
          <Field label="System audio">{tri(p.systemMuted, 'Mute', 'Unmute', (v) => set({ systemMuted: v }))}</Field>
          <Field label="Microphone">{tri(p.micMuted, 'Mute', 'Unmute', (v) => set({ micMuted: v }))}</Field>
          <Field label="Colour"><ColorPick value={p.color} onChange={(color) => set({ color })} /></Field>
          <Field label="Icon"><IconPicker value={p.icon} onChange={(icon) => set({ icon })} /></Field>
        </div>
      </div>
      <Confirm open={askDel} danger title={`Delete “${p.name}”?`} onNo={() => setAskDel(false)} onYes={() => { updateConfig((c) => { c.audioProfiles = c.audioProfiles.filter((x) => x.id !== p.id) }); onClose() }} />
    </Modal>
  )
}
