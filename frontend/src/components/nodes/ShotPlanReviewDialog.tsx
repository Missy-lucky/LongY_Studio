import { useState } from 'react'
import { Ban, Check, CircleSlash, Image as ImageIcon, ListChecks, Plus, Wand2, X } from 'lucide-react'
import { useNodeStore } from '../../stores/node-store'
import type { ShotPlanPreview, ShotPlanShot } from '../../services/api'

const TYPE_LABEL: Record<ShotPlanShot['type'], string> = {
  flat: '平面',
  partial: '上身商品特写',
  detail: '细节',
  model: '整套搭配',
}

const PRIORITY_STYLE: Record<ShotPlanShot['priority'], { color: string; label: string }> = {
  P0: { color: '#EF4444', label: '必拍' },
  P1: { color: '#F59E0B', label: '建议' },
  P2: { color: '#64748B', label: '可选' },
}

interface CustomShotForm {
  name: string
  type: ShotPlanShot['type']
  priority: ShotPlanShot['priority']
  promptHints: string
}

const EMPTY_CUSTOM: CustomShotForm = {
  name: '', type: 'detail', priority: 'P1', promptHints: '',
}

const ALL_TYPES = ['flat', 'partial', 'detail', 'model'] as const

export function ShotPlanReviewDialog() {
  const plan = useNodeStore(state => state.shotPlan)
  const close = useNodeStore(state => state.closeShotPlan)
  const confirm = useNodeStore(state => state.confirmShotPlan)
  const updateSelection = useNodeStore(state => state.updateShotPlanSelection)
  const setShotPlanTypes = useNodeStore(state => state.setShotPlanTypes)
  const addCustomShot = useNodeStore(state => state.addCustomShot)
  const busy = useNodeStore(state => state.workflowBusy)
  const [customItemId, setCustomItemId] = useState<string | null>(null)
  const [custom, setCustom] = useState<CustomShotForm>(EMPTY_CUSTOM)

  if (!plan) return null

  const usesModelOutput = plan.items.some(item => item.shots.some(
    shot => shot.status === 'selected' && (shot.type === 'partial' || shot.type === 'model'),
  ))

  const setStatus = (itemId: string, item: ShotPlanPreview['items'][number], shot: ShotPlanShot, status: ShotPlanShot['status']) => {
    if (status === 'selected') {
      updateSelection(itemId, shot.shotId, {
        status, source: 'ai', assetId: null, reason: '',
      })
    } else if (status === 'fulfilled') {
      updateSelection(itemId, shot.shotId, {
        status,
        source: 'asset',
        assetId: item.assets[0]?.id ?? null,
        reason: '',
      })
    } else {
      updateSelection(itemId, shot.shotId, {
        status, source: 'manual', assetId: null, reason: '',
      })
    }
  }

  const submitCustom = (itemId: string) => {
    if (!custom.name.trim()) return
    addCustomShot(itemId, {
      name: custom.name.trim(),
      type: custom.type,
      priority: custom.priority,
      promptHints: custom.promptHints.trim(),
    })
    setCustom(EMPTY_CUSTOM)
    setCustomItemId(null)
  }

  return (
    <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/65 p-6">
      <div className="flex max-h-[84vh] w-[920px] flex-col overflow-hidden rounded-2xl border"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-lg)' }}>
        <div className="flex items-center gap-3 border-b px-5 py-4" style={{ borderColor: 'var(--divider)' }}>
          <ListChecks size={16} className="text-accent" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">镜头方案确认</div>
            <div className="mt-0.5 text-[11px] text-text-secondary">
              默认勾选 P0，可逐个取消或只保留某一类；P1/P2 可按需追加，原图满足或豁免不会进入生图队列。
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm font-semibold">¥{plan.estimatedCost}</div>
            <div className="text-[10px] text-text-muted">{plan.selectedCount} 张待生成</div>
          </div>
          <button onClick={close} className="btn btn-secondary !px-2 !py-1.5"><X size={13}/></button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 border-b px-5 py-3"
          style={{ borderColor: 'var(--divider)', background: 'var(--bg-2)' }}>
          <span className="mr-1 text-[10px] font-semibold uppercase tracking-widest text-text-muted">快速范围</span>
          <button onClick={() => setShotPlanTypes([...ALL_TYPES])} className="btn btn-secondary !min-h-[28px] !px-2 !py-1 !text-[10px]">
            默认 P0
          </button>
          {ALL_TYPES.map(type => (
            <button
              key={type}
              onClick={() => setShotPlanTypes([type])}
              className="btn btn-secondary !min-h-[28px] !px-2 !py-1 !text-[10px]">
              仅{TYPE_LABEL[type]}
            </button>
          ))}
          <button onClick={() => setShotPlanTypes([])} className="btn btn-secondary !min-h-[28px] !px-2 !py-1 !text-[10px]">
            <CircleSlash size={11}/>全部取消
          </button>
        </div>

        {usesModelOutput && plan.outfitFallbacks.length > 0 && (
          <div className="border-b px-5 py-3" style={{ borderColor: 'var(--divider)', background: 'var(--bg-2)' }}>
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-text-muted">
              系统将补齐缺失衣层
            </div>
            <div className="flex flex-wrap gap-2">
              {plan.outfitFallbacks.map(fallback => (
                <div key={fallback.id} className="flex min-w-[250px] items-center gap-3 rounded-lg border p-2"
                  style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
                  <img src={fallback.previewUrl} alt={fallback.name} loading="lazy"
                    className="h-14 w-14 rounded-md border object-contain"
                    style={{ borderColor: 'var(--border)', background: '#fff' }} />
                  <div className="min-w-0">
                    <div className="truncate text-xs font-medium">{fallback.name}</div>
                    <div className="mt-0.5 text-[10px] leading-4 text-text-muted">
                      {fallback.reason} · 仅用于模特图，不遮挡售卖商品
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {plan.items.map(item => (
            <section key={item.itemId} className="rounded-xl border" style={{ borderColor: 'var(--border)' }}>
              <div className="flex items-center gap-3 border-b px-4 py-3" style={{ borderColor: 'var(--divider)' }}>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-semibold">{item.itemName}</div>
                  <div className="mt-0.5 text-[10px] text-text-muted">
                    {item.categoryName} · {item.shots.length} 个镜头 · {item.assets.length} 张原图
                  </div>
                </div>
                <span className="rounded-full border px-2 py-1 text-[10px]"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}>
                  选择 {item.selectedCount} · ¥{item.estimatedCost}
                </span>
                <button
                  onClick={() => {
                    setCustomItemId(customItemId === item.itemId ? null : item.itemId)
                    setCustom(EMPTY_CUSTOM)
                  }}
                  className="btn btn-secondary !min-h-[30px] !px-2 !py-1 !text-[10px]">
                  <Plus size={11}/>自定义
                </button>
              </div>

              {customItemId === item.itemId && (
                <div className="border-b p-3" style={{ borderColor: 'var(--divider)', background: 'var(--bg-2)' }}>
                  <div className="grid grid-cols-[1.4fr_0.8fr_0.8fr_2fr_auto] items-center gap-2">
                    <input value={custom.name} onChange={event => setCustom({ ...custom, name: event.target.value })}
                      placeholder="镜头名称，如反光条特写" className="input !min-h-[32px] !text-xs" />
                    <select value={custom.type} onChange={event => setCustom({ ...custom, type: event.target.value as CustomShotForm['type'] })}
                      className="input !min-h-[32px] !text-xs">
                      {Object.entries(TYPE_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                    <select value={custom.priority} onChange={event => setCustom({ ...custom, priority: event.target.value as CustomShotForm['priority'] })}
                      className="input !min-h-[32px] !text-xs">
                      <option value="P0">P0 必拍</option>
                      <option value="P1">P1 建议</option>
                      <option value="P2">P2 可选</option>
                    </select>
                    <input value={custom.promptHints} onChange={event => setCustom({ ...custom, promptHints: event.target.value })}
                      placeholder="镜头提示词" className="input !min-h-[32px] !text-xs" />
                    <button onClick={() => submitCustom(item.itemId)} className="btn btn-primary !min-h-[32px] !px-3 !text-xs">添加</button>
                  </div>
                </div>
              )}

              <div className="divide-y" style={{ borderColor: 'var(--divider)' }}>
                {item.shots.map(shot => (
                  <div key={shot.shotId} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="rounded px-1.5 py-0.5 text-[9px] font-semibold"
                          style={{ background: `${PRIORITY_STYLE[shot.priority].color}22`, color: PRIORITY_STYLE[shot.priority].color }}>
                          {shot.priority} {PRIORITY_STYLE[shot.priority].label}
                        </span>
                        <span className="truncate text-xs font-medium">{shot.shotName}</span>
                        <span className="shrink-0 text-[9px] text-text-muted">{TYPE_LABEL[shot.type]}</span>
                        {shot.isCustom && <span className="shrink-0 rounded bg-accent/15 px-1 py-0.5 text-[9px] text-accent">自定义</span>}
                      </div>
                      {shot.status === 'waived' ? (
                        <input
                          value={shot.reason}
                          onChange={event => updateSelection(item.itemId, shot.shotId, { reason: event.target.value })}
                          placeholder="豁免原因（导出报告会记录）"
                          className="input mt-1.5 !min-h-[28px] !text-[10px]"
                        />
                      ) : shot.status === 'fulfilled' && item.assets.length > 0 ? (
                        <select
                          value={shot.assetId ?? item.assets[0].id}
                          onChange={event => updateSelection(item.itemId, shot.shotId, {
                            source: 'asset', assetId: event.target.value,
                          })}
                          className="input mt-1.5 !min-h-[28px] !text-[10px]">
                          {item.assets.map(asset => (
                            <option key={asset.id} value={asset.id}>
                              {asset.viewSlot || '原图'} · {asset.filePath.split('/').pop()}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <>
                          <div className="mt-0.5 flex min-w-0 items-center gap-2">
                            <div className="min-w-0 flex-1 truncate text-[10px] text-text-muted">
                              {shot.promptHints || '无附加镜头提示'}
                            </div>
                            <button
                              onClick={() => updateSelection(item.itemId, shot.shotId, {
                                promptMode: shot.promptMode === 'custom' ? 'default' : 'custom',
                              })}
                              className="shrink-0 text-[9px] text-primary hover:underline">
                              <Wand2 size={10} className="inline"/> {shot.promptMode === 'custom' ? '使用默认提示词' : '自定义提示词'}
                            </button>
                          </div>
                          {shot.promptMode === 'custom' && (
                            <textarea
                              value={shot.customPrompt}
                              onChange={event => updateSelection(item.itemId, shot.shotId, { customPrompt: event.target.value })}
                              rows={2}
                              maxLength={6000}
                              placeholder="补充构图、场景或细节要求；商品真实性和结构锁定规则仍会保留"
                              className="input mt-1.5 w-full resize-y !py-1.5 !text-[10px] leading-4"
                            />
                          )}
                        </>
                      )}
                    </div>

                    <div className="flex items-center gap-1">
                      <label
                        className={`flex !min-h-[28px] cursor-pointer items-center gap-1 rounded px-2 py-1 text-[10px] transition-colors ${shot.status === 'selected' ? 'bg-primary/12 text-primary' : 'text-text-secondary hover:bg-surface-hover'}`}
                        title={shot.status === 'selected' ? '取消这个镜头，本次不生成' : '勾选后生成这个镜头'}>
                        <input
                          type="checkbox"
                          checked={shot.status === 'selected'}
                          onChange={event => setStatus(
                            item.itemId, item, shot,
                            event.target.checked ? 'selected' : 'proposed',
                          )}
                          className="h-3 w-3 accent-[var(--primary)]"
                        />
                        生成
                      </label>
                      <button
                        onClick={() => setStatus(item.itemId, item, shot, 'fulfilled')}
                        disabled={item.assets.length === 0}
                        className={clsButton(shot.status === 'fulfilled')}
                        title={item.assets.length ? '用已上传原图满足' : '该单品暂无原图'}>
                        <ImageIcon size={11}/>原图
                      </button>
                      <button
                        onClick={() => setStatus(item.itemId, item, shot, 'waived')}
                        className={clsButton(shot.status === 'waived')}
                        title="本次豁免，并记录原因">
                        <Ban size={11}/>豁免
                      </button>
                      <span className="ml-1 w-14 text-right text-[10px] text-text-muted">
                        {shot.status === 'selected' ? `¥${shot.estimatedCost}` : '¥0'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>

        <div className="flex items-center justify-between gap-3 border-t px-5 py-3"
          style={{ borderColor: 'var(--divider)' }}>
          <div className="flex items-center gap-2 text-[11px] text-text-secondary">
            <Check size={13} className="text-success" />
            仅提交勾选的“生成”镜头；取消勾选只是不生成，导出前仍需生成、原图满足或豁免。
          </div>
          <div className="flex gap-2">
            <button onClick={close} className="btn btn-secondary">取消</button>
            <button
              onClick={() => void confirm()}
              disabled={busy}
              className="btn btn-primary">
              确认 {plan.selectedCount} 个镜头 · ¥{plan.estimatedCost}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function clsButton(active: boolean) {
  return `btn !min-h-[28px] !px-2 !py-1 !text-[10px] ${active ? 'btn-primary' : 'btn-secondary'}`
}
