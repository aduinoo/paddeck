import { useEffect, useState } from 'react'
import { run, send, updateConfig, useStore } from '../lib/store'
import type { PcState } from '../lib/types'
import { Btn, Icon, IconBtn, Meter, Panel, Ring, Slider, cx, fmtBytes, fmtTime, fmtUptime } from '../components/ui'

const tone = (v: number | null, warn = 70, bad = 90) => (v === null ? 'var(--ink-3)' : v >= bad ? '#ef4444' : v >= warn ? '#f59e0b' : 'var(--accent)')
const tempTone = (t: number | null) => (t === null ? 'var(--ink-3)' : t >= 85 ? '#ef4444' : t >= 70 ? '#f59e0b' : '#22c55e')

export function StatRing({ label, value, sub, icon, temp }: { label: string; value: number | null; sub?: string; icon: string; temp?: number | null }) {
  return (
    <Panel className="flex-row items-center gap-4">
      <Ring value={value} color={tone(value)} size={92}>
        <div className="text-center leading-none"><div className="text-[22px] font-semibold tabular-nums">{value === null ? '—' : value}<span className="text-[12px] text-ink-3">{value === null ? '' : '%'}</span></div></div>
      </Ring>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-ink-2 text-[12px] font-semibold uppercase tracking-wide"><Icon name={icon} size={14} />{label}</div>
        <div className="text-[13px] text-ink-2 truncate mt-1" title={sub}>{sub || 'Unavailable'}</div>
        {temp !== undefined && (
          <div className="mt-2 inline-flex items-center gap-1.5 text-[13px] font-medium" style={{ color: tempTone(temp ?? null) }}>
            <Icon name="Thermometer" size={14} />{temp === null ? <span className="text-ink-3">Temp unavailable</span> : `${Math.round(temp)} °C`}
          </div>
        )}
      </div>
    </Panel>
  )
}

export function CpuWidget({ pc }: { pc: PcState }) {
  const s = pc.stats
  return <StatRing label="CPU" icon="Cpu" value={s.cpu} sub={s.cpuModel ? `${s.cpuModel.replace(/\(R\)|\(TM\)|CPU|Processor/g, '').replace(/\s+/g, ' ').trim()} · ${s.cores} threads` : undefined} temp={s.temps.cpu} />
}
export function GpuWidget({ pc }: { pc: PcState }) {
  const g = pc.stats.gpu
  return <StatRing label="GPU" icon="MonitorCog" value={g?.usage ?? null} sub={g?.name ? `${g.name.replace('NVIDIA GeForce ', '')}${g.memUsed ? ` · ${fmtBytes(g.memUsed)} / ${fmtBytes(g.memTotal)}` : ''}` : undefined} temp={pc.stats.temps.gpu} />
}
export function RamWidget({ pc }: { pc: PcState }) {
  const r = pc.stats.ram
  return <StatRing label="Memory" icon="MemoryStick" value={r?.percent ?? null} sub={r ? `${fmtBytes(r.used)} of ${fmtBytes(r.total)}` : undefined} />
}

export function DiskWidget({ pc }: { pc: PcState }) {
  return (
    <Panel title="Storage" icon="HardDrive">
      <div className="space-y-3">
        {pc.stats.disks.length === 0 && <div className="text-ink-3 text-[13px]">Unavailable</div>}
        {pc.stats.disks.map((d) => {
          const used = d.total - d.free, pct = Math.round((100 * used) / d.total)
          return (
            <div key={d.name}>
              <div className="flex text-[13px] mb-1.5"><span className="font-medium">{d.name} {d.label && <span className="text-ink-3">{d.label}</span>}</span><span className="ml-auto text-ink-2 tabular-nums">{fmtBytes(d.free)} free · {pct}%</span></div>
              <Meter value={pct} color={tone(pct, 80, 92)} />
            </div>
          )
        })}
      </div>
    </Panel>
  )
}

export function NetWidget({ pc }: { pc: PcState }) {
  const n = pc.stats.net
  return (
    <Panel title="Network" icon="Wifi" right={<span className="text-[11px] text-ink-3">{n?.interfaces.join(', ')}</span>}>
      <div className="grid grid-cols-2 gap-3">
        {[['ArrowDown', 'Download', n?.rx, '#38bdf8'], ['ArrowUp', 'Upload', n?.tx, '#a78bfa']].map(([ic, l, v, c]: any) => (
          <div key={l} className="rounded-2xl bg-surface-2 p-3">
            <div className="flex items-center gap-1.5 text-[12px] text-ink-2"><Icon name={ic} size={14} style={{ color: c }} />{l}</div>
            <div className="text-[20px] font-semibold tabular-nums mt-1">{n ? fmtBytes(v, true) : '—'}</div>
          </div>
        ))}
      </div>
    </Panel>
  )
}

