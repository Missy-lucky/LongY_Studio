import { create } from 'zustand'
import type {
  CategoryConfig, EventRecord, ExportFileNode, GenTask, GenerateStage, MaterialAsset,
  ModelProfile, ProductItem, ProjectInfo, RejectReason, SpecTemplate, TaskTier, TaskType,
  TaskVersion, ToastMsg, WorkMode, TaskStatus,
} from '../types/domain'
import { BUILT_IN_CATEGORIES, BUILT_IN_MODELS, BUILT_IN_SPECS, buildDemoMaterials } from '../data/built-in-data'
import { resolveProvider } from '../services/mock-provider'
import { placeholderThumb } from '../lib/placeholder'
import { fmtTime } from '../lib/status'

export type Selection =
  | { kind: 'project' }
  | { kind: 'material'; id: string }
  | { kind: 'category'; id: string }
  | { kind: 'task'; id: string }
  | { kind: 'model'; id: string }

let uidCounter = 0
const uid = (p: string) => `${p}-${Date.now().toString(36)}-${(uidCounter++).toString(36)}`
const runningCancels = new Map<string, { cancel(): void }>()

export interface WorkbenchState {
  project: ProjectInfo | null
  mode: WorkMode
  selection: Selection
  saveState: 'saved' | 'saving' | 'error'

  categories: CategoryConfig[]
  items: ProductItem[]
  materials: MaterialAsset[]
  models: ModelProfile[]
  specs: SpecTemplate[]

  tasks: GenTask[]
  events: EventRecord[]
  queueRunning: boolean
  queuePaused: boolean

  planOpen: boolean
  rejectTargetIds: string[] | null
  exportOpen: boolean
  exportDone: boolean
  exportFiles: ExportFileNode[]
  newProjectOpen: boolean
  paletteOpen: boolean
  lightbox: { taskId: string; compare: boolean } | null
  confirmDialog: { title: string; impact: string; cost: string; danger: boolean; onOk: () => void } | null

  toasts: ToastMsg[]
  statusFilter: TaskStatus | null

  newProject: (p: { sku: string; name: string; platform: string; style: string; budget: number }) => void
  importDemoAssets: () => void
  importFiles: (files: File[]) => void
  confirmMaterialCategory: (materialId: string, categoryId: string) => void
  toggleModel: (id: string) => void

  buildPlan: () => void
  openPlan: (open: boolean) => void
  startQueue: () => void
  pauseQueue: () => void
  resumeQueue: () => void
  removeTask: (id: string) => void

  accept: (taskId: string) => void
  openReject: (taskIds: string[]) => void
  reject: (taskIds: string[], reason: RejectReason, note: string) => void
  regenerate: (taskIds: string[]) => void
  lock: (taskId: string) => void
  unlock: (taskId: string) => void
  generateHdForLocked: () => void
  restoreVersion: (taskId: string, versionId: string) => void

  openExport: () => void
  closeExport: () => void
  doExport: () => void

  select: (s: Selection) => void
  setMode: (m: WorkMode) => void
  setStatusFilter: (s: TaskStatus | null) => void
  setNewProjectOpen: (v: boolean) => void
  setPaletteOpen: (v: boolean) => void
  setLightbox: (v: { taskId: string; compare: boolean } | null) => void
  setConfirmDialog: (v: WorkbenchState['confirmDialog']) => void
  toast: (kind: ToastMsg['kind'], title: string, detail?: string, hasDetail?: boolean) => void
  dismissToast: (id: string) => void
}

function pushEvent(state: WorkbenchState, type: string, message: string, taskId: string | null = null): EventRecord[] {
  const ev: EventRecord = { id: uid('ev'), time: fmtTime(Date.now()), taskId, type, message }
  return [ev, ...state.events].slice(0, 500)
}

