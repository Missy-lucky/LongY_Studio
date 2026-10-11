import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { useWorkbench } from '../../stores/workbench-store'
import { STATUS_META, TYPE_META } from '../../lib/status'
import type { TaskType } from '../../types/domain'

export function QueueTimeline() {
  const [open, setOpen] = useState(true)
  const tasks = useWorkbench(s => s.tasks)
  const select = useWorkbench(s => s.select)
  const types: TaskType[] = ['flat', 'detail', 'partial', 'model']

  return (
    <section
      className="relative z-10 flex shrink-0 flex-col"
      style={{
        height: open ? 180 : 44,
        background: 'var(--apple-bg)',
        transition: 'height 0.3s cubic-bezier(0.25,1,0.5,1)',
      }}>
      {/* 顶栏 */}
      <button
        onClick={() => setOpen(v => !v)}
        className="flex h-11 shrink-0 items-center gap-2 border-b px-5"
        style={{ borderColor: 'var(--apple-border)' }}>
        {open ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--apple-text)' }}>任务队列</span>
        <span style={{ fontSize: 12, color: 'var(--apple-text-3)' }}>
          {tasks.filter(t => t.status === 'generating').length > 0
            ? `生成中 ${tasks.filter(t => t.status === 'generating').length} ·`
            : ''}
          {' '}共 {tasks.length} 个任务
        </span>
      </button>

      {open && (
        <div className="flex flex-1 flex-col justify-center gap-2 overflow-x-auto px-6 py-3">
          {types.map(type => {
            const row = tasks.filter(t => t.type === type)
            const done = row.filter(t => ['accepted', 'locked', 'exported'].includes(t.status)).length
            return (
              <div key={type} className="flex items-center gap-4">
                {/* 类型标签 */}
                <span className="w-16 text-right" style={{ fontSize: 13, fontWeight: 500, color: 'var(--apple-text)' }}>
                  {TYPE_META[type].label}
                  <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--apple-text-3)', marginLeft: 4 }}>
                    {done}/{row.length}
                  </span>
                </span>

                {/* 进度条背景 */}
                <div className="flex h-[60px] flex-1 items-center gap-2 overflow-x-auto rounded-xl px-3"
                  style={{ background: 'var(--apple-surface)', boxShadow: 'var(--apple-shadow)' }}>
                  {row.length === 0 && (
                    <span style={{ fontSize: 12, color: 'var(--apple-text-3)', opacity: 0.5 }}>暂无任务</span>
                  )}
                  {row.map(t => {
                    const st = STATUS_META[t.status]
                    return (
                      <button key={t.id}
                        onClick={() => select({ kind: 'task', id: t.id })}
                        title={`${t.code} ${t.name}`}
                        className="group flex h-[40px] w-[130px] shrink-0 flex-col justify-center rounded-lg px-3 transition-all duration-200 hover:scale-[1.03]"
                        style={{
                          background: t.status === 'generating' ? `${st.dot}15` : 'rgba(0,0,0,0.02)',
                          borderLeft: `3px solid ${st.dot}`,
                        }}>
                        <span className="truncate" style={{ fontSize: 11, fontWeight: 500, color: 'var(--apple-text)' }}>
                          {t.name}
                        </span>
                        <span className="flex items-center gap-1.5" style={{ fontSize: 10, color: st.dot }}>
                          <span className="h-1.5 w-1.5 rounded-full" style={{ background: st.dot }} />
                          {st.label}
                          {t.status === 'generating' && <span style={{ color: 'var(--apple-text-3)' }}>· {t.code}</span>}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
