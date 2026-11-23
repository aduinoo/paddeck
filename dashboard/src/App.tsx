import { useEffect, useState } from 'react'
import { activeProfile, connect, devicePrefs, isDesktop, mediaUrl, run, switchProfile, useLayout, useOrientation, useStore } from './lib/store'
import { applyTheme } from './lib/theme'
import { Icon, cx, Slider } from './components/ui'
import { Toasts } from './components/Toasts'
import { Pair } from './views/Pair'
import { Deck } from './views/Deck'
import { Control } from './views/Control'
import { AudioView } from './views/Audio'
import { Sounds } from './views/Sounds'
import { AppsView } from './views/Apps'
import { Settings, Profiles } from './views/Settings'
import { Editor } from './views/Editor'
import { Admin } from './admin/Admin'

export type Mode = 'deck' | 'editor' | 'sounds' | 'control' | 'audio' | 'apps' | 'profiles' | 'devices' | 'settings'
type NavItem = { id: Mode; icon: string; label: string; short: string; main?: boolean }
// Tablet / phone: the controller.
const DEVICE_NAV: NavItem[] = [
  { id: 'deck', icon: 'LayoutGrid', label: 'Stream Deck', short: 'Deck', main: true },
  { id: 'sounds', icon: 'AudioLines', label: 'Soundboard', short: 'Sounds', main: true },
  { id: 'control', icon: 'Gauge', label: 'Control Centre', short: 'Control', main: true },
  { id: 'audio', icon: 'SlidersVertical', label: 'Audio', short: 'Audio', main: true },
  { id: 'apps', icon: 'AppWindow', label: 'Apps', short: 'Apps' },
]
// PadDeck Desktop: the editor.
const DESKTOP_NAV: NavItem[] = [
  { id: 'control', icon: 'Gauge', label: 'Dashboard', short: 'Dashboard' },
  { id: 'editor', icon: 'LayoutGrid', label: 'Stream Deck Editor', short: 'Editor' },
  { id: 'apps', icon: 'AppWindow', label: 'Applications', short: 'Apps' },
  { id: 'sounds', icon: 'AudioLines', label: 'Soundboard', short: 'Sounds' },
  { id: 'audio', icon: 'SlidersVertical', label: 'Audio Control', short: 'Audio' },
  { id: 'profiles', icon: 'Users', label: 'Profiles', short: 'Profiles' },
  { id: 'devices', icon: 'Smartphone', label: 'Devices', short: 'Devices' },
]
export const NAV = isDesktop ? DESKTOP_NAV : DEVICE_NAV

const lsGet = (k: string) => { try { return localStorage.getItem(k) } catch { return null } }
const lsSet = (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* ignore */ } }

