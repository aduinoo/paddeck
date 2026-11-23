import { useState } from 'react'
import { activeProfile, devicePrefs, mediaUrl, setDevicePrefs, toast, updateConfig, upload, useStore } from '../lib/store'
import type { Theme } from '../lib/types'
import { PRESETS, themeColors, type ThemeColors } from '../lib/theme'
import { Btn, Field, Icon, Panel, Segmented, Slider, Toggle, cx } from '../components/ui'
import { HexInput } from './Whiteboard'

const FONTS = ['Inter', 'system-ui', 'Segoe UI', 'Roboto', 'Georgia', 'ui-monospace']
const COLOR_FIELDS: { key: keyof ThemeColors; label: string }[] = [
  { key: 'accent', label: 'Primary accent' }, { key: 'accent2', label: 'Secondary accent' }, { key: 'selected', label: 'Selected button' },
  { key: 'bg', label: 'Background' }, { key: 'panel', label: 'Panels' }, { key: 'button', label: 'Buttons' },
  { key: 'text', label: 'Text' }, { key: 'border', label: 'Borders' },
]

export function ThemeEditor() {
  const config = useStore((s) => s.config)!
  const prefs = devicePrefs(config)
  const deviceOnly = !!prefs.themeOverride
  const t: Theme = (deviceOnly && prefs.theme) || activeProfile(config)!.theme
  const colors = themeColors(t)
  const [name, setName] = useState('')

  // Edits go to the profile theme (synced to every device and the desktop app) or, when
  // "only this device" is on, to this device's own override.
  const set = (p: Partial<Theme>) => {
    if (deviceOnly) setDevicePrefs({ theme: { ...t, ...p } })
    else updateConfig((c) => { Object.assign(activeProfile(c)!.theme, p) })
  }
  const setColor = (k: keyof ThemeColors, v: string) => set({ colors: { ...colors, [k]: v }, preset: 'custom', mode: undefined as any })
  const applyPreset = (id: string) => set({ preset: id, colors: { ...PRESETS[id].colors }, accent: PRESETS[id].colors.accent })

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-[var(--gap)]">
      <Panel title="Theme" icon="Palette" className="lg:col-span-2">
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          {Object.entries(PRESETS).map(([id, p]) => (
            <button key={id} onClick={() => applyPreset(id)} className={cx('tap rounded-2xl p-2 text-left border-2', (t as any).preset === id ? 'border-[var(--selected)]' : 'border-transparent')} style={{ background: p.colors.panel }}>
              <div className="h-12 rounded-xl mb-2 flex items-end gap-1 p-1.5" style={{ background: p.colors.bg }}>
                <span className="w-4 h-4 rounded-md" style={{ background: p.colors.accent }} /><span className="w-4 h-4 rounded-md" style={{ background: p.colors.accent2 }} /><span className="w-4 h-4 rounded-md" style={{ background: p.colors.button }} />
              </div>
              <div className="text-[13px] font-semibold" style={{ color: p.colors.text }}>{p.label}</div>
            </button>
          ))}
          <button onClick={() => set({ preset: 'custom', colors: { ...colors } })} className={cx('tap rounded-2xl p-2 text-left border-2 bg-surface-2', (t as any).preset === 'custom' ? 'border-[var(--selected)]' : 'border-transparent')}>
            <div className="h-12 rounded-xl mb-2 flex items-center justify-center" style={{ background: `conic-gradient(${colors.accent}, ${colors.accent2}, ${colors.selected}, ${colors.accent})` }}><Icon name="Pipette" size={18} className="text-white" /></div>
            <div className="text-[13px] font-semibold">Custom</div>
          </button>
        </div>
        <div className="mt-3"><Toggle on={deviceOnly} onChange={(v) => setDevicePrefs({ themeOverride: v, theme: v ? structuredClone(activeProfile(config)!.theme) : prefs.theme })} label="Use a different theme on this device only" hint="Off: theme changes sync to every paired device and the PadDeck Desktop app" /></div>
      </Panel>

      <Panel title="Colours" icon="Pipette">
        <div className="space-y-2">
          {COLOR_FIELDS.map((f) => (
            <div key={f.key} className="flex items-center gap-3">
              <label className="relative w-11 h-11 rounded-xl overflow-hidden shrink-0 border border-line cursor-pointer" style={{ background: colors[f.key] }}>
                <input type="color" value={/^#[0-9a-f]{6}$/i.test(colors[f.key]) ? colors[f.key] : '#000000'} onChange={(e) => setColor(f.key, e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer" />
              </label>
              <span className="text-[14px] flex-1">{f.label}</span>
              <div className="w-32"><HexInput value={colors[f.key]} onChange={(v) => setColor(f.key, v)} /></div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Layout & style" icon="LayoutGrid">
        <Field label="Button style"><Segmented value={t.buttonStyle} onChange={(v) => set({ buttonStyle: v })} options={[{ value: 'glass', label: 'Glass' }, { value: 'solid', label: 'Solid' }, { value: 'outline', label: 'Outline' }]} /></Field>
        <Field label={`Corner radius: ${t.radius}px`}><Slider value={t.radius} min={4} max={36} live={false} onChange={(v) => set({ radius: v })} /></Field>
        <Field label={`Spacing: ${t.gap}px`}><Slider value={t.gap} min={4} max={28} live={false} onChange={(v) => set({ gap: v })} /></Field>
        <Field label="Background">
          <div className="flex flex-wrap gap-2 items-center">
            <Segmented value={t.background.type === 'image' ? 'image' : t.background.value} onChange={(v) => v !== 'image' && set({ background: { type: v === 'solid' ? 'solid' : 'gradient', value: v } })}
              options={[{ value: 'aurora', label: 'Aurora' }, { value: 'mesh', label: 'Grid' }, { value: 'solid', label: 'Plain' }, { value: 'image', label: 'Image' }]} />
            <label className="tap h-9 px-3 rounded-xl bg-surface-2 inline-flex items-center gap-1.5 text-[13px] cursor-pointer"><Icon name="ImageUp" size={15} />Upload
              <input type="file" hidden accept="image/*" onChange={async (e) => { const f = e.target.files?.[0]; if (f) { try { set({ background: { type: 'image', value: await upload(f, 'image') } }) } catch (er: any) { toast(er.message, 'error') } } }} /></label>
            {t.background.type === 'image' && <img src={mediaUrl(t.background.value)} className="h-9 rounded-lg" alt="" />}
          </div>
        </Field>
        <Field label="Font"><select className="field" value={t.font} onChange={(e) => set({ font: e.target.value })}>{FONTS.map((f) => <option key={f}>{f}</option>)}</select></Field>
        <Toggle on={t.showLabels} onChange={(v) => set({ showLabels: v })} label="Show button labels" />
      </Panel>

      <Panel title="Saved themes" icon="Bookmark" className="lg:col-span-2">
        <div className="flex gap-2 mb-3"><input className="field" placeholder="Theme name" value={name} onChange={(e) => setName(e.target.value)} />
          <Btn icon="Save" disabled={!name} onClick={() => { updateConfig((c) => { c.themes.push({ ...structuredClone(t), name }) }); setName(''); toast('Theme saved', 'success') }}>Save current</Btn></div>
        <div className="flex flex-wrap gap-2">
          {config.themes.map((th, i) => {
            const c = themeColors(th)
            return (
              <div key={i} className="flex items-center gap-1 rounded-2xl bg-surface-2 pl-1 pr-1">
                <button className="tap flex items-center gap-2 h-11 px-2 text-[13px]" onClick={() => set(structuredClone({ ...th, name: undefined }))}>
                  <span className="w-6 h-6 rounded-full border border-line" style={{ background: `linear-gradient(135deg, ${c.bg} 50%, ${c.accent} 50%)` }} />{th.name}
                </button>
                <button className="tap p-2 text-ink-3" onClick={() => updateConfig((cfg) => { cfg.themes.splice(i, 1) })}><Icon name="X" size={14} /></button>
              </div>
            )
          })}
          {config.themes.length === 0 && <span className="text-[13px] text-ink-3">No saved themes yet.</span>}
        </div>
      </Panel>
    </div>
  )
}

export function DeviceSettings() {
  const config = useStore((s) => s.config)!
  const name = useStore((s) => s.deviceName)
  const prefs = devicePrefs(config)
  return (
    <Panel title="This device" icon="Smartphone">
      <div className="text-[13px] text-ink-2 mb-3">{name} · {window.innerWidth}×{window.innerHeight} · each phone/tablet keeps its own layout, profile and (optionally) theme.</div>
      <Field label="Layout">
        <Segmented value={prefs.layout || 'auto'} onChange={(v) => setDevicePrefs({ layout: v as any })} options={[{ value: 'auto', label: 'Automatic', icon: 'Wand2' }, { value: 'tablet', label: 'Tablet', icon: 'Tablet' }, { value: 'phone', label: 'Phone', icon: 'Smartphone' }]} />
      </Field>
      <Field label="Profile on this device">
        <select className="field" value={prefs.profileId || ''} onChange={(e) => setDevicePrefs({ profileId: e.target.value || null })}>
          <option value="">Follow the PC's active profile</option>
          {config.profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </Field>
    </Panel>
  )
}
