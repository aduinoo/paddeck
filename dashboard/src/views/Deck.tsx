import { useEffect, useMemo, useRef, useState } from 'react'
import { activeProfile, mediaUrl, requestIcon, run, switchProfile, toast, updateConfig, upload, useLayout, useStore } from '../lib/store'
import { buttonBackground } from '../lib/theme'
import type { DeckButton, DeckPage, PcState } from '../lib/types'
import { Btn, ColorPick, Confirm, Field, Icon, IconBtn, IconPicker, Modal, Segmented, Slider, Toggle, cx, uid } from '../components/ui'
import { ActionEditor, ACTION_TYPES } from './ActionEditor'

const lsGet = (k: string) => { try { return localStorage.getItem(k) } catch { return null } }
const lsSet = (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* ignore */ } }

function boundState(b: DeckButton, pc: PcState | null, focus: boolean, local: Record<string, boolean>): boolean {
  switch (b.bind) {
    case 'micMuted': return !!pc?.audio.inputs.find((d) => d.isDefault)?.muted
    case 'outputMuted': return !!pc?.audio.outputs.find((d) => d.isDefault)?.muted
    case 'focus': return focus
    case 'mediaPlaying': return pc?.media.current?.status === 'playing'
    default: return b.toggle ? !!local[b.id] : false
  }
}

export function Deck() {
  const config = useStore((s) => s.config)!
  const prof = activeProfile(config)!
  const [pageId, setPageId] = useState(() => lsGet('paddeck.page') || prof.pages[0]?.id)
  const page = prof.pages.find((p) => p.id === pageId) || prof.pages[0]
  const [edit, setEdit] = useState(false)
  const [pageEdit, setPageEdit] = useState<DeckPage | null>(null)
  useEffect(() => { if (page) lsSet('paddeck.page', page.id) }, [page])
  useEffect(() => { const h = (e: Event) => setPageId((e as CustomEvent).detail); window.addEventListener('paddeck:page', h); return () => window.removeEventListener('paddeck:page', h) }, [])

  const addPage = () => {
    const p: DeckPage = { id: uid('p'), name: `Page ${prof.pages.length + 1}`, icon: 'LayoutGrid', cols: page?.cols || 5, rows: page?.rows || 4, buttons: [] }
    updateConfig((c) => { activeProfile(c)!.pages.push(p) }); setPageId(p.id); setPageEdit(p)
  }

  if (!page) return <div className="p-6"><Btn icon="Plus" onClick={addPage}>Add page</Btn></div>

  return (
    <div className="h-full flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <div className="flex-1 flex gap-1.5 overflow-x-auto no-scrollbar">
          {prof.pages.map((p) => (
            <button key={p.id} onClick={() => (edit && p.id === page.id ? setPageEdit(p) : setPageId(p.id))}
              className={cx('tap h-11 px-4 rounded-2xl text-[14px] font-medium inline-flex items-center gap-2 shrink-0', p.id === page.id ? 'bg-surface-2 text-ink shadow-[inset_0_0_0_1.5px_var(--accent)]' : 'text-ink-2')}>
              <Icon name={p.icon} size={17} />{p.name}{edit && p.id === page.id && <Icon name="Pencil" size={13} className="text-ink-3" />}
            </button>
          ))}
          {edit && <button onClick={addPage} className="tap h-11 px-3 rounded-2xl text-ink-2 inline-flex items-center gap-1.5 shrink-0"><Icon name="Plus" size={17} />Page</button>}
        </div>
        <Btn variant={edit ? 'accent' : 'soft'} icon={edit ? 'Check' : 'Pencil'} onClick={() => setEdit(!edit)}>{edit ? 'Done' : 'Edit'}</Btn>
      </div>
      <Grid page={page} edit={edit} />
      <QuickBar />
      {pageEdit && <PageEditor page={pageEdit} onClose={() => setPageEdit(null)} onDeleted={() => { setPageEdit(null); setPageId(prof.pages.find((p) => p.id !== pageEdit.id)?.id || '') }} />}
    </div>
  )
}

