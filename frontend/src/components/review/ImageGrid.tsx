import clsx from 'clsx'
import { useState, useMemo, useRef, useCallback } from 'react'
import { Check, Image, Layers, RefreshCw, X } from 'lucide-react'
import { useWorkbench } from '../../stores/workbench-store'
import { STATUS_META, TYPE_META } from '../../lib/status'
import { HoverActions } from '../HoverActions'
import { SkeletonCard } from '../SkeletonCard'
import type { TaskType } from '../../types/domain'

const TYPES: TaskType[] = ['flat', 'detail', 'partial', 'model']
const FILTERS = ['全部', '待审核', '满意', '不满意', '失败'] as const

export function ImageGrid() {
  const [typeTab, setTypeTab] = useState<TaskType>('flat')
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('全部')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [lastClicked, setLastClicked] = useState<string | null>(null)
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])
  const tasks = useWorkbench(s => s.tasks)
  const accept = useWorkbench(s => s.accept)
  const openReject = useWorkbench(s => s.openReject)
  const regenerate = useWorkbench(s => s.regenerate)
  const removeTask = useWorkbench(s => s.removeTask)
  const select = useWorkbench(s => s.select)
  const setLightbox = useWorkbench(s => s.setLightbox)
  const mode = useWorkbench(s => s.mode)

  const filtered = useMemo(() => {
    let list = tasks.filter(t => t.type === typeTab)
    switch (filter) {
      case '待审核': list = list.filter(t => t.status === 'review'); break
      case '满意': list = list.filter(t => ['accepted','locked','exported'].includes(t.status)); break
      case '不满意': list = list.filter(t => t.status === 'rejected'); break
      case '失败': list = list.filter(t => t.status === 'failed'); break
    }
    return list
  }, [tasks, typeTab, filter])

  const toggle = useCallback((id: string, e?: React.MouseEvent) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (e?.shiftKey && lastClicked) {
        // Shift 范围选择
        const idxs = filtered.map(t => t.id)
        const a = idxs.indexOf(lastClicked)
        const b = idxs.indexOf(id)
        if (a >= 0 && b >= 0) {
          const [start, end] = [Math.min(a,b), Math.max(a,b)]
          for (let i = start; i <= end; i++) next.add(idxs[i])
          return next
        }
      }
      if (e?.ctrlKey || e?.metaKey) {
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      }
      if (next.has(id) && next.size === 1) { next.clear(); return next }
      next.clear(); next.add(id)
      return next
    })
    setLastClicked(id)
  }, [filtered, lastClicked])

  const selectedTasks = tasks.filter(t => selectedIds.has(t.id))

  // Tab 指示条位置
  const [indicator, setIndicator] = useState({ left: 0, width: 0 })
  const updateIndicator = (idx: number) => {
    const el = tabRefs.current[idx]
    if (el) setIndicator({ left: el.offsetLeft, width: el.offsetWidth })
  }
  useState(() => setTimeout(() => updateIndicator(0), 50))

  return (
    <div className="flex h-full flex-col">
      {/* 类型 Tab + 筛选 */}
      <div className="flex items-center gap-4 px-6 pt-3 pb-1">
        <div className="tabs" ref={el => { if (el && indicator.width === 0) setTimeout(() => updateIndicator(0), 100) }}>
          {TYPES.map((t, i) => (
            <button
              key={t}
              ref={el => { tabRefs.current[i] = el; if (typeTab === t && el) setTimeout(() => updateIndicator(i), 50) }}
              onClick={() => { setTypeTab(t); updateIndicator(i) }}
              className={clsx('tab', typeTab === t && 'active')}>
              {TYPE_META[t].label}
              <span className="ml-1 text-[11px] font-normal" style={{ color: 'var(--text-3)' }}>
                {tasks.filter(x => x.type === t).length}
              </span>
            </button>
          ))}
          <div className="tab-indicator" style={indicator}/>
        </div>
        <div className="flex-1"/>
        <div className="flex gap-1">
          {FILTERS.map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={clsx('rounded-full px-3 py-1 text-xs transition-all',
                filter === f ? 'font-medium' : 'hover:opacity-70')}
              style={{
                background: filter === f ? 'var(--primary-light)' : 'transparent',
                color: filter === f ? 'var(--primary)' : 'var(--text-3)',
              }}>
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* 图片网格（错开淡入） */}
      <div key={`${typeTab}-${filter}`} className="anim-fade flex-1 overflow-y-auto px-6 pb-4 pt-2">
        {filtered.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 anim-fade">
            <span className="text-4xl" style={{ opacity: 0.15 }}>🖼️</span>
            <span className="text-sm" style={{ color: 'var(--text-3)' }}>
              {tasks.length === 0 ? '还没有任务，先生成方案' : '当前筛选下没有图片'}
            </span>
            {tasks.length === 0 && (
              <div className="flex gap-2">
                <button className="btn btn-secondary" onClick={() => useWorkbench.getState().importDemoAssets()}>
                  <Image size={13} strokeWidth={1.5}/>导入素材
                </button>
                <button className="btn btn-primary" onClick={() => useWorkbench.getState().buildPlan()}>
                  <Layers size={13} strokeWidth={1.5}/>生成方案
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
            {filtered.map((task, idx) => {
              const cur = task.versions.find(v => v.id === task.currentVersionId)
              const st = STATUS_META[task.status]
              const isSel = selectedIds.has(task.id)
              const isGenerating = task.status === 'generating'

              if (isGenerating) return <SkeletonCard key={task.id}/>

              return (
                <div key={task.id}
                  data-task-id={task.id}
                  onClick={e => { select({ kind: 'task', id: task.id }); toggle(task.id, e) }}
                  className={clsx('card group relative cursor-pointer stagger-item')}
                  style={{ animationDelay: `${idx * 25}ms` }}>
                  {/* 图片 */}
                  <div className="relative aspect-[4/5] w-full overflow-hidden" style={{ background: 'var(--bg-2)' }}>
                    {cur?.thumbnail ? (
                      <img src={cur.thumbnail} alt={task.name}
                        className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
                        draggable={false}/>
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <span className="text-xs" style={{ color: 'var(--text-3)' }}>
                          {task.status === 'failed' ? '生成失败' : '等待'}
                        </span>
                      </div>
                    )}

                    {/* 状态徽章 */}
                    <div className="absolute left-2 top-2 flex items-center gap-1 rounded-full px-2 py-0.5"
                      style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}>
                      <span className="status-dot" style={{ background: st.dot, width: 6, height: 6 }}/>
                      <span className="text-[9px] font-medium" style={{ color: st.dot }}>{st.label}</span>
                    </div>

                    {/* 失败重试 */}
                    {task.status === 'failed' && (
                      <button onClick={e => { e.stopPropagation(); regenerate([task.id]) }}
                        className="btn btn-secondary absolute inset-x-4 top-1/2 -translate-y-1/2 !py-1.5 !text-xs"
                        style={{ borderColor: 'var(--error)', color: 'var(--error)' }}>
                        <RefreshCw size={12} strokeWidth={1.5}/>重试
                      </button>
                    )}

                    {/* 勾选"不满意"遮罩 */}
                    {isSel && (
                      <div className="anim-fade absolute inset-0 flex items-center justify-center"
                        style={{ background: 'rgba(248,113,113,0.15)' }}>
                        <div className="anim-check flex h-8 w-8 items-center justify-center rounded-full"
                          style={{ background: '#F87171' }}>
                          <Check size={16} strokeWidth={3} className="text-white"/>
                        </div>
                      </div>
                    )}

                    {/* 版本号 */}
                    {cur && cur.version > 1 && (
                      <span className="absolute bottom-2 right-2 rounded px-1.5 py-0.5 font-mono text-[9px]"
                        style={{ background: 'rgba(0,0,0,0.5)', color: 'rgba(255,255,255,0.7)' }}>
                        v{cur.version}
                      </span>
                    )}

                    {/* 悬停操作条 */}
                    {mode === 'review' && task.status === 'review' && (
                      <HoverActions
                        checked={isSel}
                        onZoom={() => setLightbox({ taskId: task.id, compare: false })}
                        onRegen={() => regenerate([task.id])}
                        onToggleCheck={() => toggle(task.id)}
                        onDelete={() => removeTask(task.id)}
                      />
                    )}
                  </div>

                  {/* 底部信息 */}
                  <div className="flex items-center justify-between px-3 py-2">
                    <span className="truncate text-xs font-medium" style={{ color: 'var(--text)' }}>{task.name}</span>
                    <span className="font-mono text-[10px]" style={{ color: 'var(--text-3)' }}>{task.code}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* 批量操作栏 */}
      {selectedTasks.length > 0 && (
        <div className="anim-up flex items-center gap-2 px-6 py-2.5"
          style={{ borderTop: '1px solid var(--divider)', background: 'var(--surface)' }}>
          <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>
            已选 {selectedTasks.length} 张
          </span>
          <div className="ml-2 flex gap-1">
            <button className="btn btn-ghost !text-xs" onClick={() => setSelectedIds(new Set(filtered.map(t => t.id)))}>全选</button>
            <button className="btn btn-ghost !text-xs" onClick={() => setSelectedIds(new Set(filtered.filter(t => !selectedIds.has(t.id)).map(t => t.id)))}>反选</button>
          </div>
          <div className="flex-1"/>
          <button className="btn btn-secondary" onClick={() => { selectedTasks.forEach(t => accept(t.id)); setSelectedIds(new Set()) }}>
            <Check size={13} strokeWidth={1.5}/>满意
          </button>
          <button className="btn btn-secondary" onClick={() => { openReject(selectedTasks.map(t => t.id)); setSelectedIds(new Set()) }}>
            <X size={13} strokeWidth={1.5}/>不满意
          </button>
          <button className="btn btn-primary" onClick={() => { regenerate(selectedTasks.map(t => t.id)); setSelectedIds(new Set()) }}>
            <RefreshCw size={13} strokeWidth={1.5}/>重生成
          </button>
        </div>
      )}
    </div>
  )
}