export default function App() {
  const status = useStore((s) => s.status)
  const config = useStore((s) => s.config)
  const layout = useLayout()
  const orientation = useOrientation()
  const [mode, setModeRaw] = useState<Mode>(() => {
    const m = lsGet('paddeck.mode') as Mode
    return m && (m === 'settings' || NAV.some((n) => n.id === m)) ? m : isDesktop ? 'editor' : 'deck'
  })
  const [immersive, setImmersive] = useState(false)
  const setMode = (m: Mode) => { setModeRaw(m); lsSet('paddeck.mode', m); setImmersive(false) }

  useEffect(() => { connect() }, [])
  // PadDeck Desktop tray: "Pair a device" opens the Devices section.
  useEffect(() => { const h = () => { if (isDesktop && location.hash === '#pair') setMode('devices') }; h(); window.addEventListener('hashchange', h); return () => window.removeEventListener('hashchange', h) }, [])
  useEffect(() => { const h = (e: Event) => setMode((e as CustomEvent).detail); window.addEventListener('paddeck:mode', h); return () => window.removeEventListener('paddeck:mode', h) }, [])

  const prof = activeProfile(config)
  const prefs = devicePrefs(config)
  const theme = prefs.themeOverride && prefs.theme ? prefs.theme : prof?.theme
  useEffect(() => { applyTheme(theme) }, [theme])
  useEffect(() => { document.documentElement.dataset.layout = layout; document.documentElement.dataset.orientation = orientation }, [layout, orientation])

  if (status === 'unpaired') return <><Background /><Pair /><Toasts /></>
  if (!config || !prof) return <><Background /><Connecting /><Toasts /></>

  const fullBleed = false
  const phone = layout === 'phone'
  const portrait = orientation === 'portrait'
  // Navigation follows the screen: bottom tabs in portrait, side rail in landscape.
  const bottomNav = !isDesktop && portrait
  const compactRail = phone && !portrait
  return (
    <div className="h-full flex flex-col">
      <Background kind={theme?.background.type === 'image' ? 'image' : theme?.background.value} image={theme?.background.type === 'image' ? theme.background.value : undefined} />
      {!immersive && <TopBar mode={mode} phone={phone} short={compactRail} setMode={setMode} />}
      <div className="flex-1 flex min-h-0">
        {!immersive && !bottomNav && <Rail mode={mode} setMode={setMode} compact={compactRail} />}
        <main className={cx('flex-1 min-w-0 min-h-0', !fullBleed && (bottomNav ? 'px-3 pb-2' : compactRail ? 'pr-3 pb-2' : 'pr-4 pb-4'), !fullBleed && immersive && 'p-4')}>
          {mode === 'deck' && <Deck />}
          {mode === 'editor' && <Editor />}
          {mode === 'sounds' && <Sounds />}
          {mode === 'control' && <Control />}
          {mode === 'audio' && <AudioView />}
          {mode === 'apps' && <AppsView />}
          {mode === 'profiles' && <div className="h-full overflow-y-auto thin-scroll"><Profiles /></div>}
          {mode === 'devices' && <div className="h-full overflow-y-auto thin-scroll"><Admin embedded /></div>}
          {mode === 'settings' && <Settings />}
        </main>
      </div>
      {!immersive && bottomNav && <BottomNav mode={mode} setMode={setMode} />}
      <Toasts />
    </div>
  )
}

function Background({ kind = 'aurora', image }: { kind?: string; image?: string }) {
  return <div className="app-bg" data-kind={kind}>{kind === 'image' && image && <img src={mediaUrl(image)} alt="" />}</div>
}

function Connecting() {
  const status = useStore((s) => s.status)
  const server = useStore((s) => s.server)
  return (
    <div className="h-full flex flex-col items-center justify-center gap-4 text-ink-2 px-6">
      <div className="w-14 h-14 rounded-2xl bg-accent/20 flex items-center justify-center"><Icon name="Loader" className="animate-spin text-accent" size={26} /></div>
      <div className="text-[15px] text-center">{status === 'disconnected' ? 'PC not reachable – retrying…' : 'Connecting to your PC…'}</div>
      <div className="text-[12px] text-ink-3 max-w-xs text-center">{server}<br />Make sure PadDeck Desktop is running on the PC and both devices are on the same Wi-Fi network.</div>
    </div>
  )
}

