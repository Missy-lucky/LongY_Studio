import { X } from 'lucide-react'
import { useNodeStore } from '../../stores/node-store'
import type { ConsistencyQcCheck } from '../../services/api'

const reasonLabels: Record<string, string> = {
  face_not_detected: '未检测到面部',
  face_geometry_changed: '面部几何发生变化',
  face_appearance_changed: '面部外观发生变化',
  body_landmarks_not_detected: '未检测到身体关键点',
  body_proportion_changed: '身体比例发生变化',
  model_identity_score_below_threshold: '模特身份评分低于阈值',
  reference_missing: '缺少参考图',
  pixel_qc_failed: '像素质检未通过',
  garment_consistency_failed: '服装一致性未通过',
  model_identity_failed: '模特身份一致性未通过',
}

const issueLabels: Record<string, string> = {
  size: '尺寸',
  border: '白边',
  coverage: '主体覆盖率',
  bounds: '安全边界',
}

const metricLabels: Record<string, string> = {
  colorSimilarity: '颜色相似度',
  perceptualSimilarity: '感知相似度',
  structureSimilarity: '结构相似度',
  structureInliers: '结构内点数',
  faceGeometrySimilarity: '面部几何相似度',
  faceAppearanceSimilarity: '面部外观相似度',
  bodyProportionSimilarity: '身体比例相似度',
  referencePose: '参考图姿态',
  outputPose: '输出图姿态',
  legTorsoRatio: '腿长 / 躯干长',
  legShare: '腿部占比',
  shoulderHipRatio: '肩宽 / 臀宽',
  normalizedWidth: '归一化宽度',
  laplacianVariance: '清晰度方差',
  edgeDensity: '边缘密度',
  highFrequencyEnergy: '高频细节能量',
  sourceWidth: '输出宽度',
  sourceHeight: '输出高度',
  width: '宽度',
  height: '高度',
  borderWhite: '白边比例',
  foregroundCoverage: '主体覆盖率',
  foregroundBBox: '主体边界框',
  sizePassed: '尺寸检查',
  passed: '是否通过',
  issues: '未通过项',
  error: '错误信息',
}

const pipelineLabels: Record<string, string> = {
  'base-generation': '基础生成',
  'hd-detail-repair': '高清细节修复',
}

function localizeReason(reason: string) {
  return reasonLabels[reason] ?? reason.replaceAll('_', ' ')
}

function localizeIssue(value: string) {
  return issueLabels[value] ?? value
}

function metricLabel(key: string) {
  return metricLabels[key] ?? key
}

function isRatio(key: string, value: number) {
  return (
    /Similarity|Coverage|White|Energy|Share/i.test(key) &&
    value >= 0 &&
    value <= 1
  )
}

function percent(value: number | null | undefined) {
  if (value == null) return '未评分'
  return `${Math.round(value * 100)}%`
}

