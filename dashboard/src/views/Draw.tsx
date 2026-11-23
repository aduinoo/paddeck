// Drawing-tablet mode. Captures stylus input with the Pointer Events API (Android Chrome /
// WebView expose MotionEvent pressure, tilt, twist, hover, barrel and eraser) and streams it
// to the companion, which injects a real Windows pen (InjectSyntheticPointerInput) - so
// Windows Ink apps receive pressure-sensitive pen input, not mouse clicks.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { run, send, updateConfig, useStore } from '../lib/store'
import type { PenSettings, Screen } from '../lib/types'
import { Btn, Field, Icon, Modal, Segmented, Slider, Toggle, cx } from '../components/ui'
import { KeysInput, fmtKeys } from './ActionEditor'

interface Caps { pen: boolean; pressure: boolean; tilt: boolean; hover: boolean; barrel: boolean; eraser: boolean; maxPressureSeen: number; rate: number }

function targetRect(screens: Screen[], target: string) {
  if (target === 'all' && screens.length) {
    const x = Math.min(...screens.map((s) => s.x)), y = Math.min(...screens.map((s) => s.y))
    return { width: Math.max(...screens.map((s) => s.x + s.width)) - x, height: Math.max(...screens.map((s) => s.y + s.height)) - y, label: 'All monitors' }
  }
  const s = screens.find((q) => q.name === target) || screens.find((q) => q.primary) || screens[0]
  return s ? { width: s.width, height: s.height, label: `${s.primary ? 'Main monitor' : s.monitor} · ${s.width}×${s.height}` } : { width: 1920, height: 1080, label: 'Primary monitor' }
}