function Rail({ mode, setMode, compact }: { mode: Mode; setMode: (m: Mode) => void; compact?: boolean }) {
  if (compact) return (
    // Phone in landscape: slim icon rail so the deck keeps the screen height.
    <nav className="w-[60px] shrink-0 flex flex-col items-center gap-1 py-1 px-1.5 overflow-y-auto no-scrollbar" style={{ paddingLeft: 'max(6px, env(safe-area-inset-left))' }}>
      {[...NAV, { id: 'settings' as Mode, icon: 'Settings', label: 'Settings', short: 'Settings' }].map((n) => (
        <button key={n.id} onClick={() => setMode(n.id)} title={n.label}
          className={cx('tap w-11 h-11 shrink-0 rounded-xl flex items-center justify-center', mode === n.id ? 'bg-selected' : 'text-ink-2')}><Icon name={n.icon} size={20} /></button>
      ))}
    </nav>
  )
  if (isDesktop) return (
    <nav className="w-[220px] shrink-0 flex flex-col gap-1 py-2 pl-3 pr-2">
      {NAV.map((n) => (
        <button key={n.id} onClick={() => setMode(n.id)} className={cx('tap h-11 px-3 rounded-xl flex items-center gap-3 text-[14px] font-medium text-left', mode === n.id ? 'bg-selected shadow-[0_8px_24px_-12px_var(--selected)]' : 'text-ink-2 hover:bg-surface')}>
          <Icon name={n.icon} size={19} />{n.label}
        </button>
      ))}
      <div className="flex-1" />
      <button onClick={() => setMode('settings')} className={cx('tap h-11 px-3 rounded-xl flex items-center gap-3 text-[14px] font-medium', mode === 'settings' ? 'bg-selected' : 'text-ink-2 hover:bg-surface')}><Icon name="Settings" size={19} />Settings</button>
    </nav>
  )
  return (
    <nav className="w-[84px] shrink-0 flex flex-col items-center gap-1.5 py-2 px-3 overflow-y-auto no-scrollbar">
      {NAV.map((n) => (
        <div key={n.id} className="contents">
          <button onClick={() => setMode(n.id)} title={n.label}
            className={cx('tap relative w-14 h-14 shrink-0 rounded-2xl flex flex-col items-center justify-center gap-0.5', mode === n.id ? 'bg-selected shadow-[0_10px_28px_-10px_var(--selected)]' : 'text-ink-2 hover:bg-surface')}>
            <Icon name={n.icon} size={22} />
            <span className="text-[9.5px] font-medium leading-none mt-0.5 opacity-90">{n.short}</span>
          </button>
        </div>
      ))}
      <div className="flex-1" />
      <button onClick={() => setMode('settings')} title="Settings" className={cx('tap w-14 h-14 shrink-0 rounded-2xl flex items-center justify-center', mode === 'settings' ? 'bg-selected' : 'text-ink-2')}>
        <Icon name="Settings" size={22} />
      </button>
    </nav>
  )
}

function BottomNav({ mode, setMode }: { mode: Mode; setMode: (m: Mode) => void }) {
  const [more, setMore] = useState(false)
  const main = NAV.filter((n) => n.main)
  const inMore = !main.some((n) => n.id === mode)
  return (
    <>
      {more && (
        <div className="fixed inset-0 z-40 bg-black/40 fade-in" onPointerDown={() => setMore(false)}>
          <div className="absolute bottom-[76px] left-3 right-3 glass rounded-3xl p-2 grid grid-cols-3 gap-1.5 pop-in bg-[var(--bg)]/90" onPointerDown={(e) => e.stopPropagation()}>
            {[...NAV.filter((n) => !n.main), { id: 'settings' as Mode, icon: 'Settings', label: 'Settings', short: 'Settings' }].map((n) => (
              <button key={n.id} onClick={() => { setMode(n.id); setMore(false) }} className={cx('tap h-20 rounded-2xl flex flex-col items-center justify-center gap-1.5 text-[12px] font-medium', mode === n.id ? 'bg-selected' : 'bg-surface-2')}>
                <Icon name={n.icon} size={22} />{n.label}
              </button>
            ))}
          </div>
        </div>
      )}
      <nav className="shrink-0 glass mx-3 mb-2 rounded-[26px] grid grid-cols-5 p-1.5 gap-1 safe-bottom">
        {main.map((n) => (
          <button key={n.id} onClick={() => setMode(n.id)} className={cx('tap h-14 rounded-2xl flex flex-col items-center justify-center gap-1 text-[10.5px] font-medium', mode === n.id ? 'bg-selected' : 'text-ink-2')}>
            <Icon name={n.icon} size={21} />{n.short}
          </button>
        ))}
        <button onClick={() => setMore(!more)} className={cx('tap h-14 rounded-2xl flex flex-col items-center justify-center gap-1 text-[10.5px] font-medium', inMore || more ? 'bg-selected' : 'text-ink-2')}>
          <Icon name="LayoutDashboard" size={21} />More
        </button>
      </nav>
    </>
  )
}

