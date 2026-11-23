import { useEffect, useState } from 'react'
import { activeProfile, connect, mediaUrl, run, updateConfig, useStore } from './lib/store'
import { Icon, cx, Slider } from './components/ui'
import { Toasts } from './components/Toasts'
import { Pair } from './views/Pair'
import { Deck } from './views/Deck'
import { Control } from './views/Control'
import { AudioView } from './views/Audio'
import { Sounds } from './views/Sounds'
import { AppsView } from './views/Apps'
import { Draw } from './views/Draw'
import { Display } from './views/Display'
import { Settings } from './views/Settings'

export type Mode = 'deck' | 'control' | 'audio' | 'sounds' | 'apps' | 'draw' | 'display' | 'settings'
const NAV: { id: Mode; icon: string; label: string }[] = [
  { id: 'deck', icon: 'LayoutGrid', label: 'Stream Deck' },
  { id: 'control', icon: 'Gauge', label: 'Control Centre' },
  { id: 'audio', icon: 'SlidersVertical', label: 'Audio' },
  { id: 'sounds', icon: 'AudioLines', label: 'Soundboard' },
  { id: 'apps', icon: 'AppWindow', label: 'Apps' },
  { id: 'draw', icon: 'PenTool', label: 'Drawing Tablet' },
  { id: 'display', icon: 'MonitorSmartphone', label: 'Second Monitor' },
]

const lsGet = (k: string) => { try { return localStorage.getItem(k) } catch { return null } }
const lsSet = (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* ignore */ } }

export default function App() {
  const status = useStore((s) => s.status)
  const config = useStore((s) => s.config)
  const [mode, setModeRaw] = useState<Mode>(() => (lsGet('paddeck.mode') as Mode) || 'deck')
  const [immersive, setImmersive] = useState(false)
  const setMode = (m: Mode) => { setModeRaw(m); lsSet('paddeck.mode', m); setImmersive(false) }

  useEffect(() => { connect() }, [])
  useEffect(() => { const h = (e: Event) => setMode((e as CustomEvent).detail); window.addEventListener('paddeck:mode', h); return () => window.removeEventListener('paddeck:mode', h) }, [])

  const prof = activeProfile(config)
  const theme = prof?.theme
  useEffect(() => {
    if (!theme) return
    const r = document.documentElement
    r.dataset.theme = theme.mode
    r.style.setProperty('--accent', theme.accent)
    r.style.setProperty('--radius', `${theme.radius}px`)
    r.style.setProperty('--gap', `${theme.gap}px`)
    r.style.setProperty('--font-sans', `'${theme.font === 'Inter' ? 'Inter Variable' : theme.font}', ui-sans-serif, system-ui, sans-serif`)
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', theme.mode === 'light' ? '#eef0f6' : '#07070d')
  }, [theme])

  if (status === 'unpaired') return <><Background /><Pair /><Toasts /></>
  if (!config || !prof) return <><Background /><Connecting /><Toasts /></>

  const fullBleed = mode === 'draw' || mode === 'display'
  return (
    <div className="h-full flex flex-col">
      <Background kind={theme?.background.type === 'image' ? 'image' : theme?.background.value} image={theme?.background.type === 'image' ? theme.background.value : undefined} />
      {!immersive && <TopBar mode={mode} />}
      <div className="flex-1 flex min-h-0">
        {!immersive && <Rail mode={mode} setMode={setMode} />}
        <main className={cx('flex-1 min-w-0 min-h-0', !fullBleed && 'pr-4 pb-4', !fullBleed && immersive && 'p-4')}>
          {mode === 'deck' && <Deck />}
          {mode === 'control' && <Control />}
          {mode === 'audio' && <AudioView />}
          {mode === 'sounds' && <Sounds />}
          {mode === 'apps' && <AppsView />}
          {mode === 'draw' && <Draw immersive={immersive} setImmersive={setImmersive} />}
          {mode === 'display' && <Display />}
          {mode === 'settings' && <Settings />}
        </main>
      </div>
      <Toasts />
    </div>
  )
}

