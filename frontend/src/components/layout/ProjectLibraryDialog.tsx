import { useEffect, useState } from 'react'
import { FolderOpen, RefreshCw, X } from 'lucide-react'
import { api } from '../../services/api'
import type { RemoteProject } from '../../services/api'
import { useNodeStore } from '../../stores/node-store'

export function ProjectLibraryDialog() {
  const open = useNodeStore(state => state.projectLibraryOpen)
  const setOpen = useNodeStore(state => state.setProjectLibraryOpen)
  const openProject = useNodeStore(state => state.openProject)
  const currentProjectId = useNodeStore(state => state.backendProjectId)
  const busy = useNodeStore(state => state.workflowBusy)
  const [projects, setProjects] = useState<RemoteProject[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const result = await api.listProjects()
      setProjects(result.projects)
    } catch (exc) {
      setError(exc instanceof Error ? exc.message : '项目列表读取失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open) void load()
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, setOpen])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/65 p-6">
      <div className="flex max-h-[78vh] w-[820px] flex-col rounded-2xl border"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-lg)' }}>
        <div className="flex items-center gap-3 border-b px-5 py-4" style={{ borderColor: 'var(--divider)' }}>
          <FolderOpen size={16} className="text-accent"/>
          <div className="flex-1">
            <div className="text-sm font-semibold">项目库</div>
            <div className="mt-0.5 text-[11px] text-text-secondary">选择一个项目后，会恢复它的素材、任务、版本与结果图。</div>
          </div>
          <button onClick={() => void load()} disabled={loading} className="btn btn-secondary !min-h-[32px]" title="刷新项目列表">
            <RefreshCw size={13} className={loading ? 'anim-spin' : undefined}/>刷新
          </button>
          <button onClick={() => setOpen(false)} className="btn btn-secondary !min-h-[32px] !px-2"><X size={13}/></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {error && <div className="rounded-lg border border-error bg-error-soft px-3 py-2 text-xs text-error">{error}</div>}
          {!error && !projects.length && !loading && (
            <div className="py-12 text-center text-sm text-text-muted">暂无项目；新建项目后会自动出现在这里。</div>
          )}
          <div className="space-y-2">
            {projects.map(project => (
              <div key={project.id} className="flex items-center gap-3 rounded-xl border px-4 py-3"
                style={{ borderColor: project.id === currentProjectId ? 'var(--primary)' : 'var(--border)', background: 'var(--bg-2)' }}>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium" style={{ color: 'var(--text)' }}>{project.name}</span>
                    {project.id === currentProjectId && <span className="rounded-full bg-primary-light px-2 py-0.5 text-[9px] text-accent">当前项目</span>}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-text-muted">
                    <span className="font-mono">{project.sku}</span>
                    <span>{project.platform || '未设置平台'}</span>
                    <span>{project.style || '未设置风格'}</span>
                    {project.updatedAt && <span>更新 {new Date(project.updatedAt).toLocaleString()}</span>}
                  </div>
                </div>
                <button
                  onClick={() => void openProject(project.id)}
                  disabled={busy || project.id === currentProjectId}
                  className="btn btn-primary !min-h-[34px]">
                  打开
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}