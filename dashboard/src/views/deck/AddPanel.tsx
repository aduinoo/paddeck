// "Add tile" panel: one-click apps from the detected library, files & folders from the PC,
// folders (groups), ready-made actions and soundboard sounds.
import { useEffect, useMemo, useState } from 'react'
import { activeProfile, ask, isDesktop, mediaUrl, requestIcon, send, toast, useStore, type AppEntry } from '../../lib/store'
import type { DeckButton } from '../../lib/types'
import { Btn, Icon, cx } from '../../components/ui'
import { FilePicker } from '../../components/FilePicker'
import { addTile, createFolder } from './shared'

const baseName = (p: string) => p.split(/[\\/]/).filter(Boolean).pop()?.replace(/\.(lnk|exe|url)$/i, '') || p

export const PRESETS: { group: string; items: { label: string; icon: string; partial: Partial<DeckButton> }[] }[] = [
  { group: 'Windows', items: [
    { label: 'Lock', icon: 'Lock', partial: { action: { type: 'system', op: 'lock' } } },
    { label: 'Screenshot', icon: 'Camera', partial: { action: { type: 'system', op: 'screenshot' } } },
    { label: 'Snip', icon: 'Scissors', partial: { action: { type: 'keys', keys: ['win', 'shift', 's'] } } },
    { label: 'Task Manager', icon: 'Activity', partial: { action: { type: 'system', op: 'taskmgr' } } },
    { label: 'Explorer', icon: 'FolderOpen', partial: { action: { type: 'system', op: 'explorer' } } },
    { label: 'Settings', icon: 'Settings', partial: { action: { type: 'system', op: 'settings' } } },
    { label: 'Sleep', icon: 'Moon', partial: { action: { type: 'system', op: 'sleep' }, confirm: true } },
    { label: 'Restart', icon: 'RotateCcw', partial: { action: { type: 'system', op: 'restart' }, confirm: true, bg: '#b45309' } },
    { label: 'Shut down', icon: 'Power', partial: { action: { type: 'system', op: 'shutdown' }, confirm: true, bg: '#b91c1c' } },
  ] },
  { group: 'Shortcuts', items: [
    { label: 'Copy', icon: 'Copy', partial: { action: { type: 'keys', keys: ['ctrl', 'c'] } } },
    { label: 'Paste', icon: 'ClipboardPaste', partial: { action: { type: 'keys', keys: ['ctrl', 'v'] } } },
    { label: 'Undo', icon: 'Undo2', partial: { action: { type: 'keys', keys: ['ctrl', 'z'] } } },
    { label: 'Alt + Tab', icon: 'ArrowLeftRight', partial: { action: { type: 'keys', keys: ['alt', 'tab'] } } },
    { label: 'Show desktop', icon: 'Monitor', partial: { action: { type: 'keys', keys: ['win', 'd'] } } },
    { label: 'Custom shortcut', icon: 'Keyboard', partial: { action: { type: 'keys', keys: [] } } },
    { label: 'Macro', icon: 'ListOrdered', partial: { action: { type: 'macro', steps: [] } } },
    { label: 'Type text', icon: 'Type', partial: { action: { type: 'text', text: '' } } },
  ] },
  { group: 'Media & audio', items: [
    { label: 'Play / Pause', icon: 'Play', partial: { action: { type: 'media', action: 'toggle' }, toggle: true, bind: 'mediaPlaying', activeIcon: 'Pause', activeLabel: 'Pause' } },
    { label: 'Next', icon: 'SkipForward', partial: { action: { type: 'media', action: 'next' } } },
    { label: 'Previous', icon: 'SkipBack', partial: { action: { type: 'media', action: 'prev' } } },
    { label: 'Volume +', icon: 'Volume2', partial: { action: { type: 'volume', mode: 'up', step: 5 } } },
    { label: 'Volume −', icon: 'Volume1', partial: { action: { type: 'volume', mode: 'down', step: 5 } } },
    { label: 'Mute', icon: 'VolumeX', partial: { action: { type: 'volume', mode: 'mute' }, toggle: true, bind: 'outputMuted', activeBg: '#dc2626', activeLabel: 'Muted' } },
    { label: 'Microphone', icon: 'Mic', partial: { action: { type: 'micMute' }, toggle: true, bind: 'micMuted', bg: '#16a34a', activeBg: '#dc2626', activeIcon: 'MicOff', activeLabel: 'Mic muted' } },
    { label: 'Switch output', icon: 'Speaker', partial: { action: { type: 'output' } } },
    { label: 'Switch microphone', icon: 'Mic', partial: { action: { type: 'input' } } },
    { label: 'YouTube Music', icon: 'Music', partial: { action: { type: 'ytmusic' }, bg: '#dc2626' } },
    { label: 'Stop all sounds', icon: 'Square', partial: { action: { type: 'stopSounds' } } },
  ] },
  { group: 'Discord', items: [
    { label: 'Discord', icon: 'MessageCircle', partial: { action: { type: 'discord', op: 'launch' }, bg: '#5865f2' } },
    { label: 'Discord mute', icon: 'MicOff', partial: { action: { type: 'discord', op: 'mute' }, bg: '#4752c4' } },
    { label: 'Discord deafen', icon: 'HeadphoneOff', partial: { action: { type: 'discord', op: 'deafen' }, bg: '#4752c4' } },
  ] },
  { group: 'Navigation', items: [
    { label: 'Next page', icon: 'ChevronRight', partial: { action: { type: 'page', pageId: 'next' } } },
    { label: 'Previous page', icon: 'ChevronLeft', partial: { action: { type: 'page', pageId: 'prev' } } },
    { label: 'Back', icon: 'Undo2', partial: { action: { type: 'page', pageId: 'back' } } },
    { label: 'Switch profile', icon: 'Users', partial: { action: { type: 'profile' } } },
    { label: 'Website', icon: 'Globe', partial: { action: { type: 'url', url: 'https://' } } },
    { label: 'Focus mode', icon: 'Target', partial: { action: { type: 'focus' }, toggle: true, bind: 'focus', activeBg: '#7c5cff' } },
    { label: 'Approved script', icon: 'FileCode', partial: { action: { type: 'script' } } },
  ] },
]

