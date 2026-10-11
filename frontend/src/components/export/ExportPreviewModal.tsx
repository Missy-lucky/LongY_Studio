import clsx from 'clsx'
import { AlertTriangle, FileCheck2, FolderDown, FolderTree } from 'lucide-react'
import { useWorkbench } from '../../stores/workbench-store'
import { Modal } from '../common/Modal'

export function ExportPreviewModal() {
  const open = useWorkbench(s => s.exportOpen)
  const done = useWorkbench(s => s.exportDone)
  const close = useWorkbench(s => s.closeExport)
  const files = useWorkbench(s => s.exportFiles)
  const doExport = useWorkbench(s => s.doExport)
  const generateHd = useWorkbench(s => s.generateHdForLocked)
  const tasks = useWorkbench(s => s.tasks)
  const project = useWorkbench(s => s.project)

  if (!open) return null
  const conflicts = files.filter(f => f.conflict)
  const folders = [...new Set(files.map(f => f.folder))]

  return (
    <Modal
      title="导出预览"
      subtitle={`将导出 ${files.length} 张锁定图片到 ${project?.sku}_秋季针织套装；导出只允许锁定版本`}
      onClose={close}
      width="max-w-2xl"
      footer={
        <>
          <button onClick={generateHd} disabled={done || !tasks.some(t => t.status === 'locked' && t.tier === 'draft')}
            className="rounded-md border border-ai/50 px-3 py-1.5 text-[11px] text-ai hover:bg-ai/10 disabled:opacity-40">
            先生成高清成品
          </button>
          <button onClick={close} className="rounded-md border border-border-subtle px-3 py-1.5 text-[11px] text-text-secondary">关闭</button>
          <button onClick={doExport} disabled={done || files.length === 0}
            className="flex items-center gap-1.5 rounded-md bg-success px-4 py-1.5 text-[11px] font-medium text-white hover:bg-success/85 disabled:opacity-40">
            {done ? <><FileCheck2 size={12} />已导出</> : <><FolderDown size={12} />导出 {files.length} 张</>}
          </button>
        </>
      }
    >
      {tasks.some(t => t.status === 'locked' && t.tier === 'draft') && (
        <div className="mb-3 flex items-start gap-2 rounded-md border border-ai/40 bg-ai-soft p-2.5 text-[11px] leading-4">
          <AlertTriangle size={13} className="mt-0.5 shrink-0 text-ai" />
          <span>存在锁定但尚未生成高清的草稿版本。导出前建议先生成高清成品；同一草稿的多个高清候选会明确展示成本。</span>
        </div>
      )}
      {conflicts.length > 0 && (
        <div className="mb-3 flex items-start gap-2 rounded-md border border-warning/40 bg-warning-soft p-2.5 text-[11px] leading-4">
          <AlertTriangle size={13} className="mt-0.5 shrink-0 text-warning" />
          <span>检测到 {conflicts.length} 个重名文件，将自动追加序号，不会覆盖；映射会写入导出报告。</span>
        </div>
      )}
      <div className="overflow-hidden rounded-lg border border-border-subtle">
        <div className="flex items-center gap-2 border-b border-border-subtle bg-bg-app/60 px-3 py-2 text-[11px] font-medium">
          <FolderTree size={13} className="text-success" />
          {project?.sku}_套图 / {folders.length} 个商品文件夹 · {files.length} 个文件
        </div>
        <div className="max-h-[46vh] overflow-y-auto">
          {folders.map(folder => (
            <div key={folder}>
              <div className="border-b border-border-subtle/50 bg-bg-app/30 px-3 py-1.5 font-mono text-[10px] text-text-secondary">📁 {folder}/</div>
              {files.filter(f => f.folder === folder).map(f => (
                <div key={f.id} className="flex items-center gap-2 border-b border-border-subtle/30 px-6 py-1.5 text-[11px]">
                  <span className="flex-1 truncate">{f.fileName}</span>
                  <span className="font-mono text-[9px] text-text-muted">v{f.version}</span>
                  {f.conflict && <span className="rounded bg-warning/15 px-1 text-[9px] text-warning">重名→追加序号</span>}
                  <span className="font-mono text-[9px] text-success">JPG</span>
                </div>
              ))}
            </div>
          ))}
          {files.length === 0 && (
            <div className="p-6 text-center text-[11px] text-text-muted">没有可导出的锁定版本。进入审核模式接受并锁定图片后再导出。</div>
          )}
        </div>
      </div>
      {done && (
        <div className="mt-3 flex items-center gap-2 rounded-md border border-success/40 bg-success-soft p-2.5 text-[11px] text-success">
          <FileCheck2 size={13} />导出完成：{files.length} 张成功，0 张失败；已打开文件夹（演示环境为模拟行为）
        </div>
      )}
    </Modal>
  )
}
