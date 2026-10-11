import { Check, Maximize2, RefreshCw, Trash2, X } from 'lucide-react'

/** 图片悬停时底部浮出的操作条 */
export function HoverActions({
  onZoom, onRegen, onToggleCheck, onDelete, checked,
}: {
  onZoom: () => void
  onRegen: () => void
  onToggleCheck: () => void
  onDelete: () => void
  checked: boolean
}) {
  const btn = 'flex h-8 w-8 items-center justify-center rounded-lg transition-all duration-150 hover:scale-110 active:scale-95'
  return (
    <div className="hover-overlay flex items-center justify-center gap-1.5 pb-3">
      <button onClick={e => { e.stopPropagation(); onZoom() }}
        className={btn} style={{ color: 'white' }} title="查看大图">
        <Maximize2 size={16} strokeWidth={1.5}/>
      </button>
      <button onClick={e => { e.stopPropagation(); onRegen() }}
        className={btn} style={{ color: 'white' }} title="重生成">
        <RefreshCw size={16} strokeWidth={1.5}/>
      </button>
      <button onClick={e => { e.stopPropagation(); onToggleCheck() }}
        className={btn} style={{ color: checked ? '#F87171' : 'white' }}
        title={checked ? '取消标记' : '标记不满意'}>
        {checked ? <X size={16} strokeWidth={2}/> : <Check size={16} strokeWidth={1.5}/>}
      </button>
      <button onClick={e => { e.stopPropagation(); onDelete() }}
        className={btn} style={{ color: '#F8717199' }} title="删除">
        <Trash2 size={16} strokeWidth={1.5}/>
      </button>
    </div>
  )
}
