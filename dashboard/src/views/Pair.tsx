import { useEffect, useState } from 'react'
import { android, getState, isServedByPc, pair, parsePairUrl } from '../lib/store'
import { Btn, Icon, cx } from '../components/ui'

interface FoundPc { host: string; port: number; name: string }

export function Pair() {
  const [code, setCode] = useState('')
  const [name, setName] = useState(() => (/Mobile/i.test(navigator.userAgent) ? 'Android phone' : 'Xiaomi Pad 5'))
  const [server, setServer] = useState(() => (isServedByPc ? location.origin : getState().server || ''))
  const [found, setFound] = useState<FoundPc[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const phone = window.innerWidth < 760

  const submit = async (c = code, srv = server) => {
    if (c.length !== 6) return
    setBusy(true); setErr(null)
    try { await pair(c, name, isServedByPc ? undefined : srv); if (isServedByPc) history.replaceState(null, '', '/') } catch (e: any) { setErr(e.message) } finally { setBusy(false) }
  }

  useEffect(() => {
    // QR codes open http://<pc>:<port>/#pair=123456 - pair automatically (browser).
    const m = /pair=(\d{6})/.exec(location.hash)
    if (m && isServedByPc) { setCode(m[1]); submit(m[1]) }
    // Native app: QR scan results and LAN discovery arrive as events from Kotlin.
    const h = (e: Event) => {
      const d = (e as CustomEvent).detail || {}
      if (d.type === 'qr') {
        const p = parsePairUrl(d.text || '')
        if (!p) { setErr('That QR code is not a PadDeck pairing code'); return }
        setServer(p.server); setCode(p.code); submit(p.code, p.server)
      }
      if (d.type === 'discovered') setFound(d.pcs || [])
    }
    window.addEventListener('paddeck-native', h)
    android?.discover()
    return () => window.removeEventListener('paddeck-native', h)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const press = (d: string) => { setErr(null); const c = (code + d).slice(0, 6); setCode(c); if (c.length === 6) submit(c) }

  return (
    <div className="h-full flex items-center justify-center p-4 overflow-y-auto">
      <div className={cx('glass panel w-full pop-in', phone ? 'max-w-md p-6 flex flex-col gap-6' : 'max-w-[900px] grid grid-cols-[1fr_340px] gap-10 p-10')}>
        <div className="flex flex-col">
          <img src="./favicon.svg" className="w-14 h-14 mb-5" alt="" />
          <h1 className="text-[26px] font-semibold tracking-tight leading-tight">Pair with your PC</h1>
          <p className="text-ink-2 mt-2 text-[15px] leading-relaxed">On the PC open <b className="text-ink">PadDeck Desktop</b> → <i>Pair a device</i>. {android ? 'Scan its QR code, pick your PC below, or type the 6-digit code.' : 'Scan the QR code with your camera or type the 6-digit code.'}</p>
          {android && (
            <Btn variant="accent" size="lg" icon="ScanQrCode" className="mt-5 w-full" onClick={() => android!.scanQr()}>Scan QR code</Btn>
          )}
          {!isServedByPc && (
            <div className="mt-5">
              <div className="flex items-center gap-2 text-[12px] text-ink-2 mb-2"><Icon name="Wifi" size={14} />PCs found on this network {android && <button className="tap ml-auto text-accent" onClick={() => android!.discover()}>Search again</button>}</div>
              <div className="space-y-1.5">
                {found.map((p) => {
                  const url = `http://${p.host}:${p.port}`
                  return (
                    <button key={url} onClick={() => setServer(url)} className={cx('tap w-full flex items-center gap-3 p-3 rounded-2xl text-left', server === url ? 'bg-selected' : 'bg-surface-2')}>
                      <Icon name="Monitor" size={20} /><span className="flex-1"><span className="block font-medium text-[14px]">{p.name}</span><span className="block text-[12px] opacity-70">{p.host}:{p.port}</span></span>
                      {server === url && <Icon name="Check" size={18} />}
                    </button>
                  )
                })}
                {!found.length && <div className="text-[12px] text-ink-3">{android ? 'Searching… make sure PadDeck Desktop is running.' : 'Type the address shown in PadDeck Desktop.'}</div>}
              </div>
              <label className="block mt-3"><span className="text-[12px] text-ink-2">PC address</span>
                <input className="field mt-1.5" placeholder="http://192.168.0.123:47800" value={server} onChange={(e) => setServer(e.target.value.trim())} /></label>
            </div>
          )}
          <label className="mt-4 block">
            <span className="text-[12px] text-ink-2">This device's name</span>
            <input className="field mt-1.5" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
        </div>
        <div className="flex flex-col items-center">
          <div className="flex gap-2 mb-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className={`w-11 h-14 rounded-2xl flex items-center justify-center text-[24px] font-semibold tabular-nums ${i === code.length ? 'ring-2 ring-accent' : ''} bg-surface-2`}>{code[i] || ''}</div>
            ))}
          </div>
          <div className="min-h-6 text-[13px] text-bad mb-1 text-center">{err}</div>
          <div className="grid grid-cols-3 gap-2.5 w-full">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => <button key={d} onClick={() => press(d)} className="tap h-15 rounded-2xl bg-surface-2 text-[22px] font-medium">{d}</button>)}
            <button onClick={() => { setCode(''); setErr(null) }} className="tap h-15 rounded-2xl text-ink-2 flex items-center justify-center"><Icon name="RotateCcw" size={20} /></button>
            <button onClick={() => press('0')} className="tap h-15 rounded-2xl bg-surface-2 text-[22px] font-medium">0</button>
            <button onClick={() => setCode(code.slice(0, -1))} className="tap h-15 rounded-2xl text-ink-2 flex items-center justify-center"><Icon name="Delete" size={22} /></button>
          </div>
          <Btn variant="accent" size="lg" className="w-full mt-4" disabled={busy || code.length !== 6 || (!isServedByPc && !server)} onClick={() => submit()} icon={busy ? 'Loader' : 'Link'}>{busy ? 'Pairing…' : 'Pair'}</Btn>
        </div>
      </div>
    </div>
  )
}
