import { X } from 'lucide-react'
import { useNodeStore } from '../../stores/node-store'
import type { ConsistencyQcCheck } from '../../services/api'

function percent(value: number | null | undefined) {
  if (value == null) return '—'
  return `${Math.round(value * 100)}`
}

function CheckCard({ title, check }: { title: string; check?: ConsistencyQcCheck }) {
  if (!check) return null
  const reasons = check.reasons ?? []
  return (
    <section className="rounded-xl border p-3" style={{ borderColor: 'var(--border)', background: 'var(--bg-2)' }}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-semibold" style={{ color: 'var(--text)' }}>{title}</span>
        <span className={check.passed ? 'text-success' : 'text-warning'}>
          {check.passed ? '通过' : '未通过'} · {percent(check.score)}
        </span>
      </div>
      {check.threshold != null && (
        <div className="mt-1 font-mono text-[10px] text-text-muted">threshold {percent(check.threshold)}</div>
      )}
      {reasons.length > 0 && (
        <div className="mt-2 space-y-1">
          {reasons.map(reason => (
            <div key={reason} className="rounded bg-warning/10 px-2 py-1 text-[10px] text-warning">{reason}</div>
          ))}
        </div>
      )}
      <dl className="mt-2 grid grid-cols-2 gap-2 text-[10px]">
        {Object.entries(check)
          .filter(([key]) => !['score', 'passed', 'threshold', 'reasons'].includes(key))
          .map(([key, value]) => (
            <div key={key} className="flex min-w-0 flex-col">
              <dt className="truncate text-text-muted">{key}</dt>
              <dd className="truncate font-mono" style={{ color: 'var(--text-2)' }}>{String(value)}</dd>
            </div>
          ))}
      </dl>
    </section>
  )
}

export function VersionQcDialog() {
  const state = useNodeStore(nodeState => nodeState.versionQc)
  const close = useNodeStore(nodeState => nodeState.closeVersionQc)
  if (!state) return null
  const report = state.report

  return (
    <div className="fixed inset-0 z-[248] flex items-center justify-center bg-black/65 p-6">
      <div className="flex max-h-[82vh] w-[760px] flex-col overflow-hidden rounded-2xl border"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-lg)' }}>
        <div className="flex items-start gap-3 border-b px-5 py-4" style={{ borderColor: 'var(--divider)' }}>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">一致性 QC 报告</div>
            <div className="mt-1 truncate text-[11px] text-text-secondary">
              {state.taskCode} · {state.taskName} · v{state.version}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className={state.passed ? 'text-success' : 'text-warning'}>
              {state.passed ? '通过' : '未通过'} · {percent(state.score ?? report?.score)}
            </span>
            <button onClick={close} className="btn btn-secondary !min-h-[32px] !px-2"><X size={13}/></button>
          </div>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {report ? (
            <>
              <div className="grid grid-cols-3 gap-2 text-[11px]">
                <div className="rounded-lg border p-2" style={{ borderColor: 'var(--border)', background: 'var(--bg-2)' }}>
                  <div className="text-text-muted">档位</div>
                  <div className="mt-1 font-medium text-accent">{report.tier === 'hd' ? 'HD Repair' : 'Draft'}</div>
                </div>
                <div className="rounded-lg border p-2" style={{ borderColor: 'var(--border)', background: 'var(--bg-2)' }}>
                  <div className="text-text-muted">管线</div>
                  <div className="mt-1 font-medium">{report.pipeline?.join(' → ') ?? 'base-generation'}</div>
                </div>
                <div className="rounded-lg border p-2" style={{ borderColor: 'var(--border)', background: 'var(--bg-2)' }}>
                  <div className="text-text-muted">执行策略</div>
                  <div className="mt-1 font-medium">{report.enforced === false ? '记录模式' : '强校验'}</div>
                </div>
              </div>

              {report.reasons.length > 0 && (
                <div className="rounded-xl border border-warning/40 bg-warning/10 p-3 text-[11px] text-warning">
                  {report.reasons.join('、')}
                </div>
              )}

              <CheckCard title="服装一致性" check={report.garment}/>
              <CheckCard title="模特身份与比例" check={report.model}/>

              <section className="rounded-xl border p-3" style={{ borderColor: 'var(--border)', background: 'var(--bg-2)' }}>
                <div className="text-xs font-semibold" style={{ color: 'var(--text)' }}>输出细节</div>
                <dl className="mt-2 grid grid-cols-3 gap-2 text-[10px]">
                  {Object.entries(report.detail ?? {}).map(([key, value]) => (
                    <div key={key} className="flex min-w-0 flex-col">
                      <dt className="truncate text-text-muted">{key}</dt>
                      <dd className="truncate font-mono" style={{ color: 'var(--text-2)' }}>{String(value)}</dd>
                    </div>
                  ))}
                </dl>
              </section>

              <section className="rounded-xl border p-3" style={{ borderColor: 'var(--border)', background: 'var(--bg-2)' }}>
                <div className="text-xs font-semibold" style={{ color: 'var(--text)' }}>像素 QC</div>
                <dl className="mt-2 grid grid-cols-3 gap-2 text-[10px]">
                  {Object.entries(report.pixel ?? {}).map(([key, value]) => (
                    <div key={key} className="flex min-w-0 flex-col">
                      <dt className="truncate text-text-muted">{key}</dt>
                      <dd className="truncate font-mono" style={{ color: 'var(--text-2)' }}>{String(value)}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            </>
          ) : (
            <div className="py-10 text-center text-sm text-text-muted">该版本没有 QC 报告</div>
          )}
        </div>

        <div className="flex justify-end border-t px-5 py-3" style={{ borderColor: 'var(--divider)' }}>
          <button onClick={close} className="btn btn-primary">关闭</button>
        </div>
      </div>
    </div>
  )
}
