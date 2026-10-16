import type { GarmentStructureField, ShotPriority, ShotTemplate } from '../types/domain'

const API_ROOT = '/api'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_ROOT}${path}`, {
    ...init,
    headers: init?.body instanceof FormData ? undefined : {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
  const text = await response.text()
  const data = text ? JSON.parse(text) : {}
  if (!response.ok) {
    const detail = (data as { detail?: string | { message?: string; suggestion?: string } }).detail
    const message = typeof detail === 'string'
      ? detail
      : detail?.message
        ? `${detail.message}${detail.suggestion ? `；${detail.suggestion}` : ''}`
        : `请求失败：${response.status}`
    throw new Error(message)
  }
  return data as T
}

export type ProviderId = 'mock' | 'openrouter-icu' | 'openai' | 'volcengine-ark' | 'comfyui'

export interface LayoutPosition {
  x: number
  y: number
}

export interface ProjectLayout {
  schemaVersion: 'longy.project-layout.v1' | 'longy.project-layout.v2'
  positions: Record<string, LayoutPosition>
  roles: Record<string, LayoutPosition>
  generationTypes?: string[]
  inputGenerationTypes?: Record<string, string[]>
}

export interface RemoteProject {
  id: string
  sku: string
  name: string
  platform: string
  style: string
  budget: number
  createdAt?: string
  updatedAt?: string
  layout?: ProjectLayout | null
  selectedModelId?: string | null
}

export interface RemoteModel {
  id: string
  name: string
  source: 'builtin' | 'custom'
  projectId: string | null
  referenceUrl: string
  styles?: string[]
  pose?: string
  rightsBasis?: 'self' | 'licensed' | 'consent' | null
  rightsNote?: string
  rightsConfirmedAt?: string | null
  references?: RemoteModelReference[]
}

export type ModelReferenceAngle = 'front' | 'three-quarter-left' | 'three-quarter-right' | 'profile-left' | 'profile-right' | 'back' | 'face-detail'

export interface RemoteModelReference {
  id: string
  modelId: string
  angle: ModelReferenceAngle
  name: string
  filePath?: string
  url: string
  width?: number
  height?: number
  isPrimary: boolean
}

export type ProjectReferenceRole = 'pose' | 'style' | 'detail'

export interface RemoteProjectReference {
  id: string
  projectId: string
  role: ProjectReferenceRole
  name: string
  filePath: string
  size: number
  width: number
  height: number
  createdAt: string
}

export type CareInstruction =
  | 'hand_wash' | 'machine_wash_gentle' | 'do_not_wash' | 'max_30'
  | 'dry_clean' | 'do_not_dry_clean' | 'do_not_bleach' | 'do_not_iron'
  | 'low_iron' | 'line_dry' | 'do_not_tumble'

export interface CareCardPayload {
  sourceAssetId?: string | null
  brand: string
  productName: string
  composition: Array<{ name: string; percent: number }>
  instructions: CareInstruction[]
  warnings: string[]
}

export interface RemoteCareCard {
  id: string
  projectId: string
  sourceAssetId: string | null
  brand: string
  productName: string
  filePath: string
  createdAt: string
  updatedAt: string
  data: CareCardPayload
}

export interface RemoteItem {
  id: string
  projectId: string
  name: string
  categoryId: string
  attributes: Record<string, boolean>
  structureFacts: Record<string, string>
  colorMaterial: string
  sellingPoints: string
  isSellable: boolean
}

export interface RemoteAsset {
  id: string
  name: string
  filePath: string
  hash: string
  size: number
  width: number
  height: number
  categoryId: string | null
  itemId: string | null
  viewSlot: string | null
}
export interface RemoteTaskVersion {
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
  provider?: ProviderId | string
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

export interface RemoteTask {
  id: string
  code: string
  name: string
  itemId?: string | null
  prompt?: string
  negativePrompt?: string
  type: 'flat' | 'detail' | 'partial' | 'model'
  shotId?: string | null
  shotName?: string | null
  priority?: ShotPriority | null
  status: string
  provider: ProviderId | string
  estimatedCost: number
  tier: 'draft' | 'hd'
  currentVersionId: string | null
  modelId: string | null
  versions: RemoteTaskVersion[]
}
export interface ProjectEvent {
  id: number
  time: string
  taskId?: string | null
  type: string
  message: string
}

export interface ProviderInfo {
  id: ProviderId | string
  name: string
  supportedTiers: string[]
  pricePerImage: Record<string, number>
  rateLimitPerMin: number
  available?: boolean
  costEstimateKnown?: boolean
  capabilities?: ProviderCapabilities
}

export interface ProviderCapabilities {
  textToImage: boolean
  imageEdit: boolean | 'workflow'
  maskEdit: boolean | 'workflow'
  maxReferenceImages: number | 'workflow'
  customBaseUrl: boolean
  local: boolean
}

export interface ProviderSettings {
  id: Exclude<ProviderId, 'mock'>
  apiKeyConfigured: boolean
  apiKeySource: 'environment' | 'credential-manager' | 'none'
  available: boolean
  capabilities: ProviderCapabilities
  model?: string
  visionModel?: string
  baseUrl?: string
  workflowPath?: string
  cliPath?: string
  maxBatchImages?: number
  maxEstimatedCostPerBatch?: number
  pricePerImageDraft?: number
  pricePerImageHd?: number
}

export interface ProviderDiagnosticCheck {
  id: string
  label: string
  status: 'pass' | 'warn' | 'fail'
  message: string
}

export interface ProviderDiagnostic {
  providerId: ProviderSettings['id']
  status: 'ready' | 'warning' | 'error'
  canGenerate: boolean
  networkChecked: boolean
  billableRequest: false
  message: string
  checks: ProviderDiagnosticCheck[]
}

export interface CareLabelDraft {
  labelDetected: boolean
  brand: string
  productName: string
  composition: Array<{ name: string; percent: number; confidence: number }>
  instructions: Array<{ code: CareInstruction; confidence: number }>
  warnings: Array<{ text: string; confidence: number }>
  rawText: string[]
  uncertainFields: string[]
}
export type ShotPlanStatus = 'proposed' | 'selected' | 'fulfilled' | 'waived'

export interface ShotPlanShot {
  shotId: string
  shotName: string
  type: RemoteTask['type']
  priority: ShotPriority
  required: boolean
  isCustom: boolean
  promptHints: string
  promptMode: 'default' | 'custom'
  customPrompt: string
  status: ShotPlanStatus
  source: 'ai' | 'asset' | 'manual'
  assetId: string | null
  reason: string
  estimatedCost: number
}

export interface ShotPlanItem {
  itemId: string
  itemName: string
  categoryId: string
  categoryName: string
  assets: Array<{ id: string; viewSlot: string | null; filePath: string }>
  shots: ShotPlanShot[]
  selectedCount: number
  estimatedCost: number
}

export interface ShotPlanPreview {
  presetId: string
  tier: RemoteTask['tier']
  provider: ProviderId | string
  outfitFallbacks: Array<{
    id: string
    role: 'upper-base' | 'lower-base'
    name: string
    reason: string
    previewUrl: string
  }>
  items: ShotPlanItem[]
  selectedCount: number
  estimatedCost: number
}

export interface ShotSelectionInput {
  itemId: string
  shotId: string
  shotName: string
  type: RemoteTask['type']
  priority: ShotPriority
  required: boolean
  isCustom: boolean
  status: Exclude<ShotPlanStatus, 'proposed'>
  source: 'ai' | 'asset' | 'manual'
  assetId?: string | null
  reason: string
  promptHints: string
  promptMode: 'default' | 'custom'
  customPrompt: string
}

export interface ExportCoverageItem {
  itemId: string
  itemName: string
  shotId: string
  shotName: string
  type: RemoteTask['type']
  ready: boolean
}

export interface ConsistencyQcCheck {
  score: number | null
  passed: boolean
  threshold?: number
  reasons?: string[]
  [key: string]: unknown
}

export interface ConsistencyQcReport {
  schema: string
  taskType: string
  output: string
  enforced?: boolean
  score: number
  passed: boolean
  reasons: string[]
  pixel?: Record<string, unknown> & { passed?: boolean }
  garment?: ConsistencyQcCheck
  model?: ConsistencyQcCheck
  detail?: Record<string, unknown>
  structure?: {
    required: boolean
    status: 'human_review_required' | 'not_applicable'
    facts: Array<{ key: string; label: string; expected: string }>
    note: string
  }
  pipeline?: string[]
  tier?: 'draft' | 'hd'
}

export interface VersionQcResponse {
  taskId: string
  versionId: string
  score: number | null
  passed: boolean
  report: ConsistencyQcReport | null
}

export interface ExportPreviewFile {
  taskId: string | null
  assetId?: string | null
  fileName: string
  folder: string
  conflict: boolean
}

export interface ExportPreview {
  files: ExportPreviewFile[]
  exportDir: string
  coverageComplete: boolean
  coverage: ExportCoverageItem[]
  missingShotNames: string[]
}

export const api = {
  listProjects: () => request<{ projects: RemoteProject[] }>('/projects'),
  getProject: (projectId: string) =>
    request<{ project: RemoteProject; taskStats: Record<string, number> }>(`/projects/${projectId}`),
  saveProjectLayout: (projectId: string, layout: ProjectLayout) =>
    request<{ saved: boolean; layout: ProjectLayout }>(`/projects/${projectId}/layout`, {
      method: 'PUT',
      body: JSON.stringify(layout),
    }),
  updateProject: (projectId: string, payload: Partial<Omit<RemoteProject, 'id'>>) =>
    request<{ project: RemoteProject }>(`/projects/${projectId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  createProject: (payload: { sku: string; name: string; platform: string; style: string; budget: number }) =>
    request<RemoteProject>('/projects', { method: 'POST', body: JSON.stringify(payload) }),
  getShotTemplate: (categoryId: string) =>
    request<{ template: ShotTemplate }>(`/library/shot-templates/${categoryId}`),
  listStructureFields: () =>
    request<{ fields: GarmentStructureField[] }>('/library/structure-fields'),
  listItems: (projectId: string) =>
    request<{ items: RemoteItem[] }>(`/projects/${projectId}/items`),
  createItem: (
    projectId: string,
    payload: { name: string; categoryId: string; attributes: Record<string, boolean>; structureFacts: Record<string, string>; colorMaterial: string; sellingPoints: string; isSellable: boolean },
  ) => request<RemoteItem>(`/projects/${projectId}/items`, { method: 'POST', body: JSON.stringify(payload) }),
  updateItem: (
    projectId: string,
    itemId: string,
    payload: { categoryId?: string; attributes: Record<string, boolean>; structureFacts: Record<string, string> },
  ) => request<RemoteItem>(`/projects/${projectId}/items/${itemId}`, {
    method: 'PATCH', body: JSON.stringify(payload),
  }),
  deleteItem: (projectId: string, itemId: string) =>
    request<{ deleted: boolean }>(`/projects/${projectId}/items/${itemId}`, { method: 'DELETE' }),
  listAssets: (projectId: string) =>
    request<{ assets: RemoteAsset[] }>(`/projects/${projectId}/assets`),
  listProjectModels: (projectId: string) =>
    request<{ models: RemoteModel[]; selectedModelId: string | null }>(`/projects/${projectId}/models`),
  importCustomModel: (
    projectId: string,
    file: File,
    name: string,
    authorization: { rightsBasis: 'self' | 'licensed' | 'consent'; rightsNote: string },
  ) => {
    const form = new FormData()
    form.append('file', file, file.name)
    form.append('name', name)
    form.append('rightsConfirmed', 'true')
    form.append('rightsBasis', authorization.rightsBasis)
    form.append('rightsNote', authorization.rightsNote)
    return request<{ model: RemoteModel; selectedModelId: string }>(`/projects/${projectId}/models/import`, {
      method: 'POST', body: form,
    })
  },
  selectProjectModel: (projectId: string, modelId: string) =>
    request<{ selectedModelId: string }>(`/projects/${projectId}/models/${modelId}/select`, { method: 'POST' }),
  importModelReference: (projectId: string, modelId: string, file: File, angle: Exclude<ModelReferenceAngle, 'front'>) => {
    const form = new FormData()
    form.append('file', file, file.name)
    form.append('angle', angle)
    form.append('name', file.name.replace(/\.[^.]+$/, ''))
    return request<{ reference: RemoteModelReference }>(`/projects/${projectId}/models/${modelId}/references/import`, {
      method: 'POST', body: form,
    })
  },
  listProjectReferences: (projectId: string) =>
    request<{ references: RemoteProjectReference[] }>(`/projects/${projectId}/references`),
  importProjectReference: (projectId: string, file: File, role: ProjectReferenceRole, name: string) => {
    const form = new FormData()
    form.append('file', file, file.name)
    form.append('role', role)
    form.append('name', name)
    return request<{ reference: RemoteProjectReference }>(`/projects/${projectId}/references/import`, {
      method: 'POST', body: form,
    })
  },
  deleteProjectReference: (projectId: string, referenceId: string) =>
    request<{ deleted: boolean }>(`/projects/${projectId}/references/${referenceId}`, { method: 'DELETE' }),
  listCareCards: (projectId: string) =>
    request<{ careCards: RemoteCareCard[]; instructionLabels: Record<CareInstruction, string> }>(
      `/projects/${projectId}/care-cards`,
    ),
  createCareCard: (projectId: string, payload: CareCardPayload) =>
    request<{ careCard: RemoteCareCard }>(`/projects/${projectId}/care-cards`, {
      method: 'POST', body: JSON.stringify(payload),
    }),
  updateCareCard: (projectId: string, cardId: string, payload: CareCardPayload) =>
    request<{ careCard: RemoteCareCard }>(`/projects/${projectId}/care-cards/${cardId}`, {
      method: 'PUT', body: JSON.stringify(payload),
    }),
  extractCareLabel: (projectId: string, sourceAssetId: string, provider: 'openai' | 'volcengine-ark') =>
    request<{ provider: string; model: string; draft: CareLabelDraft; requiresConfirmation: true }>(
      `/projects/${projectId}/care-cards/extract`, {
        method: 'POST', body: JSON.stringify({ sourceAssetId, provider }),
      },
    ),
  importAsset: async (projectId: string, file: File) => {
    const form = new FormData()
    form.append('files', file, file.name)
    const result = await request<{ imported: number; failed: Array<{ reason: string }> }>(
      `/projects/${projectId}/assets/import`,
      { method: 'POST', body: form },
    )
    if (result.imported !== 1) throw new Error(result.failed[0]?.reason || '素材导入失败')
    const assets = await request<{ assets: RemoteAsset[] }>(`/projects/${projectId}/assets`)
    return assets.assets.at(-1)!
  },
  replaceAsset: (projectId: string, assetId: string, file: File) => {
    const form = new FormData()
    form.append('file', file, file.name)
    return request<{ asset: RemoteAsset; unchanged: boolean }>(
      `/projects/${projectId}/assets/${assetId}/replace`,
      { method: 'POST', body: form },
    )
  },
  confirmAsset: (projectId: string, assetId: string, itemId: string, categoryId: string, viewSlot: string) =>
    request<{ ok: boolean }>(`/projects/${projectId}/assets/${assetId}/confirm`, {
      method: 'POST',
      body: JSON.stringify({ itemId, categoryId, viewSlot }),
    }),
  listProviders: () => request<{ providers: ProviderInfo[] }>('/providers'),
  getProviderSettings: () => request<{ providers: ProviderSettings[] }>('/provider-settings'),
  saveProviderSettings: (
    providerId: ProviderSettings['id'],
    payload: Partial<Omit<ProviderSettings, 'id' | 'apiKeyConfigured' | 'available'>> & {
      apiKey?: string
      clearApiKey?: boolean
    },
  ) => request<{ provider: ProviderSettings }>(`/provider-settings/${providerId}`, {
    method: 'PUT', body: JSON.stringify(payload),
  }),
  diagnoseProvider: (providerId: ProviderSettings['id']) =>
    request<{ diagnostic: ProviderDiagnostic }>(`/provider-settings/${providerId}/diagnose`, {
      method: 'POST',
    }),
  previewShotPlan: (projectId: string, modelIds: string[], providerId: ProviderId | string = 'mock') =>
    request<ShotPlanPreview>(`/projects/${projectId}/tasks/plan/preview`, {
      method: 'POST',
      body: JSON.stringify({ presetId: 'fast-check', provider: providerId, modelIds }),
    }),
  saveShotSelections: (projectId: string, selections: ShotSelectionInput[]) =>
    request<{ saved: number }>(`/projects/${projectId}/tasks/shot-selections`, {
      method: 'PUT',
      body: JSON.stringify({ selections }),
    }),
  planTasks: (
    projectId: string,
    modelIds: string[],
    providerId: ProviderId | string = 'mock',
    shotIds?: string[],
  ) => request<{ planned: Array<{ id: string }>; cached: Array<{ id: string }> }>(`/projects/${projectId}/tasks/plan`, {
      method: 'POST',
      body: JSON.stringify({
        presetId: 'fast-check', provider: providerId, replaceExisting: true, modelIds, shotIds,
      }),
    }),
  listTasks: (projectId: string) =>
    request<{ tasks: RemoteTask[] }>(`/projects/${projectId}/tasks`),
  submitTasks: (projectId: string, taskIds: string[]) =>
    request<{ queued: number }>(`/projects/${projectId}/tasks/submit`, {
      method: 'POST',
      body: JSON.stringify({ taskIds }),
    }),
  pauseTaskQueue: (projectId: string) =>
    request<{ paused: boolean }>(`/projects/${projectId}/tasks/queue/pause`, { method: 'POST' }),
  resumeTaskQueue: (projectId: string) =>
    request<{ paused: boolean }>(`/projects/${projectId}/tasks/queue/resume`, { method: 'POST' }),
  recoverProviderQueue: (projectId: string, provider: ProviderId | string) =>
    request<{ provider: string; retried: number; migratedQueued: number; taskIds: string[]; skipped: Array<{ taskId: string; reason: string }>; paused: boolean }>(
      `/projects/${projectId}/tasks/queue/recover-provider`,
      { method: 'POST', body: JSON.stringify({ provider }) },
    ),
  cancelTasks: (projectId: string, taskIds: string[]) =>
    request<{ cancelled: number; cancelling: number }>(`/projects/${projectId}/tasks/queue/cancel`, {
      method: 'POST',
      body: JSON.stringify({ taskIds }),
    }),
  listProjectEvents: (projectId: string, afterId = 0, limit = 200) =>
    request<{ events: ProjectEvent[]; lastId: number }>(`/projects/${projectId}/events?afterId=${afterId}&limit=${limit}`),
  reviewTask: (projectId: string, taskId: string, action: 'accept' | 'reject' | 'lock' | 'unlock', reason?: string) =>
    request<{ ok: boolean }>(`/projects/${projectId}/tasks/${taskId}/review`, {
      method: 'POST',
      body: JSON.stringify({ action, reason: reason ?? null, note: '' }),
    }),
  regenerateTask: (
    projectId: string,
    taskId: string,
    revision?: {
      prompt?: string
      negativePrompt?: string
      reason?: string
      note?: string
      referenceMode?: 'original' | 'generated'
      baseVersionId?: string | null
      maskDataUrl?: string
    },
  ) => request<{ version: number }>(`/projects/${projectId}/tasks/${taskId}/regenerate`, {
      method: 'POST',
      body: JSON.stringify(revision ?? {}),
    }),
  startHdRepair: (projectId: string, taskId: string) =>
    request<{ version: number; versionId: string; tier: 'hd' }>(`/projects/${projectId}/tasks/${taskId}/hd-repair`, { method: 'POST' }),
  getVersionQc: (projectId: string, taskId: string, versionId: string) =>
    request<VersionQcResponse>(`/projects/${projectId}/tasks/${taskId}/versions/${versionId}/qc`),
  restoreTaskVersion: (projectId: string, taskId: string, versionId: string) =>
    request<{ ok: boolean }>(`/projects/${projectId}/tasks/${taskId}/versions/${versionId}/restore`, { method: 'POST' }),
  exportPreview: (projectId: string, namingScheme: 'detailed' | 'compact' = 'detailed') =>
    request<ExportPreview>(`/projects/${projectId}/exports/preview?naming_scheme=${namingScheme}`),
  exportTasks: (
    projectId: string,
    taskIds: string[],
    options?: {
      assetIds?: string[]
      targetDir?: string
      namingScheme?: 'detailed' | 'compact'
    },
  ) =>
    request<{
      exported: number
      failed: Array<{ taskId?: string; assetId?: string; reason: string }>
      mapping: Array<{ taskId?: string; assetId?: string; written: string }>
      batchId: string
      targetDir: string
      manifestPath: string
    }>(`/projects/${projectId}/exports`, {
      method: 'POST',
      body: JSON.stringify({
        taskIds,
        assetIds: options?.assetIds ?? [],
        targetDir: options?.targetDir,
        namingScheme: options?.namingScheme ?? 'detailed',
      }),
    }),
}