function Background({ kind = 'aurora', image }: { kind?: string; image?: string }) {
  return <div className="app-bg" data-kind={kind}>{kind === 'image' && image && <img src={mediaUrl(image)} alt="" />}</div>
}

function Connecting() {
  const status = useStore((s) => s.status)
  return (
    <div className="h-full flex flex-col items-center justify-center gap-4 text-ink-2">
      <div className="w-14 h-14 rounded-2xl bg-accent/20 flex items-center justify-center"><Icon name="Loader" className="animate-spin text-accent" size={26} /></div>
      <div className="text-[15px]">{status === 'disconnected' ? 'PC not reachable – retrying…' : 'Connecting to your PC…'}</div>
      <div className="text-[12px] text-ink-3 max-w-xs text-center">Make sure the PadDeck companion is running on the PC and both devices are on the same Wi-Fi network.</div>
    </div>
  )
}

function Rail({ mode, setMode }: { mode: Mode; setMode: (m: Mode) => void }) {
  return (
    <nav className="w-[84px] shrink-0 flex flex-col items-center gap-2 py-2 px-3">
      {NAV.map((n) => (
        <button key={n.id} onClick={() => setMode(n.id)} title={n.label}
          className={cx('tap group relative w-14 h-14 rounded-2xl flex flex-col items-center justify-center gap-0.5', mode === n.id ? 'bg-accent text-white shadow-[0_10px_28px_-10px_var(--accent)]' : 'text-ink-2 hover:bg-surface')}>
          <Icon name={n.icon} size={22} />
          <span className="text-[9.5px] font-medium leading-none mt-0.5 opacity-90">{n.label.split(' ')[0]}</span>
        </button>
      ))}
      <div className="flex-1" />
      <button onClick={() => setMode('settings')} title="Settings" className={cx('tap w-14 h-14 rounded-2xl flex items-center justify-center', mode === 'settings' ? 'bg-accent text-white' : 'text-ink-2')}>
        <Icon name="Settings" size={22} />
      </button>
    </nav>
  )
}

