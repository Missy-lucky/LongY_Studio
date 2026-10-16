import { create } from 'zustand'
import type {
  AnyFlowNode, FlowEdge, FlowInputNode, FlowModelNode, FlowPoseNode, FlowReferenceNode,
  FlowCareInputNode, FlowCareOutputNode, FlowProcessingNode, FlowOutputNode,
  UploadedImage, ProcessType, ProjectReferenceRole,
} from '../types/node-system'
import { DEFAULT_INPUT_NODES, MODEL_STYLES, findCategory } from '../data/preset-categories'
import { PROCESS_ORDER, PROCESS_TITLES } from '../data/process-templates'
import { api, type CareCardPayload, type ConsistencyQcReport, type ExportPreview, type ModelReferenceAngle, type ProjectEvent, type ProviderInfo, type RemoteAsset, type RemoteCareCard, type RemoteModel, type RemoteProject, type RemoteProjectReference, type RemoteTask, type ShotPlanPreview, type ShotSelectionInput } from '../services/api'
import { applyModelSelection } from '../workflow/model-selection'
import { careInputPosition, careOutputPosition, inputPosition, modelPosition, organizeNodes, outputPosition, referencePosition } from '../workflow/node-layout'
import { applyProjectLayout, buildProjectLayout, extractGenerationConfig } from '../workflow/layout-persistence'
import { buildRestoredProjectGraph } from '../workflow/project-restore'
import { activeBackendStatus, syncNodesWithTasks } from '../workflow/task-sync'
import { useWorkbench } from './workbench-store'

