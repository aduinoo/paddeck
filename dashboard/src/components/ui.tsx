import { icons, type LucideProps, X, Search, Check } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { isHex, normHex } from '../lib/theme'

// Older/common icon names mapped to their current Lucide names.
const ALIAS: Record<string, string> = {
  Music: 'EighthNotes', Music2: 'EighthNote', Trash2: 'Trash', Smile: 'FaceSlightlySmiling', CircleAlert: 'CircleExclamationPoint',
  TriangleAlert: 'TriangleExclamationPoint', ShieldAlert: 'ShieldExclamationPoint', AlertTriangle: 'TriangleExclamationPoint',
}
export function Icon({ name, ...p }: { name?: string } & LucideProps) {
  const all = icons as Record<string, any>
  const C = (name && (all[name] || all[ALIAS[name]])) || icons.Square
  return <C strokeWidth={1.9} {...p} />
}

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')

export function Panel({ title, icon, right, children, className, pad = true }: { title?: ReactNode; icon?: string; right?: ReactNode; children: ReactNode; className?: string; pad?: boolean }) {
  return (
    <section className={cx('glass panel fade-in flex flex-col min-h-0', pad && 'p-4', className)}>
      {(title || right) && (
        <header className={cx('flex items-center gap-2 mb-3 min-h-7', !pad && 'px-4 pt-4')}>
          {icon && <Icon name={icon} size={16} className="text-ink-2" />}
          <h3 className="text-[13px] font-semibold tracking-wide uppercase text-ink-2 flex-1 truncate">{title}</h3>
          {right}
        </header>
      )}
      {children}
    </section>
  )
}

export function Btn({ children, onClick, variant = 'soft', className, disabled, icon, size = 'md', title }: {
  children?: ReactNode; onClick?: () => void; variant?: 'soft' | 'accent' | 'ghost' | 'danger'; className?: string; disabled?: boolean; icon?: string; size?: 'sm' | 'md' | 'lg'; title?: string
}) {
  const v = { soft: 'bg-surface-2 text-ink', accent: 'bg-accent text-white shadow-[0_8px_24px_-8px_var(--accent)]', ghost: 'text-ink-2', danger: 'bg-bad/90 text-white' }[variant]
  const s = { sm: 'h-9 px-3 text-[13px] rounded-xl gap-1.5', md: 'h-11 px-4 text-[14px] rounded-2xl gap-2', lg: 'h-13 px-5 text-[15px] rounded-2xl gap-2' }[size]
  return (
    <button title={title} disabled={disabled} onClick={onClick} className={cx('tap inline-flex items-center justify-center font-medium select-none disabled:opacity-40', v, s, className)}>
      {icon && <Icon name={icon} size={size === 'sm' ? 15 : 18} />}
      {children}
    </button>
  )
}

export function IconBtn({ icon, onClick, active, className, size = 44, label, danger }: { icon: string; onClick?: () => void; active?: boolean; className?: string; size?: number; label?: string; danger?: boolean }) {
  return (
    <button aria-label={label} title={label} onClick={onClick} style={{ width: size, height: size }}
      className={cx('tap rounded-2xl inline-flex items-center justify-center shrink-0', active ? 'bg-accent text-white' : danger ? 'bg-bad/90 text-white' : 'bg-surface-2 text-ink', className)}>
      <Icon name={icon} size={Math.round(size * 0.45)} />
    </button>
  )
}

// Slider that emits throttled live updates while dragging plus a final commit.
export function Slider({ value, onChange, min = 0, max = 100, step = 1, disabled, className, live = true }: {
  value: number; onChange: (v: number, final: boolean) => void; min?: number; max?: number; step?: number; disabled?: boolean; className?: string; live?: boolean
}) {
  const [local, setLocal] = useState<number | null>(null)
  const last = useRef(0)
  const v = local ?? value
  const pct = ((v - min) / (max - min)) * 100
  return (
    <input type="range" className={cx('range', className)} min={min} max={max} step={step} value={v} disabled={disabled}
      style={{ ['--pct' as any]: `${pct}%` }}
      onChange={(e) => {
        const n = Number(e.target.value); setLocal(n)
        const now = performance.now()
        if (live && now - last.current > 60) { last.current = now; onChange(n, false) }
      }}
      onPointerUp={(e) => { const n = Number((e.target as HTMLInputElement).value); onChange(n, true); setTimeout(() => setLocal(null), 600) }}
      onKeyUp={(e) => { onChange(Number((e.target as HTMLInputElement).value), true); setLocal(null) }}
    />
  )
}

