import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Activity, ChevronDown, ChevronUp, Coins, ListTodo, Pause, Play, RefreshCw, ScrollText, XCircle } from 'lucide-react'
import clsx from 'clsx'
import { useNodeStore } from '../../stores/node-store'
import type { FlowOutputNode, ProcessType } from '../../types/node-system'
import { PROCESS_TITLES } from '../../data/process-templates'

const STATUS_TEXT: Record<string, { label: string; color: string }> = {
  queued: { label: '排队', color: '#A1A1AA' },
  generating: { label: '生成中', color: '#6366F1' },
  pending: { label: '待审核', color: '#F59E0B' },
  satisfied: { label: '满意', color: '#22C55E' },
  unsatisfied: { label: '待修正', color: '#EF4444' },
  failed: { label: '失败', color: '#EF4444' },
  locked: { label: '锁定', color: '#0EA5E9' },
  saved: { label: '保存', color: '#22C55E' },
  exported: { label: '导出', color: '#64748B' },
}

const STAGE_PROGRESS: Record<string, number> = {
  upload: 10,
  submit: 25,
  server: 48,
  generate: 52,
  retry: 40,
  'hd-repair': 68,
  download: 84,
  write: 93,
}

const STAGE_LABEL: Record<string, string> = {
  upload: '上传参考',
  submit: '提交请求',
  server: '云端生成',
  generate: '云端生成',
  retry: '自动重试',
  'hd-repair': '高清修复',
  download: '下载结果',
  write: '写入本地',
}

const PROCESS_TYPES: ProcessType[] = ['flat', 'partial', 'detail', 'model']
type TabId = 'tasks' | 'logs' | 'cost'

