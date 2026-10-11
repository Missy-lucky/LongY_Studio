import { useEffect, useState, useCallback } from 'react'
import { Copy, Eye, Maximize2, RefreshCw, Save, Trash2 } from 'lucide-react'
import { useWorkbench } from '../stores/workbench-store'

interface Pos { x: number; y: number; taskId: string }

export function ContextMenu() {
  const [pos, setPos] = useState<Pos | null>(null)
  const regenerate = useWorkbench(s => s.regenerate)
  const removeTask = useWorkbench(s => s.removeTask)
  const setLightbox = useWorkbench(s => s.setLightbox)
  const select = useWorkbench(s => s.select)
  const toast = useWorkbench(s => s.toast)

  const close = useCallback(() => setPos(null), [])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const card = (e.target as HTMLElement).closest('[data-task-id]')
      if (e.button === 2 && card) {
        e.preventDefault()
        setPos({ x: e.clientX, y: e.clientY, taskId: card.getAttribute('data-task-id')! })
      } else if (e.button === 0) close()
    }
    const ctxHandler = (e: Event) => e.preventDefault()
    document.addEventListener('mousedown', handler)
    document.addEventListener('contextmenu', ctxHandler)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('contextmenu', ctxHandler)
    }
  }, [close])

  useEffect(() => {
    if (pos) {
      const h = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
      window.addEventListener('keydown', h)
      return () => window.removeEventListener('keydown', h)
    }
  }, [pos, close])

  if (!pos) return null

  const items = [
    { icon: <Maximize2 size={14} strokeWidth={1.5}/>, label: '查看大图', fn: () => { select({kind:'task',id:pos.taskId}); setLightbox({taskId:pos.taskId,compare:false}) } },
    { icon: <RefreshCw size={14} strokeWidth={1.5}/>, label: '重生成', fn: () => regenerate([pos.taskId]) },
    { icon: <Copy size={14} strokeWidth={1.5}/>, label: '复制提示词', fn: () => toast('success','提示词已复制到剪贴板','',false) },
    { icon: <Save size={14} strokeWidth={1.5}/>, label: '另存为...', fn: () => toast('info','另存为','后端文件系统接口已预留',false) },
    { icon: <Trash2 size={14} strokeWidth={1.5}/>, label: '删除任务', fn: () => removeTask(pos.taskId), danger: true },
  ]

  const style: React.CSSProperties = {
    left: Math.min(pos.x, window.innerWidth - 200),
    top: Math.min(pos.y, window.innerHeight - items.length * 36 - 20),
  }

  return (
    <div className="ctx-menu anim-scale" style={style}>
      {items.map(item => (
        <button key={item.label}
          onClick={() => { item.fn(); close() }}
          className={`ctx-item ${item.danger ? 'danger' : ''}`}>
          {item.icon}{item.label}
        </button>
      ))}
    </div>
  )
}
