// Whiteboard: an infinite, pressure-sensitive vector canvas. Drawings are saved on the PC
// (%APPDATA%\PadDeck\whiteboards) and can be exported as PNG or PDF to Documents\PadDeck.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { android, api, toast, useLayout } from '../lib/store'
import { Btn, Icon, Modal, Slider, cx, uid } from '../components/ui'
import { isHex, normHex } from '../lib/theme'

type Tool = 'pen' | 'pencil' | 'marker' | 'highlighter' | 'eraser' | 'line' | 'rect' | 'ellipse' | 'arrow' | 'text' | 'select' | 'hand'
type Stroke = { id: string; t: 'stroke'; tool: 'pen' | 'pencil' | 'marker' | 'highlighter'; color: string; size: number; opacity: number; pts: number[] }
type Shape = { id: string; t: 'line' | 'rect' | 'ellipse' | 'arrow'; color: string; size: number; opacity: number; x1: number; y1: number; x2: number; y2: number }
type Text = { id: string; t: 'text'; color: string; size: number; opacity: number; x: number; y: number; text: string }
type Item = Stroke | Shape | Text
type Bg = 'white' | 'dark' | 'grid' | 'dots' | 'transparent'
interface Board { id: string; name: string; bg: Bg; items: Item[]; view: { x: number; y: number; z: number }; updated?: number }

const PALETTE = ['#111111', '#ffffff', '#ef4444', '#f97316', '#facc15', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#a16207', '#64748b']
const TOOLS: { id: Tool; icon: string; label: string }[] = [
  { id: 'pen', icon: 'PenLine', label: 'Pen' }, { id: 'pencil', icon: 'Pencil', label: 'Pencil' }, { id: 'marker', icon: 'Brush', label: 'Marker' },
  { id: 'highlighter', icon: 'Highlighter', label: 'Highlighter' }, { id: 'eraser', icon: 'Eraser', label: 'Eraser' },
  { id: 'line', icon: 'Minus', label: 'Line' }, { id: 'arrow', icon: 'MoveUpRight', label: 'Arrow' }, { id: 'rect', icon: 'Square', label: 'Rectangle' },
  { id: 'ellipse', icon: 'Circle', label: 'Circle' }, { id: 'text', icon: 'Type', label: 'Text' }, { id: 'select', icon: 'MousePointer2', label: 'Select' }, { id: 'hand', icon: 'Hand', label: 'Pan' },
]
const BG_COLOR: Record<Bg, string> = { white: '#ffffff', dark: '#15161c', grid: '#ffffff', dots: '#ffffff', transparent: 'transparent' }
const newBoard = (): Board => ({ id: uid('wb'), name: `Board ${new Date().toLocaleDateString()}`, bg: 'white', items: [], view: { x: 0, y: 0, z: 1 } })

// ------------------------------------------------------------ rendering
function bbox(it: Item): [number, number, number, number] {
  if (it.t === 'stroke') {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
    for (let i = 0; i < it.pts.length; i += 3) { const x = it.pts[i], y = it.pts[i + 1]; if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y }
    const pad = it.size * 2; return [x0 - pad, y0 - pad, x1 + pad, y1 + pad]
  }
  if (it.t === 'text') { const w = it.text.length * it.size * 0.6; return [it.x, it.y - it.size, it.x + w, it.y + it.size * 0.3] }
  return [Math.min(it.x1, it.x2) - it.size, Math.min(it.y1, it.y2) - it.size, Math.max(it.x1, it.x2) + it.size, Math.max(it.y1, it.y2) + it.size]
}

function widthAt(it: Stroke, p: number) {
  if (it.tool === 'pen') return it.size * (0.15 + 0.85 * p)
  if (it.tool === 'pencil') return Math.max(0.6, it.size * 0.55 * (0.35 + 0.65 * p))
  if (it.tool === 'marker') return it.size * 1.6
  return it.size * 3.2
}

function drawStroke(g: CanvasRenderingContext2D, it: Stroke) {
  const pts = it.pts; const n = pts.length / 3
  if (!n) return
  g.globalAlpha = it.tool === 'highlighter' ? Math.min(0.4, it.opacity) : it.tool === 'pencil' ? it.opacity * 0.85 : it.opacity
  g.fillStyle = g.strokeStyle = it.color
  if (it.tool === 'marker' || it.tool === 'highlighter') {
    // constant width: one path so translucent overlaps don't darken
    g.lineWidth = widthAt(it, 1); g.lineCap = it.tool === 'highlighter' ? 'square' : 'round'; g.lineJoin = 'round'
    g.beginPath(); g.moveTo(pts[0], pts[1])
    for (let i = 1; i < n; i++) { const mx = (pts[(i - 1) * 3] + pts[i * 3]) / 2, my = (pts[(i - 1) * 3 + 1] + pts[i * 3 + 1]) / 2; g.quadraticCurveTo(pts[(i - 1) * 3], pts[(i - 1) * 3 + 1], mx, my) }
    g.lineTo(pts[(n - 1) * 3], pts[(n - 1) * 3 + 1]); if (n === 1) g.lineTo(pts[0] + 0.1, pts[1])
    g.stroke(); g.globalAlpha = 1; return
  }
  // variable width (pressure): filled outline polygon built from per-point normals
  if (n === 1) { g.beginPath(); g.arc(pts[0], pts[1], widthAt(it, pts[2]) / 2, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1; return }
  const left: number[] = [], right: number[] = []
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1)
    let dx = pts[b * 3] - pts[a * 3], dy = pts[b * 3 + 1] - pts[a * 3 + 1]
    const len = Math.hypot(dx, dy) || 1; dx /= len; dy /= len
    const w = widthAt(it, pts[i * 3 + 2]) / 2
    left.push(pts[i * 3] - dy * w, pts[i * 3 + 1] + dx * w); right.push(pts[i * 3] + dy * w, pts[i * 3 + 1] - dx * w)
  }
  g.beginPath(); g.moveTo(left[0], left[1])
  for (let i = 2; i < left.length; i += 2) g.lineTo(left[i], left[i + 1])
  for (let i = right.length - 2; i >= 0; i -= 2) g.lineTo(right[i], right[i + 1])
  g.closePath(); g.fill()
  // round caps as separate discs (keeps the outline's winding consistent)
  g.beginPath(); g.arc(pts[0], pts[1], widthAt(it, pts[2]) / 2, 0, Math.PI * 2); g.fill()
  g.beginPath(); g.arc(pts[(n - 1) * 3], pts[(n - 1) * 3 + 1], widthAt(it, pts[(n - 1) * 3 + 2]) / 2, 0, Math.PI * 2); g.fill()
  g.globalAlpha = 1
}

