import { useEffect } from 'react'
import { Handle, Position } from '@xyflow/react'
import { Check, Image as ImageIcon, Lock, Maximize2, RefreshCw, Sparkles, Trash2, Upload, X } from 'lucide-react'
import clsx from 'clsx'
import type { FlowInputNode, FlowModelNode, FlowProcessingNode, FlowOutputNode } from '../../types/node-system'
import { STATUS_COLORS } from '../../types/node-system'
import { useNodeStore } from '../../stores/node-store'

const portStyle = '!w-2 !h-2 !border-none !bg-[var(--text-3)]'

// ============ 输入节点 ============
export function InputNodeComponent({ data, id }: { data: FlowInputNode['data']; id: string }) {
  const uploadImage = useNodeStore(s => s.uploadImage)
  const removeNode = useNodeStore(s => s.removeNode)
  const setChangeTypeTargetNodeId = useNodeStore(s => s.setChangeTypeTargetNodeId)
  const loadInputAttributes = useNodeStore(s => s.loadInputAttributes)
  const setInputAttribute = useNodeStore(s => s.setInputAttribute)
  const openImageViewer = useNodeStore(s => s.openImageViewer)

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
    <div className={clsx('group card relative w-[160px] overflow-hidden !rounded-xl',
      isEmpty && 'border-dashed')}
      style={{
        background: 'var(--surface)',
        borderColor: isEmpty ? 'var(--text-3)' : 'var(--border)',
        opacity: isEmpty ? 0.6 : 1,
      }}>
      <Handle type="source" position={Position.Right} className={portStyle}/>

      {/* 头部 */}
      <div className="flex items-center justify-between px-3 pt-2.5 pb-1">
        <button onClick={() => setChangeTypeTargetNodeId(id)}
          className="flex !min-h-[36px] !min-w-[36px] items-center gap-1.5 rounded-md px-1 text-xs font-medium transition-colors hover:bg-[var(--surface-hover)]"
          style={{ color: 'var(--primary)' }}>
          {data.categoryName}
        </button>
        <div className="flex gap-0.5">
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
      <div className="relative mx-2.5 mb-2.5 aspect-[4/5] overflow-hidden rounded-lg"
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
            <Upload size={16} strokeWidth={1.5} style={{ color: 'var(--text-3)' }}/>
            <span className="text-[10px]" style={{ color: 'var(--text-3)' }}>点击上传</span>
          </div>
        )}
        {/* Backend status */}
        {data.image?.remote && (
          <div className="absolute right-1.5 top-1.5 rounded-full bg-black/55 p-1">
            <Check size={10} strokeWidth={2.5} className="text-emerald-400"/>
          </div>
        )}
        {data.status === 'error' && (
          <div className="absolute inset-x-1.5 bottom-1.5 rounded bg-red-500/85 px-1.5 py-1 text-[9px] leading-3 text-white">
            {data.image?.error || 'Backend import failed'}
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
              className="flex h-9 w-9 items-center justify-center rounded-md bg-black/60 text-white transition-colors hover:bg-black/80"
              title="双击或点击放大查看">
              <Maximize2 size={11} strokeWidth={1.8}/>
            </button>
            <button
              onClick={event => { event.stopPropagation(); handleUpload() }}
              className="flex h-9 w-9 items-center justify-center rounded-md bg-black/60 text-white transition-colors hover:bg-black/80"
              title="替换素材">
              <RefreshCw size={11} strokeWidth={1.8}/>
            </button>
          </div>
        )}
      </div>

      {data.attributeOptions.length > 0 && (
        <div className="mx-2.5 mb-2.5 rounded-lg border p-2" style={{ borderColor: 'var(--border)' }}>
          <div className="mb-1 text-[9px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-3)' }}>
            商品属性
          </div>
          <div className="max-h-[92px] space-y-1 overflow-y-auto pr-1">
            {data.attributeOptions.map(attribute => (
              <label
                key={attribute.key}
                className={`flex items-center gap-1.5 text-[10px] ${data.image?.remote ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                style={{ color: 'var(--text-2)' }}
                onMouseDown={event => event.stopPropagation()}
              >
                <input
                  type="checkbox"
                  checked={Boolean(data.attributes[attribute.key])}
                  onChange={event => setInputAttribute(id, attribute.key, event.target.checked)}
                  disabled={Boolean(data.image?.remote)}
                  className="h-3 w-3 accent-[var(--primary)]"
                />
                <span className="truncate" title={attribute.label}>{attribute.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ============ 模特节点 ============
export function ModelNodeComponent({ data, id }: { data: FlowModelNode['data']; id: string }) {
  const setModelPickerOpen = useNodeStore(s => s.setModelPickerOpen)
  const openImageViewer = useNodeStore(s => s.openImageViewer)
  return (
    <div className="card relative w-[160px] overflow-hidden !rounded-xl"
      style={{ background: 'var(--surface)', borderColor: 'rgba(139,92,246,0.3)' }}>
      <Handle type="source" position={Position.Right} className={portStyle}/>
      <div className="flex items-center justify-between px-3 pt-2.5 pb-1">
        <span className="flex items-center gap-1.5 text-xs font-medium" style={{ color: '#8B5CF6' }}>
          <Sparkles size={11} strokeWidth={1.5}/>模特身份
        </span>
      </div>
      <div className="relative mx-2.5 mb-2.5 aspect-[2/3] w-[calc(100%-20px)] cursor-zoom-in overflow-hidden rounded-lg"
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
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/65 to-transparent px-2 py-1.5">
          <span className="block truncate text-[10px] font-medium text-white">{data.styleName}</span>
          <span className="text-[8px] text-white/70">完整定稿参考 · 不裁切</span>
        </div>
        <button
          onClick={() => setModelPickerOpen(true)}
          className="flex !min-h-[36px] !min-w-[44px] items-center justify-center rounded-md bg-black/55 px-2 text-[9px] text-white transition-colors hover:bg-black/75"
          title="切换模特身份">
          切换
        </button>
      </div>
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
    <div className="card relative w-[180px] !rounded-xl"
      style={{ background: 'var(--surface)', borderColor: data.status !== 'idle' ? statusColor : 'var(--border)' }}>
      <Handle type="target" position={Position.Left} className={portStyle}/>
      <Handle type="source" position={Position.Right} className={portStyle}/>

      <div className="px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold" style={{ color: 'var(--text)' }}>{data.title}</span>
          <span className="ml-auto h-2 w-2 rounded-full" style={{ background: statusColor }}/>
        </div>
        <div className="mt-2 space-y-1 text-[10px]" style={{ color: 'var(--text-3)' }}>
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
export function OutputNodeComponent({ data, id }: { data: FlowOutputNode['data']; id: string }) {
  const markSatisfied = useNodeStore(s => s.markSatisfied)
  const markUnsatisfied = useNodeStore(s => s.markUnsatisfied)
  const regenerate = useNodeStore(s => s.regenerate)
  const lockOutput = useNodeStore(s => s.lockOutput)
  const removeOutput = useNodeStore(s => s.removeOutput)
  const openImageViewer = useNodeStore(s => s.openImageViewer)

  const status = data.status
  const color = STATUS_COLORS[status]
  const thumbnailUrl = data.thumbnail

  return (
    <div className={clsx('group card relative overflow-hidden !rounded-xl', 'w-[160px]')}
      style={{
        background: 'var(--surface)',
        borderColor: status !== 'queued' ? color : 'var(--border)',
        boxShadow: status === 'satisfied' ? '0 0 0 1px #22C55E' :
                   status === 'locked' ? '0 0 0 1px #0EA5E9' :
                   status === 'unsatisfied' ? '0 0 0 1px #EF4444' : undefined,
      }}>
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
            subtitle: `${data.taskCode} · v${data.version} · 双击缩放`,
          })
        }}>
        {data.thumbnail ? (
          <img src={data.thumbnail} alt={data.taskName} draggable={false}
            className="pointer-events-none h-full w-full object-contain"/>
        ) : status === 'generating' || status === 'queued' ? (
          <div className="skeleton absolute inset-0"/>
        ) : (
          <div className="flex h-full items-center justify-center">
            <ImageIcon size={16} strokeWidth={1.5} style={{ color: 'var(--text-3)', opacity: 0.3 }}/>
          </div>
        )}

        {/* 状态角标 */}
        <div className="absolute left-1.5 top-1.5 flex items-center gap-1 rounded-full px-1.5 py-0.5"
          style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }}/>
          <span className="text-[9px] font-medium" style={{ color }}>
            {status === 'pending' ? '待审核' :
             status === 'satisfied' ? '满意' :
             status === 'unsatisfied' ? '不满意' :
             status === 'generating' ? '生成中' :
             status === 'failed' ? '失败' :
             status === 'locked' ? '已锁定' :
             status === 'saved' ? '已保存' :
             status === 'exported' ? '已导出' : '排队'}
          </span>
        </div>

        {/* 版本号 */}
        {data.version > 1 && (
          <span className="absolute right-1.5 top-1.5 rounded px-1 py-0.5 font-mono text-[9px]"
            style={{ background: 'rgba(0,0,0,0.5)', color: '#F59E0B' }}>
            v{data.version}
          </span>
        )}

        {thumbnailUrl && (
          <button
            onClick={event => {
              event.stopPropagation()
              openImageViewer({
                src: thumbnailUrl,
                title: data.taskName,
                subtitle: `${data.taskCode} · v${data.version} · 双击缩放`,
              })
            }}
            className="absolute right-1.5 top-1.5 flex h-9 w-9 items-center justify-center rounded-md bg-black/60 text-white opacity-0 transition-opacity hover:opacity-100 focus:opacity-100 group-hover:opacity-100"
            title="双击或点击放大查看">
            <Maximize2 size={11} strokeWidth={1.8}/>
          </button>
        )}

        {status === 'pending' && (
          <div className="absolute inset-x-1.5 bottom-1.5 flex gap-1">
            <button onClick={event => { event.stopPropagation(); void markSatisfied(id) }}
              className="btn flex-1 !min-h-[36px] !rounded-lg !text-xs"
              style={{ background: 'rgba(34,197,94,0.82)', color: 'white' }}>
              <Check size={12} strokeWidth={2}/>满意
            </button>
            <button onClick={event => { event.stopPropagation(); void markUnsatisfied(id) }}
              className="btn flex-1 !min-h-[36px] !rounded-lg !text-xs"
              style={{ background: 'rgba(239,68,68,0.82)', color: 'white' }}>
              <X size={12} strokeWidth={2}/>不满意
            </button>
          </div>
        )}
        {status === 'satisfied' && (
          <button onClick={event => { event.stopPropagation(); void lockOutput(id) }}
            className="btn absolute inset-x-1.5 bottom-1.5 !min-h-[36px] !rounded-lg !text-xs"
            style={{ background: 'rgba(14,165,233,0.86)', color: 'white' }}>
            <Lock size={12} strokeWidth={2}/>锁定版本
          </button>
        )}
        {status === 'failed' && (
          <button onClick={event => { event.stopPropagation(); void regenerate(id) }}
            className="btn absolute inset-x-1.5 bottom-1.5 !min-h-[36px] !rounded-lg !text-xs"
            style={{ background: 'rgba(239,68,68,0.86)', color: 'white' }}>
            <RefreshCw size={12} strokeWidth={1.5}/>重试生成
          </button>
        )}
        {status === 'unsatisfied' && (
          <button onClick={event => { event.stopPropagation(); void regenerate(id) }}
            className="btn absolute inset-x-1.5 bottom-1.5 !min-h-[36px] !rounded-lg !text-xs"
            style={{ background: 'rgba(245,158,11,0.88)', color: 'white' }}>
            <RefreshCw size={12} strokeWidth={1.5}/>重生成 v{data.version + 1}
          </button>
        )}
      </div>

      {/* 底部信息 */}
      <div className="px-2.5 py-2">
        <div className="truncate text-[11px] font-medium" style={{ color: 'var(--text)' }}>
          {data.taskName}
        </div>
        <div className="mt-0.5 flex items-center justify-between">
          <span className="font-mono text-[9px]" style={{ color: 'var(--text-3)' }}>{data.taskCode}</span>
          <div className="flex items-center gap-1">
            <span className="font-mono text-[9px]" style={{ color: 'var(--text-3)' }}>¥{data.cost}</span>
            <button
              onClick={() => removeOutput(id)}
              className="flex h-9 w-9 items-center justify-center rounded-md opacity-50 transition-all hover:bg-[var(--surface-hover)] hover:opacity-100"
              style={{ color: 'var(--text-3)' }}
              title="从本次方案移除"
              aria-label={`移除${data.taskCode}`}>
              <Trash2 size={11} strokeWidth={1.6}/>
            </button>
          </div>
        </div>
      </div>

    </div>
  )
}


