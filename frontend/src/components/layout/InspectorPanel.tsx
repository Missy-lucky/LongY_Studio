import { useWorkbench } from '../../stores/workbench-store'

export function InspectorPanel() {
  const selection = useWorkbench(s => s.selection)
  const project = useWorkbench(s => s.project)
  const tasks = useWorkbench(s => s.tasks)
  const items = useWorkbench(s => s.items)

  const task = selection.kind === 'task' ? tasks.find(t => t.id === selection.id) : undefined

  return (
    <aside className="panel-right z-10 flex w-[260px] shrink-0 flex-col overflow-y-auto">
      <div className="px-5 pt-5 pb-2">
        <span className="t-title">{task ? task.name : project?.name || '项目'}</span>
      </div>

      {/* Apple Settings 式分组列表 */}
      <div className="px-4 pb-6">
        {task ? (
          <>
            <Group title="任务">
              <SettingRow label="编号" value={task.code} />
              <SettingRow label="类型" value={task.type} />
              <SettingRow label="状态" value={task.status} />
              <SettingRow label="档位" value={task.tier === 'draft' ? '草稿' : '高清'} />
            </Group>
            <Group title="成本">
              <SettingRow label="预估" value={`¥${task.estimatedCost}`} />
              <SettingRow label="实际" value={`¥${task.versions.reduce((a, v) => a + v.cost, 0)}`} />
              <SettingRow label="缓存" value={task.cacheHit ? '命中' : '未命中'} />
            </Group>
            <Group title="提示词">
              <p className="rounded-xl p-3 text-[12px] leading-relaxed" style={{ background: 'var(--apple-bg)', color: 'var(--apple-text-2)' }}>
                {task.prompt}
              </p>
            </Group>
            {task.versions.length > 0 && (
              <Group title={`版本 (${task.versions.length})`}>
                {task.versions.map(v => (
                  <div key={v.id} className="flex items-center justify-between py-2">
                    <span className="text-[13px]">v{v.version}</span>
                    <span className="text-[11px]" style={{ color: 'var(--apple-text-3)' }}>
                      ¥{v.cost} · {v.durationMs ? `${(v.durationMs / 1000).toFixed(1)}s` : '—'}
                    </span>
                  </div>
                ))}
              </Group>
            )}
          </>
        ) : (
          <>
            <Group title="项目">
              <SettingRow label="编号" value={project?.sku || '—'} />
              <SettingRow label="平台" value={project?.platform || '—'} />
              <SettingRow label="预算" value={project ? `¥${project.budget}` : '—'} />
            </Group>
            <Group title="统计">
              <SettingRow label="单品" value={String(items.length)} />
              <SettingRow label="任务" value={String(tasks.length)} />
              <SettingRow label="待审核" value={String(tasks.filter(t => t.status === 'review').length)} />
              <SettingRow label="已锁定" value={String(tasks.filter(t => t.status === 'locked').length)} />
            </Group>
          </>
        )}
      </div>
    </aside>
  )
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <div className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--apple-text-3)' }}>
        {title}
      </div>
      <div className="overflow-hidden rounded-xl" style={{ background: 'var(--apple-surface)', boxShadow: 'var(--apple-shadow)' }}>
        {children}
      </div>
    </div>
  )
}

function SettingRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b px-4 py-2.5 last:border-b-0"
      style={{ borderColor: 'var(--apple-border)' }}>
      <span className="text-[13px]" style={{ color: 'var(--apple-text-2)' }}>{label}</span>
      <span className="text-[13px] font-medium" style={{ color: 'var(--apple-text)' }}>{value}</span>
    </div>
  )
}