function formatValue(key: string, value: unknown): string {
  if (value == null) return '未记录'
  if (typeof value === 'boolean') return value ? '是' : '否'
  if (Array.isArray(value)) {
    if (!value.length) return '无'
    return value.map(item => {
      if (typeof item === 'string') return localizeIssue(item)
      if (typeof item === 'number') return String(item)
      return formatValue(key, item)
    }).join('、')
  }
  if (typeof value === 'number') {
    if (isRatio(key, value)) return percent(value)
    return Number.isInteger(value) ? String(value) : value.toFixed(4)
  }
  if (typeof value === 'string') {
    return reasonLabels[value] ?? issueLabels[value] ?? value
  }
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .map(([childKey, childValue]) => `${metricLabel(childKey)} ${formatValue(childKey, childValue)}`)
      .join('；')
  }
  return String(value)
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
        <div className="mt-1 text-[10px] text-text-muted">通过阈值：{percent(check.threshold)}</div>
      )}
      {reasons.length > 0 && (
        <div className="mt-2 space-y-1">
          {reasons.map(reason => (
            <div key={reason} className="rounded bg-warning/10 px-2 py-1 text-[10px] text-warning">
              {localizeReason(reason)}
            </div>
          ))}
        </div>
      )}
      <dl className="mt-2 grid grid-cols-2 gap-2 text-[10px]">
        {Object.entries(check)
          .filter(([key]) => !['score', 'passed', 'threshold', 'reasons'].includes(key))
          .map(([key, value]) => (
            <div key={key} className="flex min-w-0 flex-col">
              <dt className="truncate text-text-muted">{metricLabel(key)}</dt>
              <dd className="truncate" style={{ color: 'var(--text-2)' }}>{formatValue(key, value)}</dd>
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
  const pipeline = (report?.pipeline ?? ['base-generation'])
    .map(stage => pipelineLabels[stage] ?? stage)
    .join(' → ')

  return (
    <div className="fixed inset-0 z-[248] flex items-center justify-center bg-black/65 p-6">
      <div className="flex max-h-[82vh] w-[760px] flex-col overflow-hidden rounded-2xl border"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-lg)' }}>
        <div className="flex items-start gap-3 border-b px-5 py-4" style={{ borderColor: 'var(--divider)' }}>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">一致性质检报告</div>
            <div className="mt-1 truncate text-[11px] text-text-secondary">
              {state.taskCode} · {state.taskName} · 第 {state.version} 版
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
                  <div className="text-text-muted">版本档位</div>
                  <div className="mt-1 font-medium text-accent">{report.tier === 'hd' ? '高清修复版' : '草稿版'}</div>
                </div>
                <div className="rounded-lg border p-2" style={{ borderColor: 'var(--border)', background: 'var(--bg-2)' }}>
                  <div className="text-text-muted">生成管线</div>
                  <div className="mt-1 font-medium">{pipeline}</div>
                </div>
                <div className="rounded-lg border p-2" style={{ borderColor: 'var(--border)', background: 'var(--bg-2)' }}>
                  <div className="text-text-muted">执行策略</div>
                  <div className="mt-1 font-medium">{report.enforced === false ? '记录模式' : '强校验'}</div>
                </div>
              </div>

              {report.reasons.length > 0 && (
                <div className="rounded-xl border border-warning/40 bg-warning/10 p-3 text-[11px] text-warning">
                  {report.reasons.map(localizeReason).join('、')}
                </div>
              )}

              <CheckCard title="服装一致性" check={report.garment}/>
              <CheckCard title="模特身份与比例" check={report.model}/>

              <section className="rounded-xl border p-3" style={{ borderColor: 'var(--border)', background: 'var(--bg-2)' }}>
                <div className="text-xs font-semibold" style={{ color: 'var(--text)' }}>输出细节</div>
                <dl className="mt-2 grid grid-cols-3 gap-2 text-[10px]">
                  {Object.entries(report.detail ?? {}).map(([key, value]) => (
                    <div key={key} className="flex min-w-0 flex-col">
                      <dt className="truncate text-text-muted">{metricLabel(key)}</dt>
                      <dd className="truncate" style={{ color: 'var(--text-2)' }}>{formatValue(key, value)}</dd>
                    </div>
                  ))}
                </dl>
              </section>

              <section className="rounded-xl border p-3" style={{ borderColor: 'var(--border)', background: 'var(--bg-2)' }}>
                <div className="text-xs font-semibold" style={{ color: 'var(--text)' }}>像素质检</div>
                <dl className="mt-2 grid grid-cols-3 gap-2 text-[10px]">
                  {Object.entries(report.pixel ?? {}).map(([key, value]) => (
                    <div key={key} className="flex min-w-0 flex-col">
                      <dt className="truncate text-text-muted">{metricLabel(key)}</dt>
                      <dd className="truncate" style={{ color: 'var(--text-2)' }}>{formatValue(key, value)}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            </>
          ) : (
            <div className="py-10 text-center text-sm text-text-muted">该版本没有质检报告</div>
          )}
        </div>

        <div className="flex justify-end border-t px-5 py-3" style={{ borderColor: 'var(--divider)' }}>
          <button onClick={close} className="btn btn-primary">关闭</button>
        </div>
      </div>
    </div>
  )
}
