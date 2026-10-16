import { useEffect, useState } from 'react'
import { Activity, CheckCircle2, KeyRound, Loader2, Save, X } from 'lucide-react'
import { api, type ProviderDiagnostic, type ProviderSettings } from '../../services/api'
import { useNodeStore } from '../../stores/node-store'

const LABELS: Record<ProviderSettings['id'], string> = {
  openai: 'OpenAI Images API',
  'volcengine-ark': '豆包 Seedream（火山方舟）',
  'openrouter-icu': 'OpenRouter ICU',
  comfyui: '本地 ComfyUI',
}

export function ProviderSettingsDialog() {
  const open = useNodeStore(state => state.providerSettingsOpen)
  const setOpen = useNodeStore(state => state.setProviderSettingsOpen)
  const refreshProviders = useNodeStore(state => state.refreshProviders)
  const [providers, setProviders] = useState<ProviderSettings[]>([])
  const [selectedId, setSelectedId] = useState<ProviderSettings['id']>('openai')
  const [form, setForm] = useState<Record<string, string>>({})
  const [apiKey, setApiKey] = useState('')
  const [clearKey, setClearKey] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [diagnostic, setDiagnostic] = useState<ProviderDiagnostic | null>(null)

  const selected = providers.find(provider => provider.id === selectedId)
  useEffect(() => {
    if (!open) return
    setBusy(true)
    api.getProviderSettings()
      .then(result => setProviders(result.providers))
      .catch(error => setMessage(error instanceof Error ? error.message : '读取 Provider 设置失败'))
      .finally(() => setBusy(false))
  }, [open])

  useEffect(() => {
    if (!selected) return
    setForm({
      model: selected.model ?? '',
      visionModel: selected.visionModel ?? '',
      baseUrl: selected.baseUrl ?? '',
      workflowPath: selected.workflowPath ?? '',
      cliPath: selected.cliPath ?? '',
      maxBatchImages: String(selected.maxBatchImages ?? 4),
      maxEstimatedCostPerBatch: String(selected.maxEstimatedCostPerBatch ?? 0),
      pricePerImageDraft: String(selected.pricePerImageDraft ?? 0),
      pricePerImageHd: String(selected.pricePerImageHd ?? 0),
    })
    setApiKey('')
    setClearKey(false)
    setMessage('')
    setDiagnostic(null)
  }, [selected])

  if (!open) return null
  const save = async (runDiagnostic = false) => {
    setBusy(true)
    setMessage('')
    setDiagnostic(null)
    try {
      const limits = {
        maxBatchImages: Number(form.maxBatchImages || 4),
        maxEstimatedCostPerBatch: Number(form.maxEstimatedCostPerBatch || 0),
        pricePerImageDraft: Number(form.pricePerImageDraft || 0),
        pricePerImageHd: Number(form.pricePerImageHd || 0),
      }
      const payload = selectedId === 'openai' || selectedId === 'volcengine-ark'
        ? { model: form.model, visionModel: form.visionModel, baseUrl: form.baseUrl, apiKey: apiKey || undefined, clearApiKey: clearKey, ...limits }
        : selectedId === 'openrouter-icu'
          ? { model: form.model, baseUrl: form.baseUrl, cliPath: form.cliPath, apiKey: apiKey || undefined, clearApiKey: clearKey, ...limits }
          : { baseUrl: form.baseUrl, workflowPath: form.workflowPath, ...limits }
      const result = await api.saveProviderSettings(selectedId, payload)
      setProviders(current => current.map(provider => provider.id === selectedId ? result.provider : provider))
      setApiKey('')
      setClearKey(false)
      await refreshProviders()
      if (runDiagnostic) {
        const checked = await api.diagnoseProvider(selectedId)
        setDiagnostic(checked.diagnostic)
        setMessage(checked.diagnostic.message)
      } else {
        setMessage('设置已安全保存')
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '保存失败')
    } finally {
      setBusy(false)
    }
  }

  const field = 'input mt-1 w-full !min-h-[36px]'
  return (
    <div className="fixed inset-0 z-[260] flex items-center justify-center bg-black/60 p-6"
      onMouseDown={() => { if (!busy) setOpen(false) }}>
      <div className="flex max-h-[82vh] w-[760px] overflow-hidden rounded-2xl border"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-lg)' }}
        onMouseDown={event => event.stopPropagation()}>
        <aside className="w-[230px] border-r p-3" style={{ borderColor: 'var(--divider)', background: 'var(--bg-2)' }}>
          <div className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>生图 Provider</div>
          {providers.map(provider => (
            <button key={provider.id} className="mb-1 flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-xs"
              style={{
                background: provider.id === selectedId ? 'var(--surface)' : 'transparent',
                color: 'var(--text)',
              }} onClick={() => setSelectedId(provider.id)}>
              <span className="h-2 w-2 rounded-full" style={{ background: provider.available ? 'var(--success)' : 'var(--text-3)' }}/>
              <span className="min-w-0 flex-1 truncate">{LABELS[provider.id]}</span>
            </button>
          ))}
        </aside>

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: 'var(--divider)' }}>
            <div>
              <div className="text-sm font-semibold">{LABELS[selectedId]}</div>
              <div className="mt-1 text-[10px]" style={{ color: 'var(--text-3)' }}>
                API Key 存入 Windows 凭据管理器，不写入项目文件或日志。
              </div>
            </div>
            <button className="btn btn-secondary !p-2" disabled={busy} onClick={() => setOpen(false)}><X size={14}/></button>
          </div>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
            {selectedId !== 'comfyui' && (
              <label className="block text-[11px]" style={{ color: 'var(--text-2)' }}>
                API Key
                <div className="relative">
                  <KeyRound className="absolute left-2.5 top-3" size={13} style={{ color: 'var(--text-3)' }}/>
                  <input className={`${field} !pl-8`} type="password" value={apiKey}
                    placeholder={selected?.apiKeyConfigured ? '已配置；留空保持不变' : '输入用户自己的 API Key'}
                    onChange={event => { setApiKey(event.target.value); setClearKey(false) }}/>
                </div>
                {selected?.apiKeyConfigured && (
                  <label className="mt-2 flex items-center gap-2 text-[10px]" style={{ color: 'var(--text-3)' }}>
                    <input type="checkbox" checked={clearKey} onChange={event => setClearKey(event.target.checked)}/>
                    删除已保存的 API Key
                  </label>
                )}
                {selected?.apiKeySource === 'environment' && (
                  <span className="mt-2 block text-[10px] leading-4" style={{ color: 'var(--warning)' }}>
                    当前实际使用环境变量中的密钥；删除凭据管理器密钥不会覆盖环境变量。
                  </span>
                )}
              </label>
            )}

            {(selectedId === 'openai' || selectedId === 'volcengine-ark') && (
              <>
                <label className="block text-[11px]" style={{ color: 'var(--text-2)' }}>
                  模型 ID
                  <input className={field} value={form.model ?? ''} onChange={event => setForm(current => ({ ...current, model: event.target.value }))}/>
                </label>
                <label className="block text-[11px]" style={{ color: 'var(--text-2)' }}>
                  视觉识别模型 ID（水洗标预填）
                  <input className={field} value={form.visionModel ?? ''} onChange={event => setForm(current => ({ ...current, visionModel: event.target.value }))}/>
                </label>
                <label className="block text-[11px]" style={{ color: 'var(--text-2)' }}>
                  API 根地址
                  <input className={field} value={form.baseUrl ?? ''} onChange={event => setForm(current => ({ ...current, baseUrl: event.target.value }))}/>
                </label>
              </>
            )}
            {selectedId === 'openrouter-icu' && (
              <>
                <label className="block text-[11px]" style={{ color: 'var(--text-2)' }}>模型 ID
                  <input className={field} value={form.model ?? ''} onChange={event => setForm(current => ({ ...current, model: event.target.value }))}/>
                </label>
                <label className="block text-[11px]" style={{ color: 'var(--text-2)' }}>API 根地址
                  <input className={field} value={form.baseUrl ?? ''} onChange={event => setForm(current => ({ ...current, baseUrl: event.target.value }))}/>
                </label>
                <label className="block text-[11px]" style={{ color: 'var(--text-2)' }}>ICU CLI 路径
                  <input className={field} value={form.cliPath ?? ''} onChange={event => setForm(current => ({ ...current, cliPath: event.target.value }))}/>
                </label>
              </>
            )}

            <div className="grid grid-cols-2 gap-3">
              <label className="block text-[11px]" style={{ color: 'var(--text-2)' }}>单批图片上限
                <input className={field} type="number" min="1" max="100" value={form.maxBatchImages ?? '4'} onChange={event => setForm(current => ({ ...current, maxBatchImages: event.target.value }))}/>
              </label>
              <label className="block text-[11px]" style={{ color: 'var(--text-2)' }}>单批预估费用上限（0 不限制）
                <input className={field} type="number" min="0" step="0.01" value={form.maxEstimatedCostPerBatch ?? '0'} onChange={event => setForm(current => ({ ...current, maxEstimatedCostPerBatch: event.target.value }))}/>
              </label>
              <label className="block text-[11px]" style={{ color: 'var(--text-2)' }}>草稿单张估价
                <input className={field} type="number" min="0" step="0.01" value={form.pricePerImageDraft ?? '0'} onChange={event => setForm(current => ({ ...current, pricePerImageDraft: event.target.value }))}/>
              </label>
              <label className="block text-[11px]" style={{ color: 'var(--text-2)' }}>高清单张估价
                <input className={field} type="number" min="0" step="0.01" value={form.pricePerImageHd ?? '0'} onChange={event => setForm(current => ({ ...current, pricePerImageHd: event.target.value }))}/>
              </label>
            </div>
            {selected?.capabilities && (
              <div className="rounded-lg border px-3 py-2 text-[10px] leading-5" style={{ borderColor: 'var(--border)', color: 'var(--text-3)' }}>
                能力：文生图 · {selected.capabilities.imageEdit === true ? '多图编辑' : selected.capabilities.imageEdit === 'workflow' ? '编辑能力由工作流决定' : '不支持编辑'} · {selected.capabilities.maskEdit === true ? '蒙版重绘' : selected.capabilities.maskEdit === 'workflow' ? '蒙版能力由工作流决定' : '不支持蒙版'} · 参考图上限 {String(selected.capabilities.maxReferenceImages)} · {selected.capabilities.local ? '本地' : '云端'}
              </div>
            )}
            {selectedId === 'comfyui' && (
              <>
                <label className="block text-[11px]" style={{ color: 'var(--text-2)' }}>
                  本地服务地址
                  <input className={field} value={form.baseUrl ?? ''} onChange={event => setForm(current => ({ ...current, baseUrl: event.target.value }))}/>
                </label>
                <label className="block text-[11px]" style={{ color: 'var(--text-2)' }}>
                  API 工作流 JSON 绝对路径
                  <input className={field} value={form.workflowPath ?? ''} onChange={event => setForm(current => ({ ...current, workflowPath: event.target.value }))}/>
                  <span className="mt-1 block text-[10px] leading-4" style={{ color: 'var(--text-3)' }}>
                    模板可使用 {'{{PROMPT}}'}、{'{{NEGATIVE_PROMPT}}'}、{'{{SEED}}'}、{'{{WIDTH}}'}、{'{{HEIGHT}}'}、{'{{REFERENCE_1}}'} 与 {'{{MASK}}'} 占位符。
                  </span>
                </label>
              </>
            )}

            <div className="rounded-lg border px-3 py-2 text-[10px] leading-4" style={{ borderColor: 'var(--border)', color: 'var(--text-3)' }}>
              OpenAI 与火山方舟会产生真实 API 费用；界面不把未知或实时变化的官方价格伪装成本地精确估价。ComfyUI 只连接本机 HTTP 服务，不会显式唤醒其界面。
            </div>
            {diagnostic && (
              <div className="rounded-lg border p-3" style={{
                borderColor: diagnostic.status === 'error' ? 'var(--error)' : diagnostic.status === 'warning' ? 'var(--warning)' : 'var(--success)',
              }}>
                <div className="mb-2 flex items-center justify-between gap-2 text-[11px] font-medium">
                  <span>{diagnostic.status === 'ready' ? '诊断通过' : diagnostic.status === 'warning' ? '诊断有提醒' : '诊断失败'}</span>
                  <span className="text-[9px]" style={{ color: 'var(--text-3)' }}>未发起图片生成 · 不消耗图片额度</span>
                </div>
                <div className="space-y-1.5">
                  {diagnostic.checks.map(check => (
                    <div key={check.id} className="flex items-start gap-2 text-[10px] leading-4">
                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full" style={{
                        background: check.status === 'pass' ? 'var(--success)' : check.status === 'warn' ? 'var(--warning)' : 'var(--error)',
                      }}/>
                      <span className="w-20 shrink-0" style={{ color: 'var(--text-2)' }}>{check.label}</span>
                      <span className="min-w-0 break-all" style={{ color: 'var(--text-3)' }}>{check.message}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {message && (
              <div className="flex items-center gap-2 text-xs" style={{
                color: diagnostic?.status === 'error' || message.includes('失败')
                  ? 'var(--error)'
                  : diagnostic?.status === 'warning' ? 'var(--warning)' : 'var(--success)',
              }}>
                <CheckCircle2 size={13}/>{message}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 border-t px-5 py-3" style={{ borderColor: 'var(--divider)' }}>
            <button className="btn btn-secondary" disabled={busy} onClick={() => setOpen(false)}>关闭</button>
            <button className="btn btn-secondary" disabled={busy} onClick={() => void save(true)}>
              {busy ? <Loader2 size={13} className="anim-spin"/> : <Activity size={13}/>}保存并诊断
            </button>
            <button className="btn btn-primary" disabled={busy} onClick={() => void save(false)}>
              {busy ? <Loader2 size={13} className="anim-spin"/> : <Save size={13}/>}保存设置
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
