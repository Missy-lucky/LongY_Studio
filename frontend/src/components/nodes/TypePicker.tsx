import { useCallback, useEffect, useState } from 'react'
import { Plus, Search, Upload } from 'lucide-react'
import { useNodeStore } from '../../stores/node-store'
import { CATEGORIES_BY_GROUP, MODEL_STYLES } from '../../data/preset-categories'

export function TypePicker() {
  const open = useNodeStore(s => s.typePickerOpen)
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
          {filtered.length === 0 && (
            <div className="rounded-xl border border-dashed px-4 py-6 text-center text-xs"
              style={{ borderColor: 'var(--border)', color: 'var(--text-3)' }}>
              没有匹配的服饰类型，请尝试更短的关键词
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export function ModelPicker() {
  const [pendingModelFile, setPendingModelFile] = useState<File | null>(null)
  const [rightsConfirmed, setRightsConfirmed] = useState(false)
  const [rightsBasis, setRightsBasis] = useState<'self' | 'licensed' | 'consent'>('self')
  const [rightsNote, setRightsNote] = useState('')
  const [identityAngle, setIdentityAngle] = useState<'three-quarter-left' | 'three-quarter-right' | 'profile-left' | 'profile-right' | 'back' | 'face-detail'>('three-quarter-left')
  const open = useNodeStore(s => s.modelPickerOpen)
  const setOpen = useNodeStore(s => s.setModelPickerOpen)
  const setModelStyle = useNodeStore(s => s.setModelStyle)
  const uploadCustomModel = useNodeStore(s => s.uploadCustomModel)
  const uploadModelReference = useNodeStore(s => s.uploadModelReference)
  const uploadProjectReference = useNodeStore(s => s.uploadProjectReference)
  const availableModels = useNodeStore(s => s.availableModels)
  const workflowBusy = useNodeStore(s => s.workflowBusy)

  if (!open) return null

  const groups = [...new Set(MODEL_STYLES.map(s => s.group))]
  const customModels = availableModels.filter(model => model.source === 'custom')
  const chooseImage = (handler: (file: File) => void) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = event => {
      const file = (event.target as HTMLInputElement).files?.[0]
      if (file) handler(file)
    }
    input.click()
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center pb-8"
      style={{ background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(4px)' }}
      onMouseDown={() => setOpen(false)}>
      <div className="anim-up w-[520px] overflow-hidden rounded-2xl border"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-lg)' }}
        onMouseDown={e => e.stopPropagation()}>
        <div className="border-b px-4 py-3 text-sm font-semibold" style={{ borderColor: 'var(--divider)', color: 'var(--text)' }}>
          模特与参考节点
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
          {customModels.length > 0 && (
            <div className="mb-3">
              <div className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-3)' }}>
                自定义模特
              </div>
              <div className="grid grid-cols-2 gap-2">
                {customModels.map(model => (
                  <div key={model.id} className="card !rounded-xl p-3">
                    <button onClick={() => setModelStyle(model.id)} className="w-full text-left">
                      <div className="truncate text-sm font-medium" style={{ color: 'var(--text)' }}>{model.name}</div>
                      <div className="mt-0.5 text-[10px]" style={{ color: 'var(--text-3)' }}>
                        身份参考 {model.references?.length ?? 1}/7 · 已授权
                      </div>
                    </button>
                    <div className="mt-2 flex gap-1">
                      <select className="input min-w-0 flex-1 !min-h-[28px] !px-1 !text-[9px]" value={identityAngle}
                        onChange={event => setIdentityAngle(event.target.value as typeof identityAngle)}>
                        <option value="three-quarter-left">左 3/4</option>
                        <option value="three-quarter-right">右 3/4</option>
                        <option value="profile-left">左侧面</option>
                        <option value="profile-right">右侧面</option>
                        <option value="back">背面</option>
                        <option value="face-detail">面部细节</option>
                      </select>
                      <button className="btn btn-secondary !min-h-[28px] !px-2 !text-[9px]" disabled={workflowBusy}
                        onClick={() => chooseImage(file => { void uploadModelReference(model.id, file, identityAngle) })}>
                        补角度
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-3)' }}>
            上传与附加参考
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button disabled={workflowBusy} onClick={() => chooseImage(file => { setPendingModelFile(file); setRightsConfirmed(false); setRightsNote('') })}
              className="btn btn-secondary !min-h-[42px] !justify-start !text-xs">
              <Upload size={13}/>上传自定义模特
            </button>
            <button disabled={workflowBusy} onClick={() => chooseImage(file => { void uploadProjectReference(file, 'pose') })}
              className="btn btn-secondary !min-h-[42px] !justify-start !text-xs">
              <Upload size={13}/>添加姿势子节点
            </button>
            <button disabled={workflowBusy} onClick={() => chooseImage(file => { void uploadProjectReference(file, 'style') })}
              className="btn btn-secondary !min-h-[42px] !justify-start !text-xs">
              <Upload size={13}/>添加风格参考
            </button>
            <button disabled={workflowBusy} onClick={() => chooseImage(file => { void uploadProjectReference(file, 'detail') })}
              className="btn btn-secondary !min-h-[42px] !justify-start !text-xs">
              <Upload size={13}/>添加细节证据
            </button>
          </div>
          <div className="mt-2 px-1 text-[10px] leading-4" style={{ color: 'var(--text-3)' }}>
            姿势只约束动作；风格只约束灯光与构图；细节图只作为商品结构证据。姿势最多 1 张、风格 2 张、细节 3 张。
          </div>
          {pendingModelFile && (
            <div className="mt-3 rounded-xl border p-3" style={{ borderColor: 'var(--border)', background: 'var(--bg-2)' }}>
              <div className="text-xs font-medium">人物图片授权确认</div>
              <div className="mt-1 truncate text-[10px]" style={{ color: 'var(--text-3)' }}>{pendingModelFile.name}</div>
              <label className="mt-3 block text-[10px]" style={{ color: 'var(--text-2)' }}>授权依据
                <select className="input mt-1 w-full !min-h-[34px]" value={rightsBasis} onChange={event => setRightsBasis(event.target.value as typeof rightsBasis)}>
                  <option value="self">本人或自有模特素材</option>
                  <option value="licensed">已取得版权/商业许可</option>
                  <option value="consent">已取得人物明确同意</option>
                </select>
              </label>
              <label className="mt-2 block text-[10px]" style={{ color: 'var(--text-2)' }}>授权备注（可填写合同、授权单编号）
                <input className="input mt-1 w-full !min-h-[34px]" value={rightsNote} onChange={event => setRightsNote(event.target.value)} maxLength={500}/>
              </label>
              <label className="mt-3 flex items-start gap-2 text-[10px] leading-4" style={{ color: 'var(--text-2)' }}>
                <input className="mt-0.5" type="checkbox" checked={rightsConfirmed} onChange={event => setRightsConfirmed(event.target.checked)}/>
                我确认有权将该人物图片用于 AI 生图及商品展示，并承担相应授权责任。
              </label>
              <div className="mt-3 flex justify-end gap-2">
                <button className="btn btn-secondary !min-h-[32px] !text-[10px]" onClick={() => setPendingModelFile(null)}>取消</button>
                <button className="btn btn-primary !min-h-[32px] !text-[10px]" disabled={!rightsConfirmed || workflowBusy}
                  onClick={() => { const file = pendingModelFile; setPendingModelFile(null); void uploadCustomModel(file, { rightsBasis, rightsNote }) }}>
                  确认授权并上传
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