function Grid({ page, edit }: { page: DeckPage; edit: boolean }) {
  const pc = useStore((s) => s.pc)
  const focus = useStore((s) => !!s.config?.focus.active)
  const [local, setLocal] = useState<Record<string, boolean>>({})
  const [editing, setEditing] = useState<DeckButton | null>(null)
  const [confirmBtn, setConfirmBtn] = useState<DeckButton | null>(null)
  const [menu, setMenu] = useState<{ b: DeckButton; x: number; y: number } | null>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<{ id: string; x: number; y: number } | null>(null)

  const occupied = useMemo(() => {
    const m = new Map<string, string>()
    for (const b of page.buttons) for (let dx = 0; dx < b.w; dx++) for (let dy = 0; dy < b.h; dy++) m.set(`${b.x + dx},${b.y + dy}`, b.id)
    return m
  }, [page.buttons])

  const mutatePage = (fn: (p: DeckPage) => void) => updateConfig((c) => { const p = activeProfile(c)!.pages.find((x) => x.id === page.id); if (p) fn(p) })

  const trigger = async (b: DeckButton, confirmed = false) => {
    const a = b.action
    if (a.type === 'page') { window.dispatchEvent(new CustomEvent('paddeck:page', { detail: a.pageId })); return }
    if (a.type === 'mode') { window.dispatchEvent(new CustomEvent('paddeck:mode', { detail: a.mode })); return }
    if (a.type === 'profile') { if (a.profileId) switchProfile(a.profileId); return }
    if (b.confirm && !confirmed) { setConfirmBtn(b); return }
    if (b.toggle && !b.bind) setLocal((l) => ({ ...l, [b.id]: !l[b.id] }))
    const r = await run(a, { confirmed: confirmed || !!b.confirm, quiet: a.type === 'keys' || a.type === 'media' || a.type === 'volume' })
    if (r.needsConfirm) setConfirmBtn(b)
  }

  const cellAt = (cx: number, cy: number) => {
    const r = gridRef.current!.getBoundingClientRect()
    return { x: Math.max(0, Math.min(page.cols - 1, Math.floor(((cx - r.left) / r.width) * page.cols))), y: Math.max(0, Math.min(page.rows - 1, Math.floor(((cy - r.top) / r.height) * page.rows))) }
  }

  const drop = (id: string, x: number, y: number) => mutatePage((p) => {
    const b = p.buttons.find((q) => q.id === id)!
    const fits = (bx: number, by: number, bw: number, bh: number, ignore: string[]) => {
      if (bx < 0 || by < 0 || bx + bw > p.cols || by + bh > p.rows) return false
      for (const o of p.buttons) if (!ignore.includes(o.id) && bx < o.x + o.w && bx + bw > o.x && by < o.y + o.h && by + bh > o.y) return false
      return true
    }
    const targetId = occupied.get(`${x},${y}`)
    const target = targetId && targetId !== id ? p.buttons.find((q) => q.id === targetId) : null
    if (target && fits(x, y, b.w, b.h, [b.id, target.id]) && fits(b.x, b.y, target.w, target.h, [b.id, target.id])) { target.x = b.x; target.y = b.y; b.x = x; b.y = y }
    else if (!target && fits(x, y, b.w, b.h, [b.id])) { b.x = x; b.y = y }
    else toast('No room there', 'warn')
  })

  const addAt = (x: number, y: number) => {
    const nb: DeckButton = { id: uid('b'), x, y, w: 1, h: 1, label: 'New button', icon: 'Sparkles', action: { type: 'keys', keys: [] } }
    setEditing(nb)
  }

  const cells: { x: number; y: number }[] = []
  if (edit) for (let y = 0; y < page.rows; y++) for (let x = 0; x < page.cols; x++) if (!occupied.has(`${x},${y}`)) cells.push({ x, y })
  const phone = useLayout() === 'phone'
  const portraitCols = Math.min(page.cols, typeof window !== 'undefined' && window.innerWidth < 420 ? 3 : 4)

  if (phone) {
    // Phones: same buttons, reflowed into a compact scrolling grid (reading order).
    const ordered = [...page.buttons].sort((a, b) => a.y - b.y || a.x - b.x)
    return (
      <>
        <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar">
          <div className="grid pb-2" style={{ gridTemplateColumns: `repeat(${portraitCols}, minmax(0,1fr))`, gap: 'calc(var(--gap) * 0.7)' }}>
            {ordered.map((b) => (
              <div key={b.id} className="aspect-square flex">
                <ButtonView b={{ ...b, x: 0, y: 0, w: 1, h: 1 }} edit={false} active={boundState(b, pc, focus, local)} dragging={null} compact
                  onTrigger={() => (edit ? setEditing(b) : trigger(b))} onEdit={() => setEditing(b)} onMenu={(x, y) => setMenu({ b, x, y })} onDrag={() => {}} />
              </div>
            ))}
            {edit && cells[0] && <button onClick={() => addAt(cells[0].x, cells[0].y)} className="tap aspect-square rounded-[var(--radius)] border-2 border-dashed border-line flex items-center justify-center text-ink-3"><Icon name="Plus" size={24} /></button>}
          </div>
        </div>
        {renderOverlays()}
      </>
    )
  }

  return (
    <>
      <div ref={gridRef} className="flex-1 min-h-0 grid" style={{ gridTemplateColumns: `repeat(${page.cols}, minmax(0,1fr))`, gridTemplateRows: `repeat(${page.rows}, minmax(0,1fr))`, gap: 'var(--gap)' }}>
        {cells.map((c) => (
          <button key={`${c.x},${c.y}`} onClick={() => addAt(c.x, c.y)} style={{ gridColumn: c.x + 1, gridRow: c.y + 1 }}
            className={cx('tap rounded-[var(--radius)] border-2 border-dashed border-line flex items-center justify-center text-ink-3', drag && 'bg-accent/10')}>
            <Icon name="Plus" size={26} />
          </button>
        ))}
        {page.buttons.map((b) => (
          <ButtonView key={b.id} b={b} edit={edit} active={boundState(b, pc, focus, local)}
            dragging={drag?.id === b.id ? drag : null}
            onTrigger={() => trigger(b)}
            onEdit={() => setEditing(b)}
            onMenu={(x, y) => setMenu({ b, x, y })}
            onDrag={(x, y, end) => {
              if (end) { setDrag(null); const c = cellAt(x, y); if (c.x !== b.x || c.y !== b.y) drop(b.id, c.x, c.y) }
              else setDrag({ id: b.id, x, y })
            }}
          />
        ))}
      </div>
      {renderOverlays()}
    </>
  )

  function renderOverlays() {
    return (
      <>
      {menu && (
        <div className="fixed inset-0 z-40" onPointerDown={() => setMenu(null)}>
          <div className="absolute glass rounded-2xl p-1.5 w-52 pop-in bg-[var(--bg)]/85" style={{ left: Math.min(menu.x, innerWidth - 220), top: Math.min(menu.y, innerHeight - 200) }} onPointerDown={(e) => e.stopPropagation()}>
            {[
              ['Pencil', 'Edit button', () => setEditing(menu.b)],
              ['Copy', 'Duplicate', () => duplicate(menu.b)],
              ['Play', 'Run action', () => trigger(menu.b)],
              ['Trash2', 'Delete', () => mutatePage((p) => { p.buttons = p.buttons.filter((x) => x.id !== menu.b.id) })],
            ].map(([ic, l, fn]: any) => (
              <button key={l} onClick={() => { fn(); setMenu(null) }} className={cx('tap w-full flex items-center gap-2.5 px-3 h-11 rounded-xl text-[14px] text-left', l === 'Delete' && 'text-bad')}><Icon name={ic} size={17} />{l}</button>
            ))}
          </div>
        </div>
      )}
      {editing && <ButtonEditor page={page} button={editing} onClose={() => setEditing(null)} onSave={(nb) => {
        mutatePage((p) => { const i = p.buttons.findIndex((x) => x.id === nb.id); if (i >= 0) p.buttons[i] = nb; else p.buttons.push(nb) })
        setEditing(null)
      }} onDelete={() => { mutatePage((p) => { p.buttons = p.buttons.filter((x) => x.id !== editing.id) }); setEditing(null) }} />}
      <Confirm open={!!confirmBtn} danger title={`${confirmBtn?.label}?`} text={`This will run “${confirmBtn?.label}” on your PC.`}
        onNo={() => setConfirmBtn(null)} onYes={() => { const b = confirmBtn!; setConfirmBtn(null); trigger(b, true) }} />
      </>
    )
  }

  function duplicate(b: DeckButton) {
    let spot: { x: number; y: number } | null = null
    for (let y = 0; y < page.rows && !spot; y++) for (let x = 0; x < page.cols && !spot; x++) if (!occupied.has(`${x},${y}`)) spot = { x, y }
    if (!spot) { toast('Page is full', 'warn'); return }
    mutatePage((p) => p.buttons.push({ ...structuredClone(b), id: uid('b'), x: spot!.x, y: spot!.y, w: 1, h: 1 }))
  }
}