function makeVersion(task: GenTask, tier: TaskTier, provider: string): TaskVersion {
  return {
    id: uid('v'), version: task.versions.length + 1, createdAt: new Date().toISOString(),
    tier, status: 'generating', reason: null, note: '', provider,
    cost: 0, durationMs: null, thumbnail: null, stage: 'upload',
  }
}

function buildTasksForItem(item: ProductItem, cat: CategoryConfig, models: ModelProfile[], codeStart: number): GenTask[] {
  const tasks: GenTask[] = []
  let code = codeStart
  const mk = (type: TaskType, name: string, view: string, promptCore: string): GenTask => {
    const id = uid('task')
    const hashSeed = `${item.id}:${type}:${view}`
    const cacheHit = (hashSeed.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 10) < 3
    return {
      id, code: `T${String(code++).padStart(3, '0')}`, name, type, itemId: item.id,
      shotId: null, shotName: null, priority: null,
      tier: 'draft', status: cacheHit ? 'cached' : 'planned', provider: 'mock',
      prompt: `${promptCore}。单品：${item.name}；颜色/材质：${item.colorMaterial}；卖点：${item.sellingPoints}。${type === 'model' ? cat.modelPromptHints : ''}`,
      negativePrompt: cat.negativeHints,
      estimatedCost: cacheHit ? 0 : 1, cacheHit, error: null,
      versions: [], currentVersionId: null, queueIndex: null, startedAt: null, endedAt: null,
    }
  }
  cat.requiredViews.slice(0, 4).forEach(v => tasks.push(mk('flat', `${item.name} ${v} 平面图`, v, `电商平面图，${v}视角，纯白背景，居中构图`)))
  cat.defaultDetailTasks.slice(0, 4).forEach(d => tasks.push(mk('detail', `${item.name} ${d} 细节图`, d, `细节微距图，重点展示${d}，浅灰渐变背景`)))
  cat.defaultPartialTasks.slice(0, 3).forEach(p => tasks.push(mk('partial', `${item.name} ${p} 局部图`, p, `局部搭配图，${p}，三分法构图`)))
  models.filter(m => m.enabled).forEach(m => {
    ['正面全身', '侧面全身', '背面全身'].forEach(a =>
      tasks.push(mk('model', `${m.name.split(' ·')[0]} ${a} 模特图`, a, `模特图，${m.name}，${a}，影棚灰墙背景`)))
  })
  return tasks
}

