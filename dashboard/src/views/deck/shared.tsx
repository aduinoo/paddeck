// Shared Stream Deck building blocks used by the tablet/phone deck and the desktop editor:
// tile rendering, the button designer, and grid operations (placement, moving, folders).
import { useEffect, useRef } from 'react'
import { activeProfile, getState, mediaUrl, requestIcon, toast, updateConfig, upload, useStore } from '../../lib/store'
import { buttonBackground } from '../../lib/theme'
import type { Config, DeckButton, DeckPage, PcState, Profile } from '../../lib/types'
import { Btn, ColorPick, Field, Icon, IconPicker, Segmented, Slider, Toggle, cx, uid } from '../../components/ui'
import { ActionEditor, ACTION_TYPES } from '../ActionEditor'

// ------------------------------------------------------------ state of toggle-style tiles
export function boundState(b: DeckButton, pc: PcState | null, focus: boolean, local: Record<string, boolean>): boolean {
  switch (b.bind) {
    case 'micMuted': return !!pc?.audio.inputs.find((d) => d.isDefault)?.muted
    case 'outputMuted': return !!pc?.audio.outputs.find((d) => d.isDefault)?.muted
    case 'focus': return focus
    case 'mediaPlaying': return pc?.media.current?.status === 'playing'
    default: return b.toggle ? !!local[b.id] : false
  }
}

// Path a tile depends on (for the "unavailable" check).
export const tilePath = (b: DeckButton) => (b.action.type === 'open' ? b.action.path : b.action.type === 'app' && !b.action.appId ? b.action.path : null) as string | null