export function AppTileIcon({ app, size = 34 }: { app: AppEntry; size?: number }) {
  const key = `app:${app.id}`
  const img = useStore((s) => s.icons[key])
  useEffect(() => { requestIcon(key, { appId: app.appId, path: app.path }) }, [key, app.appId, app.path])
  return img ? <img src={mediaUrl(img)} alt="" style={{ width: size, height: size }} className="object-contain shrink-0" draggable={false} />
    : <span className="rounded-lg bg-surface-2 flex items-center justify-center shrink-0" style={{ width: size, height: size }}><Icon name="AppWindow" size={size * 0.5} className="text-ink-3" /></span>
}

export const appTile = (a: AppEntry): Partial<DeckButton> => ({ label: a.name, icon: 'AppWindow', appIcon: true, action: { type: 'app', appId: a.appId, path: a.path, name: a.name } })
export const fileTile = (p: string, isDir: boolean): Partial<DeckButton> => ({ label: baseName(p), icon: isDir ? 'Folder' : 'File', fileIcon: true, action: { type: 'open', path: p, name: baseName(p) } })

export function AddPanel({ pageId, at, onAdded, onCustom, dense }: { pageId: string; at?: { x: number; y: number }; onAdded?: (id: string) => void; onCustom?: (partial: Partial<DeckButton>) => void; dense?: boolean }) {
  const apps = useStore((s) => s.apps)
  const config = useStore((s) => s.config)!
  const [tab, setTab] = useState<'apps' | 'files' | 'actions' | 'sounds'>('apps')
  const [q, setQ] = useState('')
  const [cat, setCat] = useState<string | null>(null)
  const [browse, setBrowse] = useState(false)
  const cats = useMemo(() => [...new Set(apps.map((a) => a.category || 'Utilities'))].sort(), [apps])
  const shown = apps.filter((a) => (!cat || (a.category || 'Utilities') === cat) && a.name.toLowerCase().includes(q.toLowerCase()))
  const sounds = activeProfile(config)!.soundboard.pages.flatMap((p) => p.sounds)
  const add = (partial: Partial<DeckButton>) => { const id = addTile(pageId, partial, at); if (id) { onAdded?.(id); toast(`Added “${partial.label}”`, 'success', 1400) } }
  const pickOnPc = async (kind: 'file' | 'folder') => {
    try { const r: any = await ask({ type: 'pc.pick', kind }, 'pc.picked'); if (r.error) toast(r.error, 'warn', 4000); else if (r.path) add(fileTile(r.path, kind === 'folder')) } catch (e: any) { toast(e.message, 'error') }
  }

  return (
    <div className="flex flex-col min-h-0 h-full">
      <div className="flex gap-1 p-1 rounded-2xl bg-surface-2 mb-3">
        {([['apps', 'Apps', 'AppWindow'], ['files', 'Files', 'FolderOpen'], ['actions', 'Actions', 'Zap'], ['sounds', 'Sounds', 'AudioLines']] as const).map(([id, l, ic]) => (
          <button key={id} onClick={() => setTab(id)} className={cx('tap flex-1 h-9 rounded-xl text-[13px] font-medium inline-flex items-center justify-center gap-1.5', tab === id ? 'bg-selected' : 'text-ink-2')}><Icon name={ic} size={15} />{l}</button>
        ))}
      </div>
      {tab === 'apps' && (
        <>
          <div className="flex gap-2 mb-2">
            <input className="field !py-2" placeholder={`Search ${apps.length} installed apps…`} value={q} onChange={(e) => setQ(e.target.value)} />
            <button title="Rescan installed apps" onClick={() => { send({ type: 'apps.list', refresh: true }); toast('Rescanning installed applications…', 'info') }} className="tap w-10 h-10 shrink-0 rounded-xl bg-surface-2 flex items-center justify-center"><Icon name="RefreshCw" size={16} /></button>
          </div>
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar mb-2 shrink-0">
            {[null, ...cats].map((c) => <button key={c || 'all'} onClick={() => setCat(c)} className={cx('tap h-8 px-3 rounded-full text-[12px] shrink-0', cat === c ? 'bg-selected' : 'bg-surface-2 text-ink-2')}>{c || 'All'}</button>)}
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto thin-scroll -mr-1 pr-1 space-y-0.5">
            {shown.map((a) => (
              <div key={a.id} draggable={isDesktop} onDragStart={(e) => { e.dataTransfer.setData('application/x-paddeck-tile', JSON.stringify(appTile(a))); e.dataTransfer.effectAllowed = 'copy' }}
                className="group flex items-center gap-2.5 px-2 py-1.5 rounded-xl hover:bg-surface-2 cursor-grab">
                <AppTileIcon app={a} size={dense ? 28 : 32} />
                <div className="flex-1 min-w-0"><div className="text-[13px] truncate">{a.name}</div><div className="text-[10.5px] text-ink-3 truncate">{a.category} · {a.path || (a.kind === 'store' ? 'Microsoft Store app' : 'Start menu')}</div></div>
                <button onClick={() => add(appTile(a))} className="tap h-8 px-2.5 rounded-lg bg-accent text-[12px] font-medium inline-flex items-center gap-1"><Icon name="Plus" size={14} />Add</button>
              </div>
            ))}
            {!apps.length && <div className="text-[13px] text-ink-3 p-3">Scanning installed applications…</div>}
          </div>
        </>
      )}
      {tab === 'files' && (
        <div className="space-y-2">
          <p className="text-[13px] text-ink-2">Any file or folder on the PC: project folders, documents, PDFs, images, videos, scripts or programs. The tile shows its Windows icon and opens it with its default app.</p>
          {isDesktop ? (
            <div className="grid grid-cols-2 gap-2">
              <Btn icon="FolderPlus" onClick={() => pickOnPc('folder')}>Add a folder…</Btn>
              <Btn icon="FilePlus" onClick={() => pickOnPc('file')}>Add a file…</Btn>
            </div>
          ) : <Btn icon="FolderSearch" className="w-full" onClick={() => setBrowse(true)}>Browse the PC…</Btn>}
          {isDesktop && <Btn variant="ghost" icon="FolderSearch" className="w-full" onClick={() => setBrowse(true)}>Browse with PadDeck instead</Btn>}
          <FilePicker open={browse} onClose={() => setBrowse(false)} onPick={(p, t) => add(fileTile(p, t === 'dir'))} />
        </div>
      )}
      {tab === 'actions' && (
        <div className="flex-1 min-h-0 overflow-y-auto thin-scroll -mr-1 pr-1">
          <button onClick={() => { const name = 'Folder'; createFolder(pageId, name, at); toast('Folder created – drag tiles onto it', 'success') }} className="tap w-full flex items-center gap-3 p-3 rounded-2xl bg-surface-2 mb-3 text-left">
            <span className="w-10 h-10 rounded-xl bg-slate-600 text-white flex items-center justify-center"><Icon name="FolderPlus" size={19} /></span>
            <span><span className="block text-[14px] font-medium">Folder</span><span className="block text-[12px] text-ink-3">Group tiles behind one button</span></span>
          </button>
          {onCustom && <button onClick={() => onCustom({ label: 'New button', icon: 'Sparkles', action: { type: 'keys', keys: [] } })} className="tap w-full flex items-center gap-3 p-3 rounded-2xl bg-surface-2 mb-3 text-left">
            <span className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center"><Icon name="Sparkles" size={19} /></span>
            <span><span className="block text-[14px] font-medium">Custom button</span><span className="block text-[12px] text-ink-3">Start blank and choose any action</span></span>
          </button>}
          {PRESETS.map((g) => (
            <div key={g.group} className="mb-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-3 mb-1.5">{g.group}</div>
              <div className={cx('grid gap-1.5', dense ? 'grid-cols-2' : 'grid-cols-3')}>
                {g.items.map((it) => (
                  <button key={it.label} draggable={isDesktop} onDragStart={(e) => { e.dataTransfer.setData('application/x-paddeck-tile', JSON.stringify({ label: it.label, icon: it.icon, ...it.partial })) }}
                    onClick={() => add({ label: it.label, icon: it.icon, ...it.partial })} className="tap flex items-center gap-2 px-2.5 h-10 rounded-xl bg-surface-2 text-[12.5px] text-left">
                    <Icon name={it.icon} size={16} className="shrink-0" /><span className="truncate">{it.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      {tab === 'sounds' && (
        <div className="flex-1 min-h-0 overflow-y-auto thin-scroll space-y-1">
          {sounds.map((s) => (
            <div key={s.id} className="flex items-center gap-2.5 px-2 py-1.5 rounded-xl hover:bg-surface-2">
              <span className="w-8 h-8 rounded-lg flex items-center justify-center text-white" style={{ background: s.color }}>{s.emoji || <Icon name={s.icon} size={15} />}</span>
              <span className="flex-1 text-[13px] truncate">{s.name}</span>
              <button onClick={() => add({ label: s.name, icon: s.icon, emoji: s.emoji, bg: s.color, action: { type: 'sound', soundId: s.id } })} className="tap h-8 px-2.5 rounded-lg bg-accent text-[12px] font-medium inline-flex items-center gap-1"><Icon name="Plus" size={14} />Add</button>
            </div>
          ))}
          {!sounds.length && <div className="text-[13px] text-ink-3 p-3">Upload sounds in the Soundboard first.</div>}
        </div>
      )}
    </div>
  )
}