function drawItem(g: CanvasRenderingContext2D, it: Item) {
  if (it.t === 'stroke') return drawStroke(g, it)
  g.globalAlpha = it.opacity; g.strokeStyle = g.fillStyle = it.color; g.lineWidth = it.size; g.lineCap = 'round'; g.lineJoin = 'round'
  if (it.t === 'text') { g.font = `600 ${it.size}px Inter Variable, system-ui, sans-serif`; g.textBaseline = 'alphabetic'; it.text.split('\n').forEach((l, i) => g.fillText(l, it.x, it.y + i * it.size * 1.25)); g.globalAlpha = 1; return }
  g.beginPath()
  if (it.t === 'rect') g.rect(Math.min(it.x1, it.x2), Math.min(it.y1, it.y2), Math.abs(it.x2 - it.x1), Math.abs(it.y2 - it.y1))
  else if (it.t === 'ellipse') g.ellipse((it.x1 + it.x2) / 2, (it.y1 + it.y2) / 2, Math.abs(it.x2 - it.x1) / 2, Math.abs(it.y2 - it.y1) / 2, 0, 0, Math.PI * 2)
  else {
    g.moveTo(it.x1, it.y1); g.lineTo(it.x2, it.y2)
    if (it.t === 'arrow') {
      const a = Math.atan2(it.y2 - it.y1, it.x2 - it.x1), h = Math.max(12, it.size * 4)
      g.moveTo(it.x2, it.y2); g.lineTo(it.x2 - h * Math.cos(a - 0.45), it.y2 - h * Math.sin(a - 0.45))
      g.moveTo(it.x2, it.y2); g.lineTo(it.x2 - h * Math.cos(a + 0.45), it.y2 - h * Math.sin(a + 0.45))
    }
  }
  g.stroke(); g.globalAlpha = 1
}

function drawBackground(g: CanvasRenderingContext2D, bg: Bg, w: number, h: number, view: Board['view']) {
  if (bg === 'transparent') { g.clearRect(0, 0, w, h); return }
  g.fillStyle = BG_COLOR[bg]; g.fillRect(0, 0, w, h)
  if (bg === 'grid' || bg === 'dots') {
    const step = 32 * view.z
    if (step < 8) return
    const ox = ((view.x % step) + step) % step, oy = ((view.y % step) + step) % step
    g.fillStyle = g.strokeStyle = 'rgba(30,40,80,0.13)'; g.lineWidth = 1
    if (bg === 'grid') { g.beginPath(); for (let x = ox; x < w; x += step) { g.moveTo(x, 0); g.lineTo(x, h) } for (let y = oy; y < h; y += step) { g.moveTo(0, y); g.lineTo(w, y) } g.stroke() }
    else for (let x = ox; x < w; x += step) for (let y = oy; y < h; y += step) { g.beginPath(); g.arc(x, y, 1.3, 0, Math.PI * 2); g.fill() }
  }
}

function hitItem(it: Item, x: number, y: number, r: number) {
  const [x0, y0, x1, y1] = bbox(it)
  if (x < x0 - r || x > x1 + r || y < y0 - r || y > y1 + r) return false
  if (it.t === 'stroke') { for (let i = 0; i < it.pts.length; i += 3) if (Math.hypot(it.pts[i] - x, it.pts[i + 1] - y) < r + widthAt(it, it.pts[i + 2]) / 2) return true; return false }
  if (it.t === 'line' || it.t === 'arrow') {
    const dx = it.x2 - it.x1, dy = it.y2 - it.y1, l2 = dx * dx + dy * dy || 1
    const t = Math.max(0, Math.min(1, ((x - it.x1) * dx + (y - it.y1) * dy) / l2))
    return Math.hypot(it.x1 + t * dx - x, it.y1 + t * dy - y) < r + it.size
  }
  return true
}

function moveItem(it: Item, dx: number, dy: number): Item {
  if (it.t === 'stroke') return { ...it, pts: it.pts.map((v, i) => (i % 3 === 0 ? v + dx : i % 3 === 1 ? v + dy : v)) }
  if (it.t === 'text') return { ...it, x: it.x + dx, y: it.y + dy }
  return { ...it, x1: it.x1 + dx, y1: it.y1 + dy, x2: it.x2 + dx, y2: it.y2 + dy }
}

function renderBoard(board: Board, scale = 2, pad = 40): HTMLCanvasElement {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const it of board.items) { const b = bbox(it); x0 = Math.min(x0, b[0]); y0 = Math.min(y0, b[1]); x1 = Math.max(x1, b[2]); y1 = Math.max(y1, b[3]) }
  if (!isFinite(x0)) { x0 = 0; y0 = 0; x1 = 800; y1 = 600 }
  x0 -= pad; y0 -= pad; x1 += pad; y1 += pad
  const w = Math.min(8000, Math.ceil((x1 - x0) * scale)), h = Math.min(8000, Math.ceil((y1 - y0) * scale))
  const c = document.createElement('canvas'); c.width = w; c.height = h
  const g = c.getContext('2d')!
  const view = { x: -x0 * scale, y: -y0 * scale, z: scale }
  drawBackground(g, board.bg, w, h, view)
  g.setTransform(scale, 0, 0, scale, -x0 * scale, -y0 * scale)
  for (const it of board.items) drawItem(g, it)
  return c
}

