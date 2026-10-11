import clsx from 'clsx'
import { Ban, Check, ChevronLeft, ChevronRight, Lock, RotateCcw } from 'lucide-react'
import { useWorkbench } from '../../stores/workbench-store'

export function ReviewToolbar() {
  const tasks = useWorkbench(s => s.tasks)
  const selection = useWorkbench(s => s.selection)
  const select = useWorkbench(s => s.select)
  const accept = useWorkbench(s => s.accept)
  const openReject = useWorkbench(s => s.openReject)
  const regenerate = useWorkbench(s => s.regenerate)
  const lock = useWorkbench(s => s.lock)

  const pending = tasks.filter(t => t.status === 'review')
  const rejected = tasks.filter(t => t.status === 'rejected')
  const current = selection.kind === 'task' ? tasks.find(t => t.id === selection.id) : undefined
  const curIdx = current ? pending.findIndex(t => t.id === current.id) : -1
  const cur = current ?? pending[0]
  const nav = (dir: 1 | -1) => {
    if (pending.length === 0) return
    const idx = curIdx >= 0 ? (curIdx + dir + pending.length) % pending.length : 0
    select({ kind: 'task', id: pending[idx].id })
  }

  return (
    <div className="glass anim-slide-up relative z-10 flex h-11 shrink-0 items-center gap-3 border-b border-border-subtle/60 px-4">
      <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-review/40 via-ai/30 to-transparent" />

      <span className="flex items-center gap-1.5 text-[12px] font-bold tracking-wide">
        <span className="breathe h-2 w-2 rounded-full bg-review" style={{ boxShadow: '0 0 8px rgba(179,102,245,.5)' }} />
        审核模式
      </span>

      {/* 统计 */}
      <div className="flex items-center gap-3 font-mono text-[10px]">
        <span className="text-text-muted">待审</span><span className="text-[13px] font-bold text-review">{pending.length}</span>
        <span className="text-border-subtle">·</span>
        <span className="text-text-muted">满意</span><span className="font-bold text-success">{tasks.filter(t => t.status === 'accepted').length}</span>
        <span className="text-border-subtle">·</span>
        <span className="text-text-muted">拒绝</span><span className="font-bold text-error">{rejected.length}</span>
        <span className="text-border-subtle">·</span>
        <span className="text-text-muted">锁定</span><span className="font-bold text-success">{tasks.filter(t => t.status === 'locked' || t.status === 'exported').length}</span>
      </div>

      <div className="h-4 w-px bg-border-subtle/60" />

      {/* 当前任务 + 导航 */}
      <div className="flex min-w-0 items-center gap-1">
        <button onClick={() => nav(-1)} title="上一个 ["
          className="btn-premium rounded-lg border border-border-subtle/50 p-1 text-text-muted hover:border-accent/40 hover:text-accent">
          <ChevronLeft size={13} />
        </button>
        <span className="max-w-[240px] truncate rounded-lg bg-bg-deep/60 px-3 py-1 text-[11px] text-text-secondary ring-1 ring-border-subtle/40">
          {cur ? `${cur.code} · ${cur.name}` : '没有待审核任务'}
        </span>
        <button onClick={() => nav(1)} title="下一个 ]"
          className="btn-premium rounded-lg border border-border-subtle/50 p-1 text-text-muted hover:border-accent/40 hover:text-accent">
          <ChevronRight size={13} />
        </button>
      </div>

      <div className="flex-1" />

      {/* 操作按钮组 */}
      <div className="flex items-center gap-1.5">
        <button disabled={!cur || cur.status !== 'review'} onClick={() => cur && accept(cur.id)}
          className="btn-premium flex items-center gap-1.5 rounded-lg border border-success/30 bg-success-soft px-3 py-1.5 text-[11px] font-semibold text-success transition-all hover:bg-success/20 disabled:opacity-25">
          <Check size={12} />接受<span className="kbd">A</span>
        </button>
        <button disabled={!cur || cur.status !== 'review'} onClick={() => cur && openReject([cur.id])}
          className="btn-premium flex items-center gap-1.5 rounded-lg border border-error/30 bg-error-soft px-3 py-1.5 text-[11px] font-semibold text-error transition-all hover:bg-error/20 disabled:opacity-25">
          <Ban size={12} />拒绝<span className="kbd">X</span>
        </button>
        <button disabled={rejected.length === 0} onClick={() => regenerate(rejected.map(t => t.id))}
          className="btn-premium flex items-center gap-1.5 rounded-lg border border-ai/30 bg-ai-soft px-3 py-1.5 text-[11px] font-semibold text-ai transition-all hover:bg-ai/20 disabled:opacity-25">
          <RotateCcw size={12} className={rejected.length ? 'animate-none' : ''} />重生成<span className="kbd">R</span>
        </button>
        <button disabled={!cur || cur.status !== 'accepted'} onClick={() => cur && lock(cur.id)}
          className="btn-premium flex items-center gap-1.5 rounded-lg border border-border-light/50 bg-white/[0.03] px-3 py-1.5 text-[11px] font-semibold text-text-secondary transition-all hover:bg-white/[0.06] disabled:opacity-25">
          <Lock size={12} />锁定<span className="kbd">L</span>
        </button>
      </div>

      <span className="font-mono text-[8px] text-text-muted">[ ] 切换 · 1-8 原因 · Shift 批量</span>
    </div>
  )
}

