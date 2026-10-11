import { create } from 'zustand'
import type {
  AnyFlowNode, FlowEdge, FlowInputNode, FlowModelNode, FlowProcessingNode, FlowOutputNode,
  UploadedImage, ProcessType,
} from '../types/node-system'
import { DEFAULT_INPUT_NODES, MODEL_STYLES, findCategory } from '../data/preset-categories'
import { PROCESS_ORDER, PROCESS_TITLES } from '../data/process-templates'
import { api, type ConsistencyQcReport, type ExportPreview, type ProviderInfo, type RemoteProject, type RemoteTask, type ShotPlanPreview, type ShotSelectionInput } from '../services/api'
import { organizeNodes, outputPosition } from '../workflow/node-layout'
import { buildRestoredProjectGraph } from '../workflow/project-restore'
import { activeBackendStatus, syncNodesWithTasks } from '../workflow/task-sync'

let uid = 0
const nid = (p: string) => `${p}-${Date.now().toString(36)}-${(uid++).toString(36)}`
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
const revokeThumbnail = (url?: string | null) => {
  if (url?.startsWith('blob:')) setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export interface NodeImageViewer {
  src: string
  title: string
  subtitle?: string
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

export interface ExportResultState {
  exported: number
  failed: Array<{ taskId?: string; assetId?: string; reason: string }>
  files: Array<{ taskId?: string; assetId?: string; written: string }>
  targetDir: string
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
  projectLibraryOpen: boolean
  fitViewCounter: number
  providerId: ProviderInfo['id']
  providers: ProviderInfo[]
  generationTypes: ProcessType[]
  workflowBusy: boolean
  workflowMessage: string
  restoreAttempted: boolean
  realGenerationConfirm: RealGenerationConfirm | null
  exportPreview: ExportPreview | null
  shotPlan: ShotPlanPreview | null
  exportResult: ExportResultState | null
  versionQc: VersionQcState | null

  initCanvas: () => void
  resetCanvas: () => void
  restoreLastProject: () => Promise<void>
  restoreProject: (projectId: string) => Promise<void>
  setProviderId: (providerId: ProviderInfo['id']) => void
  setProjectSettingsOpen: (open: boolean) => void
  setProjectLibraryOpen: (open: boolean) => void
  openProject: (projectId: string) => Promise<void>
  organizeLayout: () => void
  requestFitView: () => void
  saveProjectMeta: (payload: Partial<RemoteProject>) => Promise<void>
  refreshProviders: () => Promise<void>
  setGenerationTypes: (types: ProcessType[]) => void
  toggleGenerationType: (type: ProcessType) => void
  setShotPlanTypes: (types: ProcessType[]) => void
  addInputNode: (categoryId: string) => void
  removeNode: (nodeId: string) => void
  uploadImage: (nodeId: string, image: UploadedImage, file?: File) => void
  changeNodeType: (nodeId: string, categoryId: string) => void
  loadInputAttributes: (nodeId: string) => Promise<void>
  setInputAttribute: (nodeId: string, attributeKey: string, checked: boolean) => void
  setChangeTypeTargetNodeId: (nodeId: string | null) => void
  setModelStyle: (styleId: string) => void
  generatePlan: () => Promise<void>
  confirmShotPlan: () => Promise<void>
  closeShotPlan: () => void
  updateShotPlanSelection: (
    itemId: string,
    shotId: string,
    patch: Partial<Pick<ShotPlanPreview['items'][number]['shots'][number], 'status' | 'source' | 'assetId' | 'reason'>>,
  ) => void
  addCustomShot: (itemId: string, shot: { name: string; type: RemoteTask['type']; priority: ShotPlanPreview['items'][number]['shots'][number]['priority']; promptHints: string }) => void
  startGeneration: () => Promise<void>
  markSatisfied: (nodeId: string) => Promise<void>
  markUnsatisfied: (nodeId: string, reason?: string, customPrompt?: string) => Promise<void>
  regenerate: (nodeId: string) => Promise<void>
  startHdRepair: (nodeId: string) => Promise<void>
  lockOutput: (nodeId: string) => Promise<void>
  exportLocked: () => Promise<void>
  confirmExportLocked: () => Promise<void>
  closeExportPreview: () => void
  confirmRealGeneration: () => Promise<void>
  cancelRealGeneration: () => void
  closeExportResult: () => void
  openVersionQc: (nodeId: string) => Promise<void>
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

function applyTasks(tasks: RemoteTask[]): void {
  const projectId = useNodeStore.getState().backendProjectId
  if (!projectId) return
  useNodeStore.setState(state => ({
    nodes: syncNodesWithTasks(tasks, projectId, state.nodes),
    edges: state.edges.map(edge => ({ ...edge, animated: false })),
    workflowMessage: `后端任务同步完成：${tasks.length} 个任务`,
  }))
}
async function pollTasks(runId: number): Promise<void> {
  while (true) {
    await sleep(800)
    if (useNodeStore.getState().versionCounter !== runId) return
    const projectId = useNodeStore.getState().backendProjectId
    if (!projectId) return
    try {
      const { tasks } = await api.listTasks(projectId)
      applyTasks(tasks)
      const scopedTasks = tasks.filter(task => useNodeStore.getState().generationTypes.includes(task.type))
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
  projectLibraryOpen: false,
  fitViewCounter: 0,
  providerId: 'mock',
  providers: [],
  generationTypes: ['flat', 'partial', 'detail', 'model'],
  workflowBusy: false,
  workflowMessage: '',
  restoreAttempted: false,
  realGenerationConfirm: null,
  exportPreview: null,
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
        position: { x: 60, y: 40 + i * 250 },
        collapsed: false,
        data: {
          categoryId: cat.id, categoryName: cat.name, categoryGroup: cat.group,
          attributeOptions: [], attributes: {},
          image: null, status: 'empty' as const,
        },
      }
    })

    const modelNode: FlowModelNode = {
      id: nid('model'), type: 'model' as const,
      position: { x: 60, y: 40 + 4 * 250 + 20 },
      collapsed: false,
      data: {
        styleId: selectedStyle.id, styleName: selectedStyle.name,
        styleGroup: selectedStyle.group,
        modelImage: modelReferenceUrl(selectedStyle.modelId), locked: true,
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

    const edges: FlowEdge[] = []
    inputNodes.forEach(input => {
      procNodes.forEach(proc => {
        edges.push({ id: nid('edge'), source: input.id, target: proc.id, edgeType: 'material' })
      })
    })
    edges.push({
      id: nid('edge'),
      source: modelNode.id,
      target: procNodes.find(proc => proc.data.processType === 'model')!.id,
      edgeType: 'model',
    })
    set({ nodes: [...inputNodes, modelNode, ...procNodes], edges, canvasInitialized: true })
  },

  resetCanvas: () => {
    get().nodes.forEach(node => {
      if (node.type === 'input') revokeThumbnail((node as FlowInputNode).data.image?.thumbnailUrl)
    })
    globalThis.localStorage?.removeItem('longy-backend-project-id')
    projectPromise = null
    set({
      nodes: [], edges: [], canvasInitialized: false, backendProjectId: null, projectMeta: null,
      workflowMessage: '已新建空白工作台，上传素材后会创建新项目',
      realGenerationConfirm: null, exportResult: null,
      draftProjectMeta: { sku: '', name: '节点工作台项目', platform: 'local', style: 'v2 final', budget: 100 },
      projectSettingsOpen: true,
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
      const [{ project }, { assets }, { tasks }] = await Promise.all([
        api.getProject(projectId),
        api.listAssets(projectId),
        api.listTasks(projectId),
      ])
      const graph = buildRestoredProjectGraph({
        projectId,
        assets,
        tasks,
        selectedModelId: globalThis.localStorage?.getItem('longy-selected-model'),
        createId: nid,
      })
      const taskProvider = tasks[0]?.provider
      globalThis.localStorage?.setItem('longy-backend-project-id', projectId)
      set({
        ...graph,
        canvasInitialized: true,
        backendProjectId: projectId,
        projectMeta: project,
        providerId: taskProvider === 'openrouter-icu' ? 'openrouter-icu' : 'mock',
        workflowMessage: `已恢复项目 ${project.sku}：${assets.length} 张素材，${tasks.length} 个任务`,
      })
      await get().refreshProviders()
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
    set(state => ({
      providerId,
      nodes: state.nodes
        .filter(node => node.type !== 'output')
        .map(node => {
          if (node.type !== 'processing') return node
          const proc = node as FlowProcessingNode
          return { ...node, data: { ...proc.data, status: 'idle', estimatedCount: 0, estimatedCost: 0, actualCost: 0 } }
        }),
      edges: state.edges.filter(edge => edge.edgeType !== 'output'),
      realGenerationConfirm: null,
      workflowMessage: providerId === 'mock' ? '已切换 Mock Provider，不消耗真实 API' : '已切换 OpenRouter ICU，生成前会再次确认',
    }))
  },

  setProjectSettingsOpen: open => set({ projectSettingsOpen: open }),
  setProjectLibraryOpen: open => set({ projectLibraryOpen: open }),

  openProject: async projectId => {
    if (get().workflowBusy) return
    await get().restoreProject(projectId)
    set({ projectLibraryOpen: false })
    get().requestFitView()
  },

  organizeLayout: () => set(state => ({
    nodes: organizeNodes(state.nodes),
    workflowMessage: '已按「素材 → 处理 → 输出」自动整理布局',
  })),

  requestFitView: () => set(state => ({ fitViewCounter: state.fitViewCounter + 1 })),

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

  refreshProviders: async () => {
    try {
      const { providers } = await api.listProviders()
      set({ providers })
    } catch (error) {
      set({ workflowMessage: error instanceof Error ? error.message : 'Provider 列表读取失败' })
    }
  },

  addInputNode: categoryId => {
    const cat = findCategory(categoryId)
    if (!cat) return
    const newNode: FlowInputNode = {
      id: nid('input'), type: 'input',
      position: {
        x: 60,
        y: Math.max(0, ...get().nodes.filter(n => n.type === 'input').map(n => n.position.y)) + 280,
      },
      collapsed: false,
      data: {
        categoryId: cat.id, categoryName: cat.name, categoryGroup: cat.group,
        attributeOptions: [], attributes: {},
        image: null, status: 'empty',
      },
    }
    const newEdges = get().nodes
      .filter(n => n.type === 'processing')
      .map(proc => ({ id: nid('edge'), source: newNode.id, target: proc.id, edgeType: 'material' as const }))
    set(state => ({ nodes: [...state.nodes, newNode], edges: [...state.edges, ...newEdges], typePickerOpen: false, changeTypeTargetNodeId: null }))
    void get().loadInputAttributes(newNode.id)
  },

  removeNode: nodeId => {
    const removed = get().nodes.find(node => node.id === nodeId)
    if (removed?.type === 'input') revokeThumbnail((removed as FlowInputNode).data.image?.thumbnailUrl)
    set(state => ({
      nodes: state.nodes.filter(node => node.id !== nodeId),
      edges: state.edges.filter(edge => edge.source !== nodeId && edge.target !== nodeId),
      changeTypeTargetNodeId: get().changeTypeTargetNodeId === nodeId ? null : get().changeTypeTargetNodeId,
    }))
  },

  uploadImage: (nodeId, image, file) => {
    const previous = get().nodes
      .find(node => node.id === nodeId)
    const previousImage = previous?.type === 'input' ? (previous as FlowInputNode).data.image : null
    revokeThumbnail(previousImage?.thumbnailUrl)
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
        const item = await api.createItem(projectId, {
          name: file.name.replace(/\.[^.]+$/, ''),
          categoryId,
          attributes,
          colorMaterial: '以原图为准',
          sellingPoints: '结构、比例、颜色和细节严格保留',
          isSellable: true,
        })
        const asset = await api.importAsset(projectId, file)
        await api.confirmAsset(projectId, asset.id, item.id, categoryId, 'front')
        set(state => ({
          nodes: state.nodes.map(node => node.type === 'input' && node.id === nodeId
            ? {
                ...node,
                data: {
                  ...(node as FlowInputNode).data,
                  image: { ...(node as FlowInputNode).data.image!, remote: { projectId, itemId: item.id, assetId: asset.id } },
                  status: 'confirmed',
                },
              }
            : node),
          workflowMessage: `素材已入库：${file.name}`,
        }))
      } catch (error) {
        const message = error instanceof Error ? error.message : '素材导入失败'
        set(state => ({
          nodes: state.nodes.map(node => node.type === 'input' && node.id === nodeId
            ? {
                ...node,
                data: {
                  ...(node as FlowInputNode).data,
                  status: 'error',
                  image: (node as FlowInputNode).data.image
                    ? { ...(node as FlowInputNode).data.image!, error: message }
                    : null,
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
    set(state => ({
      nodes: state.nodes.map(node => {
        if (node.type !== 'input' || node.id !== nodeId) return node
        const input = node as FlowInputNode
        return {
          ...node,
          data: {
            ...input.data,
            categoryId: cat.id, categoryName: cat.name, categoryGroup: cat.group,
            attributeOptions: [], attributes: {},
            image: input.data.image ? { ...input.data.image, remote: undefined } : input.data.image,
          },
        }
      }),
      typePickerOpen: false,
      changeTypeTargetNodeId: null,
    }))
    void get().loadInputAttributes(nodeId)
  },

  loadInputAttributes: async nodeId => {
    const node = get().nodes.find(item => item.id === nodeId)
    if (node?.type !== 'input') return
    const categoryId = (node as FlowInputNode).data.categoryId
    try {
      const { template } = await api.getShotTemplate(categoryId)
      const current = get().nodes.find(item => item.id === nodeId)
      if (current?.type !== 'input' || (current as FlowInputNode).data.categoryId !== categoryId) return
      const attributes = Object.fromEntries(
        template.attributes.map(attribute => [attribute.key, attribute.default]),
      )
      set(state => ({
        nodes: state.nodes.map(item => item.type === 'input' && item.id === nodeId
          ? {
              ...item,
              data: {
                ...(item as FlowInputNode).data,
                attributeOptions: template.attributes,
                attributes,
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

  setChangeTypeTargetNodeId: nodeId => set({
    changeTypeTargetNodeId: nodeId,
    typePickerOpen: nodeId !== null,
  }),

  setModelStyle: styleId => {
    const style = MODEL_STYLES.find(item => item.id === styleId)
    if (!style) return
    globalThis.localStorage?.setItem('longy-selected-model', style.id)
    set(state => ({
      nodes: state.nodes
        .filter(node => node.type !== 'output')
        .map(node => {
          if (node.type !== 'processing') return node
          const proc = node as FlowProcessingNode
          return { ...node, data: { ...proc.data, status: 'idle', estimatedCount: 0, estimatedCost: 0, actualCost: 0 } }
        }),
      edges: state.edges.filter(edge => edge.edgeType !== 'output'),
      modelPickerOpen: false,
      workflowMessage: `已选择 ${style.name}，请重新生成任务方案`,
    }))
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
      const modelId = selectedModel
        ? MODEL_STYLES.find(style => style.id === selectedModel.data.styleId)?.modelId
        : undefined
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
          })),
      )
      await api.saveShotSelections(projectId, selections)
      const selectedModel = get().nodes
        .find(node => node.type === 'model') as FlowModelNode | undefined
      const modelId = selectedModel
        ? MODEL_STYLES.find(style => style.id === selectedModel.data.styleId)?.modelId
        : undefined
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
            shotId: task.shotId ?? null, shotName: task.shotName ?? null,
            priority: task.priority ?? null, imageType: task.type,
            status: 'queued' as const, thumbnail: null, version: 1,
            parentOutputId: null, rejectReason: null, customPrompt: null,
            cost: 0, durationMs: null, tier: task.tier,
            qcScore: null, qcPassed: null,
          },
        }
      })
      const outputIds = new Set(outputNodes.map(node => node.id))
      const procEdges: FlowEdge[] = outputNodes.map(output => {
        const proc = get().nodes
          .find(node => node.type === 'processing' && (node as FlowProcessingNode).data.processType === output.data.imageType)
        return { id: nid('edge'), source: proc!.id, target: output.id, edgeType: 'output' as const }
      })
      set(state => ({
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
        workflowMessage: `任务方案已确认：${tasks.length} 个 ${get().providerId === 'mock' ? 'Mock' : 'OpenRouter'} 任务`,
      }))
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
      .filter(output => get().generationTypes.includes(output.imageType))
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
              },
            }
          : node),
        workflowMessage: `${output.data.taskCode} 已标记不满意`,
      }))
    } finally {
      set({ workflowBusy: false })
    }
  },

  regenerate: async nodeId => {
    const output = get().nodes.find(node => node.id === nodeId) as FlowOutputNode | undefined
    const projectId = get().backendProjectId
    if (!output || !projectId) return
    set({ workflowBusy: true, workflowMessage: '正在创建新版本...' })
    try {
      const result = await api.regenerateTask(projectId, output.data.taskId)
      const runId = get().versionCounter + 1
      set(state => ({
        versionCounter: runId,
        nodes: state.nodes.map(node => node.type === 'output' && node.id === nodeId
          ? {
              ...node,
              data: {
                ...(node as FlowOutputNode).data,
                status: 'generating', version: result.version, versionId: null,
                thumbnail: null, cost: 0, durationMs: null,
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
    set({ workflowBusy: true, workflowMessage: '正在锁定版本...' })
    try {
      await api.reviewTask(projectId, output.data.taskId, 'lock')
      set(state => ({
        nodes: state.nodes.map(node => node.type === 'output' && node.id === nodeId
          ? { ...node, data: { ...(node as FlowOutputNode).data, status: 'locked' } }
          : node),
        workflowMessage: `${output.data.taskCode} v${output.data.version} 已锁定`,
      }))
    } catch (error) {
      set({ workflowMessage: error instanceof Error ? error.message : '版本锁定失败' })
    } finally {
      set({ workflowBusy: false })
    }
  },

  exportLocked: async () => {
    const projectId = get().backendProjectId || globalThis.localStorage?.getItem('longy-backend-project-id')
    const lockedTasks = get().nodes
      .filter(node => node.type === 'output')
      .map(node => (node as FlowOutputNode).data)
      .filter(output => output.status === 'locked')
    if (!projectId) return
    set({ workflowBusy: true, workflowMessage: '正在生成导出覆盖清单...' })
    try {
      const preview = await api.exportPreview(projectId)
      set({
        exportPreview: preview,
        workflowMessage: preview.coverageComplete
          ? '必拍镜头已齐，请在导出预览中确认'
          : `导出被拦截：缺少 ${preview.missingShotNames.length} 个必拍镜头`,
      })
    } catch (error) {
      set({ workflowMessage: error instanceof Error ? error.message : '导出预览失败' })
    } finally {
      set({ workflowBusy: false })
    }
  },

  confirmExportLocked: async () => {
    const projectId = get().backendProjectId || globalThis.localStorage?.getItem('longy-backend-project-id')
    const preview = get().exportPreview
    const lockedTasks = get().nodes
      .filter(node => node.type === 'output')
      .map(node => (node as FlowOutputNode).data)
      .filter(output => output.status === 'locked')
    if (!projectId || !preview?.coverageComplete) return
    set({ workflowBusy: true, workflowMessage: '正在导出锁定版本...' })
    try {
      const taskIds = lockedTasks.map(output => output.taskId)
      const result = await api.exportTasks(projectId, taskIds)
      const { tasks } = await api.listTasks(projectId)
      applyTasks(tasks)
      set({
        exportPreview: null,
        exportResult: {
          exported: result.exported,
          failed: result.failed,
          files: result.mapping,
          targetDir: result.targetDir,
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

  openVersionQc: async nodeId => {
    const output = get().nodes.find(node => node.id === nodeId) as FlowOutputNode | undefined
    const projectId = get().backendProjectId
    if (!output?.data.versionId || !projectId) return
    set({ workflowBusy: true, workflowMessage: '正在读取一致性 QC 报告...' })
    try {
      const result = await api.getVersionQc(projectId, output.data.taskId, output.data.versionId)
      set({
        versionQc: {
          taskId: output.data.taskId,
          taskCode: output.data.taskCode,
          taskName: output.data.taskName,
          versionId: output.data.versionId,
          version: output.data.version,
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
}))
