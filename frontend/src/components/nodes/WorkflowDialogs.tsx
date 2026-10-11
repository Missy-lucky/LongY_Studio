import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, FolderDown, Save, X, XCircle } from 'lucide-react'
import { useNodeStore } from '../../stores/node-store'

export function ProviderConfirmDialog() {
  const confirm = useNodeStore(state => state.realGenerationConfirm)
  const cancel = useNodeStore(state => state.cancelRealGeneration)
  const submit = useNodeStore(state => state.confirmRealGeneration)
  const busy = useNodeStore(state => state.workflowBusy)
  if (!confirm) return null
  return (
    <div className="fixed inset-0 z-[240] flex items-center justify-center bg-black/65 p-6">
      <div className="w-[460px] rounded-2xl border p-5" style={{ background: 'var(--surface)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-lg)' }}>
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ background: 'rgba(245,158,11,0.12)' }}>
            <AlertTriangle size={16} className="text-warning"/>
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold">确认调用真实生图 Provider</div>
            <div className="mt-1 text-[11px] leading-5 text-text-secondary">
              将使用 <b>{confirm.providerName}</b> 提交 <b>{confirm.count}</b> 个图像编辑任务。真实生成会消耗 API 额度，并且受网络、模型服务和限额影响。
            </div>
            <div className="mt-2 font-mono text-[11px] text-warning">预估成本：{confirm.estimatedCost}（Provider 估价值）</div>
            <div className="mt-2 text-[10px] text-text-muted">Mock Provider 不扣费；如需继续测试请切回 Mock。</div>
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={cancel} className="btn btn-secondary">取消</button>
          <button onClick={() => void submit()} disabled={busy} className="btn btn-primary">确认并提交</button>
        </div>
      </div>
    </div>
  )
}

