import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import clsx from 'clsx'
import {
  Check, CheckCheck, ChevronLeft, ChevronRight, ExternalLink, FolderDown, FolderOpen, History,
  Image as ImageIcon, Layers, Lock, Maximize2, Pause, Play, Plus, RefreshCw, Settings2, ShieldCheck,
  Sparkles, Trash2, Upload, Wand2, XCircle,
} from 'lucide-react'
import { useNodeStore } from '../../stores/node-store'
import { useWorkbench } from '../../stores/workbench-store'
import type { FlowInputNode, FlowOutputNode, ProcessType } from '../../types/node-system'
import { PROCESS_TITLES } from '../../data/process-templates'

const PROCESS_TYPES: ProcessType[] = ['flat', 'partial', 'detail', 'model']

const STATUS_META: Record<string, { label: string; color: string }> = {
  queued: { label: '排队中', color: '#A1A1AA' },
  generating: { label: '生成中', color: '#6366F1' },
  pending: { label: '待审核', color: '#F59E0B' },
  satisfied: { label: '已满意', color: '#22C55E' },
  unsatisfied: { label: '待修正', color: '#EF4444' },
  failed: { label: '失败', color: '#EF4444' },
  locked: { label: '已锁定', color: '#0EA5E9' },
  saved: { label: '已保存', color: '#22C55E' },
  exported: { label: '已导出', color: '#64748B' },
}

const REVIEW_FILTERS = [
  { id: 'all', label: '全部' },
  { id: 'pending', label: '待审' },
  { id: 'satisfied', label: '满意' },
  { id: 'unsatisfied', label: '待修正' },
  { id: 'locked', label: '锁定' },
  { id: 'failed', label: '失败' },
] as const

function Section({ title, action, children }: {
  title: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="border-b px-3 py-3" style={{ borderColor: 'var(--divider)' }}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-semibold tracking-wide" style={{ color: 'var(--text-2)' }}>{title}</h3>
        {action}
      </div>
      {children}
    </section>
  )
}

function CheckRow({ checked, label, hint }: { checked: boolean; label: string; hint?: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className={clsx('mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border')}
        style={{
          borderColor: checked ? 'var(--success)' : 'var(--border)',
          background: checked ? 'var(--success)' : 'transparent',
        }}>
        {checked && <Check size={10} className="text-white"/>}
      </span>
      <div className="min-w-0">
        <div className="text-[11px]" style={{ color: checked ? 'var(--text-2)' : 'var(--text-3)' }}>{label}</div>
        {hint && <div className="text-[10px]" style={{ color: 'var(--text-3)' }}>{hint}</div>}
      </div>
    </div>
  )
}

