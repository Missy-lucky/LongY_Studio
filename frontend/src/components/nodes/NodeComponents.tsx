import { useEffect } from 'react'
import { Handle, Position } from '@xyflow/react'
import { Download, FileText, Image as ImageIcon, Pencil, Plus, Trash2 } from 'lucide-react'
import clsx from 'clsx'
import type { FlowCareInputNode, FlowCareOutputNode, FlowInputNode, FlowModelNode, FlowPoseNode, FlowReferenceNode, FlowProcessingNode, FlowOutputNode } from '../../types/node-system'
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
        <span className="truncate text-[13px] font-medium" style={{ color: 'var(--primary)' }}>
          {data.categoryGroup} · {data.categoryName}
        </span>
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

const REFERENCE_LABEL = {
  pose: '动作姿势参考',
  style: '风格/构图参考',
  detail: '商品细节证据',
} as const

function ProjectReferenceCard({
  id,
  data,
  child,
}: {
  id: string
  data: FlowPoseNode['data'] | FlowReferenceNode['data']
  child: boolean
}) {
  const openImageViewer = useNodeStore(s => s.openImageViewer)
  const removeProjectReference = useNodeStore(s => s.removeProjectReference)
  return (
    <div className="card workflow-node relative w-[220px] overflow-hidden !rounded-2xl"
      style={{ borderColor: data.role === 'pose' ? 'rgba(236,72,153,.38)' : 'rgba(20,184,166,.38)' }}>
      {child
        ? <Handle type="target" position={Position.Left} className={portStyle}/>
        : <Handle type="source" position={Position.Right} className={portStyle}/>}
      <div className="flex items-center gap-2 px-3 pb-2 pt-3">
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-medium" style={{ color: data.role === 'pose' ? '#EC4899' : '#14B8A6' }}>
            {REFERENCE_LABEL[data.role]}
          </div>
          <div className="truncate text-[12px] font-semibold" style={{ color: 'var(--text)' }}>{data.name}</div>
        </div>
        <button className="btn btn-ghost !p-1.5" title="删除参考节点"
          onClick={event => { event.stopPropagation(); void removeProjectReference(id) }}>
          <Trash2 size={12}/>
        </button>
      </div>
      <div className="mx-3 mb-3 aspect-[4/3] cursor-zoom-in overflow-hidden rounded-xl"
        style={{ background: 'var(--bg-2)' }}
        onDoubleClick={event => {
          event.stopPropagation()
          openImageViewer({ src: data.image, title: data.name, subtitle: REFERENCE_LABEL[data.role] })
        }}>
        <img src={data.image} alt={data.name} draggable={false} className="pointer-events-none h-full w-full object-contain"/>
      </div>
    </div>
  )
}

export function PoseNodeComponent({ id, data }: { id: string; data: FlowPoseNode['data'] }) {
  return <ProjectReferenceCard id={id} data={data} child/>
}

export function ReferenceNodeComponent({ id, data }: { id: string; data: FlowReferenceNode['data'] }) {
  return <ProjectReferenceCard id={id} data={data} child={false}/>
}

export function CareInputNodeComponent({ data }: { data: FlowCareInputNode['data'] }) {
  const openCareEditor = useNodeStore(s => s.openCareEditor)
  return (
    <div className="card workflow-node relative w-[240px] !rounded-2xl"
      style={{ borderColor: 'rgba(217,119,6,.38)' }}>
      <Handle type="source" position={Position.Right} className={portStyle}/>
      <div className="flex items-start gap-3 px-4 py-3.5">
        <div className="rounded-lg p-2" style={{ color: '#D97706', background: 'rgba(217,119,6,.10)' }}>
          <FileText size={18}/>
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold" style={{ color: 'var(--text)' }}>洗护 / 面料信息</div>
          <div className="mt-1 truncate text-[10px]" style={{ color: 'var(--text-3)' }}>
            {data.cardCount ? `已生成 ${data.cardCount} 张 · ${data.latestProductName}` : '结构化录入，不由模型猜测'}
          </div>
        </div>
      </div>
      <button className="btn btn-secondary mx-4 mb-3 w-[calc(100%-2rem)] !min-h-[30px] !text-[11px]"
        onClick={event => { event.stopPropagation(); openCareEditor() }}>
        <Plus size={12}/>新建白底说明图
      </button>
    </div>
  )
}

export function CareOutputNodeComponent({ data }: { data: FlowCareOutputNode['data'] }) {
  const openImageViewer = useNodeStore(s => s.openImageViewer)
  const openCareEditor = useNodeStore(s => s.openCareEditor)
  return (
    <div className="card workflow-node relative w-[220px] overflow-hidden !rounded-2xl"
      style={{ borderColor: 'rgba(217,119,6,.38)' }}>
      <Handle type="target" position={Position.Left} className={portStyle}/>
      <div className="aspect-[3/4] cursor-zoom-in" style={{ background: 'var(--bg-2)' }}
        onDoubleClick={event => {
          event.stopPropagation()
          openImageViewer({ src: data.thumbnail, title: data.productName, subtitle: data.compositionSummary })
        }}>
        <img src={data.thumbnail} alt={data.productName} draggable={false}
          className="pointer-events-none h-full w-full object-contain"/>
      </div>
      <div className="flex items-center gap-2 px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12px] font-medium" style={{ color: 'var(--text)' }}>{data.productName}</div>
          <div className="mt-0.5 truncate text-[9px]" style={{ color: 'var(--text-3)' }}>{data.compositionSummary}</div>
        </div>
        <a className="btn btn-ghost !p-1.5" href={data.thumbnail} download={`${data.productName || '洗护说明'}.png`}
          title="下载白底 PNG" onClick={event => event.stopPropagation()}>
          <Download size={12}/>
        </a>
        <button className="btn btn-ghost !p-1.5" title="编辑并重新渲染"
          onClick={event => { event.stopPropagation(); openCareEditor(data.cardId) }}>
          <Pencil size={12}/>
        </button>
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
