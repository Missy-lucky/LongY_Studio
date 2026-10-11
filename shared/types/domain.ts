/** 领域模型 —— 与 docs/data-contracts.md 保持一致 */

export type WorkMode = 'prepare' | 'generate' | 'review' | 'export'
export type TaskType = 'flat' | 'detail' | 'partial' | 'model'
export type TaskTier = 'draft' | 'hd'

export type TaskStatus =
  | 'unconfirmed'   // 待确认
  | 'planned'       // 已规划
  | 'cached'        // 缓存命中
  | 'queued'        // 排队中
  | 'generating'    // 生成中
  | 'review'        // 待审核
  | 'accepted'      // 已满意
  | 'rejected'      // 已拒绝
  | 'failed'        // 失败
  | 'locked'        // 已锁定
  | 'exported'      // 已导出

export type GenerateStage = 'upload' | 'submit' | 'server' | 'download' | 'write'

export type RejectReason =
  | 'structure' | 'color' | 'background' | 'composition'
  | 'detail' | 'model' | 'consistency' | 'style'

export interface ProjectInfo {
  id: string
  sku: string
  name: string
  platform: string
  style: string
  budget: number
  createdAt: string
}

export interface CategoryConfig {
  id: string
  name: string
  bodyZone: string
  layerOrder: number
  requiredViews: string[]
  defaultDetailTasks: string[]
  defaultPartialTasks: string[]
  modelPromptHints: string
  negativeHints: string
  isSellableByDefault: boolean
  builtin: boolean
}

export interface MaterialAsset {
  id: string
  name: string
  hash: string
  size: number
  width: number
  height: number
  previewUrl: string
  categoryId: string | null
  viewSlot: string | null
  itemId: string | null
  duplicated: boolean
}

export interface ProductItem {
  id: string
  name: string
  categoryId: string
  colorMaterial: string
  sellingPoints: string
  isSellable: boolean
}

export interface ModelProfile {
  id: string
  name: string
  pose: string
  styles: string[]
  skinTone: string
  hair: string
  referencePath?: string
  avatarUrl: string
  licenseNote: string
  favorite: boolean
  enabled: boolean
}

export interface SpecTemplate {
  id: string
  type: TaskType
  name: string
  composition: string
  background: string
  lighting: string
  ratio: string
  applicableCategories: string[]
  isDefault: boolean
}

export interface TaskVersion {
  id: string
  version: number
  createdAt: string
  tier: TaskTier
  status: 'generating' | 'review' | 'accepted' | 'rejected' | 'locked' | 'exported' | 'failed'
  reason: RejectReason | null
  note: string
  provider: string
  cost: number
  durationMs: number | null
  thumbnail: string | null
  stage: GenerateStage | null
}

export interface GenTask {
  id: string
  code: string
  name: string
  type: TaskType
  itemId: string
  tier: TaskTier
  status: TaskStatus
  provider: string
  prompt: string
  negativePrompt: string
  estimatedCost: number
  cacheHit: boolean
  error: { code: string; message: string; suggestion: string } | null
  versions: TaskVersion[]
  currentVersionId: string | null
  queueIndex: number | null
  startedAt: number | null
  endedAt: number | null
}

export interface EventRecord {
  id: string
  time: string
  taskId: string | null
  type: string
  message: string
}

export interface ToastMsg {
  id: string
  kind: 'info' | 'success' | 'warning' | 'error'
  title: string
  detail: string
  hasDetail: boolean
}

export interface ExportFileNode {
  id: string
  folder: string
  fileName: string
  taskId: string
  version: number
  conflict: boolean
}

export type ShotGroup = TaskType
export type ShotPriority = 'P0' | 'P1' | 'P2'
export type ShotReferenceRole = 'garment' | 'model-identity' | 'style'

export interface CategoryAttribute {
  key: string
  label: string
  type: 'boolean'
  default: boolean
}

export interface Shot {
  id: string
  name: string
  type: ShotGroup
  required: boolean
  priority: ShotPriority
  promptHints: string
  references: ShotReferenceRole[]
  platformUse?: string
}

export interface ShotTemplate {
  schema: 'longy.shot-template.v1'
  id: string
  category: string
  categoryName: string
  version: string
  attributes: CategoryAttribute[]
  shots: Record<ShotGroup, Shot[]>
  conditionalShots: Array<{
    when: { attribute: string; equals: boolean }
    add: Shot[]
  }>
  defaults: {
    tier: TaskTier
    outputByType: Record<ShotGroup, { width: number; height: number; background: string }>
  }
}