function ButtonView({ b, edit, active, dragging, onTrigger, onEdit, onMenu, onDrag, compact }: {
  b: DeckButton; edit: boolean; active: boolean; dragging: { x: number; y: number } | null; compact?: boolean
  onTrigger: () => void; onEdit: () => void; onMenu: (x: number, y: number) => void; onDrag: (x: number, y: number, end: boolean) => void
}) {
  const theme = useStore((s) => activeProfile(s.config)?.theme)
  const icons = useStore((s) => s.icons)
  const [pressed, setPressed] = useState(false)
  const [ripples, setRipples] = useState<{ id: number; x: number; y: number }[]>([])
  const st = useRef<{ x: number; y: number; t: number; timer?: number; long?: boolean; moved?: boolean; id?: number } | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  const iconKey = b.appIcon && b.action.type === 'app' ? `app:${b.action.appId || b.action.path || b.action.name}`
    : b.fileIcon && b.action.type === 'open' && b.action.path ? `file:${b.action.path}` : null
  useEffect(() => { if (iconKey) requestIcon(iconKey, { appId: b.action.appId, name: b.action.name, path: b.action.path }) }, [iconKey, b.action.appId, b.action.name, b.action.path])
  const appImg = iconKey ? icons[iconKey] : null

  const bg = (active && b.activeBg) || b.bg
  const label = (active && b.activeLabel) || b.label
  const icon = (active && b.activeIcon) || b.icon
  const style = theme?.buttonStyle || 'glass'
  const fg = b.fg || (bg ? '#fff' : undefined)

  const down = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId)
    setPressed(true)
    const r = ref.current!.getBoundingClientRect()
    const rid = Date.now()
    if (!edit) setRipples((rs) => [...rs.slice(-2), { id: rid, x: e.clientX - r.left, y: e.clientY - r.top }])
    setTimeout(() => setRipples((rs) => rs.filter((q) => q.id !== rid)), 600)
    st.current = { x: e.clientX, y: e.clientY, t: Date.now(), id: e.pointerId }
    st.current.timer = window.setTimeout(() => { if (st.current && !st.current.moved) { st.current.long = true; setPressed(false); navigator.vibrate?.(15); onMenu(e.clientX, e.clientY) } }, 520)
  }
  const move = (e: React.PointerEvent) => {
    const s = st.current; if (!s) return
    if (Math.hypot(e.clientX - s.x, e.clientY - s.y) > 12) {
      s.moved = true; clearTimeout(s.timer)
      if (edit) onDrag(e.clientX, e.clientY, false)
      else setPressed(false)
    }
  }
  const up = (e: React.PointerEvent) => {
    const s = st.current; st.current = null; setPressed(false)
    if (!s) return
    clearTimeout(s.timer)
    if (s.long) return
    if (edit) { if (s.moved) onDrag(e.clientX, e.clientY, true); else onEdit(); return }
    if (!s.moved) { navigator.vibrate?.(8); onTrigger() }
  }
  const cancel = () => { if (st.current) clearTimeout(st.current.timer); st.current = null; setPressed(false); if (dragging) onDrag(-1, -1, true) }

  const base = style === 'solid' ? 'bg-surface-2' : style === 'outline' ? 'border-2 border-line bg-transparent' : 'glass'
  const transform = dragging && ref.current ? (() => { const r = ref.current.getBoundingClientRect(); return `translate(${dragging.x - (r.left + r.width / 2)}px, ${dragging.y - (r.top + r.height / 2)}px) scale(1.05)` })() : undefined
  const showLabel = theme?.showLabels !== false

  return (
    <div ref={ref} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={cancel} onContextMenu={(e) => e.preventDefault()}
      className={cx('deck-btn flex flex-col items-center justify-center gap-2 p-3 cursor-pointer', !bg && base, pressed && 'pressed', edit && !dragging && 'wiggle', dragging && 'z-30 shadow-2xl opacity-90')}
      style={{ gridColumn: compact ? undefined : `${b.x + 1} / span ${b.w}`, gridRow: compact ? undefined : `${b.y + 1} / span ${b.h}`, flex: compact ? 1 : undefined, background: buttonBackground(bg, active && b.activeBg ? undefined : b.bg2), color: fg, transform, boxShadow: bg ? `0 12px 30px -14px ${bg}` : undefined }}>
      <span className="shine" />
      {ripples.map((r) => <span key={r.id} className="ripple" style={{ left: r.x - 40, top: r.y - 40, width: 80, height: 80 }} />)}
      {b.image ? <img src={mediaUrl(b.image)} alt="" className="max-w-[60%] max-h-[55%] object-contain rounded-xl pointer-events-none" draggable={false} />
        : b.emoji ? <span className="pointer-events-none leading-none" style={{ fontSize: compact ? 30 : b.w > 1 || b.h > 1 ? 52 : 38 }}>{b.emoji}</span>
        : appImg ? <img src={mediaUrl(appImg)} alt="" className="w-[42%] max-w-16 aspect-square object-contain pointer-events-none drop-shadow" draggable={false} />
        : <Icon name={icon} className="pointer-events-none" size={b.w > 1 || b.h > 1 ? 40 : 30} />}
      {showLabel && <span className={cx(compact ? 'text-[11.5px]' : 'text-[13px]', 'font-medium leading-tight text-center line-clamp-2 pointer-events-none px-1')}>{label}</span>}
      {active && !b.activeBg && <span className="absolute top-2.5 right-2.5 w-2.5 h-2.5 rounded-full bg-accent shadow-[0_0_10px_var(--accent)]" />}
      {b.confirm && <Icon name="ShieldAlert" size={13} className="absolute top-2.5 left-2.5 opacity-60" />}
    </div>
  )
}

