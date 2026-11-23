// The Stream Deck as used on the tablet/phone: pages, folders, live tiles, and in-place editing
// (drag to move, long-press menu, add/duplicate/delete, undo).
import { useEffect, useRef, useState } from 'react'
import { activeProfile, checkPaths, redo, run, switchProfile, undo, updateConfig, useLayout, useStore } from '../lib/store'
import type { DeckButton, DeckPage } from '../lib/types'
import { Btn, Confirm, Field, Icon, IconBtn, IconPicker, Modal, Slider, cx, uid } from '../components/ui'
import { AddPanel } from './deck/AddPanel'
import { ButtonDesigner, TileFace, TilePreview, boundState, deleteTile, duplicateTile, findPage, moveTile, moveTileToPage, occupancy, pageTrail, tilePath, tileStyle, visiblePages } from './deck/shared'

const lsGet = (k: string) => { try { return localStorage.getItem(k) } catch { return null } }
const lsSet = (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* ignore */ } }

// Page navigation shared by tiles ("next", "prev", "back", a page id, or a folder).
export function usePageNav() {
  const config = useStore((s) => s.config)!
  const prof = activeProfile(config)!
  const [pageId, setPageId] = useState(() => lsGet('paddeck.page') || visiblePages(prof)[0]?.id)
  const page = prof.pages.find((p) => p.id === pageId) || visiblePages(prof)[0] || prof.pages[0]
  useEffect(() => { if (page) lsSet('paddeck.page', page.id) }, [page])
  const go = (target: string) => {
    const vis = visiblePages(prof)
    const root = pageTrail(prof, page)[0] || page
    const i = vis.findIndex((p) => p.id === root.id)
    if (target === 'next') setPageId(vis[(i + 1) % vis.length]?.id)
    else if (target === 'prev') setPageId(vis[(i - 1 + vis.length) % vis.length]?.id)
    else if (target === 'back') setPageId(page.parent || root.id)
    else if (prof.pages.some((p) => p.id === target)) setPageId(target)
  }
  useEffect(() => { const h = (e: Event) => go((e as CustomEvent).detail); window.addEventListener('paddeck:page', h); return () => window.removeEventListener('paddeck:page', h) })
  return { prof, page, go, setPageId }
}

