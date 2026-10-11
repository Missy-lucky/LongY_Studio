import type { RejectReason, TaskStatus, TaskType, GenerateStage } from '../types/domain'

export const STATUS_META: Record<TaskStatus, { label: string; color: string; soft: string; dot: string }> = {
  unconfirmed: { label: '待确认', color: 'text-text-secondary', soft: 'bg-white/5 border-border-subtle', dot: '#64748B' },
  planned:     { label: '已规划', color: 'text-accent',         soft: 'bg-accent-soft border-accent/40',   dot: '#3B82F6' },
  cached:      { label: '缓存命中', color: 'text-cache',        soft: 'bg-cache-soft border-cache/40',     dot: '#06B6D4' },
  queued:      { label: '排队中', color: 'text-warning',        soft: 'bg-warning-soft border-warning/40', dot: '#F59E0B' },
  generating:  { label: '生成中', color: 'text-cache',          soft: 'bg-cache-soft border-cache/60',     dot: '#06B6D4' },
  review:      { label: '待审核', color: 'text-review',         soft: 'bg-ai-soft border-ai/50',           dot: '#A855F7' },
  accepted:    { label: '已满意', color: 'text-success',        soft: 'bg-success-soft border-success/40', dot: '#22C55E' },
  rejected:    { label: '已拒绝', color: 'text-error',          soft: 'bg-error-soft border-error/40',     dot: '#EF4444' },
  failed:      { label: '失败',   color: 'text-error',          soft: 'bg-error-soft border-error/50',     dot: '#EF4444' },
  locked:      { label: '已锁定', color: 'text-success',        soft: 'bg-success-soft border-success/60', dot: '#22C55E' },
  exported:    { label: '已导出', color: 'text-success',        soft: 'bg-success-soft border-success/70', dot: '#22C55E' },
}

export const STATUS_ORDER: TaskStatus[] = ['unconfirmed','planned','cached','queued','generating','review','accepted','rejected','failed','locked','exported']

export const TYPE_META: Record<TaskType, { label: string; icon: string }> = {
  flat:    { label: '平面图', icon: '▦' },
  detail:  { label: '细节图', icon: '◉' },
  partial: { label: '局部图', icon: '◫' },
  model:   { label: '模特图', icon: '☺' },
}

export const STAGE_LABEL: Record<GenerateStage, string> = {
  upload: '正在上传参考图',
  submit: '正在组装提示词',
  server: '服务端生成中',
  download: '正在下载结果',
  write: '写入本地',
}

export const REASON_META: Record<RejectReason, { label: string; hint: string }> = {
  structure:   { label: '结构变形', hint: '加强参考图权重，严格保留结构、比例、图案、LOGO' },
  color:       { label: '颜色不准', hint: '修正颜色描述，增加白平衡和真实还原要求' },
  background:  { label: '背景不净', hint: '切换纯色/白底规范，增强背景清理约束' },
  composition: { label: '构图不对', hint: '调整相机、裁切、留白、朝向模板' },
  detail:      { label: '细节不清', hint: '提高清晰度、局部裁切、微距描述' },
  model:       { label: '模特不像', hint: '更换模特参考或提高身份一致性参数' },
  consistency: { label: '商品不一致', hint: '强化商品 ID 绑定和参考图集合' },
  style:       { label: '风格不喜欢', hint: '切换规范模板或风格预设' },
}

export function fmtCost(n: number): string {
  return n % 1 === 0 ? String(n) : n.toFixed(2)
}

export function fmtTime(ts: number): string {
  const d = new Date(ts)
  const p = (x: number) => String(x).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}