function ButtonEditor({ page, button, onClose, onSave, onDelete }: { page: DeckPage; button: DeckButton; onClose: () => void; onSave: (b: DeckButton) => void; onDelete: () => void }) {
  const [b, setB] = useState<DeckButton>(structuredClone(button))
  const [tab, setTab] = useState<'action' | 'look'>('action')
  const set = (p: Partial<DeckButton>) => setB((x) => ({ ...x, ...p }))
  const isNew = !page.buttons.some((x) => x.id === button.id)
  const fileRef = useRef<HTMLInputElement>(null)

  return (
    <Modal open wide onClose={onClose} title={isNew ? 'New button' : 'Edit button'}
      footer={<>
        {!isNew && <Btn variant="ghost" icon="Trash2" className="!text-bad mr-auto" onClick={onDelete}>Delete</Btn>}
        <Btn onClick={onClose}>Cancel</Btn>
        <Btn variant="accent" icon="Check" onClick={() => onSave(b)}>Save</Btn>
      </>}>
      <div className="grid grid-cols-[180px_1fr] gap-6">
        <div className="flex flex-col items-center gap-3">
          <div className="w-40 h-40 deck-btn glass flex flex-col items-center justify-center gap-2" style={{ background: buttonBackground(b.bg, b.bg2), color: b.fg || (b.bg ? '#fff' : undefined) }}>
            <span className="shine" />
            {b.image ? <img src={mediaUrl(b.image)} className="max-w-[60%] max-h-[55%] object-contain rounded-xl" alt="" /> : b.emoji ? <span className="text-[40px] leading-none">{b.emoji}</span> : <Icon name={b.icon} size={36} />}
            <span className="text-[13px] font-medium text-center px-2">{b.label}</span>
          </div>
          <Segmented value={tab} onChange={setTab} options={[{ value: 'action', label: 'Action', icon: 'Zap' }, { value: 'look', label: 'Look', icon: 'Palette' }]} />
          <div className="text-[11px] text-ink-3 text-center">{ACTION_TYPES.find((a) => a.type === b.action.type)?.label}</div>
        </div>
        <div className="min-w-0">
          <Field label="Label"><input className="field" value={b.label} onChange={(e) => set({ label: e.target.value })} /></Field>
          {tab === 'action' ? (
            <>
              <ActionEditor action={b.action} onChange={(action) => {
                const auto = b.label === 'New button' || !b.label || b.label === b.action.name
                set({ action, ...(action.type === 'app' && action.name && auto ? { label: action.name, appIcon: true, emoji: undefined, image: undefined } : {}),
                  ...(action.type === 'open' && action.name && auto ? { label: action.name, fileIcon: true } : {}) })
              }} />
              <div className="grid grid-cols-2 gap-x-6">
                <Toggle on={!!b.confirm} onChange={(v) => set({ confirm: v })} label="Ask before running" />
                <Toggle on={!!b.toggle} onChange={(v) => set({ toggle: v })} label="Toggle button" hint="Shows an on/off state" />
              </div>
              {b.toggle && (
                <Field label="State follows">
                  <select className="field" value={b.bind || ''} onChange={(e) => set({ bind: e.target.value || undefined })}>
                    <option value="">Its own on/off state</option><option value="micMuted">Microphone muted</option><option value="outputMuted">Speakers muted</option>
                    <option value="focus">Focus mode</option><option value="mediaPlaying">Media playing</option>
                  </select>
                </Field>
              )}
            </>
          ) : (
            <>
              <Field label="Icon"><IconPicker value={b.icon} onChange={(icon) => set({ icon, image: undefined, appIcon: false, fileIcon: false, emoji: undefined })} /></Field>
              <Field label="Or an emoji" hint="Type or paste any emoji">
                <div className="flex gap-2 flex-wrap items-center">
                  <input className="field !w-24 text-center text-[22px] !py-1" value={b.emoji || ''} maxLength={8} onChange={(e) => set({ emoji: e.target.value || undefined, image: undefined, appIcon: false, fileIcon: false })} placeholder="😀" />
                  {['🎮', '🎧', '🎨', '💻', '📁', '🎵', '🔥', '⭐', '🚀', '📸', '🎬', '☕'].map((em) => <button key={em} className="tap w-10 h-10 rounded-xl bg-surface-2 text-[20px]" onClick={() => set({ emoji: em, image: undefined, appIcon: false, fileIcon: false })}>{em}</button>)}
                </div>
              </Field>
              <div className="flex gap-2 mb-3">
                <input ref={fileRef} type="file" accept="image/*" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; try { set({ image: await upload(f, 'image'), appIcon: false }) } catch (er: any) { toast(er.message, 'error') } }} />
                <Btn size="sm" icon="ImageUp" onClick={() => fileRef.current?.click()}>Upload image</Btn>
                {b.image && <Btn size="sm" icon="X" onClick={() => set({ image: undefined })}>Remove image</Btn>}
                {b.action.type === 'app' && <Btn size="sm" icon="AppWindow" variant={b.appIcon ? 'accent' : 'soft'} onClick={() => set({ appIcon: !b.appIcon, image: undefined, emoji: undefined })}>Use app icon</Btn>}
                {b.action.type === 'open' && <Btn size="sm" icon="File" variant={b.fileIcon ? 'accent' : 'soft'} onClick={() => set({ fileIcon: !b.fileIcon, image: undefined, emoji: undefined })}>Use file icon</Btn>}
              </div>
              <Field label="Background"><ColorPick allowNone value={b.bg || ''} onChange={(bg) => set({ bg: bg || undefined })} /></Field>
              {b.bg && <Field label="Gradient to (optional)"><ColorPick allowNone value={b.bg2 || ''} onChange={(bg2) => set({ bg2: bg2 || undefined })} /></Field>}
              <Field label="Text colour"><ColorPick allowNone value={b.fg || ''} onChange={(fg) => set({ fg: fg || undefined })} /></Field>
              {b.toggle && <Field label="Background when on"><ColorPick allowNone value={b.activeBg || ''} onChange={(v) => set({ activeBg: v || undefined })} /></Field>}
              <div className="grid grid-cols-2 gap-3">
                <Field label="Width (cells)"><Segmented value={String(b.w)} onChange={(v) => set({ w: Math.min(Number(v), page.cols - b.x) })} options={['1', '2', '3'].map((v) => ({ value: v, label: v }))} /></Field>
                <Field label="Height (cells)"><Segmented value={String(b.h)} onChange={(v) => set({ h: Math.min(Number(v), page.rows - b.y) })} options={['1', '2', '3'].map((v) => ({ value: v, label: v }))} /></Field>
              </div>
            </>
          )}
        </div>
      </div>
    </Modal>
  )
}

