import type { CategoryAttribute, GarmentStructureField, ShotPriority } from '../../../shared/types/domain'

/** 节点系统类型定义 —— 与设计文档一致 */

// ============ 节点基础 ============
export type NodeType = 'input' | 'model' | 'pose' | 'reference' | 'careInput' | 'careOutput' | 'processing' | 'output'

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
  parentCategoryId: string
  attributeOptions: CategoryAttribute[]
  attributes: Record<string, boolean>
  structureFieldOptions: GarmentStructureField[]
  structureFacts: Record<string, string>
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
  modelId?: string
  styleId: string
  styleName: string
  styleGroup: string
  modelImage: string
  locked: boolean
  source?: 'builtin' | 'custom'
}

export interface FlowModelNode extends BaseNode {
  type: 'model'
  data: ModelNodeData
}

export type ProjectReferenceRole = 'pose' | 'style' | 'detail'

export interface ReferenceNodeData {
  referenceId: string
  name: string
  role: ProjectReferenceRole
  image: string
}

export interface FlowPoseNode extends BaseNode {
  type: 'pose'
  data: ReferenceNodeData & { role: 'pose' }
}

export interface FlowReferenceNode extends BaseNode {
  type: 'reference'
  data: ReferenceNodeData & { role: 'style' | 'detail' }
}

// ============ 独立洗护说明链路 ============
export interface CareInputNodeData {
  cardCount: number
  latestProductName: string
}

export interface FlowCareInputNode extends BaseNode {
  type: 'careInput'
  data: CareInputNodeData
}

export interface CareOutputNodeData {
  cardId: string
  productName: string
  brand: string
  compositionSummary: string
  thumbnail: string
}

export interface FlowCareOutputNode extends BaseNode {
  type: 'careOutput'
  data: CareOutputNodeData
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
  errorCode?: string | null
  errorMessage?: string | null
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
  errorCode: string | null
  errorMessage: string | null
  versions: OutputVersionRecord[]
}

export interface FlowOutputNode extends BaseNode {
  type: 'output'
  data: OutputNodeData
}

export type AnyFlowNode = FlowInputNode | FlowModelNode | FlowPoseNode | FlowReferenceNode | FlowCareInputNode | FlowCareOutputNode | FlowProcessingNode | FlowOutputNode

// ============ 连线 ============
export type EdgeType = 'material' | 'model' | 'pose' | 'reference' | 'care' | 'output' | 'review' | 'regen'

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
  parentId: string
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
  pose: '#EC4899',
  reference: '#14B8A6',
  care: '#D97706',
  output: '#6366F1',
  review: '#22C55E',
  regen: '#F59E0B',
}