export function Draw({ immersive, setImmersive }: { immersive: boolean; setImmersive: (v: boolean) => void }) {
  const pen = useStore((s) => s.config!.pen)
  const screens = useStore((s) => s.pc?.screens || [])
  const latency = useStore((s) => s.latency)
  const surfRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [caps, setCaps] = useState<Caps>({ pen: false, pressure: false, tilt: false, hover: false, barrel: false, eraser: false, maxPressureSeen: 0, rate: 0 })
  const [live, setLive] = useState({ p: 0, tx: 0, ty: 0, contact: false, inRange: false, x: 0, y: 0, eraser: false, barrel: false })
  const [settings, setSettings] = useState(false)
  const [calibrating, setCalibrating] = useState(false)
  const [held, setHeld] = useState<Record<string, boolean>>({})
  const st = useRef({ contact: false, inRange: false, lastPen: 0, sx: -1, sy: -1, count: 0, lastHover: 0, touches: new Map<number, { x: number; y: number; t: number }>(), gesture: null as null | { start: number; moved: boolean; dist: number; cx: number; cy: number; n: number; zoomAcc: number; scrollAcc: number } })
  const capsRef = useRef(caps); capsRef.current = caps
  const trail = useRef<{ x: number; y: number; p: number; t: number }[]>([])

  useEffect(() => {
    const el = surfRef.current; if (!el) return
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el); return () => ro.disconnect()
  }, [])

  // Release anything held when leaving the mode.
  useEffect(() => () => {
    send({ type: 'pen', phase: 'leave', x: 0, y: 0 })
    for (const k of ['ctrl', 'shift', 'alt', 'space']) run({ type: 'keyState', key: k, down: false }, { quiet: true })
  }, [])

  const target = useMemo(() => targetRect(screens, pen.target), [screens, pen.target])

  // Active rectangle (in surface px) that maps onto the target monitor.
  const area = useMemo(() => {
    const a = pen.area || { x: 0, y: 0, w: 1, h: 1 }
    let x = a.x * size.w, y = a.y * size.h, w = a.w * size.w, h = a.h * size.h
    if (pen.keepAspect && w > 0 && h > 0) {
      const ta = target.width / target.height
      if (w / h > ta) { const nw = h * ta; x += (w - nw) / 2; w = nw } else { const nh = w / ta; y += (h - nh) / 2; h = nh }
    }
    return { x, y, w, h }
  }, [pen.area, pen.keepAspect, size, target])

  const curve = useCallback((p: number) => {
    const min = pen.minPressure ?? 0, max = pen.maxPressure ?? 1
    const v = Math.max(0, Math.min(1, (p - min) / Math.max(0.01, max - min)))
    return Math.pow(v, pen.gamma ?? 1)
  }, [pen.minPressure, pen.maxPressure, pen.gamma])

  // Rate counter
  useEffect(() => { const t = setInterval(() => { setCaps((c) => ({ ...c, rate: st.current.count })); st.current.count = 0 }, 1000); return () => clearInterval(t) }, [])

  // Fading local trail for visual feedback
  useEffect(() => {
    let raf = 0
    const draw = () => {
      const c = canvasRef.current
      if (c) {
        const dpr = devicePixelRatio || 1
        if (c.width !== c.clientWidth * dpr) { c.width = c.clientWidth * dpr; c.height = c.clientHeight * dpr }
        const g = c.getContext('2d')!
        g.setTransform(dpr, 0, 0, dpr, 0, 0)
        g.clearRect(0, 0, c.width, c.height)
        const now = performance.now()
        trail.current = trail.current.filter((q) => now - q.t < 700)
        const pts = trail.current
        g.lineCap = 'round'
        const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#7c5cff'
        for (let i = 1; i < pts.length; i++) {
          const a = pts[i - 1], b = pts[i]
          if (b.t - a.t > 60) continue
          g.strokeStyle = accent
          g.globalAlpha = Math.max(0, 1 - (now - b.t) / 700)
          g.lineWidth = 1 + b.p * 7
          g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke()
        }
        g.globalAlpha = 1
      }
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [])

  const penOff = useRef({ dx: 0, dy: 0 })
  useEffect(() => { penOff.current = { dx: (pen as any).offset?.dx || 0, dy: (pen as any).offset?.dy || 0 } }, [pen])

  const emit = (phase: string, e: PointerEvent, rect: DOMRect) => {
    let lx = e.clientX - rect.left + penOff.current.dx, ly = e.clientY - rect.top + penOff.current.dy
    const s = st.current
    const sm = pen.smoothing || 0
    if (phase === 'down' || s.sx < 0) { s.sx = lx; s.sy = ly } else if (sm > 0) { s.sx += (lx - s.sx) * (1 - sm); s.sy += (ly - s.sy) * (1 - sm); lx = s.sx; ly = s.sy }
    const nx = (lx - area.x) / area.w, ny = (ly - area.y) / area.h
    const eraserBtn = (e.buttons & 32) !== 0 || e.button === 5
    const barrelBtn = (e.buttons & 2) !== 0
    const eraser = eraserBtn || (pen.barrelAction === 'eraser' && barrelBtn)
    const barrel = pen.barrelAction === 'rightClick' && barrelBtn
    const p = phase === 'down' || phase === 'move' ? curve(e.pressure) : 0
    send({ type: 'pen', phase, x: nx, y: ny, p, tx: Math.round(e.tiltX || 0), ty: Math.round(e.tiltY || 0), r: Math.round((e as any).twist || 0), b: barrel, e: eraser })
    s.count++
    if (phase === 'move' || phase === 'down') trail.current.push({ x: lx, y: ly, p, t: performance.now() })
    // capability detection from real data
    const c = capsRef.current
    const raw = e.pressure
    const upd: Partial<Caps> = {}
    if (!c.pen) upd.pen = true
    if (!c.pressure && phase === 'move' && raw > 0 && raw !== 0.5) upd.pressure = true
    if (raw > c.maxPressureSeen) upd.maxPressureSeen = raw
    if (!c.tilt && (e.tiltX || e.tiltY)) upd.tilt = true
    if (!c.hover && phase === 'hover') upd.hover = true
    if (!c.barrel && barrelBtn) upd.barrel = true
    if (!c.eraser && eraserBtn) upd.eraser = true
    if (Object.keys(upd).length) setCaps((x) => ({ ...x, ...upd }))
  }

  useEffect(() => {
    const el = surfRef.current; if (!el) return
    const s = st.current
    const isPalm = (e: PointerEvent) => pen.palmRejection && (s.inRange || s.contact || performance.now() - s.lastPen < 600 || e.width > 45)

    const onDown = (e: PointerEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      if (e.pointerType === 'pen') {
        el.setPointerCapture(e.pointerId)
        s.contact = true; s.inRange = true; s.lastPen = performance.now()
        if (calibrating) return
        emit('down', e, rect)
        setLive((l) => ({ ...l, contact: true, inRange: true }))
      } else if (e.pointerType === 'touch') {
        if (isPalm(e)) return
        s.touches.set(e.pointerId, { x: e.clientX, y: e.clientY, t: performance.now() })
        if (pen.fingerGestures) startGesture()
      } else if (e.pointerType === 'mouse') {
        // Desktop testing: treat mouse as a pen without pressure data.
        el.setPointerCapture(e.pointerId); s.contact = true; emit('down', e, rect)
      }
    }
    const onMove = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect()
      if (e.pointerType === 'pen' || (e.pointerType === 'mouse' && s.contact)) {
        s.lastPen = performance.now()
        const contact = e.pointerType === 'mouse' ? s.contact : (e.buttons & 1) !== 0 || (e.buttons & 32) !== 0
        if (calibrating) return
        if (contact) {
          if (!s.contact) { s.contact = true; emit('down', e, rect) }
          const list = (e as any).getCoalescedEvents?.() as PointerEvent[] | undefined
          for (const ce of list && list.length ? list : [e]) emit('move', ce, rect)
        } else {
          if (s.contact) { s.contact = false; emit('up', e, rect) }
          if (!pen.hover) return
          const now = performance.now()
          if (now - s.lastHover < 8) return
          s.lastHover = now
          s.inRange = true
          emit('hover', e, rect)
        }
        setLive({ p: contact ? curve(e.pressure) : 0, tx: e.tiltX || 0, ty: e.tiltY || 0, contact, inRange: true, x: e.clientX - rect.left, y: e.clientY - rect.top, eraser: (e.buttons & 32) !== 0, barrel: (e.buttons & 2) !== 0 })
      } else if (e.pointerType === 'touch' && s.touches.has(e.pointerId)) {
        s.touches.set(e.pointerId, { ...s.touches.get(e.pointerId)!, x: e.clientX, y: e.clientY })
        if (pen.fingerGestures) moveGesture()
      }
    }
    const onUp = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect()
      if (e.pointerType === 'pen' || e.pointerType === 'mouse') {
        if (calibrating && e.pointerType === 'pen') { finishCalibration(e, rect); s.contact = false; return }
        if (s.contact) emit('up', e, rect)
        s.contact = false; s.lastPen = performance.now()
        setLive((l) => ({ ...l, contact: false, p: 0 }))
      } else if (e.pointerType === 'touch') {
        if (s.touches.has(e.pointerId)) { if (pen.fingerGestures) endGesture(); s.touches.delete(e.pointerId) }
      }
    }
    const onLeave = (e: PointerEvent) => {
      if (e.pointerType !== 'pen') return
      const rect = el.getBoundingClientRect()
      if (s.contact) emit('up', e, rect)
      s.contact = false; s.inRange = false; s.lastPen = performance.now()
      emit('leave', e, rect)
      setLive((l) => ({ ...l, inRange: false, contact: false, p: 0 }))
    }
    const onCancel = (e: PointerEvent) => { if (e.pointerType === 'touch') s.touches.delete(e.pointerId); else onLeave(e) }

    // ---------------- finger gestures (only when the pen is not in use)
    const startGesture = () => {
      const pts = [...s.touches.values()]
      if (pts.length < 2) { s.gesture = null; return }
      const cx = pts.reduce((a, p) => a + p.x, 0) / pts.length, cy = pts.reduce((a, p) => a + p.y, 0) / pts.length
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
      s.gesture = { start: performance.now(), moved: false, dist, cx, cy, n: pts.length, zoomAcc: 0, scrollAcc: 0 }
    }
    const moveGesture = () => {
      const g = s.gesture; const pts = [...s.touches.values()]
      if (!g || pts.length < 2) return
      g.n = Math.max(g.n, pts.length)
      const cx = pts.reduce((a, p) => a + p.x, 0) / pts.length, cy = pts.reduce((a, p) => a + p.y, 0) / pts.length
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
      const dScale = dist / g.dist
      if (Math.abs(dScale - 1) > 0.18) { g.moved = true; run({ type: 'keys', keys: ['ctrl', dScale > 1 ? '=' : '-'] }, { quiet: true }); g.dist = dist }
      const dy = cy - g.cy, dx = cx - g.cx
      if (Math.abs(dy) > 14 || Math.abs(dx) > 14) {
        g.moved = true
        run({ type: 'scroll', dy: Math.round(dy * 4), dx: Math.round(-dx * 4) }, { quiet: true })
        g.cx = cx; g.cy = cy
      }
    }
    const endGesture = () => {
      const g = s.gesture
      if (g && !g.moved && performance.now() - g.start < 300) {
        if (g.n === 2) { run({ type: 'keys', keys: ['ctrl', 'z'] }, { quiet: true }); flash('Undo') }
        if (g.n >= 3) { run({ type: 'keys', keys: ['ctrl', 'shift', 'z'] }, { quiet: true }); flash('Redo') }
      }
      if (s.touches.size <= 1) s.gesture = null
    }

    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', onCancel)
    el.addEventListener('pointerleave', onLeave)
    const noCtx = (e: Event) => e.preventDefault()
    el.addEventListener('contextmenu', noCtx)
    return () => {
      el.removeEventListener('pointerdown', onDown); el.removeEventListener('pointermove', onMove); el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', onCancel); el.removeEventListener('pointerleave', onLeave); el.removeEventListener('contextmenu', noCtx)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [area, pen, curve, calibrating])

  const [flashText, setFlash] = useState<string | null>(null)
  const flash = (t: string) => { setFlash(t); setTimeout(() => setFlash(null), 700) }

  const finishCalibration = (e: PointerEvent, rect: DOMRect) => {
    const tx = rect.width / 2, ty = rect.height / 2
    const dx = tx - (e.clientX - rect.left), dy = ty - (e.clientY - rect.top)
    setCalibrating(false)
    if (Math.hypot(dx, dy) > 60) { flash('Too far – try again'); return }
    updateConfig((c) => { (c.pen as any).offset = { dx, dy } })
    flash(`Calibrated (${dx.toFixed(1)}, ${dy.toFixed(1)} px)`)
  }

  const shortcut = (i: number) => {
    const sc = pen.shortcuts[i]
    if (sc.hold) {
      const k = sc.keys[0]; const on = !held[k]
      setHeld((h) => ({ ...h, [k]: on }))
      run({ type: 'keyState', key: k, down: on }, { quiet: true })
    } else run({ type: 'keys', keys: sc.keys }, { quiet: true })
  }

  const bar = pen.showBar && (
    <div className={cx('absolute top-1/2 -translate-y-1/2 z-20 glass rounded-[22px] p-1.5 flex flex-col gap-1.5 max-h-[92%] overflow-y-auto no-scrollbar', pen.leftHanded ? 'right-3' : 'left-3')}>
      {pen.shortcuts.map((sc, i) => {
        const on = sc.hold && held[sc.keys[0]]
        return (
          <button key={i} onPointerDown={(e) => { e.stopPropagation(); shortcut(i) }} title={`${sc.label} (${fmtKeys(sc.keys)})`}
            className={cx('tap w-[58px] h-[54px] rounded-2xl flex flex-col items-center justify-center gap-0.5 text-[9.5px] font-medium', on ? 'bg-accent text-white' : 'bg-surface-2')}>
            <Icon name={sc.icon} size={19} />{sc.label}
          </button>
        )
      })}
    </div>
  )

  return (
    <div className="h-full w-full relative overflow-hidden">
      <div ref={surfRef} className="draw-surface absolute inset-0 bg-[color-mix(in_oklab,var(--bg)_85%,black)]">
        <div className="absolute border-2 border-accent/50 rounded-xl pointer-events-none" style={{ left: area.x, top: area.y, width: area.w, height: area.h, boxShadow: 'inset 0 0 80px -40px var(--accent)' }}>
          <div className="absolute inset-0 opacity-[0.06]" style={{ backgroundImage: 'linear-gradient(var(--ink) 1px, transparent 1px), linear-gradient(90deg, var(--ink) 1px, transparent 1px)', backgroundSize: '48px 48px' }} />
          {!caps.pen && !calibrating && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center text-ink-2 gap-2 px-8">
              <Icon name="PenLine" size={44} className="text-accent" />
              <div className="text-[17px] font-semibold text-ink">Touch the screen with your Xiaomi Smart Pen</div>
              <div className="text-[13px] max-w-md">This area maps to <b>{target.label}</b>. Pressure, tilt and hover are sent to Windows as real pen input (Windows Ink). Fingers: two-finger tap = undo, three-finger tap = redo, pinch = zoom, two-finger drag = scroll.</div>
            </div>
          )}
        </div>
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />
        {live.inRange && <div className="absolute pointer-events-none rounded-full border-2 border-accent" style={{ left: live.x - 9, top: live.y - 9, width: 18, height: 18, background: live.contact ? 'var(--accent)' : 'transparent', opacity: 0.8 }} />}
        {calibrating && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 z-10 pointer-events-none">
            <div className="relative w-16 h-16"><div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-white -translate-x-1/2" /><div className="absolute top-1/2 left-0 right-0 h-0.5 bg-white -translate-y-1/2" /><div className="absolute inset-5 rounded-full border-2 border-accent" /></div>
            <div className="absolute top-[58%] text-white text-[15px] font-medium">Tap the centre of the crosshair precisely with the pen tip</div>
          </div>
        )}
      </div>
      {bar}
      {flashText && <div className="absolute top-6 left-1/2 -translate-x-1/2 z-30 glass rounded-full px-4 py-2 text-[14px] font-semibold pop-in">{flashText}</div>}
      {/* Status / controls */}
      <div className={cx('absolute top-3 z-20 flex items-center gap-2', pen.leftHanded ? 'left-3' : 'right-3')}>
        {!immersive && (
          <div className="glass rounded-2xl h-11 px-3 flex items-center gap-3 text-[12px]">
            <span className={cx('flex items-center gap-1.5 font-medium', caps.pen ? 'text-ok' : 'text-ink-3')}><Icon name="PenTool" size={14} />{caps.pen ? 'Pen detected' : 'Waiting for pen'}</span>
            <Cap ok={caps.pressure} label="Pressure" />
            <Cap ok={caps.tilt} label="Tilt" />
            <Cap ok={caps.hover} label="Hover" />
            <span className="text-ink-3 tabular-nums">{caps.rate} ev/s · {latency ?? '–'} ms</span>
            <div className="w-16 h-1.5 rounded-full bg-surface-2 overflow-hidden"><div className="h-full bg-accent" style={{ width: `${live.p * 100}%` }} /></div>
            {live.eraser && <span className="text-warn font-semibold">Eraser</span>}
          </div>
        )}
        <button onClick={() => setSettings(true)} className="tap glass w-11 h-11 rounded-2xl flex items-center justify-center"><Icon name="SlidersHorizontal" size={18} /></button>
        <button onClick={() => updateConfig((c) => { c.pen.showBar = !c.pen.showBar })} className={cx('tap glass w-11 h-11 rounded-2xl flex items-center justify-center', pen.showBar && 'text-accent')}><Icon name="PanelLeft" size={18} /></button>
        <button onClick={() => setImmersive(!immersive)} className="tap glass w-11 h-11 rounded-2xl flex items-center justify-center" title={immersive ? 'Show interface' : 'Hide interface'}><Icon name={immersive ? 'Minimize' : 'Expand'} size={18} /></button>
      </div>
      {settings && <PenSettingsModal onClose={() => setSettings(false)} onCalibrate={() => { setSettings(false); setCalibrating(true) }} caps={caps} />}
    </div>
  )
}