export function UptimeWidget({ pc }: { pc: PcState }) {
  return (
    <Panel title="PC" icon="Clock">
      <div className="text-[26px] font-semibold tabular-nums tracking-tight">{fmtUptime(pc.stats.uptime)}</div>
      <div className="text-[12px] text-ink-3">uptime · {pc.host}</div>
    </Panel>
  )
}

// ---------------------------------------------------------------- peripherals
export function useInputDevice(kind: 'Mouse' | 'Keyboard') {
  const pc = useStore((s) => s.pc)
  const hw = useStore((s) => s.config?.hardware)
  if (!pc || !hw) return null
  const inputs = pc.peripherals.inputs.filter((i) => i.kind === kind)
  const chosenId = kind === 'Mouse' ? hw.mouseId : hw.keyboardId
  let dev = inputs.find((i) => i.id === chosenId)
  if (!dev) {
    // Auto: keyboard = a Bluetooth/USB device reporting a keyboard battery; mouse = a mouse that isn't that keyboard.
    const kbBattery = pc.peripherals.battery.find((b) => b.kinds.includes('Keyboard'))
    const kbInputs = pc.peripherals.inputs.filter((i) => i.kind === 'Keyboard')
    const kb = kbInputs.find((i) => kbBattery && i.address === kbBattery.address) || kbInputs.find((i) => i.bus === 'bluetooth') || kbInputs[0]
    if (kind === 'Keyboard') dev = kb
    else dev = inputs.find((i) => !kb || ((i.address || i.vidpid) !== (kb.address || kb.vidpid))) || inputs[0]
  }
  const battery = dev?.address ? pc.peripherals.battery.find((b) => b.address === dev!.address) : undefined
  return { dev, battery, all: inputs, scannedAt: pc.peripherals.scannedAt }
}

export function BatteryWidget({ kind }: { kind: 'Mouse' | 'Keyboard' }) {
  const info = useInputDevice(kind)
  const th = useStore((s) => s.config?.hardware.batteryThreshold ?? 20)
  const [pick, setPick] = useState(false)
  const lvl = info?.battery?.battery ?? null
  const low = lvl !== null && lvl <= th
  const color = lvl === null ? 'var(--ink-3)' : low ? '#ef4444' : lvl <= 40 ? '#f59e0b' : '#22c55e'
  return (
    <Panel title={kind} icon={kind === 'Mouse' ? 'Mouse' : 'Keyboard'} right={<button className="tap text-ink-3" onClick={() => setPick(!pick)}><Icon name="ChevronsUpDown" size={16} /></button>}>
      {pick ? (
        <div className="space-y-1.5">
          {info?.all.map((d) => (
            <button key={d.id} onClick={() => { updateConfig((c) => { c.hardware[kind === 'Mouse' ? 'mouseId' : 'keyboardId'] = d.id }); setPick(false) }}
              className={cx('tap w-full text-left px-3 py-2 rounded-xl text-[13px]', d.id === info.dev?.id ? 'bg-accent text-white' : 'bg-surface-2')}>{d.name} <span className="opacity-60">· {d.bus}</span></button>
          ))}
          {!info?.all.length && <div className="text-[13px] text-ink-3">No {kind.toLowerCase()} detected</div>}
        </div>
      ) : (
        <div className="flex items-center gap-4">
          <div className="relative w-[64px] h-[30px] rounded-[9px] border-2 shrink-0" style={{ borderColor: color }}>
            <div className="absolute top-[7px] -right-[6px] w-[4px] h-[12px] rounded-r" style={{ background: color }} />
            <div className="absolute inset-[3px] rounded-[5px] transition-[width] duration-700" style={{ width: lvl === null ? 0 : `calc(${lvl}% - 6px)`, background: color }} />
          </div>
          <div className="min-w-0">
            <div className="text-[24px] font-semibold tabular-nums leading-none" style={{ color: low ? '#ef4444' : undefined }}>{lvl === null ? <span className="text-[16px] text-ink-2">Unavailable</span> : `${lvl}%`}</div>
            <div className="text-[12px] text-ink-2 truncate mt-1" title={info?.dev?.name}>{info?.dev?.name || `No ${kind.toLowerCase()} detected`}</div>
            <div className="text-[11px] text-ink-3 mt-0.5">
              {lvl !== null ? (low ? 'Low battery – charge soon' : 'Charging status not reported by Windows')
                : info?.dev ? (info.dev.bus === 'usb' ? 'Wireless dongle does not expose battery to Windows' : 'Device does not report battery') : info?.scannedAt ? '' : 'Scanning…'}
            </div>
          </div>
        </div>
      )}
    </Panel>
  )
}