export function ExportPreviewCoverageDialog() {
  const preview = useNodeStore(state => state.exportPreview)
  const close = useNodeStore(state => state.closeExportPreview)
  const confirm = useNodeStore(state => state.confirmExportLocked)
  const busy = useNodeStore(state => state.workflowBusy)
  if (!preview) return null

  const groups = (['flat', 'partial', 'detail', 'model'] as const).map(type => ({
    type,
    label: { flat: '平面图', partial: '局部图', detail: '细节图', model: '模特图' }[type],
    items: preview.coverage.filter(item => item.type === type),
  })).filter(group => group.items.length > 0)

  return (
    <div className="fixed inset-0 z-[230] flex items-center justify-center bg-black/65 p-6">
      <div className="flex max-h-[80vh] w-[680px] flex-col rounded-2xl border" style={{ background: 'var(--surface)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-lg)' }}>
        <div className="flex items-center gap-3 border-b px-5 py-4" style={{ borderColor: 'var(--divider)' }}>
          <FolderDown size={16} className="text-accent" />
          <div className="flex-1">
            <div className="text-sm font-semibold">导出覆盖校验</div>
            <div className="mt-0.5 truncate text-[11px] text-text-secondary">{preview.exportDir}</div>
          </div>
          <button onClick={close} className="btn btn-secondary !px-2 !py-1.5"><X size={13} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {preview.coverageComplete ? (
            <div className="mb-3 flex items-center gap-2 rounded-lg border border-success/40 bg-success/10 px-3 py-2 text-[11px] text-success">
              <CheckCircle2 size={13} />必拍镜头覆盖完整：{preview.coverage.length} / {preview.coverage.length}
            </div>
          ) : (
            <div className="mb-3 rounded-lg border border-error/40 bg-error/10 p-3 text-[11px] text-error">
              <div className="flex items-center gap-2 font-medium"><XCircle size={13} />缺少必拍镜头，导出已被阻止</div>
              <div className="mt-1 leading-5">{preview.missingShotNames.join('、')}</div>
            </div>
          )}

          <div className="space-y-3">
            {groups.map(group => (
              <div key={group.type} className="overflow-hidden rounded-lg border" style={{ borderColor: 'var(--border)' }}>
                <div className="border-b px-3 py-2 text-[11px] font-semibold" style={{ borderColor: 'var(--divider)', color: 'var(--text)' }}>
                  {group.label} · {group.items.length} 个必拍镜头
                </div>
                {group.items.map(item => (
                  <div key={`${item.itemId}-${item.shotId}`} className="flex items-center gap-2 border-b px-3 py-2 text-[11px] last:border-b-0" style={{ borderColor: 'var(--divider)' }}>
                    {item.ready
                      ? <CheckCircle2 size={12} className="shrink-0 text-success" />
                      : <XCircle size={12} className="shrink-0 text-error" />}
                    <span className="flex-1 truncate">{item.shotName}</span>
                    <span className="text-text-muted">{item.itemName}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t px-5 py-3" style={{ borderColor: 'var(--divider)' }}>
          <button onClick={close} className="btn btn-secondary">关闭</button>
          <button onClick={() => void confirm()} disabled={busy || !preview.coverageComplete} className="btn btn-primary">
            导出 {preview.files.length} 张
          </button>
        </div>
      </div>
    </div>
  )
}

export function ExportResultDialog() {
  const result = useNodeStore(state => state.exportResult)
  const close = useNodeStore(state => state.closeExportResult)
  if (!result) return null
  return (
    <div className="fixed inset-0 z-[240] flex items-center justify-center bg-black/65 p-6">
      <div className="flex max-h-[80vh] w-[720px] flex-col rounded-2xl border" style={{ background: 'var(--surface)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-lg)' }}>
        <div className="flex items-center gap-3 border-b px-5 py-4" style={{ borderColor: 'var(--divider)' }}>
          <FolderDown size={16} className="text-accent"/>
          <div className="flex-1">
            <div className="text-sm font-semibold">导出完成</div>
            <div className="mt-0.5 max-w-[560px] truncate text-[11px] text-text-secondary">{result.targetDir}</div>
          </div>
          <button onClick={close} className="btn btn-secondary !px-2 !py-1.5"><X size={13}/></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <div className="mb-3 flex items-center gap-2 text-xs">
            <span className="flex items-center gap-1 text-success"><CheckCircle2 size={13}/>{result.exported} 张成功</span>
            <span className="text-text-muted">|</span>
            <span className="text-error">{result.failed.length} 张失败</span>
          </div>
          <div className="space-y-1.5">
            {result.files.map(file => (
              <div key={file.taskId || file.assetId || file.written} className="rounded-lg border px-3 py-2 text-[11px]" style={{ borderColor: 'var(--border)', background: 'var(--bg-2)' }}>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-text-secondary">{file.taskId || file.assetId}</span>
                  <span className="text-success">成功</span>
                </div>
                <div className="mt-1 truncate font-mono text-[10px] text-text-muted">{file.written}</div>
              </div>
            ))}
            {result.failed.map(file => (
              <div key={`${file.taskId || file.assetId || file.reason}-failed`} className="rounded-lg border px-3 py-2 text-[11px]" style={{ borderColor: 'var(--error)', background: 'rgba(239,68,68,0.06)' }}>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-text-secondary">{file.taskId || file.assetId}</span>
                  <span className="text-error">失败</span>
                </div>
                <div className="mt-1 text-[10px] text-text-muted">{file.reason}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="flex justify-end border-t px-5 py-3" style={{ borderColor: 'var(--divider)' }}>
          <button onClick={close} className="btn btn-primary">完成</button>
        </div>
      </div>
    </div>
  )
}


export function ProjectSettingsDialog() {
  const open = useNodeStore(state => state.projectSettingsOpen)
  const setOpen = useNodeStore(state => state.setProjectSettingsOpen)
  const project = useNodeStore(state => state.projectMeta)
  const draft = useNodeStore(state => state.draftProjectMeta)
  const save = useNodeStore(state => state.saveProjectMeta)
  const busy = useNodeStore(state => state.workflowBusy)
  const [form, setForm] = useState({
    sku: '', name: '节点工作台项目', platform: 'local', style: 'v2 final', budget: 100,
  })

  useEffect(() => {
    if (!open) return
    setForm({
      sku: project?.sku ?? draft.sku ?? '',
      name: project?.name ?? draft.name ?? '节点工作台项目',
      platform: project?.platform ?? draft.platform ?? 'local',
      style: project?.style ?? draft.style ?? 'v2 final',
      budget: project?.budget ?? draft.budget ?? 100,
    })
  }, [open, project, draft])

  if (!open) return null
  const field = 'w-full rounded-lg border bg-transparent px-2.5 py-1.5 text-[12px] outline-none'
  const fieldStyle = { borderColor: 'var(--border)', color: 'var(--text)' }

  return (
    <div className="fixed inset-0 z-[245] flex items-center justify-center bg-black/60 p-6">
      <div className="w-[520px] rounded-2xl border p-5" style={{ background: 'var(--surface)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-lg)' }}>
        <div className="flex items-start justify-between">
          <div>
            <div className="text-sm font-semibold">项目资料</div>
            <div className="mt-1 text-[11px] text-text-secondary">SKU 会参与导出命名；项目创建后仍可修改。</div>
          </div>
          <button onClick={() => setOpen(false)} className="btn btn-secondary !px-2 !py-1.5"><X size={13}/></button>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] text-text-secondary">SKU / 商品编号</span>
            <input value={form.sku} onChange={event => setForm({ ...form, sku: event.target.value })} placeholder="留空自动生成" className={field} style={fieldStyle}/>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] text-text-secondary">项目名称</span>
            <input value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} className={field} style={fieldStyle}/>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] text-text-secondary">平台</span>
            <input value={form.platform} onChange={event => setForm({ ...form, platform: event.target.value })} className={field} style={fieldStyle}/>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] text-text-secondary">目标风格</span>
            <input value={form.style} onChange={event => setForm({ ...form, style: event.target.value })} className={field} style={fieldStyle}/>
          </label>
          <label className="col-span-2 flex flex-col gap-1">
            <span className="text-[10px] text-text-secondary">预算上限</span>
            <input type="number" min={0} value={form.budget} onChange={event => setForm({ ...form, budget: Number(event.target.value) || 0 })} className={field} style={fieldStyle}/>
          </label>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={() => setOpen(false)} className="btn btn-secondary">取消</button>
          <button onClick={() => void save(form)} disabled={busy || !form.name.trim()} className="btn btn-primary">
            <Save size={13} strokeWidth={1.8}/>保存
          </button>
        </div>
      </div>
    </div>
  )
}

