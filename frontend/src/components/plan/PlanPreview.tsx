import clsx from 'clsx'
import { Play, Trash2 } from 'lucide-react'
import { useWorkbench } from '../../stores/workbench-store'
import { Modal } from '../common/Modal'
import { TYPE_META, fmtCost } from '../../lib/status'

export function PlanPreview() {
  const open = useWorkbench(s => s.planOpen)
  const setOpen = useWorkbench(s => s.openPlan)
  const tasks = useWorkbench(s => s.tasks)
  const items = useWorkbench(s => s.items)
  const startQueue = useWorkbench(s => s.startQueue)
  const removeTask = useWorkbench(s => s.removeTask)

  if (!open) return null
  const cached = tasks.filter(t => t.cacheHit)
  const cost = tasks.filter(t => t.status === 'planned').reduce((a, t) => a + t.estimatedCost, 0)

  return (
    <Modal
      title="生成任务方案预览"
      subtitle="生成前确认：系统不会直接扣费，可取消不需要的任务"
      onClose={() => setOpen(false)}
      width="max-w-4xl"
      footer={
        <>
          <button onClick={() => setOpen(false)} className="rounded-md border border-border-subtle px-3 py-1.5 text-[11px] text-text-secondary hover:text-text-primary">返回调整</button>
          <button onClick={startQueue}
            className="flex items-center gap-1.5 rounded-md bg-accent px-4 py-1.5 text-[11px] font-medium text-white hover:bg-accent/85">
            <Play size={12} />开始草稿生成（{tasks.filter(t => t.status !== 'cached' ? true : false).length} 个新任务）
          </button>
        </>
      }
    >
      <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-border-subtle bg-bg-app/60 px-3 py-2 text-[11px]">
        <span>本次将生成 <b className="text-accent">{tasks.filter(t => !t.cacheHit).length}</b> 个草稿任务</span>
        <span className="text-text-muted">|</span>
        <span className="text-cache">{cached.length} 个可复用缓存</span>
        <span className="text-text-muted">|</span>
        <span>预计消耗 <b className="font-mono">{fmtCost(cost)}</b></span>
        <span className="text-text-muted">|</span>
        <span className="text-text-secondary">默认低清草稿，不会一键批量高清</span>
      </div>
      <table className="w-full text-left text-[11px]">
        <thead>
          <tr className="border-b border-border-subtle text-[10px] text-text-muted">
            <th className="py-1.5 pr-2 font-medium">任务名</th>
            <th className="py-1.5 pr-2 font-medium">输入</th>
            <th className="py-1.5 pr-2 font-medium">档位</th>
            <th className="py-1.5 pr-2 font-medium">缓存</th>
            <th className="py-1.5 pr-2 font-medium">Provider</th>
            <th className="py-1.5 pr-2 font-medium">预估</th>
            <th className="py-1.5 font-medium"></th>
          </tr>
        </thead>
        <tbody>
          {tasks.map(t => (
            <tr key={t.id} className="border-b border-border-subtle/50 hover:bg-white/[0.02]">
              <td className="max-w-[220px] truncate py-1.5 pr-2">
                <span className="mr-1 font-mono text-[9px] text-text-muted">{t.code}</span>{t.name}
              </td>
              <td className="py-1.5 pr-2 text-text-secondary">{items.find(i => i.id === t.itemId)?.name ?? '—'}</td>
              <td className="py-1.5 pr-2">{t.tier === 'draft' ? '草稿' : '高清'}</td>
              <td className="py-1.5 pr-2">
                <span className={clsx(t.cacheHit ? 'text-cache' : 'text-text-muted')}>{t.cacheHit ? '命中' : '未命中'}</span>
              </td>
              <td className="py-1.5 pr-2 font-mono text-text-secondary">{t.provider}</td>
              <td className="py-1.5 pr-2 font-mono">{t.cacheHit ? '0' : fmtCost(t.estimatedCost)}</td>
              <td className="py-1.5">
                <button onClick={() => removeTask(t.id)} className="text-text-muted hover:text-error" title="移除任务"><Trash2 size={12} /></button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Modal>
  )
}