export function Deck() {
  const { prof, page, go, setPageId } = usePageNav()
  const canUndo = useStore((s) => s.canUndo)
  const canRedo = useStore((s) => s.canRedo)
  const [edit, setEdit] = useState(false)
  const [pageEdit, setPageEdit] = useState<DeckPage | null>(null)
  const phone = useLayout() === 'phone'

  const addPage = () => {
    const p: DeckPage = { id: uid('p'), name: `Page ${visiblePages(prof).length + 1}`, icon: 'LayoutGrid', cols: page?.cols || 5, rows: page?.rows || 4, buttons: [] }
    updateConfig((c) => { activeProfile(c)!.pages.push(p) }); setPageId(p.id); setPageEdit(p)
  }
  if (!page) return <div className="p-6"><Btn icon="Plus" onClick={addPage}>Add page</Btn></div>
  const trail = pageTrail(prof, page)
  const rootId = trail[0]?.id

  return (
    <div className="h-full flex flex-col gap-3">
      <div className="flex items-center gap-2">
        {page.folder ? (
          <div className="flex-1 flex items-center gap-1.5 min-w-0">
            <button onClick={() => go('back')} className="tap h-11 px-3 rounded-2xl bg-surface-2 inline-flex items-center gap-1.5 text-[14px] font-medium shrink-0"><Icon name="ChevronLeft" size={18} />Back</button>
            <div className="flex items-center gap-1 text-[14px] text-ink-2 truncate">{trail.map((p, i) => <span key={p.id} className="inline-flex items-center gap-1">{i > 0 && <Icon name="ChevronRight" size={14} className="text-ink-3" />}<span className={i === trail.length - 1 ? 'text-ink font-semibold' : ''}>{p.name}</span></span>)}</div>
            {edit && <button onClick={() => setPageEdit(page)} className="tap p-2 text-ink-3"><Icon name="Pencil" size={15} /></button>}
          </div>
        ) : (
          <div className="flex-1 flex gap-1.5 overflow-x-auto no-scrollbar">
            {visiblePages(prof).map((p) => (
              <button key={p.id} onClick={() => (edit && p.id === page.id ? setPageEdit(p) : setPageId(p.id))}
                className={cx('tap h-11 px-4 rounded-2xl text-[14px] font-medium inline-flex items-center gap-2 shrink-0', p.id === rootId ? 'bg-surface-2 text-ink shadow-[inset_0_0_0_1.5px_var(--selected)]' : 'text-ink-2')}>
                <Icon name={p.icon} size={17} />{p.name}{edit && p.id === page.id && <Icon name="Pencil" size={13} className="text-ink-3" />}
              </button>
            ))}
            {edit && <button onClick={addPage} className="tap h-11 px-3 rounded-2xl text-ink-2 inline-flex items-center gap-1.5 shrink-0"><Icon name="Plus" size={17} />Page</button>}
          </div>
        )}
        {edit && !phone && <>
          <IconBtn icon="Undo2" label="Undo" onClick={undo} className={cx(!canUndo && 'opacity-40')} />
          <IconBtn icon="Redo2" label="Redo" onClick={redo} className={cx(!canRedo && 'opacity-40')} />
        </>}
        <Btn variant={edit ? 'accent' : 'soft'} icon={edit ? 'Check' : 'Pencil'} onClick={() => setEdit(!edit)}>{edit ? 'Done' : 'Edit'}</Btn>
      </div>
      <Grid page={page} edit={edit} onNavigate={go} />
      {!edit && <QuickBar />}
      {edit && phone && <div className="flex gap-2"><Btn icon="Undo2" className="flex-1" disabled={!canUndo} onClick={undo}>Undo</Btn><Btn icon="Redo2" className="flex-1" disabled={!canRedo} onClick={redo}>Redo</Btn></div>}
      {pageEdit && <PageEditor page={pageEdit} onClose={() => setPageEdit(null)} onDeleted={() => { setPageEdit(null); setPageId(visiblePages(prof).find((p) => p.id !== pageEdit.id)?.id || '') }} />}
    </div>
  )
}

export function useTileRunner(onNavigate: (t: string) => void) {
  const [local, setLocal] = useState<Record<string, boolean>>({})
  const [confirmBtn, setConfirmBtn] = useState<DeckButton | null>(null)
  const trigger = async (b: DeckButton, confirmed = false) => {
    const a = b.action
    if (a.type === 'page') { if (a.pageId) onNavigate(a.pageId); return }
    if (a.type === 'folder') { if (a.pageId) onNavigate(a.pageId); return }
    if (a.type === 'mode') { window.dispatchEvent(new CustomEvent('paddeck:mode', { detail: a.mode })); return }
    if (a.type === 'profile') { if (a.profileId) switchProfile(a.profileId); return }
    if (a.type === 'none') return
    if (b.confirm && !confirmed) { setConfirmBtn(b); return }
    if (b.toggle && !b.bind) setLocal((l) => ({ ...l, [b.id]: !l[b.id] }))
    const r = await run(a, { confirmed: confirmed || !!b.confirm, quiet: ['keys', 'media', 'volume', 'sound', 'micMute'].includes(a.type) })
    if (r.needsConfirm) setConfirmBtn(b)
  }
  const confirmUi = <Confirm open={!!confirmBtn} danger title={`${confirmBtn?.label}?`} text={`This will run “${confirmBtn?.label}” on your PC.`}
    onNo={() => setConfirmBtn(null)} onYes={() => { const b = confirmBtn!; setConfirmBtn(null); trigger(b, true) }} />
  return { local, trigger, confirmUi }
}

