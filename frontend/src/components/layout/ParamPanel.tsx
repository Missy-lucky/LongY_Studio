import { useState, useRef, useEffect } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight, Pin, PinOff, RotateCcw } from 'lucide-react'
import { useWorkbench } from '../../stores/workbench-store'

export function ParamPanel() {
  const [expanded, setExpanded] = useState(false)
  const [pinned, setPinned] = useState(false)
  const leaveTimer = useRef<ReturnType<typeof setTimeout>>()
  const selection = useWorkbench(s => s.selection)
  const tasks = useWorkbench(s => s.tasks)
  const task = selection.kind === 'task' ? tasks.find(t => t.id === selection.id) : undefined

  const open = () => {
    clearTimeout(leaveTimer.current)
    setExpanded(true)
  }
  const scheduleClose = () => {
    if (pinned) return
    clearTimeout(leaveTimer.current)
    leaveTimer.current = setTimeout(() => setExpanded(false), 2000)
  }
  useEffect(() => () => clearTimeout(leaveTimer.current), [])

  return (
    <aside
      className="param-panel relative z-10 flex shrink-0"
      style={{ width: expanded ? 280 : 8, background: expanded ? 'var(--surface)' : 'var(--bg-2)' }}
      onMouseEnter={open}
      onMouseLeave={scheduleClose}>
      {/* 收起细条 */}
      {!expanded && (
        <div className="flex h-full w-2 items-center justify-center">
          <ChevronLeft size={10} strokeWidth={1.5} style={{ color: 'var(--text-3)', opacity: 0.4 }}/>
        </div>
      )}

      {/* 展开内容 */}
      {expanded && (
        <div className="anim-fade flex w-[280px] flex-col overflow-y-auto p-4">
          {/* 顶部：收起 + 固定 */}
          <div className="mb-4 flex items-center justify-between">
            <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>参数</span>
            <div className="flex gap-1">
              <button onClick={() => setPinned(v => !v)} className="btn btn-ghost !p-1.5"
                title={pinned ? '取消固定' : '固定面板'}>
                {pinned ? <PinOff size={13} strokeWidth={1.5}/> : <Pin size={13} strokeWidth={1.5}/>}
              </button>
              {!pinned && (
                <button onClick={() => setExpanded(false)} className="btn btn-ghost !p-1.5">
                  <ChevronRight size={13} strokeWidth={1.5}/>
                </button>
              )}
            </div>
          </div>

          {task ? (
            <>
              <Group title="任务" defaultOpen>
                <Row label="编号" value={task.code}/>
                <Row label="名称" value={task.name}/>
                <Row label="状态" value={task.status}/>
                <Row label="档位" value={task.tier === 'draft' ? '草稿' : '高清'}/>
              </Group>
              <Group title="成本" defaultOpen>
                <Row label="预估" value={`¥${task.estimatedCost}`}/>
                <Row label="实际" value={`¥${task.versions.reduce((a,v) => a + v.cost, 0)}`}/>
                <Row label="缓存" value={task.cacheHit ? '命中' : '未命中'}/>
              </Group>
              <Group title="提示词" defaultOpen>
                <p className="rounded-lg p-3 text-xs leading-relaxed"
                  style={{ background: 'var(--bg-2)', color: 'var(--text-2)' }}>
                  {task.prompt}
                </p>
              </Group>
              {task.versions.length > 0 && (
                <Group title={`版本 (${task.versions.length})`} defaultOpen={false}>
                  {task.versions.map(v => (
                    <div key={v.id} className="flex items-center justify-between py-2">
                      <span className="text-sm">v{v.version}</span>
                      <span className="font-mono text-xs" style={{ color: 'var(--text-3)' }}>
                        ¥{v.cost} · {v.durationMs ? `${(v.durationMs/1000).toFixed(1)}s` : '—'}
                      </span>
                    </div>
                  ))}
                </Group>
              )}
              <Group title="高级参数" defaultOpen={false}>
                <Row label="种子" value="42"/>
                <Row label="参考权重" value="0.8"/>
                <Row label="身份一致性" value="0.7"/>
              </Group>
            </>
          ) : (
            <div className="flex h-32 items-center justify-center">
              <span className="text-sm" style={{ color: 'var(--text-3)' }}>点击图片查看详情</span>
            </div>
          )}
        </div>
      )}
    </aside>
  )
}

function Group({ title, children, defaultOpen }: { title: string; children: React.ReactNode; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="mb-4">
      <button onClick={() => setOpen(v => !v)}
        className="flex w-full items-center gap-2 pb-1 text-left">
        <ChevronDown size={12} strokeWidth={1.5}
          className="transition-transform duration-200"
          style={{ color: 'var(--text-3)', transform: open ? 'rotate(0deg)' : 'rotate(-90deg)' }}/>
        <span className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
          {title}
        </span>
      </button>
      <div style={{
        maxHeight: open ? '500px' : '0',
        opacity: open ? 1 : 0,
        transition: 'max-height 0.2s ease-out, opacity 0.2s ease-out',
        overflow: 'hidden',
      }}>
        <div className="rounded-xl p-1" style={{ background: 'var(--bg-2)' }}>
          {children}
        </div>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-3 py-2">
      <span className="text-sm" style={{ color: 'var(--text-2)' }}>{label}</span>
      <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>{value}</span>
    </div>
  )
}
