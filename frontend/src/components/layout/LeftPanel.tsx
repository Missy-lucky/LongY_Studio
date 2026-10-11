import clsx from 'clsx'
import { useState } from 'react'
import { useWorkbench } from '../../stores/workbench-store'

const TABS = ['单品', '未识别', '规范', '模特'] as const

export function LeftPanel() {
  const [tab, setTab] = useState<(typeof TABS)[number]>('单品')
  const items = useWorkbench(s => s.items)
  const materials = useWorkbench(s => s.materials)
  const categories = useWorkbench(s => s.categories)
  const models = useWorkbench(s => s.models)
  const specs = useWorkbench(s => s.specs)
  const tasks = useWorkbench(s => s.tasks)
  const select = useWorkbench(s => s.select)
  const confirmMaterialCategory = useWorkbench(s => s.confirmMaterialCategory)
  const toggleModel = useWorkbench(s => s.toggleModel)
  const unknown = materials.filter(m => !m.categoryId)

  return (
    <aside className="panel-left z-10 flex w-[240px] shrink-0 flex-col">
      {/* Apple 式标签：文字按钮，无背景框 */}
      <div className="flex gap-5 px-4 pt-4 pb-2">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={clsx('pb-1.5 text-[13px] transition-colors',
              tab === t ? 'font-semibold' : 'font-normal hover:opacity-70')}
            style={{
              color: tab === t ? 'var(--apple-text)' : 'var(--apple-text-3)',
              borderBottom: tab === t ? '2px solid var(--apple-blue)' : '2px solid transparent',
            }}>
            {t}{t === '未识别' && unknown.length > 0 ? ` ${unknown.length}` : ''}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-4">
        {/* 单品列表 */}
        {tab === '单品' && (
          <div className="flex flex-col gap-1">
            {items.length === 0 && <Hint text="拖入图片开始" />}
            {items.map(item => {
              const cat = categories.find(c => c.id === item.categoryId)
              const views = materials.filter(m => m.itemId === item.id)
              return (
                <button key={item.id}
                  onClick={() => select({ kind: 'material', id: views[0]?.id ?? '' })}
                  className="flex items-center gap-3 rounded-xl p-2.5 text-left transition-colors hover:bg-black/[0.03] dark:hover:bg-white/[0.04]">
                  {views[0]
                    ? <img src={views[0].previewUrl} className="h-11 w-9 rounded-lg object-cover" />
                    : <div className="flex h-11 w-9 items-center justify-center rounded-lg bg-black/[0.04] dark:bg-white/[0.06] text-[10px]" style={{ color: 'var(--apple-text-3)' }}>—</div>}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium" style={{ color: 'var(--apple-text)' }}>{item.name}</div>
                    <div className="text-[11px]" style={{ color: 'var(--apple-text-3)' }}>
                      {cat?.name} · {views.length} 张 · {tasks.filter(t => t.itemId === item.id).length} 任务
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}

        {/* 未识别 */}
        {tab === '未识别' && (
          <div className="flex flex-col gap-2">
            {unknown.length === 0 && <Hint text="没有待确认素材" />}
            {unknown.map(m => (
              <div key={m.id} className="rounded-xl p-2.5" style={{ background: 'rgba(255,204,0,0.06)' }}>
                <div className="flex items-center gap-3">
                  <img src={m.previewUrl} className="h-10 w-8 rounded-lg object-cover" />
                  <span className="flex-1 truncate text-[13px]">{m.name}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5 pl-11">
                  {categories.map(c => (
                    <button key={c.id}
                      onClick={() => confirmMaterialCategory(m.id, c.id)}
                      className="rounded-full px-3 py-1 text-[11px] transition-colors"
                      style={{ background: 'var(--apple-blue)', color: 'white' }}>
                      {c.name}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 规范 */}
        {tab === '规范' && (
          <div className="flex flex-col gap-1">
            {specs.map(s => (
              <div key={s.id} className="rounded-xl p-3 transition-colors hover:bg-black/[0.03] dark:hover:bg-white/[0.04]">
                <div className="text-[13px] font-medium">{s.name}</div>
                <div className="mt-0.5 text-[11px]" style={{ color: 'var(--apple-text-3)' }}>
                  {s.composition} · {s.ratio}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 模特 */}
        {tab === '模特' && (
          <div className="flex flex-col gap-1">
            {models.map(m => (
              <button key={m.id} onClick={() => toggleModel(m.id)}
                className="flex items-center gap-3 rounded-xl p-2.5 text-left transition-colors hover:bg-black/[0.03] dark:hover:bg-white/[0.04]">
                <img src={m.avatarUrl} className="h-10 w-10 rounded-full object-cover" />
                <div className="flex-1">
                  <div className="text-[13px] font-medium">{m.name}</div>
                  <div className="text-[11px]" style={{ color: 'var(--apple-text-3)' }}>{m.styles.join(' · ')}</div>
                </div>
                <div className="h-2 w-2 rounded-full transition-colors"
                  style={{ background: m.enabled ? 'var(--color-success)' : 'var(--apple-text-3)' }} />
              </button>
            ))}
          </div>
        )}
      </div>
    </aside>
  )
}

function Hint({ text }: { text: string }) {
  return (
    <div className="rounded-xl p-6 text-center text-[12px]" style={{ color: 'var(--apple-text-3)' }}>
      {text}
    </div>
  )
}
