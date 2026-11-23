import { useState } from 'react'
import { activeProfile, updateConfig, useLayout, useStore } from '../lib/store'
import { Btn, Icon, Modal, cx } from '../components/ui'
import { AudioSummary, BatteryWidget, CpuWidget, DiscordWidget, DiskWidget, FocusWidget, GpuWidget, MediaWidget, NetWidget, OtherBatteries, RamWidget, ShortcutsWidget, UptimeWidget } from './widgets'

export const WIDGETS: Record<string, { label: string; icon: string; span: number }> = {
  cpu: { label: 'CPU', icon: 'Cpu', span: 2 }, gpu: { label: 'GPU', icon: 'MonitorCog', span: 2 }, ram: { label: 'Memory', icon: 'MemoryStick', span: 2 },
  media: { label: 'YouTube Music', icon: 'Music', span: 3 }, audio: { label: 'Audio', icon: 'Speaker', span: 3 },
  mouse: { label: 'Mouse battery', icon: 'Mouse', span: 2 }, keyboard: { label: 'Keyboard battery', icon: 'Keyboard', span: 2 }, devices: { label: 'Wireless devices', icon: 'Bluetooth', span: 2 },
  disk: { label: 'Storage', icon: 'HardDrive', span: 2 }, net: { label: 'Network', icon: 'Wifi', span: 2 }, uptime: { label: 'Uptime', icon: 'Clock', span: 2 },
  focus: { label: 'Focus mode', icon: 'Target', span: 2 }, discord: { label: 'Discord & voice', icon: 'MessageCircle', span: 3 }, shortcuts: { label: 'Shortcuts', icon: 'Zap', span: 3 },
}

export function Control() {
  const pc = useStore((s) => s.pc)
  const config = useStore((s) => s.config)!
  const prof = activeProfile(config)!
  const [edit, setEdit] = useState(false)
  const phone = useLayout() === 'phone'
  if (!pc) return null
  const list = prof.widgets.filter((w) => WIDGETS[w])
  const render = (w: string) => {
    switch (w) {
      case 'cpu': return <CpuWidget pc={pc} />
      case 'gpu': return <GpuWidget pc={pc} />
      case 'ram': return <RamWidget pc={pc} />
      case 'disk': return <DiskWidget pc={pc} />
      case 'net': return <NetWidget pc={pc} />
      case 'uptime': return <UptimeWidget pc={pc} />
      case 'mouse': return <BatteryWidget kind="Mouse" />
      case 'keyboard': return <BatteryWidget kind="Keyboard" />
      case 'devices': return <OtherBatteries pc={pc} />
      case 'audio': return <AudioSummary pc={pc} />
      case 'media': return <MediaWidget />
      case 'focus': return <FocusWidget />
      case 'discord': return <DiscordWidget />
      case 'shortcuts': return <ShortcutsWidget />
    }
  }
  return (
    <div className="h-full overflow-y-auto thin-scroll pr-1">
      <div className="flex items-center mb-3">
        <h1 className={cx('text-[22px] font-semibold tracking-tight flex-1', phone && 'invisible')}>Control Centre</h1>
        <Btn size="sm" icon="LayoutDashboard" onClick={() => setEdit(true)}>Customize</Btn>
      </div>
      <div className={cx('grid gap-[var(--gap)] pb-2', phone ? 'grid-cols-1' : 'grid-cols-6')}>
        {list.map((w) => <div key={w} className="min-w-0" style={phone ? undefined : { gridColumn: `span ${WIDGETS[w].span}` }}>{render(w)}</div>)}
      </div>
      <Modal open={edit} onClose={() => setEdit(false)} title="Customize widgets" footer={<Btn variant="accent" onClick={() => setEdit(false)}>Done</Btn>}>
        <div className="space-y-1.5">
          {[...list, ...Object.keys(WIDGETS).filter((w) => !list.includes(w))].map((w) => {
            const on = list.includes(w)
            const i = list.indexOf(w)
            const mut = (fn: (l: string[]) => string[]) => updateConfig((c) => { const p = activeProfile(c)!; p.widgets = fn(p.widgets.filter((x) => WIDGETS[x])) })
            return (
              <div key={w} className={cx('flex items-center gap-3 rounded-2xl px-3 h-14', on ? 'bg-surface-2' : 'opacity-60')}>
                <Icon name={WIDGETS[w].icon} size={18} /><span className="flex-1 text-[14px]">{WIDGETS[w].label}</span>
                {on && <><button className="tap p-2" disabled={i === 0} onClick={() => mut((l) => { l.splice(i, 1); l.splice(i - 1, 0, w); return l })}><Icon name="ChevronUp" size={18} /></button>
                  <button className="tap p-2" disabled={i === list.length - 1} onClick={() => mut((l) => { l.splice(i, 1); l.splice(i + 1, 0, w); return l })}><Icon name="ChevronDown" size={18} /></button></>}
                <button className={cx('tap h-9 px-3 rounded-xl text-[12px] font-medium', on ? 'bg-bad/15 text-bad' : 'bg-accent text-white')} onClick={() => mut((l) => (on ? l.filter((x) => x !== w) : [...l, w]))}>{on ? 'Hide' : 'Show'}</button>
              </div>
            )
          })}
        </div>
      </Modal>
    </div>
  )
}