function Cap({ ok, label }: { ok: boolean; label: string }) {
  return <span className={cx('flex items-center gap-1', ok ? 'text-ink' : 'text-ink-3')}><Icon name={ok ? 'Check' : 'Minus'} size={13} className={ok ? 'text-ok' : ''} />{label}</span>
}

function PenSettingsModal({ onClose, onCalibrate, caps }: { onClose: () => void; onCalibrate: () => void; caps: Caps }) {
  const pen = useStore((s) => s.config!.pen)
  const screens = useStore((s) => s.pc?.screens || [])
  const set = (p: Partial<PenSettings>) => updateConfig((c) => { Object.assign(c.pen, p) })
  const [tab, setTab] = useState<'mapping' | 'pressure' | 'buttons' | 'shortcuts'>('mapping')
  const areaPreset = pen.area.w === 1 && pen.area.h === 1 ? 'full' : pen.area.w === 0.5 && pen.area.x === 0 ? 'left' : pen.area.w === 0.5 ? 'right' : pen.area.w === 0.7 ? 'center' : 'custom'
  const gamma = pen.gamma ?? 1
  // pressure curve preview
  const pts = Array.from({ length: 21 }, (_, i) => { const x = i / 20; const v = Math.pow(Math.max(0, Math.min(1, (x - pen.minPressure) / Math.max(0.01, pen.maxPressure - pen.minPressure))), gamma); return `${x * 100},${100 - v * 100}` }).join(' ')

  return (
    <Modal open wide onClose={onClose} title="Pen & tablet settings" footer={<Btn variant="accent" onClick={onClose}>Done</Btn>}>
      <Segmented className="mb-4" value={tab} onChange={setTab} options={[{ value: 'mapping', label: 'Mapping', icon: 'Scan' }, { value: 'pressure', label: 'Pressure', icon: 'Gauge' }, { value: 'buttons', label: 'Pen & touch', icon: 'MousePointer2' }, { value: 'shortcuts', label: 'Shortcut bar', icon: 'PanelLeft' }]} />
      {tab === 'mapping' && (
        <div className="grid grid-cols-2 gap-6">
          <div>
            <Field label="Map tablet to">
              <div className="space-y-1.5">
                {[...screens.map((s) => ({ v: s.name, l: `${s.primary ? 'Main monitor' : 'Monitor'} · ${s.width}×${s.height} · ${s.monitor}` })), { v: 'all', l: 'All monitors (whole desktop)' }].map((o) => (
                  <button key={o.v} onClick={() => set({ target: o.v })} className={cx('tap w-full text-left px-3 py-2.5 rounded-xl text-[13px]', (pen.target === o.v || (pen.target === 'primary' && screens.find((s) => s.primary)?.name === o.v)) ? 'bg-accent text-white' : 'bg-surface-2')}>{o.l}</button>
                ))}
              </div>
            </Field>
            <Toggle on={pen.keepAspect} onChange={(v) => set({ keepAspect: v })} label="Keep monitor proportions" hint="Prevents stretched strokes (like Wacom “Force proportions”)" />
          </div>
          <div>
            <Field label="Tablet drawing area">
              <Segmented value={areaPreset} onChange={(v) => set({ area: v === 'full' ? { x: 0, y: 0, w: 1, h: 1 } : v === 'left' ? { x: 0, y: 0, w: 0.5, h: 1 } : v === 'right' ? { x: 0.5, y: 0, w: 0.5, h: 1 } : { x: 0.15, y: 0.15, w: 0.7, h: 0.7 } })}
                options={[{ value: 'full', label: 'Full' }, { value: 'center', label: 'Centre' }, { value: 'left', label: 'Left half' }, { value: 'right', label: 'Right half' }]} />
            </Field>
            {(['x', 'y', 'w', 'h'] as const).map((k) => (
              <div key={k} className="flex items-center gap-3 text-[12px]"><span className="w-16 text-ink-2">{{ x: 'Left', y: 'Top', w: 'Width', h: 'Height' }[k]}</span>
                <Slider value={Math.round(pen.area[k] * 100)} min={k === 'w' || k === 'h' ? 20 : 0} max={k === 'w' || k === 'h' ? 100 : 80} live={false} onChange={(v) => set({ area: { ...pen.area, [k]: v / 100 } })} className="!h-8" />
                <span className="w-9 tabular-nums">{Math.round(pen.area[k] * 100)}%</span></div>
            ))}
            <Toggle on={pen.leftHanded} onChange={(v) => set({ leftHanded: v })} label="Left-handed layout" hint="Moves the shortcut bar to the right side" />
            <Btn icon="Crosshair" className="mt-2" onClick={onCalibrate}>Calibrate pen tip</Btn>
            {(pen as any).offset && <Btn size="sm" variant="ghost" onClick={() => updateConfig((c) => { delete (c.pen as any).offset })}>Reset calibration</Btn>}
          </div>
        </div>
      )}
      {tab === 'pressure' && (
        <div className="grid grid-cols-[220px_1fr] gap-6">
          <svg viewBox="0 0 100 100" className="w-[220px] h-[220px] rounded-2xl bg-surface-2">
            <polyline points="0,100 100,0" stroke="var(--line)" strokeWidth="1" fill="none" />
            <polyline points={pts} stroke="var(--accent)" strokeWidth="2.5" fill="none" strokeLinejoin="round" />
          </svg>
          <div>
            <Field label={`Pen feel: ${gamma < 0.95 ? 'soft' : gamma > 1.05 ? 'firm' : 'linear'} (${gamma.toFixed(2)})`} hint="Soft = light strokes produce more pressure. Firm = you need to press harder.">
              <Slider value={Math.round(gamma * 100)} min={30} max={300} live={false} onChange={(v) => set({ gamma: v / 100 })} />
            </Field>
            <Field label={`Minimum pressure threshold: ${Math.round(pen.minPressure * 100)}%`}><Slider value={Math.round(pen.minPressure * 100)} max={50} live={false} onChange={(v) => set({ minPressure: v / 100 })} /></Field>
            <Field label={`Full pressure reached at: ${Math.round(pen.maxPressure * 100)}%`}><Slider value={Math.round(pen.maxPressure * 100)} min={50} max={100} live={false} onChange={(v) => set({ maxPressure: v / 100 })} /></Field>
            <Field label={`Input smoothing: ${Math.round((pen.smoothing || 0) * 100)}%`} hint="Reduces jitter; higher values add a little lag"><Slider value={Math.round((pen.smoothing || 0) * 100)} max={85} live={false} onChange={(v) => set({ smoothing: v / 100 })} /></Field>
            <div className="text-[12px] text-ink-3">Highest raw pressure seen this session: {(caps.maxPressureSeen * 100).toFixed(1)}%. Windows synthetic pens accept 1,024 pressure levels; PadDeck forwards the pen's full-precision value and Windows quantises it.</div>
          </div>
        </div>
      )}
      {tab === 'buttons' && (
        <div className="grid grid-cols-2 gap-6">
          <div>
            <Field label="Pen side button" hint={caps.barrel ? 'Side button detected ✓' : 'Press the pen button while hovering/drawing to test. Note: MIUI may reserve the Smart Pen buttons for its own shortcuts.'}>
              <Segmented value={pen.barrelAction} onChange={(v) => set({ barrelAction: v })} options={[{ value: 'rightClick', label: 'Right-click' }, { value: 'eraser', label: 'Eraser' }, { value: 'none', label: 'Ignore' }]} />
            </Field>
            <Toggle on={pen.hover} onChange={(v) => set({ hover: v })} label="Send hover" hint={caps.hover ? 'Hover detected ✓ – cursor follows the pen before touching' : 'Hover not seen yet'} />
          </div>
          <div>
            <Toggle on={pen.palmRejection} onChange={(v) => set({ palmRejection: v })} label="Palm rejection" hint="Ignores touches while the pen is near the screen and large contact areas" />
            <Toggle on={pen.fingerGestures} onChange={(v) => set({ fingerGestures: v })} label="Finger gestures" hint="2-finger tap undo · 3-finger tap redo · pinch zoom · 2-finger drag scroll" />
          </div>
        </div>
      )}
      {tab === 'shortcuts' && <ShortcutEditor />}
    </Modal>
  )
}