// ------------------------------------------------------------ tile rendering
export function TileFace({ b, active, compact, size = 'normal', unavailable }: { b: DeckButton; active: boolean; compact?: boolean; size?: 'normal' | 'preview'; unavailable?: boolean }) {
  const theme = useStore((s) => activeProfile(s.config)?.theme)
  const iconKey = b.appIcon && b.action.type === 'app' ? `app:${b.action.appId || b.action.path || b.action.name}`
    : b.fileIcon && b.action.type === 'open' && b.action.path ? `file:${b.action.path}` : null
  const img = useStore((s) => (iconKey ? s.icons[iconKey] : null))
  useEffect(() => { if (iconKey) requestIcon(iconKey, { appId: b.action.appId, name: b.action.name, path: b.action.path }) }, [iconKey, b.action.appId, b.action.name, b.action.path])

  const label = (active && b.activeLabel) || b.label
  const icon = (active && b.activeIcon) || b.icon
  const big = b.w > 1 || b.h > 1
  const scale = size === 'preview' ? 1.15 : compact ? 0.8 : big ? 1.35 : 1
  const pos = b.iconPos || 'top'
  const showLabel = theme?.showLabels !== false && !b.hideLabel && pos !== 'center'
  const iconPx = Math.round(30 * scale)
  const visual = b.image ? <img src={mediaUrl(b.image)} alt="" className="object-contain rounded-xl pointer-events-none" style={{ maxWidth: pos === 'top' || pos === 'center' ? '62%' : '42%', maxHeight: '56%' }} draggable={false} />
    : b.emoji ? <span className="pointer-events-none leading-none" style={{ fontSize: Math.round(36 * scale) }}>{b.emoji}</span>
    : img ? <img src={mediaUrl(img)} alt="" className="aspect-square object-contain pointer-events-none drop-shadow" style={{ width: Math.round(46 * scale) }} draggable={false} />
    : b.action.type === 'folder' && !b.icon ? <Icon name="Folder" className="pointer-events-none" size={iconPx} />
    : <Icon name={icon} className="pointer-events-none" size={iconPx} />
  const text = showLabel && <span className={cx('font-medium leading-tight line-clamp-2 pointer-events-none px-1', pos === 'left' ? 'text-left' : pos === 'right' ? 'text-right' : 'text-center')} style={{ fontSize: b.fontSize || (compact ? 11.5 : 13) }}>{label}</span>
  return (
    <>
      <span className="shine" />
      <div className={cx('relative w-full h-full flex items-center justify-center', compact ? 'gap-1 p-1.5' : 'gap-2 p-3', pos === 'top' && 'flex-col', pos === 'left' && 'flex-row', pos === 'right' && 'flex-row-reverse', pos === 'center' && 'flex-col', unavailable && 'opacity-40 grayscale')}>
        {visual}{text}
      </div>
      {active && !b.activeBg && <span className="absolute top-2.5 right-2.5 w-2.5 h-2.5 rounded-full bg-accent shadow-[0_0_10px_var(--accent)]" />}
      {b.confirm && <Icon name="ShieldExclamationPoint" size={13} className="absolute top-2.5 left-2.5 opacity-60" />}
      {b.action.type === 'folder' && <Icon name="FolderOpen" size={13} className="absolute bottom-2.5 right-2.5 opacity-60" />}
      {unavailable && <span className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-bad text-white whitespace-nowrap">Unavailable</span>}
    </>
  )
}

export function tileStyle(b: DeckButton, active: boolean, buttonStyle?: string): { className: string; style: React.CSSProperties } {
  const bg = (active && b.activeBg) || b.bg
  const fg = (active && b.activeFg) || b.fg || (bg ? '#fff' : undefined)
  const base = buttonStyle === 'solid' ? 'bg-surface-2' : buttonStyle === 'outline' ? 'border-2 border-line bg-transparent' : 'glass'
  return {
    className: cx('deck-btn', !bg && base, active && !b.activeBg && 'ring-2 ring-[var(--selected)]'),
    style: {
      background: buttonBackground(bg, active && b.activeBg ? undefined : b.bg2, b.gradAngle ?? 160), color: fg,
      boxShadow: bg ? `0 12px 30px -14px ${bg}` : undefined, borderRadius: b.radius !== undefined ? b.radius : undefined,
    },
  }
}

// ------------------------------------------------------------ grid operations
export function occupancy(page: DeckPage, ignore?: string) {
  const m = new Map<string, string>()
  for (const b of page.buttons) if (b.id !== ignore) for (let dx = 0; dx < b.w; dx++) for (let dy = 0; dy < b.h; dy++) m.set(`${b.x + dx},${b.y + dy}`, b.id)
  return m
}
export function fits(page: DeckPage, x: number, y: number, w: number, h: number, ignore: string[] = []) {
  if (x < 0 || y < 0 || x + w > page.cols || y + h > page.rows) return false
  for (const o of page.buttons) if (!ignore.includes(o.id) && x < o.x + o.w && x + w > o.x && y < o.y + o.h && y + h > o.y) return false
  return true
}
export function firstFree(page: DeckPage, w = 1, h = 1): { x: number; y: number } | null {
  for (let y = 0; y < page.rows; y++) for (let x = 0; x < page.cols; x++) if (fits(page, x, y, w, h)) return { x, y }
  return null
}
export const findPage = (c: Config, pageId: string) => activeProfile(c)!.pages.find((p) => p.id === pageId)

// Move a tile within its page: into an empty cell, or swap with the tile there.
export function moveTile(pageId: string, id: string, x: number, y: number) {
  updateConfig((c) => {
    const p = findPage(c, pageId); if (!p) return
    const b = p.buttons.find((q) => q.id === id); if (!b) return
    const targetId = occupancy(p, b.id).get(`${x},${y}`)
    const target = targetId ? p.buttons.find((q) => q.id === targetId) : null
    if (target && fits(p, x, y, b.w, b.h, [b.id, target.id]) && fits(p, b.x, b.y, target.w, target.h, [b.id, target.id])) { target.x = b.x; target.y = b.y; b.x = x; b.y = y }
    else if (!target && fits(p, x, y, b.w, b.h, [b.id])) { b.x = x; b.y = y }
    else toast('No room there', 'warn')
  })
}

// Move a tile to another page or folder (first free cell).
export function moveTileToPage(fromId: string, id: string, toId: string) {
  if (fromId === toId) return
  let ok = true
  updateConfig((c) => {
    const from = findPage(c, fromId), to = findPage(c, toId); if (!from || !to) return
    const b = from.buttons.find((q) => q.id === id); if (!b) return
    if (b.action.type === 'folder' && b.action.pageId === to.id) { ok = false; return }
    const spot = firstFree(to, Math.min(b.w, to.cols), Math.min(b.h, to.rows)) || firstFree(to)
    if (!spot) { ok = false; return }
    from.buttons = from.buttons.filter((q) => q.id !== id)
    to.buttons.push({ ...b, x: spot.x, y: spot.y, w: fits(to, spot.x, spot.y, b.w, b.h) ? b.w : 1, h: fits(to, spot.x, spot.y, b.w, b.h) ? b.h : 1 })
  })
  if (ok) toast('Moved', 'success', 1200); else toast('That page is full', 'warn')
}

export function addTile(pageId: string, partial: Partial<DeckButton>, at?: { x: number; y: number }): string | null {
  const id = uid('b'); let placed = false
  updateConfig((c) => {
    const p = findPage(c, pageId); if (!p) return
    const spot = at && fits(p, at.x, at.y, 1, 1) ? at : firstFree(p)
    if (!spot) return
    p.buttons.push({ id, x: spot.x, y: spot.y, w: 1, h: 1, label: 'New button', icon: 'Sparkles', action: { type: 'none' }, ...partial } as DeckButton)
    placed = true
  })
  if (!placed) { toast('This page is full – add a page or enlarge the grid', 'warn'); return null }
  return id
}

export function duplicateTile(pageId: string, id: string) {
  updateConfig((c) => {
    const p = findPage(c, pageId); if (!p) return
    const b = p.buttons.find((q) => q.id === id); if (!b) return
    const spot = firstFree(p); if (!spot) { toast('Page is full', 'warn'); return }
    p.buttons.push({ ...structuredClone(b), id: uid('b'), x: spot.x, y: spot.y, w: 1, h: 1 })
  })
}

export function deleteTile(pageId: string, id: string) {
  updateConfig((c) => {
    const p = findPage(c, pageId); if (!p) return
    const b = p.buttons.find((q) => q.id === id)
    p.buttons = p.buttons.filter((q) => q.id !== id)
    // deleting a folder tile deletes its (now unreachable) folder page
    if (b?.action.type === 'folder') { const prof = activeProfile(c)!; prof.pages = prof.pages.filter((x) => x.id !== b.action.pageId) }
  })
  toast('Deleted – press Undo to restore', 'info', 2200)
}

// A folder is a tile that opens a hidden page of its own.
export function createFolder(pageId: string, name = 'Folder', at?: { x: number; y: number }) {
  const prof = activeProfile(getState().config)!
  const parent = prof.pages.find((p) => p.id === pageId)
  const folderPage: DeckPage = { id: uid('p'), name, icon: 'Folder', cols: parent?.cols || 5, rows: parent?.rows || 4, buttons: [], folder: true, parent: pageId }
  updateConfig((c) => { activeProfile(c)!.pages.push(folderPage) })
  addTile(pageId, { label: name, icon: 'Folder', bg: '#334155', action: { type: 'folder', pageId: folderPage.id } }, at)
  return folderPage.id
}

export const visiblePages = (prof: Profile) => prof.pages.filter((p) => !p.folder)
export function pageTrail(prof: Profile, page: DeckPage): DeckPage[] {
  const out: DeckPage[] = []; let cur: DeckPage | undefined = page; let guard = 0
  while (cur && guard++ < 10) { out.unshift(cur); cur = cur.parent ? prof.pages.find((p) => p.id === cur!.parent) : undefined }
  return out
}

// ------------------------------------------------------------ button designer (inline form)
const EMOJIS = ['🎮', '🎧', '🎨', '💻', '📁', '🎵', '🔥', '⭐', '🚀', '📸', '🎬', '☕', '💬', '🔊', '🖥️', '⚙️']

export function ButtonDesigner({ b, page, onChange, tab, setTab, compact }: {
  b: DeckButton; page: DeckPage; onChange: (patch: Partial<DeckButton>) => void; tab: 'action' | 'design' | 'state'; setTab: (t: 'action' | 'design' | 'state') => void; compact?: boolean
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const set = onChange
  return (
    <div className="min-w-0">
      <Field label="Title"><input className="field" value={b.label} onChange={(e) => set({ label: e.target.value })} /></Field>
      <Segmented className="mb-3" value={tab} onChange={setTab} options={[{ value: 'action', label: 'Action', icon: 'Zap' }, { value: 'design', label: 'Design', icon: 'Palette' }, { value: 'state', label: 'Toggle', icon: 'ToggleRight' }]} />
      {tab === 'action' && (
        <>
          <ActionEditor action={b.action} onChange={(action) => {
            const auto = b.label === 'New button' || !b.label || b.label === b.action.name
            set({ action, ...(action.type === 'app' && action.name && auto ? { label: action.name, appIcon: true, emoji: undefined, image: undefined } : {}),
              ...(action.type === 'open' && action.name && auto ? { label: action.name, fileIcon: true, emoji: undefined, image: undefined } : {}) })
          }} />
          <Toggle on={!!b.confirm} onChange={(v) => set({ confirm: v })} label="Ask before running" hint="Power actions always ask" />
        </>
      )}
      {tab === 'design' && (
        <>
          <Field label="Icon"><IconPicker value={b.icon} onChange={(icon) => set({ icon, image: undefined, appIcon: false, fileIcon: false, emoji: undefined })} /></Field>
          <Field label="Emoji">
            <div className="flex gap-1.5 flex-wrap items-center">
              <input className="field !w-20 text-center text-[20px] !py-1" value={b.emoji || ''} maxLength={8} onChange={(e) => set({ emoji: e.target.value || undefined, image: undefined, appIcon: false, fileIcon: false })} placeholder="😀" />
              {EMOJIS.slice(0, compact ? 8 : 16).map((em) => <button key={em} className="tap w-9 h-9 rounded-xl bg-surface-2 text-[18px]" onClick={() => set({ emoji: em, image: undefined, appIcon: false, fileIcon: false })}>{em}</button>)}
            </div>
          </Field>
          <div className="flex gap-2 mb-3 flex-wrap">
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; try { set({ image: await upload(f, 'image'), appIcon: false, fileIcon: false, emoji: undefined }) } catch (er: any) { toast(er.message, 'error') } }} />
            <Btn size="sm" icon="ImageUp" onClick={() => fileRef.current?.click()}>Upload image</Btn>
            {b.image && <Btn size="sm" icon="X" onClick={() => set({ image: undefined })}>Remove image</Btn>}
            {b.action.type === 'app' && <Btn size="sm" icon="AppWindow" variant={b.appIcon ? 'accent' : 'soft'} onClick={() => set({ appIcon: !b.appIcon, image: undefined, emoji: undefined })}>App icon</Btn>}
            {b.action.type === 'open' && <Btn size="sm" icon="File" variant={b.fileIcon ? 'accent' : 'soft'} onClick={() => set({ fileIcon: !b.fileIcon, image: undefined, emoji: undefined })}>File icon</Btn>}
          </div>
          <Field label="Icon position">
            <Segmented value={b.iconPos || 'top'} onChange={(v) => set({ iconPos: v as any })} options={[{ value: 'top', label: 'Top', icon: 'PanelTop' }, { value: 'left', label: 'Left', icon: 'PanelLeft' }, { value: 'right', label: 'Right', icon: 'PanelRight' }, { value: 'center', label: 'Icon only', icon: 'Square' }]} />
          </Field>
          <Field label="Background"><ColorPick allowNone value={b.bg || ''} onChange={(bg) => set({ bg: bg || undefined })} /></Field>
          {b.bg && <Field label="Gradient to"><ColorPick allowNone value={b.bg2 || ''} onChange={(bg2) => set({ bg2: bg2 || undefined })} /></Field>}
          {b.bg && b.bg2 && <Field label={`Gradient angle · ${b.gradAngle ?? 160}°`}><Slider value={b.gradAngle ?? 160} min={0} max={360} live={false} onChange={(v) => set({ gradAngle: v })} className="!h-8" /></Field>}
          <Field label="Text colour"><ColorPick allowNone value={b.fg || ''} onChange={(fg) => set({ fg: fg || undefined })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={`Font size · ${b.fontSize || 13}px`}><Slider value={b.fontSize || 13} min={9} max={24} live={false} onChange={(v) => set({ fontSize: v })} className="!h-8" /></Field>
            <Field label={`Corner radius · ${b.radius ?? 'theme'}`}><Slider value={b.radius ?? 22} min={0} max={48} live={false} onChange={(v) => set({ radius: v })} className="!h-8" /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Width"><Segmented value={String(b.w)} onChange={(v) => fits(page, b.x, b.y, Number(v), b.h, [b.id]) ? set({ w: Number(v) }) : toast('Not enough room – move the tile first', 'warn')} options={['1', '2', '3'].map((v) => ({ value: v, label: v }))} /></Field>
            <Field label="Height"><Segmented value={String(b.h)} onChange={(v) => fits(page, b.x, b.y, b.w, Number(v), [b.id]) ? set({ h: Number(v) }) : toast('Not enough room – move the tile first', 'warn')} options={['1', '2', '3'].map((v) => ({ value: v, label: v }))} /></Field>
          </div>
          <Toggle on={!!b.hideLabel} onChange={(v) => set({ hideLabel: v })} label="Hide title" />
          {(b.radius !== undefined || b.fontSize || b.gradAngle !== undefined) && <Btn size="sm" variant="ghost" icon="RotateCcw" onClick={() => set({ radius: undefined, fontSize: undefined, gradAngle: undefined })}>Reset size & radius to theme</Btn>}
        </>
      )}
      {tab === 'state' && (
        <>
          <Toggle on={!!b.toggle} onChange={(v) => set({ toggle: v })} label="Toggle button" hint="The tile has an active and an inactive look" />
          {b.toggle && (
            <>
              <Field label="Active when">
                <select className="field" value={b.bind || ''} onChange={(e) => set({ bind: e.target.value || undefined })}>
                  <option value="">Tapped on (flips each press)</option><option value="micMuted">Microphone is muted</option><option value="outputMuted">Speakers are muted</option>
                  <option value="focus">Focus mode is on</option><option value="mediaPlaying">Music is playing</option>
                </select>
              </Field>
              <Field label="Active title"><input className="field" value={b.activeLabel || ''} placeholder={b.label} onChange={(e) => set({ activeLabel: e.target.value || undefined })} /></Field>
              <Field label="Active icon"><IconPicker value={b.activeIcon} onChange={(v) => set({ activeIcon: v })} /></Field>
              <Field label="Active background"><ColorPick allowNone value={b.activeBg || ''} onChange={(v) => set({ activeBg: v || undefined })} /></Field>
              <Field label="Active text colour"><ColorPick allowNone value={b.activeFg || ''} onChange={(v) => set({ activeFg: v || undefined })} /></Field>
            </>
          )}
        </>
      )}
    </div>
  )
}

// Live preview of a tile (inactive + active state side by side when it is a toggle).
export function TilePreview({ b }: { b: DeckButton }) {
  const theme = useStore((s) => activeProfile(s.config)?.theme)
  const one = (active: boolean) => {
    const t = tileStyle({ ...b, w: 1, h: 1 }, active, theme?.buttonStyle)
    return (
      <div className="flex flex-col items-center gap-1.5">
        <div className={cx(t.className, 'w-36 h-36')} style={t.style}><TileFace b={{ ...b, w: 1, h: 1 }} active={active} size="preview" /></div>
        {b.toggle && <span className="text-[11px] text-ink-3">{active ? 'Active' : 'Inactive'}</span>}
      </div>
    )
  }
  return <div className="flex gap-4 justify-center">{one(false)}{b.toggle && one(true)}</div>
}

export const actionLabel = (b: DeckButton) => ACTION_TYPES.find((a) => a.type === b.action.type)?.label || b.action.type
