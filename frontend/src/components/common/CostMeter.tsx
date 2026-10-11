import { useWorkbench } from '../../stores/workbench-store'
import { fmtCost } from '../../lib/status'

export function CostMeter() {
  const project = useWorkbench(s => s.project)
  const tasks = useWorkbench(s => s.tasks)
  const estimated = tasks.reduce((a, t) => a + t.estimatedCost, 0)
  const actual = tasks.reduce((a, t) => a + t.versions.reduce((b, v) => b + v.cost, 0), 0)
  const budget = project?.budget ?? 0
  const left = Math.max(0, budget - actual)
  const ratio = budget > 0 ? actual / budget : 0
  const color = ratio >= 1 ? 'bg-error' : ratio >= 0.8 ? 'bg-warning' : 'bg-success'
  return (
    <div className="flex flex-col items-end gap-0.5">
      <div className="font-mono text-[11px] text-text-secondary">
        预计 {fmtCost(estimated)}｜已消耗 <span className="text-text-primary">{fmtCost(actual)}</span>｜预算余量 {fmtCost(left)}
      </div>
      <div className="h-1 w-44 overflow-hidden rounded-full bg-white/10">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${Math.min(100, ratio * 100)}%` }} />
      </div>
      {ratio >= 0.8 && ratio < 1 && <span className="text-[10px] text-warning">已达到预算 80%，注意控制高清任务</span>}
      {ratio >= 1 && <span className="text-[10px] text-error">已达到单次预算上限，未开始任务已暂停</span>}
    </div>
  )
}