function ProfileMenu({ onClose }: { onClose: () => void }) {
  const config = useStore((s) => s.config)!
  const prof = activeProfile(config)!
  return (
    <div className="absolute z-40 top-12 left-0 w-64 glass rounded-2xl p-2 pop-in bg-[var(--bg)]/85" onPointerLeave={onClose}>
      {config.profiles.map((p) => (
        <button key={p.id} onClick={() => { switchProfile(p.id); onClose() }}
          className={cx('tap w-full flex items-center gap-2.5 p-2 rounded-xl text-left text-[14px]', p.id === prof.id && 'bg-surface-2')}>
          <span className="w-8 h-8 rounded-full flex items-center justify-center text-white" style={{ background: p.color }}><Icon name={p.icon} size={16} /></span>
          <span className="flex-1 truncate">{p.name}</span>{p.id === prof.id && <Icon name="Check" size={16} className="text-accent" />}
        </button>
      ))}
      <div className="text-[11px] text-ink-3 px-2 pt-2">Applies to this device · manage in Settings</div>
    </div>
  )
}

function TopBar({ mode, phone, short, setMode }: { mode: Mode; phone: boolean; short?: boolean; setMode: (m: Mode) => void }) {
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
      else await document.documentElement.requestFullscreen({ navigationUI: 'hide' })
    } catch { /* not allowed */ }
  }
  const dot = status === 'connected' ? (latency !== null && latency > 250 ? 'bg-warn' : 'bg-ok') : status === 'connecting' ? 'bg-warn pulse-dot' : 'bg-bad pulse-dot'
  const label = status === 'connected' ? `Connected${latency !== null ? ` · ${latency} ms` : ''}` : status === 'connecting' ? 'Connecting…' : 'Disconnected'
  const title = NAV.find((n) => n.id === mode)?.label || 'Settings'

  if (phone) {
    return (
      <header className={cx('shrink-0 flex items-center gap-2 px-3', short ? 'h-[46px]' : 'h-[60px]')} style={{ paddingTop: short ? undefined : 'env(safe-area-inset-top)' }}>
        <span className={cx('w-2.5 h-2.5 rounded-full shrink-0', dot)} title={label} />
        <div className="relative min-w-0">
          <button onClick={() => setProfOpen((v) => !v)} className="tap flex items-center gap-1.5 min-w-0">
            <span className="text-[19px] font-semibold tracking-tight truncate">{title}</span>
            <span className="text-[11px] text-ink-3 truncate">· {prof.name}</span><Icon name="ChevronDown" size={14} className="text-ink-3 shrink-0" />
          </button>
          {profOpen && <ProfileMenu onClose={() => setProfOpen(false)} />}
        </div>
        <div className="flex-1" />
        <button onClick={() => run({ type: 'micMute' }, { quiet: true })} className={cx('tap w-10 h-10 rounded-full flex items-center justify-center text-white', !mic ? 'bg-ink-3' : mic.muted ? 'bg-bad' : 'bg-ok')}>
          <Icon name={mic?.muted ? 'MicOff' : 'Mic'} size={17} />
        </button>
        <button onClick={() => setMode('settings')} className="tap w-10 h-10 rounded-full glass flex items-center justify-center text-ink-2"><Icon name="Settings" size={17} /></button>
      </header>
    )
  }

  return (
    <header className="h-[68px] shrink-0 flex items-center gap-3 px-4">
      <div className="flex items-center gap-2.5 w-[200px]">
        <img src="./favicon.svg" className="w-9 h-9" alt="" />
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
        {profOpen && <ProfileMenu onClose={() => setProfOpen(false)} />}
      </div>
      {config.focus.active && (
        <button onClick={() => run({ type: 'focus' })} className="tap rounded-full h-10 px-3.5 flex items-center gap-2 text-[12.5px] font-semibold bg-accent"><Icon name="Target" size={15} />Focus on</button>
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