export const useWorkbench = create<WorkbenchState>((set, get) => ({
  project: null,
  mode: 'prepare',
  selection: { kind: 'project' },
  saveState: 'saved',

  categories: BUILT_IN_CATEGORIES,
  items: [],
  materials: [],
  models: BUILT_IN_MODELS,
  specs: BUILT_IN_SPECS,

  tasks: [],
  events: [],
  queueRunning: false,
  queuePaused: false,

  planOpen: false,
  rejectTargetIds: null,
  exportOpen: false,
  exportDone: false,
  exportFiles: [],
  newProjectOpen: false,
  paletteOpen: false,
  lightbox: null,
  confirmDialog: null,

  toasts: [],
  statusFilter: null,

  newProject: (p) => set({
    project: { id: uid('proj'), sku: p.sku, name: p.name, platform: p.platform, style: p.style, budget: p.budget, createdAt: new Date().toISOString() },
    items: [], materials: [], tasks: [], events: [], mode: 'prepare', selection: { kind: 'project' },
    queueRunning: false, queuePaused: false, planOpen: false, exportOpen: false, exportDone: false,
  }),

  importDemoAssets: () => {
    const st = get()
    if (!st.project) return
    const { items, materials } = buildDemoMaterials(st.project.sku)
    set({
      items: [...st.items, ...items], materials: [...st.materials, ...materials],
      events: pushEvent(st, 'assets.import', `已导入 ${materials.length} 张，重复 0 张，失败 0 张`),
      selection: { kind: 'project' },
    })
    get().toast('success', `已导入 ${materials.length} 张演示素材`, '系统已按哈希去重并给出品类建议', false)
  },

  importFiles: (files) => {
    const st = get()
    if (!st.project) return
    const newMats: MaterialAsset[] = files.map((f, i) => ({
      id: uid('mat'), name: f.name, hash: `sha256:${f.size}-${f.name}`, size: f.size,
      width: 2400, height: 3000, previewUrl: placeholderThumb(f.name, '导入素材', i + 1),
      categoryId: null, viewSlot: null, itemId: null,
      duplicated: st.materials.some(m => m.hash === `sha256:${f.size}-${f.name}`),
    }))
    const uniq = newMats.filter(m => !m.duplicated)
    set({
      materials: [...st.materials, ...newMats],
      events: pushEvent(st, 'assets.import', `已导入 ${uniq.length} 张，重复 ${newMats.length - uniq.length} 张`),
    })
    get().toast('info', `已导入 ${uniq.length} 张，重复 ${newMats.length - uniq.length} 张`, '重复文件已合并为一条记录并标记来源', false)
  },

  confirmMaterialCategory: (materialId, categoryId) => {
    const st = get()
    const mat = st.materials.find(m => m.id === materialId)
    if (!mat) return
    let items = st.items
    let itemId = mat.itemId
    if (!itemId) {
      itemId = uid('item')
      const cat = st.categories.find(c => c.id === categoryId)
      items = [...items, {
        id: itemId, name: mat.name.replace(/\.[^.]+$/, ''), categoryId,
        colorMaterial: '', sellingPoints: '', isSellable: cat?.isSellableByDefault ?? true,
      }]
    }
    set({
      items,
      materials: st.materials.map(m => m.id === materialId ? { ...m, categoryId, itemId } : m),
      events: pushEvent(st, 'category.confirm', `素材「${mat.name}」已确认为 ${st.categories.find(c => c.id === categoryId)?.name ?? categoryId}`),
    })
  },

  toggleModel: (id) => set(s => ({
    models: s.models.map(m => m.id === id ? { ...m, enabled: !m.enabled } : m),
  })),

  buildPlan: () => {
    const st = get()
    if (!st.project) return
    let code = 1
    const tasks: GenTask[] = []
    st.items.forEach(item => {
      const cat = st.categories.find(c => c.id === item.categoryId)
      if (!cat) return
      tasks.push(...buildTasksForItem(item, cat, st.models, code))
      code = tasks.length + 1
    })
    set({ tasks, planOpen: true, events: pushEvent(st, 'plan.build', `生成任务方案：共 ${tasks.length} 个草稿任务`) })
  },

  openPlan: (open) => set({ planOpen: open }),

  startQueue: () => {
    const st = get()
    let qi = st.tasks.filter(t => t.queueIndex != null).length + 1
    const tasks = st.tasks.map(t => {
      if (t.status === 'planned' || t.status === 'cached') {
        const nt = { ...t, queueIndex: qi++, status: 'queued' as TaskStatus }
        if (t.cacheHit) {
          // 缓存命中：不排队，直接进入待审核
          const v: TaskVersion = {
            id: uid('v'), version: 1, createdAt: new Date().toISOString(), tier: 'draft',
            status: 'review', reason: null, note: '缓存命中', provider: 'cache',
            cost: 0, durationMs: 0, thumbnail: placeholderThumb(t.id, `${t.name}`, 7), stage: null,
          }
          return { ...nt, status: 'review' as TaskStatus, versions: [v], currentVersionId: v.id }
        }
        const v = makeVersion(t, 'draft', t.provider)
        return { ...nt, versions: [v], currentVersionId: v.id }
      }
      return t
    })
    set({ tasks, planOpen: false, queueRunning: true, queuePaused: false, mode: 'generate', events: pushEvent(st, 'queue.start', '队列已启动，默认低清草稿') })
    setTimeout(() => processQueue(), 50)
  },

  pauseQueue: () => {
    const st = get()
    set({ queuePaused: true, events: pushEvent(st, 'queue.pause', '已暂停未开始任务，进行中的任务不受影响') })
    get().toast('warning', '已暂停未开始任务', '进行中的任务会继续完成，不会重复扣费', false)
  },

  resumeQueue: () => {
    const st = get()
    set({ queuePaused: false, events: pushEvent(st, 'queue.resume', '队列已继续') })
    processQueue()
  },

  removeTask: (id) => {
    const st = get()
    set({ tasks: st.tasks.filter(t => t.id !== id), events: pushEvent(st, 'task.remove', `任务已移除`, id) })
  },

  accept: (taskId) => {
    const st = get()
    const task = st.tasks.find(t => t.id === taskId)
    if (!task || task.status !== 'review') return
    const cur = task.versions.find(v => v.id === task.currentVersionId)
    set({
      tasks: st.tasks.map(t => t.id === taskId ? {
        ...t, status: 'accepted',
        versions: t.versions.map(v => v.id === cur?.id ? { ...v, status: 'accepted' as const } : v),
      } : t),
      events: pushEvent(st, 'review.accept', `${task.code} ${task.name} v${cur?.version} 已标记满意（默认锁定）`, taskId),
    })
    get().lock(taskId)
  },

  openReject: (taskIds) => set({ rejectTargetIds: taskIds }),

  reject: (taskIds, reason, note) => {
    const st = get()
    let name = ''
    set({
      tasks: st.tasks.map(t => {
        if (!taskIds.includes(t.id)) return t
        name = `${t.code} ${t.name}`
        const cur = t.versions.find(v => v.id === t.currentVersionId)
        return {
          ...t, status: 'rejected' as TaskStatus,
          versions: t.versions.map(v => v.id === cur?.id ? { ...v, status: 'rejected' as const, reason, note } : v),
        }
      }),
      rejectTargetIds: null,
      events: pushEvent(st, 'review.reject', `${name} 已拒绝（原因：${reason}）`, taskIds[0]),
    })
  },

  regenerate: (taskIds) => {
    const st = get()
    const provider = resolveProvider('mock')
    let qi = st.tasks.filter(t => t.queueIndex != null).length + 1
    const targets = st.tasks.filter(t => taskIds.includes(t.id) && (t.status === 'rejected' || t.status === 'failed' || t.status === 'review'))
    if (targets.length === 0) return
    set({
      tasks: st.tasks.map(t => {
        if (!targets.find(x => x.id === t.id)) return t
        const v = makeVersion(t, t.tier, t.provider)
        return { ...t, status: 'queued', queueIndex: qi++, versions: [...t.versions, v], currentVersionId: v.id, error: null, estimatedCost: provider.estimate(t.tier, 1) }
      }),
      queueRunning: true, queuePaused: false, mode: 'generate',
      events: pushEvent(st, 'task.regenerate', `将重生成 ${targets.length} 个任务（新版本，不覆盖旧图），预计新增成本 ${provider.estimate('draft', targets.length)}`),
    })
    get().toast('info', `将重生成 ${targets.length} 个任务`, `预计新增成本 ${provider.estimate('draft', targets.length)}；历史版本保留可恢复`, true)
    processQueue()
  },

  lock: (taskId) => {
    const st = get()
    const task = st.tasks.find(t => t.id === taskId)
    if (!task) return
    const cur = task.versions.find(v => v.id === task.currentVersionId)
    set({
      tasks: st.tasks.map(t => t.id === taskId ? {
        ...t, status: 'locked',
        versions: t.versions.map(v => v.id === cur?.id ? { ...v, status: 'locked' as const } : v),
      } : t),
      events: pushEvent(st, 'review.lock', `${task.name} v${cur?.version} 已锁定，批量重生成不会影响它`, taskId),
    })
  },

  unlock: (taskId) => {
    const st = get()
    const task = st.tasks.find(t => t.id === taskId)
    if (!task) return
    const cur = task.versions.find(v => v.id === task.currentVersionId)
    set({
      tasks: st.tasks.map(t => t.id === taskId ? {
        ...t, status: 'accepted',
        versions: t.versions.map(v => v.id === cur?.id ? { ...v, status: 'accepted' as const } : v),
      } : t),
      events: pushEvent(st, 'review.unlock', `${task.name} 已解锁`, taskId),
    })
  },

  generateHdForLocked: () => {
    const st = get()
    const provider = resolveProvider('mock')
    const locked = st.tasks.filter(t => t.status === 'locked' && t.tier === 'draft')
    if (locked.length === 0) return
    let qi = st.tasks.filter(t => t.queueIndex != null).length + 1
    set({
      tasks: st.tasks.map(t => {
        const hit = locked.find(x => x.id === t.id)
        if (!hit) return t
        const v = makeVersion(t, 'hd', t.provider)
        return { ...t, tier: 'hd' as TaskTier, status: 'queued', queueIndex: qi++, versions: [...t.versions, v], currentVersionId: v.id, estimatedCost: provider.estimate('hd', 1) }
      }),
      queueRunning: true, queuePaused: false, mode: 'generate',
      events: pushEvent(st, 'hd.start', `对 ${locked.length} 个锁定版本生成高清成品，预计新增成本 ${provider.estimate('hd', locked.length)}`),
    })
    get().toast('info', `开始高清生成：${locked.length} 个任务`, `预计新增成本 ${provider.estimate('hd', locked.length)}；导出仅使用锁定版本`, true)
    processQueue()
  },

  restoreVersion: (taskId, versionId) => {
    const st = get()
    const task = st.tasks.find(t => t.id === taskId)
    const ver = task?.versions.find(v => v.id === versionId)
    if (!task || !ver) return
    set({
      tasks: st.tasks.map(t => t.id === taskId ? { ...t, currentVersionId: versionId, status: 'review' } : t),
      events: pushEvent(st, 'version.restore', `${task.code} 恢复到 v${ver.version}（创建引用，不物理覆盖）`, taskId),
    })
  },

  openExport: () => {
    const st = get()
    const locked = st.tasks.filter(t => t.status === 'locked' || t.status === 'exported')
    const files: ExportFileNode[] = locked.map((t, i) => {
      const item = st.items.find(x => x.id === t.itemId)
      const cur = t.versions.find(v => v.id === t.currentVersionId)
      return {
        id: uid('exp'), folder: `${st.project?.sku ?? 'SKU'}_套图/${item?.name ?? '单品'}`,
        fileName: `${st.project?.sku}-${item?.name}-${t.name.replace(/^.*?\s/, '')}${cur ? `` : ''}.jpg`,
        taskId: t.id, version: cur?.version ?? 1, conflict: i % 9 === 8,
      }
    })
    set({ exportOpen: true, exportFiles: files, mode: 'export', events: pushEvent(st, 'export.preview', `导出预览：${files.length} 张锁定图片`) })
  },

  closeExport: () => set({ exportOpen: false }),

  doExport: () => {
    const st = get()
    const conflicts = st.exportFiles.filter(f => f.conflict).length
    set({
      tasks: st.tasks.map(t => t.status === 'locked' ? { ...t, status: 'exported' as TaskStatus } : t),
      exportDone: true,
      events: pushEvent(st, 'export.done', `导出完成：${st.exportFiles.length} 张成功，0 张失败；重名 ${conflicts} 个已追加序号`),
    })
    get().toast('success', `导出完成：${st.exportFiles.length} 张成功，0 张失败`, `检测到 ${conflicts} 个重名文件，已自动追加序号，不会覆盖`, false)
  },

  select: (s) => set({ selection: s }),
  setMode: (m) => set({ mode: m }),
  setStatusFilter: (s) => set({ statusFilter: s }),
  setNewProjectOpen: (v) => set({ newProjectOpen: v }),
  setPaletteOpen: (v) => set({ paletteOpen: v }),
  setLightbox: (v) => set({ lightbox: v }),
  setConfirmDialog: (v) => set({ confirmDialog: v }),

  toast: (kind, title, detail = '', hasDetail = false) => {
    const id = uid('toast')
    set(s => ({ toasts: [...s.toasts, { id, kind, title, detail, hasDetail }] }))
    setTimeout(() => get().dismissToast(id), 4200)
  },
  dismissToast: (id) => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })),
}))