export function Toggle({ on, onChange, label, hint }: { on: boolean; onChange: (v: boolean) => void; label?: ReactNode; hint?: ReactNode }) {
  return (
    <button onClick={() => onChange(!on)} className="tap w-full flex items-center gap-3 py-2 text-left">
      <span className="flex-1 min-w-0">
        <span className="block text-[14px]">{label}</span>
        {hint && <span className="block text-[12px] text-ink-3 mt-0.5">{hint}</span>}
      </span>
      <span className={cx('w-12 h-7 rounded-full p-1 transition-colors shrink-0', on ? 'bg-accent' : 'bg-surface-2')}>
        <span className={cx('block w-5 h-5 rounded-full bg-white shadow transition-transform', on && 'translate-x-5')} />
      </span>
    </button>
  )
}

export function Segmented<T extends string>({ value, options, onChange, className }: { value: T; options: { value: T; label: ReactNode; icon?: string }[]; onChange: (v: T) => void; className?: string }) {
  return (
    <div className={cx('inline-flex p-1 rounded-2xl bg-surface-2 gap-1', className)}>
      {options.map((o) => (
        <button key={o.value} onClick={() => onChange(o.value)} className={cx('tap h-9 px-3 rounded-xl text-[13px] font-medium inline-flex items-center gap-1.5', value === o.value ? 'bg-accent text-white' : 'text-ink-2')}>
          {o.icon && <Icon name={o.icon} size={15} />}{o.label}
        </button>
      ))}
    </div>
  )
}