// Minimal PDF writer: one page with the drawing as a JPEG image.
async function toPdf(canvas: HTMLCanvasElement): Promise<Blob> {
  const flat = document.createElement('canvas'); flat.width = canvas.width; flat.height = canvas.height
  const fg = flat.getContext('2d')!; fg.fillStyle = '#fff'; fg.fillRect(0, 0, flat.width, flat.height); fg.drawImage(canvas, 0, 0)
  const jpg = new Uint8Array(await (await new Promise<Blob>((r) => flat.toBlob((b) => r(b!), 'image/jpeg', 0.92))).arrayBuffer())
  const W = flat.width * 0.5, H = flat.height * 0.5 // 144 dpi
  const enc = new TextEncoder(); const parts: Uint8Array[] = []; const offs: number[] = []; let len = 0
  const push = (x: string | Uint8Array) => { const b = typeof x === 'string' ? enc.encode(x) : x; parts.push(b); len += b.length }
  push('%PDF-1.4\n')
  const obj = (n: number, body: (string | Uint8Array)[]) => { offs[n] = len; push(`${n} 0 obj\n`); body.forEach(push); push('\nendobj\n') }
  obj(1, ['<< /Type /Catalog /Pages 2 0 R >>'])
  obj(2, ['<< /Type /Pages /Kids [3 0 R] /Count 1 >>'])
  obj(3, [`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W.toFixed(2)} ${H.toFixed(2)}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`])
  obj(4, [`<< /Type /XObject /Subtype /Image /Width ${flat.width} /Height ${flat.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>\nstream\n`, jpg, '\nendstream'])
  const content = `q ${W.toFixed(2)} 0 0 ${H.toFixed(2)} 0 0 cm /Im0 Do Q`
  obj(5, [`<< /Length ${content.length} >>\nstream\n${content}\nendstream`])
  const xref = len
  push(`xref\n0 6\n0000000000 65535 f \n${[1, 2, 3, 4, 5].map((n) => `${String(offs[n]).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`)
  return new Blob(parts as BlobPart[], { type: 'application/pdf' })
}

// ------------------------------------------------------------ component
const lsGet = (k: string) => { try { return localStorage.getItem(k) } catch { return null } }
const lsSet = (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* ignore */ } }

export function Whiteboard({ immersive, setImmersive }: { immersive: boolean; setImmersive: (v: boolean) => void }) {
  const layout = useLayout()
  const phone = layout === 'phone'
  const [board, setBoard] = useState<Board>(newBoard)
  const boardRef = useRef(board); boardRef.current = board
  const [tool, setTool] = useState<Tool>(() => (lsGet('wb.tool') as Tool) || 'pen')
  const [color, setColor] = useState(() => lsGet('wb.color') || '#111111')
  const [size, setSize] = useState(() => Number(lsGet('wb.size')) || 4)
  const [opacity, setOpacity] = useState(1)
  const [fingerDraw, setFingerDraw] = useState(() => lsGet('wb.finger') === '1')
  const [showBar, setShowBar] = useState(true)
  const [panel, setPanel] = useState<null | 'color' | 'bg' | 'boards' | 'export'>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [textEdit, setTextEdit] = useState<{ x: number; y: number; sx: number; sy: number } | null>(null)
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null)
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'dirty'>('saved')
  const undo = useRef<Item[][]>([]); const redo = useRef<Item[][]>([])
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const live = useRef<Item | null>(null)
  const sel = useRef<{ x0: number; y0: number; x1: number; y1: number } | null>(null)
  const dirtyRef = useRef(true)
  const penSeen = useRef(false)

  useEffect(() => { lsSet('wb.tool', tool); lsSet('wb.color', color); lsSet('wb.size', String(size)); lsSet('wb.finger', fingerDraw ? '1' : '0') }, [tool, color, size, fingerDraw])

  // Load last board
  useEffect(() => {
    const id = lsGet('wb.last')
    if (id) api(`/api/boards/${id}`).then((r) => r.json()).then((b: Board) => { setBoard(b); dirtyRef.current = true }).catch(() => {})
  }, [])

  // Autosave (debounced) to the PC
  const saveTimer = useRef<number | undefined>(undefined)
  const commit = useCallback((items: Item[], pushUndo = true) => {
    if (pushUndo) { undo.current.push(boardRef.current.items); if (undo.current.length > 150) undo.current.shift(); redo.current = [] }
    boardRef.current = { ...boardRef.current, items } // keep the live ref current between renders
    setBoard((b) => ({ ...b, items }))
    dirtyRef.current = true
    setSaveState('dirty')
  }, [])
  useEffect(() => {
    if (saveState !== 'dirty') return
    clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => save(), 1500)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board, saveState])

  const save = async () => {
    const b = boardRef.current
    setSaveState('saving')
    try {
      const thumb = b.items.length ? (() => { const c = renderBoard(b, 0.3, 20); return c.toDataURL('image/png') })() : null
      await api(`/api/boards/${b.id}`, { method: 'PUT', body: JSON.stringify({ ...b, thumb }), headers: { 'Content-Type': 'application/json' } })
      lsSet('wb.last', b.id)
      setSaveState((s) => (s === 'saving' ? 'saved' : s))
    } catch (e: any) { setSaveState('dirty'); toast(`Not saved: ${e.message}`, 'error') }
  }

  const toWorld = (cx: number, cy: number) => { const r = canvasRef.current!.getBoundingClientRect(); const v = boardRef.current.view; return { x: (cx - r.left - v.x) / v.z, y: (cy - r.top - v.y) / v.z } }

  // ---------------- render loop
  useEffect(() => {
    let raf = 0
    const base = document.createElement('canvas')
    let lastKey = ''
    const loop = () => {
      raf = requestAnimationFrame(loop)
      const c = canvasRef.current; if (!c) return
      const dpr = devicePixelRatio || 1
      const w = c.clientWidth, h = c.clientHeight
      if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); dirtyRef.current = true }
      const b = boardRef.current
      const key = `${b.view.x},${b.view.y},${b.view.z},${b.bg},${w},${h}`
      if (dirtyRef.current || key !== lastKey) {
        base.width = c.width; base.height = c.height
        const g = base.getContext('2d')!
        g.setTransform(dpr, 0, 0, dpr, 0, 0)
        drawBackground(g, b.bg, w, h, b.view)
        g.setTransform(dpr * b.view.z, 0, 0, dpr * b.view.z, dpr * b.view.x, dpr * b.view.y)
        for (const it of b.items) if ((!selectedRef.current.has(it.id) || !dragRef.current) && !erasedPreview.current?.has(it.id)) drawItem(g, it)
        dirtyRef.current = false; lastKey = key
      }
      const g = c.getContext('2d')!
      g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, c.width, c.height); g.drawImage(base, 0, 0)
      g.setTransform(dpr * b.view.z, 0, 0, dpr * b.view.z, dpr * b.view.x, dpr * b.view.y)
      if (live.current) drawItem(g, live.current)
      // selection overlay
      if (selectedRef.current.size) {
        const d = dragRef.current || { dx: 0, dy: 0 }
        for (const it of b.items) if (selectedRef.current.has(it.id)) {
          const m = d.dx || d.dy ? moveItem(it, d.dx, d.dy) : it
          if (dragRef.current) drawItem(g, m)
          const bb = bbox(m); g.strokeStyle = '#7c5cff'; g.lineWidth = 1.5 / b.view.z; g.setLineDash([6 / b.view.z, 4 / b.view.z]); g.strokeRect(bb[0], bb[1], bb[2] - bb[0], bb[3] - bb[1]); g.setLineDash([])
        }
      }
      if (sel.current) { const s = sel.current; g.fillStyle = 'rgba(124,92,255,0.08)'; g.strokeStyle = '#7c5cff'; g.lineWidth = 1 / b.view.z; g.fillRect(s.x0, s.y0, s.x1 - s.x0, s.y1 - s.y0); g.strokeRect(s.x0, s.y0, s.x1 - s.x0, s.y1 - s.y0) }
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])
  const selectedRef = useRef(selected); selectedRef.current = selected
  const dragRef = useRef<{ dx: number; dy: number } | null>(null)
  useEffect(() => { dirtyRef.current = true }, [board, selected])

  // ---------------- input
  useEffect(() => {
    const el = canvasRef.current!; const touches = new Map<number, { x: number; y: number }>()
    let gesture: { d: number; cx: number; cy: number; view: Board['view'] } | null = null
    let active: { id: number; mode: string; start: { x: number; y: number }; erased?: Set<string>; tempEraser?: boolean } | null = null

    const setView = (v: Board['view']) => { boardRef.current = { ...boardRef.current, view: v }; setBoard((b) => ({ ...b, view: v })) }
    const startGesture = () => {
      const p = [...touches.values()]; if (p.length < 2) return
      gesture = { d: Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y), cx: (p[0].x + p[1].x) / 2, cy: (p[0].y + p[1].y) / 2, view: { ...boardRef.current.view } }
      if (active) { live.current = null; active = null; sel.current = null }
    }

    const down = (e: PointerEvent) => {
      if (textEditRef.current) return
      if (e.pointerType === 'touch') {
        touches.set(e.pointerId, { x: e.clientX, y: e.clientY })
        if (touches.size >= 2) { startGesture(); return }
        // palm rejection: once a pen is used, single fingers only pan
        if ((penSeen.current && !fingerDrawRef.current) || toolRef.current === 'hand') { active = { id: e.pointerId, mode: 'pan', start: { x: e.clientX, y: e.clientY } }; gesture = { d: 0, cx: e.clientX, cy: e.clientY, view: { ...boardRef.current.view } }; return }
      }
      if (e.pointerType === 'pen') penSeen.current = true
      try { el.setPointerCapture(e.pointerId) } catch { /* synthetic or already-released pointer */ }
      const w = toWorld(e.clientX, e.clientY)
      const eraserBtn = (e.buttons & 32) !== 0 || e.button === 5
      const t = eraserBtn ? 'eraser' : toolRef.current
      if (t === 'hand' || e.button === 1) { active = { id: e.pointerId, mode: 'pan', start: { x: e.clientX, y: e.clientY } }; gesture = { d: 0, cx: e.clientX, cy: e.clientY, view: { ...boardRef.current.view } }; return }
      active = { id: e.pointerId, mode: t, start: w, tempEraser: eraserBtn }
      const st = styleRef.current
      if (t === 'pen' || t === 'pencil' || t === 'marker' || t === 'highlighter') live.current = { id: uid('s'), t: 'stroke', tool: t, color: st.color, size: st.size, opacity: st.opacity, pts: [w.x, w.y, e.pointerType === 'mouse' ? 0.5 : e.pressure || 0.5] }
      else if (t === 'line' || t === 'arrow' || t === 'rect' || t === 'ellipse') live.current = { id: uid('s'), t, color: st.color, size: st.size, opacity: st.opacity, x1: w.x, y1: w.y, x2: w.x, y2: w.y }
      else if (t === 'eraser') { active.erased = new Set(); eraseAt(w.x, w.y, active.erased) }
      else if (t === 'text') { const r = el.getBoundingClientRect(); setTextEdit({ x: w.x, y: w.y, sx: e.clientX - r.left, sy: e.clientY - r.top }); active = null }
      else if (t === 'select') {
        const hit = [...boardRef.current.items].reverse().find((it) => hitItem(it, w.x, w.y, 8 / boardRef.current.view.z))
        if (hit && (selectedRef.current.has(hit.id))) { active.mode = 'move'; dragRef.current = { dx: 0, dy: 0 } }
        else if (hit) { setSelected(new Set([hit.id])); selectedRef.current = new Set([hit.id]); active.mode = 'move'; dragRef.current = { dx: 0, dy: 0 } }
        else { setSelected(new Set()); sel.current = { x0: w.x, y0: w.y, x1: w.x, y1: w.y } }
      }
    }

    const eraseAt = (x: number, y: number, set: Set<string>) => {
      const r = Math.max(6, styleRef.current.size * 2) / boardRef.current.view.z
      for (const it of boardRef.current.items) if (!set.has(it.id) && hitItem(it, x, y, r)) set.add(it.id)
      if (set.size) { erasedPreview.current = set; dirtyRef.current = true }
    }

    const move = (e: PointerEvent) => {
      if (e.pointerType === 'pen' || e.pointerType === 'mouse') { const r = el.getBoundingClientRect(); setHover(e.buttons ? null : { x: e.clientX - r.left, y: e.clientY - r.top }) }
      if (e.pointerType === 'touch' && touches.has(e.pointerId)) {
        touches.set(e.pointerId, { x: e.clientX, y: e.clientY })
        if (touches.size >= 2 && gesture) {
          const p = [...touches.values()]
          const d = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y), cx = (p[0].x + p[1].x) / 2, cy = (p[0].y + p[1].y) / 2
          const z = Math.max(0.1, Math.min(8, gesture.view.z * (d / (gesture.d || d))))
          const r = el.getBoundingClientRect()
          const wx = (gesture.cx - r.left - gesture.view.x) / gesture.view.z, wy = (gesture.cy - r.top - gesture.view.y) / gesture.view.z
          setView({ z, x: cx - r.left - wx * z, y: cy - r.top - wy * z })
          return
        }
      }
      if (!active || e.pointerId !== active.id) return
      if (active.mode === 'pan' && gesture) { setView({ ...gesture.view, x: gesture.view.x + e.clientX - gesture.cx, y: gesture.view.y + e.clientY - gesture.cy }); return }
      const evs = (e as any).getCoalescedEvents?.() as PointerEvent[] | undefined
      for (const ce of evs && evs.length ? evs : [e]) {
        const w = toWorld(ce.clientX, ce.clientY)
        const it = live.current
        if (it?.t === 'stroke') {
          const n = it.pts.length; const lx = it.pts[n - 3], ly = it.pts[n - 2]
          if (Math.hypot(w.x - lx, w.y - ly) * boardRef.current.view.z < 0.8) continue
          it.pts.push(w.x, w.y, ce.pointerType === 'mouse' ? 0.5 : ce.pressure || 0.5)
        } else if (it && it.t !== 'text') { it.x2 = w.x; it.y2 = w.y; if (e.shiftKey && (it.t === 'rect' || it.t === 'ellipse')) { const s = Math.max(Math.abs(it.x2 - it.x1), Math.abs(it.y2 - it.y1)); it.x2 = it.x1 + Math.sign(it.x2 - it.x1) * s; it.y2 = it.y1 + Math.sign(it.y2 - it.y1) * s } }
        else if (active.mode === 'eraser') eraseAt(w.x, w.y, active.erased!)
        else if (active.mode === 'move' && dragRef.current) dragRef.current = { dx: w.x - active.start.x, dy: w.y - active.start.y }
        else if (sel.current) { sel.current.x1 = w.x; sel.current.y1 = w.y }
      }
    }

    const up = (e: PointerEvent) => {
      if (e.pointerType === 'touch') { touches.delete(e.pointerId); if (touches.size < 2) gesture = active?.mode === 'pan' ? gesture : null }
      if (!active || e.pointerId !== active.id) { if (touches.size === 0) gesture = null; return }
      const b = boardRef.current
      if (live.current) {
        const it = live.current; live.current = null
        const tiny = it.t !== 'stroke' && it.t !== 'text' && Math.hypot(it.x2 - it.x1, it.y2 - it.y1) < 2
        if (!tiny) commit([...b.items, it])
      } else if (active.mode === 'eraser' && active.erased?.size) { const er = active.erased; erasedPreview.current = null; commit(b.items.filter((it) => !er.has(it.id))) }
      else if (active.mode === 'move' && dragRef.current) {
        const d = dragRef.current; dragRef.current = null
        if (d.dx || d.dy) commit(b.items.map((it) => (selectedRef.current.has(it.id) ? moveItem(it, d.dx, d.dy) : it)))
      } else if (sel.current) {
        const s = sel.current; sel.current = null
        const x0 = Math.min(s.x0, s.x1), x1 = Math.max(s.x0, s.x1), y0 = Math.min(s.y0, s.y1), y1 = Math.max(s.y0, s.y1)
        setSelected(new Set(b.items.filter((it) => { const bb = bbox(it); return bb[0] < x1 && bb[2] > x0 && bb[1] < y1 && bb[3] > y0 }).map((it) => it.id)))
      }
      active = null; gesture = null; dirtyRef.current = true
    }
    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      const v = boardRef.current.view; const r = el.getBoundingClientRect()
      if (e.ctrlKey || Math.abs(e.deltaY) > 40) {
        const z = Math.max(0.1, Math.min(8, v.z * (e.deltaY < 0 ? 1.1 : 0.9)))
        const wx = (e.clientX - r.left - v.x) / v.z, wy = (e.clientY - r.top - v.y) / v.z
        setView({ z, x: e.clientX - r.left - wx * z, y: e.clientY - r.top - wy * z })
      } else setView({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY })
    }
    const leave = () => setHover(null)
    el.addEventListener('pointerdown', down); el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up)
    el.addEventListener('pointerleave', leave); el.addEventListener('wheel', wheel, { passive: false })
    const noCtx = (e: Event) => e.preventDefault(); el.addEventListener('contextmenu', noCtx)
    return () => { el.removeEventListener('pointerdown', down); el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); el.removeEventListener('pointerleave', leave); el.removeEventListener('wheel', wheel); el.removeEventListener('contextmenu', noCtx) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const toolRef = useRef(tool); toolRef.current = tool
  const styleRef = useRef({ color, size, opacity }); styleRef.current = { color, size, opacity }
  const fingerDrawRef = useRef(fingerDraw); fingerDrawRef.current = fingerDraw
  const textEditRef = useRef(textEdit); textEditRef.current = textEdit
  const erasedPreview = useRef<Set<string> | null>(null)

  const doUndo = () => { const prev = undo.current.pop(); if (!prev) return; redo.current.push(board.items); commit(prev, false); setSelected(new Set()) }
  const doRedo = () => { const next = redo.current.pop(); if (!next) return; undo.current.push(board.items); commit(next, false) }
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (textEdit) return
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); e.shiftKey ? doRedo() : doUndo() }
      else if ((e.ctrlKey || e.metaKey) && e.key === 'y') { e.preventDefault(); doRedo() }
      else if ((e.key === 'Delete' || e.key === 'Backspace') && selected.size) commit(board.items.filter((it) => !selected.has(it.id)))
    }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  })

  const exportAs = async (kind: 'png' | 'pdf') => {
    setPanel(null)
    if (!board.items.length) { toast('Nothing to export yet', 'warn'); return }
    const c = renderBoard(board, 2)
    const blob = kind === 'png' ? await new Promise<Blob>((r) => c.toBlob((b) => r(b!), 'image/png')) : await toPdf(c)
    try {
      const r = await api(`/api/save-export?ext=${kind}&name=${encodeURIComponent(board.name)}`, { method: 'PUT', body: blob })
      const j = await r.json()
      toast(`Saved on PC: ${j.file.split(/[\\/]/).pop()}`, 'success', 4000)
    } catch (e: any) { toast(e.message, 'error') }
    if (!android) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${board.name}.${kind}`; a.click() }
  }

  const fit = () => {
    const r = canvasRef.current!.getBoundingClientRect()
    if (!board.items.length) { setBoard((b) => ({ ...b, view: { x: 0, y: 0, z: 1 } })); return }
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
    for (const it of board.items) { const b = bbox(it); x0 = Math.min(x0, b[0]); y0 = Math.min(y0, b[1]); x1 = Math.max(x1, b[2]); y1 = Math.max(y1, b[3]) }
    const z = Math.min(4, Math.max(0.1, Math.min(r.width / (x1 - x0 + 80), r.height / (y1 - y0 + 80))))
    setBoard((b) => ({ ...b, view: { z, x: r.width / 2 - ((x0 + x1) / 2) * z, y: r.height / 2 - ((y0 + y1) / 2) * z } }))
  }

  const isDrawTool = ['pen', 'pencil', 'marker', 'highlighter', 'line', 'arrow', 'rect', 'ellipse', 'text'].includes(tool)
  const barTools = phone ? TOOLS.filter((t) => ['pen', 'marker', 'highlighter', 'eraser', 'rect', 'text', 'select'].includes(t.id)) : TOOLS

  return (
    <div ref={wrapRef} className="h-full w-full relative overflow-hidden" style={{ background: board.bg === 'transparent' ? 'repeating-conic-gradient(#d4d4d8 0 25%, #fff 0 50%) 50% / 20px 20px' : BG_COLOR[board.bg] }}>
      <canvas ref={canvasRef} className="draw-surface absolute inset-0 w-full h-full" style={{ cursor: tool === 'hand' ? 'grab' : tool === 'select' ? 'default' : 'crosshair' }} />
      {hover && isDrawTool && tool !== 'text' && <div className="absolute pointer-events-none rounded-full border border-black/40" style={{ left: hover.x - (size * board.view.z) / 2, top: hover.y - (size * board.view.z) / 2, width: Math.max(4, size * board.view.z), height: Math.max(4, size * board.view.z), background: color, opacity: 0.35 }} />}

      {textEdit && <TextInput pos={textEdit} color={color} size={Math.max(14, size * 5) * board.view.z} onDone={(text) => {
        if (text.trim()) commit([...board.items, { id: uid('t'), t: 'text', color, size: Math.max(14, size * 5), opacity, x: textEdit.x, y: textEdit.y, text }])
        setTextEdit(null)
      }} />}

      {/* Top-right: board + status */}
      <div className="absolute top-3 right-3 z-20 flex items-center gap-2">
        {!immersive && <span className="glass rounded-full h-10 px-3 flex items-center gap-1.5 text-[12px] text-ink-2">
          <Icon name={saveState === 'saved' ? 'CloudCheck' : saveState === 'saving' ? 'Loader' : 'Cloud'} size={14} className={saveState === 'saving' ? 'animate-spin' : ''} />
          <span className="max-w-[160px] truncate">{board.name}</span>
        </span>}
        <RoundBtn icon="FolderOpen" label="Drawings" onClick={() => setPanel('boards')} />
        <RoundBtn icon="Download" label="Export" onClick={() => setPanel(panel === 'export' ? null : 'export')} />
        <RoundBtn icon={immersive ? 'Minimize' : 'Expand'} label="Full screen" onClick={() => setImmersive(!immersive)} />
      </div>
      {panel === 'export' && (
        <div className="absolute top-16 right-3 z-30 glass rounded-2xl p-1.5 w-56 pop-in bg-[var(--bg)]/90">
          <MenuItem icon="Image" label="Export PNG" onClick={() => exportAs('png')} />
          <MenuItem icon="FileText" label="Export PDF" onClick={() => exportAs('pdf')} />
          <div className="text-[11px] text-ink-3 px-3 py-1.5">Saved to Documents\PadDeck on the PC</div>
        </div>
      )}

      {/* Toolbar */}
      {showBar ? (
        <div className={cx('absolute z-20 glass rounded-[22px] p-1.5 flex gap-1 bg-[var(--bg)]/80', phone ? 'bottom-3 left-2 right-2 flex-row overflow-x-auto no-scrollbar' : 'left-3 top-1/2 -translate-y-1/2 flex-col max-h-[94%] overflow-y-auto no-scrollbar')}>
          {barTools.map((t) => (
            <button key={t.id} title={t.label} onClick={() => { setTool(t.id); setSelected(new Set()) }}
              className={cx('tap w-11 h-11 shrink-0 rounded-2xl flex items-center justify-center', tool === t.id ? 'bg-selected' : 'text-ink')}><Icon name={t.icon} size={19} /></button>
          ))}
          <Sep phone={phone} />
          <button title="Colour" onClick={() => setPanel(panel === 'color' ? null : 'color')} className="tap w-11 h-11 shrink-0 rounded-2xl flex items-center justify-center">
            <span className="w-7 h-7 rounded-full border-2 border-white shadow" style={{ background: color }} />
          </button>
          <button title="Background" onClick={() => setPanel(panel === 'bg' ? null : 'bg')} className="tap w-11 h-11 shrink-0 rounded-2xl flex items-center justify-center text-ink"><Icon name="Grid3x3" size={19} /></button>
          <Sep phone={phone} />
          <button title="Undo" onClick={doUndo} className="tap w-11 h-11 shrink-0 rounded-2xl flex items-center justify-center text-ink"><Icon name="Undo2" size={19} /></button>
          <button title="Redo" onClick={doRedo} className="tap w-11 h-11 shrink-0 rounded-2xl flex items-center justify-center text-ink"><Icon name="Redo2" size={19} /></button>
          <button title="Fit to screen" onClick={fit} className="tap w-11 h-11 shrink-0 rounded-2xl flex items-center justify-center text-ink"><Icon name="Scan" size={19} /></button>
          {selected.size > 0 && <>
            <button title="Duplicate" onClick={() => { const copies = board.items.filter((it) => selected.has(it.id)).map((it) => ({ ...moveItem(it, 24, 24), id: uid('c') })); commit([...board.items, ...copies]); setSelected(new Set(copies.map((c) => c.id))) }} className="tap w-11 h-11 shrink-0 rounded-2xl flex items-center justify-center text-ink"><Icon name="Copy" size={19} /></button>
            <button title="Delete selection" onClick={() => { commit(board.items.filter((it) => !selected.has(it.id))); setSelected(new Set()) }} className="tap w-11 h-11 shrink-0 rounded-2xl flex items-center justify-center text-bad"><Icon name="Trash" size={19} /></button>
          </>}
          <button title="Hide toolbar" onClick={() => setShowBar(false)} className="tap w-11 h-11 shrink-0 rounded-2xl flex items-center justify-center text-ink-3"><Icon name={phone ? 'ChevronDown' : 'ChevronLeft'} size={19} /></button>
        </div>
      ) : (
        <button onClick={() => setShowBar(true)} className={cx('absolute z-20 tap glass w-11 h-11 rounded-2xl flex items-center justify-center', phone ? 'bottom-3 left-3' : 'left-3 top-1/2 -translate-y-1/2')}><Icon name="PanelLeftOpen" size={19} /></button>
      )}

      {panel === 'color' && (
        <div className={cx('absolute z-30 glass rounded-3xl p-4 w-[300px] pop-in bg-[var(--bg)]/92', phone ? 'bottom-20 left-2' : 'left-20 top-1/2 -translate-y-1/2')}>
          <div className="grid grid-cols-6 gap-2 mb-3">
            {PALETTE.map((c) => <button key={c} onClick={() => setColor(c)} className={cx('tap w-9 h-9 rounded-full border-2', color === c ? 'border-accent scale-110' : 'border-line')} style={{ background: c }} />)}
          </div>
          <div className="flex gap-2 items-center mb-3">
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="w-10 h-10 rounded-xl bg-transparent border-0 p-0" />
            <HexInput value={color} onChange={setColor} />
          </div>
          <div className="text-[12px] text-ink-2 mb-0.5">Size · {size}px</div>
          <Slider value={size} min={1} max={60} live={false} onChange={(v) => setSize(v)} className="!h-9" />
          <div className="text-[12px] text-ink-2 mb-0.5">Opacity · {Math.round(opacity * 100)}%</div>
          <Slider value={Math.round(opacity * 100)} min={5} max={100} live={false} onChange={(v) => setOpacity(v / 100)} className="!h-9" />
          <label className="flex items-center gap-2 text-[13px] mt-2"><input type="checkbox" checked={fingerDraw} onChange={(e) => setFingerDraw(e.target.checked)} className="w-4 h-4" />Draw with finger too (off = fingers pan &amp; zoom, palm rejection on)</label>
        </div>
      )}
      {panel === 'bg' && (
        <div className={cx('absolute z-30 glass rounded-3xl p-2 w-56 pop-in bg-[var(--bg)]/92', phone ? 'bottom-20 left-24' : 'left-20 top-1/2 -translate-y-1/2')}>
          {(['white', 'grid', 'dots', 'dark', 'transparent'] as Bg[]).map((b) => (
            <MenuItem key={b} icon={{ white: 'Square', grid: 'Grid3x3', dots: 'Grip', dark: 'Moon', transparent: 'SquareDashed' }[b]} label={{ white: 'Plain white', grid: 'Grid', dots: 'Dots', dark: 'Dark', transparent: 'Transparent' }[b]} active={board.bg === b}
              onClick={() => { setBoard((x) => ({ ...x, bg: b })); setSaveState('dirty'); if (b === 'dark' && color === '#111111') setColor('#ffffff'); if (b !== 'dark' && color === '#ffffff') setColor('#111111'); setPanel(null) }} />
          ))}
          <div className="h-px bg-line my-1" />
          <MenuItem icon="Trash" label="Clear canvas" danger onClick={() => { commit([]); setPanel(null) }} />
        </div>
      )}
      {panel === 'boards' && <BoardsPanel current={board} onClose={() => setPanel(null)} onOpen={(b) => { setBoard(b); undo.current = []; redo.current = []; setSelected(new Set()); lsSet('wb.last', b.id); dirtyRef.current = true; setPanel(null); setSaveState('saved') }}
        onRename={(name) => { setBoard((b) => ({ ...b, name })); setSaveState('dirty') }} onNew={() => { const b = newBoard(); setBoard(b); undo.current = []; redo.current = []; lsSet('wb.last', b.id); setSaveState('dirty'); setPanel(null) }} />}
    </div>
  )
}

