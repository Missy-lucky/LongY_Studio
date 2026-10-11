import { useEffect, useState } from 'react'
import clsx from 'clsx'
import { useWorkbench } from '../../stores/workbench-store'
import { Modal } from '../common/Modal'
import { REASON_META } from '../../lib/status'
import type { RejectReason } from '../../types/domain'

const ORDER: RejectReason[] = ['structure', 'color', 'background', 'composition', 'detail', 'model', 'consistency', 'style']

export function RejectReasonDialog() {
  const targetIds = useWorkbench(s => s.rejectTargetIds)
  const reject = useWorkbench(s => s.reject)
  const tasks = useWorkbench(s => s.tasks)
  const [reason, setReason] = useState<RejectReason | null>(null)
  const [note, setNote] = useState('')

  useEffect(() => { setReason(null); setNote('') }, [targetIds])

  // 数字键 1-8 快速选择拒绝原因（需求 13.3 / 17.1）
  useEffect(() => {
    if (!targetIds) return
    const h = (e: KeyboardEvent) => {
      const n = Number(e.key)
      if (n >= 1 && n <= ORDER.length) setReason(ORDER[n - 1])
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [targetIds])

  if (!targetIds) return null

  return (
    <Modal
      title="告诉系统这张图哪里不对"
      subtitle={targetIds.length > 1
        ? `批量拒绝 ${targetIds.length} 个任务：${tasks.filter(t => targetIds.includes(t.id)).map(t => t.code).join('、')}；允许事后单张修改原因`
        : '选择至少一个原因，系统会按固定修正策略重生成'}
      onClose={() => useWorkbench.setState({ rejectTargetIds: null })}
      width="max-w-xl"
      footer={
        <>
          <span className="mr-auto text-[10px] text-text-muted">数字键 1-8 快速选择 · 确认后按 R 重生成</span>
          <button onClick={() => useWorkbench.setState({ rejectTargetIds: null })} className="rounded-md border border-border-subtle px-3 py-1.5 text-[11px] text-text-secondary">取消</button>
          <button disabled={!reason} onClick={() => reason && reject(targetIds, reason, note)}
            className="rounded-md bg-error px-4 py-1.5 text-[11px] font-medium text-white hover:bg-error/85 disabled:opacity-40">
            确认拒绝{targetIds.length > 1 ? `（${targetIds.length}）` : ''}
          </button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-2">
        {ORDER.map((r, i) => (
          <button key={r} onClick={() => setReason(r)}
            className={clsx('card-hover flex flex-col items-start gap-1 rounded-xl border p-3 text-left',
              reason === r ? 'border-error/50 bg-error-soft shadow-md' : 'border-border-subtle/60 bg-bg-app/40')}>
            <span className="flex w-full items-center justify-between text-[11px] font-medium">
              {REASON_META[r].label}
              <kbd className="rounded bg-white/10 px-1 font-mono text-[9px] text-text-secondary">{i + 1}</kbd>
            </span>
            <span className="text-[10px] leading-4 text-text-secondary">{REASON_META[r].hint}</span>
          </button>
        ))}
      </div>
      <textarea
        value={note} onChange={e => setNote(e.target.value)}
        placeholder="补充说明（可选）：例如具体哪个部位变形、想要什么构图"
        className="mt-3 w-full rounded-md border border-border-subtle bg-bg-app p-2 text-[11px] outline-none placeholder:text-text-muted focus:border-accent/60"
        rows={2}
      />
    </Modal>
  )
}