export function WorkflowStatusDock() {
  const nodes = useNodeStore(state => state.nodes)
  const message = useNodeStore(state => state.workflowMessage)
  const busy = useNodeStore(state => state.workflowBusy)
  const queuePaused = useNodeStore(state => state.queuePaused)
  const providerId = useNodeStore(state => state.providerId)
  const providers = useNodeStore(state => state.providers)
  const taskStages = useNodeStore(state => state.taskStages)
  const workflowEvents = useNodeStore(state => state.workflowEvents)
  const regenerate = useNodeStore(state => state.regenerate)
  const retryFailedOutputs = useNodeStore(state => state.retryFailedOutputs)
  const pauseTaskQueue = useNodeStore(state => state.pauseTaskQueue)
  const resumeTaskQueue = useNodeStore(state => state.resumeTaskQueue)
  const recoverProviderQueue = useNodeStore(state => state.recoverProviderQueue)
  const cancelQueuedOrRunning = useNodeStore(state => state.cancelQueuedOrRunning)
  const openPromptRevision = useNodeStore(state => state.openPromptRevision)
  const setSelected = useNodeStore(state => state.setSelected)
  const setProviderSettingsOpen = useNodeStore(state => state.setProviderSettingsOpen)
  const [expanded, setExpanded] = useState(false)
  const [height, setHeight] = useState(() => {
    const stored = Number(globalThis.localStorage?.getItem('lys-status-dock-height'))
    return Number.isFinite(stored) && stored >= 140 && stored <= 520 ? stored : 220
  })
  const [tab, setTab] = useState<TabId>('tasks')
  const dragPointRef = useRef<{ y: number; height: number } | null>(null)

  const outputs = useMemo(
    () => nodes.filter(node => node.type === 'output').map(node => node as FlowOutputNode),
    [nodes],
  )
  const active = outputs.filter(node => ['queued', 'generating'].includes(node.data.status))
  const generating = outputs.filter(node => node.data.status === 'generating')
  const failed = outputs.filter(node => node.data.status === 'failed')
  const providerBlocked = failed.some(node => [
    'QUOTA_EXCEEDED', 'AUTHENTICATION_FAILED', 'API_KEY_MISSING',
  ].includes(node.data.errorCode ?? ''))
  const providerName = providers.find(provider => provider.id === providerId)?.name ?? providerId
  const done = outputs.filter(node => !['queued', 'generating'].includes(node.data.status))
  const cost = outputs.reduce((sum, node) => sum + node.data.cost, 0)

  const taskProgress = (node: FlowOutputNode) => {
    if (node.data.status === 'queued') return 0
    if (node.data.status !== 'generating') return 100
    const stage = taskStages[node.data.taskId]
    return stage ? STAGE_PROGRESS[stage.stage] ?? 45 : 3
  }

  const progress = outputs.length
    ? outputs.reduce((sum, node) => sum + taskProgress(node), 0) / outputs.length
    : 0
  const statusText = message.trim() || (outputs.length
    ? `已处理 ${done.length}/${outputs.length} 张`
    : '系统就绪 · 暂无生成任务')

  const startDockResize = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    setExpanded(true)
    dragPointRef.current = { y: event.clientY, height }
    const maxHeight = Math.min(520, Math.max(140, Math.floor(window.innerHeight * 0.6)))
    const move = (pointerEvent: PointerEvent) => {
      const point = dragPointRef.current
      if (!point) return
      setHeight(Math.min(maxHeight, Math.max(140, point.height + point.y - pointerEvent.clientY)))
    }
    const stop = () => {
      dragPointRef.current = null
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
      window.removeEventListener('pointercancel', stop)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
    window.addEventListener('pointercancel', stop)
  }, [height])

  useEffect(() => {
    globalThis.localStorage?.setItem('lys-status-dock-height', String(height))
  }, [height])

  useEffect(() => {
    if (busy) {
      setExpanded(true)
      setTab('tasks')
    }
  }, [busy])

  const tabs = [
    { id: 'tasks' as const, label: '任务', icon: ListTodo, count: outputs.length },
    { id: 'logs' as const, label: '日志', icon: ScrollText, count: workflowEvents.length },
    { id: 'cost' as const, label: '成本', icon: Coins, count: undefined },
  ]

  return (
    <footer
      className="workflow-status-dock relative flex shrink-0 flex-col border-t transition-all duration-300 ease-out"
      style={{ height: expanded ? height : 48 }}
    >
      <div
        className="dock-resizer"
        onPointerDown={startDockResize}
        role="separator"
        aria-orientation="horizontal"
        aria-label="调整底部监控台高度"
        title="拖动调整底部监控台高度"
      />
      <div className="progress-track w-full" style={{ height: 2, background: 'var(--bg-2)' }}>
        <div className="progress-fill" style={{ width: `${progress}%` }}/>
      </div>

      <button
        onClick={() => setExpanded(value => !value)}
        title={expanded ? '收起监控台' : '展开监控台'}
        className="flex h-[38px] shrink-0 items-center gap-3 pl-3 pr-4 text-left"
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
          style={{
            background: busy ? 'var(--primary-light)' : 'var(--bg-2)',
            color: busy ? 'var(--primary)' : 'var(--text-2)',
          }}>
          <Activity size={14} className={busy ? 'anim-spin' : ''}/>
        </span>
        <span className="shrink-0 text-[11px] font-semibold" style={{ color: 'var(--text)' }}>监控台</span>
        <span className="shrink-0 rounded-full px-2 py-0.5 font-mono text-[10px]"
          style={{
            background: busy ? 'var(--primary-light)' : 'var(--bg-2)',
            color: busy ? 'var(--primary)' : 'var(--text-2)',
          }}>
          {Math.round(progress)}%
        </span>
        <span className="shrink-0 text-[11px]" style={{ color: 'var(--text-2)' }}>
          {done.length}/{outputs.length}
        </span>
        {queuePaused && (
          <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px]"
            style={{ background: 'rgba(245,158,11,.12)', color: 'var(--warning)' }}>
            队列暂停
          </span>
        )}
        {generating.length > 0 && (
          <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px]"
            style={{ background: 'var(--primary-light)', color: 'var(--primary)' }}>
            运行 {generating.length}
          </span>
        )}
        {failed.length > 0 && (
          <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px]"
            style={{ background: 'rgba(239,68,68,.10)', color: 'var(--error)' }}>
            失败 {failed.length}
          </span>
        )}
        <span className="min-w-0 flex-1 truncate text-right text-[10px]" style={{ color: 'var(--text-3)' }}>
          {statusText}
        </span>
        <span className="shrink-0 font-mono text-[11px]" style={{ color: 'var(--text-2)' }}>¥{cost.toFixed(2)}</span>
        {expanded ? <ChevronDown size={13}/> : <ChevronUp size={13}/>}
      </button>

      {expanded && (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex shrink-0 items-center gap-1 border-b px-3" style={{ borderColor: 'var(--divider)' }}>
            {tabs.map(item => (
              <button key={item.id} onClick={() => setTab(item.id)}
                className={clsx('flex items-center gap-1.5 px-2 py-2 text-[11px] transition', tab === item.id ? 'font-medium' : 'hover:opacity-80')}
                style={{ color: tab === item.id ? 'var(--primary)' : 'var(--text-3)' }}>
                <item.icon size={12}/>
                {item.label}
                {item.count != null && <span className="font-mono text-[9px]">{item.count}</span>}
              </button>
            ))}
            <div className="ml-auto flex items-center gap-1 py-1">
              <button
                onClick={() => void (queuePaused ? resumeTaskQueue() : pauseTaskQueue())}
                className="btn btn-secondary !min-h-[24px] !px-2 !text-[10px]"
                title={queuePaused ? '恢复领取新的待生成任务' : '暂停领取新的待生成任务'}
              >
                {queuePaused ? <Play size={10}/> : <Pause size={10}/>}
                {queuePaused ? '恢复' : '暂停'}
              </button>
              <button
                onClick={() => void retryFailedOutputs()}
                disabled={busy || failed.length === 0 || providerBlocked}
                className="btn btn-secondary !min-h-[24px] !px-2 !text-[10px]"
                title={providerBlocked ? '先处理额度或鉴权问题，再恢复队列' : undefined}
              >
                <RefreshCw size={10}/>重试失败
              </button>
              {providerBlocked && (
                <>
                  <button onClick={() => setProviderSettingsOpen(true)}
                    className="btn btn-secondary !min-h-[24px] !px-2 !text-[10px]">
                    Provider 设置
                  </button>
                  <button onClick={() => void recoverProviderQueue()} disabled={busy}
                    title={`将系统性失败和剩余排队任务迁移到 ${providerName}，保留历史版本`}
                    className="btn btn-primary !min-h-[24px] !px-2 !text-[10px]">
                    迁移并恢复 · {providerName}
                  </button>
                </>
              )}
              <button
                onClick={() => {
                  if (!active.length) return
                  if (window.confirm(`确定取消 ${active.length} 个排队 / 生成中的任务吗？已提交到云端的请求会尽力停止。`)) {
                    void cancelQueuedOrRunning(active.map(node => node.id))
                  }
                }}
                disabled={!active.length}
                className="btn btn-secondary !min-h-[24px] !px-2 !text-[10px]"
              >
                <XCircle size={10}/>取消队列
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto">
            {tab === 'tasks' && (
              <table className="w-full border-collapse text-left text-[11px]">
                <thead className="sticky top-0" style={{ background: 'var(--bg)' }}>
                  <tr style={{ color: 'var(--text-3)' }}>
                    <th className="px-3 py-1.5 font-medium">图片</th>
                    <th className="px-2 py-1.5 font-medium">类型</th>
                    <th className="px-2 py-1.5 font-medium">状态 / 阶段</th>
                    <th className="w-[110px] px-2 py-1.5 font-medium">进度</th>
                    <th className="px-2 py-1.5 font-medium">版本</th>
                    <th className="px-2 py-1.5 text-right font-medium">成本</th>
                    <th className="px-3 py-1.5 text-right font-medium">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {outputs.map(node => {
                    const status = STATUS_TEXT[node.data.status] ?? STATUS_TEXT.queued
                    const stage = taskStages[node.data.taskId]
                    return (
                      <tr key={node.id} className="border-t" style={{ borderColor: 'var(--divider)' }}>
                        <td className="max-w-[260px] truncate px-3 py-1.5">
                          <button onClick={() => setSelected(node.id)} className="truncate hover:underline" style={{ color: 'var(--text)' }}>
                            {node.data.shotName || node.data.taskName}
                          </button>
                        </td>
                        <td className="px-2 py-1.5" style={{ color: 'var(--text-2)' }}>{PROCESS_TITLES[node.data.imageType]}</td>
                        <td className="max-w-[180px] px-2 py-1.5">
                          <span className="flex items-center gap-1.5" style={{ color: status.color }}>
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: status.color }}/>
                            <span className="truncate">
                              {node.data.status === 'generating' && stage
                                ? `${status.label} · ${STAGE_LABEL[stage.stage] ?? stage.stage}`
                                : status.label}
                            </span>
                          </span>
                          {node.data.status === 'generating' && stage && (
                            <div className="truncate text-[9px]" style={{ color: 'var(--text-3)' }}>{stage.message}</div>
                          )}
                          {node.data.status === 'failed' && node.data.errorMessage && (
                            <div className="max-w-[260px] truncate text-[9px]" style={{ color: 'var(--error)' }}
                              title={`${node.data.errorCode ?? 'GENERATION_FAILED'} · ${node.data.errorMessage}`}>
                              {node.data.errorCode ?? 'GENERATION_FAILED'} · {node.data.errorMessage}
                            </div>
                          )}
                        </td>
                        <td className="px-2 py-1.5">
                          <div className="flex items-center gap-1.5">
                            <div className="progress-track h-1 w-14">
                              <div className="progress-fill" style={{ width: `${taskProgress(node)}%` }}/>
                            </div>
                            <span className="font-mono text-[9px]" style={{ color: 'var(--text-3)' }}>
                              {Math.round(taskProgress(node))}%
                            </span>
                          </div>
                        </td>
                        <td className="px-2 py-1.5 font-mono" style={{ color: 'var(--text-3)' }}>v{node.data.version}</td>
                        <td className="px-2 py-1.5 text-right font-mono" style={{ color: 'var(--text-2)' }}>¥{node.data.cost.toFixed(2)}</td>
                        <td className="px-3 py-1.5 text-right">
                          <div className="flex justify-end gap-1.5">
                            {node.data.status === 'failed' && (
                              ['QUOTA_EXCEEDED', 'AUTHENTICATION_FAILED', 'API_KEY_MISSING'].includes(node.data.errorCode ?? '')
                                ? <button onClick={() => setProviderSettingsOpen(true)} className="text-[10px]" style={{ color: 'var(--primary)' }}>
                                    配置
                                  </button>
                                : <button onClick={() => void regenerate(node.id)} className="text-[10px]" style={{ color: 'var(--primary)' }}>
                                    重试
                                  </button>
                            )}
                            {node.data.status === 'unsatisfied' && (
                              <button onClick={() => openPromptRevision(node.id)} className="text-[10px]" style={{ color: 'var(--primary)' }}>
                                修正
                              </button>
                            )}
                            {['queued', 'generating'].includes(node.data.status) && (
                              <button onClick={() => void cancelQueuedOrRunning([node.id])} className="text-[10px]" style={{ color: 'var(--error)' }}>
                                取消
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                  {!outputs.length && (
                    <tr><td colSpan={7} className="px-3 py-6 text-center" style={{ color: 'var(--text-3)' }}>暂无任务</td></tr>
                  )}
                </tbody>
              </table>
            )}

            {tab === 'logs' && (
              <div className="space-y-1 px-3 py-2">
                {workflowEvents.map(event => (
                  <div key={event.id} className="flex gap-2 text-[10px]">
                    <span className="shrink-0 font-mono" style={{ color: 'var(--text-3)' }}>
                      {new Date(event.time).toLocaleTimeString('zh-CN', { hour12: false })}
                    </span>
                    <span className="shrink-0 font-mono" style={{ color: 'var(--primary)' }}>{event.type}</span>
                    <span style={{ color: 'var(--text-2)' }}>{event.message}</span>
                  </div>
                ))}
                {!workflowEvents.length && (
                  <div className="py-6 text-center text-[11px]" style={{ color: 'var(--text-3)' }}>暂无日志</div>
                )}
              </div>
            )}

            {tab === 'cost' && (
              <div className="grid grid-cols-4 gap-3 px-3 py-3">
                {PROCESS_TYPES.map(type => {
                  const rows = outputs.filter(node => node.data.imageType === type)
                  return (
                    <div key={type} className="rounded-lg border p-3" style={{ borderColor: 'var(--border)' }}>
                      <div className="text-[10px]" style={{ color: 'var(--text-3)' }}>{PROCESS_TITLES[type]}</div>
                      <div className="mt-1 font-mono text-sm" style={{ color: 'var(--text)' }}>
                        ¥{rows.reduce((sum, node) => sum + node.data.cost, 0).toFixed(2)}
                      </div>
                      <div className="text-[10px]" style={{ color: 'var(--text-3)' }}>{rows.length} 张</div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </footer>
  )
}