const Sep = ({ phone }: { phone: boolean }) => <div className={phone ? 'w-px h-8 bg-line self-center mx-0.5 shrink-0' : 'h-px w-8 bg-line self-center my-0.5 shrink-0'} />
const RoundBtn = ({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) => (
  <button title={label} onClick={onClick} className="tap glass w-10 h-10 rounded-full flex items-center justify-center text-ink bg-[var(--bg)]/70"><Icon name={icon} size={17} /></button>
)
const MenuItem = ({ icon, label, onClick, active, danger }: { icon: string; label: string; onClick: () => void; active?: boolean; danger?: boolean }) => (
  <button onClick={onClick} className={cx('tap w-full flex items-center gap-2.5 px-3 h-11 rounded-xl text-[14px] text-left', active && 'bg-surface-2', danger && 'text-bad')}><Icon name={icon} size={17} />{label}{active && <Icon name="Check" size={15} className="ml-auto text-accent" />}</button>
)

export function HexInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [t, setT] = useState(value)
  useEffect(() => setT(value), [value])
  return <input className="field font-mono !py-2 uppercase" value={t} maxLength={7} onChange={(e) => { setT(e.target.value); if (isHex(e.target.value.startsWith('#') ? e.target.value : '#' + e.target.value)) onChange(normHex(e.target.value)) }} placeholder="#01B6BE" />
}