function ShortcutEditor() {
  const shortcuts = useStore((s) => s.config!.pen.shortcuts)
  const showBar = useStore((s) => s.config!.pen.showBar)
  const mut = (fn: (l: PenSettings['shortcuts']) => void) => updateConfig((c) => fn(c.pen.shortcuts))
  return (
    <div>
      <Toggle on={showBar} onChange={(v) => updateConfig((c) => { c.pen.showBar = v })} label="Show floating shortcut bar" />
      <div className="space-y-2 mt-2">
        {shortcuts.map((s, i) => (
          <div key={i} className="grid grid-cols-[130px_1fr_auto_auto] gap-2 items-start">
            <input className="field" value={s.label} onChange={(e) => mut((l) => { l[i].label = e.target.value })} />
            <KeysInput value={s.keys} onChange={(k) => mut((l) => { l[i].keys = k })} />
            <button onClick={() => mut((l) => { l[i].hold = !l[i].hold })} className={cx('tap h-11 px-3 rounded-xl text-[12px]', s.hold ? 'bg-accent text-white' : 'bg-surface-2')}>{s.hold ? 'Hold' : 'Tap'}</button>
            <button onClick={() => mut((l) => { l.splice(i, 1) })} className="tap h-11 w-11 rounded-xl bg-surface-2 flex items-center justify-center"><Icon name="Trash2" size={16} /></button>
          </div>
        ))}
        <Btn size="sm" icon="Plus" onClick={() => mut((l) => { l.push({ label: 'New', keys: [], icon: 'Keyboard' }) })}>Add shortcut</Btn>
        <div className="text-[12px] text-ink-3">“Hold” keys (Ctrl, Shift, Alt, Space for the hand tool) latch on when tapped and release on the next tap.</div>
      </div>
    </div>
  )
}