function PageEditor({ page, onClose, onDeleted }: { page: DeckPage; onClose: () => void; onDeleted: () => void }) {
  const config = useStore((s) => s.config)!
  const prof = activeProfile(config)!
  const cur = prof.pages.find((p) => p.id === page.id) || page
  const idx = prof.pages.findIndex((p) => p.id === page.id)
  const mut = (fn: (p: DeckPage, all: DeckPage[]) => void) => updateConfig((c) => { const all = activeProfile(c)!.pages; const p = all.find((x) => x.id === page.id); if (p) fn(p, all) })
  const move = (d: number) => mut((p, all) => { const i = all.indexOf(p); const j = i + d; if (j < 0 || j >= all.length) return; all.splice(i, 1); all.splice(j, 0, p) })
  const [askDel, setAskDel] = useState(false)
  return (
    <Modal open onClose={onClose} title="Page settings" footer={<>
      <Btn variant="ghost" icon="Trash2" className="!text-bad mr-auto" disabled={prof.pages.length < 2} onClick={() => setAskDel(true)}>Delete page</Btn>
      <Btn variant="accent" onClick={onClose}>Done</Btn></>}>
      <Field label="Name"><input className="field" value={cur.name} onChange={(e) => mut((p) => { p.name = e.target.value })} /></Field>
      <Field label="Grid size" hint="Stream Deck style layouts: 5×3, 5×4 (default), 4×5 for portrait, 5×5, 8×4…">
        <div className="flex flex-wrap gap-1.5">
          {[[3, 2], [4, 3], [5, 3], [5, 4], [4, 5], [5, 5], [6, 4], [8, 4]].map(([c, r]) => (
            <button key={`${c}x${r}`} onClick={() => mut((p) => { p.cols = c; p.rows = r; p.buttons = p.buttons.filter((b) => b.x < c && b.y < r).map((b) => ({ ...b, w: Math.min(b.w, c - b.x), h: Math.min(b.h, r - b.y) })) })}
              className={cx('tap h-9 px-3 rounded-xl text-[13px]', cur.cols === c && cur.rows === r ? 'bg-accent text-white' : 'bg-surface-2')}>{c} × {r}</button>
          ))}
        </div>
      </Field>
      <Field label="Order">
        <div className="flex gap-2"><Btn size="sm" icon="ArrowLeft" disabled={idx <= 0} onClick={() => move(-1)}>Move left</Btn><Btn size="sm" icon="ArrowRight" disabled={idx >= prof.pages.length - 1} onClick={() => move(1)}>Move right</Btn></div>
      </Field>
      <Field label="Icon"><IconPicker value={cur.icon} onChange={(icon) => mut((p) => { p.icon = icon })} /></Field>
      <Confirm open={askDel} danger title={`Delete “${cur.name}”?`} text="All buttons on this page will be removed." onNo={() => setAskDel(false)}
        onYes={() => { updateConfig((c) => { const pr = activeProfile(c)!; pr.pages = pr.pages.filter((x) => x.id !== page.id) }); onDeleted() }} />
    </Modal>
  )
}

