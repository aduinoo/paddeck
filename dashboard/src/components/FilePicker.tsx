// Browse the PC's files and folders from the tablet/phone (read-only listing served by the
// companion) or use the native Windows picker on the PC through PadDeck Desktop.
import { useEffect, useState } from 'react'
import { ask, mediaUrl, onMessage, requestIcon, send, toast, useStore } from '../lib/store'
import { Btn, Icon, Modal, cx, fmtBytes } from './ui'

type Entry = { name: string; path: string; type: 'dir' | 'file'; ext?: string; size?: number | null; icon?: string }
const EXT_ICON: Record<string, string> = {
  exe: 'AppWindow', lnk: 'ExternalLink', url: 'Globe', bat: 'FileTerminal', cmd: 'FileTerminal', ps1: 'FileTerminal',
  png: 'FileImage', jpg: 'FileImage', jpeg: 'FileImage', gif: 'FileImage', webp: 'FileImage', psd: 'FileImage',
  mp4: 'FileVideo', mkv: 'FileVideo', mov: 'FileVideo', avi: 'FileVideo', mp3: 'FileAudio', wav: 'FileAudio', ogg: 'FileAudio', flac: 'FileAudio',
  pdf: 'FileText', doc: 'FileText', docx: 'FileText', txt: 'FileText', md: 'FileText', xlsx: 'FileSpreadsheet', csv: 'FileSpreadsheet', pptx: 'Presentation',
  zip: 'FileArchive', rar: 'FileArchive', '7z': 'FileArchive', blend: 'Box',
}

function FileIcon({ e, size = 30 }: { e: Entry; size?: number }) {
  const key = `file:${e.path}`
  const img = useStore((s) => s.icons[key])
  const wantsShell = e.type === 'file' && ['exe', 'lnk', 'url'].includes(e.ext || '')
  useEffect(() => { if (wantsShell) requestIcon(key, { path: e.path }) }, [key, wantsShell, e.path])
  if (img) return <img src={mediaUrl(img)} alt="" style={{ width: size, height: size }} className="object-contain shrink-0" />
  return <Icon name={e.icon || (e.type === 'dir' ? 'Folder' : EXT_ICON[e.ext || ''] || 'File')} size={size * 0.8} className={cx('shrink-0', e.type === 'dir' ? 'text-amber-400' : 'text-ink-2')} />
}

export function FilePicker({ open, onClose, onPick, mode = 'any', title }: { open: boolean; onClose: () => void; onPick: (path: string, type: 'dir' | 'file') => void; mode?: 'any' | 'file' | 'dir'; title?: string }) {
  const [places, setPlaces] = useState<Entry[]>([])
  const [listing, setListing] = useState<{ path: string; parent: string | null; entries: Entry[] } | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [q, setQ] = useState('')

  useEffect(() => {
    if (!open) return
    const off = onMessage((m) => {
      if (m.type !== 'fs') return
      if (m.places) setPlaces(m.places)
      if (m.listing) { setListing(m.listing); setErr(null); setQ('') }
      if (m.error) setErr(m.error)
    })
    send({ type: 'fs.places' })
    return off
  }, [open])

  const go = (p: string) => send({ type: 'fs.list', path: p })
  const pickOnPc = async () => {
    try {
      const r: any = await ask({ type: 'pc.pick', kind: mode === 'dir' ? 'folder' : 'file' }, 'pc.picked')
      if (r.error) toast(r.error, 'warn', 4000)
      else if (r.path) { onPick(r.path, mode === 'dir' ? 'dir' : 'file'); onClose() }
    } catch (e: any) { toast(e.message, 'error') }
  }

  const shown = (listing?.entries || []).filter((e) => (mode === 'dir' ? e.type === 'dir' : true) && e.name.toLowerCase().includes(q.toLowerCase()))
  return (
    <Modal open={open} wide onClose={onClose} title={title || 'Choose from your PC'} footer={<>
      <Btn icon="Monitor" className="mr-auto" onClick={pickOnPc}>Pick on PC…</Btn>
      {listing && mode !== 'file' && <Btn variant="accent" icon="FolderCheck" onClick={() => { onPick(listing.path, 'dir'); onClose() }}>Use this folder</Btn>}
    </>}>
      <div className="grid grid-cols-[180px_1fr] gap-4 min-h-[380px]">
        <div className="space-y-1">
          {places.map((p) => (
            <button key={p.path} onClick={() => go(p.path)} className={cx('tap w-full flex items-center gap-2.5 px-3 h-10 rounded-xl text-[13px] text-left', listing?.path === p.path ? 'bg-selected' : 'hover:bg-surface-2')}>
              <Icon name={p.icon || 'Folder'} size={16} />{p.name}
            </button>
          ))}
        </div>
        <div className="min-w-0 flex flex-col">
          {listing ? (
            <>
              <div className="flex items-center gap-2 mb-2">
                <button disabled={!listing.parent} onClick={() => listing.parent && go(listing.parent)} className="tap w-10 h-10 rounded-xl bg-surface-2 flex items-center justify-center disabled:opacity-30"><Icon name="ArrowUp" size={17} /></button>
                <div className="flex-1 text-[12px] text-ink-2 truncate font-mono" title={listing.path}>{listing.path}</div>
                <input className="field !w-40 !py-2" placeholder="Filter…" value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
              <div className="flex-1 overflow-y-auto thin-scroll max-h-[50vh] -mr-2 pr-2 space-y-0.5">
                {shown.map((e) => (
                  <button key={e.path} onClick={() => (e.type === 'dir' ? go(e.path) : mode !== 'dir' && (onPick(e.path, 'file'), onClose()))}
                    onDoubleClick={() => { if (e.type === 'dir' && mode !== 'file') { onPick(e.path, 'dir'); onClose() } }}
                    className="tap w-full flex items-center gap-3 px-2 h-11 rounded-xl hover:bg-surface-2 text-left">
                    <FileIcon e={e} size={28} />
                    <span className="flex-1 truncate text-[13.5px]">{e.name}</span>
                    {e.type === 'file' && <span className="text-[11px] text-ink-3 tabular-nums">{fmtBytes(e.size)}</span>}
                    {e.type === 'dir' && <Icon name="ChevronRight" size={15} className="text-ink-3" />}
                  </button>
                ))}
                {!shown.length && <div className="text-[13px] text-ink-3 p-3">Empty folder</div>}
              </div>
            </>
          ) : <div className="text-ink-3 text-[13px] p-4">Choose a location on the left. {err}</div>}
          {err && <div className="text-bad text-[12px] mt-2">{err}</div>}
        </div>
      </div>
    </Modal>
  )
}