export function Modal({ open, onClose, title, children, wide, footer }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; wide?: boolean; footer?: ReactNode }) {
  useEffect(() => {
    if (!open) return
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/55 backdrop-blur-sm fade-in" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={cx('pop-in rounded-[28px] bg-[color-mix(in_oklab,var(--bg)_88%,white_4%)] border border-line shadow-2xl flex flex-col max-h-[92vh] w-full', wide ? 'max-w-4xl' : 'max-w-lg')}>
        <header className="flex items-center gap-3 px-6 pt-5 pb-3">
          <h2 className="text-[18px] font-semibold flex-1">{title}</h2>
          <IconBtn icon="X" size={38} onClick={onClose} label="Close" />
        </header>
        <div className="px-6 pb-5 overflow-y-auto thin-scroll min-h-0">{children}</div>
        {footer && <footer className="px-6 py-4 border-t border-line flex gap-2 justify-end">{footer}</footer>}
      </div>
    </div>
  )
}

export function Field({ label, children, hint }: { label: ReactNode; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="block mb-3">
      <span className="block text-[12px] font-medium text-ink-2 mb-1.5">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-ink-3 mt-1">{hint}</span>}
    </label>
  )
}

export const SWATCHES = ['#7c5cff', '#6366f1', '#3b82f6', '#0ea5e9', '#14b8a6', '#22c55e', '#84cc16', '#f59e0b', '#f97316', '#ef4444', '#ec4899', '#a855f7', '#64748b', '#1f2937', '#ffffff', '']

export function ColorPick({ value, onChange, allowNone }: { value?: string; onChange: (v: string) => void; allowNone?: boolean }) {
  return (
    <div className="flex flex-wrap gap-2 items-center">
      {SWATCHES.filter((s) => allowNone || s).map((s) => (
        <button key={s || 'none'} onClick={() => onChange(s)} className={cx('tap w-8 h-8 rounded-full border-2 flex items-center justify-center', value === s ? 'border-ink' : 'border-transparent')}
          style={{ background: s || 'repeating-conic-gradient(var(--surface-2) 0 25%, transparent 0 50%) 50% / 10px 10px' }}>
          {value === s && <Check size={14} className={s === '#ffffff' ? 'text-black' : 'text-white'} />}
        </button>
      ))}
      <input type="color" value={value || '#7c5cff'} onChange={(e) => onChange(e.target.value)} className="w-9 h-9 rounded-full bg-transparent border-0 p-0" />
    </div>
  )
}

const ICON_NAMES = Object.keys(icons)
export function IconPicker({ value, onChange }: { value?: string; onChange: (v: string) => void }) {
  const [q, setQ] = useState('')
  const list = useMemo(() => {
    const s = q.trim().toLowerCase()
    return (s ? ICON_NAMES.filter((n) => n.toLowerCase().includes(s)) : ICON_NAMES).slice(0, 180)
  }, [q])
  return (
    <div>
      <div className="relative mb-2">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
        <input className="field pl-9" placeholder={`Search ${ICON_NAMES.length} icons…`} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="grid grid-cols-9 gap-1.5 max-h-52 overflow-y-auto thin-scroll pr-1">
        {list.map((n) => (
          <button key={n} title={n} onClick={() => onChange(n)} className={cx('tap aspect-square rounded-xl flex items-center justify-center', value === n ? 'bg-accent text-white' : 'bg-surface-2 text-ink')}>
            <Icon name={n} size={20} />
          </button>
        ))}
      </div>
    </div>
  )
}

export function Confirm({ open, title, text, onYes, onNo, danger }: { open: boolean; title: string; text?: string; onYes: () => void; onNo: () => void; danger?: boolean }) {
  return (
    <Modal open={open} onClose={onNo} title={title} footer={<><Btn onClick={onNo}>Cancel</Btn><Btn variant={danger ? 'danger' : 'accent'} onClick={onYes}>Confirm</Btn></>}>
      <p className="text-ink-2 text-[15px]">{text}</p>
    </Modal>
  )
}

export function Meter({ value, color, className }: { value: number | null; color?: string; className?: string }) {
  return (
    <div className={cx('h-2 rounded-full bg-surface-2 overflow-hidden', className)}>
      <div className="h-full rounded-full transition-[width] duration-700 ease-out" style={{ width: `${Math.max(0, Math.min(100, value ?? 0))}%`, background: color || 'var(--accent)' }} />
    </div>
  )
}

export function Ring({ value, size = 84, stroke = 9, color, children }: { value: number | null; size?: number; stroke?: number; color?: string; children?: ReactNode }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r
  const v = value === null ? 0 : Math.max(0, Math.min(100, value))
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--surface-2)" strokeWidth={stroke} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={color || 'var(--accent)'} strokeWidth={stroke} fill="none" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - v / 100)} style={{ transition: 'stroke-dashoffset .7s ease-out' }} />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  )
}

export function Empty({ icon, title, text, children }: { icon: string; title: string; text?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-10 px-6 gap-2 text-ink-2">
      <div className="w-14 h-14 rounded-2xl bg-surface-2 flex items-center justify-center mb-1"><Icon name={icon} size={26} /></div>
      <div className="font-semibold text-ink">{title}</div>
      {text && <div className="text-[13px] max-w-sm">{text}</div>}
      {children}
    </div>
  )
}

export { X }

export const fmtBytes = (b?: number | null, perSec = false) => {
  if (b === null || b === undefined) return '—'
  const u = ['B', 'KB', 'MB', 'GB', 'TB']; let i = 0; let v = b
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++ }
  return `${v >= 100 || i === 0 ? v.toFixed(0) : v.toFixed(1)} ${u[i]}${perSec ? '/s' : ''}`
}
export const fmtTime = (s: number) => { if (!isFinite(s) || s < 0) s = 0; const m = Math.floor(s / 60); return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}` }
export const fmtUptime = (s: number) => { const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60); return d ? `${d}d ${h}h ${m}m` : `${h}h ${m}m` }
export const uid = (p: string) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

export function HexInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [t, setT] = useState(value)
  useEffect(() => setT(value), [value])
  return <input className="field font-mono !py-2 uppercase" value={t} maxLength={7} onChange={(e) => { setT(e.target.value); const v = e.target.value.startsWith('#') ? e.target.value : '#' + e.target.value; if (isHex(v)) onChange(normHex(v)) }} placeholder="#01B6BE" />
}