export function OtherBatteries({ pc }: { pc: PcState }) {
  const list = pc.peripherals.battery
  if (!list.length) return null
  return (
    <Panel title="Wireless devices" icon="BatteryMedium" right={<button className="tap text-ink-3" onClick={() => send({ type: 'peripherals.scan' })}><Icon name="RefreshCw" size={15} /></button>}>
      <div className="space-y-2.5">
        {list.map((b) => (
          <div key={b.address || b.name} className="flex items-center gap-3">
            <Icon name={b.kinds.includes('Keyboard') ? 'Keyboard' : b.kinds.includes('Mouse') ? 'Mouse' : /pro|bud|head|airpod|ear/i.test(b.name) ? 'Headphones' : /8bitdo|controller|pad|xbox|dual/i.test(b.name) ? 'Gamepad2' : 'Bluetooth'} size={17} className="text-ink-2 shrink-0" />
            <span className="text-[13px] flex-1 truncate">{b.name}</span>
            <Meter value={b.battery} className="w-20" color={b.battery <= 20 ? '#ef4444' : b.battery <= 40 ? '#f59e0b' : '#22c55e'} />
            <span className="text-[13px] tabular-nums w-10 text-right font-medium">{b.battery}%</span>
          </div>
        ))}
      </div>
    </Panel>
  )
}

export function AudioSummary({ pc }: { pc: PcState }) {
  const out = pc.audio.outputs.find((d) => d.isDefault)
  const mic = pc.audio.inputs.find((d) => d.isDefault)
  return (
    <Panel title="Audio" icon="Speaker">
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <IconBtn icon={out?.muted ? 'VolumeX' : 'Volume2'} active={!!out?.muted} onClick={() => run({ type: 'volume', mode: 'mute' }, { quiet: true })} />
          <div className="flex-1 min-w-0"><div className="text-[13px] truncate">{out?.name || 'No output device'}</div><Slider value={out?.volume ?? 0} onChange={(v) => run({ type: 'volume', mode: 'set', value: v }, { quiet: true })} className="!h-8" /></div>
          <span className="tabular-nums text-[13px] w-9 text-right">{out?.volume ?? '–'}%</span>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => run({ type: 'micMute' }, { quiet: true })} className={cx('tap w-11 h-11 rounded-2xl flex items-center justify-center text-white', !mic ? 'bg-ink-3' : mic.muted ? 'bg-bad' : 'bg-ok')}><Icon name={mic?.muted ? 'MicOff' : 'Mic'} size={20} /></button>
          <div className="flex-1 min-w-0"><div className="text-[13px] truncate">{mic?.name || 'No microphone'}</div><Slider value={mic?.volume ?? 0} onChange={(v) => run({ type: 'micVolume', value: v }, { quiet: true })} className="!h-8" /></div>
          <span className="tabular-nums text-[13px] w-9 text-right">{mic?.volume ?? '–'}%</span>
        </div>
      </div>
    </Panel>
  )
}

