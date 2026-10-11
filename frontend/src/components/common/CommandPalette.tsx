import { useEffect, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import { Command, Search } from 'lucide-react'
import { useWorkbench } from '../../stores/workbench-store'

export function CommandPalette() {
  const open = useWorkbench(s => s.paletteOpen)
  const setPaletteOpen = useWorkbench(s => s.setPaletteOpen)
  const tasks = useWorkbench(s => s.tasks)
  const buildPlan = useWorkbench(s => s.buildPlan)
  const regenerate = useWorkbench(s => s.regenerate)
  const setStatusFilter = useWorkbench(s => s.setStatusFilter)
  const setMode = useWorkbench(s => s.setMode)
  const openExport = useWorkbench(s => s.openExport)
  const select = useWorkbench(s => s.select)
  const toast = useWorkbench(s => s.toast)
  const [q, setQ] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (open) { setQ(''); setTimeout(() => inputRef.current?.focus(), 30) } }, [open])
  if (!open) return null

  const commands = useMemo(() => [
    { id: 'c1', label: '生成方案预览', hint: '按品类规则生成任务清单与成本预估', run: () => { buildPlan() } },
    { id: 'c2', label: '重生成所有「颜色不准」任务', hint: '按原因批量重生成', run: () => { const ids = tasks.filter(t => t.status === 'rejected' && t.versions.some(v => v.reason === 'color')).map(t => t.id); ids.length ? regenerate(ids) : toast('info', '没有颜色不准的拒绝任务', '先在审核模式拒绝并选择原因', false) } },
    { id: 'c3', label: '只看失败任务', hint: '过滤画布与时间线', run: () => { setStatusFilter('failed'); setMode('generate') } },
    { id: 'c4', label: '导出锁定版本', hint: '文件树预览，不覆盖重名', run: () => openExport() },
    { id: 'c5', label: '新建腰带品类', hint: '品类向导（预留）', run: () => toast('info', '新建品类', '六步向导已预留：基础信息 → 身体区域 → 视角 → 任务 → 提示词 → 预览', false) },
    { id: 'c6', label: '打开项目文件夹', hint: '本地目录（接入 FastAPI 后可用）', run: () => toast('info', '打开项目文件夹', '后端文件系统接口已预留，v0.1 原型使用演示数据', false) },
    { id: 'c7', label: '打开成本中心', hint: '预估/实际/缓存命中率（预留）', run: () => toast('info', '成本中心', '按类型/品类/Provider 统计与 CSV 导出已预留', false) },
    ...tasks.slice(0, 30).map(t => ({ id: t.id, label: `${t.code} ${t.name}`, hint: '定位任务节点', run: () => { select({ kind: 'task', id: t.id }); setMode('generate') } })),
  ], [tasks])

  const filtered = commands.filter(c => !q || c.label.toLowerCase().includes(q.toLowerCase()) || c.hint.includes(q))

  return (
    <div className="fixed inset-0 z-[130] flex items-start justify-center bg-black/50 pt-[15vh]" onMouseDown={() => setPaletteOpen(false)}>
      <div className="w-[520px] overflow-hidden rounded-xl border border-border-subtle bg-bg-panel shadow-2xl" onMouseDown={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-border-subtle px-3 py-2.5">
          <Search size={14} className="text-text-muted" />
          <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)} placeholder="搜索任务与命令，支持中文拼音首字母（预留）"
            className="flex-1 bg-transparent text-xs outline-none placeholder:text-text-muted"
            onKeyDown={e => {
              if (e.key === 'Enter' && filtered[0]) { filtered[0].run(); setPaletteOpen(false) }
              if (e.key === 'Escape') setPaletteOpen(false)
            }} />
          <kbd className="rounded bg-white/10 px-1.5 font-mono text-[9px] text-text-secondary">Esc</kbd>
        </div>
        <div className="max-h-[46vh] overflow-y-auto p-1.5">
          {filtered.map(c => (
            <button key={c.id} onClick={() => { c.run(); setPaletteOpen(false) }}
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left hover:bg-white/5">
              <Command size={12} className="shrink-0 text-text-muted" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[11px]">{c.label}</span>
                <span className="block truncate text-[10px] text-text-muted">{c.hint}</span>
              </span>
            </button>
          ))}
          {filtered.length === 0 && <div className="p-4 text-center text-[11px] text-text-muted">没有匹配的命令或任务</div>}
        </div>
      </div>
    </div>
  )
}