function QuickBar() {
  const phone = useLayout() === 'phone'
  const pc = useStore((s) => s.pc)
  const out = pc?.audio.outputs.find((d) => d.isDefault)
  const mic = pc?.audio.inputs.find((d) => d.isDefault)
  const [pick, setPick] = useState(false)
  if (phone) return (
    <div className="glass panel h-[60px] shrink-0 flex items-center gap-3 px-3">
      <IconBtn icon={out?.muted ? 'VolumeX' : 'Volume2'} size={40} active={!!out?.muted} onClick={() => run({ type: 'volume', mode: 'mute' }, { quiet: true })} label="Mute" />
      <Slider value={out?.volume ?? 0} onChange={(v) => run({ type: 'volume', mode: 'set', value: v }, { quiet: true })} />
      <span className="w-10 text-right tabular-nums text-[13px] font-medium">{out?.volume ?? '–'}%</span>
    </div>
  )
  return (
    <div className="glass panel h-[72px] shrink-0 flex items-center gap-4 px-4">
      <IconBtn icon={out?.muted ? 'VolumeX' : 'Volume2'} active={!!out?.muted} onClick={() => run({ type: 'volume', mode: 'mute' }, { quiet: true })} label="Mute" />
      <div className="flex-1 max-w-[420px] flex items-center gap-3">
        <Slider value={out?.volume ?? 0} onChange={(v) => run({ type: 'volume', mode: 'set', value: v }, { quiet: true })} />
        <span className="w-10 text-right tabular-nums text-[14px] font-medium">{out?.volume ?? '–'}%</span>
      </div>
      <div className="relative">
        <button onClick={() => setPick(!pick)} className="tap h-12 px-4 rounded-2xl bg-surface-2 flex items-center gap-2.5 max-w-[300px]">
          <Icon name="Speaker" size={18} className="text-ink-2" /><span className="truncate text-[14px]">{out?.name || 'No output'}</span><Icon name="ChevronUp" size={16} className="text-ink-3" />
        </button>
        {pick && (
          <div className="absolute bottom-14 left-0 w-80 glass rounded-2xl p-1.5 pop-in bg-[var(--bg)]/85 z-30" onPointerLeave={() => setPick(false)}>
            {pc?.audio.outputs.map((d) => (
              <button key={d.id} onClick={() => { run({ type: 'output', deviceId: d.id, deviceName: d.name }); setPick(false) }}
                className={cx('tap w-full flex items-center gap-2.5 px-3 h-11 rounded-xl text-[14px] text-left', d.isDefault && 'bg-surface-2')}>
                <Icon name="Speaker" size={16} /><span className="flex-1 truncate">{d.name}</span>{d.isDefault && <Icon name="Check" size={16} className="text-accent" />}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="flex-1" />
      <button onClick={() => run({ type: 'micMute' }, { quiet: true })} className={cx('tap h-12 pl-4 pr-5 rounded-2xl flex items-center gap-2.5 text-white font-semibold text-[14px]', !mic ? 'bg-ink-3' : mic.muted ? 'bg-bad' : 'bg-ok')}>
        <Icon name={mic?.muted ? 'MicOff' : 'Mic'} size={20} /><span className="max-w-[180px] truncate">{!mic ? 'Unavailable' : mic.muted ? 'Mic muted' : mic.name}</span>
      </button>
    </div>
  )
}