let uid = 0
const nid = (p: string) => `${p}-${Date.now().toString(36)}-${(uid++).toString(36)}`
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
const revokeThumbnail = (url?: string | null) => {
  if (url?.startsWith('blob:')) setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function advanceAfterGenerationRun() {
  const outputs = useNodeStore.getState().nodes
    .filter(node => node.type === 'output')
    .map(node => (node as FlowOutputNode).data)
  if (!outputs.length) return
  const reviewable = outputs.some(output =>
    ['pending', 'satisfied', 'unsatisfied', 'locked', 'exported'].includes(output.status))
  if (reviewable) useWorkbench.getState().setMode('review')
}

function advanceAfterReviewSettled() {
  const outputs = useNodeStore.getState().nodes
    .filter(node => node.type === 'output')
    .map(node => (node as FlowOutputNode).data)
  const needsReview = outputs.some(output =>
    ['pending', 'satisfied', 'unsatisfied', 'failed'].includes(output.status))
  const locked = outputs.filter(output => ['locked', 'exported'].includes(output.status)).length
  if (locked > 0 && !needsReview) useWorkbench.getState().setMode('export')
}

export interface NodeImageViewer {
  src: string
  title: string
  subtitle?: string
  compareSrc?: string
  compareTitle?: string
  compareSubtitle?: string
}

export interface RealGenerationConfirm {
  taskIds: string[]
  count: number
  providerName: string
  estimatedCost: number
}

export interface VersionQcState {
  taskId: string
  taskCode: string
  taskName: string
  versionId: string
  version: number
  score: number | null
  passed: boolean
  report: ConsistencyQcReport | null
}

export interface LayoutSavePrompt {
  action: 'open' | 'new' | 'close'
  projectId?: string
}

export interface ExportResultState {
  exported: number
  failed: Array<{ taskId?: string; assetId?: string; reason: string }>
  files: Array<{ taskId?: string; assetId?: string; written: string }>
  targetDir: string
  manifestPath: string
}

export interface ExportSelectionState {
  taskIds: string[]
  assetIds: string[]
  targetDir: string
  namingScheme: 'detailed' | 'compact'
}

export interface NodeStoreState {
  imageViewer: NodeImageViewer | null
  nodes: AnyFlowNode[]
  edges: FlowEdge[]
  selectedNodeId: string | null
  typePickerOpen: boolean
  changeTypeTargetNodeId: string | null
  modelPickerOpen: boolean
  versionCounter: number
  canvasInitialized: boolean
  backendProjectId: string | null
  projectMeta: RemoteProject | null
  draftProjectMeta: Partial<RemoteProject>
  projectSettingsOpen: boolean
  providerSettingsOpen: boolean
  projectLibraryOpen: boolean
  fitViewCounter: number
  providerId: ProviderInfo['id']
  providers: ProviderInfo[]
  availableModels: RemoteModel[]
  projectReferences: RemoteProjectReference[]
  careCards: RemoteCareCard[]
  careSourceAssets: RemoteAsset[]
  careDialogOpen: boolean
  careEditingCardId: string | null
  generationTypes: ProcessType[]
  inputGenerationTypes: Record<string, ProcessType[]>
  promptRevisionNodeId: string | null
  workflowBusy: boolean
  workflowMessage: string
  queuePaused: boolean
  taskStages: Record<string, { stage: string; message: string; eventId: number }>
  workflowEvents: ProjectEvent[]
  workflowEventLastId: number
  restoreAttempted: boolean
  layoutDirty: boolean
  layoutSaving: boolean
  layoutPrompt: LayoutSavePrompt | null
  realGenerationConfirm: RealGenerationConfirm | null
  exportPreview: ExportPreview | null
  exportSelection: ExportSelectionState
  shotPlan: ShotPlanPreview | null
  exportResult: ExportResultState | null
  versionQc: VersionQcState | null

  initCanvas: () => void
  resetCanvas: () => void
  resetCanvasNow: () => void
  restoreLastProject: () => Promise<void>
  restoreProject: (projectId: string) => Promise<void>
  setProviderId: (providerId: ProviderInfo['id']) => void
  setProjectSettingsOpen: (open: boolean) => void
  setProviderSettingsOpen: (open: boolean) => void
  setProjectLibraryOpen: (open: boolean) => void
  openProject: (projectId: string) => Promise<void>
  requestFitView: () => void
  moveNode: (nodeId: string, position: { x: number; y: number }) => void
  saveProjectMeta: (payload: Partial<RemoteProject>) => Promise<void>
  saveProjectLayout: () => Promise<boolean>
  requestAppClose: () => void
  confirmLayoutPrompt: () => Promise<void>
  discardLayoutPrompt: () => void
  cancelLayoutPrompt: () => void
  refreshProviders: () => Promise<void>
  refreshWorkflowEvents: () => Promise<void>
  pauseTaskQueue: () => Promise<void>
  resumeTaskQueue: () => Promise<void>
  recoverProviderQueue: () => Promise<void>
  cancelQueuedOrRunning: (nodeIds: string[]) => Promise<void>
  retryFailedOutputs: () => Promise<void>
  setGenerationTypes: (types: ProcessType[]) => void
  toggleGenerationType: (type: ProcessType) => void
  setInputGenerationType: (itemId: string, type: ProcessType, enabled: boolean) => void
  copyGenerationTypesToAll: (types: ProcessType[]) => void
  openPromptRevision: (nodeId: string | null) => void
  setShotPlanTypes: (types: ProcessType[]) => void
  addInputNode: (categoryId: string) => void
  removeNode: (nodeId: string) => Promise<void>
  uploadImage: (nodeId: string, image: UploadedImage, file?: File) => void
  changeNodeType: (nodeId: string, categoryId: string) => void
  loadInputAttributes: (nodeId: string) => Promise<void>
  setInputAttribute: (nodeId: string, attributeKey: string, checked: boolean) => void
  setInputStructureFact: (nodeId: string, fieldKey: string, value: string) => void
  saveInputFacts: (nodeId: string) => Promise<void>
  setChangeTypeTargetNodeId: (nodeId: string | null) => void
  setModelStyle: (styleId: string) => void
  uploadCustomModel: (file: File, authorization: { rightsBasis: 'self' | 'licensed' | 'consent'; rightsNote: string }) => Promise<void>
  uploadModelReference: (modelId: string, file: File, angle: Exclude<ModelReferenceAngle, 'front'>) => Promise<void>
  uploadProjectReference: (file: File, role: ProjectReferenceRole) => Promise<void>
  removeProjectReference: (nodeId: string) => Promise<void>
  openCareEditor: (cardId?: string | null) => void
  closeCareEditor: () => void
  saveCareCard: (payload: CareCardPayload, cardId?: string | null) => Promise<void>
  uploadCareSource: (file: File) => Promise<RemoteAsset | null>
  generatePlan: () => Promise<void>
  confirmShotPlan: () => Promise<void>
  closeShotPlan: () => void
  updateShotPlanSelection: (
    itemId: string,
    shotId: string,
    patch: Partial<Pick<ShotPlanPreview['items'][number]['shots'][number], 'status' | 'source' | 'assetId' | 'reason' | 'promptMode' | 'customPrompt'>>,
  ) => void
  addCustomShot: (itemId: string, shot: { name: string; type: RemoteTask['type']; priority: ShotPlanPreview['items'][number]['shots'][number]['priority']; promptHints: string }) => void
  startGeneration: () => Promise<void>
  markSatisfied: (nodeId: string) => Promise<void>
  markSatisfiedBatch: (nodeIds: string[]) => Promise<void>
  markUnsatisfied: (nodeId: string, reason?: string, customPrompt?: string) => Promise<void>
  regenerate: (
    nodeId: string,
    revision?: {
      prompt?: string
      negativePrompt?: string
      reason?: string
      note?: string
      referenceMode?: 'original' | 'generated'
      baseVersionId?: string | null
      maskDataUrl?: string
    },
  ) => Promise<void>
  startHdRepair: (nodeId: string) => Promise<void>
  lockOutput: (nodeId: string) => Promise<void>
  lockOutputsBatch: (nodeIds: string[]) => Promise<void>
  restoreOutputVersion: (nodeId: string, versionId: string) => Promise<void>
  exportLocked: () => Promise<void>
  setExportSelection: (patch: Partial<ExportSelectionState>) => void
  confirmExportLocked: () => Promise<void>
  closeExportPreview: () => void
  confirmRealGeneration: () => Promise<void>
  cancelRealGeneration: () => void
  closeExportResult: () => void
  openVersionQc: (nodeId: string, versionId?: string) => Promise<void>
  closeVersionQc: () => void
  removeOutput: (nodeId: string) => void
  openImageViewer: (viewer: NodeImageViewer) => void
  closeImageViewer: () => void
  setSelected: (id: string | null) => void
  setTypePickerOpen: (open: boolean) => void
  setModelPickerOpen: (open: boolean) => void
}

const modelReferenceUrl = (modelId?: string) => modelId ? `/api/library/models/${modelId}/reference?variant=preview` : ''

function recalculateShotPlanItems(items: ShotPlanPreview['items']): ShotPlanPreview['items'] {
  return items.map(item => {
    const shots = item.shots.map(shot => ({
      ...shot,
      estimatedCost: shot.status === 'selected' ? shot.estimatedCost : 0,
    }))
    return {
      ...item,
      shots,
      selectedCount: shots.filter(shot => shot.status === 'selected').length,
      estimatedCost: shots.reduce((sum, shot) => sum + shot.estimatedCost, 0),
    }
  })
}

let projectPromise: Promise<string> | null = null
function ensureProject(): Promise<string> {
  const savedProjectId = globalThis.localStorage?.getItem('longy-backend-project-id')
  if (savedProjectId) {
    useNodeStore.setState({ backendProjectId: savedProjectId })
    return Promise.resolve(savedProjectId)
  }
  if (!projectPromise) {
    projectPromise = (async () => {
      const draft = useNodeStore.getState().draftProjectMeta
      const project = await api.createProject({
        sku: draft.sku || `NODE-${Date.now().toString(36).toUpperCase()}`,
        name: draft.name || '节点工作台项目',
        platform: draft.platform || 'local',
        style: draft.style || 'v2 final',
        budget: draft.budget ?? 100,
      })
      globalThis.localStorage?.setItem('longy-backend-project-id', project.id)
      useNodeStore.setState({ backendProjectId: project.id, projectMeta: project })
      return project.id
    })()
    projectPromise.catch(() => { projectPromise = null })
  }
  return projectPromise
}

function careGraphNodes(
  cards: RemoteCareCard[],
  projectId: string,
  inputCount: number,
  referenceCount: number,
): Array<FlowCareInputNode | FlowCareOutputNode> {
  const input: FlowCareInputNode = {
    id: 'care-input',
    type: 'careInput',
    position: careInputPosition(inputCount, referenceCount),
    collapsed: false,
    data: {
      cardCount: cards.length,
      latestProductName: cards[0]?.productName ?? '',
    },
  }
  const outputs: FlowCareOutputNode[] = cards.map((card, index) => ({
    id: `care-output-${card.id}`,
    type: 'careOutput',
    position: careOutputPosition(inputCount, referenceCount, index),
    collapsed: false,
    data: {
      cardId: card.id,
      productName: card.productName || '洗护与成分说明',
      brand: card.brand,
      compositionSummary: card.data.composition.map(part => `${part.name}${part.percent}%`).join(' / '),
      thumbnail: `/api/projects/${projectId}/care-cards/${card.id}/file?t=${encodeURIComponent(card.updatedAt)}`,
    },
  }))
  return [input, ...outputs]
}

function applyTasks(tasks: RemoteTask[]): void {
  const projectId = useNodeStore.getState().backendProjectId
  if (!projectId) return
  useNodeStore.setState(state => ({
    nodes: syncNodesWithTasks(tasks, projectId, state.nodes),
    edges: state.edges.map(edge => ({ ...edge, animated: false })),
    workflowMessage: `后端任务同步完成：${tasks.length} 个任务`,
  }))
}
function applyProjectEvents(events: ProjectEvent[]): void {
  if (!events.length) return
  const latestQueueEvent = [...events].reverse().find(event => [
    'queue.auto_pause', 'queue.pause', 'queue.resume', 'queue.provider_recover',
  ].includes(event.type))
  const stageUpdates: Record<string, { stage: string; message: string; eventId: number }> = {}
  events.forEach(event => {
    if (!event.taskId || !event.type.startsWith('task.stage.')) return
    stageUpdates[event.taskId] = {
      stage: event.type.slice('task.stage.'.length),
      message: event.message,
      eventId: event.id,
    }
  })
  useNodeStore.setState(state => ({
    taskStages: { ...state.taskStages, ...stageUpdates },
    workflowEvents: [...events].reverse().concat(state.workflowEvents).slice(0, 300),
    workflowEventLastId: Math.max(state.workflowEventLastId, ...events.map(event => event.id)),
    queuePaused: latestQueueEvent
      ? ['queue.auto_pause', 'queue.pause'].includes(latestQueueEvent.type)
      : state.queuePaused,
    workflowMessage: latestQueueEvent?.message ?? state.workflowMessage,
  }))
}

async function pollTasks(runId: number): Promise<void> {
  while (true) {
    await sleep(800)
    if (useNodeStore.getState().versionCounter !== runId) return
    const projectId = useNodeStore.getState().backendProjectId
    if (!projectId) return
    try {
      await useNodeStore.getState().refreshWorkflowEvents()
      const { tasks } = await api.listTasks(projectId)
      applyTasks(tasks)
      const scopedTasks = tasks.filter(task => useNodeStore.getState().generationTypes.includes(task.type))
      if (
        useNodeStore.getState().queuePaused &&
        scopedTasks.some(task => task.status === 'queued') &&
        !scopedTasks.some(task => task.status === 'generating')
      ) {
        useNodeStore.setState({ workflowBusy: false, workflowMessage: '队列已暂停，等待恢复后继续处理排队任务' })
        return
      }
      if (!scopedTasks.some(task => activeBackendStatus(task.status))) {
        const review = scopedTasks.filter(task => task.status === 'review').length
        const failed = scopedTasks.filter(task => task.status === 'failed').length
        useNodeStore.setState({
          workflowBusy: false,
          workflowMessage: `批次完成：${review} 个待审核，${failed} 个失败`,
        })
        return
      }
    } catch (error) {
      useNodeStore.setState({
        workflowBusy: false,
        workflowMessage: error instanceof Error ? error.message : '任务状态同步失败',
      })
      return
    }
  }
}

export const useNodeStore = create<NodeStoreState>((set, get) => ({
  imageViewer: null,
  nodes: [],
  edges: [],
  selectedNodeId: null,
  typePickerOpen: false,
  changeTypeTargetNodeId: null,
  modelPickerOpen: false,
  versionCounter: 0,
  canvasInitialized: false,
  backendProjectId: null,
  projectMeta: null,
  draftProjectMeta: { sku: '', name: '节点工作台项目', platform: 'local', style: 'v2 final', budget: 100 },
  projectSettingsOpen: false,
  providerSettingsOpen: false,
  projectLibraryOpen: false,
  fitViewCounter: 0,
  providerId: 'mock',
  providers: [],
  availableModels: [],
  projectReferences: [],
  careCards: [],
  careSourceAssets: [],
  careDialogOpen: false,
  careEditingCardId: null,
  generationTypes: ['flat', 'partial', 'detail', 'model'],
  inputGenerationTypes: {},
  promptRevisionNodeId: null,
  workflowBusy: false,
  workflowMessage: '',
  queuePaused: false,
  taskStages: {},
  workflowEvents: [],
  workflowEventLastId: 0,
  restoreAttempted: false,
  layoutDirty: false,
  layoutSaving: false,
  layoutPrompt: null,
  realGenerationConfirm: null,
  exportPreview: null,
  exportSelection: {
    taskIds: [],
    assetIds: [],
    targetDir: globalThis.localStorage?.getItem('lys-export-dir') ?? '',
    namingScheme: globalThis.localStorage?.getItem('lys-export-naming') === 'compact' ? 'compact' : 'detailed',
  },
  shotPlan: null,
  exportResult: null,
  versionQc: null,

  initCanvas: () => {
    if (get().canvasInitialized || get().nodes.length) return
    const storedModelId = globalThis.localStorage?.getItem('longy-selected-model')
    const selectedStyle = MODEL_STYLES.find(style => style.id === storedModelId) ?? MODEL_STYLES[0]
    const inputNodes: FlowInputNode[] = DEFAULT_INPUT_NODES.map((catId, i) => {
      const cat = findCategory(catId)!
      return {
        id: nid('input'), type: 'input' as const,
        position: inputPosition(i),
        collapsed: false,
        data: {
          categoryId: cat.id, categoryName: cat.name, categoryGroup: cat.group, parentCategoryId: cat.parentId,
          attributeOptions: [], attributes: {}, structureFieldOptions: [], structureFacts: {},
          image: null, status: 'empty' as const,
        },
      }
    })

    const modelNode: FlowModelNode = {
      id: nid('model'), type: 'model' as const,
      position: modelPosition(DEFAULT_INPUT_NODES.length),
      collapsed: false,
      data: {
        modelId: selectedStyle.modelId,
        styleId: selectedStyle.id, styleName: selectedStyle.name,
        styleGroup: selectedStyle.group,
        modelImage: modelReferenceUrl(selectedStyle.modelId), locked: true, source: 'builtin',
      },
    }

    const procNodes: FlowProcessingNode[] = PROCESS_ORDER.map((pt, i) => ({
      id: nid('proc'), type: 'processing' as const,
      position: { x: 440, y: 40 + i * 220 },
      collapsed: false,
      data: {
        processType: pt, title: PROCESS_TITLES[pt],
        status: 'idle' as const, estimatedCount: 0, estimatedCost: 0, actualCost: 0,
      },
    }))
    const careNode = careGraphNodes([], '', inputNodes.length, 0)[0]

    const edges: FlowEdge[] = []
    inputNodes.forEach(input => {
      procNodes.forEach(proc => {
        edges.push({ id: nid('edge'), source: input.id, target: proc.id, edgeType: 'material' })
      })
    })
    edges.push({
      id: nid('edge'),
      source: modelNode.id,
      target: procNodes.find(proc => proc.data.processType === 'partial')!.id,
      edgeType: 'model',
    })
    edges.push({
      id: nid('edge'),
      source: modelNode.id,
      target: procNodes.find(proc => proc.data.processType === 'model')!.id,
      edgeType: 'model',
    })
    set({ nodes: organizeNodes([...inputNodes, modelNode, careNode, ...procNodes]), edges, canvasInitialized: true })
  },

  resetCanvas: () => {
    if (get().layoutDirty) {
      set({ layoutPrompt: { action: 'new' } })
      return
    }
    get().resetCanvasNow()
  },

  resetCanvasNow: () => {
    get().nodes.forEach(node => {
      if (node.type === 'input') revokeThumbnail((node as FlowInputNode).data.image?.thumbnailUrl)
    })
    globalThis.localStorage?.removeItem('longy-backend-project-id')
    projectPromise = null
    set({
      nodes: [], edges: [], canvasInitialized: false, backendProjectId: null, projectMeta: null,
      workflowMessage: '已新建空白工作台，上传素材后会创建新项目',
      realGenerationConfirm: null, exportResult: null,
      queuePaused: false, taskStages: {}, workflowEvents: [], workflowEventLastId: 0,
      inputGenerationTypes: {}, generationTypes: ['flat', 'partial', 'detail', 'model'],
      availableModels: [], projectReferences: [], careCards: [], careSourceAssets: [], careDialogOpen: false, careEditingCardId: null,
      draftProjectMeta: { sku: '', name: '节点工作台项目', platform: 'local', style: 'v2 final', budget: 100 },
      projectSettingsOpen: true,
      providerSettingsOpen: false,
      layoutDirty: false,
      layoutPrompt: null,
    })
    get().initCanvas()
  },

  restoreLastProject: async () => {
    if (get().restoreAttempted) return
    set({ restoreAttempted: true })
    const projectId = globalThis.localStorage?.getItem('longy-backend-project-id')
    if (!projectId) {
      await get().refreshProviders()
      return
    }
    await get().restoreProject(projectId)
  },

  restoreProject: async projectId => {
    set({ workflowBusy: true, workflowMessage: '正在恢复上次项目...' })
    try {
      const [{ project }, { assets }, { items }, { tasks }, modelResult, referenceResult, careResult] = await Promise.all([
        api.getProject(projectId),
        api.listAssets(projectId),
        api.listItems(projectId),
        api.listTasks(projectId),
        api.listProjectModels(projectId),
        api.listProjectReferences(projectId),
        api.listCareCards(projectId),
      ])
      const graph = buildRestoredProjectGraph({
        projectId,
        assets,
        items,
        tasks,
        selectedModelId: modelResult.selectedModelId ?? project.selectedModelId ?? globalThis.localStorage?.getItem('longy-selected-model'),
        models: modelResult.models,
        references: referenceResult.references,
        careCards: careResult.careCards,
        createId: nid,
      })
      const taskProvider = tasks[0]?.provider
      globalThis.localStorage?.setItem('longy-backend-project-id', projectId)
      set({
        ...graph,
        nodes: applyProjectLayout(graph.nodes, project.layout),
        canvasInitialized: true,
        backendProjectId: projectId,
        projectMeta: project,
        providerId: taskProvider ?? 'mock',
        availableModels: modelResult.models,
        projectReferences: referenceResult.references,
        careCards: careResult.careCards,
        careSourceAssets: assets.filter(asset => !asset.itemId || !asset.categoryId),
        generationTypes: extractGenerationConfig(project.layout)?.generationTypes ?? ['flat', 'partial', 'detail', 'model'],
        inputGenerationTypes: extractGenerationConfig(project.layout)?.inputGenerationTypes ?? {},
        queuePaused: false,
        taskStages: {},
        workflowEvents: [],
        workflowEventLastId: 0,
        workflowMessage: `已恢复项目 ${project.sku}：${assets.length} 张素材，${tasks.length} 个任务`,
        layoutDirty: false,
        layoutPrompt: null,
      })
      await get().refreshProviders()
      if (tasks.some(task => activeBackendStatus(task.status))) {
        const runId = get().versionCounter + 1
        set({ versionCounter: runId })
        void pollTasks(runId)
      }
    } catch (error) {
      globalThis.localStorage?.removeItem('longy-backend-project-id')
      projectPromise = null
      set({ workflowMessage: error instanceof Error ? error.message : '项目恢复失败，已切换到空白工作台' })
      await get().refreshProviders()
    } finally {
      set({ workflowBusy: false })
    }
  },

  setProviderId: providerId => {
    if (providerId === get().providerId) return
    const providerName = get().providers.find(item => item.id === providerId)?.name ?? providerId
    const hasProviderFailure = get().nodes.some(node => node.type === 'output' && [
      'QUOTA_EXCEEDED', 'AUTHENTICATION_FAILED', 'API_KEY_MISSING',
    ].includes((node as FlowOutputNode).data.errorCode ?? ''))
    set(() => ({
      providerId,
      realGenerationConfirm: null,
      shotPlan: null,
      workflowMessage: providerId === 'mock'
        ? '已切换 Mock Provider，不消耗真实 API'
        : hasProviderFailure
          ? `已选择 ${providerName}；请在监控台点击“迁移并恢复”处理失败与排队任务`
          : `已切换 ${providerName}，生成前会再次确认`,
    }))
  },

  setProjectSettingsOpen: open => set({ projectSettingsOpen: open }),
  setProjectLibraryOpen: open => set({ projectLibraryOpen: open }),

  openProject: async projectId => {
    if (get().workflowBusy) return
    if (get().layoutDirty) {
      set({ layoutPrompt: { action: 'open', projectId } })
      return
    }
    await get().restoreProject(projectId)
    set({ projectLibraryOpen: false })
    get().requestFitView()
  },

  requestFitView: () => set(state => ({ fitViewCounter: state.fitViewCounter + 1 })),

  moveNode: (nodeId, position) => set(state => ({
    nodes: state.nodes.map(node => node.id === nodeId ? { ...node, position } : node),
    layoutDirty: true,
  })),

  saveProjectLayout: async () => {
    if (get().layoutSaving) return false
    set({ layoutSaving: true, workflowMessage: '正在保存画布布局...' })
    try {
      const projectId = await ensureProject()
      await api.saveProjectLayout(projectId, buildProjectLayout(get().nodes, {
        generationTypes: get().generationTypes,
        inputGenerationTypes: get().inputGenerationTypes,
      }))
      set({ layoutDirty: false, workflowMessage: '画布布局已随项目保存' })
      return true
    } catch (error) {
      set({ workflowMessage: error instanceof Error ? error.message : '画布布局保存失败' })
      return false
    } finally {
      set({ layoutSaving: false })
    }
  },

  requestAppClose: () => {
    if (get().layoutDirty) {
      set({ layoutPrompt: { action: 'close' } })
      return
    }
    window.desktopAPI?.confirmClose()
  },

  confirmLayoutPrompt: async () => {
    const prompt = get().layoutPrompt
    if (!prompt) return
    const saved = await get().saveProjectLayout()
    if (!saved) return
    set({ layoutPrompt: null })
    if (prompt.action === 'open' && prompt.projectId) await get().restoreProject(prompt.projectId)
    if (prompt.action === 'new') get().resetCanvasNow()
    if (prompt.action === 'close') window.desktopAPI?.confirmClose()
  },

  discardLayoutPrompt: () => {
    const prompt = get().layoutPrompt
    set({ layoutPrompt: null, layoutDirty: false })
    if (prompt?.action === 'open' && prompt.projectId) void get().restoreProject(prompt.projectId)
    if (prompt?.action === 'new') get().resetCanvasNow()
    if (prompt?.action === 'close') window.desktopAPI?.confirmClose()
  },

  cancelLayoutPrompt: () => set({ layoutPrompt: null }),

  saveProjectMeta: async payload => {
    set({ workflowBusy: true, workflowMessage: '正在保存项目资料...' })
    try {
      const projectId = get().backendProjectId || globalThis.localStorage?.getItem('longy-backend-project-id')
      if (projectId) {
        const { project } = await api.updateProject(projectId, payload)
        set({ projectMeta: project, projectSettingsOpen: false, workflowMessage: `项目资料已保存：${project.sku}` })
      } else {
        set({
          draftProjectMeta: { ...get().draftProjectMeta, ...payload },
          projectSettingsOpen: false,
          workflowMessage: '项目资料已暂存，上传素材后创建项目',
        })
      }
    } catch (error) {
      set({ workflowMessage: error instanceof Error ? error.message : '项目资料保存失败' })
    } finally {
      set({ workflowBusy: false })
    }
  },

  setGenerationTypes: types => set({
    generationTypes: types.length ? types : ['flat', 'partial', 'detail', 'model'],
  }),

  toggleGenerationType: type => set(state => {
    const active = state.generationTypes.includes(type)
      ? state.generationTypes.filter(item => item !== type)
      : [...state.generationTypes, type]
    return { generationTypes: active }
  }),

  setInputGenerationType: (itemId, type, enabled) => set(state => {
    const current = state.inputGenerationTypes[itemId] ?? state.generationTypes
    const next = enabled
      ? current.includes(type) ? current : [...current, type]
      : current.filter(item => item !== type)
    return {
      inputGenerationTypes: {
        ...state.inputGenerationTypes,
        [itemId]: next.length ? next : [],
      },
      layoutDirty: true,
    }
  }),

  copyGenerationTypesToAll: types => set(state => {
    const scopedItems = state.nodes
      .filter(node => node.type === 'input')
      .map(node => (node as FlowInputNode).data.image?.remote?.itemId)
      .filter((itemId): itemId is string => Boolean(itemId))
    return {
      generationTypes: types,
      inputGenerationTypes: Object.fromEntries(
        Array.from(new Set(scopedItems)).map(itemId => [itemId, [...types]]),
      ),
      layoutDirty: true,
    }
  }),

  openPromptRevision: nodeId => set({ promptRevisionNodeId: nodeId }),

  refreshProviders: async () => {
    try {
      const { providers } = await api.listProviders()
      set({ providers })
    } catch (error) {
      set({ workflowMessage: error instanceof Error ? error.message : 'Provider 列表读取失败' })
    }
  },

  refreshWorkflowEvents: async () => {
    const projectId = get().backendProjectId
    if (!projectId) return
    try {
      const response = await api.listProjectEvents(projectId, get().workflowEventLastId, 100)
      applyProjectEvents(response.events)
    } catch {
      // Task polling remains authoritative; event polling is only presentation enhancement.
    }
  },

  pauseTaskQueue: async () => {
    const projectId = get().backendProjectId
    if (!projectId) return
    try {
      await api.pauseTaskQueue(projectId)
      set({ queuePaused: true, workflowMessage: '队列已暂停，不会再领取新任务；已开始生成的任务会继续完成' })
      await get().refreshWorkflowEvents()
    } catch (error) {
      set({ workflowMessage: error instanceof Error ? error.message : '队列暂停失败' })
    }
  },

  resumeTaskQueue: async () => {
    const projectId = get().backendProjectId
    if (!projectId) return
    try {
      await api.resumeTaskQueue(projectId)
      set({ queuePaused: false, workflowMessage: '队列已恢复' })
      const hasActiveTasks = get().nodes
        .some(node => node.type === 'output' && ['queued', 'generating'].includes((node as FlowOutputNode).data.status))
      if (hasActiveTasks && !get().workflowBusy) {
        const runId = get().versionCounter + 1
        set({ versionCounter: runId, workflowBusy: true })
        void pollTasks(runId)
      }
      await get().refreshWorkflowEvents()
    } catch (error) {
      set({ workflowMessage: error instanceof Error ? error.message : '队列恢复失败' })
    }
  },

  recoverProviderQueue: async () => {
    const projectId = get().backendProjectId
    if (!projectId || get().workflowBusy) return
    const providerName = get().providers.find(item => item.id === get().providerId)?.name ?? get().providerId
    set({ workflowBusy: true, workflowMessage: `正在迁移到 ${providerName}...` })
    try {
      const result = await api.recoverProviderQueue(projectId, get().providerId)
      if (!result.taskIds.length) {
        set({ workflowMessage: result.skipped.length
          ? `没有可迁移任务；${result.skipped.length} 个任务因能力或限额不兼容被保留`
          : '没有可迁移的系统性失败或排队任务' })
        return
      }
      const { tasks } = await api.listTasks(projectId)
      applyTasks(tasks)
      const runId = get().versionCounter + 1
      set({
        versionCounter: runId,
        queuePaused: false,
        workflowMessage: `已迁移到 ${providerName}：重试 ${result.retried} 个失败任务，迁移 ${result.migratedQueued} 个排队任务${result.skipped.length ? `，保留 ${result.skipped.length} 个不兼容任务` : ''}`,
      })
      await pollTasks(runId)
    } catch (error) {
      set({ workflowMessage: error instanceof Error ? error.message : 'Provider 迁移恢复失败' })
    } finally {
      set({ workflowBusy: false })
    }
  },

  cancelQueuedOrRunning: async nodeIds => {
    const projectId = get().backendProjectId
    const outputs = get().nodes
      .filter(node => node.type === 'output' && nodeIds.includes(node.id))
      .map(node => node as FlowOutputNode)
      .filter(node => ['queued', 'generating'].includes(node.data.status))
    if (!projectId || !outputs.length) return
    set({ workflowBusy: true, workflowMessage: '正在取消任务...' })
    try {
      const result = await api.cancelTasks(projectId, outputs.map(output => output.data.taskId))
      const ids = new Set(outputs.filter(output => output.data.status === 'queued').map(output => output.id))
      set(state => ({
        nodes: state.nodes.map(node => node.type === 'output' && ids.has(node.id)
          ? { ...node, data: { ...(node as FlowOutputNode).data, status: 'failed' } }
          : node),
        workflowMessage: `已取消 ${result.cancelled} 个排队任务；${result.cancelling} 个运行中任务正在停止`,
      }))
      await get().refreshWorkflowEvents()
    } catch (error) {
      set({ workflowMessage: error instanceof Error ? error.message : '任务取消失败' })
    } finally {
      set({ workflowBusy: false })
    }
  },

  retryFailedOutputs: async () => {
    const projectId = get().backendProjectId
    const outputs = get().nodes
      .filter(node => node.type === 'output')
      .map(node => node as FlowOutputNode)
      .filter(node => node.data.status === 'failed')
    if (!projectId || !outputs.length) return
    set({ workflowBusy: true, workflowMessage: `正在重试 ${outputs.length} 个失败任务...` })
    try {
      await Promise.all(outputs.map(output => api.regenerateTask(projectId, output.data.taskId)))
      const ids = new Set(outputs.map(output => output.id))
      const runId = get().versionCounter + 1
      set(state => ({
        versionCounter: runId,
        nodes: state.nodes.map(node => node.type === 'output' && ids.has(node.id)
          ? {
              ...node,
              data: {
                ...(node as FlowOutputNode).data,
                status: 'generating',
                versionId: null,
                thumbnail: null,
                cost: 0,
                durationMs: null,
              },
            }
          : node),
        edges: state.edges.map(edge => edge.edgeType === 'output' ? { ...edge, animated: true } : edge),
      }))
      await pollTasks(runId)
    } catch (error) {
      set({ workflowMessage: error instanceof Error ? error.message : '失败任务重试失败' })
    } finally {
      set({ workflowBusy: false })
    }
  },

  addInputNode: categoryId => {
    const cat = findCategory(categoryId)
    if (!cat) return
    const newNode: FlowInputNode = {
      id: nid('input'), type: 'input',
      position: inputPosition(get().nodes.filter(node => node.type === 'input').length),
      collapsed: false,
      data: {
        categoryId: cat.id, categoryName: cat.name, categoryGroup: cat.group, parentCategoryId: cat.parentId,
        attributeOptions: [], attributes: {}, structureFieldOptions: [], structureFacts: {},
        image: null, status: 'empty',
      },
    }
    const inputCount = get().nodes.filter(node => node.type === 'input').length + 1
    const nextNodes = [
      ...get().nodes.map(node => node.type === 'model'
        ? { ...node, position: modelPosition(inputCount) }
        : node),
      newNode,
    ]
    const newEdges = get().nodes
      .filter(n => n.type === 'processing')
      .map(proc => ({ id: nid('edge'), source: newNode.id, target: proc.id, edgeType: 'material' as const }))
    set(state => ({
      nodes: organizeNodes(nextNodes),
      edges: [...state.edges, ...newEdges],
      typePickerOpen: false,
      changeTypeTargetNodeId: null,
      layoutDirty: true,
    }))
    void get().loadInputAttributes(newNode.id)
  },

  removeNode: async nodeId => {
    if (get().workflowBusy) return
    const removed = get().nodes.find(node => node.id === nodeId)
    if (removed?.type !== 'input') return
    const input = removed as FlowInputNode
    const remote = input.data.image?.remote
    if (remote) {
      set({ workflowBusy: true, workflowMessage: `正在删除 ${input.data.categoryName}...` })
      try {
        await api.deleteItem(remote.projectId, remote.itemId)
      } catch (error) {
        set({ workflowMessage: error instanceof Error ? error.message : '单品删除失败' })
        return
      } finally {
        set({ workflowBusy: false })
      }
    }
    revokeThumbnail(input.data.image?.thumbnailUrl)
    set(state => {
      const removedIds = new Set(
        state.nodes
          .filter(node => node.id === nodeId || (
            remote && node.type === 'output' && (node as FlowOutputNode).data.itemId === remote.itemId
          ))
          .map(node => node.id),
      )
      const inputGenerationTypes = { ...state.inputGenerationTypes }
      if (remote) delete inputGenerationTypes[remote.itemId]
      return {
        nodes: state.nodes.filter(node => !removedIds.has(node.id)),
        edges: state.edges.filter(edge => !removedIds.has(edge.source) && !removedIds.has(edge.target)),
        inputGenerationTypes,
        selectedNodeId: removedIds.has(state.selectedNodeId ?? '') ? null : state.selectedNodeId,
        changeTypeTargetNodeId: state.changeTypeTargetNodeId === nodeId ? null : state.changeTypeTargetNodeId,
        workflowMessage: remote ? `${input.data.categoryName}及关联任务已删除` : `${input.data.categoryName}节点已删除`,
        layoutDirty: true,
      }
    })
  },

  uploadImage: (nodeId, image, file) => {
    const previous = get().nodes
      .find(node => node.id === nodeId)
    const previousImage = previous?.type === 'input' ? (previous as FlowInputNode).data.image : null
    set(state => ({
      workflowBusy: true,
      workflowMessage: `正在导入 ${image.fileName}...`,
      nodes: state.nodes.map(node => node.type === 'input' && node.id === nodeId
        ? { ...node, data: { ...(node as FlowInputNode).data, image, status: 'uploaded' } }
        : node),
    }))
    void (async () => {
      try {
        if (!file) throw new Error('缺少文件对象，无法写入后端')
        const projectId = await ensureProject()
        const category = get().nodes
          .find(node => node.id === nodeId) as FlowInputNode | undefined
        const categoryId = category?.data.categoryId || 'top'
        const attributes = category?.data.attributes ?? {}
        let itemId = previousImage?.remote?.itemId
        let assetId = previousImage?.remote?.assetId
        if (itemId && assetId) {
          await api.replaceAsset(projectId, assetId, file)
        } else {
          const item = await api.createItem(projectId, {
            name: file.name.replace(/\.[^.]+$/, ''),
            categoryId,
            attributes,
            structureFacts: category?.data.structureFacts ?? {},
            colorMaterial: '以原图为准',
            sellingPoints: '结构、比例、颜色和细节严格保留',
            isSellable: true,
          })
          itemId = item.id
          try {
            const asset = await api.importAsset(projectId, file)
            assetId = asset.id
            await api.confirmAsset(projectId, assetId, itemId, categoryId, 'front')
          } catch (error) {
            await api.deleteItem(projectId, itemId).catch(() => undefined)
            throw error
          }
        }
        const stableNodeId = previousImage?.remote ? nodeId : `asset-${assetId}`
        set(state => ({
          nodes: state.nodes.map(node => node.type === 'input' && node.id === nodeId
            ? {
                ...node,
                id: stableNodeId,
                data: {
                  ...(node as FlowInputNode).data,
                  image: { ...(node as FlowInputNode).data.image!, remote: { projectId, itemId: itemId!, assetId: assetId! } },
                  status: 'confirmed',
                },
              }
            : node),
          edges: state.edges.map(edge => ({ ...edge, source: edge.source === nodeId ? stableNodeId : edge.source })),
          selectedNodeId: stableNodeId,
          inputGenerationTypes: {
            ...state.inputGenerationTypes,
            [itemId!]: state.inputGenerationTypes[itemId!] ?? [...state.generationTypes],
          },
          workflowMessage: previousImage?.remote ? `素材已原位替换：${file.name}` : `素材已入库：${file.name}`,
          layoutDirty: true,
        }))
        revokeThumbnail(previousImage?.thumbnailUrl)
      } catch (error) {
        const message = error instanceof Error ? error.message : '素材导入失败'
        revokeThumbnail(image.thumbnailUrl)
        set(state => ({
          nodes: state.nodes.map(node => node.type === 'input' && node.id === nodeId
            ? {
                ...node,
                data: {
                  ...(node as FlowInputNode).data,
                  status: previousImage?.remote ? 'confirmed' : 'error',
                  image: previousImage?.remote ? previousImage : (node as FlowInputNode).data.image
                    ? { ...(node as FlowInputNode).data.image!, error: message } : null,
                },
              }
            : node),
          workflowMessage: message,
        }))
      } finally {
        set({ workflowBusy: false })
      }
    })()
  },

  changeNodeType: (nodeId, categoryId) => {
    const cat = findCategory(categoryId)
    if (!cat) return
    const previous = get().nodes.find(node => node.type === 'input' && node.id === nodeId) as FlowInputNode | undefined
    if (!previous) return
    if (previous.data.categoryId === categoryId) {
      set({ typePickerOpen: false, changeTypeTargetNodeId: null })
      return
    }
    const remote = previous.data.image?.remote
    set(state => ({
      nodes: state.nodes.map(node => {
        if (node.type !== 'input' || node.id !== nodeId) return node
        const input = node as FlowInputNode
        return {
          ...node,
          data: {
            ...input.data,
            categoryId: cat.id, categoryName: cat.name, categoryGroup: cat.group, parentCategoryId: cat.parentId,
            attributeOptions: [], attributes: {}, structureFieldOptions: [], structureFacts: {},
            image: input.data.image,
          },
        }
      }),
      typePickerOpen: false,
      changeTypeTargetNodeId: null,
      layoutDirty: true,
    }))
    void (async () => {
      if (remote) {
        set({ workflowBusy: true, workflowMessage: `正在更新品类为 ${cat.name}...` })
        try {
          await api.updateItem(remote.projectId, remote.itemId, {
            categoryId: cat.id, attributes: {}, structureFacts: {},
          })
          set(state => {
            const staleOutputIds = new Set(
              state.nodes
                .filter(node => node.type === 'output' && (node as FlowOutputNode).data.itemId === remote.itemId)
                .map(node => node.id),
            )
            return {
              nodes: state.nodes.filter(node => !staleOutputIds.has(node.id)),
              edges: state.edges.filter(edge => !staleOutputIds.has(edge.source) && !staleOutputIds.has(edge.target)),
              selectedNodeId: staleOutputIds.has(state.selectedNodeId ?? '') ? nodeId : state.selectedNodeId,
              shotPlan: null,
              realGenerationConfirm: null,
              workflowMessage: `品类已更新为 ${cat.name}，旧品类镜头方案已清除`,
            }
          })
        } catch (error) {
          set(state => ({
            nodes: state.nodes.map(node => node.type === 'input' && node.id === nodeId
              ? { ...node, data: previous.data }
              : node),
            workflowMessage: error instanceof Error ? error.message : '品类更新失败',
          }))
          return
        } finally {
          set({ workflowBusy: false })
        }
      }
      await get().loadInputAttributes(nodeId)
    })()
  },

  loadInputAttributes: async nodeId => {
    const node = get().nodes.find(item => item.id === nodeId)
    if (node?.type !== 'input') return
    const categoryId = (node as FlowInputNode).data.categoryId
    try {
      const [{ template }, { fields }] = await Promise.all([
        api.getShotTemplate(categoryId),
        api.listStructureFields(),
      ])
      const current = get().nodes.find(item => item.id === nodeId)
      if (current?.type !== 'input' || (current as FlowInputNode).data.categoryId !== categoryId) return
      const currentInput = current as FlowInputNode
      const attributes = Object.fromEntries(
        template.attributes.map(attribute => [
          attribute.key,
          Object.hasOwn(currentInput.data.attributes, attribute.key)
            ? currentInput.data.attributes[attribute.key]
            : attribute.default,
        ]),
      )
      const structureFieldOptions = fields.filter(field => {
        if (!field.parentIds?.length && !field.categoryIds?.length) return true
        return field.parentIds?.includes(currentInput.data.parentCategoryId)
          || field.categoryIds?.includes(currentInput.data.categoryId)
      })
      set(state => ({
        nodes: state.nodes.map(item => item.type === 'input' && item.id === nodeId
          ? {
              ...item,
              data: {
                ...(item as FlowInputNode).data,
                attributeOptions: template.attributes,
                attributes,
                structureFieldOptions,
              },
            }
          : item),
      }))
    } catch (error) {
      set({ workflowMessage: error instanceof Error ? error.message : '套图模板读取失败' })
    }
  },

  setInputAttribute: (nodeId, attributeKey, checked) => set(state => ({
    nodes: state.nodes.map(node => node.type === 'input' && node.id === nodeId
      ? {
          ...node,
          data: {
            ...(node as FlowInputNode).data,
            attributes: {
              ...(node as FlowInputNode).data.attributes,
              [attributeKey]: checked,
            },
          },
        }
      : node),
  })),

  setInputStructureFact: (nodeId, fieldKey, value) => set(state => ({
    nodes: state.nodes.map(node => node.type === 'input' && node.id === nodeId
      ? {
          ...node,
          data: {
            ...(node as FlowInputNode).data,
            structureFacts: {
              ...(node as FlowInputNode).data.structureFacts,
              [fieldKey]: value,
            },
          },
        }
      : node),
  })),

  saveInputFacts: async nodeId => {
    const input = get().nodes.find(node => node.type === 'input' && node.id === nodeId) as FlowInputNode | undefined
    const remote = input?.data.image?.remote
    if (!input || !remote) {
      set({ workflowMessage: '商品结构事实会在上传素材时一并保存' })
      return
    }
    set({ workflowBusy: true, workflowMessage: '正在保存商品事实...' })
    try {
      const item = await api.updateItem(remote.projectId, remote.itemId, {
        attributes: input.data.attributes,
        structureFacts: input.data.structureFacts,
      })
      set(state => ({
        nodes: state.nodes.map(node => node.type === 'input' && node.id === nodeId
          ? {
              ...node,
              data: {
                ...(node as FlowInputNode).data,
                attributes: item.attributes,
                structureFacts: item.structureFacts,
              },
            }
          : node),
        workflowMessage: `${input.data.categoryName}的商品事实已保存；后续任务会使用新提示词与缓存键`,
      }))
    } catch (error) {
      set({ workflowMessage: error instanceof Error ? error.message : '商品事实保存失败' })
    } finally {
      set({ workflowBusy: false })
    }
  },

  setChangeTypeTargetNodeId: nodeId => set({
    changeTypeTargetNodeId: nodeId,
    typePickerOpen: nodeId !== null,
  }),

  setModelStyle: styleId => {
    const style = MODEL_STYLES.find(item => item.id === styleId)
    const remote = get().availableModels.find(item => item.id === styleId)
    if (!style && !remote) return
    const selection = style
      ? { ...style, source: 'builtin' as const }
      : {
          id: remote!.id,
          name: remote!.name,
          group: '自定义模特',
          modelId: remote!.id,
          referenceUrl: remote!.referenceUrl,
          source: 'custom' as const,
        }
    globalThis.localStorage?.setItem('longy-selected-model', selection.modelId ?? selection.id)
    set(state => ({
      nodes: applyModelSelection(
        state.nodes.filter(node => node.type !== 'output'),
        selection,
      ).map(node => {
        if (node.type !== 'processing') return node
        const proc = node as FlowProcessingNode
        return { ...node, data: { ...proc.data, status: 'idle', estimatedCount: 0, estimatedCost: 0, actualCost: 0 } }
      }),
      edges: state.edges.filter(edge => edge.edgeType !== 'output'),
      modelPickerOpen: false,
      layoutDirty: true,
      workflowMessage: `已选择 ${selection.name}，请重新生成任务方案`,
    }))
    const projectId = get().backendProjectId
    if (projectId && selection.modelId) {
      void api.selectProjectModel(projectId, selection.modelId).catch(error => {
        set({ workflowMessage: error instanceof Error ? error.message : '模特选择保存失败' })
      })
    }
  },

  uploadCustomModel: async (file, authorization) => {
    if (get().workflowBusy) return
    set({ workflowBusy: true, workflowMessage: `正在上传自定义模特 ${file.name}...` })
    try {
      const projectId = await ensureProject()
      const name = file.name.replace(/\.[^.]+$/, '') || '自定义模特'
      const { model } = await api.importCustomModel(projectId, file, name, authorization)
      const modelResult = await api.listProjectModels(projectId)
      set({ availableModels: modelResult.models })
      globalThis.localStorage?.setItem('longy-selected-model', model.id)
      set(state => ({
        nodes: applyModelSelection(
          state.nodes.filter(node => node.type !== 'output'),
          {
            id: model.id,
            name: model.name,
            group: '自定义模特',
            modelId: model.id,
            referenceUrl: model.referenceUrl,
            source: 'custom',
          },
        ),
        edges: state.edges.filter(edge => edge.edgeType !== 'output'),
        modelPickerOpen: false,
        layoutDirty: true,
        workflowMessage: `自定义模特已入库并选中：${model.name}`,
      }))
    } catch (error) {
      set({ workflowMessage: error instanceof Error ? error.message : '自定义模特上传失败' })
    } finally {
      set({ workflowBusy: false })
    }
  },

  uploadModelReference: async (modelId, file, angle) => {
    if (get().workflowBusy) return
    set({ workflowBusy: true, workflowMessage: `正在补充模特身份角度 ${file.name}...` })
    try {
      const projectId = await ensureProject()
      await api.importModelReference(projectId, modelId, file, angle)
      const modelResult = await api.listProjectModels(projectId)
      set({
        availableModels: modelResult.models,
        workflowMessage: '模特多角度身份包已更新；后续模特图会自动使用这些身份参考',
      })
    } catch (error) {
      set({ workflowMessage: error instanceof Error ? error.message : '模特身份角度上传失败' })
    } finally {
      set({ workflowBusy: false })
    }
  },

  uploadProjectReference: async (file, role) => {
    if (get().workflowBusy) return
    set({ workflowBusy: true, workflowMessage: `正在上传${role === 'pose' ? '姿势' : role === 'detail' ? '细节' : '风格'}参考图...` })
    try {
      const projectId = await ensureProject()
      const { reference } = await api.importProjectReference(
        projectId,
        file,
        role,
        file.name.replace(/\.[^.]+$/, ''),
      )
      const inputCount = get().nodes.filter(node => node.type === 'input').length
      const referenceIndex = get().nodes.filter(node => node.type === 'pose' || node.type === 'reference').length
      const base = {
        id: `reference-${reference.id}`,
        position: referencePosition(inputCount, referenceIndex),
        collapsed: false,
      }
      const data = {
        referenceId: reference.id,
        name: reference.name,
        image: `/api/projects/${projectId}/references/${reference.id}/file`,
      }
      const node: FlowPoseNode | FlowReferenceNode = role === 'pose'
        ? { ...base, type: 'pose', data: { ...data, role: 'pose' } }
        : { ...base, type: 'reference', data: { ...data, role } }
      const nextEdges: FlowEdge[] = []
      if (node.type === 'pose') {
        const model = get().nodes.find(item => item.type === 'model')
        if (model) nextEdges.push({
          id: nid('edge'), source: model.id, target: node.id, edgeType: 'pose',
        })
      } else {
        const targetTypes: ProcessType[] = role === 'detail'
          ? ['detail', 'partial']
          : ['flat', 'detail', 'partial', 'model']
        targetTypes.forEach(type => {
          const process = get().nodes.find(item =>
            item.type === 'processing' && (item as FlowProcessingNode).data.processType === type)
          if (process) nextEdges.push({
            id: nid('edge'), source: node.id, target: process.id, edgeType: 'reference',
          })
        })
      }
      set(state => ({
        nodes: organizeNodes([...state.nodes.filter(item => item.type !== 'output'), node]),
        edges: [...state.edges.filter(edge => edge.edgeType !== 'output'), ...nextEdges],
        projectReferences: [...state.projectReferences, reference],
        layoutDirty: true,
        workflowMessage: `${reference.name} 已作为${role === 'pose' ? '姿势' : role === 'detail' ? '细节证据' : '风格'}参考节点加入画布`,
      }))
    } catch (error) {
      set({ workflowMessage: error instanceof Error ? error.message : '参考图上传失败' })
    } finally {
      set({ workflowBusy: false })
    }
  },

  removeProjectReference: async nodeId => {
    const node = get().nodes.find(item => item.id === nodeId)
    if (node?.type !== 'pose' && node?.type !== 'reference') return
    const referenceId = (node as FlowPoseNode | FlowReferenceNode).data.referenceId
    const projectId = get().backendProjectId
    if (!projectId) return
    try {
      await api.deleteProjectReference(projectId, referenceId)
      set(state => ({
        nodes: state.nodes.filter(item => item.id !== nodeId && item.type !== 'output'),
        edges: state.edges.filter(edge => edge.source !== nodeId && edge.target !== nodeId && edge.edgeType !== 'output'),
        projectReferences: state.projectReferences.filter(item => item.id !== referenceId),
        layoutDirty: true,
        workflowMessage: '参考节点已删除；请重新生成任务方案',
      }))
    } catch (error) {
      set({ workflowMessage: error instanceof Error ? error.message : '参考节点删除失败' })
    }
  },

  openCareEditor: cardId => set({
    careDialogOpen: true,
    careEditingCardId: cardId ?? null,
  }),

  closeCareEditor: () => set({ careDialogOpen: false, careEditingCardId: null }),

  saveCareCard: async (payload, cardId) => {
    if (get().workflowBusy) return
    set({ workflowBusy: true, workflowMessage: cardId ? '正在更新洗护说明图...' : '正在生成洗护说明图...' })
    try {
      const projectId = await ensureProject()
      if (cardId) await api.updateCareCard(projectId, cardId, payload)
      else await api.createCareCard(projectId, payload)
      const { careCards } = await api.listCareCards(projectId)
      const inputCount = get().nodes.filter(node => node.type === 'input').length
      const referenceCount = get().nodes.filter(node => node.type === 'pose' || node.type === 'reference').length
      const careNodes = careGraphNodes(careCards, projectId, inputCount, referenceCount)
      const careInput = careNodes[0]
      const careOutputs = careNodes.slice(1)
      const careEdges: FlowEdge[] = careOutputs.map(output => ({
        id: `edge-care-${(output as FlowCareOutputNode).data.cardId}`,
        source: careInput.id,
        target: output.id,
        edgeType: 'care',
      }))
      set(state => ({
        nodes: organizeNodes([
          ...state.nodes.filter(node => node.type !== 'careInput' && node.type !== 'careOutput'),
          ...careNodes,
        ]),
        edges: [
          ...state.edges.filter(edge => edge.edgeType !== 'care'),
          ...careEdges,
        ],
        careCards,
        careDialogOpen: false,
        careEditingCardId: null,
        workflowMessage: cardId ? '洗护说明图已更新' : '洗护说明图已生成并加入独立输出节点',
      }))
    } catch (error) {
      set({ workflowMessage: error instanceof Error ? error.message : '洗护说明图生成失败' })
      throw error
    } finally {
      set({ workflowBusy: false })
    }
  },

  uploadCareSource: async file => {
    if (get().workflowBusy) return null
    set({ workflowBusy: true, workflowMessage: `正在上传水洗标素材 ${file.name}...` })
    try {
      const projectId = await ensureProject()
      const asset = await api.importAsset(projectId, file)
      set(state => ({
        careSourceAssets: [...state.careSourceAssets.filter(item => item.id !== asset.id), asset],
        workflowMessage: '水洗标素材已上传，可开始自动识别',
      }))
      return asset
    } catch (error) {
      set({ workflowMessage: error instanceof Error ? error.message : '水洗标素材上传失败' })
      return null
    } finally {
      set({ workflowBusy: false })
    }
  },

  generatePlan: async () => {
    if (get().workflowBusy) return
    const activeInputs = get().nodes
      .filter(node => node.type === 'input')
      .map(node => node as FlowInputNode)
      .filter(node => node.data.image?.remote)
    if (!activeInputs.length) {
      set({ workflowMessage: '请先上传并成功导入至少一张模板素材' })
      return
    }
    set({ workflowBusy: true, workflowMessage: '正在读取套图镜头方案...' })
    try {
      const projectId = await ensureProject()
      const selectedModel = get().nodes
        .find(node => node.type === 'model') as FlowModelNode | undefined
      const modelId = selectedModel?.data.modelId
        ?? (selectedModel ? MODEL_STYLES.find(style => style.id === selectedModel.data.styleId)?.modelId : undefined)
      const plan = await api.previewShotPlan(projectId, modelId ? [modelId] : [], get().providerId)
      set({
        shotPlan: plan,
        workflowMessage: `镜头方案待确认：默认选择 ${plan.selectedCount} 个 P0 镜头，预估 ¥${plan.estimatedCost}`,
      })
    } catch (error) {
      set({ workflowMessage: error instanceof Error ? error.message : '镜头方案读取失败' })
    } finally {
      set({ workflowBusy: false })
    }
  },

  confirmShotPlan: async () => {
    const plan = get().shotPlan
    const projectId = get().backendProjectId || globalThis.localStorage?.getItem('longy-backend-project-id')
    if (!plan || !projectId) return
    const selectedIds = plan.items.flatMap(item =>
      item.shots.filter(shot => shot.status === 'selected').map(shot => shot.shotId)
    )
    set({ workflowBusy: true, workflowMessage: '正在保存镜头选择...' })
    try {
      const selections: ShotSelectionInput[] = plan.items.flatMap(item =>
        item.shots
          .filter((shot): shot is ShotPlanPreview['items'][number]['shots'][number] & { status: Exclude<ShotPlanPreview['items'][number]['shots'][number]['status'], 'proposed'> } => shot.status !== 'proposed')
          .map(shot => ({
            itemId: item.itemId,
            shotId: shot.shotId,
            shotName: shot.shotName,
            type: shot.type,
            priority: shot.priority,
            required: shot.required,
            isCustom: shot.isCustom,
            status: shot.status,
            source: shot.source,
            assetId: shot.assetId,
            reason: shot.reason,
            promptHints: shot.promptHints,
            promptMode: shot.promptMode,
            customPrompt: shot.customPrompt,
          })),
      )
      await api.saveShotSelections(projectId, selections)
      const selectedModel = get().nodes
        .find(node => node.type === 'model') as FlowModelNode | undefined
      const modelId = selectedModel?.data.modelId
        ?? (selectedModel ? MODEL_STYLES.find(style => style.id === selectedModel.data.styleId)?.modelId : undefined)
      await api.planTasks(projectId, modelId ? [modelId] : [], get().providerId, selectedIds)
      const { tasks } = await api.listTasks(projectId)
      const outputsByType = new Map<ProcessType, number>()
      const outputNodes: FlowOutputNode[] = tasks.map(task => {
        const count = outputsByType.get(task.type) ?? 0
        outputsByType.set(task.type, count + 1)
        const proc = get().nodes
          .find(node => node.type === 'processing' && (node as FlowProcessingNode).data.processType === task.type) as FlowProcessingNode
        return {
          id: nid('output'), type: 'output' as const,
          position: outputPosition(task.type, count, proc?.position.y ?? 40),
          collapsed: false,
          data: {
            taskId: task.id, versionId: task.currentVersionId,
            taskCode: task.code, taskName: task.name,
            itemId: task.itemId ?? null,
            prompt: task.prompt ?? '', negativePrompt: task.negativePrompt ?? '',
            shotId: task.shotId ?? null, shotName: task.shotName ?? null,
            priority: task.priority ?? null, imageType: task.type,
            status: 'queued' as const, thumbnail: null, version: 1,
            parentOutputId: null, rejectReason: null, customPrompt: null, revisionNote: null,
            referenceMode: 'original', baseVersionId: null,
            cost: 0, durationMs: null, tier: task.tier,
            qcScore: null, qcPassed: null,
            errorCode: null, errorMessage: null, versions: task.versions,
          },
        }
      })
      const outputIds = new Set(outputNodes.map(node => node.id))
      const procEdges: FlowEdge[] = outputNodes.map(output => {
        const proc = get().nodes
          .find(node => node.type === 'processing' && (node as FlowProcessingNode).data.processType === output.data.imageType)
        return { id: nid('edge'), source: proc!.id, target: output.id, edgeType: 'output' as const }
      })
      const nextInputScopes = { ...get().inputGenerationTypes }
      tasks.forEach(task => {
        if (task.itemId && !nextInputScopes[task.itemId]) {
          nextInputScopes[task.itemId] = [...get().generationTypes]
        }
      })
      set(state => ({
        inputGenerationTypes: nextInputScopes,
        nodes: organizeNodes([
          ...state.nodes.filter(node => node.type !== 'output'),
          ...outputNodes,
        ]).map(node => {
          if (node.type !== 'processing') return node
          const proc = node as FlowProcessingNode
          const count = tasks.filter(task => task.type === proc.data.processType).length
          const cost = tasks
            .filter(task => task.type === proc.data.processType)
            .reduce((sum, task) => sum + task.estimatedCost, 0)
          return { ...node, data: { ...proc.data, status: count ? 'planned' : 'idle', estimatedCount: count, estimatedCost: cost } }
        }),
        edges: [
          ...state.edges.filter(edge => edge.edgeType !== 'output' && !outputIds.has(edge.target)),
          ...procEdges,
        ],
        shotPlan: null,
        layoutDirty: true,
        workflowMessage: `任务方案已确认：${tasks.length} 个 ${get().providers.find(item => item.id === get().providerId)?.name ?? get().providerId} 任务`,
      }))
      useWorkbench.getState().setMode('generate')
    } catch (error) {
      set({ workflowMessage: error instanceof Error ? error.message : '镜头方案确认失败' })
    } finally {
      set({ workflowBusy: false })
    }
  },

  closeShotPlan: () => set({ shotPlan: null }),

  setShotPlanTypes: types => set(state => {
    if (!state.shotPlan) return {}
    const allowed = new Set(types)
    const items = state.shotPlan.items.map(item => {
      const selectedCostByType = new Map(item.shots
        .filter(shot => shot.status === 'selected' && shot.estimatedCost > 0)
        .map(shot => [shot.type, shot.estimatedCost]))
      const fallbackCost = item.shots.find(shot => shot.status === 'selected')?.estimatedCost ?? 0
      const shots = item.shots.map(shot => {
        const selected = allowed.has(shot.type) && shot.priority === 'P0'
        return {
          ...shot,
          status: selected ? 'selected' as const : 'proposed' as const,
          source: selected ? 'ai' as const : 'manual' as const,
          assetId: null,
          reason: '',
          estimatedCost: selected
            ? selectedCostByType.get(shot.type) ?? fallbackCost
            : 0,
        }
      })
      return {
        ...item,
        shots,
        selectedCount: shots.filter(shot => shot.status === 'selected').length,
        estimatedCost: shots.reduce((sum, shot) => sum + shot.estimatedCost, 0),
      }
    })
    return {
      shotPlan: {
        ...state.shotPlan,
        items,
        selectedCount: items.reduce((sum, item) => sum + item.selectedCount, 0),
        estimatedCost: items.reduce((sum, item) => sum + item.estimatedCost, 0),
      },
    }
  }),

  updateShotPlanSelection: (itemId, shotId, patch) => set(state => {
    if (!state.shotPlan) return {}
    const items = state.shotPlan.items.map(item => {
      if (item.itemId !== itemId) return item
      const selectedCostByType = new Map(item.shots
        .filter(shot => shot.status === 'selected' && shot.estimatedCost > 0)
        .map(shot => [shot.type, shot.estimatedCost]))
      const fallbackCost = item.shots.find(shot => shot.status === 'selected')?.estimatedCost ?? 0
      const shots = item.shots.map(shot => {
        if (shot.shotId !== shotId) return shot
        const nextStatus = patch.status ?? shot.status
        return {
          ...shot,
          ...patch,
          estimatedCost: nextStatus === 'selected'
            ? selectedCostByType.get(shot.type) ?? fallbackCost
            : 0,
        }
      })
      return { ...item, shots }
    })
    const nextItems = recalculateShotPlanItems(items)
    return {
      shotPlan: {
        ...state.shotPlan,
        items: nextItems,
        selectedCount: nextItems.reduce((sum, item) => sum + item.selectedCount, 0),
        estimatedCost: nextItems.reduce((sum, item) => sum + item.estimatedCost, 0),
      },
    }
  }),

  addCustomShot: (itemId, shot) => set(state => {
    if (!state.shotPlan) return {}
    const items = state.shotPlan.items.map(item => {
      if (item.itemId !== itemId) return item
      const sameTypeCost = item.shots.find(candidate =>
        candidate.type === shot.type && candidate.status === 'selected' && candidate.estimatedCost > 0
      )?.estimatedCost
      const anyCost = item.shots.find(candidate => candidate.status === 'selected')?.estimatedCost ?? 0
      const customShot = {
        shotId: `custom-${Date.now().toString(36)}`,
        shotName: shot.name,
        type: shot.type,
        priority: shot.priority,
        required: shot.priority === 'P0',
        isCustom: true,
        promptHints: shot.promptHints,
        promptMode: 'default' as const,
        customPrompt: '',
        status: 'selected' as const,
        source: 'ai' as const,
        assetId: null,
        reason: '',
        estimatedCost: sameTypeCost ?? anyCost,
      }
      return { ...item, shots: [...item.shots, customShot] }
    })
    const nextItems = recalculateShotPlanItems(items)
    return {
      shotPlan: {
        ...state.shotPlan,
        items: nextItems,
        selectedCount: nextItems.reduce((sum, item) => sum + item.selectedCount, 0),
        estimatedCost: nextItems.reduce((sum, item) => sum + item.estimatedCost, 0),
      },
    }
  }),

  startGeneration: async () => {
    let outputs = get().nodes
      .filter(node => node.type === 'output')
      .map(node => (node as FlowOutputNode).data)
    if (!outputs.length) {
      await get().generatePlan()
      outputs = get().nodes
        .filter(node => node.type === 'output')
        .map(node => (node as FlowOutputNode).data)
    }
    const taskIds = outputs
      .filter(output => ['queued', 'failed'].includes(output.status))
      .filter(output => (get().inputGenerationTypes[output.itemId ?? ''] ?? get().generationTypes).includes(output.imageType))
      .map(output => output.taskId)
    if (!taskIds.length) {
      set({ workflowMessage: '没有待生成任务；请先生成方案或重生成失败任务' })
      return
    }
    const projectId = await ensureProject()
    if (get().providerId !== 'mock' && !get().realGenerationConfirm) {
      if (!get().providers.length) await get().refreshProviders()
      const provider = get().providers.find(item => item.id === get().providerId)
      if (provider?.available === false) {
        set({ workflowMessage: `${provider.name} 未配置或不可用，请检查 API Key / CLI` })
        return
      }
      set({
        realGenerationConfirm: {
          taskIds,
          count: taskIds.length,
          providerName: provider?.name || String(get().providerId),
          estimatedCost: taskIds.length * (provider?.pricePerImage.draft ?? 1),
        },
        workflowMessage: '真实 Provider 已拦截，等待人工确认',
      })
      return
    }
    set({ workflowBusy: true, workflowMessage: '后端队列已提交...' })
    try {
      await api.submitTasks(projectId, taskIds)
      const runId = get().versionCounter + 1
      set(state => ({
        versionCounter: runId,
        workflowMessage: '后端队列运行中',
        realGenerationConfirm: null,
        nodes: state.nodes.map(node => {
          if (node.type !== 'output') return node
          const output = node as FlowOutputNode
          return taskIds.includes(output.data.taskId)
            ? { ...node, data: { ...output.data, status: 'generating' } }
            : node
        }),
        edges: state.edges.map(edge => edge.edgeType === 'output' ? { ...edge, animated: true } : edge),
      }))
      await pollTasks(runId)
      advanceAfterGenerationRun()
    } catch (error) {
      set({ workflowMessage: error instanceof Error ? error.message : '任务提交失败' })
    } finally {
      set({ workflowBusy: false })
    }
  },

  confirmRealGeneration: async () => {
    const confirm = get().realGenerationConfirm
    if (!confirm) return
    set({ workflowBusy: true, workflowMessage: '真实生成确认中...' })
    try {
      const projectId = await ensureProject()
      await api.submitTasks(projectId, confirm.taskIds)
      const runId = get().versionCounter + 1
      set(state => ({
        versionCounter: runId,
        realGenerationConfirm: null,
        workflowMessage: '真实生成队列运行中',
        nodes: state.nodes.map(node => {
          if (node.type !== 'output') return node
          const output = node as FlowOutputNode
          return confirm.taskIds.includes(output.data.taskId)
            ? { ...node, data: { ...output.data, status: 'generating' } }
            : node
        }),
        edges: state.edges.map(edge => edge.edgeType === 'output' ? { ...edge, animated: true } : edge),
      }))
      await pollTasks(runId)
      advanceAfterGenerationRun()
    } catch (error) {
      set({ workflowMessage: error instanceof Error ? error.message : '真实生成提交失败' })
    } finally {
      set({ workflowBusy: false })
    }
  },

  cancelRealGeneration: () => set({
    realGenerationConfirm: null,
    workflowMessage: '已取消真实生成，未提交任何 API 请求',
  }),

  markSatisfied: async nodeId => {
    const output = get().nodes.find(node => node.id === nodeId) as FlowOutputNode | undefined
    const projectId = get().backendProjectId
    if (!output || !projectId) return
    set({ workflowBusy: true })
    try {
      await api.reviewTask(projectId, output.data.taskId, 'accept')
      set(state => ({
        nodes: state.nodes.map(node => node.type === 'output' && node.id === nodeId
          ? { ...node, data: { ...(node as FlowOutputNode).data, status: 'satisfied' } }
          : node),
        workflowMessage: `${output.data.taskCode} 已满意`,
      }))
    } finally {
      set({ workflowBusy: false })
    }
  },

  markSatisfiedBatch: async nodeIds => {
    const projectId = get().backendProjectId
    const outputs = get().nodes
      .filter(node => node.type === 'output' && nodeIds.includes(node.id))
      .map(node => node as FlowOutputNode)
      .filter(node => node.data.status === 'pending')
    if (!projectId || !outputs.length) return
    set({ workflowBusy: true, workflowMessage: `正在批量审核 ${outputs.length} 张图片...` })
    try {
      await Promise.all(outputs.map(output => api.reviewTask(projectId, output.data.taskId, 'accept')))
      const ids = new Set(outputs.map(output => output.id))
      set(state => ({
        nodes: state.nodes.map(node => node.type === 'output' && ids.has(node.id)
          ? { ...node, data: { ...(node as FlowOutputNode).data, status: 'satisfied' } }
          : node),
      }))
      const { tasks } = await api.listTasks(projectId)
      applyTasks(tasks)
      set({ workflowMessage: `批量审核完成：${outputs.length} 张已标记满意` })
    } catch (error) {
      set({ workflowMessage: error instanceof Error ? error.message : '批量审核失败' })
    } finally {
      set({ workflowBusy: false })
    }
  },

  markUnsatisfied: async (nodeId, reason, customPrompt) => {
    const output = get().nodes.find(node => node.id === nodeId) as FlowOutputNode | undefined
    const projectId = get().backendProjectId
    if (!output || !projectId) return
    set({ workflowBusy: true })
    try {
      await api.reviewTask(projectId, output.data.taskId, 'reject', reason || 'detail')
      set(state => ({
        nodes: state.nodes.map(node => node.type === 'output' && node.id === nodeId
          ? {
              ...node,
              data: {
                ...(node as FlowOutputNode).data,
                status: 'unsatisfied', rejectReason: reason ?? null, customPrompt: customPrompt ?? null,
                revisionNote: customPrompt ?? null,
              },
            }
          : node),
        workflowMessage: `${output.data.taskCode} 已标记不满意`,
      }))
    } finally {
      set({ workflowBusy: false })
    }
  },

  regenerate: async (nodeId, revision) => {
    const output = get().nodes.find(node => node.id === nodeId) as FlowOutputNode | undefined
    const projectId = get().backendProjectId
    if (!output || !projectId) return
    set({ workflowBusy: true, workflowMessage: revision ? '正在提交提示词修正...' : '正在创建新版本...' })
    try {
      const result = await api.regenerateTask(projectId, output.data.taskId, revision && {
        prompt: revision.prompt?.trim() || undefined,
        negativePrompt: revision.negativePrompt?.trim() || undefined,
        reason: revision.reason?.trim() || undefined,
        note: revision.note?.trim() || undefined,
        referenceMode: revision.referenceMode ?? 'original',
        baseVersionId: revision.referenceMode === 'generated'
          ? revision.baseVersionId ?? output.data.versionId
          : undefined,
        maskDataUrl: revision.maskDataUrl,
      })
      const runId = get().versionCounter + 1
      set(state => ({
        versionCounter: runId,
        nodes: state.nodes.map(node => node.type === 'output' && node.id === nodeId
          ? {
              ...node,
              data: {
                ...(node as FlowOutputNode).data,
                status: 'generating', version: result.version, versionId: null,
                prompt: revision?.prompt?.trim() || output.data.prompt,
                negativePrompt: revision?.negativePrompt?.trim() || output.data.negativePrompt,
                rejectReason: revision?.reason ?? output.data.rejectReason,
                customPrompt: revision?.prompt?.trim() || null,
                revisionNote: revision?.note?.trim() || null,
                thumbnail: null, cost: 0, durationMs: null,
                errorCode: null, errorMessage: null,
              },
            }
          : node),
        edges: state.edges.map(edge => edge.edgeType === 'output' ? { ...edge, animated: true } : edge),
      }))
      await pollTasks(runId)
    } catch (error) {
      set({ workflowMessage: error instanceof Error ? error.message : '重生成失败' })
    } finally {
      set({ workflowBusy: false })
    }
  },

  startHdRepair: async nodeId => {
    const output = get().nodes.find(node => node.id === nodeId) as FlowOutputNode | undefined
    const projectId = get().backendProjectId
    if (!output || !projectId) return
    set({ workflowBusy: true, workflowMessage: '正在创建高清细节修复版本...' })
    try {
      const result = await api.startHdRepair(projectId, output.data.taskId)
      const runId = get().versionCounter + 1
      set(state => ({
        versionCounter: runId,
        nodes: state.nodes.map(node => node.type === 'output' && node.id === nodeId
          ? {
              ...node,
              data: {
                ...(node as FlowOutputNode).data,
                status: 'generating',
                version: result.version,
                versionId: result.versionId,
                tier: 'hd',
                thumbnail: null,
                cost: 0,
                durationMs: null,
                qcScore: null,
                qcPassed: null,
                errorCode: null,
                errorMessage: null,
              },
            }
          : node),
        edges: state.edges.map(edge => edge.edgeType === 'output' ? { ...edge, animated: true } : edge),
      }))
      await pollTasks(runId)
    } catch (error) {
      set({ workflowMessage: error instanceof Error ? error.message : '高清修复创建失败' })
    } finally {
      set({ workflowBusy: false })
    }
  },

  lockOutput: async nodeId => {
    const output = get().nodes.find(node => node.id === nodeId) as FlowOutputNode | undefined
    const projectId = get().backendProjectId
    if (!output || !projectId) return
    if (output.data.qcPassed !== true) {
      set({ workflowMessage: '一致性质检未通过或尚未完成，请先修正并重新生成' })
      return
    }
    set({ workflowBusy: true, workflowMessage: '正在锁定版本...' })
    try {
      await api.reviewTask(projectId, output.data.taskId, 'lock')
      set(state => ({
        nodes: state.nodes.map(node => node.type === 'output' && node.id === nodeId
          ? { ...node, data: { ...(node as FlowOutputNode).data, status: 'locked' } }
          : node),
        workflowMessage: `${output.data.taskCode} v${output.data.version} 已锁定`,
      }))
      advanceAfterReviewSettled()
    } catch (error) {
      set({ workflowMessage: error instanceof Error ? error.message : '版本锁定失败' })
    } finally {
      set({ workflowBusy: false })
    }
  },

  lockOutputsBatch: async nodeIds => {
    const projectId = get().backendProjectId
    const outputs = get().nodes
      .filter(node => node.type === 'output' && nodeIds.includes(node.id))
      .map(node => node as FlowOutputNode)
      .filter(node => node.data.status === 'satisfied' && node.data.qcPassed === true)
    if (!projectId || !outputs.length) return
    set({ workflowBusy: true, workflowMessage: `正在批量锁定 ${outputs.length} 张图片...` })
    try {
      await Promise.all(outputs.map(output => api.reviewTask(projectId, output.data.taskId, 'lock')))
      const ids = new Set(outputs.map(output => output.id))
      set(state => ({
        nodes: state.nodes.map(node => node.type === 'output' && ids.has(node.id)
          ? { ...node, data: { ...(node as FlowOutputNode).data, status: 'locked' } }
          : node),
      }))
      const { tasks } = await api.listTasks(projectId)
      applyTasks(tasks)
      set({ workflowMessage: `批量锁定完成：${outputs.length} 张` })
      advanceAfterReviewSettled()
    } catch (error) {
      set({ workflowMessage: error instanceof Error ? error.message : '批量锁定失败' })
    } finally {
      set({ workflowBusy: false })
    }
  },

  restoreOutputVersion: async (nodeId, versionId) => {
    const output = get().nodes.find(node => node.id === nodeId) as FlowOutputNode | undefined
    const projectId = get().backendProjectId
    if (!output || !projectId) return
    set({ workflowBusy: true, workflowMessage: '正在恢复历史版本...' })
    try {
      await api.restoreTaskVersion(projectId, output.data.taskId, versionId)
      const { tasks } = await api.listTasks(projectId)
      applyTasks(tasks)
      set({ workflowMessage: `${output.data.taskCode} 已恢复所选历史版本` })
    } catch (error) {
      set({ workflowMessage: error instanceof Error ? error.message : '历史版本恢复失败' })
    } finally {
      set({ workflowBusy: false })
    }
  },

  exportLocked: async () => {
    const projectId = get().backendProjectId || globalThis.localStorage?.getItem('longy-backend-project-id')
    if (!projectId) return
    set({ workflowBusy: true, workflowMessage: '正在生成导出清单...' })
    try {
      const selection = get().exportSelection
      const preview = await api.exportPreview(projectId, selection.namingScheme)
      set({
        exportPreview: preview,
        exportSelection: {
          ...selection,
          targetDir: selection.targetDir || preview.exportDir,
          taskIds: preview.files.map(file => file.taskId).filter((id): id is string => Boolean(id)),
          assetIds: preview.files.map(file => file.assetId).filter((id): id is string => Boolean(id)),
        },
        workflowMessage: preview.coverageComplete
          ? `导出清单已生成：${preview.files.length} 个文件`
          : `导出被必拍镜头覆盖检查拦截：缺少 ${preview.missingShotNames.length} 个`,
      })
    } catch (error) {
      set({ workflowMessage: error instanceof Error ? error.message : '导出预览失败' })
    } finally {
      set({ workflowBusy: false })
    }
  },

  setExportSelection: patch => set(state => {
    const next = { ...state.exportSelection, ...patch }
    globalThis.localStorage?.setItem('lys-export-naming', next.namingScheme)
    globalThis.localStorage?.setItem('lys-export-dir', next.targetDir)
    return { exportSelection: next }
  }),

  confirmExportLocked: async () => {
    const projectId = get().backendProjectId || globalThis.localStorage?.getItem('longy-backend-project-id')
    const preview = get().exportPreview
    const selection = get().exportSelection
    if (!projectId || !preview?.coverageComplete) return
    if (!selection.taskIds.length && !selection.assetIds.length) return
    set({ workflowBusy: true, workflowMessage: '正在导出选中文件...' })
    try {
      const result = await api.exportTasks(projectId, selection.taskIds, {
        assetIds: selection.assetIds,
        targetDir: selection.targetDir || preview.exportDir,
        namingScheme: selection.namingScheme,
      })
      const { tasks } = await api.listTasks(projectId)
      applyTasks(tasks)
      set({
        exportPreview: null,
        exportResult: {
          exported: result.exported,
          failed: result.failed,
          files: result.mapping,
          targetDir: result.targetDir,
          manifestPath: result.manifestPath,
        },
        workflowMessage: `导出完成：${result.exported} 张成功，${result.failed.length} 张失败`,
      })
    } catch (error) {
      set({ workflowMessage: error instanceof Error ? error.message : '导出失败' })
    } finally {
      set({ workflowBusy: false })
    }
  },

  closeExportPreview: () => set({ exportPreview: null }),

  closeExportResult: () => set({ exportResult: null }),

  openVersionQc: async (nodeId, versionId) => {
    const output = get().nodes.find(node => node.id === nodeId) as FlowOutputNode | undefined
    const projectId = get().backendProjectId
    const targetVersionId = versionId ?? output?.data.versionId
    const historyVersion = output?.data.versions.find(version => version.id === targetVersionId)
    if (!output || !targetVersionId || !projectId) return
    set({ workflowBusy: true, workflowMessage: '正在读取一致性 QC 报告...' })
    try {
      const result = await api.getVersionQc(projectId, output.data.taskId, targetVersionId)
      set({
        versionQc: {
          taskId: output.data.taskId,
          taskCode: output.data.taskCode,
          taskName: output.data.taskName,
          versionId: targetVersionId,
          version: historyVersion?.version ?? output.data.version,
          score: result.score,
          passed: result.passed,
          report: result.report,
        },
        workflowMessage: '一致性 QC 报告已打开',
      })
    } catch (error) {
      set({ workflowMessage: error instanceof Error ? error.message : 'QC 报告读取失败' })
    } finally {
      set({ workflowBusy: false })
    }
  },

  closeVersionQc: () => set({ versionQc: null }),

  removeOutput: nodeId => set(state => ({
    nodes: state.nodes.filter(node => node.id !== nodeId),
    edges: state.edges.filter(edge => edge.target !== nodeId),
  })),

  openImageViewer: viewer => set({ imageViewer: viewer }),
  closeImageViewer: () => set({ imageViewer: null }),
  setSelected: id => set({ selectedNodeId: id }),
  setTypePickerOpen: open => set({ typePickerOpen: open }),
  setModelPickerOpen: open => set({ modelPickerOpen: open }),
  setProviderSettingsOpen: open => set({ providerSettingsOpen: open }),
}))
