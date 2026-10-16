import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Loader2, Plus, ScanText, Trash2, Upload, X } from 'lucide-react'
import { useNodeStore } from '../../stores/node-store'
import { api, type CareCardPayload, type CareInstruction, type CareLabelDraft } from '../../services/api'
import type { FlowInputNode } from '../../types/node-system'

const INSTRUCTIONS: Array<{ id: CareInstruction; label: string }> = [
  { id: 'hand_wash', label: '建议手洗' },
  { id: 'machine_wash_gentle', label: '轻柔机洗' },
  { id: 'do_not_wash', label: '不可水洗' },
  { id: 'max_30', label: '最高水温 30℃' },
  { id: 'dry_clean', label: '可干洗' },
  { id: 'do_not_dry_clean', label: '不可干洗' },
  { id: 'do_not_bleach', label: '不可漂白' },
  { id: 'do_not_iron', label: '不可熨烫' },
  { id: 'low_iron', label: '低温熨烫' },
  { id: 'line_dry', label: '悬挂晾干' },
  { id: 'do_not_tumble', label: '不可滚筒烘干' },
]

const EMPTY: CareCardPayload = {
  sourceAssetId: null,
  brand: '',
  productName: '',
  composition: [{ name: '棉', percent: 100 }],
  instructions: ['max_30', 'do_not_bleach', 'line_dry'],
  warnings: [],
}

