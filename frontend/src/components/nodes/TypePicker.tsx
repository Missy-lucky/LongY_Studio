import { useCallback, useEffect, useState } from 'react'
import { Plus, Search } from 'lucide-react'
import { useNodeStore } from '../../stores/node-store'
import { CATEGORIES_BY_GROUP, MODEL_STYLES } from '../../data/preset-categories'

export function TypePicker() {
  const open = useNodeStore(s => s.typePickerOpen)
  const setOpen = useNodeStore(s => s.setTypePickerOpen)
  const addInputNode = useNodeStore(s => s.addInputNode)
  const changeNodeType = useNodeStore(s => s.changeNodeType)
  const changeTypeTargetNodeId = useNodeStore(s => s.changeTypeTargetNodeId)
  const setChangeTypeTargetNodeId = useNodeStore(s => s.setChangeTypeTargetNodeId)
  const closePicker = useCallback(() => setChangeTypeTargetNodeId(null), [setChangeTypeTargetNodeId])
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closePicker()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, closePicker])

  if (!open) return null

  const groups = Object.entries(CATEGORIES_BY_GROUP)
  const filtered = query
    ? groups.map(([g, items]) => [g, items.filter(c => c.name.includes(query))] as const).filter(([,items]) => items.length > 0)
    : groups

  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center pb-8"
      style={{ background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(4px)' }}
      onMouseDown={() => closePicker()}>
      <div className="anim-up w-[480px] overflow-hidden rounded-2xl border"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-lg)' }}
        onMouseDown={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b px-4 py-3" style={{ borderColor: 'var(--divider)' }}>
          <Search size={16} strokeWidth={1.5} style={{ color: 'var(--text-3)' }}/>
          <input value={query} onChange={e => setQuery(e.target.value)}
            placeholder="搜索穿搭部位类型..."
            className="flex-1 bg-transparent text-sm outline-none" style={{ color: 'var(--text)' }}/>
          <button onClick={() => closePicker()} className="kbd !min-h-[28px] !min-w-[40px] cursor-pointer transition-colors hover:bg-[var(--surface-hover)]" title="关闭 (Esc)">Esc</button>
        </div>
        <div className="max-h-[400px] overflow-y-auto p-3">
          {filtered.map(([group, items]) => (
            <div key={group} className="mb-3">
              <div className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-3)' }}>
                {group}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {items.map(c => (
                  <button key={c.id}
                    onClick={() => {
                      if (changeTypeTargetNodeId) changeNodeType(changeTypeTargetNodeId, c.id)
                      else addInputNode(c.id)
                      setQuery('')
                    }}
                    className="btn btn-secondary !min-h-[34px] !rounded-lg !text-xs">
                    <Plus size={11} strokeWidth={1.5}/>{c.name}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <div className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-3)' }}>
            自定义
          </div>
          <button className="btn btn-ghost w-full !rounded-lg border border-dashed !py-2 !text-xs"
            style={{ borderColor: 'var(--border)' }}>
            + 输入自定义类型名称...
          </button>
        </div>
      </div>
    </div>
  )
}

export function ModelPicker() {
  const open = useNodeStore(s => s.modelPickerOpen)
  const setOpen = useNodeStore(s => s.setModelPickerOpen)
  const setModelStyle = useNodeStore(s => s.setModelStyle)

  if (!open) return null

  const groups = [...new Set(MODEL_STYLES.map(s => s.group))]

  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center pb-8"
      style={{ background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(4px)' }}
      onMouseDown={() => setOpen(false)}>
      <div className="anim-up w-[400px] overflow-hidden rounded-2xl border"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-lg)' }}
        onMouseDown={e => e.stopPropagation()}>
        <div className="border-b px-4 py-3 text-sm font-semibold" style={{ borderColor: 'var(--divider)', color: 'var(--text)' }}>
          选择 v2 定稿模特
        </div>
        <div className="max-h-[360px] overflow-y-auto p-3">
          {groups.map(group => (
            <div key={group} className="mb-3">
              <div className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-3)' }}>
                {group}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {MODEL_STYLES.filter(s => s.group === group).map(s => (
                  <button key={s.id}
                    onClick={() => { setModelStyle(s.id); setOpen(false) }}
                    className="card !min-h-[76px] !rounded-xl p-3 text-left transition-all hover:scale-[1.01]">
                    <div className="text-sm font-medium" style={{ color: 'var(--text)' }}>{s.name}</div>
                    <div className="mt-0.5 text-xs" style={{ color: 'var(--text-3)' }}>{s.description}</div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

