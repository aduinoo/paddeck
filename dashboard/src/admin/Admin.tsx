// Companion settings page - only served on the PC itself (http://localhost:<port>/admin).
import { useEffect, useState } from 'react'
import { Btn, Icon, Panel, Toggle, cx } from '../components/ui'

const api = async (route: string, body?: any) => {
  const r = await fetch(`/api/admin/${route}`, { method: body ? 'POST' : 'GET', headers: { 'X-PadDeck-Admin': '1', 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
  const j = await r.json(); if (!r.ok) throw new Error(j.error || 'Request failed'); return j
}

export function Admin() {
  const [s, setS] = useState<any>(null)
  const [ip, setIp] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [port, setPort] = useState('')
  const load = () => api(`state${ip ? `?ip=${ip}` : ''}`).then((x) => { setS(x); setErr(null); setPort((p) => p || String(x.port)) }).catch((e) => setErr(e.message))
  useEffect(() => { load(); const t = setInterval(load, 3000); return () => clearInterval(t) }, [ip])
  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(null), 3000) }
  const act = async (route: string, body: any = {}, ok?: string) => { try { const r = await api(route, body); if (ok) flash(ok); load(); return r } catch (e: any) { flash(e.message) } }

  if (err) return <div className="p-10 text-bad">Cannot reach the companion: {err}</div>
  if (!s) return <div className="p-10 text-ink-2">Loading…</div>
  const left = Math.max(0, Math.round((s.expires - Date.now()) / 1000))

  return (
    <div className="min-h-full p-8 max-w-[1200px] mx-auto">
      <div className="app-bg" data-kind="aurora" />
      <header className="flex items-center gap-3 mb-6">
        <img src="/favicon.svg" className="w-11 h-11" alt="" />
        <div className="flex-1"><h1 className="text-[24px] font-semibold tracking-tight">PadDeck Desktop</h1><div className="text-[13px] text-ink-3">v{s.version} · {s.host} · port {s.port} · {s.helperRunning ? 'native helper running' : 'native helper NOT running'}</div></div>
        {msg && <div className="glass rounded-full px-4 py-2 text-[13px] pop-in">{msg}</div>}
        <Btn icon="RotateCcw" onClick={() => act('restart', {}, 'Restarting…')}>Restart companion</Btn>
      </header>
      <div className="grid grid-cols-[380px_1fr] gap-5">
        <div className="flex flex-col gap-5">
        <Panel title="Pair a phone or tablet" icon="QrCode">
          <div id="pair" className="bg-white rounded-2xl p-4 mx-auto w-full aspect-square" dangerouslySetInnerHTML={{ __html: s.qr }} />
          <div className="text-center mt-4">
            <div className="text-[12px] text-ink-3">or enter this code on the tablet</div>
            <div className="text-[40px] font-semibold tracking-[0.3em] tabular-nums">{s.code}</div>
            <div className="text-[12px] text-ink-3">single-use · expires in {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</div>
          </div>
          <div className="text-[13px] text-ink-2 mt-3 text-center">Tablet address: <b className="select-all">{s.pairUrl.split('#')[0]}</b></div>
          {s.addresses.length > 1 && (
            <select className="field mt-2" value={ip || ''} onChange={(e) => setIp(e.target.value || null)}>
              <option value="">Network: auto ({s.addresses[0]?.address})</option>
              {s.addresses.map((a: any) => <option key={a.address} value={a.address}>{a.name} – {a.address}</option>)}
            </select>
          )}
          <div className="flex gap-2 mt-3 justify-center"><Btn size="sm" icon="RefreshCw" onClick={() => act('rotate', {}, 'New code generated')}>New code</Btn></div>
          <div className="text-[12px] text-ink-3 mt-3 text-center">In the PadDeck Android app tap <b>Scan QR code</b>. Pair as many phones and tablets as you like.</div>
        </Panel>
        {s.apk && (
          <Panel title="Get the Android app" icon="Smartphone">
            <div className="flex gap-4 items-center">
              <div className="bg-white rounded-xl p-2 w-32 h-32 shrink-0" dangerouslySetInnerHTML={{ __html: s.apk.qr }} />
              <div className="text-[13px] text-ink-2">Scan with the phone or tablet camera to download <b>PadDeck.apk</b>, then open it to install (allow “Install unknown apps” when Android asks).<div className="text-[11px] text-ink-3 mt-2 break-all select-all">{s.apk.url}</div></div>
            </div>
          </Panel>
        )}
        </div>
        <div className="flex flex-col gap-5">
          <Panel title="Paired devices" icon="Tablet">
            {s.devices.length === 0 && <div className="text-[13px] text-ink-3">No tablets paired yet.</div>}
            <div className="space-y-2">
              {s.devices.map((d: any) => (
                <div key={d.id} className="flex items-center gap-3 rounded-2xl bg-surface-2 p-3">
                  <span className={cx('w-2.5 h-2.5 rounded-full', d.online ? 'bg-ok' : 'bg-ink-3')} />
                  <div className="flex-1"><div className="font-medium">{d.name}</div><div className="text-[12px] text-ink-3">{d.online ? 'Connected' : `Last seen ${new Date(d.lastSeen).toLocaleString()}`} · {d.lastIp} · paired {new Date(d.pairedAt).toLocaleDateString()}</div></div>
                  <Btn size="sm" variant="danger" icon="Unlink" onClick={() => act('revoke', { id: d.id }, `${d.name} removed`)}>Remove</Btn>
                </div>
              ))}
            </div>
          </Panel>
          <div className="grid grid-cols-2 gap-5">
            <Panel title="General & security" icon="Shield">
              <Toggle on={s.settings.autoStart} onChange={(v) => act('settings', { autoStart: v }, v ? 'Will start with Windows' : 'Autostart off')} label="Start with Windows" hint="Runs quietly in the tray after sign-in" />
              <Toggle on={s.settings.allowNewPairing} onChange={(v) => act('settings', { allowNewPairing: v })} label="Allow new tablets to pair" hint="Turn off once your tablet is paired" />
              <div className="flex items-end gap-2 mt-2">
                <label className="flex-1"><span className="text-[12px] text-ink-2">Network port</span><input className="field mt-1" value={port} onChange={(e) => setPort(e.target.value)} /></label>
                <Btn onClick={async () => { const r = await act('settings', { port: Number(port) }); if (r?.restartNeeded) flash('Saved – restart the companion to apply') }}>Save</Btn>
              </div>
              <div className="flex flex-wrap gap-2 mt-3">
                <Btn size="sm" icon="ShieldCheck" onClick={() => act('firewall', {}, 'Approve the Windows prompt to add the firewall rule')}>Allow through firewall</Btn>
                <Btn size="sm" icon="Bell" onClick={() => act('test-notify')}>Test notification</Btn>
              </div>
            </Panel>
            <Panel title="Folders & status" icon="FolderOpen">
              <div className="text-[12px] text-ink-3 mb-2 break-all">{s.dataDir}</div>
              <div className="flex flex-wrap gap-2 mb-3">
                {[['data', 'Data'], ['scripts', 'Approved scripts'], ['backups', 'Backups'], ['media', 'Media']].map(([w, l]) => <Btn key={w} size="sm" icon="Folder" onClick={() => act('open', { which: w })}>{l}</Btn>)}
              </div>
              <div className="text-[12px] text-ink-2">Approved scripts ({s.scripts.length}): {s.scripts.join(', ') || 'none'}</div>
              <div className="text-[12px] text-ink-2 mt-2">Second monitor: {s.display.sunshineInstalled ? `Apollo/Sunshine installed${s.display.hostRunning ? ', running' : ', not running'}` : 'not set up (run setup-second-monitor.ps1)'}{s.display.virtualDisplay ? ' · virtual display active' : ''}</div>
              <div className="text-[12px] text-ink-2 mt-1">Screens: {s.screens.map((x: any) => `${x.width}×${x.height}@${x.refresh}Hz${x.primary ? ' (main)' : ''}`).join(', ')}</div>
            </Panel>
          </div>
          <Panel title="Log" icon="ScrollText">
            <div className="font-mono text-[11.5px] max-h-72 overflow-y-auto thin-scroll bg-black/30 rounded-xl p-3 select-text">
              {[...s.logs].reverse().map((l: any, i: number) => <div key={i} className={l.level === 'error' ? 'text-bad' : l.level === 'warn' ? 'text-warn' : 'text-ink-2'}>{l.t.slice(11, 19)} {l.msg}</div>)}
            </div>
          </Panel>
        </div>
      </div>
      <div className="text-[12px] text-ink-3 mt-6 flex items-center gap-2"><Icon name="Lock" size={13} />This page is only reachable from this PC. Tablets authenticate with a per-device token; actions are validated against an allowlist.</div>
    </div>
  )
}
