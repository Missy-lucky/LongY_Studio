import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, RefreshCw, Send, Sparkles, X } from 'lucide-react'
import clsx from 'clsx'
import { useNodeStore } from '../../stores/node-store'
import {
  PROMPT_REJECT_REASONS, composePromptRevision, promptChanged,
  type PromptRejectReasonId, type PromptReferenceMode,
} from '../../workflow/prompt-revision'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export function PromptRevisionDrawer() {
  const nodeId = useNodeStore(state => state.promptRevisionNodeId)
  const nodes = useNodeStore(state => state.nodes)
  const providers = useNodeStore(state => state.providers)
  const providerId = useNodeStore(state => state.providerId)
  const busy = useNodeStore(state => state.workflowBusy)
  const regenerate = useNodeStore(state => state.regenerate)
  const markUnsatisfied = useNodeStore(state => state.markUnsatisfied)
  const close = useNodeStore(state => state.openPromptRevision)
  const openImageViewer = useNodeStore(state => state.openImageViewer)

  const output = useMemo(
    () => nodes.find(node => node.id === nodeId && node.type === 'output'),
    [nodeId, nodes],
  )
  const data = output?.type === 'output' ? output.data : null

  const [reasons, setReasons] = useState<PromptRejectReasonId[]>([])
  const [instruction, setInstruction] = useState('')
  const [prompt, setPrompt] = useState('')
  const [negativePrompt, setNegativePrompt] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [changes, setChanges] = useState<string[]>([])
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [referenceMode, setReferenceMode] = useState<PromptReferenceMode>('original')
  const [maskActive, setMaskActive] = useState(false)
  const [maskReady, setMaskReady] = useState(false)
  const [hasMask, setHasMask] = useState(false)
  const [brushSize, setBrushSize] = useState(48)
  const imageRef = useRef<HTMLImageElement | null>(null)
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const drawingRef = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    if (!data) return
    setReasons([])
    setInstruction('')
    setPrompt(data.prompt)
    setNegativePrompt(data.negativePrompt)
    setMessages([{
      role: 'assistant',
      content: '说明这版图哪里不对，以及下一版要怎么改。确认前我会生成完整提示词，不会先消耗 API 成本。',
    }])
    setChanges([])
    setAdvancedOpen(false)
    setReferenceMode('original')
    setMaskActive(false)
    setMaskReady(false)
    setHasMask(false)
    setBrushSize(48)
  }, [data?.taskId, data?.versionId, nodeId])

  const provider = providers.find(item => item.id === providerId)
  const estimatedCost = provider?.pricePerImage.draft ?? 0.35
  const changed = promptChanged(data?.prompt ?? '', prompt)

  if (!nodeId || !data) return null

  const toggleReason = (id: PromptRejectReasonId) => {
    setReasons(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id])
  }

  const initializeMaskCanvases = () => {
    const image = imageRef.current
    const overlay = overlayCanvasRef.current
    const mask = maskCanvasRef.current
    if (!image || !overlay || !mask || !image.naturalWidth || !image.naturalHeight) return
    overlay.width = image.naturalWidth
    overlay.height = image.naturalHeight
    mask.width = image.naturalWidth
    mask.height = image.naturalHeight
    const overlayContext = overlay.getContext('2d')
    const maskContext = mask.getContext('2d')
    if (!overlayContext || !maskContext) return
    overlayContext.clearRect(0, 0, overlay.width, overlay.height)
    maskContext.clearRect(0, 0, mask.width, mask.height)
    maskContext.fillStyle = 'rgb(0,0,0)'
    maskContext.fillRect(0, 0, mask.width, mask.height)
    setMaskReady(true)
    setHasMask(false)
  }

  const clearMask = () => {
    const overlay = overlayCanvasRef.current
    const mask = maskCanvasRef.current
    const overlayContext = overlay?.getContext('2d')
    const maskContext = mask?.getContext('2d')
    if (!overlay || !mask || !overlayContext || !maskContext) return
    overlayContext.clearRect(0, 0, overlay.width, overlay.height)
    maskContext.clearRect(0, 0, mask.width, mask.height)
    maskContext.fillStyle = 'rgb(0,0,0)'
    maskContext.fillRect(0, 0, mask.width, mask.height)
    setHasMask(false)
  }

  const canvasPoint = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = event.currentTarget
    const rect = canvas.getBoundingClientRect()
    return {
      x: (event.clientX - rect.left) * (canvas.width / rect.width),
      y: (event.clientY - rect.top) * (canvas.height / rect.height),
    }
  }

  const drawMaskSegment = (from: { x: number; y: number }, to: { x: number; y: number }) => {
    const overlay = overlayCanvasRef.current
    const mask = maskCanvasRef.current
    const overlayContext = overlay?.getContext('2d')
    const maskContext = mask?.getContext('2d')
    if (!overlay || !mask || !overlayContext || !maskContext) return
    const scaledBrush = brushSize * (overlay.width / overlay.getBoundingClientRect().width)

    overlayContext.lineWidth = scaledBrush
    overlayContext.lineCap = 'round'
    overlayContext.lineJoin = 'round'
    overlayContext.strokeStyle = 'rgba(99,102,241,.52)'
    overlayContext.beginPath()
    overlayContext.moveTo(from.x, from.y)
    overlayContext.lineTo(to.x, to.y)
    overlayContext.stroke()

    maskContext.save()
    maskContext.globalCompositeOperation = 'destination-out'
    maskContext.lineWidth = scaledBrush
    maskContext.lineCap = 'round'
    maskContext.lineJoin = 'round'
    maskContext.strokeStyle = 'rgba(0,0,0,1)'
    maskContext.beginPath()
    maskContext.moveTo(from.x, from.y)
    maskContext.lineTo(to.x, to.y)
    maskContext.stroke()
    maskContext.restore()
    setHasMask(true)
  }

  const compose = () => {
    const result = composePromptRevision({
      originalPrompt: data.prompt,
      originalNegativePrompt: data.negativePrompt,
      reasons,
      instruction,
      referenceMode,
      useMask: maskActive && hasMask,
    })
    setPrompt(result.prompt)
    setNegativePrompt(result.negativePrompt)
    setChanges(result.changes)
    setMessages(current => [
      ...current,
      { role: 'user', content: instruction || reasons.map(id => PROMPT_REJECT_REASONS.find(item => item.id === id)?.label).join('、') },
      {
        role: 'assistant',
        content: result.changes.length
          ? `已合并为完整提示词：${result.changes.join('；')}。请检查后确认重生成。`
          : '请先勾选问题或输入修改要求，再生成修正提示词。',
      },
    ])
  }

  const confirm = () => {
    if (!changed && !window.confirm('提示词没有变化，继续重生成可能得到相似结果并消耗 API 成本。确定继续吗？')) return
    void regenerate(nodeId, {
      prompt,
      negativePrompt,
      reason: reasons.join(','),
      note: instruction,
      referenceMode,
      baseVersionId: referenceMode === 'generated' ? data.versionId : undefined,
      maskDataUrl: referenceMode === 'generated' && maskActive && hasMask
        ? maskCanvasRef.current?.toDataURL('image/png')
        : undefined,
    })
    close(null)
  }

  return (
    <aside className="prompt-revision-drawer flex shrink-0 flex-col border-l bg-[var(--bg-2)]"
      style={{ borderColor: 'var(--divider)' }}>
      <header className="flex items-start gap-2 border-b px-3 py-3" style={{ borderColor: 'var(--divider)' }}>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ background: 'var(--primary-light)', color: 'var(--primary)' }}>
          <Sparkles size={16}/>
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>提示词修正</h2>
          <div className="mt-0.5 truncate text-[10px]" style={{ color: 'var(--text-3)' }}>
            {data.taskCode} · {data.shotName || data.taskName} · v{data.version}
          </div>
        </div>
        <button onClick={() => close(null)} className="flex h-7 w-7 items-center justify-center rounded-md transition hover:bg-[var(--surface-hover)]"
          style={{ color: 'var(--text-3)' }} title="关闭">
          <X size={14}/>
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <section className="flex gap-3 border-b px-3 py-3" style={{ borderColor: 'var(--divider)' }}>
          <button className="h-24 w-20 shrink-0 overflow-hidden rounded-lg border"
            style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
            onClick={() => data.thumbnail && openImageViewer({
              src: data.thumbnail,
              title: data.shotName || data.taskName,
              subtitle: `${data.taskCode} · v${data.version} · 修正前效果`,
            })}>
            {data.thumbnail
              ? <img src={data.thumbnail} alt={data.taskName} className="h-full w-full object-contain"/>
              : <div className="flex h-full items-center justify-center text-[10px]" style={{ color: 'var(--text-3)' }}>无预览</div>}
          </button>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-semibold" style={{ color: 'var(--text-2)' }}>原图提示词</div>
            <div className="mt-1 max-h-16 overflow-y-auto rounded-md border p-2 text-[10px] leading-4"
              style={{ borderColor: 'var(--border)', color: 'var(--text-3)', background: 'var(--surface)' }}>
              {data.prompt || '后端未返回提示词'}
            </div>
          </div>
        </section>

        <section className="border-b px-3 py-3" style={{ borderColor: 'var(--divider)' }}>
          <div className="mb-2 flex items-center justify-between">
            <div className="text-[11px] font-semibold" style={{ color: 'var(--text-2)' }}>生成基准</div>
            {referenceMode === 'generated' && data.versionId && (
              <span className="font-mono text-[9px]" style={{ color: 'var(--text-3)' }}>基础版本 v{data.version}</span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {([
              { id: 'original', title: '按原图重画', desc: '商品更可靠，整体可能变化' },
              { id: 'generated', title: '按当前图微调', desc: '保留当前构图，只修指定问题' },
            ] as const).map(mode => (
              <button
                key={mode.id}
                onClick={() => setReferenceMode(mode.id)}
                disabled={mode.id === 'generated' && (!data.versionId || !data.thumbnail)}
                className={clsx('rounded-lg border p-2 text-left transition disabled:cursor-not-allowed disabled:opacity-45', referenceMode === mode.id ? 'border-primary' : 'hover:bg-[var(--surface-hover)]')}
                style={{
                  borderColor: referenceMode === mode.id ? 'var(--primary)' : 'var(--border)',
                  background: referenceMode === mode.id ? 'var(--primary-light)' : 'transparent',
                }}
              >
                <div className="text-[11px] font-medium" style={{ color: referenceMode === mode.id ? 'var(--primary)' : 'var(--text)' }}>
                  {mode.title}
                </div>
                <div className="mt-0.5 text-[9px] leading-3" style={{ color: 'var(--text-3)' }}>
                  {mode.desc}
                </div>
              </button>
            ))}
          </div>
          <div className="mt-1.5 text-[9px] leading-3" style={{ color: 'var(--text-3)' }}>
            微调会把当前生成图放在第一位作为编辑基础，同时继续传入原始商品图和模特参考，避免商品真实性漂移。
          </div>
        </section>

        {referenceMode === 'generated' && data.thumbnail && (
          <section className="border-b px-3 py-3" style={{ borderColor: 'var(--divider)' }}>
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="text-[11px] font-semibold" style={{ color: 'var(--text-2)' }}>局部重绘蒙版</div>
              <label className="flex cursor-pointer items-center gap-1.5 text-[10px]" style={{ color: 'var(--text-2)' }}>
                <input
                  type="checkbox"
                  className="h-3 w-3 accent-[var(--primary)]"
                  checked={maskActive}
                  disabled={!maskReady}
                  onChange={event => setMaskActive(event.target.checked)}
                />
                启用
              </label>
            </div>
            <div className="relative overflow-hidden rounded-lg border" style={{ borderColor: maskActive ? 'var(--primary)' : 'var(--border)' }}>
              <img
                ref={imageRef}
                src={data.thumbnail}
                alt={data.taskName}
                className="block h-auto w-full select-none"
                onLoad={initializeMaskCanvases}
                draggable={false}
              />
              <canvas
                ref={overlayCanvasRef}
                className="absolute inset-0 h-full w-full"
                style={{ cursor: maskActive ? 'crosshair' : 'default', touchAction: 'none' }}
                onPointerDown={event => {
                  if (!maskActive) return
                  event.currentTarget.setPointerCapture(event.pointerId)
                  const point = canvasPoint(event)
                  drawingRef.current = point
                  drawMaskSegment(point, point)
                }}
                onPointerMove={event => {
                  if (!maskActive || !drawingRef.current) return
                  const point = canvasPoint(event)
                  drawMaskSegment(drawingRef.current, point)
                  drawingRef.current = point
                }}
                onPointerUp={() => { drawingRef.current = null }}
                onPointerCancel={() => { drawingRef.current = null }}
              />
              <canvas ref={maskCanvasRef} className="hidden"/>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <span className="shrink-0 text-[10px]" style={{ color: 'var(--text-3)' }}>笔刷</span>
              <input
                type="range"
                min={12}
                max={140}
                value={brushSize}
                onChange={event => setBrushSize(Number(event.target.value))}
                className="min-w-0 flex-1 accent-[var(--primary)]"
                disabled={!maskActive}
              />
              <span className="w-8 shrink-0 text-right font-mono text-[10px]" style={{ color: 'var(--text-3)' }}>{brushSize}</span>
              <button onClick={clearMask} disabled={!maskActive || !hasMask} className="btn btn-secondary !min-h-[24px] !px-2 !text-[10px]">
                清空
              </button>
            </div>
            <div className="mt-1 text-[9px] leading-3" style={{ color: 'var(--text-3)' }}>
              蓝色区域会被重绘；未覆盖区域要求保持一致。不启用蒙版时，按当前图做整体语义微调。
            </div>
          </section>
        )}

        <section className="border-b px-3 py-3" style={{ borderColor: 'var(--divider)' }}>
          <div className="mb-2 text-[11px] font-semibold" style={{ color: 'var(--text-2)' }}>问题类型</div>
          <div className="flex flex-wrap gap-1">
            {PROMPT_REJECT_REASONS.map(reason => (
              <button key={reason.id} onClick={() => toggleReason(reason.id)}
                className={clsx('rounded-full px-2 py-1 text-[10px] transition', reasons.includes(reason.id) ? 'font-medium' : 'hover:bg-[var(--surface-hover)]')}
                style={{
                  background: reasons.includes(reason.id) ? 'var(--primary-light)' : 'transparent',
                  color: reasons.includes(reason.id) ? 'var(--primary)' : 'var(--text-3)',
                }}>
                {reason.label}
              </button>
            ))}
          </div>
        </section>

        <section className="border-b px-3 py-3" style={{ borderColor: 'var(--divider)' }}>
          <div className="mb-2 text-[11px] font-semibold" style={{ color: 'var(--text-2)' }}>修改要求</div>
          <textarea value={instruction} onChange={event => setInstruction(event.target.value)}
            rows={3} placeholder="例如：袖口改成米白色，手不要遮住腰带，背景保持纯灰。"
            className="input !py-2 !text-[11px] leading-5"/>
          <button onClick={compose} className="btn btn-secondary mt-2 w-full !min-h-[30px] !text-[11px]">
            <Send size={12}/>生成修正提示词
          </button>
        </section>

        {messages.length > 1 && (
          <section className="space-y-2 border-b px-3 py-3" style={{ borderColor: 'var(--divider)' }}>
            {messages.map((message, index) => (
              <div key={index} className={clsx('max-w-[92%] rounded-xl px-2.5 py-2 text-[10px] leading-4', message.role === 'user' ? 'ml-auto' : '')}
                style={{
                  background: message.role === 'user' ? 'var(--primary)' : 'var(--surface)',
                  color: message.role === 'user' ? 'white' : 'var(--text-2)',
                }}>
                {message.content}
              </div>
            ))}
          </section>
        )}

        <section className="border-b px-3 py-3" style={{ borderColor: 'var(--divider)' }}>
          <div className="mb-2 flex items-center justify-between">
            <div className="text-[11px] font-semibold" style={{ color: 'var(--text-2)' }}>最终提示词</div>
            <button onClick={() => setAdvancedOpen(value => !value)} className="text-[10px]" style={{ color: 'var(--primary)' }}>
              {advancedOpen ? '收起高级项' : '负面提示词'}
            </button>
          </div>
          <textarea value={prompt} onChange={event => setPrompt(event.target.value)} rows={7}
            className="input !py-2 font-mono !text-[10px] leading-4"/>
          {advancedOpen && (
            <textarea value={negativePrompt} onChange={event => setNegativePrompt(event.target.value)} rows={3}
              placeholder="负面提示词" className="input mt-2 !py-2 font-mono !text-[10px] leading-4"/>
          )}
          {changes.length > 0 && (
            <ul className="mt-2 space-y-1">
              {changes.map(change => (
                <li key={change} className="flex gap-1.5 text-[10px]" style={{ color: 'var(--text-2)' }}>
                  <span style={{ color: 'var(--success)' }}>+</span>{change}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <footer className="shrink-0 border-t px-3 py-3" style={{ borderColor: 'var(--divider)' }}>
        {!changed && (
          <div className="mb-2 flex items-start gap-1.5 rounded-md border px-2 py-1.5 text-[10px]"
            style={{ borderColor: 'var(--warning)', color: 'var(--warning)' }}>
            <AlertTriangle size={12} className="mt-0.5 shrink-0"/>
            提示词未变化，直接重生成可能浪费时间和 API 成本。
          </div>
        )}
        <div className="mb-2 flex items-center justify-between text-[10px]" style={{ color: 'var(--text-3)' }}>
          <span>预计草稿成本 ¥{estimatedCost.toFixed(2)}</span>
          <span>{changed ? '提示词已修改' : '提示词未修改'} · {referenceMode === 'generated' ? '当前图微调' : '原图重画'}</span>
        </div>
        <div className="flex gap-2">
          <button onClick={() => {
            void markUnsatisfied(nodeId, reasons.join(',') || 'detail', instruction)
            close(null)
          }} disabled={busy} className="btn btn-secondary flex-1 !text-[11px]">
            仅标记拒绝
          </button>
          <button onClick={confirm} disabled={busy || !prompt.trim()} className="btn btn-primary flex-1 !text-[11px]">
            <RefreshCw size={12}/>确认重生成
          </button>
        </div>
      </footer>
    </aside>
  )
}
