// Second-monitor mode. A real extended desktop needs (1) a virtual display driver so Windows
// creates an additional monitor and (2) a low-latency hardware-encoded stream to the tablet.
// PadDeck reuses Apollo (open-source Sunshine fork with the SudoVDA virtual display driver,
// NVENC/AMF/QSV encoding) on the PC and Artemis / Moonlight (hardware decoding) on the tablet.
import { useEffect, useState } from 'react'
import { onMessage, run, send, useStore } from '../lib/store'
import { Btn, Icon, Panel, cx } from '../components/ui'

interface Status { apolloInstalled: boolean; sunshineInstalled: boolean; hostRunning: boolean; virtualDisplay: boolean; virtualScreens: any[]; webUi: string }

export function Display() {
  const screens = useStore((s) => s.pc?.screens || [])
  const [st, setSt] = useState<Status | null>(null)
  const [lan, setLan] = useState<{ address: string }[]>([])
  useEffect(() => {
    const off = onMessage((m) => { if (m.type === 'display') { setSt(m.status); setLan(m.lan) } })
    send({ type: 'display.status' })
    const t = setInterval(() => send({ type: 'display.status' }), 5000)
    return () => { off(); clearInterval(t) }
  }, [])

  const steps = [
    { ok: !!st?.sunshineInstalled, title: 'Install the streaming host + virtual display on the PC', text: <>Run <code className="px-1.5 py-0.5 rounded bg-surface-2">setup-second-monitor.ps1</code> from the PadDeck folder. It installs <b>Apollo</b> (includes the signed SudoVDA virtual display driver). Windows asks for administrator approval once – that is required for any display driver.</> },
    { ok: !!st?.hostRunning, title: 'Apollo running', text: <>Apollo runs as a Windows service after install. Its web UI is at <code className="px-1.5 py-0.5 rounded bg-surface-2">https://localhost:47990</code> on the PC (create the admin login on first open).</> },
    { ok: false, title: 'Install Artemis (or Moonlight) on this tablet', text: <>Artemis is the Android client made for Apollo; Moonlight also works. Both decode the stream in hardware on the Pad 5's Snapdragon 860 and pass touch and pen through.</> },
    { ok: !!st?.virtualDisplay, title: 'Connect – Windows gets a new monitor', text: <>In Artemis, add the PC ({lan[0]?.address || 'its IP'}), enter the PIN in Apollo's web UI, then start <b>Desktop</b>. Apollo creates a virtual monitor at the tablet's resolution (2560×1600 @ up to 120 Hz) that you can extend, arrange and drag windows onto in Windows Display Settings.</> },
  ]

  return (
    <div className="h-full overflow-y-auto thin-scroll p-4 pl-0">
      <div className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-[var(--gap)]">
        <Panel title="Second monitor" icon="MonitorSmartphone">
          <p className="text-[14px] text-ink-2 mb-4 leading-relaxed">A real extended Windows desktop on the Pad: Windows sees the tablet as an additional monitor (not mirroring), with hardware video encoding on your RTX 4060 (NVENC) and hardware decoding on the tablet. Wi-Fi works out of the box; for USB, enable USB tethering on the Pad and connect Artemis to the tethered IP.</p>
          <ol className="space-y-3">
            {steps.map((s, i) => (
              <li key={i} className="flex gap-3">
                <span className={cx('w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-[13px] font-semibold', s.ok ? 'bg-ok text-white' : 'bg-surface-2')}>{s.ok ? <Icon name="Check" size={16} /> : i + 1}</span>
                <div><div className="text-[14px] font-semibold">{s.title}</div><div className="text-[13px] text-ink-2 leading-relaxed mt-0.5">{s.text}</div></div>
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap gap-2 mt-5">
            <a href="intent://#Intent;package=com.limelight;S.browser_fallback_url=https%3A%2F%2Fplay.google.com%2Fstore%2Fapps%2Fdetails%3Fid%3Dcom.limelight;end" className="tap h-11 px-4 rounded-2xl bg-accent text-white inline-flex items-center gap-2 text-[14px] font-medium"><Icon name="Play" size={17} />Open Moonlight</a>
            <a href="https://github.com/ClassicOldSong/moonlight-android/releases" target="_blank" rel="noreferrer" className="tap h-11 px-4 rounded-2xl bg-surface-2 inline-flex items-center gap-2 text-[14px] font-medium"><Icon name="Download" size={17} />Get Artemis</a>
            <Btn icon="ExternalLink" onClick={() => send({ type: 'display.openHost' })}>Open Apollo on PC</Btn>
            <Btn icon="Monitor" onClick={() => run({ type: 'system', op: 'display-settings' })}>Display settings on PC</Btn>
          </div>
        </Panel>
        <div className="flex flex-col gap-[var(--gap)]">
          <Panel title="Monitors Windows sees now" icon="Monitor" right={<span className="text-[11px] text-ink-3">live</span>}>
            <div className="space-y-2">
              {screens.map((s) => {
                const virt = /virtual|idd|mtt|sudo|parsec/i.test(`${s.monitor} ${s.adapter}`)
                return (
                  <div key={s.name} className={cx('rounded-2xl p-3 flex items-center gap-3', virt ? 'bg-accent/15 ring-1 ring-accent' : 'bg-surface-2')}>
                    <Icon name={virt ? 'Tablet' : 'Monitor'} size={20} />
                    <div className="flex-1 min-w-0"><div className="text-[14px] font-medium">{s.primary ? 'Main display' : virt ? 'Pad (virtual display)' : 'Display'} · {s.width}×{s.height} @ {s.refresh} Hz</div>
                      <div className="text-[11px] text-ink-3 truncate">{s.adapter} · position {s.x}, {s.y}</div></div>
                  </div>
                )
              })}
            </div>
          </Panel>
          <Panel title="Recommended stream settings" icon="Settings2">
            <ul className="text-[13px] text-ink-2 space-y-1.5">
              <li>• Resolution 2560×1600, 60–120 FPS (Pad 5 panel is 120 Hz)</li>
              <li>• Bitrate 30–50 Mbps on 5 GHz Wi-Fi; HEVC codec</li>
              <li>• Artemis: enable “Use virtual display” and touchscreen-trackpad off (direct touch)</li>
              <li>• For pressure-sensitive drawing, use PadDeck's <b>Drawing Tablet</b> mode – it is the verified pen path; pen pass-through inside the stream depends on the Artemis/Apollo version</li>
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  )
}