export function usePathStatus(page: DeckPage) {
  const paths = useStore((s) => s.paths)
  const status = useStore((s) => s.status)
  useEffect(() => {
    const list = page.buttons.map(tilePath).filter(Boolean) as string[]
    if (!list.length || status !== 'connected') return
    checkPaths(list)
    const t = setInterval(() => checkPaths(list), 30000)
    return () => clearInterval(t)
  }, [page, status])
  return (b: DeckButton) => { const p = tilePath(b); return !!p && paths[p] === false }
}

function Grid({ page, edit, onNavigate }: { page: DeckPage; edit: boolean; onNavigate: (t: string) => void }) {
  const pc = useStore((s) => s.pc)
  const focus = useStore((s) => !!s.config?.focus.active)
  const prof = useStore((s) => activeProfile(s.config)!)
  const { local, trigger, confirmUi } = useTileRunner(onNavigate)
  const unavailable = usePathStatus(page)
  const [editing, setEditing] = useState<DeckButton | null>(null)
  const [adding, setAdding] = useState<{ x: number; y: number } | null>(null)
  const [moving, setMoving] = useState<DeckButton | null>(null)
  const [menu, setMenu] = useState<{ b: DeckButton; x: number; y: number } | null>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<{ id: string; x: number; y: number } | null>(null)
  const occupied = occupancy(page)
  const phone = useLayout() === 'phone'

  const cellAt = (cx: number, cy: number) => {
    const r = gridRef.current!.getBoundingClientRect()
    return { x: Math.max(0, Math.min(page.cols - 1, Math.floor(((cx - r.left) / r.width) * page.cols))), y: Math.max(0, Math.min(page.rows - 1, Math.floor(((cy - r.top) / r.height) * page.rows))) }
  }
  const tileUnder = (cx: number, cy: number, self: string) => {
    const c = cellAt(cx, cy); const id = occupied.get(`${c.x},${c.y}`)
    return id && id !== self ? page.buttons.find((q) => q.id === id) : null
  }
  const cells: { x: number; y: number }[] = []
  if (edit) for (let y = 0; y < page.rows; y++) for (let x = 0; x < page.cols; x++) if (!occupied.has(`${x},${y}`)) cells.push({ x, y })
  const portraitCols = Math.min(page.cols, typeof window !== 'undefined' && window.innerWidth < 420 ? 3 : 4)
  const props = (b: DeckButton) => ({
    b, edit, active: boundState(b, pc, focus, local), unavailable: unavailable(b), buttonStyle: prof.theme.buttonStyle,
    onTrigger: () => trigger(b), onEdit: () => setEditing(b), onMenu: (x: number, y: number) => setMenu({ b, x, y }),
  })

  const body = phone ? (
    // Phones: the same tiles reflowed into a compact scrolling grid (reading order).
    <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar">
      <div className="grid pb-2" style={{ gridTemplateColumns: `repeat(${portraitCols}, minmax(0,1fr))`, gap: 'calc(var(--gap) * 0.7)' }}>
        {[...page.buttons].sort((a, b) => a.y - b.y || a.x - b.x).map((b) => (
          <div key={b.id} className="aspect-square flex"><ButtonView {...props({ ...b, w: 1, h: 1 })} b={{ ...b, w: 1, h: 1 }} compact dragging={null} onDrag={() => {}} onTrigger={() => (edit ? setEditing(b) : trigger(b))} /></div>
        ))}
        {edit && cells[0] && <button onClick={() => setAdding(cells[0])} className="tap aspect-square rounded-[var(--radius)] border-2 border-dashed border-line flex items-center justify-center text-ink-3"><Icon name="Plus" size={24} /></button>}
      </div>
    </div>
  ) : (
    <div ref={gridRef} className="flex-1 min-h-0 grid" style={{ gridTemplateColumns: `repeat(${page.cols}, minmax(0,1fr))`, gridTemplateRows: `repeat(${page.rows}, minmax(0,1fr))`, gap: 'var(--gap)' }}>
      {cells.map((c) => (
        <button key={`${c.x},${c.y}`} onClick={() => setAdding(c)} style={{ gridColumn: c.x + 1, gridRow: c.y + 1 }}
          className={cx('tap rounded-[var(--radius)] border-2 border-dashed border-line flex items-center justify-center text-ink-3', drag && 'bg-accent/10')}><Icon name="Plus" size={26} /></button>
      ))}
      {page.buttons.map((b) => (
        <ButtonView key={b.id} {...props(b)} dragging={drag?.id === b.id ? drag : null}
          onDrag={(x, y, end) => {
            if (!end) { setDrag({ id: b.id, x, y }); return }
            setDrag(null)
            if (x < 0) return
            const over = tileUnder(x, y, b.id)
            if (over?.action.type === 'folder' && over.action.pageId) { moveTileToPage(page.id, b.id, over.action.pageId); return }
            const c = cellAt(x, y); if (c.x !== b.x || c.y !== b.y) moveTile(page.id, b.id, c.x, c.y)
          }} />
      ))}
    </div>
  )

  return (
    <>
      {body}
      {menu && (
        <div className="fixed inset-0 z-40" onPointerDown={() => setMenu(null)}>
          <div className="absolute glass rounded-2xl p-1.5 w-56 pop-in bg-[var(--bg)]/90" style={{ left: Math.min(menu.x, innerWidth - 230), top: Math.min(menu.y, innerHeight - 260) }} onPointerDown={(e) => e.stopPropagation()}>
            {([
              ['Pencil', 'Edit', () => setEditing(menu.b)],
              ['Copy', 'Duplicate', () => duplicateTile(page.id, menu.b.id)],
              ['FolderInput', 'Move to page…', () => setMoving(menu.b)],
              ['Play', 'Run now', () => trigger(menu.b)],
              ['Trash', 'Delete', () => deleteTile(page.id, menu.b.id)],
            ] as [string, string, () => void][]).map(([ic, l, fn]) => (
              <button key={l} onClick={() => { fn(); setMenu(null) }} className={cx('tap w-full flex items-center gap-2.5 px-3 h-11 rounded-xl text-[14px] text-left', l === 'Delete' && 'text-bad')}><Icon name={ic} size={17} />{l}</button>
            ))}
          </div>
        </div>
      )}
      {moving && (
        <Modal open onClose={() => setMoving(null)} title={`Move “${moving.label}” to…`}>
          <div className="space-y-1.5">
            {prof.pages.filter((p) => p.id !== page.id && !(moving.action.type === 'folder' && moving.action.pageId === p.id)).map((p) => (
              <button key={p.id} onClick={() => { moveTileToPage(page.id, moving.id, p.id); setMoving(null) }} className="tap w-full flex items-center gap-3 px-3 h-12 rounded-xl bg-surface-2 text-left text-[14px]">
                <Icon name={p.folder ? 'Folder' : p.icon} size={17} />{pageTrail(prof, p).map((x) => x.name).join(' › ')}
              </button>
            ))}
          </div>
        </Modal>
      )}
      {adding && (
        <Modal open wide onClose={() => setAdding(null)} title="Add a tile">
          <div className="h-[60vh]"><AddPanel pageId={page.id} at={adding} onAdded={() => setAdding(null)} onCustom={(partial) => { setAdding(null); setEditing({ id: uid('b'), x: adding.x, y: adding.y, w: 1, h: 1, label: 'New button', icon: 'Sparkles', action: { type: 'keys', keys: [] }, ...partial } as DeckButton) }} /></div>
        </Modal>
      )}
      {editing && <ButtonEditor page={page} button={editing} onClose={() => setEditing(null)} onSave={(nb) => {
        updateConfig((c) => { const p = findPage(c, page.id); if (!p) return; const i = p.buttons.findIndex((x) => x.id === nb.id); if (i >= 0) p.buttons[i] = nb; else p.buttons.push(nb) })
        setEditing(null)
      }} onDelete={() => { deleteTile(page.id, editing.id); setEditing(null) }} />}
      {confirmUi}
    </>
  )
}

