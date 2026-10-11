import { Handle, Position } from '@xyflow/react'
import { Image } from 'lucide-react'
import type { GenTask, ProductItem, WorkMode } from '../../types/domain'
import { STATUS_META, STAGE_LABEL, TYPE_META } from '../../lib/status'

export interface TaskNodeData extends Record<string, unknown> {
  task: GenTask; mode: WorkMode; selected: boolean; onOpen: () => void
}
export interface MaterialNodeData extends Record<string, unknown> {
  item: ProductItem; categoryName: string; viewCount: number; requiredCount: number; thumbUrl: string | null; onOpen: () => void
}
export interface GroupNodeData extends Record<string, unknown> {
  label: string; icon: string; total: number; done: number; running: number; failed: number
}
export interface PlanNodeData extends Record<string, unknown> { total: number; estimated: number; cached: number }
export interface GateNodeData extends Record<string, unknown> { review: number; accepted: number; rejected: number; locked: number }
export interface ExportNodeData extends Record<string, unknown> { exported: number; path: string }

export function TaskNode({ data }: { data: TaskNodeData }) {
  const { task, mode } = data
  const m = STATUS_META[task.status]
  const cur = task.versions.find(v => v.id === task.currentVersionId)
  const big = mode === 'review'

  return (
    <div
      onClick={data.onOpen}
      className="group relative cursor-pointer overflow-hidden rounded-2xl transition-all duration-300"
      style={{
        width: big ? 220 : 180,
        background: 'var(--apple-surface)',
        boxShadow: data.selected
          ? '0 4px 20px rgba(0,0,0,0.1), 0 0 0 2px var(--apple-blue)'
          : 'var(--apple-shadow)',
      }}
      onMouseEnter={e => { if (!data.selected) e.currentTarget.style.boxShadow = 'var(--apple-shadow-lg)' }}
      onMouseLeave={e => { if (!data.selected) e.currentTarget.style.boxShadow = 'var(--apple-shadow)' }}>
      <Handle type="target" position={Position.Left} />

      {/* 图片区 */}
      <div style={{ height: big ? 140 : 90, background: 'var(--apple-bg)' }} className="relative flex items-center justify-center overflow-hidden">
        {cur?.thumbnail ? (
          <img src={cur.thumbnail} alt={task.name}
            className="h-full w-full object-cover"
            style={{ transform: 'none' }}
            draggable={false} />
        ) : task.status === 'generating' ? (
          <div className="shimmer flex h-full w-full flex-col items-center justify-center gap-2">
            <div className="anim-spin h-5 w-5 rounded-full border-2 border-transparent"
              style={{ borderTopColor: 'var(--apple-blue)' }} />
            <span className="t-micro">{cur?.stage ? STAGE_LABEL[cur.stage] : ''}</span>
          </div>
        ) : (
          <Image size={18} style={{ color: 'var(--apple-text-3)', opacity: 0.4 }} />
        )}
      </div>

      {/* 信息区：只有名字和一行状态 */}
      <div className="px-3 py-2.5">
        <div className="truncate text-[13px] font-medium leading-snug" style={{ color: 'var(--apple-text)' }}>
          {task.name}
        </div>
        <div className="mt-0.5 flex items-center justify-between">
          <span className="text-[11px]" style={{ color: 'var(--apple-text-3)' }}>
            {TYPE_META[task.type].label} · {task.tier === 'draft' ? '草稿' : '高清'}
          </span>
          <span className="flex items-center gap-1 text-[11px] font-medium" style={{ color: m.dot }}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: m.dot }} />
            {m.label}
          </span>
        </div>
      </div>

      <Handle type="source" position={Position.Right} />
    </div>
  )
}

export function MaterialNode({ data }: { data: MaterialNodeData }) {
  return (
    <div onClick={data.onOpen}
      className="flex w-[150px] cursor-pointer items-center gap-3 rounded-2xl p-2.5 transition-all duration-300"
      style={{ background: 'var(--apple-surface)', boxShadow: 'var(--apple-shadow)' }}>
      <Handle type="source" position={Position.Right} />
      {data.thumbUrl
        ? <img src={data.thumbUrl} className="h-11 w-9 rounded-lg object-cover" />
        : <div className="flex h-11 w-9 items-center justify-center rounded-lg" style={{ background: 'var(--apple-bg)' }}>—</div>}
      <div className="min-w-0">
        <div className="truncate text-[12px] font-medium" style={{ color: 'var(--apple-text)' }}>{data.item.name}</div>
        <div className="text-[10px]" style={{ color: 'var(--apple-text-3)' }}>{data.viewCount} 张素材</div>
      </div>
    </div>
  )
}

export function GroupNode({ data }: { data: GroupNodeData }) {
  return (
    <div className="flex w-[80px] flex-col items-center gap-1 rounded-2xl py-3"
      style={{ background: 'var(--apple-surface)', boxShadow: 'var(--apple-shadow)' }}>
      <Handle type="target" position={Position.Left} />
      <span className="text-base">{data.icon}</span>
      <span className="text-[11px] font-medium" style={{ color: 'var(--apple-text)' }}>{data.label}</span>
      <span className="text-[10px]" style={{ color: 'var(--apple-text-3)' }}>{data.done}/{data.total}</span>
      <Handle type="source" position={Position.Right} />
    </div>
  )
}

export function PlanNode({ data }: { data: PlanNodeData }) {
  return (
    <div className="w-[140px] rounded-2xl p-3.5"
      style={{ background: 'var(--apple-surface)', boxShadow: 'var(--apple-shadow)' }}>
      <Handle type="target" position={Position.Left} />
      <div className="text-[12px] font-semibold" style={{ color: 'var(--apple-text)' }}>任务规划</div>
      <div className="mt-2 space-y-1">
        <Row label="任务" value={String(data.total)} />
        <Row label="缓存" value={String(data.cached)} />
        <Row label="预估" value={`¥${data.estimated}`} />
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  )
}

export function GateNode({ data }: { data: GateNodeData }) {
  return (
    <div className="flex w-[100px] flex-col items-center gap-1.5 rounded-2xl py-3"
      style={{ background: 'var(--apple-surface)', boxShadow: 'var(--apple-shadow)' }}>
      <Handle type="target" position={Position.Left} />
      <span className="text-[11px] font-semibold" style={{ color: 'var(--apple-text)' }}>审核</span>
      <Row label="待审" value={String(data.review)} />
      <Row label="满意" value={String(data.accepted)} />
      <Row label="锁定" value={String(data.locked)} />
      <Handle type="source" position={Position.Right} />
    </div>
  )
}

export function ExportNode({ data }: { data: ExportNodeData }) {
  return (
    <div className="flex w-[130px] flex-col items-center gap-1 rounded-2xl py-3"
      style={{ background: 'var(--apple-surface)', boxShadow: 'var(--apple-shadow)' }}>
      <Handle type="target" position={Position.Left} />
      <span className="text-[11px] font-semibold" style={{ color: 'var(--apple-text)' }}>导出</span>
      <span className="text-[14px] font-bold" style={{ color: 'var(--apple-blue)' }}>{data.exported}</span>
      <span className="text-[10px]" style={{ color: 'var(--apple-text-3)' }}>张锁定图片</span>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[10px]" style={{ color: 'var(--apple-text-3)' }}>{label}</span>
      <span className="text-[11px] font-medium" style={{ color: 'var(--apple-text)' }}>{value}</span>
    </div>
  )
}