// ---------------------------------------------------------------- YouTube Music
export function MediaWidget({ big }: { big?: boolean }) {
  const pc = useStore((s) => s.pc)
  const art = useStore((s) => s.pc?.mediaArt)
  const cfg = useStore((s) => s.config)!
  const m = pc?.media.current
  const [pos, setPos] = useState(0)
  const [seeking, setSeeking] = useState<number | null>(null)
  useEffect(() => {
    if (!m) return
    setPos(m.position)
    if (m.status !== 'playing') return
    const t0 = Date.now(), p0 = m.position
    const t = setInterval(() => setPos(Math.min(m.duration || Infinity, p0 + (Date.now() - t0) / 1000)), 250)
    return () => clearInterval(t)
  }, [m?.position, m?.status, m?.duration, m?.title])
  const browserExe = m ? (/msedge|edge/i.test(m.appId) ? 'msedge.exe' : /chrome|cinhim/i.test(m.appId) ? 'chrome.exe' : null) : null
  const session = browserExe ? pc?.audio.sessions.find((s) => s.path?.toLowerCase().endsWith(browserExe)) : pc?.audio.sessions.find((s) => m && s.path && m.appId.toLowerCase().includes((s.path.split('\\').pop() || '').replace('.exe', '').toLowerCase()))
  const playing = m?.status === 'playing'
  const source = !m ? '' : /cinhimbnkkaeohfgghhklpknlkffjgod/.test(m.appId) ? 'YouTube Music app' : /chrome/i.test(m.appId) ? 'Chrome' : /edge/i.test(m.appId) ? 'Edge' : m.appId.split(/[\\!.]/).filter(Boolean).pop()

  return (
    <Panel title="YouTube Music" icon="Music" className={big ? 'h-full' : ''}
      right={<button onClick={() => run({ type: 'ytmusic' })} className="tap text-[12px] text-accent font-medium flex items-center gap-1"><Icon name="ExternalLink" size={13} />Open</button>}>
      {!m ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-2 py-4 text-ink-2">
          <Icon name="Music2" size={30} className="text-ink-3" />
          <div className="text-[14px]">Nothing is playing</div>
          <div className="text-[12px] text-ink-3 max-w-[260px]">Start YouTube Music in Chrome, Edge or the installed web app – it appears here automatically.</div>
          <Btn size="sm" variant="accent" icon="Play" className="mt-1" onClick={() => run({ type: 'ytmusic' })}>Open YouTube Music</Btn>
        </div>
      ) : (
        <div className={cx('flex gap-4', big ? 'flex-col items-center flex-1 justify-center' : 'items-center')}>
          <div className={cx('rounded-2xl overflow-hidden bg-surface-2 shrink-0 shadow-lg flex items-center justify-center', big ? 'w-[min(38vh,320px)] aspect-square' : 'w-[104px] h-[104px]')}>
            {art ? <img src={art} alt="" className="w-full h-full object-cover" /> : <Icon name="Disc3" size={36} className="text-ink-3" />}
          </div>
          <div className={cx('min-w-0 flex-1 w-full', big && 'max-w-[560px] text-center')}>
            <div className={cx('font-semibold truncate', big ? 'text-[24px]' : 'text-[16px]')}>{m.title || 'Unknown title'}</div>
            <div className="text-[13px] text-ink-2 truncate">{m.artist || '—'}{m.album ? ` · ${m.album}` : ''}</div>
            <div className="mt-1.5">
              <Slider value={seeking ?? pos} max={Math.max(1, m.duration)} disabled={!m.canSeek || !m.duration} live={false}
                onChange={(v, final) => { if (final) { setSeeking(null); setPos(v); send({ type: 'media.seek', appId: m.appId, position: v }) } else setSeeking(v) }} className="!h-7" />
              <div className="flex justify-between text-[11px] text-ink-3 tabular-nums -mt-1"><span>{fmtTime(seeking ?? pos)}</span><span>{m.duration ? fmtTime(m.duration) : '--:--'}</span></div>
            </div>
            <div className={cx('flex items-center gap-2 mt-1', big ? 'justify-center' : '')}>
              <IconBtn icon="SkipBack" size={big ? 56 : 44} onClick={() => run({ type: 'media', action: 'prev', appId: m.appId }, { quiet: true })} />
              <button onClick={() => run({ type: 'media', action: 'toggle', appId: m.appId }, { quiet: true })} className="tap rounded-full bg-accent text-white flex items-center justify-center shadow-[0_10px_30px_-10px_var(--accent)]" style={{ width: big ? 72 : 52, height: big ? 72 : 52 }}>
                <Icon name={playing ? 'Pause' : 'Play'} size={big ? 30 : 22} fill="currentColor" />
              </button>
              <IconBtn icon="SkipForward" size={big ? 56 : 44} onClick={() => run({ type: 'media', action: 'next', appId: m.appId }, { quiet: true })} />
              {session && (
                <div className={cx('flex items-center gap-2 ml-2', big ? 'w-56' : 'flex-1 min-w-[120px]')}>
                  <button className="tap text-ink-2" onClick={() => run({ type: 'appVolume', pid: session.pid, mute: !session.muted }, { quiet: true })}><Icon name={session.muted ? 'VolumeX' : 'Volume1'} size={18} /></button>
                  <Slider value={session.volume} onChange={(v) => run({ type: 'appVolume', pid: session.pid, volume: v }, { quiet: true })} className="!h-7" />
                </div>
              )}
            </div>
            <div className="text-[11px] text-ink-3 mt-1.5 flex items-center gap-1.5">
              <span className={cx('w-1.5 h-1.5 rounded-full', playing ? 'bg-ok' : 'bg-ink-3')} />{m.status} · via {source}
              {pc && pc.media.sessions.length > 1 && (
                <select className="ml-auto bg-transparent text-ink-2 text-[11px] outline-none" value={cfg.youtubeMusic.pinnedAppId || ''} onChange={(e) => updateConfig((c) => { c.youtubeMusic.pinnedAppId = e.target.value || null })}>
                  <option value="">Auto-select player</option>
                  {pc.media.sessions.map((s) => <option key={s.appId} value={s.appId}>{s.title ? `${s.title.slice(0, 24)} (${s.appId.slice(0, 16)})` : s.appId}</option>)}
                </select>
              )}
            </div>
          </div>
        </div>
      )}
    </Panel>
  )
}

