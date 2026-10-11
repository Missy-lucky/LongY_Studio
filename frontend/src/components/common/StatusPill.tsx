import clsx from 'clsx'
import type { TaskStatus } from '../../types/domain'
import { STATUS_META } from '../../lib/status'

export function StatusPill({ status, count }: { status: TaskStatus; count?: number }) {
  const m = STATUS_META[status]
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-lg border px-2 py-0.5 text-[10px] font-semibold leading-5 backdrop-blur-sm transition-transform hover:scale-105"
      style={{ borderColor: `${m.dot}33`, background: `${m.dot}10`, color: m.dot }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: m.dot, boxShadow: `0 0 6px ${m.dot}88` }} />
      {m.label}{count != null ? ` ${count}` : ''}
    </span>
  )
}
