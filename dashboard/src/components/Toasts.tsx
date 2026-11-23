import { useStore } from '../lib/store'
import { Icon, cx } from './ui'

export function Toasts() {
  const toasts = useStore((s) => s.toasts)
  return (
    <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[60] flex flex-col items-center gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div key={t.id} className={cx('pop-in glass rounded-2xl px-4 py-2.5 text-[13.5px] font-medium flex items-center gap-2.5 bg-[var(--bg)]/70 max-w-[80vw]')}>
          <Icon size={17} name={t.level === 'error' ? 'CircleAlert' : t.level === 'warn' ? 'TriangleAlert' : t.level === 'success' ? 'CircleCheck' : 'Info'}
            className={t.level === 'error' ? 'text-bad' : t.level === 'warn' ? 'text-warn' : t.level === 'success' ? 'text-ok' : 'text-accent'} />
          <span className="truncate">{t.text}</span>
        </div>
      ))}
    </div>
  )
}
