import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react'
import clsx from 'clsx'
import { useWorkbench } from '../../stores/workbench-store'

const KIND = {
  info: { icon: <Info size={15} />, cls: 'text-accent', bar: 'from-accent to-ai' },
  success: { icon: <CheckCircle2 size={15} />, cls: 'text-success', bar: 'from-success to-cache' },
  warning: { icon: <AlertTriangle size={15} />, cls: 'text-warning', bar: 'from-warning to-error' },
  error: { icon: <XCircle size={15} />, cls: 'text-error', bar: 'from-error to-error' },
}

export function Toasts() {
  const toasts = useWorkbench(s => s.toasts)
  const dismiss = useWorkbench(s => s.dismissToast)
  return (
    <div className="pointer-events-auto fixed bottom-5 right-5 z-[120] flex w-[340px] flex-col gap-2.5">
      {toasts.map(t => {
        const k = KIND[t.kind]
        return (
          <div key={t.id}
            className={clsx('anim-toast-float card-float !rounded-2xl relative flex items-start gap-2.5 overflow-hidden rounded-xl p-3.5 shadow-2xl',
              t.kind === 'error' ? 'border-error/40' : t.kind === 'warning' ? 'border-warning/30' : '')}>
            <span className={clsx('mt-0.5 shrink-0', k.cls)}>{k.icon}</span>
            <div className="min-w-0 flex-1">
              <div className="text-[12px] font-semibold leading-tight">{t.title}</div>
              {t.detail && <div className="mt-1 text-[10.5px] leading-4 text-text-secondary">{t.detail}</div>}
              {t.hasDetail && <button className="mt-1.5 text-[10px] font-medium text-accent transition-colors hover:text-accent-2 hover:underline">查看详情 →</button>}
            </div>
            <button onClick={() => dismiss(t.id)} className="shrink-0 text-text-muted transition-colors hover:text-text-primary">
              <X size={13} />
            </button>
            {/* 底部自动消失进度条 */}
            <div className="absolute bottom-0 left-0 h-[2px] w-full overflow-hidden rounded-b-xl">
              <div className={clsx('h-full w-full bg-gradient-to-r', k.bar)}
                style={{ animation: 'bar-fill 4.2s linear reverse forwards' }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}


