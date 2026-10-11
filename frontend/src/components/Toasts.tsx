import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react'
import clsx from 'clsx'
import { useWorkbench } from '../stores/workbench-store'

const ICONS = {
  info: <Info size={15} strokeWidth={1.5}/>,
  success: <CheckCircle2 size={15} strokeWidth={1.5}/>,
  warning: <AlertTriangle size={15} strokeWidth={1.5}/>,
  error: <XCircle size={15} strokeWidth={1.5}/>,
}
const COLORS = {
  info: 'var(--primary)',
  success: 'var(--success)',
  warning: 'var(--warning)',
  error: 'var(--error)',
}

export function Toasts() {
  const toasts = useWorkbench(s => s.toasts)
  const dismiss = useWorkbench(s => s.dismissToast)
  return (
    <div className="pointer-events-auto fixed bottom-14 right-5 z-[250] flex w-[320px] flex-col gap-2">
      {toasts.map(t => (
        <div key={t.id}
          className="toast-enter flex items-start gap-2.5 rounded-xl border p-3.5"
          style={{
            background: 'var(--surface)',
            borderColor: 'var(--border)',
            boxShadow: 'var(--shadow-lg)',
          }}>
          <span style={{ color: COLORS[t.kind], marginTop: 1 }}>{ICONS[t.kind]}</span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium" style={{ color: 'var(--text)' }}>{t.title}</div>
            {t.detail && <div className="mt-0.5 text-xs" style={{ color: 'var(--text-2)' }}>{t.detail}</div>}
            {t.hasDetail && (
              <button className="mt-1.5 text-xs font-medium" style={{ color: 'var(--primary)' }}>
                查看详情 →
              </button>
            )}
          </div>
          <button onClick={() => dismiss(t.id)} className="shrink-0" style={{ color: 'var(--text-3)' }}>
            <X size={13} strokeWidth={1.5}/>
          </button>
        </div>
      ))}
    </div>
  )
}