/** 队列调度（并发 2）：仅作为 store 内部引擎，不直接暴露给组件 */
export function processQueue() {
  const st = useWorkbench.getState()
  if (st.queuePaused) return
  const queued = st.tasks
    .filter(t => t.status === 'queued' && !runningCancels.has(t.id))
    .sort((a, b) => (a.queueIndex ?? 0) - (b.queueIndex ?? 0))
  const slots = Math.max(0, 2 - runningCancels.size)
  queued.slice(0, slots).forEach(task => runTask(task.id))
}

function runTask(taskId: string) {
  const st = useWorkbench.getState()
  const task = st.tasks.find(t => t.id === taskId)
  if (!task) return
  const provider = resolveProvider(task.provider)
  const versionId = task.currentVersionId
  const patch = (fn: (t: GenTask) => GenTask) =>
    useWorkbench.setState(s => ({ tasks: s.tasks.map(t => t.id === taskId ? fn(t) : t) }))

  patch(t => ({ ...t, status: 'generating', startedAt: Date.now(), endedAt: null }))
  const handle = provider.generate(
    { taskId, tier: task.tier, prompt: task.prompt, negativePrompt: task.negativePrompt, seed: 42 },
    {
      onStage: (stage: GenerateStage, _msg: string) => {
        patch(t => ({ ...t, versions: t.versions.map(v => v.id === versionId ? { ...v, stage } : v) }))
      },
      onComplete: (res) => {
        runningCancels.delete(taskId)
        const thumb = placeholderThumb(res.thumbnailSeed, task.name, (task.code.charCodeAt(1) % 9) + 1)
        patch(t => ({
          ...t, status: 'review', endedAt: Date.now(),
          versions: t.versions.map(v => v.id === versionId
            ? { ...v, status: 'review' as const, stage: null, cost: res.cost, durationMs: res.durationMs, thumbnail: thumb }
            : v),
        }))
        useWorkbench.setState(s => ({ events: pushEvent(useWorkbench.getState(), 'task.done', `${task.code} ${task.name} v${task.versions.length} 已生成，等待审核`, taskId) }))
        scheduleNext()
      },
      onError: (err) => {
        runningCancels.delete(taskId)
        patch(t => ({
          ...t, status: 'failed', endedAt: Date.now(), error: err,
          versions: t.versions.map(v => v.id === versionId ? { ...v, status: 'failed' as const, stage: null } : v),
        }))
        useWorkbench.setState(s => ({ events: pushEvent(useWorkbench.getState(), 'task.fail', `${task.code} ${task.name} 失败：${err.message}`, taskId) }))
        scheduleNext()
      },
    },
  )
  runningCancels.set(taskId, handle)
}

function scheduleNext() {
  const st = useWorkbench.getState()
  const remaining = st.tasks.some(t => t.status === 'queued')
  if (!remaining && runningCancels.size === 0) {
    useWorkbench.setState(s => ({
      queueRunning: false,
      events: pushEvent(useWorkbench.getState(), 'queue.done', `批次完成：${useWorkbench.getState().tasks.filter(t => t.status === 'review').length} 张待审核，${useWorkbench.getState().tasks.filter(t => t.status === 'failed').length} 张失败`),
    }))
    useWorkbench.getState().toast('info', '批次已完成', '进入审核模式处理待审核任务', false)
  } else {
    setTimeout(processQueue, 60)
  }
}