export function WorkflowConsole() {
  const mode = useWorkbench(state => state.mode)
  const experienceMode = useWorkbench(state => state.experienceMode)
  const setMode = useWorkbench(state => state.setMode)
  const setExperienceMode = useWorkbench(state => state.setExperienceMode)
  const nodes = useNodeStore(state => state.nodes)
  const busy = useNodeStore(state => state.workflowBusy)
  const generatePlan = useNodeStore(state => state.generatePlan)
  const startGeneration = useNodeStore(state => state.startGeneration)
  const exportLocked = useNodeStore(state => state.exportLocked)
  const confirmExportLocked = useNodeStore(state => state.confirmExportLocked)
  const exportPreview = useNodeStore(state => state.exportPreview)
  const exportSelection = useNodeStore(state => state.exportSelection)
  const setExportSelection = useNodeStore(state => state.setExportSelection)
  const exportResult = useNodeStore(state => state.exportResult)
  const closeExportResult = useNodeStore(state => state.closeExportResult)
  const generationTypes = useNodeStore(state => state.generationTypes)
  const setGenerationTypes = useNodeStore(state => state.setGenerationTypes)
  const inputGenerationTypes = useNodeStore(state => state.inputGenerationTypes)
  const setInputGenerationType = useNodeStore(state => state.setInputGenerationType)
  const copyGenerationTypesToAll = useNodeStore(state => state.copyGenerationTypesToAll)
  const setTypePickerOpen = useNodeStore(state => state.setTypePickerOpen)
  const setChangeTypeTargetNodeId = useNodeStore(state => state.setChangeTypeTargetNodeId)
  const setModelPickerOpen = useNodeStore(state => state.setModelPickerOpen)
  const uploadImage = useNodeStore(state => state.uploadImage)
  const removeNode = useNodeStore(state => state.removeNode)
  const setInputAttribute = useNodeStore(state => state.setInputAttribute)
  const setInputStructureFact = useNodeStore(state => state.setInputStructureFact)
  const saveInputFacts = useNodeStore(state => state.saveInputFacts)
  const openImageViewer = useNodeStore(state => state.openImageViewer)
  const selectedNodeId = useNodeStore(state => state.selectedNodeId)
  const setSelected = useNodeStore(state => state.setSelected)
  const markSatisfied = useNodeStore(state => state.markSatisfied)
  const openPromptRevision = useNodeStore(state => state.openPromptRevision)
  const lockOutput = useNodeStore(state => state.lockOutput)
  const startHdRepair = useNodeStore(state => state.startHdRepair)
  const regenerate = useNodeStore(state => state.regenerate)
  const markSatisfiedBatch = useNodeStore(state => state.markSatisfiedBatch)
  const lockOutputsBatch = useNodeStore(state => state.lockOutputsBatch)
  const restoreOutputVersion = useNodeStore(state => state.restoreOutputVersion)
  const openVersionQc = useNodeStore(state => state.openVersionQc)
  const backendProjectId = useNodeStore(state => state.backendProjectId)
  const requestFitView = useNodeStore(state => state.requestFitView)
  const queuePaused = useNodeStore(state => state.queuePaused)
  const pauseTaskQueue = useNodeStore(state => state.pauseTaskQueue)
  const resumeTaskQueue = useNodeStore(state => state.resumeTaskQueue)
  const retryFailedOutputs = useNodeStore(state => state.retryFailedOutputs)
  const cancelQueuedOrRunning = useNodeStore(state => state.cancelQueuedOrRunning)

  const [collapsed, setCollapsed] = useState(() => {
    const stored = globalThis.localStorage?.getItem('lys-console-collapsed')
    if (stored) return stored === '1'
    return globalThis.localStorage?.getItem('lys-experience-mode') === 'normal'
  })
  const [selectedInputId, setSelectedInputId] = useState<string | null>(null)
  const [reviewFilter, setReviewFilter] = useState<(typeof REVIEW_FILTERS)[number]['id']>('pending')
  const [checkedOutputIds, setCheckedOutputIds] = useState<string[]>([])
  const [historyOpenIds, setHistoryOpenIds] = useState<string[]>([])
  const [hintDismissed, setHintDismissed] = useState(false)
  const [reviewLimit, setReviewLimit] = useState(40)
  const [exportFileLimit, setExportFileLimit] = useState(40)
  const [width, setWidth] = useState(() => {
    const stored = Number(globalThis.localStorage?.getItem('lys-console-width'))
    return Number.isFinite(stored) && stored >= 220 && stored <= 440 ? stored : 280
  })
  const fileRef = useRef<HTMLInputElement>(null)
  const uploadTargetRef = useRef<string | null>(null)
  const reviewItemRefs = useRef<Record<string, HTMLDivElement | null>>({})

  const inputs = useMemo(() => nodes.filter(node => node.type === 'input').map(node => node as FlowInputNode), [nodes])
  const outputs = useMemo(() => nodes.filter(node => node.type === 'output').map(node => node as FlowOutputNode), [nodes])
  const selectedInput = inputs.find(node => node.id === selectedInputId) ?? inputs[0]
  const selectedOutput = outputs.find(node => node.id === selectedNodeId)
    ?? outputs.find(node => node.data.status === 'pending')
    ?? outputs[0]
  const startConsoleResize = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = width
    const maxWidth = Math.min(440, Math.max(220, Math.floor(window.innerWidth * 0.3)))
    const move = (pointerEvent: PointerEvent) => {
      setWidth(Math.min(maxWidth, Math.max(220, startWidth + pointerEvent.clientX - startX)))
    }
    const stop = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
      window.removeEventListener('pointercancel', stop)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
    window.addEventListener('pointercancel', stop)
  }, [width])

  const selectedItemId = selectedInput?.data.image?.remote?.itemId ?? ''
  const selectedScope = selectedItemId ? inputGenerationTypes[selectedItemId] ?? generationTypes : generationTypes

  useEffect(() => {
    if (!inputs.length) {
      setSelectedInputId(null)
      return
    }
    if (!inputs.some(node => node.id === selectedInputId)) setSelectedInputId(inputs[0].id)
  }, [inputs, selectedInputId])

  useEffect(() => {
    globalThis.localStorage?.setItem('lys-console-collapsed', collapsed ? '1' : '0')
  }, [collapsed])

  useEffect(() => {
    globalThis.localStorage?.setItem('lys-console-width', String(width))
  }, [width])

  useEffect(() => {
    if ((mode === 'prepare' || mode === 'generate') && selectedNodeId) {
      const clickedInput = inputs.find(node => node.id === selectedNodeId)
      if (clickedInput) setSelectedInputId(clickedInput.id)
    }
  }, [inputs, mode, selectedNodeId])

  useEffect(() => {
    if (mode !== 'review' || !selectedNodeId) return
    const clickedOutput = outputs.find(node => node.id === selectedNodeId)
    if (clickedOutput && reviewFilter !== 'all' && clickedOutput.data.status !== reviewFilter) {
      setReviewFilter('all')
      return
    }
    if (!clickedOutput || (reviewFilter !== 'all' && clickedOutput.data.status !== reviewFilter)) return
    requestAnimationFrame(() => reviewItemRefs.current[selectedNodeId]?.scrollIntoView({ block: 'nearest' }))
  }, [mode, outputs, reviewFilter, selectedNodeId])

  useEffect(() => {
    if (experienceMode === 'novice') setCollapsed(false)
  }, [experienceMode])

  useEffect(() => {
    setHintDismissed(false)
  }, [mode])

  const uploadedCount = inputs.filter(node => node.data.image).length
  const confirmedCount = inputs.filter(node => node.data.image?.remote).length
  const pendingOutputs = outputs.filter(node => node.data.status === 'pending').length
  const rejectedOutputs = outputs.filter(node => node.data.status === 'unsatisfied').length
  const lockedOutputs = outputs.filter(node => ['locked', 'exported'].includes(node.data.status)).length

  useEffect(() => {
    setExportFileLimit(40)
  }, [exportPreview])

  useEffect(() => {
    if (mode !== 'export' || busy || exportPreview || lockedOutputs === 0) return
    void exportLocked()
  }, [busy, exportLocked, exportPreview, lockedOutputs, mode])

  const selectedTasks = selectedItemId
    ? outputs.filter(node => node.data.itemId === selectedItemId)
    : []

  const pickUpload = (nodeId: string) => {
    uploadTargetRef.current = nodeId
    fileRef.current?.click()
  }

  const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    const nodeId = uploadTargetRef.current
    if (!file || !nodeId) return
    uploadImage(nodeId, {
      id: `img-${Date.now()}`,
      fileName: file.name,
      thumbnailUrl: URL.createObjectURL(file),
      width: 800,
      height: 1000,
      fileSize: file.size,
    }, file)
    event.target.value = ''
    uploadTargetRef.current = null
  }

  const visibleReviewOutputs = outputs.filter(node =>
    reviewFilter === 'all' || node.data.status === reviewFilter)

  useEffect(() => {
    const selectedIndex = visibleReviewOutputs.findIndex(node => node.id === selectedNodeId)
    if (selectedIndex >= reviewLimit) setReviewLimit(selectedIndex + 20)
  }, [reviewLimit, selectedNodeId, visibleReviewOutputs])

  useEffect(() => {
    setReviewLimit(40)
  }, [reviewFilter])
  const toggleChecked = (nodeId: string) => {
    setCheckedOutputIds(current =>
      current.includes(nodeId) ? current.filter(id => id !== nodeId) : [...current, nodeId])
  }
  const toggleHistory = (nodeId: string) => {
    setHistoryOpenIds(current =>
      current.includes(nodeId) ? current.filter(id => id !== nodeId) : [...current, nodeId])
  }
  const versionFileUrl = (node: FlowOutputNode, versionId: string) =>
    backendProjectId ? `/api/projects/${backendProjectId}/tasks/${node.data.taskId}/versions/${versionId}/file` : ''

  const pagedReviewOutputs = visibleReviewOutputs.slice(0, reviewLimit)
  const visibleExportFiles = exportPreview?.files.slice(0, exportFileLimit) ?? []
  const selectedExportCount = exportSelection.taskIds.length + exportSelection.assetIds.length
  const isExportFileSelected = (file: {
    taskId: string | null
    assetId?: string | null
  }) => Boolean(
    (file.taskId && exportSelection.taskIds.includes(file.taskId)) ||
    (file.assetId && exportSelection.assetIds.includes(file.assetId)),
  )
  const toggleExportFile = (file: {
    taskId: string | null
    assetId?: string | null
  }) => {
    if (file.taskId) {
      setExportSelection({
        taskIds: exportSelection.taskIds.includes(file.taskId)
          ? exportSelection.taskIds.filter(id => id !== file.taskId)
          : [...exportSelection.taskIds, file.taskId],
      })
      return
    }
    if (file.assetId) {
      setExportSelection({
        assetIds: exportSelection.assetIds.includes(file.assetId)
          ? exportSelection.assetIds.filter(id => id !== file.assetId)
          : [...exportSelection.assetIds, file.assetId],
      })
    }
  }
  const selectAllExportFiles = () => {
    if (!exportPreview) return
    setExportSelection({
      taskIds: exportPreview.files.map(file => file.taskId).filter((id): id is string => Boolean(id)),
      assetIds: exportPreview.files.map(file => file.assetId).filter((id): id is string => Boolean(id)),
    })
  }
  const clearExportFiles = () => setExportSelection({ taskIds: [], assetIds: [] })
  const changeNamingScheme = (scheme: 'detailed' | 'compact') => {
    setExportSelection({ namingScheme: scheme })
    void useNodeStore.getState().exportLocked()
  }
  const chooseExportDirectory = async () => {
    if (window.desktopAPI) {
      const directory = await window.desktopAPI.selectDirectory()
      if (directory) setExportSelection({ targetDir: directory })
      return
    }
    const directory = window.prompt('输入导出目录的完整路径')
    if (directory?.trim()) setExportSelection({ targetDir: directory.trim() })
  }

  const phaseMeta = {
    prepare: { title: '准备', description: '整理部位素材、属性和模特', icon: Layers },
    generate: { title: '生成', description: '按部位配置生图范围并提交队列', icon: Sparkles },
    review: { title: '审核', description: '看图判断结果，必要时修正提示词', icon: ShieldCheck },
    export: { title: '导出', description: '检查锁定图片并导出成品', icon: FolderDown },
  }[mode]
  const phaseNav = [
    { id: 'prepare', icon: Layers, label: '准备' },
    { id: 'generate', icon: Sparkles, label: '生成' },
    { id: 'review', icon: ShieldCheck, label: '审核' },
    { id: 'export', icon: FolderDown, label: '导出' },
  ] as const
  const phaseHint = {
    prepare: '空素材容器可直接点击上传；已有素材双击预览，Alt+点击替换。确认镜头方案后会自动进入生成。',
    generate: '先切换输入节点，再勾选该节点自己的生图范围。队列进度、日志和成本在底部监控台实时更新。',
    review: '每张图片的操作就在左侧卡片下方。点击画布图片会自动定位左侧对应卡片；修正时可选择原图重画、当前图微调或局部蒙版。',
    export: '导出清单可逐项勾选。命名格式和目录在左侧设置，缺失的必拍镜头会直接列出。',
  }[mode]

  if (collapsed) {
    return (
      <aside className="workflow-console workflow-console-collapsed flex w-12 shrink-0 flex-col items-center gap-2 border-r py-3"
        style={{ background: 'var(--bg-2)', borderColor: 'var(--divider)' }}>
        <button onClick={() => setCollapsed(false)} className="flex h-9 w-9 items-center justify-center rounded-lg transition hover:bg-[var(--surface-hover)]"
          style={{ color: 'var(--text-2)' }} title="展开当前步骤操作台">
          <ChevronRight size={16}/>
        </button>
        <div className="flex flex-col gap-1.5">
          {phaseNav.map(item => (
            <button
              key={item.id}
              onClick={() => setMode(item.id)}
              className={clsx('flex h-8 w-8 items-center justify-center rounded-lg transition', mode === item.id ? 'font-medium' : 'hover:bg-[var(--surface-hover)]')}
              style={{
                background: mode === item.id ? 'var(--primary-light)' : 'transparent',
                color: mode === item.id ? 'var(--primary)' : 'var(--text-3)',
              }}
              title={`${item.label}（Ctrl+${phaseNav.findIndex(candidate => candidate.id === item.id) + 1}）`}
            >
              <item.icon size={14}/>
            </button>
          ))}
        </div>
        <button onClick={() => setCollapsed(false)}
          className="mt-auto flex h-8 w-8 items-center justify-center rounded-lg transition hover:bg-[var(--surface-hover)]"
          style={{ color: 'var(--text-3)' }} title="展开当前步骤操作台">
          <ChevronRight size={15}/>
        </button>
      </aside>
    )
  }

  return (
    <aside
      className="workflow-console relative flex shrink-0 flex-col border-r bg-[var(--bg-2)]"
      style={{ width, borderColor: 'var(--divider)' }}>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile}/>

      <header className="flex items-start gap-2 border-b px-3 py-3" style={{ borderColor: 'var(--divider)' }}>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ background: 'var(--primary-light)', color: 'var(--primary)' }}>
          <phaseMeta.icon size={16}/>
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{phaseMeta.title}</h2>
            <span className="rounded-full px-1.5 py-0.5 text-[9px]" style={{ background: 'var(--primary-light)', color: 'var(--primary)' }}>
              {experienceMode === 'novice' ? '新手模式' : '正常模式'}
            </span>
          </div>
          <p className="mt-0.5 text-[10px] leading-4" style={{ color: 'var(--text-3)' }}>{phaseMeta.description}</p>
        </div>
        <button onClick={() => setCollapsed(true)} className="flex h-7 w-7 items-center justify-center rounded-md transition hover:bg-[var(--surface-hover)]"
          style={{ color: 'var(--text-3)' }} title="收起操作台，最大化画布">
          <ChevronLeft size={14}/>
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {experienceMode === 'novice' && !hintDismissed && (
          <Section
            title="当前提示"
            action={<button onClick={() => setHintDismissed(true)} className="text-[10px]" style={{ color: 'var(--text-3)' }}>收起</button>}
          >
            <p className="text-[10px] leading-4" style={{ color: 'var(--text-2)' }}>{phaseHint}</p>
          </Section>
        )}

        {experienceMode === 'normal' && (
          <Section title="效率快捷入口">
            <div className="grid grid-cols-2 gap-1.5">
              <button onClick={() => useWorkbench.getState().setPaletteOpen(true)} className="btn btn-secondary !min-h-[26px] !px-2 !text-[10px]">
                命令面板 Ctrl+K
              </button>
              <button onClick={requestFitView} className="btn btn-secondary !min-h-[26px] !px-2 !text-[10px]">
                适应视图
              </button>
              <button onClick={() => void useNodeStore.getState().saveProjectLayout()} className="btn btn-secondary !min-h-[26px] !px-2 !text-[10px]">
                保存布局 Ctrl+S
              </button>
              <button onClick={() => setCollapsed(true)} className="btn btn-secondary !min-h-[26px] !px-2 !text-[10px]">
                收起操作台
              </button>
            </div>
            <div className="mt-1.5 text-[9px] leading-3" style={{ color: 'var(--text-3)' }}>
              Ctrl+1~4 切换步骤；Ctrl+Enter 执行当前阶段主操作；左侧收起后仍可直接点步骤图标。
            </div>
          </Section>
        )}

        {mode === 'prepare' && selectedInput && (
          <>
            <Section title="当前部位">
              <select className="input !min-h-[34px] !py-2 !text-xs" value={selectedInput.id}
                onChange={event => { setSelectedInputId(event.target.value); setSelected(event.target.value) }}>
                {inputs.map(node => <option key={node.id} value={node.id}>{node.data.categoryName}</option>)}
              </select>
              <div className="mt-2 flex gap-1.5">
                <button onClick={() => setTypePickerOpen(true)} className="btn btn-secondary !min-h-[30px] flex-1 !px-2 !text-[11px]">
                  <Plus size={12}/>添加部位
                </button>
                <button onClick={() => setChangeTypeTargetNodeId(selectedInput.id)} className="btn btn-secondary !min-h-[30px] !px-2 !text-[11px]">
                  <Settings2 size={12}/>改类型
                </button>
              </div>
            </Section>

            <Section title="素材">
              <div className="flex gap-2">
                <div className="h-16 w-14 shrink-0 overflow-hidden rounded-lg border" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
                  {selectedInput.data.image
                    ? <img src={selectedInput.data.image.thumbnailUrl} alt={selectedInput.data.categoryName} className="h-full w-full object-contain"/>
                    : <div className="flex h-full items-center justify-center"><ImageIcon size={15} style={{ color: 'var(--text-3)' }}/></div>}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[11px] font-medium" style={{ color: 'var(--text)' }}>
                    {selectedInput.data.image?.fileName || '尚未上传素材'}
                  </div>
                  <div className="mt-0.5 text-[10px]" style={{ color: selectedInput.data.image?.remote ? 'var(--success)' : 'var(--text-3)' }}>
                    {selectedInput.data.image?.remote ? '已入库' : selectedInput.data.image ? '本地预览' : '等待导入'}
                  </div>
                  <div className="mt-1 flex gap-1">
                    <button onClick={() => pickUpload(selectedInput.id)} disabled={busy} className="btn btn-secondary !min-h-[26px] !px-2 !text-[10px]">
                      <Upload size={11}/>{selectedInput.data.image ? '替换' : '上传'}
                    </button>
                    {selectedInput.data.image && (
                      <button onClick={() => openImageViewer({
                        src: selectedInput.data.image!.thumbnailUrl,
                        title: selectedInput.data.image!.fileName || selectedInput.data.categoryName,
                        subtitle: `${selectedInput.data.categoryName} · 原始素材`,
                      })} className="btn btn-secondary !min-h-[26px] !px-2 !text-[10px]">
                        <Maximize2 size={11}/>
                      </button>
                    )}
                    <button disabled={busy} onClick={() => {
                      if (window.confirm(`确定删除“${selectedInput.data.categoryName}”及其关联生成任务吗？此操作不会删除已经导出到其他目录的图片。`)) {
                        void removeNode(selectedInput.id)
                      }
                    }} className="btn btn-secondary !min-h-[26px] !px-2 !text-[10px]" title="删除部位">
                      <Trash2 size={11}/>
                    </button>
                  </div>
                </div>
              </div>
            </Section>

            {selectedInput.data.attributeOptions.length > 0 && (
              <Section title="商品属性">
                <div className="space-y-1">
                  {selectedInput.data.attributeOptions.map(attribute => (
                    <label key={attribute.key} className={clsx(
                      'flex items-center gap-2 rounded-md px-1.5 py-1.5 text-[11px] transition',
                      'cursor-pointer hover:bg-[var(--surface-hover)]',
                    )} style={{ color: 'var(--text-2)' }}>
                      <input type="checkbox" className="h-3 w-3 accent-[var(--primary)]"
                        checked={Boolean(selectedInput.data.attributes[attribute.key])}
                        onChange={event => setInputAttribute(selectedInput.id, attribute.key, event.target.checked)}/>
                      <span>{attribute.label}</span>
                    </label>
                  ))}
                </div>
              </Section>
            )}

            {selectedInput.data.structureFieldOptions.length > 0 && (
              <Section title="结构锁定">
                <div className="mb-2 text-[10px] leading-4" style={{ color: 'var(--text-3)' }}>
                  只填写能从原图确认的事实。它们会进入默认提示词，并在质检报告中形成逐项人工核对清单。
                </div>
                <div className="space-y-2">
                  {selectedInput.data.structureFieldOptions.map(field => (
                    <label key={field.key} className="block">
                      <span className="mb-1 block text-[10px]" style={{ color: 'var(--text-2)' }}>{field.label}</span>
                      <input
                        className="input !min-h-[30px] !py-1.5 !text-[10px]"
                        value={selectedInput.data.structureFacts[field.key] ?? ''}
                        maxLength={field.maxLength}
                        placeholder={field.placeholder}
                        onChange={event => setInputStructureFact(selectedInput.id, field.key, event.target.value)}
                      />
                    </label>
                  ))}
                </div>
                <button
                  onClick={() => void saveInputFacts(selectedInput.id)}
                  disabled={busy}
                  className="btn btn-secondary mt-2 w-full !min-h-[30px] !text-[10px]"
                >
                  {selectedInput.data.image?.remote ? '保存商品属性与结构事实' : '上传素材时一并保存'}
                </button>
              </Section>
            )}

            <Section title="模特 / 风格">
              <button onClick={() => setModelPickerOpen(true)} className="btn btn-secondary w-full !min-h-[32px] !text-[11px]">
                <Sparkles size={12}/>选择或更换模特
              </button>
            </Section>

            {experienceMode === 'novice' && (
              <Section title="准备检查">
                <div className="space-y-2">
                  <CheckRow checked={inputs.length > 0} label="已添加穿搭部位"/>
                  <CheckRow checked={uploadedCount > 0} label="至少上传一张素材"/>
                  <CheckRow checked={confirmedCount > 0} label="素材已写入后端"/>
                  <CheckRow checked={nodes.some(node => node.type === 'model')} label="模特身份已选择"/>
                </div>
              </Section>
            )}
          </>
        )}

        {mode === 'generate' && selectedInput && (
          <>
            <Section title="当前输入节点">
              <select className="input !min-h-[34px] !py-2 !text-xs" value={selectedInput.id}
                onChange={event => { setSelectedInputId(event.target.value); setSelected(event.target.value) }}>
                {inputs.map(node => (
                  <option key={node.id} value={node.id}>
                    {node.data.categoryName}{node.data.image?.remote ? ' · 已入库' : node.data.image ? ' · 本地' : ' · 未上传'}
                  </option>
                ))}
              </select>
              {!selectedItemId && (
                <p className="mt-2 rounded-md border px-2 py-1.5 text-[10px]" style={{ borderColor: 'var(--warning)', color: 'var(--warning)' }}>
                  该部位还未入库，先回到准备阶段上传素材。
                </p>
              )}
            </Section>

            <Section title="该节点生图范围">
              <div className="space-y-1">
                {PROCESS_TYPES.map(type => {
                  const count = selectedTasks.filter(node => node.data.imageType === type).length
                  return (
                    <label key={type} className="flex cursor-pointer items-center justify-between rounded-md px-1.5 py-1.5 text-[11px] transition hover:bg-[var(--surface-hover)]"
                      style={{ color: 'var(--text-2)' }}>
                      <span className="flex items-center gap-2">
                        <input type="checkbox" className="h-3 w-3 accent-[var(--primary)]"
                          checked={selectedScope.includes(type)} disabled={!selectedItemId}
                          onChange={event => setInputGenerationType(selectedItemId, type, event.target.checked)}/>
                        {PROCESS_TITLES[type]}
                      </span>
                      <span className="font-mono text-[10px]" style={{ color: 'var(--text-3)' }}>{count} 张</span>
                    </label>
                  )
                })}
              </div>
              <button onClick={() => copyGenerationTypesToAll(generationTypes)} className="btn btn-secondary mt-2 w-full !min-h-[28px] !text-[10px]">
                将全局范围应用到全部节点
              </button>
            </Section>

            <Section title="全局基准范围">
              <div className="flex flex-wrap gap-1">
                {PROCESS_TYPES.map(type => (
                  <button key={type} onClick={() => {
                    const next = generationTypes.includes(type)
                      ? generationTypes.filter(item => item !== type)
                      : [...generationTypes, type]
                    setGenerationTypes(next.length ? next : generationTypes)
                  }}
                    className="rounded-full px-2 py-1 text-[10px] transition hover:opacity-80"
                    style={{
                      background: generationTypes.includes(type) ? 'var(--primary-light)' : 'transparent',
                      color: generationTypes.includes(type) ? 'var(--primary)' : 'var(--text-3)',
                    }}>
                    {PROCESS_TITLES[type]}
                  </button>
                ))}
              </div>
            </Section>

            <Section title="队列控制">
              <div className="grid grid-cols-3 gap-2 text-[11px]">
                <div className="rounded-lg border p-2" style={{ borderColor: 'var(--border)' }}>
                  <div className="text-[10px]" style={{ color: 'var(--text-3)' }}>待提交</div>
                  <div className="font-mono text-sm">{outputs.filter(node => ['queued', 'failed'].includes(node.data.status)).length}</div>
                </div>
                <div className="rounded-lg border p-2" style={{ borderColor: 'var(--border)' }}>
                  <div className="text-[10px]" style={{ color: 'var(--text-3)' }}>生成中</div>
                  <div className="font-mono text-sm">{outputs.filter(node => node.data.status === 'generating').length}</div>
                </div>
                <div className="rounded-lg border p-2" style={{ borderColor: 'var(--border)' }}>
                  <div className="text-[10px]" style={{ color: 'var(--text-3)' }}>失败</div>
                  <div className="font-mono text-sm">{outputs.filter(node => node.data.status === 'failed').length}</div>
                </div>
              </div>
              <div className="mt-2 flex gap-1.5">
                <button
                  onClick={() => void (queuePaused ? resumeTaskQueue() : pauseTaskQueue())}
                  className="btn btn-secondary flex-1 !min-h-[27px] !px-2 !text-[10px]"
                >
                  {queuePaused ? <Play size={11}/> : <Pause size={11}/>}
                  {queuePaused ? '恢复队列' : '暂停队列'}
                </button>
                <button
                  onClick={() => void retryFailedOutputs()}
                  disabled={busy || !outputs.some(node => node.data.status === 'failed')}
                  className="btn btn-secondary flex-1 !min-h-[27px] !px-2 !text-[10px]"
                >
                  <RefreshCw size={11}/>重试失败
                </button>
              </div>
              <button
                onClick={() => {
                  const activeIds = outputs
                    .filter(node => ['queued', 'generating'].includes(node.data.status))
                    .map(node => node.id)
                  if (!activeIds.length) return
                  if (window.confirm(`确定取消 ${activeIds.length} 个任务吗？`)) {
                    void cancelQueuedOrRunning(activeIds)
                  }
                }}
                disabled={!outputs.some(node => ['queued', 'generating'].includes(node.data.status))}
                className="btn btn-secondary mt-1.5 w-full !min-h-[26px] !px-2 !text-[10px]"
              >
                <XCircle size={11}/>取消排队 / 生成中任务
              </button>
              <div className="mt-1.5 text-[10px]" style={{ color: 'var(--text-3)' }}>
                节点范围会随项目布局保存；暂停只阻止领取新任务，已提交请求会尽力停止。
              </div>
            </Section>

            {experienceMode === 'novice' && (
              <Section title="生成步骤检查">
                <div className="space-y-2">
                  <CheckRow checked={outputs.length > 0} label="已生成任务方案"/>
                  <CheckRow checked={selectedScope.length > 0} label="当前节点已选择生图范围"/>
                  <CheckRow checked={!outputs.some(node => node.data.status === 'failed')} label="没有失败任务"/>
                  <CheckRow checked={!queuePaused} label="队列未暂停"/>
                </div>
              </Section>
            )}
          </>
        )}

        {mode === 'review' && (
          <>
            <Section title="审核过滤">
              <div className="flex flex-wrap gap-1">
                {REVIEW_FILTERS.map(filter => (
                  <button key={filter.id} onClick={() => setReviewFilter(filter.id)}
                    className={clsx('rounded-full px-2 py-1 text-[10px] transition', reviewFilter === filter.id ? 'font-medium' : 'hover:bg-[var(--surface-hover)]')}
                    style={{
                      background: reviewFilter === filter.id ? 'var(--primary-light)' : 'transparent',
                      color: reviewFilter === filter.id ? 'var(--primary)' : 'var(--text-3)',
                    }}>
                    {filter.label}
                  </button>
                ))}
              </div>
            </Section>

            <Section
              title="批量操作"
              action={(
                <button
                  onClick={() => setCheckedOutputIds(
                    visibleReviewOutputs
                      .filter(node => ['pending', 'satisfied'].includes(node.data.status))
                      .map(node => node.id),
                  )}
                  className="text-[10px]"
                  style={{ color: 'var(--primary)' }}
                >
                  选择可处理
                </button>
              )}
            >
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => void markSatisfiedBatch(checkedOutputIds)}
                  disabled={busy || !checkedOutputIds.some(id => outputs.find(node => node.id === id)?.data.status === 'pending')}
                  className="btn btn-secondary flex-1 !min-h-[27px] !px-2 !text-[10px]"
                >
                  <CheckCheck size={11}/>批量满意
                </button>
                <button
                  onClick={() => void lockOutputsBatch(checkedOutputIds)}
                  disabled={busy || !checkedOutputIds.some(id => {
                    const output = outputs.find(node => node.id === id)
                    return output?.data.status === 'satisfied' && output.data.qcPassed === true
                  })}
                  className="btn btn-secondary flex-1 !min-h-[27px] !px-2 !text-[10px]"
                >
                  <Lock size={11}/>批量锁定
                </button>
                <button onClick={() => setCheckedOutputIds([])} className="btn btn-ghost !px-1 !text-[10px]">
                  清空
                </button>
              </div>
              <div className="mt-1 text-[10px]" style={{ color: 'var(--text-3)' }}>
                已选 {checkedOutputIds.length} 张；批量满意只处理待审核图，批量锁定只处理已满意且质检通过的图片。
              </div>
            </Section>

            <Section title="图片与审核操作">
              <div className="space-y-2">
                {PROCESS_TYPES.map(type => {
                  const rows = pagedReviewOutputs.filter(node => node.data.imageType === type)
                  if (!rows.length) return null
                  return (
                    <div key={type}>
                      <div className="mb-1 text-[10px] font-semibold" style={{ color: 'var(--text-3)' }}>
                        {PROCESS_TITLES[type]} · {rows.length}
                      </div>
                      <div className="space-y-1.5">
                        {rows.map(node => {
                          const status = STATUS_META[node.data.status] ?? STATUS_META.queued
                          const active = node.id === selectedOutput?.id
                          return (
                            <div
                              key={node.id}
                              ref={element => { reviewItemRefs.current[node.id] = element }}
                              className={clsx('rounded-xl border transition', active ? 'border-primary' : 'border-transparent')}
                              style={{ background: active ? 'var(--primary-light)' : 'transparent' }}
                            >
                              <div className="flex items-center gap-1 pr-1.5">
                                <input
                                  type="checkbox"
                                  className="ml-2 h-3 w-3 shrink-0 accent-[var(--primary)]"
                                  checked={checkedOutputIds.includes(node.id)}
                                  onChange={() => toggleChecked(node.id)}
                                  aria-label={`选择${node.data.taskCode}`}
                                />
                                <button
                                  onClick={() => setSelected(node.id)}
                                  className="flex min-w-0 flex-1 items-center gap-2 rounded-xl px-2 py-1.5 text-left transition hover:bg-[var(--surface-hover)]"
                                >
                                  <span className="h-9 w-8 shrink-0 overflow-hidden rounded-md border"
                                    style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
                                    {node.data.thumbnail
                                      ? <img src={node.data.thumbnail} alt={node.data.taskName} className="h-full w-full object-contain"/>
                                      : <ImageIcon size={12} className="mx-auto mt-2.5" style={{ color: 'var(--text-3)' }}/>}
                                  </span>
                                  <span className="min-w-0 flex-1">
                                    <span className="block truncate text-[11px] font-medium" style={{ color: 'var(--text)' }}>
                                      {node.data.shotName || node.data.taskName}
                                    </span>
                                    <span className="block truncate font-mono text-[9px]" style={{ color: 'var(--text-3)' }}>
                                      {node.data.taskCode} · v{node.data.version}
                                    </span>
                                  </span>
                                  <span className="flex shrink-0 items-center gap-1 text-[9px]" style={{ color: status.color }}>
                                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: status.color }}/>{status.label}
                                  </span>
                                </button>
                                <button
                                  onClick={() => toggleHistory(node.id)}
                                  className={clsx('flex h-7 shrink-0 items-center gap-1 rounded-md px-1.5 text-[9px] transition', historyOpenIds.includes(node.id) ? 'font-medium' : '')}
                                  style={{
                                    color: historyOpenIds.includes(node.id) ? 'var(--primary)' : 'var(--text-3)',
                                    background: historyOpenIds.includes(node.id) ? 'var(--primary-light)' : 'transparent',
                                  }}
                                  title="展开版本与提示词历史"
                                >
                                  <History size={11}/>{node.data.versions.length || 1}
                                </button>
                              </div>

                              <div className="grid grid-cols-2 gap-1 px-1.5 pb-1.5">
                                {node.data.status === 'pending' && (
                                  <>
                                    <button onClick={() => void markSatisfied(node.id)} disabled={busy}
                                      className="btn btn-secondary !min-h-[26px] !px-2 !text-[10px]">
                                      <Check size={11}/>满意
                                    </button>
                                    <button onClick={() => openPromptRevision(node.id)} disabled={busy}
                                      className="btn btn-secondary !min-h-[26px] !px-2 !text-[10px]">
                                      <Wand2 size={11}/>修正
                                    </button>
                                  </>
                                )}
                                {node.data.status === 'satisfied' && (
                                  <>
                                    <button
                                      onClick={() => void lockOutput(node.id)}
                                      disabled={busy || node.data.qcPassed !== true}
                                      className="btn btn-secondary !min-h-[26px] !px-2 !text-[10px]">
                                      <Lock size={11}/>{node.data.qcPassed === true ? '锁定' : '质检未通过'}
                                    </button>
                                    {node.data.tier === 'draft' && (
                                      <button onClick={() => void startHdRepair(node.id)} disabled={busy}
                                        className="btn btn-secondary !min-h-[26px] !px-2 !text-[10px]">
                                        <Sparkles size={11}/>高清
                                      </button>
                                    )}
                                  </>
                                )}
                                {node.data.status === 'unsatisfied' && (
                                  <button onClick={() => openPromptRevision(node.id)} disabled={busy}
                                    className="btn btn-secondary col-span-2 !min-h-[26px] !px-2 !text-[10px]">
                                    <Wand2 size={11}/>继续修正提示词
                                  </button>
                                )}
                                {node.data.status === 'failed' && (
                                  <button onClick={() => void regenerate(node.id)} disabled={busy}
                                    className="btn btn-secondary col-span-2 !min-h-[26px] !px-2 !text-[10px]">
                                    <RefreshCw size={11}/>重试失败任务
                                  </button>
                                )}
                                {['locked', 'exported'].includes(node.data.status) && (
                                  <div className="col-span-2 rounded-md px-2 py-1 text-center text-[10px]" style={{ color: 'var(--text-3)' }}>
                                    已完成，可在导出阶段查看
                                  </div>
                                )}
                                {['queued', 'generating'].includes(node.data.status) && (
                                  <div className="col-span-2 rounded-md px-2 py-1 text-center text-[10px]" style={{ color: 'var(--text-3)' }}>
                                    等待生成完成
                                  </div>
                                )}
                                {node.data.versionId && (
                                  <button
                                    onClick={() => void openVersionQc(node.id)}
                                    disabled={busy}
                                    className="btn btn-secondary col-span-2 !min-h-[24px] !px-2 !text-[9px]"
                                  >
                                    <ShieldCheck size={10}/>查看当前版本质检
                                  </button>
                                )}
                              </div>

                              {historyOpenIds.includes(node.id) && (
                                <div className="mx-1.5 mb-1.5 rounded-lg border p-2" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
                                  <div className="mb-1 text-[10px] font-semibold" style={{ color: 'var(--text-2)' }}>版本与提示词历史</div>
                                  <div className="space-y-2">
                                    {[...node.data.versions].sort((a, b) => b.version - a.version).map(version => {
                                      const current = version.id === node.data.versionId
                                      const currentFile = node.data.versions.find(item => item.id === node.data.versionId)?.filePath
                                      const currentUrl = currentFile && backendProjectId
                                        ? `/api/projects/${backendProjectId}/tasks/${node.data.taskId}/versions/${node.data.versionId}/file`
                                        : node.data.thumbnail
                                      const historyUrl = version.filePath && backendProjectId ? versionFileUrl(node, version.id) : ''
                                      return (
                                        <div key={version.id} className="rounded-md border p-1.5" style={{ borderColor: current ? 'var(--primary)' : 'var(--border)' }}>
                                          <div className="flex items-center gap-1.5">
                                            <span className="font-mono text-[10px] font-semibold" style={{ color: current ? 'var(--primary)' : 'var(--text-2)' }}>v{version.version}</span>
                                            <span className="text-[9px]" style={{ color: 'var(--text-3)' }}>
                                              {version.tier === 'hd' ? '高清' : '草稿'} · ¥{(version.cost ?? 0).toFixed(2)}
                                            </span>
                                            {current && <span className="rounded bg-primary/12 px-1 text-[9px] text-primary">当前</span>}
                                            <span className="rounded px-1 text-[9px]"
                                              style={{
                                                background: version.referenceMode === 'generated' ? 'rgba(14,165,233,.12)' : 'var(--bg-2)',
                                                color: version.referenceMode === 'generated' ? '#0284C7' : 'var(--text-3)',
                                              }}>
                                              {version.referenceMode === 'generated' ? '当前图微调' : '原图重画'}
                                            </span>
                                            {version.maskPath && (
                                              <span className="rounded bg-primary/12 px-1 text-[9px] text-primary">蒙版</span>
                                            )}
                                            {version.referenceMode === 'generated' && version.baseVersionId && (
                                              <span className="font-mono text-[9px]" style={{ color: 'var(--text-3)' }}>
                                                基于 v{node.data.versions.find(item => item.id === version.baseVersionId)?.version ?? '?'}
                                              </span>
                                            )}
                                            <span className="min-w-0 flex-1 truncate text-right text-[9px]" style={{ color: 'var(--text-3)' }}>
                                              {version.qcScore != null ? `QC ${Math.round(version.qcScore * 100)}` : '无 QC'}
                                            </span>
                                          </div>
                                          {(version.reason || version.note) && (
                                            <div className="mt-1 truncate text-[9px]" style={{ color: 'var(--text-3)' }}>
                                              {[version.reason, version.note].filter(Boolean).join(' · ')}
                                            </div>
                                          )}
                                          <details className="mt-1">
                                            <summary className="cursor-pointer text-[9px]" style={{ color: 'var(--primary)' }}>查看提示词</summary>
                                            <div className="mt-1 max-h-20 overflow-y-auto rounded border p-1 font-mono text-[9px] leading-3"
                                              style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}>
                                              {version.prompt || '该历史版本未记录提示词'}
                                            </div>
                                          </details>
                                          <div className="mt-1 flex flex-wrap gap-1">
                                            {historyUrl && (
                                              <button
                                                onClick={() => openImageViewer({
                                                  src: historyUrl,
                                                  title: node.data.shotName || node.data.taskName,
                                                  subtitle: `${node.data.taskCode} · v${version.version}`,
                                                })}
                                                className="btn btn-secondary !min-h-[22px] !px-1.5 !text-[9px]"
                                              >查看</button>
                                            )}
                                            {historyUrl && currentUrl && !current && (
                                              <button
                                                onClick={() => openImageViewer({
                                                  src: currentUrl,
                                                  title: node.data.shotName || node.data.taskName,
                                                  subtitle: `当前 v${node.data.version}`,
                                                  compareSrc: historyUrl,
                                                  compareTitle: node.data.shotName || node.data.taskName,
                                                  compareSubtitle: `历史 v${version.version}`,
                                                })}
                                                className="btn btn-secondary !min-h-[22px] !px-1.5 !text-[9px]"
                                              >对比当前</button>
                                            )}
                                            <button
                                              onClick={() => void openVersionQc(node.id, version.id)}
                                              className="btn btn-secondary !min-h-[22px] !px-1.5 !text-[9px]"
                                            >QC</button>
                                            {!current && (
                                              <button
                                                onClick={() => void restoreOutputVersion(node.id, version.id)}
                                                disabled={busy}
                                                className="btn btn-secondary !min-h-[22px] !px-1.5 !text-[9px]"
                                              >恢复</button>
                                            )}
                                          </div>
                                        </div>
                                      )
                                    })}
                                    {!node.data.versions.length && (
                                      <div className="rounded-md border border-dashed px-2 py-3 text-center text-[10px]" style={{ borderColor: 'var(--border)', color: 'var(--text-3)' }}>
                                        暂无历史版本
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
                {visibleReviewOutputs.length > reviewLimit && (
                  <button
                    onClick={() => setReviewLimit(value => value + 40)}
                    className="btn btn-secondary w-full !min-h-[27px] !text-[10px]"
                  >
                    显示更多审核图片 · 剩余 {visibleReviewOutputs.length - reviewLimit} 张
                  </button>
                )}
                {!visibleReviewOutputs.length && (
                  <div className="rounded-lg border border-dashed px-3 py-4 text-center text-[11px]" style={{ borderColor: 'var(--border)', color: 'var(--text-3)' }}>
                    当前过滤条件下没有图片
                  </div>
                )}
              </div>
            </Section>

            {experienceMode === 'novice' && (
              <Section title="审核步骤检查">
                <div className="space-y-2">
                  <CheckRow checked={outputs.length > 0} label="已有可审核图片"/>
                  <CheckRow checked={pendingOutputs === 0} label="没有待审核图片"/>
                  <CheckRow checked={rejectedOutputs === 0} label="没有待修正图片"/>
                  <CheckRow checked={!outputs.some(node => ['failed', 'satisfied'].includes(node.data.status))} label="失败 / 已满意图片都已处理"/>
                  <CheckRow checked={lockedOutputs > 0} label="至少锁定一张图片"/>
                </div>
              </Section>
            )}
          </>
        )}

        {mode === 'export' && (
          <>
            <Section
              title="导出设置"
              action={exportPreview ? (
                <button onClick={() => void exportLocked()} disabled={busy} className="text-[10px]" style={{ color: 'var(--primary)' }}>
                  刷新清单
                </button>
              ) : undefined}
            >
              <label className="block text-[10px]" style={{ color: 'var(--text-3)' }}>
                命名格式
                <select
                  className="input mt-1 !min-h-[30px] !py-1.5 !text-[11px]"
                  value={exportSelection.namingScheme}
                  disabled={busy}
                  onChange={event => changeNamingScheme(event.target.value as 'detailed' | 'compact')}
                >
                  <option value="detailed">详细：SKU-商品-任务-版本</option>
                  <option value="compact">简洁：商品-任务-版本</option>
                </select>
              </label>
              <label className="mt-2 block text-[10px]" style={{ color: 'var(--text-3)' }}>
                导出目录
                <input
                  className="input mt-1 !min-h-[30px] !py-1.5 font-mono !text-[10px]"
                  value={exportSelection.targetDir}
                  placeholder={exportPreview?.exportDir || '默认 LongY 导出目录'}
                  onChange={event => setExportSelection({ targetDir: event.target.value })}
                />
              </label>
              <div className="mt-1.5 flex gap-1.5">
                <button onClick={() => void chooseExportDirectory()} disabled={busy} className="btn btn-secondary flex-1 !min-h-[27px] !px-2 !text-[10px]">
                  <FolderOpen size={11}/>选择目录
                </button>
                {exportResult && (
                  <button
                    onClick={() => void window.desktopAPI?.openPath(exportResult.targetDir)}
                    className="btn btn-secondary flex-1 !min-h-[27px] !px-2 !text-[10px]"
                  >
                    <ExternalLink size={11}/>打开目录
                  </button>
                )}
              </div>
              <div className="mt-1.5 text-[9px] leading-3" style={{ color: 'var(--text-3)' }}>
                重名文件会自动追加序号，不会覆盖已有文件。
              </div>
            </Section>

            <Section
              title={`导出清单 · 已选 ${selectedExportCount}/${exportPreview?.files.length ?? 0}`}
              action={exportPreview ? (
                <div className="flex gap-1.5">
                  <button onClick={selectAllExportFiles} className="text-[10px]" style={{ color: 'var(--primary)' }}>全选</button>
                  <button onClick={clearExportFiles} className="text-[10px]" style={{ color: 'var(--text-3)' }}>清空</button>
                </div>
              ) : undefined}
            >
              {!exportPreview && (
                <div className="rounded-lg border border-dashed px-3 py-4 text-center text-[11px]" style={{ borderColor: 'var(--border)', color: 'var(--text-3)' }}>
                  {busy ? '正在生成导出清单...' : lockedOutputs > 0 ? '点击下方按钮生成导出清单' : '先在审核阶段锁定满意图片'}
                </div>
              )}
              {exportPreview && (
                <div className="space-y-2">
                  {Object.entries(visibleExportFiles.reduce<Record<string, typeof visibleExportFiles>>((groups, file) => {
                    groups[file.folder] = [...(groups[file.folder] ?? []), file]
                    return groups
                  }, {})).map(([folder, files]) => (
                    <div key={folder}>
                      <div className="mb-1 truncate text-[10px] font-semibold" style={{ color: 'var(--text-3)' }}>
                        {folder} · {files.length}
                      </div>
                      <div className="space-y-1">
                        {files.map(file => {
                          const selected = isExportFileSelected(file)
                          return (
                            <label key={`${file.taskId ?? 'task'}-${file.assetId ?? 'asset'}-${file.fileName}`} className="flex cursor-pointer items-start gap-2 rounded-md px-1 py-1 transition hover:bg-[var(--surface-hover)]">
                              <input
                                type="checkbox"
                                className="mt-0.5 h-3 w-3 accent-[var(--primary)]"
                                checked={selected}
                                onChange={() => toggleExportFile(file)}
                              />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate font-mono text-[10px]" style={{ color: selected ? 'var(--text)' : 'var(--text-3)' }}>
                                  {file.fileName}
                                </span>
                                {file.conflict && (
                                  <span className="text-[9px]" style={{ color: 'var(--warning)' }}>预览重名，导出时自动追加序号</span>
                                )}
                              </span>
                            </label>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                  {exportPreview.files.length > exportFileLimit && (
                    <button
                      onClick={() => setExportFileLimit(value => value + 40)}
                      className="btn btn-secondary w-full !min-h-[27px] !text-[10px]"
                    >
                      显示更多导出文件 · 剩余 {exportPreview.files.length - exportFileLimit} 个
                    </button>
                  )}
                </div>
              )}
            </Section>

            <Section title="必拍镜头覆盖">
              {exportPreview ? (
                exportPreview.coverageComplete ? (
                  <CheckRow checked label={`覆盖完整：${exportPreview.coverage.length}/${exportPreview.coverage.length}`}/>
                ) : (
                  <div className="rounded-md border p-2" style={{ borderColor: 'var(--error)', background: 'rgba(239,68,68,.06)' }}>
                    <div className="text-[10px] font-medium" style={{ color: 'var(--error)' }}>
                      缺少 {exportPreview.missingShotNames.length} 个必拍镜头
                    </div>
                    <div className="mt-1 max-h-24 overflow-y-auto text-[10px] leading-4" style={{ color: 'var(--text-2)' }}>
                      {exportPreview.missingShotNames.join('、')}
                    </div>
                    <button onClick={() => setMode('review')} className="btn btn-secondary mt-1.5 w-full !min-h-[25px] !text-[10px]">
                      返回审核处理
                    </button>
                  </div>
                )
              ) : (
                <CheckRow checked={false} label="等待导出清单生成"/>
              )}
            </Section>

            {experienceMode === 'novice' && (
              <Section title="导出步骤检查">
                <div className="space-y-2">
                  <CheckRow checked={lockedOutputs > 0} label="已有锁定图片"/>
                  <CheckRow checked={Boolean(exportPreview?.coverageComplete)} label="必拍镜头覆盖完整"/>
                  <CheckRow checked={selectedExportCount > 0} label="已选择要导出的文件"/>
                  <CheckRow checked={Boolean(exportResult && exportResult.failed.length === 0)} label="导出完成且没有失败"/>
                </div>
              </Section>
            )}

            {exportResult && (
              <Section
                title="导出结果"
                action={<button onClick={closeExportResult} className="text-[10px]" style={{ color: 'var(--text-3)' }}>清除</button>}
              >
                <div className="flex items-center gap-2 text-[10px]">
                  <span style={{ color: 'var(--success)' }}>成功 {exportResult.exported}</span>
                  <span style={{ color: exportResult.failed.length ? 'var(--error)' : 'var(--text-3)' }}>
                    失败 {exportResult.failed.length}
                  </span>
                </div>
                <div className="mt-1 max-h-28 space-y-1 overflow-y-auto">
                  {exportResult.files.map(file => (
                    <div key={file.taskId || file.assetId || file.written} className="truncate font-mono text-[9px]" style={{ color: 'var(--text-3)' }}>
                      {file.written}
                    </div>
                  ))}
                  {exportResult.failed.map(file => (
                    <div key={`${file.taskId || file.assetId}-failed`} className="truncate text-[9px]" style={{ color: 'var(--error)' }}>
                      {file.reason}
                    </div>
                  ))}
                </div>
              </Section>
            )}
          </>
        )}

      </div>

      <div
        className="console-resizer"
        onPointerDown={startConsoleResize}
        role="separator"
        aria-orientation="vertical"
        aria-label="调整左侧操作台宽度"
        title="拖动调整左侧操作台宽度"
      />

      <footer className="shrink-0 border-t px-3 py-3" style={{ borderColor: 'var(--divider)', background: 'var(--bg-2)' }}>
        {mode === 'prepare' && (
          <button onClick={() => void generatePlan()} disabled={busy} className="btn btn-primary w-full">
            <Layers size={14}/>生成方案
          </button>
        )}
        {mode === 'generate' && (
          <div className="space-y-1.5">
            <button onClick={() => void startGeneration()} disabled={busy} className="btn btn-primary w-full">
              <Play size={14}/>{busy ? '处理中...' : '开始生成'}
            </button>
            <button onClick={requestFitView} className="btn btn-ghost w-full !text-[10px]">适应视图</button>
          </div>
        )}
        {mode === 'review' && selectedOutput && (
          <button onClick={() => openPromptRevision(selectedOutput.id)} disabled={busy} className="btn btn-primary w-full">
            <Wand2 size={14}/>打开提示词修正
          </button>
        )}
        {mode === 'export' && exportPreview?.coverageComplete && (
          <button onClick={() => void confirmExportLocked()} disabled={busy || selectedExportCount === 0} className="btn btn-primary w-full">
            <FolderDown size={14}/>导出选中 {selectedExportCount} 项
          </button>
        )}
        {mode === 'export' && (!exportPreview || !exportPreview.coverageComplete) && (
          <button onClick={() => void exportLocked()} disabled={busy || lockedOutputs === 0} className="btn btn-primary w-full">
            <RefreshCw size={14}/>{busy ? '生成清单中...' : '生成导出清单'}
          </button>
        )}
        <button onClick={() => setExperienceMode(experienceMode === 'novice' ? 'normal' : 'novice')}
          className="mt-2 w-full text-center text-[10px] transition hover:text-[var(--text)]" style={{ color: 'var(--text-3)' }}>
          切换到{experienceMode === 'novice' ? '正常' : '新手'}模式
        </button>
      </footer>
    </aside>
  )
}
