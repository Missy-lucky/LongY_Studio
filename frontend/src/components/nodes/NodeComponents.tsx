import { useEffect } from 'react'
import { Handle, Position } from '@xyflow/react'
import { Image as ImageIcon } from 'lucide-react'
import clsx from 'clsx'
import type { FlowInputNode, FlowModelNode, FlowProcessingNode, FlowOutputNode } from '../../types/node-system'
import { STATUS_COLORS } from '../../types/node-system'
import { useNodeStore } from '../../stores/node-store'

const portStyle = '!w-2 !h-2 !border-none !bg-[var(--text-3)]'
const statusDot = 'absolute left-2 top-2 h-2.5 w-2.5 rounded-full border'

export function InputNodeComponent({ data, id }: { data: FlowInputNode['data']; id: string }) {
  const loadInputAttributes = useNodeStore(s => s.loadInputAttributes)
  const openImageViewer = useNodeStore(s => s.openImageViewer)
  const uploadImage = useNodeStore(s => s.uploadImage)

  const handleUpload = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = event => {
      const file = (event.target as HTMLInputElement).files?.[0]
      if (!file) return
      uploadImage(id, {
        id: `img-${Date.now()}`,
        fileName: file.name,
        thumbnailUrl: URL.createObjectURL(file),
        width: 800,
        height: 1000,
        fileSize: file.size,
      }, file)
    }
    input.click()
  }

  useEffect(
    () => { void loadInputAttributes(id) },
    [id, data.categoryId, loadInputAttributes],
  )

  const isEmpty = !data.image
  return (
    <div className={clsx('card workflow-node relative w-[220px] overflow-hidden !rounded-2xl', isEmpty && 'border-dashed')}
      style={{
        borderColor: isEmpty ? 'color-mix(in srgb, var(--text-3) 70%, transparent)' : undefined,
        opacity: isEmpty ? 0.74 : 1,
      }}>
      <Handle type="source" position={Position.Right} className={portStyle}/>
      <div className="flex items-center justify-between px-3 pb-1 pt-2.5">
        <span className="truncate text-[13px] font-medium" style={{ color: 'var(--primary)' }}>{data.categoryName}</span>
        {data.image?.remote && <span className="h-2 w-2 rounded-full bg-emerald-500" title="素材已入库"/>}
      </div>
      <div
        className="relative mx-3 mb-3 aspect-[4/5] overflow-hidden rounded-xl"
        style={{ background: 'var(--bg-2)', cursor: !data.image || data.status === 'error' ? 'pointer' : 'zoom-in' }}
        title={!data.image || data.status === 'error' ? '点击上传素材' : '双击预览；Alt+点击替换素材'}
        onClick={event => {
          if (!data.image || data.status === 'error' || event.altKey) {
            event.stopPropagation()
            handleUpload()
          }
        }}
        onDoubleClick={event => {
          if (!data.image) return
          event.stopPropagation()
          openImageViewer({
            src: data.image.thumbnailUrl,
            title: data.image.fileName || data.categoryName,
            subtitle: `${data.categoryName} · 原始输入素材`,
          })
        }}>
        {data.image
          ? <img src={data.image.thumbnailUrl} alt={data.categoryName} draggable={false}
              className="pointer-events-none h-full w-full object-contain"/>
          : <div className="flex h-full flex-col items-center justify-center gap-1.5">
              <ImageIcon size={18} strokeWidth={1.5} style={{ color: 'var(--text-3)', opacity: 0.5 }}/>
              <span className="text-[10px]" style={{ color: 'var(--text-3)' }}>点击上传</span>
            </div>}
        {data.status === 'error' && (
          <div className="absolute inset-x-2 bottom-2 rounded-md bg-red-500/88 px-2 py-1 text-[10px] leading-4 text-white">
            素材导入失败
          </div>
        )}
      </div>
    </div>
  )
}

