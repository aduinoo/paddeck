// Desktop Stream Deck Editor: build and organise the tablet's layout from Windows.
// Library (apps/files/actions/sounds) on the left, the live grid in the middle, the button
// designer on the right. Every change syncs to all paired devices immediately.
import { useEffect, useState } from 'react'
import { activeProfile, redo, run, switchProfile, undo, updateConfig, useStore } from '../lib/store'
import type { DeckButton, DeckPage } from '../lib/types'
import { Btn, Icon, IconBtn, Panel, cx, uid } from '../components/ui'
import { AddPanel } from './deck/AddPanel'
import { PageEditor, usePageNav, usePathStatus } from './Deck'
import { ButtonDesigner, TileFace, TilePreview, actionLabel, addTile, boundState, createFolder, deleteTile, duplicateTile, findPage, fits, moveTile, moveTileToPage, occupancy, pageTrail, tileStyle, visiblePages } from './deck/shared'

const MIME = 'application/x-paddeck-tile'
const MOVE = 'application/x-paddeck-move'

export function Editor() {
  const { prof, page, go, setPageId } = usePageNav()
  const config = useStore((s) => s.config)!
  const pc = useStore((s) => s.pc)
  const canUndo = useStore((s) => s.canUndo)
  const canRedo = useStore((s) => s.canRedo)
  const [selId, setSelId] = useState<string | null>(null)
  const [tab, setTab] = useState<'action' | 'design' | 'state'>('action')
  const [pageEdit, setPageEdit] = useState<DeckPage | null>(null)
  const [dropCell, setDropCell] = useState<string | null>(null)
  const [dropPage, setDropPage] = useState<string | null>(null)
  const [addAt, setAddAt] = useState<{ x: number; y: number } | undefined>(undefined)
  const [wide, setWide] = useState(() => window.innerWidth >= 1500)
  const [libOpen, setLibOpen] = useState(false)
  useEffect(() => { const r = () => setWide(window.innerWidth >= 1500); window.addEventListener('resize', r); return () => window.removeEventListener('resize', r) }, [])
  const showLib = wide || libOpen
  const unavailable = usePathStatus(page)
  const sel = page?.buttons.find((b) => b.id === selId) || null
  const occupied = page ? occupancy(page) : new Map()
  const devices = useStore((s) => s.pc?.host) // presence of PC state

  useEffect(() => { setSelId(null) }, [page?.id])

  // keyboard: Delete, Ctrl+D, Ctrl+Z / Ctrl+Y, arrows
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo() }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo() }
      else if (!sel || !page) return
      else if (e.key === 'Delete' || e.key === 'Backspace') { deleteTile(page.id, sel.id); setSelId(null) }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicateTile(page.id, sel.id) }
      else if (e.key.startsWith('Arrow')) {
        e.preventDefault()
        const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key]!
        moveTile(page.id, sel.id, sel.x + d[0], sel.y + d[1])
      }
    }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  }, [sel, page])

  if (!page) return null
  const setTile = (patch: Partial<DeckButton>) => sel && updateConfig((c) => { const p = findPage(c, page.id); const b = p?.buttons.find((x) => x.id === sel.id); if (b) Object.assign(b, patch) })
  const addPage = () => { const p: DeckPage = { id: uid('p'), name: `Page ${visiblePages(prof).length + 1}`, icon: 'LayoutGrid', cols: page.cols, rows: page.rows, buttons: [] }; updateConfig((c) => { activeProfile(c)!.pages.push(p) }); setPageId(p.id) }

  const onDropCell = (e: React.DragEvent, x: number, y: number) => {
    e.preventDefault(); setDropCell(null)
    const mv = e.dataTransfer.getData(MOVE)
    if (mv) {
      const { id, from } = JSON.parse(mv)
      const targetId = occupied.get(`${x},${y}`)
      const target = targetId && targetId !== id ? page.buttons.find((b) => b.id === targetId) : null
      if (target?.action.type === 'folder' && target.action.pageId) { moveTileToPage(from, id, target.action.pageId); return }
      if (from !== page.id) { moveTileToPage(from, id, page.id); return }
      moveTile(page.id, id, x, y); return
    }
    const raw = e.dataTransfer.getData(MIME)
    if (raw) { const id = addTile(page.id, JSON.parse(raw), { x, y }); if (id) setSelId(id) }
  }

  const cells: { x: number; y: number }[] = []
  for (let y = 0; y < page.rows; y++) for (let x = 0; x < page.cols; x++) if (!occupied.has(`${x},${y}`)) cells.push({ x, y })
  const trail = pageTrail(prof, page)
  const root = trail[0]

  return (
    <div className={cx('h-full grid gap-[var(--gap)] min-h-0 relative', wide ? 'grid-cols-[300px_minmax(0,1fr)_340px]' : 'grid-cols-[minmax(0,1fr)_330px]')}>
      {/* Library (side panel on wide windows, drawer otherwise) */}
      {showLib && <Panel title="Add to deck" icon="Plus" className={cx('min-h-0', !wide && 'absolute z-30 left-0 top-0 bottom-0 w-[320px] shadow-2xl bg-[var(--bg)]/95')} right={<span className="flex items-center gap-2">{addAt && <span className="text-[11px] text-accent">→ cell {addAt.x + 1},{addAt.y + 1}</span>}{!wide && <button className="tap text-ink-3" onClick={() => setLibOpen(false)}><Icon name="X" size={16} /></button>}</span>}>
        <div className="flex-1 min-h-0"><AddPanel pageId={page.id} at={addAt} dense onAdded={(id) => { setSelId(id); setAddAt(undefined) }}
          onCustom={(partial) => { const id = addTile(page.id, partial, addAt); if (id) { setSelId(id); setTab('action') } }} /></div>
        <div className="text-[11px] text-ink-3 mt-2">Tip: drag apps and actions straight onto a cell.</div>
      </Panel>}

      {/* Grid */}
      <div className="flex flex-col gap-3 min-h-0 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          {!wide && <Btn variant={libOpen ? 'accent' : 'soft'} icon="Plus" onClick={() => setLibOpen(!libOpen)}>Add</Btn>}
          <select className="field !w-auto !py-2" value={prof.id} onChange={(e) => switchProfile(e.target.value)}>
            {config.profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <div className="flex-1 flex gap-1.5 overflow-x-auto no-scrollbar">
            {visiblePages(prof).map((p) => (
              <button key={p.id} onClick={() => setPageId(p.id)} onDoubleClick={() => setPageEdit(p)}
                onDragOver={(e) => { if (e.dataTransfer.types.includes(MOVE)) { e.preventDefault(); setDropPage(p.id) } }} onDragLeave={() => setDropPage(null)}
                onDrop={(e) => { e.preventDefault(); setDropPage(null); const mv = e.dataTransfer.getData(MOVE); if (mv) { const { id, from } = JSON.parse(mv); moveTileToPage(from, id, p.id) } }}
                className={cx('tap h-10 px-3.5 rounded-xl text-[13px] font-medium inline-flex items-center gap-1.5 shrink-0', p.id === root?.id ? 'bg-surface-2 shadow-[inset_0_0_0_1.5px_var(--selected)]' : 'text-ink-2', dropPage === p.id && 'ring-2 ring-accent bg-accent/15')}>
                <Icon name={p.icon} size={15} />{p.name}<span className="text-[10.5px] text-ink-3">{p.buttons.length}</span>
              </button>
            ))}
            <button onClick={addPage} className="tap h-10 px-3 rounded-xl text-ink-2 inline-flex items-center gap-1 shrink-0 text-[13px]"><Icon name="Plus" size={15} />Page</button>
          </div>
          <IconBtn icon="Undo2" size={40} label="Undo (Ctrl+Z)" onClick={undo} className={cx(!canUndo && 'opacity-40')} />
          <IconBtn icon="Redo2" size={40} label="Redo (Ctrl+Y)" onClick={redo} className={cx(!canRedo && 'opacity-40')} />
          <IconBtn icon="Settings2" size={40} label="Page settings" onClick={() => setPageEdit(page)} />
        </div>
        <div className="flex items-center gap-2 text-[12px] text-ink-2 min-h-6">
          {page.folder && <button onClick={() => go('back')} className="tap h-7 px-2 rounded-lg bg-surface-2 inline-flex items-center gap-1"><Icon name="ChevronLeft" size={14} />Back</button>}
          {trail.map((p, i) => <span key={p.id} className="inline-flex items-center gap-1">{i > 0 && <Icon name="ChevronRight" size={13} className="text-ink-3" />}<Icon name={p.folder ? 'Folder' : p.icon} size={13} />{p.name}</span>)}
          <span className="text-ink-3">· {page.cols}×{page.rows} grid · {page.buttons.length} tiles</span>
          <span className="flex-1" />
          <span className="inline-flex items-center gap-1.5 text-ink-3"><span className={cx('w-2 h-2 rounded-full', devices ? 'bg-ok' : 'bg-warn')} />Changes sync to every paired device instantly</span>
        </div>
        <div className="flex-1 min-h-0 flex items-center justify-center">
          <div className="w-full grid" style={{ aspectRatio: `${page.cols * 1.08} / ${page.rows}`, maxHeight: '100%', gridTemplateColumns: `repeat(${page.cols}, minmax(0,1fr))`, gridTemplateRows: `repeat(${page.rows}, minmax(0,1fr))`, gap: 'var(--gap)' }}>
            {cells.map((c) => {
              const key = `${c.x},${c.y}`
              return (
                <button key={key} style={{ gridColumn: c.x + 1, gridRow: c.y + 1 }} onClick={() => { setAddAt(c); setSelId(null); setLibOpen(true) }}
                  onDragOver={(e) => { e.preventDefault(); setDropCell(key) }} onDragLeave={() => setDropCell((d) => (d === key ? null : d))} onDrop={(e) => onDropCell(e, c.x, c.y)}
                  className={cx('tap rounded-[var(--radius)] border-2 border-dashed flex items-center justify-center text-ink-3 transition-colors', dropCell === key ? 'border-accent bg-accent/15' : addAt?.x === c.x && addAt?.y === c.y ? 'border-accent text-accent' : 'border-line hover:border-ink-3')}>
                  <Icon name="Plus" size={22} />
                </button>
              )
            })}
            {page.buttons.map((b) => {
              const active = boundState(b, pc, !!config.focus.active, {})
              const t = tileStyle(b, active, prof.theme.buttonStyle)
              const key = `${b.x},${b.y}`
              return (
                <div key={b.id} draggable
                  onDragStart={(e) => { e.dataTransfer.setData(MOVE, JSON.stringify({ id: b.id, from: page.id })); e.dataTransfer.effectAllowed = 'move'; setSelId(b.id) }}
                  onDragOver={(e) => { e.preventDefault(); setDropCell(key) }} onDragLeave={() => setDropCell((d) => (d === key ? null : d))} onDrop={(e) => onDropCell(e, b.x, b.y)}
                  onClick={() => { setSelId(b.id); setAddAt(undefined) }}
                  onDoubleClick={() => { if (b.action.type === 'folder' && b.action.pageId) go(b.action.pageId) }}
                  className={cx(t.className, 'cursor-grab active:cursor-grabbing transition-shadow', selId === b.id && 'outline outline-3 outline-offset-2 outline-[var(--selected)]', dropCell === key && (b.action.type === 'folder' ? 'ring-4 ring-accent' : 'ring-2 ring-accent/60'))}
                  style={{ ...t.style, gridColumn: `${b.x + 1} / span ${b.w}`, gridRow: `${b.y + 1} / span ${b.h}` }}>
                  <TileFace b={b} active={active} unavailable={unavailable(b)} />
                </div>
              )
            })}
          </div>
        </div>
        <div className="text-[11px] text-ink-3 text-center">Click a tile to edit · drag to move or swap · drop on a page tab to move it there · drop on a folder to put it inside · double-click a folder to open it · Del deletes · Ctrl+D duplicates · arrows nudge</div>
      </div>

      {/* Inspector */}
      <Panel title={sel ? 'Button designer' : 'Button designer'} icon="Palette" className="min-h-0">
        {sel ? (
          <div className="flex-1 min-h-0 overflow-y-auto thin-scroll -mr-2 pr-2">
            <div className="flex flex-col items-center gap-1 mb-3"><TilePreview b={sel} /><span className="text-[11px] text-ink-3">{actionLabel(sel)} · live preview</span></div>
            <div className="flex flex-wrap gap-1.5 mb-3 justify-center">
              <Btn size="sm" icon="Play" onClick={() => sel.action.type === 'folder' ? go(sel.action.pageId) : run(sel.action, { confirmed: false })}>{sel.action.type === 'folder' ? 'Open' : 'Test'}</Btn>
              <Btn size="sm" icon="Copy" onClick={() => duplicateTile(page.id, sel.id)}>Duplicate</Btn>
              <select className="field !w-auto !py-1.5 !text-[12.5px]" value="" onChange={(e) => { if (e.target.value) moveTileToPage(page.id, sel.id, e.target.value); setSelId(null) }}>
                <option value="">Move to…</option>
                {prof.pages.filter((p) => p.id !== page.id && !(sel.action.type === 'folder' && sel.action.pageId === p.id)).map((p) => <option key={p.id} value={p.id}>{pageTrail(prof, p).map((x) => x.name).join(' › ')}</option>)}
              </select>
              <Btn size="sm" variant="ghost" icon="Trash" className="!text-bad" onClick={() => { deleteTile(page.id, sel.id); setSelId(null) }}>Delete</Btn>
            </div>
            <div className="flex items-center justify-center gap-1 mb-4">
              <span className="text-[12px] text-ink-3 mr-1">Position {sel.x + 1},{sel.y + 1}</span>
              {([['ArrowLeft', -1, 0], ['ArrowUp', 0, -1], ['ArrowDown', 0, 1], ['ArrowRight', 1, 0]] as [string, number, number][]).map(([ic, dx, dy]) => (
                <button key={ic} disabled={!fits(page, sel.x + dx, sel.y + dy, 1, 1, [sel.id]) && !occupied.get(`${sel.x + dx},${sel.y + dy}`)} onClick={() => moveTile(page.id, sel.id, sel.x + dx, sel.y + dy)} className="tap w-9 h-9 rounded-xl bg-surface-2 flex items-center justify-center disabled:opacity-30"><Icon name={ic} size={16} /></button>
              ))}
            </div>
            <ButtonDesigner b={sel} page={page} tab={tab} setTab={setTab} onChange={setTile} />
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center gap-3 text-ink-2 px-4">
            <div className="w-14 h-14 rounded-2xl bg-surface-2 flex items-center justify-center"><Icon name="MousePointerClick" size={26} /></div>
            <div className="font-semibold text-ink">Select a tile to customise it</div>
            <div className="text-[13px]">…or pick an app on the left and press <b>Add</b>. Click an empty cell first to choose where new tiles go.</div>
            <div className="flex gap-2 mt-2">
              <Btn size="sm" icon="FolderPlus" onClick={() => createFolder(page.id, 'Folder', addAt)}>New folder</Btn>
              <Btn size="sm" icon="Sparkles" onClick={() => { const id = addTile(page.id, { label: 'New button', icon: 'Sparkles', action: { type: 'keys', keys: [] } }, addAt); if (id) setSelId(id) }}>Blank tile</Btn>
            </div>
          </div>
        )}
      </Panel>
      {pageEdit && <PageEditor page={pageEdit} onClose={() => setPageEdit(null)} onDeleted={() => { setPageEdit(null); setPageId(visiblePages(prof)[0]?.id || '') }} />}
    </div>
  )
}