export function FocusWidget() {
  const f = useStore((s) => s.config!.focus)
  return (
    <Panel title="Focus mode" icon="Target">
      <button onClick={() => run({ type: 'focus' })} className={cx('tap w-full rounded-2xl p-4 flex items-center gap-3 text-left', f.active ? 'bg-accent text-white' : 'bg-surface-2')}>
        <Icon name={f.active ? 'Target' : 'Crosshair'} size={26} />
        <div className="flex-1"><div className="font-semibold">{f.active ? 'Focus is on' : 'Start focus'}</div>
          <div className={cx('text-[12px]', f.active ? 'text-white/80' : 'text-ink-3')}>{[f.volume !== null && `volume ${f.volume}%`, f.silenceToasts && 'notifications off', f.muteSoundboard && 'soundboard muted', f.launch.length && `${f.launch.length} app(s)`].filter(Boolean).join(' · ')}</div></div>
        <span className={cx('w-12 h-7 rounded-full p-1', f.active ? 'bg-white/30' : 'bg-surface')}><span className={cx('block w-5 h-5 rounded-full bg-white transition-transform', f.active && 'translate-x-5')} /></span>
      </button>
    </Panel>
  )
}

export function DiscordWidget() {
  const pc = useStore((s) => s.pc)
  const apps = useStore((s) => s.apps)
  const installed = apps.some((a) => /discord/i.test(a.name))
  const mic = pc?.audio.inputs.find((d) => d.isDefault)
  const running = pc?.audio.sessions.some((s) => /discord/i.test(s.name + (s.path || '')))
  return (
    <Panel title="Discord & voice" icon="MessageCircle" right={<span className={cx('text-[11px] font-medium', running ? 'text-ok' : 'text-ink-3')}>{installed ? (running ? '● Discord audio active' : 'Discord idle') : 'Discord not found'}</span>}>
      <div className="grid grid-cols-4 gap-2">
        <button onClick={() => run({ type: 'micMute' }, { quiet: true })} className={cx('tap col-span-2 row-span-2 rounded-2xl flex flex-col items-center justify-center gap-1 text-white min-h-[112px]', !mic ? 'bg-ink-3' : mic.muted ? 'bg-bad' : 'bg-ok')}>
          <Icon name={mic?.muted ? 'MicOff' : 'Mic'} size={34} /><span className="font-semibold">{!mic ? 'Unavailable' : mic.muted ? 'Muted' : 'Mic live'}</span>
          <span className="text-[11px] opacity-80">Windows-level · works in every app</span>
        </button>
        {[['Rocket', 'Launch', { type: 'discord', op: 'launch' }], ['MicOff', 'Discord mute', { type: 'discord', op: 'mute' }], ['HeadphoneOff', 'Deafen', { type: 'discord', op: 'deafen' }], ['Settings2', 'Sound settings', { type: 'system', op: 'sound-settings' }]].map(([ic, l, a]: any) => (
          <button key={l} onClick={() => run(a)} className="tap rounded-2xl bg-surface-2 flex flex-col items-center justify-center gap-1 h-[52px] text-[11px] font-medium"><Icon name={ic} size={17} />{l}</button>
        ))}
      </div>
    </Panel>
  )
}

export function ShortcutsWidget() {
  const items: [string, string, any][] = [['Lock', 'Lock', { type: 'system', op: 'lock' }], ['Camera', 'Screenshot', { type: 'system', op: 'screenshot' }], ['Scissors', 'Snip', { type: 'system', op: 'snip' }], ['Activity', 'Task Manager', { type: 'system', op: 'taskmgr' }], ['FolderOpen', 'Explorer', { type: 'system', op: 'explorer' }], ['Settings', 'Settings', { type: 'system', op: 'settings' }]]
  return (
    <Panel title="Shortcuts" icon="Zap">
      <div className="grid grid-cols-3 gap-2">
        {items.map(([ic, l, a]) => <button key={l} onClick={() => run(a)} className="tap rounded-2xl bg-surface-2 h-16 flex flex-col items-center justify-center gap-1 text-[12px] font-medium"><Icon name={ic} size={19} />{l}</button>)}
      </div>
    </Panel>
  )
}
