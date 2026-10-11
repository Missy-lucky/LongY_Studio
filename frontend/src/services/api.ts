import type { ShotPriority, ShotTemplate } from '../types/domain'

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
  if (!response.ok) throw new Error((data as { detail?: string }).detail || `请求失败：${response.status}`)
  return data as T
}

export type ProviderId = 'mock' | 'openrouter-icu'

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
}

export interface RemoteItem {
  id: string
  attributes?: Record<string, boolean>
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
  createItem: (
    projectId: string,
    payload: { name: string; categoryId: string; attributes: Record<string, boolean>; colorMaterial: string; sellingPoints: string; isSellable: boolean },
  ) => request<RemoteItem>(`/projects/${projectId}/items`, { method: 'POST', body: JSON.stringify(payload) }),
  listAssets: (projectId: string) =>
    request<{ assets: RemoteAsset[] }>(`/projects/${projectId}/assets`),
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
  confirmAsset: (projectId: string, assetId: string, itemId: string, categoryId: string, viewSlot: string) =>
    request<{ ok: boolean }>(`/projects/${projectId}/assets/${assetId}/confirm`, {
      method: 'POST',
      body: JSON.stringify({ itemId, categoryId, viewSlot }),
    }),
  listProviders: () => request<{ providers: ProviderInfo[] }>('/providers'),
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
