import type { CategoryAttribute, ShotPriority } from '../../../shared/types/domain'

/** 节点系统类型定义 —— 与设计文档一致 */

// ============ 节点基础 ============
export type NodeType = 'input' | 'model' | 'processing' | 'output'

export interface BaseNode {
  id: string
  type: NodeType
  position: { x: number; y: number }
  collapsed: boolean
}

// ============ 输入节点 ============
export interface InputNodeData {
  categoryId: string
  categoryName: string
  categoryGroup: string
  attributeOptions: CategoryAttribute[]
  attributes: Record<string, boolean>
  image: UploadedImage | null
  status: 'empty' | 'uploaded' | 'confirmed' | 'error'
}

export interface UploadedRemote {
  projectId: string
  itemId: string
  assetId: string
}

export interface UploadedImage {
  id: string
  fileName: string
  thumbnailUrl: string
  width: number
  height: number
  fileSize: number
  remote?: UploadedRemote
  error?: string
}

export interface FlowInputNode extends BaseNode {
  type: 'input'
  data: InputNodeData
}

// ============ 模特节点 ============
export interface ModelNodeData {
  styleId: string
  styleName: string
  styleGroup: string
  modelImage: string
  locked: boolean
}

export interface FlowModelNode extends BaseNode {
  type: 'model'
  data: ModelNodeData
}

// ============ 处理节点 ============
export type ProcessType = 'flat' | 'detail' | 'partial' | 'model'

export interface ProcessingNodeData {
  processType: ProcessType
  title: string
  status: 'idle' | 'planned' | 'running' | 'done' | 'failed'
  estimatedCount: number
  estimatedCost: number
  actualCost: number
}

export interface FlowProcessingNode extends BaseNode {
  type: 'processing'
  data: ProcessingNodeData
}

// ============ 输出节点 ============
export type OutputStatus =
  | 'queued' | 'generating' | 'pending' | 'satisfied' | 'unsatisfied' | 'failed' | 'locked' | 'saved' | 'exported'

export interface OutputVersionRecord {
  id: string
  version: number
  status: string
  cost: number
  durationMs: number | null
  filePath: string | null
  qcScore: number | null
  qcPassed: boolean | null
  qcReportPath: string | null
  tier?: 'draft' | 'hd'
  provider?: string
  createdAt?: string
  reason?: string | null
  note?: string
  prompt?: string
  negativePrompt?: string
  referenceMode?: 'original' | 'generated'
  baseVersionId?: string | null
  maskPath?: string | null
}

export interface OutputNodeData {
  taskId: string
  versionId: string | null
  taskCode: string
  taskName: string
  itemId: string | null
  prompt: string
  negativePrompt: string
  shotId: string | null
  shotName: string | null
  priority: ShotPriority | null
  imageType: ProcessType
  status: OutputStatus
  thumbnail: string | null
  version: number
  parentOutputId: string | null
  rejectReason: string | null
  customPrompt: string | null
  revisionNote: string | null
  referenceMode: 'original' | 'generated'
  baseVersionId: string | null
  cost: number
  durationMs: number | null
  tier: 'draft' | 'hd'
  qcScore: number | null
  qcPassed: boolean | null
  versions: OutputVersionRecord[]
}

export interface FlowOutputNode extends BaseNode {
  type: 'output'
  data: OutputNodeData
}

export type AnyFlowNode = FlowInputNode | FlowModelNode | FlowProcessingNode | FlowOutputNode

// ============ 连线 ============
export type EdgeType = 'material' | 'model' | 'output' | 'review' | 'regen'

export interface FlowEdgeData {
  edgeType: EdgeType
  label?: string
}

export interface FlowEdge {
  id: string
  source: string
  target: string
  edgeType: EdgeType
  animated?: boolean
}

// ============ 预设类型 ============
export type CategoryGroup = '上装' | '下装' | '鞋履' | '配饰' | '包袋' | '其他'

export interface CategoryType {
  id: string
  name: string
  group: CategoryGroup
  icon: string
  defaultDetailTasks: string[]
  defaultPartialTasks: string[]
}

export interface ModelStyle {
  id: string
  name: string
  group: string
  description: string
  referenceImages: string[]
  modelId?: string
}

// ============ 状态颜色 ============
export const STATUS_COLORS: Record<OutputStatus, string> = {
  queued: '#A1A1AA',
  generating: '#6366F1',
  pending: '#F59E0B',
  satisfied: '#22C55E',
  unsatisfied: '#EF4444',
  failed: '#EF4444',
  saved: '#22C55E',
  locked: '#0EA5E9',
  exported: '#64748B',
}

export const EDGE_COLORS: Record<EdgeType, string> = {
  material: '#3B82F6',
  model: '#8B5CF6',
  output: '#6366F1',
  review: '#22C55E',
  regen: '#F59E0B',
}



