import { useEffect, useState } from 'react'
import { pair } from '../lib/store'
import { Btn, Icon } from '../components/ui'

export function Pair() {
  const [code, setCode] = useState('')
  const [name, setName] = useState('Xiaomi Pad 5')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const submit = async (c = code) => {
    if (c.length !== 6) return
    setBusy(true); setErr(null)
    try { await pair(c, name); history.replaceState(null, '', '/') } catch (e: any) { setErr(e.message) } finally { setBusy(false) }
  }

  // QR codes open http://<pc>:<port>/#pair=123456 - pair automatically.
  useEffect(() => {
    const m = /pair=(\d{6})/.exec(location.hash)
    if (m) { setCode(m[1]); submit(m[1]) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const press = (d: string) => { setErr(null); const c = (code + d).slice(0, 6); setCode(c); if (c.length === 6) submit(c) }

  return (
    <div className="h-full flex items-center justify-center p-6">
      <div className="glass panel w-full max-w-[880px] grid grid-cols-[1fr_340px] gap-10 p-10 pop-in">
        <div className="flex flex-col">
          <img src="/favicon.svg" className="w-14 h-14 mb-5" alt="" />
          <h1 className="text-[28px] font-semibold tracking-tight leading-tight">Pair with your PC</h1>
          <p className="text-ink-2 mt-2 text-[15px] leading-relaxed">Open <b className="text-ink">PadDeck Companion</b> on your Windows PC (tray icon → <i>Show pairing QR code</i>) and scan the QR code with this tablet's camera, or type the 6-digit code.</p>
          <ol className="mt-6 space-y-3 text-[14px] text-ink-2">
            {['Both devices on the same Wi-Fi network', 'Companion running on the PC', 'Code refreshes every 5 minutes and works once'].map((t, i) => (
              <li key={t} className="flex gap-3 items-center"><span className="w-7 h-7 rounded-full bg-surface-2 flex items-center justify-center text-[12px] font-semibold text-ink">{i + 1}</span>{t}</li>
            ))}
          </ol>
          <label className="mt-auto pt-6 block">
            <span className="text-[12px] text-ink-2">This tablet's name</span>
            <input className="field mt-1.5" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
        </div>
        <div className="flex flex-col items-center">
          <div className="flex gap-2 mb-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className={`w-11 h-14 rounded-2xl flex items-center justify-center text-[24px] font-semibold tabular-nums ${i === code.length ? 'ring-2 ring-accent' : ''} bg-surface-2`}>{code[i] || ''}</div>
            ))}
          </div>
          <div className="h-6 text-[13px] text-bad mb-1">{err}</div>
          <div className="grid grid-cols-3 gap-2.5 w-full">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => <button key={d} onClick={() => press(d)} className="tap h-15 rounded-2xl bg-surface-2 text-[22px] font-medium">{d}</button>)}
            <button onClick={() => { setCode(''); setErr(null) }} className="tap h-15 rounded-2xl text-ink-2 flex items-center justify-center"><Icon name="RotateCcw" size={20} /></button>
            <button onClick={() => press('0')} className="tap h-15 rounded-2xl bg-surface-2 text-[22px] font-medium">0</button>
            <button onClick={() => setCode(code.slice(0, -1))} className="tap h-15 rounded-2xl text-ink-2 flex items-center justify-center"><Icon name="Delete" size={22} /></button>
          </div>
          <Btn variant="accent" size="lg" className="w-full mt-4" disabled={busy || code.length !== 6} onClick={() => submit()} icon={busy ? 'Loader' : 'Link'}>{busy ? 'Pairing…' : 'Pair'}</Btn>
        </div>
      </div>
    </div>
  )
}
