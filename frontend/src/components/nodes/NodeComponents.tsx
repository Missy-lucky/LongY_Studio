import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Handle, Position } from '@xyflow/react'
import { Check, Image as ImageIcon, Lock, Maximize2, RefreshCw, SlidersHorizontal, Sparkles, Trash2, Upload, X } from 'lucide-react'
import clsx from 'clsx'
import type { FlowInputNode, FlowModelNode, FlowProcessingNode, FlowOutputNode } from '../../types/node-system'
import { STATUS_COLORS } from '../../types/node-system'
import { useNodeStore } from '../../stores/node-store'

const portStyle = '!w-2 !h-2 !border-none !bg-[var(--text-3)]'
const PRIORITY_COLORS: Record<string, string> = {
  P0: '#EF4444',
  P1: '#F59E0B',
  P2: '#64748B',
}

// ============ 输入节点 ============
export function InputNodeComponent({ data, id }: { data: FlowInputNode['data']; id: string }) {
  const uploadImage = useNodeStore(s => s.uploadImage)
  const removeNode = useNodeStore(s => s.removeNode)
  const setChangeTypeTargetNodeId = useNodeStore(s => s.setChangeTypeTargetNodeId)
  const loadInputAttributes = useNodeStore(s => s.loadInputAttributes)
  const setInputAttribute = useNodeStore(s => s.setInputAttribute)
  const openImageViewer = useNodeStore(s => s.openImageViewer)
  const [attributesOpen, setAttributesOpen] = useState(false)

  useEffect(
    () => { void loadInputAttributes(id) },
    [id, data.categoryId, loadInputAttributes],
  )

  const handleUpload = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = e => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      const objectUrl = URL.createObjectURL(file)
      uploadImage(id, {
        id: `img-${Date.now()}`,
        fileName: file.name,
        thumbnailUrl: objectUrl,
        width: 800, height: 1000, fileSize: file.size,
      }, file)
    }
    input.click()
  }

  const isEmpty = !data.image

  return (
    <div className={clsx('group card workflow-node relative w-[220px] overflow-hidden !rounded-2xl', isEmpty && 'border-dashed')}
      style={{
        borderColor: isEmpty ? 'color-mix(in srgb, var(--text-3) 70%, transparent)' : undefined,
        opacity: isEmpty ? 0.74 : 1,
      }}>
      <Handle type="source" position={Position.Right} className={portStyle}/>

      {/* 头部 */}
      <div className="flex items-center justify-between px-3 pt-2.5 pb-1">
        <button onClick={() => setChangeTypeTargetNodeId(id)}
          className="flex !min-h-[36px] items-center gap-2 rounded-md px-1 text-[13px] font-medium transition-colors hover:bg-[var(--surface-hover)]"
          style={{ color: 'var(--primary)' }}>
          {data.categoryName}
          {data.image?.remote && <span className="h-2 w-2 rounded-full bg-emerald-500" title="素材已入库"/>}
        </button>
        <div className="flex gap-0.5">
          {data.attributeOptions.length > 0 && (
            <button
              onClick={event => {
                event.stopPropagation()
                setAttributesOpen(true)
              }}
              className="flex h-9 w-9 items-center justify-center rounded-md opacity-60 transition-all hover:bg-[var(--surface-hover)] hover:opacity-100 focus:opacity-100 group-hover:opacity-100"
              style={{ color: 'var(--primary)' }}
              title="设置商品属性"
              aria-label={`设置${data.categoryName}商品属性`}>
              <SlidersHorizontal size={12} strokeWidth={1.6}/>
            </button>
          )}
          <button
            onClick={() => removeNode(id)}
            className="flex h-9 w-9 items-center justify-center rounded-md opacity-60 transition-all hover:bg-[var(--surface-hover)] hover:opacity-100 focus:opacity-100 group-hover:opacity-100"
            style={{ color: 'var(--text-3)' }}
            title="删除此素材节点"
            aria-label={`删除${data.categoryName}素材节点`}>
            <Trash2 size={12} strokeWidth={1.6}/>
          </button>
        </div>
      </div>

      {/* 图片区域 */}
      <div className="relative mx-3 mb-3 aspect-[4/5] overflow-hidden rounded-xl"
        style={{ background: 'var(--bg-2)', cursor: data.image ? 'zoom-in' : 'pointer' }}
        onClick={() => { if (!data.image) handleUpload() }}
        onDoubleClick={event => {
          if (!data.image) return
          event.stopPropagation()
          openImageViewer({
            src: data.image.thumbnailUrl,
            title: data.image.fileName || data.categoryName,
            subtitle: `${data.categoryName} · 原始输入素材`,
          })
        }}>
        {data.image ? (
          <img src={data.image.thumbnailUrl} alt={data.categoryName} draggable={false}
            className="pointer-events-none h-full w-full object-contain"/>
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1.5">
            <Upload size={18} strokeWidth={1.5} style={{ color: 'var(--text-3)' }}/>
            <span className="text-[11px]" style={{ color: 'var(--text-3)' }}>点击上传</span>
          </div>
        )}
        {data.status === 'error' && (
          <div className="absolute inset-x-2 bottom-2 rounded-md bg-red-500/88 px-2 py-1.5 text-[10px] leading-4 text-white">
            {data.image?.error || '后端导入失败'}
          </div>
        )}
        {/* 图片操作 */}
        {data.image && (
          <div className="absolute bottom-1.5 right-1.5 flex gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
            <button
              onClick={event => {
                event.stopPropagation()
                openImageViewer({
                  src: data.image!.thumbnailUrl,
                  title: data.image!.fileName || data.categoryName,
                  subtitle: `${data.categoryName} · 原始输入素材`,
                })
              }}
              className="node-action-button bg-black/45 text-white hover:bg-black/65"
              title="双击或点击放大查看">
              <Maximize2 size={13} strokeWidth={1.8}/>
            </button>
            <button
              onClick={event => { event.stopPropagation(); handleUpload() }}
              className="node-action-button bg-black/45 text-white hover:bg-black/65"
              title="替换素材">
              <RefreshCw size={13} strokeWidth={1.8}/>
            </button>
          </div>
        )}
      </div>

      {attributesOpen && createPortal(
        <div
          className="fixed inset-0 z-[260] flex items-center justify-center bg-black/60 p-6"
          onMouseDown={() => setAttributesOpen(false)}
        >
          <div
            className="w-[320px] rounded-2xl border p-4"
            style={{ background: 'var(--surface)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-lg)' }}
            onMouseDown={event => event.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold">{data.categoryName}属性</div>
                <div className="mt-0.5 text-[10px] text-text-muted">上传前勾选实际存在的结构特征</div>
              </div>
              <button onClick={() => setAttributesOpen(false)} className="btn btn-secondary !px-2 !py-1.5">
                <X size={13}/>
              </button>
            </div>
            <div className="mt-3 max-h-[320px] space-y-1 overflow-y-auto pr-1">
              {data.attributeOptions.map(attribute => (
                <label
                  key={attribute.key}
                  className={`flex items-center gap-2 rounded-lg px-2 py-2 text-xs transition-colors ${data.image?.remote ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-[var(--surface-hover)]'}`}
                  style={{ color: 'var(--text-2)' }}
                >
                  <input
                    type="checkbox"
                    checked={Boolean(data.attributes[attribute.key])}
                    onChange={event => setInputAttribute(id, attribute.key, event.target.checked)}
                    disabled={Boolean(data.image?.remote)}
                    className="h-3.5 w-3.5 accent-[var(--primary)]"
                  />
                  <span>{attribute.label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}

// ============ 模特节点 ============
export function ModelNodeComponent({ data, id }: { data: FlowModelNode['data']; id: string }) {
  const setModelPickerOpen = useNodeStore(s => s.setModelPickerOpen)
  const openImageViewer = useNodeStore(s => s.openImageViewer)
  return (
    <div className="card workflow-node relative w-[220px] overflow-hidden !rounded-2xl"
      style={{ borderColor: 'rgba(139,92,246,0.32)' }}>
      <Handle type="source" position={Position.Right} className={portStyle}/>
      <div className="flex items-start justify-between gap-2 px-3 pt-3 pb-2">
        <div className="min-w-0">
          <span className="flex items-center gap-1.5 text-[11px] font-medium" style={{ color: '#8B5CF6' }}>
            <Sparkles size={12} strokeWidth={1.5}/>模特身份
          </span>
          <div className="mt-1 truncate text-[13px] font-semibold" style={{ color: 'var(--text)' }}>{data.styleName}</div>
        </div>
        <button onClick={() => setModelPickerOpen(true)}
          className="node-action-button"
          style={{ backgroundColor: 'rgba(139,92,246,.10)', borderColor: 'rgba(139,92,246,.24)', color: '#8B5CF6' }}
          title="切换模特身份" aria-label={`切换${data.styleName}`}>
          <RefreshCw size={13} strokeWidth={1.7}/>
        </button>
      </div>
      <div className="relative mx-3 mb-3 aspect-[2/3] w-[calc(100%-24px)] cursor-zoom-in overflow-hidden rounded-xl"
        style={{ background: 'var(--bg-2)' }}
        onDoubleClick={event => {
          event.stopPropagation()
          openImageViewer({
            src: data.modelImage.replace('?variant=preview', ''),
            title: data.styleName,
            subtitle: 'v2 定稿身份 · 完整参考图',
          })
        }}>
        {data.modelImage
          ? <img
              src={data.modelImage}
              alt={data.styleName}
              draggable={false}
              className="pointer-events-none h-full w-full object-contain"
              decoding="async"
              loading="eager"/>
          : <div className="flex h-full flex-col items-center justify-center gap-1">
              <span className="text-lg">👗</span>
              <span className="text-[10px] font-medium" style={{ color: '#8B5CF6' }}>{data.styleName}</span>
            </div>}
      </div>
      <div className="px-3 pb-3 text-[10px]" style={{ color: 'var(--text-3)' }}>完整定稿参考 · 不裁切</div>
    </div>
  )
}

// ============ 处理节点 ============
export function ProcessingNodeComponent({ data }: { data: FlowProcessingNode['data'] }) {
  const statusColor = data.status === 'running' ? 'var(--primary)'
    : data.status === 'done' ? 'var(--success)'
    : data.status === 'failed' ? 'var(--error)'
    : 'var(--text-3)'

  return (
    <div className="card workflow-node workflow-node--processing relative w-[240px] !rounded-2xl"
      style={{ borderColor: data.status !== 'idle' ? statusColor : undefined }}>
      <Handle type="target" position={Position.Left} className={portStyle}/>
      <Handle type="source" position={Position.Right} className={portStyle}/>

      <div className="px-4 py-3.5">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold" style={{ color: 'var(--text)' }}>{data.title}</span>
          <span className="ml-auto h-2 w-2 rounded-full" style={{ background: statusColor }}/>
        </div>
        <div className="mt-2.5 space-y-1.5 text-[11px]" style={{ color: 'var(--text-3)' }}>
          <div className="flex justify-between">
            <span>模型</span><span className="font-mono">mock</span>
          </div>
          <div className="flex justify-between">
            <span>预计</span><span className="font-mono">{data.estimatedCount} 张</span>
          </div>
          <div className="flex justify-between">
            <span>成本</span><span className="font-mono">¥{data.estimatedCost}</span>
          </div>
        </div>
        {data.status === 'running' && (
          <div className="progress-track mt-2">
            <div className="progress-fill" style={{ width: '60%' }}/>
          </div>
        )}
      </div>
    </div>
  )
}

// ============ 输出节点 ============
const OUTPUT_STATUS_TEXT: Record<string, string> = {
  pending: '待审核',
  satisfied: '已满意',
  unsatisfied: '已拒绝',
  generating: '生成中',
  failed: '失败',
  locked: '已锁定',
  saved: '已保存',
  exported: '已导出',
  queued: '排队中',
}

export function OutputNodeComponent({ data, id }: { data: FlowOutputNode['data']; id: string }) {
  const markSatisfied = useNodeStore(s => s.markSatisfied)
  const markUnsatisfied = useNodeStore(s => s.markUnsatisfied)
  const regenerate = useNodeStore(s => s.regenerate)
  const startHdRepair = useNodeStore(s => s.startHdRepair)
  const openVersionQc = useNodeStore(s => s.openVersionQc)
  const lockOutput = useNodeStore(s => s.lockOutput)
  const removeOutput = useNodeStore(s => s.removeOutput)
  const openImageViewer = useNodeStore(s => s.openImageViewer)

  const status = data.status
  const color = STATUS_COLORS[status]
  const thumbnailUrl = data.thumbnail
  const statusText = OUTPUT_STATUS_TEXT[status] ?? '未知'

  return (
    <div
      className="group card workflow-node relative w-[220px] overflow-hidden !rounded-2xl"
      style={{ borderColor: status !== 'queued' ? color : undefined }}
    >
      <Handle type="target" position={Position.Left} className={portStyle}/>
      {status === 'unsatisfied' && <Handle type="source" position={Position.Right} className={portStyle}/>}

      <div
        className={clsx('relative w-full', data.imageType === 'model' ? 'aspect-[3/4]' : 'aspect-square')}
        style={{ background: 'var(--bg-2)', cursor: data.thumbnail ? 'zoom-in' : 'default' }}
        onDoubleClick={event => {
          if (!data.thumbnail) return
          event.stopPropagation()
          openImageViewer({
            src: data.thumbnail,
            title: data.taskName,
            subtitle: `${data.taskCode} · 第 ${data.version} 版 · 双击缩放`,
          })
        }}
      >
        {data.thumbnail ? (
          <img src={data.thumbnail} alt={data.taskName} draggable={false}
            className="pointer-events-none h-full w-full object-contain"/>
        ) : status === 'generating' || status === 'queued' ? (
          <div className="skeleton absolute inset-0"/>
        ) : (
          <div className="flex h-full items-center justify-center">
            <ImageIcon size={20} strokeWidth={1.5} style={{ color: 'var(--text-3)', opacity: 0.3 }}/>
          </div>
        )}

        <span
          className="absolute left-2 top-2 h-2.5 w-2.5 rounded-full border"
          style={{ background: color, borderColor: 'rgba(255,255,255,.72)', boxShadow: '0 0 0 3px rgba(15,23,42,.10)' }}
          title={statusText}
        />
        {thumbnailUrl && (
          <button
            onClick={event => {
              event.stopPropagation()
              openImageViewer({
                src: thumbnailUrl,
                title: data.taskName,
                subtitle: `${data.taskCode} · 第 ${data.version} 版 · 双击缩放`,
              })
            }}
            className="node-action-button absolute right-2 top-2 bg-black/40 text-white opacity-0 transition-opacity hover:bg-black/60 focus:opacity-100 group-hover:opacity-100"
            title="双击或点击放大查看"
            aria-label={`放大查看${data.taskCode}`}
          >
            <Maximize2 size={13} strokeWidth={1.8}/>
          </button>
        )}
      </div>

      <div className="px-3 pb-3 pt-2.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-medium"
            style={{ backgroundColor: `${color}1c`, color }}>{statusText}</span>
          <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[9px]"
            style={{
              backgroundColor: data.tier === 'hd' ? 'rgba(56,189,248,.12)' : 'rgba(100,116,139,.12)',
              color: data.tier === 'hd' ? '#0284C7' : 'var(--text-3)',
            }}>
            {data.tier === 'hd' ? '高清修复' : '草稿'}
          </span>
          {data.qcScore != null && (
            <button
              onClick={event => { event.stopPropagation(); void openVersionQc(id) }}
              className="shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-medium transition-colors"
              style={{
                backgroundColor: data.qcPassed ? 'rgba(34,197,94,.12)' : 'rgba(245,158,11,.14)',
                color: data.qcPassed ? '#16A34A' : '#B45309',
              }}
              title="查看一致性质检报告"
            >
              质检 {Math.round(data.qcScore * 100)}
            </button>
          )}
          {data.version > 1 && <span className="ml-auto shrink-0 font-mono text-[9px] text-text-muted">v{data.version}</span>}
        </div>

        <div className="mt-1.5 truncate text-[12px] font-medium" style={{ color: 'var(--text)' }} title={data.shotName || data.taskName}>
          {data.shotName || data.taskName}
        </div>
        <div className="mt-1 flex items-center justify-between gap-2">
          <span className="truncate font-mono text-[10px]" style={{ color: 'var(--text-3)' }}>
            {data.taskCode} · ¥{data.cost}
          </span>
          <button
            onClick={event => { event.stopPropagation(); removeOutput(id) }}
            className="node-action-button !h-8 !w-8"
            style={{ color: 'var(--text-3)' }}
            title="从本次方案移除"
            aria-label={`移除${data.taskCode}`}
          >
            <Trash2 size={12} strokeWidth={1.6}/>
          </button>
        </div>

        {status === 'pending' && (
          <div className="mt-2 flex justify-end gap-2">
            <button
              onClick={event => { event.stopPropagation(); void markSatisfied(id) }}
              className="node-action-button"
              style={{ backgroundColor: 'rgba(34,197,94,.10)', borderColor: 'rgba(34,197,94,.24)', color: '#16A34A' }}
              title="满意"
              aria-label={`满意${data.taskCode}`}
            >
              <Check size={15} strokeWidth={2.2}/>
            </button>
            <button
              onClick={event => { event.stopPropagation(); void markUnsatisfied(id) }}
              className="node-action-button"
              style={{ backgroundColor: 'rgba(239,68,68,.10)', borderColor: 'rgba(239,68,68,.24)', color: '#DC2626' }}
              title="不满意"
              aria-label={`不满意${data.taskCode}`}
            >
              <X size={15} strokeWidth={2.2}/>
            </button>
          </div>
        )}
        {status === 'satisfied' && (
          <div className="mt-2 flex justify-end gap-2">
            <button
              onClick={event => { event.stopPropagation(); void lockOutput(id) }}
              className="node-action-button"
              style={{ backgroundColor: 'rgba(14,165,233,.10)', borderColor: 'rgba(14,165,233,.24)', color: '#0284C7' }}
              title="锁定版本"
              aria-label={`锁定${data.taskCode}`}
            >
              <Lock size={14} strokeWidth={1.9}/>
            </button>
            {data.tier === 'draft' && (
              <button
                onClick={event => { event.stopPropagation(); void startHdRepair(id) }}
                className="node-action-button"
                style={{ backgroundColor: 'rgba(56,189,248,.10)', borderColor: 'rgba(56,189,248,.26)', color: '#0284C7' }}
                title="两阶段高清：基础生成 + 细节修复"
                aria-label={`高清修复${data.taskCode}`}
              >
                <Sparkles size={14} strokeWidth={1.8}/>
              </button>
            )}
          </div>
        )}
        {(status === 'failed' || status === 'unsatisfied') && (
          <div className="mt-2 flex justify-end">
            <button
              onClick={event => { event.stopPropagation(); void regenerate(id) }}
              className="node-action-button"
              style={{
                backgroundColor: status === 'failed' ? 'rgba(239,68,68,.10)' : 'rgba(245,158,11,.12)',
                borderColor: status === 'failed' ? 'rgba(239,68,68,.24)' : 'rgba(245,158,11,.26)',
                color: status === 'failed' ? '#DC2626' : '#B45309',
              }}
              title={status === 'failed' ? '重试生成' : `重生成第 ${data.version + 1} 版`}
              aria-label={status === 'failed' ? `重试${data.taskCode}` : `重生成${data.taskCode}`}
            >
              <RefreshCw size={14} strokeWidth={1.8}/>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
