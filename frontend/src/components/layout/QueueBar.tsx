import { useState } from 'react'
import { ChevronDown, ListTodo, RefreshCw, X } from 'lucide-react'
import { useNodeStore } from '../../stores/node-store'
import type { ShotPriority } from '../../types/domain'

interface OutputLike {
  id: string
  data: {
    taskId: string
    taskCode: string
    taskName: string
    shotName: string | null
    priority: ShotPriority | null
    imageType: 'flat' | 'partial' | 'detail' | 'model'
    status: string
    thumbnail: string | null
    cost: number
    durationMs: number | null
  }
}

const STATUS_TEXT: Record<string, { label: string; color: string }> = {
  queued: { label: '排队', color: '#A1A1AA' },
  generating: { label: '生成中', color: '#6366F1' },
  pending: { label: '待审核', color: '#F59E0B' },
  satisfied: { label: '满意', color: '#22C55E' },
  unsatisfied: { label: '不满意', color: '#EF4444' },
  failed: { label: '失败', color: '#EF4444' },
  locked: { label: '已锁定', color: '#0EA5E9' },
  saved: { label: '已保存', color: '#22C55E' },
  exported: { label: '已导出', color: '#64748B' },
}

const TASK_GROUPS = [
  { type: 'flat', label: '平面图' },
  { type: 'partial', label: '模特上身商品特写' },
  { type: 'detail', label: '细节图' },
  { type: 'model', label: '模特上身搭配展示' },
] as const

const PRIORITY_COLORS: Record<ShotPriority, string> = {
  P0: '#EF4444',
  P1: '#F59E0B',
  P2: '#64748B',
}

export function QueueBar() {
  const [expanded, setExpanded] = useState(false)
  const nodes = useNodeStore(state => state.nodes)
  const message = useNodeStore(state => state.workflowMessage)
  const regenerate = useNodeStore(state => state.regenerate)
  const removeOutput = useNodeStore(state => state.removeOutput)
  const setSelected = useNodeStore(state => state.setSelected)

  const outputs = nodes
    .filter(node => node.type === 'output')
    .map(node => node as unknown as OutputLike)
  const activeStatuses = ['queued', 'generating']
  const done = outputs.filter(task => !activeStatuses.includes(task.data.status)).length
  const generating = outputs.filter(task => task.data.status === 'generating').length
  const failed = outputs.filter(task => task.data.status === 'failed').length
  const total = outputs.length
  const cost = outputs.reduce((sum, task) => sum + task.data.cost, 0)
  const pct = total > 0 ? (done / total) * 100 : 0
  const groups = TASK_GROUPS.map(group => ({
    ...group,
    tasks: outputs.filter(task => task.data.imageType === group.type),
  }))

  return (
    <footer className="flex shrink-0 flex-col transition-all duration-300 ease-out"
      style={{ height: expanded ? 240 : 44, background: 'var(--bg)' }}>
      <div className="progress-track w-full" style={{ height: expanded ? 2 : 3 }}>
        <div className="progress-fill" style={{ width: `${pct}%` }}/>
      </div>

      <button onClick={() => setExpanded(value => !value)}
        className="flex h-11 items-center gap-4 px-6" style={{ flex: expanded ? '0 0 44px' : '1' }}>
        {expanded ? <ChevronDown size={14} strokeWidth={1.5}/> : <ListTodo size={14} strokeWidth={1.5}/>}
        <span className="text-sm" style={{ color: 'var(--text-2)' }}>
          完成 <span className="font-semibold font-mono" style={{ color: 'var(--text)' }}>{done}</span>
          <span style={{ color: 'var(--text-3)' }}>/{total}</span>
        </span>
        {generating > 0 && (
          <span className="flex items-center gap-1.5 text-sm" style={{ color: 'var(--generating)' }}>
            <span className="anim-spin inline-block h-2 w-2 rounded-full border-2 border-transparent"
              style={{ borderTopColor: 'var(--generating)'}}/>
            队列运行中 · {generating} 个
          </span>
        )}
        {failed > 0 && (
          <span className="flex items-center gap-1.5 text-sm" style={{ color: 'var(--error)' }}>
            <span className="status-dot" style={{ background: 'var(--error)'}}/>失败 {failed}
          </span>
        )}
        <span className="min-w-0 flex-1 truncate text-right text-xs" style={{ color: 'var(--text-3)' }}>{message}</span>
        <span className="text-sm font-mono" style={{ color: 'var(--text-3)' }}>¥{cost}</span>
      </button>

      {expanded && (
        <div className="anim-fade flex-1 overflow-y-auto px-6 pb-3">
          {groups.map(group => (
            <div key={group.type} className="mb-3">
              <div className="sticky top-0 z-10 mb-1 flex items-center gap-2 py-1 text-[11px] font-semibold"
                style={{ background: 'var(--bg)', color: 'var(--text-2)' }}>
                <span className="status-dot" style={{ background: 'var(--primary)'}}/>
                {group.label}
                <span style={{ color: 'var(--text-3)' }}>{group.tasks.length} 个镜头</span>
              </div>
              {group.tasks.map(task => {
                const status = STATUS_TEXT[task.data.status] ?? STATUS_TEXT.queued
                return (
                  <div key={task.id} onClick={() => setSelected(task.id)}
                    className="group flex cursor-pointer items-center gap-3 rounded-lg px-3 py-1.5 transition-colors hover:bg-[var(--surface-hover)]">
                    <div className="h-7 w-6 shrink-0 overflow-hidden rounded" style={{ background: 'var(--bg-2)' }}>
                      {task.data.thumbnail
                        ? <img src={task.data.thumbnail} alt={task.data.shotName || task.data.taskName} className="h-full w-full object-cover"/>
                        : <div className="skeleton h-full w-full"/>}
                    </div>
                    <span className="w-12 shrink-0 font-mono text-[10px]" style={{ color: 'var(--text-3)' }}>
                      {task.data.taskCode}
                    </span>
                    {task.data.priority && (
                      <span className="shrink-0 rounded px-1 py-0.5 text-[9px] font-semibold"
                        style={{
                          background: `${PRIORITY_COLORS[task.data.priority]}22`,
                          color: PRIORITY_COLORS[task.data.priority],
                        }}>
                        {task.data.priority}
                      </span>
                    )}
                    <span className="min-w-0 flex-1 truncate text-xs" style={{ color: 'var(--text)' }}>
                      {task.data.shotName || task.data.taskName}
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5 text-[11px]" style={{ color: status.color }}>
                      <span className="status-dot" style={{ background: status.color }}/>
                      {status.label}
                      {task.data.durationMs != null && (
                        <span className="font-mono" style={{ color: 'var(--text-3)' }}>
                          · {(task.data.durationMs / 1000).toFixed(1)}s
                        </span>
                      )}
                    </span>
                    {task.data.status === 'failed' && (
                      <button onClick={event => { event.stopPropagation(); void regenerate(task.id) }}
                        className="btn btn-ghost !p-1.5" title="重试">
                        <RefreshCw size={12} strokeWidth={1.5}/>
                      </button>
                    )}
                    {task.data.status === 'queued' && (
                      <button onClick={event => { event.stopPropagation(); removeOutput(task.id) }}
                        className="btn btn-ghost !p-1.5" title="从本次方案移除">
                        <X size={12} strokeWidth={1.5}/>
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
          {total === 0 && (
            <div className="py-4 text-center text-sm" style={{ color: 'var(--text-3)' }}>暂无任务</div>
          )}
        </div>
      )}
    </footer>
  )
}
