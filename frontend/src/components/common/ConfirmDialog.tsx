import { AlertTriangle } from 'lucide-react'
import { useWorkbench } from '../../stores/workbench-store'

export function ConfirmDialog() {
  const dialog = useWorkbench(s => s.confirmDialog)
  const setDialog = useWorkbench(s => s.setConfirmDialog)
  if (!dialog) return null
  return (
    <div className="fixed inset-0 z-[135] flex items-center justify-center bg-black/60" onMouseDown={() => setDialog(null)}>
      <div className="w-[400px] rounded-xl border border-border-subtle bg-bg-panel p-5 shadow-2xl" onMouseDown={e => e.stopPropagation()}>
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-error-soft">
            <AlertTriangle size={16} className={dialog.danger ? 'text-error' : 'text-warning'} />
          </div>
          <div>
            <div className="text-sm font-semibold">{dialog.title}</div>
            <div className="mt-1 text-[11px] leading-5 text-text-secondary">{dialog.impact}</div>
            {dialog.cost && <div className="mt-1 font-mono text-[11px] text-warning">{dialog.cost}</div>}
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={() => setDialog(null)} className="rounded-md border border-border-subtle px-3 py-1.5 text-[11px] text-text-secondary">取消</button>
          <button onClick={() => { dialog.onOk(); setDialog(null) }}
            className={`rounded-md px-3 py-1.5 text-[11px] font-medium text-white ${dialog.danger ? 'bg-error hover:bg-error/85' : 'bg-accent hover:bg-accent/85'}`}>
            确认执行
          </button>
        </div>
      </div>
    </div>
  )
}
