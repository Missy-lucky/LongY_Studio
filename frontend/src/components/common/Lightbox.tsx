import { Maximize2, X, ZoomIn } from 'lucide-react'
import { useWorkbench } from '../../stores/workbench-store'

export function Lightbox() {
  const lightbox = useWorkbench(s => s.lightbox)
  const setLightbox = useWorkbench(s => s.setLightbox)
  const tasks = useWorkbench(s => s.tasks)
  if (!lightbox) return null
  const task = tasks.find(t => t.id === lightbox.taskId)
  if (!task) return null
  const cur = task.versions.find(v => v.id === task.currentVersionId)
  const prev = task.versions.filter(v => v.id !== task.currentVersionId).at(-1)

  return (
    <div className="fixed inset-0 z-[125] flex bg-black/85" onMouseDown={() => setLightbox(null)}>
      <div className="flex flex-1 items-center justify-center gap-4 p-8" onMouseDown={e => e.stopPropagation()}>
        {cur?.thumbnail ? <img src={cur.thumbnail} alt={task.name} className="max-h-[80vh] rounded-lg object-contain shadow-2xl" /> : <div className="text-text-secondary">无结果</div>}
        {lightbox.compare && prev?.thumbnail && (
          <>
            <div className="h-[70vh] w-px bg-white/20" />
            <div className="relative">
              <img src={prev.thumbnail} alt="对比版本" className="max-h-[70vh] rounded-lg object-contain shadow-2xl" />
              <span className="absolute left-2 top-2 rounded bg-black/70 px-1.5 font-mono text-[10px] text-text-secondary">v{prev.version}</span>
            </div>
          </>
        )}
      </div>
      <aside className="flex w-64 flex-col gap-2 border-l border-white/10 bg-bg-panel p-4" onMouseDown={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold">元数据</span>
          <button onClick={() => setLightbox(null)} className="text-text-muted hover:text-text-primary"><X size={14} /></button>
        </div>
        <Meta k="任务" v={`${task.code} ${task.name}`} />
        <Meta k="当前版本" v={cur ? `v${cur.version}` : '—'} />
        <Meta k="档位" v={cur?.tier === 'hd' ? '高清' : '草稿'} />
        <Meta k="Provider" v={cur?.provider ?? '—'} />
        <Meta k="成本" v={cur ? `¥${cur.cost}` : '—'} />
        <Meta k="耗时" v={cur?.durationMs ? `${(cur.durationMs / 1000).toFixed(1)}s` : '—'} />
        <div className="mt-2 flex gap-1.5">
          <button onClick={() => setLightbox({ taskId: lightbox.taskId, compare: !lightbox.compare })}
            className="flex flex-1 items-center justify-center gap-1 rounded-md border border-border-subtle py-1.5 text-[11px] text-text-secondary hover:text-text-primary">
            <Maximize2 size={11} />{lightbox.compare ? '退出对比' : '对比 (C)'}
          </button>
        </div>
        <span className="mt-auto flex items-center gap-1 text-[10px] text-text-muted"><ZoomIn size={10} />滚轮缩放 / 100% 查看由后端预览服务提供</span>
      </aside>
    </div>
  )
}

function Meta({ k, v }: { k: string; v: string }) {
  return (
    <div className="border-b border-white/5 py-1.5">
      <div className="text-[9px] uppercase text-text-muted">{k}</div>
      <div className="mt-0.5 break-all text-[11px] text-text-secondary">{v}</div>
    </div>
  )
}