export function ButtonView({ b, edit, active, unavailable, buttonStyle, dragging, onTrigger, onEdit, onMenu, onDrag, compact }: {
  b: DeckButton; edit: boolean; active: boolean; unavailable?: boolean; buttonStyle?: string; dragging: { x: number; y: number } | null; compact?: boolean
  onTrigger: () => void; onEdit: () => void; onMenu: (x: number, y: number) => void; onDrag: (x: number, y: number, end: boolean) => void
}) {
  const [pressed, setPressed] = useState(false)
  const [ripples, setRipples] = useState<{ id: number; x: number; y: number }[]>([])
  const st = useRef<{ x: number; y: number; timer?: number; long?: boolean; moved?: boolean } | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const t = tileStyle(b, active, buttonStyle)

  const down = (e: React.PointerEvent) => {
    try { (e.target as Element).setPointerCapture?.(e.pointerId) } catch { /* ignore */ }
    setPressed(true)
    const r = ref.current!.getBoundingClientRect(); const rid = Date.now()
    if (!edit) setRipples((rs) => [...rs.slice(-2), { id: rid, x: e.clientX - r.left, y: e.clientY - r.top }])
    setTimeout(() => setRipples((rs) => rs.filter((q) => q.id !== rid)), 600)
    st.current = { x: e.clientX, y: e.clientY }
    st.current.timer = window.setTimeout(() => { if (st.current && !st.current.moved) { st.current.long = true; setPressed(false); navigator.vibrate?.(15); onMenu(e.clientX, e.clientY) } }, 520)
  }
  const move = (e: React.PointerEvent) => {
    const s = st.current; if (!s) return
    if (Math.hypot(e.clientX - s.x, e.clientY - s.y) > 12) { s.moved = true; clearTimeout(s.timer); if (edit) onDrag(e.clientX, e.clientY, false); else setPressed(false) }
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
  const transform = dragging && ref.current ? (() => { const r = ref.current.getBoundingClientRect(); return `translate(${dragging.x - (r.left + r.width / 2)}px, ${dragging.y - (r.top + r.height / 2)}px) scale(1.05)` })() : undefined

  return (
    <div ref={ref} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={cancel} onContextMenu={(e) => e.preventDefault()}
      className={cx(t.className, 'cursor-pointer', pressed && 'pressed', edit && !dragging && 'wiggle', dragging && 'z-30 shadow-2xl opacity-90')}
      style={{ ...t.style, gridColumn: compact ? undefined : `${b.x + 1} / span ${b.w}`, gridRow: compact ? undefined : `${b.y + 1} / span ${b.h}`, flex: compact ? 1 : undefined, transform }}>
      {ripples.map((r) => <span key={r.id} className="ripple" style={{ left: r.x - 40, top: r.y - 40, width: 80, height: 80 }} />)}
      <TileFace b={b} active={active} compact={compact} unavailable={unavailable} />
    </div>
  )
}

function ButtonEditor({ page, button, onClose, onSave, onDelete }: { page: DeckPage; button: DeckButton; onClose: () => void; onSave: (b: DeckButton) => void; onDelete: () => void }) {
  const [b, setB] = useState<DeckButton>(structuredClone(button))
  const [tab, setTab] = useState<'action' | 'design' | 'state'>('action')
  const isNew = !page.buttons.some((x) => x.id === button.id)
  const phone = useLayout() === 'phone'
  return (
    <Modal open wide onClose={onClose} title={isNew ? 'New button' : 'Edit button'}
      footer={<>
        {!isNew && <Btn variant="ghost" icon="Trash" className="!text-bad mr-auto" onClick={onDelete}>Delete</Btn>}
        <Btn onClick={onClose}>Cancel</Btn>
        <Btn variant="accent" icon="Check" onClick={() => onSave(b)}>Save</Btn>
      </>}>
      <div className={cx('gap-6', phone ? 'flex flex-col' : 'grid grid-cols-[200px_1fr]')}>
        <div className="flex flex-col items-center gap-2"><TilePreview b={b} /><span className="text-[11px] text-ink-3">Live preview</span></div>
        <ButtonDesigner b={b} page={page} tab={tab} setTab={setTab} compact={phone} onChange={(p) => setB((x) => ({ ...x, ...p }))} />
      </div>
    </Modal>
  )
}

export function PageEditor({ page, onClose, onDeleted }: { page: DeckPage; onClose: () => void; onDeleted: () => void }) {
  const config = useStore((s) => s.config)!
  const prof = activeProfile(config)!
  const cur = prof.pages.find((p) => p.id === page.id) || page
  const vis = visiblePages(prof)
  const idx = vis.findIndex((p) => p.id === page.id)
  const mut = (fn: (p: DeckPage, all: DeckPage[]) => void) => updateConfig((c) => { const all = activeProfile(c)!.pages; const p = all.find((x) => x.id === page.id); if (p) fn(p, all) })
  const move = (d: number) => mut((p, all) => { const v = all.filter((x) => !x.folder); const j = v.indexOf(p) + d; if (j < 0 || j >= v.length) return; const target = v[j]; const a = all.indexOf(p), b = all.indexOf(target); all[a] = target; all[b] = p })
  const [askDel, setAskDel] = useState(false)
  return (
    <Modal open onClose={onClose} title={cur.folder ? 'Folder settings' : 'Page settings'} footer={<>
      <Btn variant="ghost" icon="Trash" className="!text-bad mr-auto" disabled={!cur.folder && vis.length < 2} onClick={() => setAskDel(true)}>Delete {cur.folder ? 'folder' : 'page'}</Btn>
      <Btn variant="accent" onClick={onClose}>Done</Btn></>}>
      <Field label="Name"><input className="field" value={cur.name} onChange={(e) => { const v = e.target.value; mut((p) => { p.name = v }); if (cur.folder) updateConfig((c) => { for (const pg of activeProfile(c)!.pages) for (const b of pg.buttons) if (b.action.type === 'folder' && b.action.pageId === cur.id && (b.label === cur.name || !b.label)) b.label = v }) }} /></Field>
      <Field label="Grid size" hint="Stream Deck style: 5×3, 5×4, 8×4 (XL), 4×5 for portrait…">
        <div className="flex flex-wrap gap-1.5">
          {[[3, 2], [4, 3], [5, 3], [5, 4], [4, 5], [5, 5], [6, 4], [8, 4]].map(([c, r]) => (
            <button key={`${c}x${r}`} onClick={() => mut((p) => { p.cols = c; p.rows = r; p.buttons = p.buttons.filter((b) => b.x < c && b.y < r).map((b) => ({ ...b, w: Math.min(b.w, c - b.x), h: Math.min(b.h, r - b.y) })) })}
              className={cx('tap h-9 px-3 rounded-xl text-[13px]', cur.cols === c && cur.rows === r ? 'bg-selected' : 'bg-surface-2')}>{c} × {r}</button>
          ))}
        </div>
      </Field>
      {!cur.folder && <Field label="Order"><div className="flex gap-2"><Btn size="sm" icon="ArrowLeft" disabled={idx <= 0} onClick={() => move(-1)}>Move left</Btn><Btn size="sm" icon="ArrowRight" disabled={idx >= vis.length - 1} onClick={() => move(1)}>Move right</Btn></div></Field>}
      <Field label="Icon"><IconPicker value={cur.icon} onChange={(icon) => mut((p) => { p.icon = icon })} /></Field>
      <Confirm open={askDel} danger title={`Delete “${cur.name}”?`} text={`All tiles in this ${cur.folder ? 'folder' : 'page'} will be removed (Undo can bring them back).`} onNo={() => setAskDel(false)}
        onYes={() => { updateConfig((c) => { const pr = activeProfile(c)!; pr.pages = pr.pages.filter((x) => x.id !== page.id && x.parent !== page.id); for (const pg of pr.pages) pg.buttons = pg.buttons.filter((b) => !(b.action.type === 'folder' && b.action.pageId === page.id)) }); onDeleted() }} />
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