function TopBar({ mode }: { mode: Mode }) {
  const status = useStore((s) => s.status)
  const latency = useStore((s) => s.latency)
  const config = useStore((s) => s.config)!
  const pc = useStore((s) => s.pc)
  const [now, setNow] = useState(new Date())
  const [profOpen, setProfOpen] = useState(false)
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t) }, [])
  const prof = activeProfile(config)!
  const out = pc?.audio.outputs.find((d) => d.isDefault)
  const mic = pc?.audio.inputs.find((d) => d.isDefault)
  const [isFs, setFs] = useState(!!document.fullscreenElement)
  useEffect(() => { const h = () => setFs(!!document.fullscreenElement); document.addEventListener('fullscreenchange', h); return () => document.removeEventListener('fullscreenchange', h) }, [])
  const toggleFs = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else { await document.documentElement.requestFullscreen({ navigationUI: 'hide' }); try { await (screen.orientation as any).lock?.('landscape') } catch { /* optional */ } }
    } catch { /* not allowed */ }
  }
  const dot = status === 'connected' ? (latency !== null && latency > 250 ? 'bg-warn' : 'bg-ok') : status === 'connecting' ? 'bg-warn pulse-dot' : 'bg-bad pulse-dot'
  const label = status === 'connected' ? `Connected${latency !== null ? ` · ${latency} ms` : ''}` : status === 'connecting' ? 'Connecting…' : 'Disconnected'

  return (
    <header className="h-[68px] shrink-0 flex items-center gap-3 px-4">
      <div className="flex items-center gap-2.5 w-[200px]">
        <img src="/favicon.svg" className="w-9 h-9" alt="" />
        <div className="leading-tight">
          <div className="font-semibold text-[15px] tracking-tight">PadDeck</div>
          <div className="text-[11px] text-ink-3 truncate max-w-[140px]">{pc?.host || 'PC'}</div>
        </div>
      </div>
      <div className="glass rounded-full h-10 px-3.5 flex items-center gap-2 text-[12.5px] font-medium">
        <span className={cx('w-2.5 h-2.5 rounded-full', dot)} />{label}
      </div>
      <div className="relative">
        <button onClick={() => setProfOpen((v) => !v)} className="tap glass rounded-full h-10 pl-2 pr-3.5 flex items-center gap-2 text-[12.5px] font-medium">
          <span className="w-7 h-7 rounded-full flex items-center justify-center text-white" style={{ background: prof.color }}><Icon name={prof.icon} size={15} /></span>
          {prof.name}<Icon name="ChevronDown" size={15} className="text-ink-3" />
        </button>
        {profOpen && (
          <div className="absolute z-40 top-12 left-0 w-64 glass rounded-2xl p-2 pop-in bg-[var(--bg)]/80" onPointerLeave={() => setProfOpen(false)}>
            {config.profiles.map((p) => (
              <button key={p.id} onClick={() => { updateConfig((c) => { c.activeProfileId = p.id }); setProfOpen(false) }}
                className={cx('tap w-full flex items-center gap-2.5 p-2 rounded-xl text-left text-[14px]', p.id === prof.id && 'bg-surface-2')}>
                <span className="w-8 h-8 rounded-full flex items-center justify-center text-white" style={{ background: p.color }}><Icon name={p.icon} size={16} /></span>
                <span className="flex-1 truncate">{p.name}</span>{p.id === prof.id && <Icon name="Check" size={16} className="text-accent" />}
              </button>
            ))}
            <div className="text-[11px] text-ink-3 px-2 pt-2">Manage profiles in Settings</div>
          </div>
        )}
      </div>
      {config.focus.active && (
        <button onClick={() => run({ type: 'focus' })} className="tap rounded-full h-10 px-3.5 flex items-center gap-2 text-[12.5px] font-semibold bg-accent text-white"><Icon name="Target" size={15} />Focus on</button>
      )}
      <div className="flex-1" />
      {mode !== 'audio' && out && (
        <div className="hidden lg:flex glass rounded-full h-10 pl-3 pr-2 items-center gap-2 w-[260px]">
          <button onClick={() => run({ type: 'volume', mode: 'mute' }, { quiet: true })} className="tap text-ink-2"><Icon name={out.muted ? 'VolumeX' : 'Volume2'} size={18} /></button>
          <Slider value={out.volume ?? 0} onChange={(v) => run({ type: 'volume', mode: 'set', value: v }, { quiet: true })} className="!h-8" />
          <span className="text-[12px] tabular-nums w-8 text-right text-ink-2">{out.volume ?? '–'}</span>
        </div>
      )}
      <button onClick={() => run({ type: 'micMute' }, { quiet: true })} title={mic?.name}
        className={cx('tap h-10 px-3.5 rounded-full flex items-center gap-2 text-[12.5px] font-semibold text-white', !mic ? 'bg-ink-3' : mic.muted ? 'bg-bad' : 'bg-ok')}>
        <Icon name={mic?.muted ? 'MicOff' : 'Mic'} size={16} />{!mic ? 'No mic' : mic.muted ? 'Muted' : 'Live'}
      </button>
      <div className="text-right leading-tight w-[92px]">
        <div className="text-[19px] font-semibold tabular-nums tracking-tight">{now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
        <div className="text-[11px] text-ink-3">{now.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })}</div>
      </div>
      <button onClick={toggleFs} title="Full screen" className="tap w-10 h-10 rounded-full glass flex items-center justify-center text-ink-2"><Icon name={isFs ? 'Minimize2' : 'Maximize2'} size={17} /></button>
    </header>
  )
}
