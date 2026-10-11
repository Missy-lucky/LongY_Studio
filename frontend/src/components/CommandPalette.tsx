import { useEffect, useRef, useState, useMemo } from 'react'
import clsx from 'clsx'
import { ArrowRight, CornerDownLeft, Search } from 'lucide-react'
import { useWorkbench } from '../stores/workbench-store'

interface Command {
  id: string
  label: string
  hint?: string
  group: string
  shortcut?: string
  run: () => void
}

export function CommandPalette() {
  const open = useWorkbench(s => s.paletteOpen)
  const setOpen = useWorkbench(s => s.setPaletteOpen)
  const tasks = useWorkbench(s => s.tasks)
  const buildPlan = useWorkbench(s => s.buildPlan)
  const regenerate = useWorkbench(s => s.regenerate)
  const setMode = useWorkbench(s => s.setMode)
  const select = useWorkbench(s => s.select)
  const openExport = useWorkbench(s => s.openExport)
  const toast = useWorkbench(s => s.toast)
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) { setQuery(''); setIndex(0); setTimeout(() => inputRef.current?.focus(), 30) }
  }, [open])

  const commands = useMemo<Command[]>(() => [
    { id: 'c-gen', label: '生成方案', hint: '按品类规则生成任务', group: '操作', shortcut: '⌘↵', run: buildPlan },
    { id: 'c-regen', label: '重生成所有不满意', hint: `${tasks.filter(t=>t.status==='rejected').length} 个任务`, group: '操作', shortcut: '⌘R', run: () => regenerate(tasks.filter(t=>t.status==='rejected').map(t=>t.id)) },
    { id: 'c-export', label: '导出锁定图片', hint: `${tasks.filter(t=>t.status==='locked').length} 张`, group: '操作', run: openExport },
    { id: 'c-prepare', label: '切换到准备模式', group: '导航', shortcut: '⌘1', run: () => setMode('prepare') },
    { id: 'c-generate', label: '切换到生成模式', group: '导航', shortcut: '⌘2', run: () => setMode('generate') },
    { id: 'c-review', label: '切换到审核模式', group: '导航', shortcut: '⌘3', run: () => setMode('review') },
    { id: 'c-export-mode', label: '切换到导出模式', group: '导航', shortcut: '⌘4', run: () => setMode('export') },
    { id: 'c-theme', label: '切换深色/浅色主题', hint: '设置中可自定义主色', group: '设置', run: () => {
      const root = document.documentElement
      root.classList.toggle('theme-dark')
      localStorage.setItem('lys-dark', root.classList.contains('theme-dark') ? '1' : '0')
    }},
    { id: 'c-save', label: '保存当前方案', hint: '自动保存已启用', group: '操作', shortcut: '⌘S', run: () => toast('success', '已自动保存', '', false) },
    ...tasks.slice(0, 20).map(t => ({
      id: t.id, label: `${t.code} ${t.name}`, hint: t.status, group: '任务',
      run: () => { select({ kind: 'task', id: t.id }); setMode('review') },
    })),
  ], [tasks, buildPlan, regenerate, setMode, select, openExport, toast])

  const filtered = useMemo(() => {
    if (!query) return commands
    const q = query.toLowerCase()
    return commands.filter(c => c.label.toLowerCase().includes(q) || c.group.toLowerCase().includes(q) || c.hint?.toLowerCase().includes(q))
  }, [commands, query])

  useEffect(() => { setIndex(0) }, [query])

  if (!open) return null

  const groups = [...new Set(filtered.map(c => c.group))]

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setIndex(i => Math.min(i + 1, filtered.length - 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setIndex(i => Math.max(i - 1, 0)) }
    if (e.key === 'Enter' && filtered[index]) { filtered[index].run(); setOpen(false) }
    if (e.key === 'Escape') setOpen(false)
  }

  return (
    <div className="fixed inset-0 z-[300] flex items-start justify-center pt-[15vh]"
      style={{ background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(8px)' }}
      onMouseDown={() => setOpen(false)}>
      <div className="anim-down w-[520px] overflow-hidden rounded-xl border"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-lg)' }}
        onMouseDown={e => e.stopPropagation()}>
        {/* 搜索框 */}
        <div className="flex items-center gap-3 border-b px-4 py-3" style={{ borderColor: 'var(--divider)' }}>
          <Search size={16} strokeWidth={1.5} style={{ color: 'var(--text-3)' }}/>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onKey}
            placeholder="搜索功能、任务、快捷操作..."
            className="flex-1 bg-transparent text-sm outline-none"
            style={{ color: 'var(--text)' }}
          />
          <span className="kbd">Esc</span>
        </div>

        {/* 结果列表 */}
        <div ref={listRef} className="max-h-[46vh] overflow-y-auto p-1.5">
          {groups.map(group => (
            <div key={group}>
              <div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-3)' }}>
                {group}
              </div>
              {filtered.filter(c => c.group === group).map(c => {
                const globalIdx = filtered.indexOf(c)
                return (
                  <button key={c.id}
                    onClick={() => { c.run(); setOpen(false) }}
                    onMouseEnter={() => setIndex(globalIdx)}
                    className={clsx('flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors',
                      index === globalIdx ? 'bg-[var(--surface-hover)]' : '')}>
                    <span className="flex-1">
                      <span className="block text-sm font-medium" style={{ color: 'var(--text)' }}>{c.label}</span>
                      {c.hint && <span className="block text-xs" style={{ color: 'var(--text-3)' }}>{c.hint}</span>}
                    </span>
                    {c.shortcut && <span className="kbd">{c.shortcut}</span>}
                    {index === globalIdx && <CornerDownLeft size={12} style={{ color: 'var(--text-3)' }}/>}
                  </button>
                )
              })}
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="p-6 text-center text-sm" style={{ color: 'var(--text-3)' }}>没有匹配结果</div>
          )}
        </div>

        {/* 底部提示 */}
        <div className="flex items-center gap-3 border-t px-4 py-2 text-[10px]" style={{ borderColor: 'var(--divider)', color: 'var(--text-3)' }}>
          <span className="flex items-center gap-1"><span className="kbd">↑↓</span>导航</span>
          <span className="flex items-center gap-1"><span className="kbd">↵</span>执行</span>
          <span className="flex items-center gap-1"><span className="kbd">Esc</span>关闭</span>
        </div>
      </div>
    </div>
  )
}
