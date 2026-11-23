// Application library: everything PadDeck found installed on the PC (Start menu, registry,
// desktop shortcuts, install folders, Microsoft Store), searchable and filterable, with
// one-click "Add to deck".
import { useMemo, useState } from 'react'
import { activeProfile, run, send, toast, updateConfig, useLayout, useStore, type AppEntry } from '../lib/store'
import { Btn, Icon, Panel, cx } from '../components/ui'
import { AppTileIcon, appTile } from './deck/AddPanel'
import { addTile, pageTrail } from './deck/shared'

const SOURCE: Record<string, string> = { start: 'Start menu', registry: 'Installed programs', desktop: 'Desktop shortcut', folder: 'Program folder' }

export function AppsView() {
  const apps = useStore((s) => s.apps)
  const config = useStore((s) => s.config)!
  const prof = activeProfile(config)!
  const phone = useLayout() === 'phone'
  const [q, setQ] = useState('')
  const [cat, setCat] = useState<string | null>(null)
  const [target, setTarget] = useState(() => prof.pages.find((p) => !p.folder)?.id || '')
  const favs = config.favoriteApps
  const cats = useMemo(() => {
    const m = new Map<string, number>(); for (const a of apps) m.set(a.category || 'Utilities', (m.get(a.category || 'Utilities') || 0) + 1)
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [apps])
  const shown = apps.filter((a) => (!cat || (cat === '★' ? favs.includes(a.id) : (a.category || 'Utilities') === cat)) && (a.name + ' ' + (a.path || '')).toLowerCase().includes(q.toLowerCase()))
  const add = (a: AppEntry) => { if (addTile(target, appTile(a))) toast(`Added “${a.name}” to ${prof.pages.find((p) => p.id === target)?.name}`, 'success') }
  const toggleFav = (a: AppEntry) => updateConfig((c) => { c.favoriteApps = c.favoriteApps.includes(a.id) ? c.favoriteApps.filter((x) => x !== a.id) : [...c.favoriteApps, a.id] })

  return (
    <div className="h-full flex flex-col gap-[var(--gap)] min-h-0">
      <Panel className="!pb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[220px]">
            <Icon name="Search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
            <input className="field pl-9" placeholder={`Search ${apps.length} installed applications…`} value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-[13px] text-ink-2">Add to
            <select className="field !w-auto !py-2" value={target} onChange={(e) => setTarget(e.target.value)}>
              {prof.pages.map((p) => <option key={p.id} value={p.id}>{pageTrail(prof, p).map((x) => x.name).join(' › ')}</option>)}
            </select>
          </label>
          <Btn icon="RefreshCw" onClick={() => { send({ type: 'apps.list', refresh: true }); toast('Rescanning installed applications…', 'info') }}>Rescan</Btn>
        </div>
        <div className="flex gap-1.5 mt-3 overflow-x-auto no-scrollbar">
          {[[null, apps.length], ['★', favs.length], ...cats].map(([c, n]) => (
            <button key={String(c)} onClick={() => setCat(c as string | null)} className={cx('tap h-8 px-3 rounded-full text-[12.5px] shrink-0 inline-flex items-center gap-1.5', cat === c ? 'bg-selected' : 'bg-surface-2 text-ink-2')}>
              {c === null ? 'All' : c === '★' ? <><Icon name="Star" size={13} />Favourites</> : c}<span className="opacity-60">{n as number}</span>
            </button>
          ))}
        </div>
      </Panel>
      <div className="flex-1 min-h-0 overflow-y-auto thin-scroll pr-1">
        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${phone ? 260 : 300}px, 1fr))` }}>
          {shown.map((a) => (
            <div key={a.id} className="glass rounded-2xl p-3 flex items-center gap-3">
              <AppTileIcon app={a} size={40} />
              <div className="flex-1 min-w-0">
                <div className="text-[14px] font-medium truncate" title={a.name}>{a.name}</div>
                <div className="text-[11px] text-ink-3 truncate" title={a.path || a.appId || ''}>{a.category} · {a.path || SOURCE[a.source || ''] || (a.kind === 'store' ? 'Microsoft Store' : 'Start menu')}</div>
              </div>
              <button title={favs.includes(a.id) ? 'Unfavourite' : 'Favourite'} onClick={() => toggleFav(a)} className={cx('tap w-9 h-9 rounded-xl flex items-center justify-center', favs.includes(a.id) ? 'text-amber-400' : 'text-ink-3')}><Icon name="Star" size={16} fill={favs.includes(a.id) ? 'currentColor' : 'none'} /></button>
              <button title="Launch on PC" onClick={() => run({ type: 'app', appId: a.appId, path: a.path, name: a.name })} className="tap w-9 h-9 rounded-xl bg-surface-2 flex items-center justify-center"><Icon name="Play" size={15} /></button>
              <button onClick={() => add(a)} className="tap h-9 px-3 rounded-xl bg-accent text-[13px] font-medium inline-flex items-center gap-1"><Icon name="Plus" size={15} />Add</button>
            </div>
          ))}
        </div>
        {!apps.length && <div className="text-ink-3 text-[13px] p-6 text-center">Scanning the PC for installed applications…</div>}
        {apps.length > 0 && !shown.length && <div className="text-ink-3 text-[13px] p-6 text-center">No applications match.</div>}
      </div>
    </div>
  )
}
