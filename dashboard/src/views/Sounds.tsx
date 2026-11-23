import { useRef, useState } from 'react'
import { activeProfile, run, send, toast, updateConfig, upload, useStore } from '../lib/store'
import type { Sound, SoundPage } from '../lib/types'
import { Btn, ColorPick, Confirm, Empty, Field, Icon, IconPicker, Modal, Slider, cx, uid } from '../components/ui'

export function Sounds() {
  const config = useStore((s) => s.config)!
  const playing = useStore((s) => s.playing)
  const prof = activeProfile(config)!
  const sb = prof.soundboard
  const [pageId, setPageId] = useState(sb.pages[0]?.id)
  const page = sb.pages.find((p) => p.id === pageId) || sb.pages[0]
  const [cat, setCat] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ sound: Sound; pageId: string } | null>(null)
  const [renaming, setRenaming] = useState<SoundPage | null>(null)
  const [drop, setDrop] = useState(false)
  const timers = useRef<Record<string, number>>({})
  const mut = (fn: (sb: typeof prof.soundboard) => void) => updateConfig((c) => fn(activeProfile(c)!.soundboard))

  const addFiles = async (files: FileList | File[]) => {
    if (!page) return
    for (const f of Array.from(files)) {
      if (!/\.(mp3|wav|ogg|m4a|flac)$/i.test(f.name)) { toast(`${f.name}: only MP3, WAV, OGG, M4A, FLAC`, 'error'); continue }
      try {
        const file = await upload(f, 'sound')
        const s: Sound = { id: uid('s'), name: f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').slice(0, 30), file, icon: 'AudioLines', color: '#7c5cff', volume: 80, category: cat || 'Custom Sounds' }
        mut((x) => { x.pages.find((p) => p.id === page.id)!.sounds.push(s) })
        toast(`Added “${s.name}”`, 'success')
      } catch (e: any) { toast(e.message, 'error') }
    }
  }

  const sounds = (page?.sounds || []).filter((s) => !cat || s.category === cat)
  const anyPlaying = Object.keys(playing).length > 0

  return (
    <div className={cx('h-full flex flex-col gap-3 rounded-[var(--radius)] transition', drop && 'ring-2 ring-accent bg-accent/5')}
      onDragOver={(e) => { e.preventDefault(); setDrop(true) }} onDragLeave={() => setDrop(false)}
      onDrop={(e) => { e.preventDefault(); setDrop(false); if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files) }}>
      <div className="flex items-center gap-2">
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar flex-1">
          {sb.pages.map((p) => (
            <button key={p.id} onClick={() => (p.id === page?.id ? setRenaming(p) : setPageId(p.id))} className={cx('tap h-11 px-4 rounded-2xl text-[14px] font-medium shrink-0 inline-flex items-center gap-2', p.id === page?.id ? 'bg-surface-2 shadow-[inset_0_0_0_1.5px_var(--accent)]' : 'text-ink-2')}>
              <Icon name="AudioLines" size={16} />{p.name}<span className="text-ink-3 text-[12px]">{p.sounds.length}</span>
            </button>
          ))}
          <button onClick={() => { const p = { id: uid('sp'), name: `Page ${sb.pages.length + 1}`, sounds: [] }; mut((x) => { x.pages.push(p) }); setPageId(p.id) }} className="tap h-11 px-3 rounded-2xl text-ink-2 inline-flex items-center gap-1.5 shrink-0"><Icon name="Plus" size={16} />Page</button>
        </div>
        <div className="glass rounded-2xl h-12 flex items-center gap-2 pl-3 pr-2 w-[260px]">
          <Icon name="Volume2" size={17} className="text-ink-2" />
          <Slider value={sb.masterVolume} onChange={(v, final) => { send({ type: 'sound.master', volume: v }); if (final) mut((x) => { x.masterVolume = v }) }} className="!h-8" />
          <span className="text-[12px] tabular-nums w-9 text-right">{sb.masterVolume}%</span>
        </div>
        <Btn variant={anyPlaying ? 'danger' : 'soft'} icon="Square" onClick={() => run({ type: 'stopSounds' }, { quiet: true })}>Stop all</Btn>
        <label className="tap h-11 px-4 rounded-2xl bg-accent text-white inline-flex items-center gap-2 text-[14px] font-medium cursor-pointer">
          <Icon name="Upload" size={17} />Add sounds
          <input type="file" accept=".mp3,.wav,.ogg,.m4a,.flac,audio/*" multiple hidden onChange={(e) => e.target.files && addFiles(e.target.files)} />
        </label>
      </div>
      <div className="flex gap-1.5 flex-wrap">
        {[null, ...sb.categories].map((c) => (
          <button key={c || 'all'} onClick={() => setCat(c)} className={cx('tap h-9 px-3.5 rounded-full text-[13px]', cat === c ? 'bg-accent text-white' : 'bg-surface-2 text-ink-2')}>{c || 'All'}</button>
        ))}
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto thin-scroll">
        {sounds.length === 0 ? (
          <Empty icon="AudioLines" title="No sounds here yet" text="Upload MP3, WAV or OGG files (or drag & drop them here). Sounds play through your PC's current audio output." />
        ) : (
          <div className="grid gap-[var(--gap)]" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
            {sounds.map((s) => {
              const isPlaying = !!playing[s.id]
              return (
                <button key={s.id}
                  onPointerDown={() => { timers.current[s.id] = window.setTimeout(() => { timers.current[s.id] = -1; navigator.vibrate?.(15); setEditing({ sound: s, pageId: page!.id }) }, 550) }}
                  onPointerUp={() => { const t = timers.current[s.id]; clearTimeout(t); if (t !== -1) run({ type: 'sound', soundId: s.id }, { quiet: true }) }}
                  onPointerLeave={() => clearTimeout(timers.current[s.id])}
                  onContextMenu={(e) => e.preventDefault()}
                  className={cx('deck-btn tap aspect-[5/4] p-3 flex flex-col items-center justify-center gap-2 text-white', isPlaying && 'ring-4 ring-white/50')}
                  style={{ background: `linear-gradient(160deg, color-mix(in oklab, ${s.color} 100%, white 10%), ${s.color})`, boxShadow: `0 12px 30px -14px ${s.color}` }}>
                  <span className="shine" />
                  <Icon name={s.icon} size={30} className={isPlaying ? 'animate-pulse' : ''} />
                  <span className="text-[13.5px] font-semibold text-center leading-tight line-clamp-2">{s.name}</span>
                  {isPlaying && (
                    <span onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => { e.stopPropagation(); run({ type: 'stopSounds', soundId: s.id }, { quiet: true }) }}
                      className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/30 flex items-center justify-center"><Icon name="Square" size={13} fill="currentColor" /></span>
                  )}
                  {isPlaying && (
                    <span onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => { e.stopPropagation(); run({ type: 'sound', soundId: s.id, restart: true }, { quiet: true }) }}
                      className="absolute top-2 left-2 w-8 h-8 rounded-full bg-black/30 flex items-center justify-center"><Icon name="RotateCcw" size={14} /></span>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>
      <div className="text-[11px] text-ink-3 text-center">Tap to play · tap again to layer · long-press to edit · plays on the PC's default output</div>
      {editing && <SoundEditor sound={editing.sound} pageId={editing.pageId} onClose={() => setEditing(null)} />}
      {renaming && <PageRename page={renaming} onClose={() => setRenaming(null)} onDelete={() => { mut((x) => { x.pages = x.pages.filter((p) => p.id !== renaming.id) }); setRenaming(null); setPageId(sb.pages[0]?.id) }} />}
    </div>
  )
}

function SoundEditor({ sound, pageId, onClose }: { sound: Sound; pageId: string; onClose: () => void }) {
  const config = useStore((s) => s.config)!
  const prof = activeProfile(config)!
  const [s, setS] = useState<Sound>(structuredClone(sound))
  const [targetPage, setTargetPage] = useState(pageId)
  const [askDel, setAskDel] = useState(false)
  const set = (x: Partial<Sound>) => setS((o) => ({ ...o, ...x }))
  const mut = (fn: (sb: typeof prof.soundboard) => void) => updateConfig((c) => fn(activeProfile(c)!.soundboard))
  const save = () => {
    mut((sb) => {
      for (const p of sb.pages) p.sounds = p.sounds.filter((x) => x.id !== s.id || p.id === targetPage)
      const p = sb.pages.find((x) => x.id === targetPage)!
      const i = p.sounds.findIndex((x) => x.id === s.id)
      if (i >= 0) p.sounds[i] = s; else p.sounds.push(s)
    })
    onClose()
  }
  return (
    <Modal open wide onClose={onClose} title="Edit sound" footer={<>
      <Btn variant="ghost" icon="Trash2" className="!text-bad mr-auto" onClick={() => setAskDel(true)}>Delete</Btn>
      <Btn onClick={onClose}>Cancel</Btn><Btn variant="accent" icon="Check" onClick={save}>Save</Btn></>}>
      <div className="grid grid-cols-2 gap-6">
        <div>
          <Field label="Name"><input className="field" value={s.name} onChange={(e) => set({ name: e.target.value })} /></Field>
          <Field label="Audio file" hint={s.file}>
            <div className="flex gap-2">
              <Btn size="sm" icon="Play" onClick={() => send({ type: 'sound.preview', file: s.file, volume: s.volume })}>Preview on PC</Btn>
              <Btn size="sm" icon="Square" onClick={() => run({ type: 'stopSounds', soundId: 'preview' }, { quiet: true })}>Stop</Btn>
              <label className="tap h-9 px-3 rounded-xl bg-surface-2 inline-flex items-center gap-1.5 text-[13px] cursor-pointer"><Icon name="Upload" size={15} />Replace
                <input type="file" hidden accept=".mp3,.wav,.ogg,.m4a,.flac,audio/*" onChange={async (e) => { const f = e.target.files?.[0]; if (f) { try { set({ file: await upload(f, 'sound') }) } catch (er: any) { toast(er.message, 'error') } } }} /></label>
            </div>
          </Field>
          <Field label={`Volume: ${s.volume}%`}><Slider value={s.volume} live={false} onChange={(v) => set({ volume: v })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Category"><select className="field" value={s.category || ''} onChange={(e) => set({ category: e.target.value })}>{prof.soundboard.categories.map((c) => <option key={c}>{c}</option>)}</select></Field>
            <Field label="Page"><select className="field" value={targetPage} onChange={(e) => setTargetPage(e.target.value)}>{prof.soundboard.pages.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
          </div>
          <Field label="Colour"><ColorPick value={s.color} onChange={(color) => set({ color })} /></Field>
        </div>
        <Field label="Icon"><IconPicker value={s.icon} onChange={(icon) => set({ icon })} /></Field>
      </div>
      <Confirm open={askDel} danger title={`Delete “${s.name}”?`} onNo={() => setAskDel(false)} onYes={() => { mut((sb) => { for (const p of sb.pages) p.sounds = p.sounds.filter((x) => x.id !== s.id) }); onClose() }} />
    </Modal>
  )
}

function PageRename({ page, onClose, onDelete }: { page: SoundPage; onClose: () => void; onDelete: () => void }) {
  const [name, setName] = useState(page.name)
  const pages = useStore((s) => activeProfile(s.config)!.soundboard.pages.length)
  return (
    <Modal open onClose={onClose} title="Soundboard page" footer={<>
      <Btn variant="ghost" icon="Trash2" className="!text-bad mr-auto" disabled={pages < 2} onClick={onDelete}>Delete page</Btn>
      <Btn variant="accent" onClick={() => { updateConfig((c) => { activeProfile(c)!.soundboard.pages.find((p) => p.id === page.id)!.name = name }); onClose() }}>Save</Btn></>}>
      <Field label="Page name"><input className="field" value={name} onChange={(e) => setName(e.target.value)} /></Field>
    </Modal>
  )
}