export function ModelNodeComponent({ data }: { data: FlowModelNode['data'] }) {
  const openImageViewer = useNodeStore(s => s.openImageViewer)
  return (
    <div className="card workflow-node relative w-[220px] overflow-hidden !rounded-2xl"
      style={{ borderColor: 'rgba(139,92,246,0.32)' }}>
      <Handle type="source" position={Position.Right} className={portStyle}/>
      <div className="px-3 pb-2 pt-3">
        <span className="text-[11px] font-medium" style={{ color: '#8B5CF6' }}>模特身份</span>
        <div className="mt-1 truncate text-[13px] font-semibold" style={{ color: 'var(--text)' }}>{data.styleName}</div>
      </div>
      <div className="relative mx-3 mb-3 aspect-[2/3] cursor-zoom-in overflow-hidden rounded-xl"
        style={{ background: 'var(--bg-2)' }}
        onDoubleClick={event => {
          event.stopPropagation()
          openImageViewer({
            src: data.modelImage.replace('?variant=preview', ''),
            title: data.styleName,
            subtitle: '完整参考图',
          })
        }}>
        {data.modelImage
          ? <img src={data.modelImage} alt={data.styleName} draggable={false}
              className="pointer-events-none h-full w-full object-contain" decoding="async"/>
          : <div className="flex h-full items-center justify-center text-lg">👗</div>}
      </div>
    </div>
  )
}

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
          <div className="flex justify-between"><span>预计</span><span className="font-mono">{data.estimatedCount} 张</span></div>
          <div className="flex justify-between"><span>成本</span><span className="font-mono">¥{data.estimatedCost}</span></div>
        </div>
        {data.status === 'running' && (
          <div className="progress-track mt-2"><div className="progress-fill" style={{ width: '60%' }}/></div>
        )}
      </div>
    </div>
  )
}

const OUTPUT_STATUS_TEXT: Record<string, string> = {
  pending: '待审核', satisfied: '已满意', unsatisfied: '待修正', generating: '生成中',
  failed: '失败', locked: '已锁定', saved: '已保存', exported: '已导出', queued: '排队中',
}

export function OutputNodeComponent({ data }: { data: FlowOutputNode['data'] }) {
  const openImageViewer = useNodeStore(s => s.openImageViewer)
  const color = STATUS_COLORS[data.status]
  return (
    <div className="card workflow-node relative w-[220px] overflow-hidden !rounded-2xl"
      style={{ borderColor: data.status !== 'queued' ? color : undefined }}>
      <Handle type="target" position={Position.Left} className={portStyle}/>
      {data.status === 'unsatisfied' && <Handle type="source" position={Position.Right} className={portStyle}/>}
      <div className={clsx('relative w-full', data.imageType === 'model' ? 'aspect-[3/4]' : 'aspect-square')}
        style={{ background: 'var(--bg-2)', cursor: data.thumbnail ? 'zoom-in' : 'default' }}
        title={`${data.taskCode} · ${OUTPUT_STATUS_TEXT[data.status] ?? '未知'}`}
        onDoubleClick={event => {
          if (!data.thumbnail) return
          event.stopPropagation()
          openImageViewer({
            src: data.thumbnail,
            title: data.shotName || data.taskName,
            subtitle: `${data.taskCode} · 第 ${data.version} 版`,
          })
        }}>
        {data.thumbnail
          ? <img src={data.thumbnail} alt={data.taskName} draggable={false}
              className="pointer-events-none h-full w-full object-contain"/>
          : data.status === 'generating' || data.status === 'queued'
            ? <div className="skeleton absolute inset-0"/>
            : <div className="flex h-full items-center justify-center">
                <ImageIcon size={20} strokeWidth={1.5} style={{ color: 'var(--text-3)', opacity: 0.3 }}/>
              </div>}
        <span className={statusDot}
          style={{ background: color, borderColor: 'rgba(255,255,255,.72)', boxShadow: '0 0 0 3px rgba(15,23,42,.10)' }}
          title={OUTPUT_STATUS_TEXT[data.status]}/>
      </div>
      <div className="px-3 py-2">
        <div className="truncate text-[12px] font-medium" style={{ color: 'var(--text)' }}>
          {data.shotName || data.taskName}
        </div>
        <div className="mt-0.5 truncate font-mono text-[9px]" style={{ color: 'var(--text-3)' }}>
          {data.taskCode} · v{data.version}
        </div>
      </div>
    </div>
  )
}