export function CareCardDialog() {
  const open = useNodeStore(s => s.careDialogOpen)
  const editingId = useNodeStore(s => s.careEditingCardId)
  const cards = useNodeStore(s => s.careCards)
  const careSourceAssets = useNodeStore(s => s.careSourceAssets)
  const nodes = useNodeStore(s => s.nodes)
  const providers = useNodeStore(s => s.providers)
  const projectId = useNodeStore(s => s.backendProjectId)
  const busy = useNodeStore(s => s.workflowBusy)
  const close = useNodeStore(s => s.closeCareEditor)
  const save = useNodeStore(s => s.saveCareCard)
  const uploadCareSource = useNodeStore(s => s.uploadCareSource)
  const [form, setForm] = useState<CareCardPayload>(EMPTY)
  const [error, setError] = useState('')
  const [extracting, setExtracting] = useState(false)
  const [extractionProvider, setExtractionProvider] = useState<'openai' | 'volcengine-ark'>('openai')
  const [extraction, setExtraction] = useState<CareLabelDraft | null>(null)
  const [factsConfirmed, setFactsConfirmed] = useState(false)

  const sourceAssets = useMemo(() => {
    const garmentAssets = nodes
    .filter(node => node.type === 'input')
    .map(node => node as FlowInputNode)
    .filter(node => node.data.image?.remote)
    .map(node => ({
      id: node.data.image!.remote!.assetId,
      label: `${node.data.categoryName} · ${node.data.image!.fileName}`,
    }))
    const labelAssets = careSourceAssets.map(asset => ({
      id: asset.id,
      label: `水洗标 · ${asset.name || asset.filePath.split('/').pop() || asset.id}`,
    }))
    return [...new Map([...labelAssets, ...garmentAssets].map(asset => [asset.id, asset])).values()]
  }, [nodes, careSourceAssets])

  const extractionProviders = providers.filter(provider =>
    (provider.id === 'openai' || provider.id === 'volcengine-ark') && provider.available !== false)

  useEffect(() => {
    if (!open) return
    const current = cards.find(card => card.id === editingId)
    setForm(current ? structuredClone(current.data) : structuredClone(EMPTY))
    setError('')
    setExtraction(null)
    setFactsConfirmed(Boolean(current))
    const preferred = extractionProviders.find(provider => provider.id === extractionProvider)
      ?? extractionProviders[0]
    if (preferred?.id === 'openai' || preferred?.id === 'volcengine-ark') setExtractionProvider(preferred.id)
  }, [open, editingId, cards, providers])

  if (!open) return null
  const total = form.composition.reduce((sum, part) => sum + (Number(part.percent) || 0), 0)
  const setPart = (index: number, patch: Partial<CareCardPayload['composition'][number]>) => {
    setForm(current => ({
      ...current,
      composition: current.composition.map((part, itemIndex) => itemIndex === index ? { ...part, ...patch } : part),
    }))
  }
  const submit = async () => {
    setError('')
    if (!form.productName.trim()) return setError('请填写商品名称')
    if (extraction && !factsConfirmed) return setError('请先逐项核对识别结果并勾选人工确认')
    if (Math.abs(total - 100) > 0.1) return setError(`面料成分合计必须为 100%，当前为 ${total}%`)
    if (form.composition.some(part => !part.name.trim())) return setError('面料成分名称不能为空')
    if (form.warnings.filter(item => item.trim()).length > 3) return setError('注意事项最多 3 条')
    if (form.warnings.some(item => item.trim().length > 40)) return setError('每条注意事项不能超过 40 个字符')
    try {
      await save({
        ...form,
        brand: form.brand.trim(),
        productName: form.productName.trim(),
        composition: form.composition.map(part => ({ ...part, name: part.name.trim() })),
        warnings: form.warnings.map(item => item.trim()).filter(Boolean),
      }, editingId)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '保存失败')
    }
  }

  const chooseCareSource = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/png,image/jpeg,image/webp,image/heic,image/heif'
    input.onchange = event => {
      const file = (event.target as HTMLInputElement).files?.[0]
      if (!file) return
      void uploadCareSource(file).then(asset => {
        if (asset) setForm(current => ({ ...current, sourceAssetId: asset.id }))
      })
    }
    input.click()
  }

  const extract = async () => {
    if (!projectId || !form.sourceAssetId) {
      setError('请先上传或选择一张商标 / 水洗标素材')
      return
    }
    setExtracting(true)
    setError('')
    try {
      const result = await api.extractCareLabel(projectId, form.sourceAssetId, extractionProvider)
      if (!result.draft.labelDetected) {
        setExtraction(result.draft)
        setFactsConfirmed(false)
        setError('未可靠识别到商标或水洗标，请换一张清晰完整的图片或手动录入')
        return
      }
      const draft = result.draft
      setExtraction(draft)
      setFactsConfirmed(false)
      setForm(current => ({
        ...current,
        brand: draft.brand || current.brand,
        productName: draft.productName || current.productName,
        composition: draft.composition.map(item => ({ name: item.name, percent: item.percent })),
        instructions: draft.instructions.map(item => item.code),
        warnings: draft.warnings.map(item => item.text),
      }))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '水洗标识别失败')
    } finally {
      setExtracting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[220] flex items-center justify-center p-6"
      style={{ background: 'rgba(0,0,0,.38)', backdropFilter: 'blur(5px)' }}
      onMouseDown={() => { if (!busy) close() }}>
      <div className="max-h-[90vh] w-[720px] overflow-hidden rounded-2xl border"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-lg)' }}
        onMouseDown={event => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: 'var(--divider)' }}>
          <div>
            <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
              {editingId ? '编辑洗护与成分图' : '新建洗护与成分图'}
            </div>
            <div className="mt-1 text-[11px]" style={{ color: 'var(--text-3)' }}>结构化事实将直接渲染为 1200 × 1600 白底 PNG</div>
          </div>
          <button className="btn btn-ghost !p-2" disabled={busy} onClick={close}><X size={15}/></button>
        </div>

        <div className="max-h-[calc(90vh-130px)] space-y-5 overflow-y-auto p-5">
          <div className="grid grid-cols-2 gap-3">
            <label className="text-[11px]" style={{ color: 'var(--text-3)' }}>
              品牌（可选）
              <input className="input mt-1 w-full" value={form.brand}
                onChange={event => setForm(current => ({ ...current, brand: event.target.value }))}/>
            </label>
            <label className="text-[11px]" style={{ color: 'var(--text-3)' }}>
              商品名称
              <input className="input mt-1 w-full" value={form.productName}
                onChange={event => setForm(current => ({ ...current, productName: event.target.value }))}/>
            </label>
          </div>

          <label className="block text-[11px]" style={{ color: 'var(--text-3)' }}>
            商标 / 水洗标来源素材（仅作溯源，可选）
            <div className="mt-1 flex gap-2">
              <select className="input min-w-0 flex-1" value={form.sourceAssetId ?? ''}
                onChange={event => {
                  setForm(current => ({ ...current, sourceAssetId: event.target.value || null }))
                  setExtraction(null)
                  setFactsConfirmed(false)
                }}>
                <option value="">不关联素材</option>
                {sourceAssets.map(asset => <option key={asset.id} value={asset.id}>{asset.label}</option>)}
              </select>
              <button className="btn btn-secondary !min-h-[36px] !text-[11px]" disabled={busy || extracting}
                onClick={chooseCareSource}><Upload size={12}/>上传标签</button>
            </div>
          </label>

          <section className="rounded-xl border p-3" style={{ borderColor: 'var(--border)', background: 'var(--bg-2)' }}>
            <div className="flex items-center gap-2">
              <select className="input min-w-0 flex-1 !min-h-[34px] !text-[11px]" value={extractionProvider}
                disabled={!extractionProviders.length || extracting}
                onChange={event => setExtractionProvider(event.target.value as 'openai' | 'volcengine-ark')}>
                {extractionProviders.length
                  ? extractionProviders.map(provider => <option key={provider.id} value={provider.id}>{provider.name}</option>)
                  : <option value="openai">请先配置 OpenAI 或火山方舟</option>}
              </select>
              <button className="btn btn-secondary !min-h-[34px] !text-[11px]"
                disabled={!form.sourceAssetId || !extractionProviders.length || extracting || busy}
                onClick={() => void extract()}>
                {extracting ? <Loader2 size={12} className="anim-spin"/> : <ScanText size={12}/>}从标签自动预填
              </button>
            </div>
            <div className="mt-2 text-[10px] leading-4" style={{ color: 'var(--text-3)' }}>
              识别只负责预填，不会直接生成成品；所有比例、文字与洗护图标都需要人工核对。
            </div>
            {extraction && (
              <div className="mt-2 rounded-lg border px-3 py-2" style={{ borderColor: extraction.uncertainFields.length ? 'var(--warning)' : 'var(--border)' }}>
                <div className="flex items-center gap-1.5 text-[10px]" style={{ color: extraction.uncertainFields.length ? 'var(--warning)' : 'var(--text-2)' }}>
                  {extraction.uncertainFields.length > 0 && <AlertTriangle size={12}/>}识别文字：{extraction.rawText.join(' / ') || '无'}
                </div>
                {extraction.uncertainFields.length > 0 && (
                  <div className="mt-1 text-[10px]" style={{ color: 'var(--warning)' }}>
                    需重点核对：{extraction.uncertainFields.join('、')}
                  </div>
                )}
                <label className="mt-2 flex cursor-pointer items-center gap-2 text-[11px]" style={{ color: 'var(--text)' }}>
                  <input type="checkbox" checked={factsConfirmed} onChange={event => setFactsConfirmed(event.target.checked)}/>
                  我已对照原标签逐项确认上述事实
                </label>
              </div>
            )}
          </section>

          <section>
            <div className="mb-2 flex items-center justify-between">
              <div className="text-xs font-semibold" style={{ color: 'var(--text)' }}>面料成分</div>
              <div className="text-[11px]" style={{ color: Math.abs(total - 100) <= .1 ? 'var(--success)' : 'var(--error)' }}>
                合计 {total}%
              </div>
            </div>
            <div className="space-y-2">
              {form.composition.map((part, index) => (
                <div key={index} className="flex gap-2">
                  <input className="input flex-1" placeholder="如：棉" value={part.name}
                    onChange={event => setPart(index, { name: event.target.value })}/>
                  <input className="input w-28" type="number" min="0.1" max="100" step="0.1" value={part.percent}
                    onChange={event => setPart(index, { percent: Number(event.target.value) })}/>
                  <button className="btn btn-ghost !p-2" disabled={form.composition.length === 1}
                    onClick={() => setForm(current => ({
                      ...current,
                      composition: current.composition.filter((_, itemIndex) => itemIndex !== index),
                    }))}><Trash2 size={14}/></button>
                </div>
              ))}
            </div>
            <button className="btn btn-ghost mt-2 !min-h-[30px] !text-[11px]" disabled={form.composition.length >= 8}
              onClick={() => setForm(current => ({
                ...current,
                composition: [...current.composition, { name: '', percent: 0 }],
              }))}><Plus size={12}/>添加成分</button>
          </section>

          <section>
            <div className="mb-2 text-xs font-semibold" style={{ color: 'var(--text)' }}>洗护方式</div>
            <div className="grid grid-cols-3 gap-2">
              {INSTRUCTIONS.map(item => (
                <label key={item.id} className="flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-[11px]"
                  style={{ borderColor: form.instructions.includes(item.id) ? '#D97706' : 'var(--border)', color: 'var(--text-2)' }}>
                  <input type="checkbox" checked={form.instructions.includes(item.id)} onChange={event => setForm(current => ({
                    ...current,
                    instructions: event.target.checked
                      ? [...current.instructions, item.id]
                      : current.instructions.filter(code => code !== item.id),
                  }))}/>
                  {item.label}
                </label>
              ))}
            </div>
          </section>

          <label className="block text-[11px]" style={{ color: 'var(--text-3)' }}>
            注意事项（每行一条，最多 3 条、每条 40 字）
            <textarea className="input mt-1 min-h-24 w-full resize-y" value={form.warnings.join('\n')}
              onChange={event => setForm(current => ({ ...current, warnings: event.target.value.split('\n') }))}
              placeholder={'深浅色衣物请分开洗涤\n请勿长时间浸泡'}/>
          </label>
          {error && <div className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-500">{error}</div>}
        </div>

        <div className="flex justify-end gap-2 border-t px-5 py-3" style={{ borderColor: 'var(--divider)' }}>
          <button className="btn btn-secondary" disabled={busy} onClick={close}>取消</button>
          <button className="btn btn-primary" disabled={busy || !form.instructions.length} onClick={() => void submit()}>
            {busy && <Loader2 size={13} className="anim-spin"/>}{editingId ? '更新图片' : '生成图片'}
          </button>
        </div>
      </div>
    </div>
  )
}
