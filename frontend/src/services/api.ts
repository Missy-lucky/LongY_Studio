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

export interface RemoteProject {
  id: string
  sku: string
  name: string
  platform: string
  style: string
  budget: number
  createdAt?: string
  updatedAt?: string
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
export interface RemoteTask {
  id: string
  code: string
  name: string
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
  versions: Array<{
    id: string
    version: number
    status: string
    cost: number
    durationMs: number | null
    filePath: string | null
    qcScore: number | null
    qcPassed: boolean | null
    qcReportPath: string | null
  }>
}
export interface ProviderInfo {
  id: ProviderId | string
  name: string
  supportedTiers: string[]
  pricePerImage: Record<string, number>
  rateLimitPerMin: number
  available?: boolean
}
export interface ExportCoverageItem {
  itemId: string
  itemName: string
  shotId: string
  shotName: string
  type: RemoteTask['type']
  ready: boolean
}

export interface ExportPreviewFile {
  taskId: string
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
  planTasks: (projectId: string, modelIds: string[], providerId: ProviderId | string = 'mock') =>
    request<{ planned: Array<{ id: string }>; cached: Array<{ id: string }> }>(`/projects/${projectId}/tasks/plan`, {
      method: 'POST',
      body: JSON.stringify({ presetId: 'fast-check', provider: providerId, replaceExisting: true, modelIds }),
    }),
  listTasks: (projectId: string) =>
    request<{ tasks: RemoteTask[] }>(`/projects/${projectId}/tasks`),
  submitTasks: (projectId: string, taskIds: string[]) =>
    request<{ queued: number }>(`/projects/${projectId}/tasks/submit`, {
      method: 'POST',
      body: JSON.stringify({ taskIds }),
    }),
  reviewTask: (projectId: string, taskId: string, action: 'accept' | 'reject' | 'lock' | 'unlock', reason?: string) =>
    request<{ ok: boolean }>(`/projects/${projectId}/tasks/${taskId}/review`, {
      method: 'POST',
      body: JSON.stringify({ action, reason: reason ?? null, note: '' }),
    }),
  regenerateTask: (projectId: string, taskId: string) =>
    request<{ version: number }>(`/projects/${projectId}/tasks/${taskId}/regenerate`, { method: 'POST' }),
  startHdRepair: (projectId: string, taskId: string) =>
    request<{ version: number; versionId: string; tier: 'hd' }>(`/projects/${projectId}/tasks/${taskId}/hd-repair`, { method: 'POST' }),
  getVersionQc: (projectId: string, taskId: string, versionId: string) =>
    request<{
      taskId: string
      versionId: string
      score: number | null
      passed: boolean
      report: Record<string, unknown> | null
    }>(`/projects/${projectId}/tasks/${taskId}/versions/${versionId}/qc`),
  exportPreview: (projectId: string) =>
    request<ExportPreview>(`/projects/${projectId}/exports/preview`),
  exportTasks: (projectId: string, taskIds: string[]) =>
    request<{
      exported: number
      failed: Array<{ taskId: string; reason: string }>
      mapping: Array<{ taskId: string; written: string }>
      batchId: string
      targetDir: string
    }>(`/projects/${projectId}/exports`, {
      method: 'POST',
      body: JSON.stringify({ taskIds }),
    }),
}