function TextInput({ pos, color, size, onDone }: { pos: { sx: number; sy: number }; color: string; size: number; onDone: (t: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => { setTimeout(() => ref.current?.focus(), 30) }, [])
  return (
    <textarea ref={ref} className="absolute z-30 bg-white/70 rounded-lg outline-2 outline-dashed outline-accent p-1 resize-none font-semibold"
      style={{ left: pos.sx, top: pos.sy - size, color, fontSize: size, lineHeight: 1.25, minWidth: 160, minHeight: size * 1.6 }}
      onBlur={(e) => onDone(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') onDone(''); if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onDone((e.target as HTMLTextAreaElement).value) } }} />
  )
}

function BoardsPanel({ current, onClose, onOpen, onNew, onRename }: { current: Board; onClose: () => void; onOpen: (b: Board) => void; onNew: () => void; onRename: (n: string) => void }) {
  const [list, setList] = useState<{ id: string; name: string; updated: number; thumb: string | null; count: number }[] | null>(null)
  const [name, setName] = useState(current.name)
  const load = () => api('/api/boards').then((r) => r.json()).then(setList).catch((e) => toast(e.message, 'error'))
  useEffect(() => { load() }, [])
  const sorted = useMemo(() => list || [], [list])
  return (
    <Modal open wide onClose={onClose} title="Drawings" footer={<><Btn icon="Plus" variant="accent" onClick={onNew}>New drawing</Btn></>}>
      <div className="flex gap-2 mb-4">
        <input className="field" value={name} onChange={(e) => setName(e.target.value)} />
        <Btn icon="Pencil" onClick={() => onRename(name)}>Rename current</Btn>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
        {sorted.map((b) => (
          <div key={b.id} className={cx('rounded-2xl overflow-hidden bg-surface-2', b.id === current.id && 'ring-2 ring-accent')}>
            <button className="tap block w-full aspect-[4/3] bg-white" onClick={async () => { try { onOpen(await (await api(`/api/boards/${b.id}`)).json()) } catch (e: any) { toast(e.message, 'error') } }}>
              {b.thumb ? <img src={b.thumb} alt="" className="w-full h-full object-contain" /> : <Icon name="Presentation" size={28} className="text-zinc-400 mx-auto" />}
            </button>
            <div className="flex items-center gap-1 p-2">
              <div className="flex-1 min-w-0"><div className="text-[13px] font-medium truncate">{b.name}</div><div className="text-[11px] text-ink-3">{new Date(b.updated).toLocaleString()} · {b.count} items</div></div>
              <button className="tap p-2 text-ink-3" onClick={async () => { await api(`/api/boards/${b.id}`, { method: 'DELETE' }); load() }}><Icon name="Trash" size={15} /></button>
            </div>
          </div>
        ))}
        {list && !list.length && <div className="text-ink-3 text-[13px]">No saved drawings yet – everything you draw is saved automatically.</div>}
      </div>
    </Modal>
  )
}
