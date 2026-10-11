import clsx from 'clsx'
import { CheckCircle2, CircleHelp, FolderDown, Layers, Loader2, MoreHorizontal, Moon, Pause, Play, Plus, Save, Search, Sparkles, Sun } from 'lucide-react'
import { useState, useEffect } from 'react'
import { useWorkbench } from '../../stores/workbench-store'
import { useNodeStore } from '../../stores/node-store'
import type { WorkMode } from '../../types/domain'

const MODES: { id: WorkMode; label: string; icon: typeof Layers }[] = [
  { id: 'prepare', label: '准备', icon: Layers },
  { id: 'generate', label: '生成', icon: Sparkles },
  { id: 'review', label: '审核', icon: CheckCircle2 },
  { id: 'export', label: '导出', icon: FolderDown },
]

const ACCENTS = [
  { id: 'indigo', color: '#6366F1', label: '靛蓝' },
  { id: 'blue', color: '#3B82F6', label: '蓝' },
  { id: 'violet', color: '#8B5CF6', label: '紫' },
  { id: 'emerald', color: '#10B981', label: '翠绿' },
  { id: 'rose', color: '#F43F5E', label: '玫红' },
  { id: 'amber', color: '#F59E0B', label: '琥珀' },
]

export function TopBar() {
  const mode = useWorkbench(s => s.mode)
  const experienceMode = useWorkbench(s => s.experienceMode)
  const nodeProject = useNodeStore(s => s.projectMeta)
  const nodeBusy = useNodeStore(s => s.workflowBusy)
  const nodes = useNodeStore(s => s.nodes)
  const generatePlan = useNodeStore(s => s.generatePlan)
  const startGeneration = useNodeStore(s => s.startGeneration)
  const exportLocked = useNodeStore(s => s.exportLocked)
  const resetCanvas = useNodeStore(s => s.resetCanvas)
  const setProjectSettingsOpen = useNodeStore(s => s.setProjectSettingsOpen)
  const saveProjectLayout = useNodeStore(s => s.saveProjectLayout)
  const layoutDirty = useNodeStore(s => s.layoutDirty)
  const layoutSaving = useNodeStore(s => s.layoutSaving)
  const setMode = useWorkbench(s => s.setMode)
  const setPaletteOpen = useWorkbench(s => s.setPaletteOpen)
  const setGuideOpen = useWorkbench(s => s.setGuideOpen)
  const toast = useWorkbench(s => s.toast)

  const [dark, setDark] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [accent, setAccent] = useState('indigo')

  useEffect(() => {
    setDark(document.documentElement.classList.contains('theme-dark'))
    setAccent(localStorage.getItem('lys-accent') || 'indigo')
  }, [])

  const toggleTheme = () => {
    const root = document.documentElement
    root.classList.toggle('theme-dark')
    const isDark = root.classList.contains('theme-dark')
    localStorage.setItem('lys-dark', isDark ? '1' : '0')
    setDark(isDark)
  }

  const setAccentColor = (id: string) => {
    const root = document.documentElement
    ACCENTS.forEach(a => root.classList.remove(`accent-${a.id}`))
    root.classList.add(`accent-${id}`)
    localStorage.setItem('lys-accent', id)
    setAccent(id)
  }

  const outputs = nodes.filter(node => node.type === 'output')
  const pending = outputs.length
  const locked = outputs.filter(node => {
    const status = (node as { data?: { status?: string } }).data?.status
    return status === 'locked' || status === 'exported'
  }).length
  const rejected = outputs.filter(node => (node as { data?: { status?: string } }).data?.status === 'unsatisfied').length
  const stageAvailable = {
    prepare: true,
    generate: outputs.length > 0,
    review: outputs.length > 0,
    export: locked > 0,
  }
  const statusOf = (status: string) => outputs.filter(node =>
    (node as { data?: { status?: string } }).data?.status === status).length
  const reviewUnresolved = ['pending', 'unsatisfied', 'failed', 'satisfied']
    .reduce((sum, status) => sum + statusOf(status), 0)
  const stageComplete = {
    prepare: outputs.length > 0,
    generate: outputs.length > 0 && ['queued', 'generating', 'failed'].every(status => statusOf(status) === 0),
    review: outputs.length > 0 && locked > 0 && reviewUnresolved === 0,
    export: outputs.length > 0 && statusOf('exported') === outputs.length,
  }
  const stageRequirements = {
    prepare: '准备：确认部位素材、属性和模特后生成方案',
    generate: '生成：先在准备阶段确认镜头方案',
    review: '审核：需要已有生成结果',
    export: '导出：至少锁定一张图片',
  }

  const getAction = () => {
    if (mode === 'prepare') {
      return {
        label: nodeProject ? '生成方案' : '新建项目',
        icon: nodeProject ? <Layers size={14}/> : <Plus size={14}/>,
        act: nodeProject ? () => void generatePlan() : resetCanvas,
      }
    }
    if (mode === 'generate') {
      return {
        label: nodeBusy ? '处理中' : '开始生成',
        icon: nodeBusy ? <Loader2 size={13} className="anim-spin"/> : <Play size={14}/>,
        act: () => void startGeneration(), disabled: nodeBusy,
      }
    }
    if (mode === 'review') {
      return {
        label: rejected ? `待重生成 ${rejected}` : '审核',
        icon: <Sparkles size={14}/>,
        act: () => useWorkbench.getState().setMode('review'),
        disabled: outputs.length === 0,
      }
    }
    return {
      label: locked ? `导出 ${locked} 张` : '导出',
      icon: <FolderDown size={14}/>,
      act: () => void exportLocked(), disabled: nodeBusy || locked === 0,
    }
  }
  const action = getAction()

  const iconBtn = 'flex h-8 w-8 items-center justify-center rounded-lg transition-all duration-150 hover:scale-105 active:scale-95'
  const iconStyle = { color: 'var(--text-2)' }

  return (
    <header className="relative z-30 flex h-12 shrink-0 items-center gap-2 px-4"
      style={{ background: 'var(--surface)', borderBottom: '1px solid var(--divider)' }}>
      {/* Logo */}
      <div className="flex items-center gap-2 mr-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: 'var(--primary)' }}>
          <Sparkles size={14} strokeWidth={1.5} className="text-white"/>
        </div>
        <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
          {nodeProject?.name || 'LongY Studio'}
        </span>
        {layoutDirty && (
          <span className="rounded-full border border-warning/50 bg-warning/10 px-2 py-0.5 text-[9px] text-warning">
            布局未保存
          </span>
        )}
      </div>

      {/* 模式切换 */}
      <div className="flex flex-1 justify-center">
        <div className="segment">
          {MODES.map(m => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              disabled={experienceMode === 'novice' && !stageAvailable[m.id]}
              title={
                experienceMode === 'novice' && !stageAvailable[m.id]
                  ? stageRequirements[m.id]
                  : `${m.label}：${stageComplete[m.id] ? '已完成' : '进行中'}`
              }
              className={clsx('segment-item', mode === m.id && 'active')}>
              <span className="flex items-center gap-1.5">
                <m.icon size={13} strokeWidth={1.5}/>{m.label}
                {stageComplete[m.id] ? (
                  <CheckCircle2 size={11} strokeWidth={2} style={{ color: 'var(--success)' }}/>
                ) : mode !== m.id && stageAvailable[m.id] ? (
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--primary)' }}/>
                ) : null}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* 右侧操作区 */}
      <div className="flex items-center gap-1.5">
        {/* 搜索入口 */}
        <button onClick={() => setGuideOpen(true)}
          className={clsx(iconBtn, 'hover:bg-[var(--surface-hover)]')}
          style={iconStyle} title="流程引导 (?)">
          <CircleHelp size={16} strokeWidth={1.5}/>
        </button>

        <button onClick={() => setPaletteOpen(true)}
          className={clsx(iconBtn, 'hover:bg-[var(--surface-hover)]')}
          style={iconStyle} title="搜索 (Ctrl+K)">
          <Search size={16} strokeWidth={1.5}/>
        </button>

        {/* 保存 */}
        <button onClick={() => void saveProjectLayout()}
          className={clsx(iconBtn, 'hover:bg-[var(--surface-hover)]')}
          style={layoutDirty ? { color: 'var(--warning)' } : iconStyle} title={layoutDirty ? '布局未保存，点击保存 (Ctrl+S)' : '保存画布布局 (Ctrl+S)'}>
          {layoutSaving ? <Loader2 size={16} className="anim-spin"/> : <Save size={16} strokeWidth={1.5}/>}
        </button>

        {/* 主题切换 */}
        <button onClick={toggleTheme}
          className={clsx(iconBtn, 'hover:bg-[var(--surface-hover)]')}
          style={iconStyle} title={dark ? '切换浅色' : '切换深色'}>
          {dark ? <Sun size={16} strokeWidth={1.5}/> : <Moon size={16} strokeWidth={1.5}/>}
        </button>

        {/* 更多菜单（主题色选择） */}
        <div className="relative">
          <button onClick={() => setMenuOpen(v => !v)}
            className={clsx(iconBtn, 'hover:bg-[var(--surface-hover)]')}
            style={iconStyle} title="主题色">
            <MoreHorizontal size={16} strokeWidth={1.5}/>
          </button>

          {menuOpen && (
            <>
              <div className="fixed inset-0 z-[90]" onClick={() => setMenuOpen(false)}/>
              <div className="anim-scale absolute right-0 top-10 z-[100] w-[200px] rounded-xl border p-3"
                style={{ background: 'var(--surface)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-lg)' }}>
                <div className="mb-2 text-xs font-medium" style={{ color: 'var(--text-3)' }}>主题色</div>
                <div className="grid grid-cols-6 gap-2">
                  {ACCENTS.map(a => (
                    <button key={a.id}
                      onClick={() => { setAccentColor(a.id); setMenuOpen(false) }}
                      title={a.label}
                      className="flex h-8 w-8 items-center justify-center rounded-full transition-transform hover:scale-110"
                      style={{
                        background: `${a.color}15`,
                        border: accent === a.id ? `2px solid ${a.color}` : 'none',
                      }}>
                      <span className="h-3.5 w-3.5 rounded-full" style={{ background: a.color }}/>
                    </button>
                  ))}
                </div>
                <div className="mt-3 border-t pt-2" style={{ borderColor: 'var(--divider)' }}>
                  <div className="text-xs" style={{ color: 'var(--text-3)' }}>
                    当前：{ACCENTS.find(a => a.id === accent)?.label}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* 主操作按钮 */}
        <button onClick={action.act} disabled={action.disabled}
          className={clsx('btn ml-2', 'btn-primary')}>
          action.icon
          {action.label}
        </button>
      </div>
    </header>
  )
}
