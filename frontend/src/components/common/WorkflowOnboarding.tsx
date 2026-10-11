import { Check, ChevronLeft, ChevronRight, CircleHelp, FolderDown, Layers, Sparkles, X } from 'lucide-react'
import clsx from 'clsx'
import { useWorkbench } from '../../stores/workbench-store'
import type { WorkMode } from '../../types/domain'

const GUIDE_STEPS: Array<{
  id: WorkMode
  title: string
  icon: typeof Layers
  summary: string
  points: string[]
}> = [
  {
    id: 'prepare',
    title: '第 1 步 · 准备',
    icon: Layers,
    summary: '先把商品事实整理清楚，再进入生成。',
    points: [
      '左侧切换部位，管理素材、属性和模特。',
      '画布上的空素材容器可以直接点击上传，已有素材可 Alt+点击替换。',
      '点击“生成方案”并确认镜头后，会自动进入生成阶段。',
    ],
  },
  {
    id: 'generate',
    title: '第 2 步 · 生成',
    icon: Sparkles,
    summary: '每个输入节点可以独立决定要生成哪些图。',
    points: [
      '用下拉框切换上衣、裤子、鞋子等输入节点，分别勾选生图范围。',
      '节点范围会随项目布局保存，不会因为重开项目丢失。',
      '底部监控台显示真实阶段、日志、成本，并支持暂停、重试和取消。',
    ],
  },
  {
    id: 'review',
    title: '第 3 步 · 审核',
    icon: Check,
    summary: '画布负责看图，左侧列表直接处理每一张结果。',
    points: [
      '每张图片下方就有满意、修正、锁定、高清等操作，不需要来回滑到底部。',
      '修正时可选择按原图重画，或按当前生成图微调。',
      '局部问题可以刷蒙版，只重绘指定区域；版本历史支持对比和恢复。',
    ],
  },
  {
    id: 'export',
    title: '第 4 步 · 导出',
    icon: FolderDown,
    summary: '导出清单、覆盖检查和输出设置都留在左侧。',
    points: [
      '逐项勾选要导出的生成图或原图素材。',
      '支持详细 / 简洁命名格式和自定义导出目录。',
      '必拍镜头缺失会直接列出，导出结果和目录入口也在左侧。',
    ],
  },
]

export function WorkflowOnboarding() {
  const open = useWorkbench(state => state.guideOpen)
  const stepIndex = useWorkbench(state => state.guideStep)
  const setStep = useWorkbench(state => state.setGuideStep)
  const setMode = useWorkbench(state => state.setMode)
  const finish = useWorkbench(state => state.finishGuide)
  const setExperienceMode = useWorkbench(state => state.setExperienceMode)

  if (!open) return null
  const step = GUIDE_STEPS[stepIndex]
  const isLast = stepIndex === GUIDE_STEPS.length - 1

  const goStep = (nextIndex: number) => {
    const clamped = Math.max(0, Math.min(GUIDE_STEPS.length - 1, nextIndex))
    setStep(clamped)
    setMode(GUIDE_STEPS[clamped].id)
  }

  return (
    <div className="fixed inset-0 z-[280] flex items-center justify-center bg-black/65 p-6">
      <div className="anim-scale flex max-h-[86vh] w-[760px] flex-col overflow-hidden rounded-2xl border"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-lg)' }}>
        <header className="flex items-start gap-3 border-b px-5 py-4" style={{ borderColor: 'var(--divider)' }}>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
            style={{ background: 'var(--primary-light)', color: 'var(--primary)' }}>
            <CircleHelp size={17}/>
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>LongY Studio 流程引导</div>
            <div className="mt-0.5 text-[11px]" style={{ color: 'var(--text-3)' }}>
              新手模式会按步骤限制跳转；正常模式可自由切换并保留快捷键。
            </div>
          </div>
          <button onClick={() => finish(false)} className="btn btn-secondary !px-2 !py-1.5" title="稍后再说">
            <X size={13}/>
          </button>
        </header>

        <div className="flex min-h-0 flex-1">
          <nav className="flex w-[190px] shrink-0 flex-col gap-1 border-r p-3" style={{ borderColor: 'var(--divider)', background: 'var(--bg-2)' }}>
            {GUIDE_STEPS.map((item, index) => (
              <button
                key={item.id}
                onClick={() => goStep(index)}
                className={clsx('flex items-center gap-2 rounded-lg px-2 py-2 text-left transition', index === stepIndex ? 'font-medium' : 'hover:bg-[var(--surface-hover)]')}
                style={{
                  background: index === stepIndex ? 'var(--primary-light)' : 'transparent',
                  color: index === stepIndex ? 'var(--primary)' : 'var(--text-2)',
                }}
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md"
                  style={{ background: index < stepIndex ? 'var(--success)' : index === stepIndex ? 'var(--primary)' : 'var(--surface)' }}>
                  {index < stepIndex ? <Check size={11} className="text-white"/> : <item.icon size={11}/>}
                </span>
                <span className="min-w-0 flex-1 truncate text-[11px]">{item.title}</span>
              </button>
            ))}
            <div className="mt-auto rounded-lg border border-dashed p-2 text-[9px] leading-3"
              style={{ borderColor: 'var(--border)', color: 'var(--text-3)' }}>
              快捷键：Ctrl+1~4 切步骤 · Ctrl+Enter 执行当前主操作 · Ctrl+K 命令面板 · Ctrl+S 保存
            </div>
          </nav>

          <section className="min-w-0 flex-1 overflow-y-auto p-5">
            <div className="flex items-center gap-2">
              <step.icon size={16} style={{ color: 'var(--primary)' }}/>
              <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{step.title}</h3>
            </div>
            <p className="mt-1.5 text-[12px]" style={{ color: 'var(--text-2)' }}>{step.summary}</p>
            <div className="mt-4 space-y-2">
              {step.points.map(point => (
                <div key={point} className="flex items-start gap-2 rounded-lg border p-2.5"
                  style={{ borderColor: 'var(--border)', background: 'var(--bg-2)' }}>
                  <Check size={12} className="mt-0.5 shrink-0" style={{ color: 'var(--success)' }}/>
                  <span className="text-[11px] leading-5" style={{ color: 'var(--text-2)' }}>{point}</span>
                </div>
              ))}
            </div>
          </section>
        </div>

        <footer className="flex items-center gap-2 border-t px-5 py-3" style={{ borderColor: 'var(--divider)' }}>
          <button
            onClick={() => {
              finish(true)
              setExperienceMode('normal')
            }}
            className="text-[10px] transition hover:text-[var(--text)]"
            style={{ color: 'var(--text-3)' }}
          >
            跳过引导并切换正常模式
          </button>
          <div className="flex-1"/>
          <button onClick={() => goStep(stepIndex - 1)} disabled={stepIndex === 0} className="btn btn-secondary">
            <ChevronLeft size={13}/>上一步
          </button>
          {isLast ? (
            <button onClick={() => finish(false)} className="btn btn-primary">
              <Check size={13}/>开始使用新手模式
            </button>
          ) : (
            <button onClick={() => goStep(stepIndex + 1)} className="btn btn-primary">
              下一步<ChevronRight size={13}/>
            </button>
          )}
        </footer>
      </div>
    </div>
  )
}
