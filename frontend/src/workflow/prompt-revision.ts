export const PROMPT_REJECT_REASONS = [
  { id: 'color', label: '颜色不准' },
  { id: 'shape', label: '形状错误' },
  { id: 'material', label: '材质不对' },
  { id: 'detail', label: '细节缺失' },
  { id: 'hands', label: '手部异常' },
  { id: 'pose', label: '姿态不自然' },
  { id: 'background', label: '背景干扰' },
  { id: 'composition', label: '构图问题' },
] as const

export type PromptRejectReasonId = typeof PROMPT_REJECT_REASONS[number]['id']

export type PromptReferenceMode = 'original' | 'generated'

export interface PromptRevisionInput {
  originalPrompt: string
  originalNegativePrompt?: string
  reasons: PromptRejectReasonId[]
  instruction: string
  referenceMode?: PromptReferenceMode
  useMask?: boolean
}

export interface ComposedPromptRevision {
  prompt: string
  negativePrompt: string
  changes: string[]
}

const REASON_RULES: Record<PromptRejectReasonId, { fix: string; avoid: string }> = {
  color: { fix: '严格保持商品原始颜色，不发生色偏', avoid: '颜色偏移、色差' },
  shape: { fix: '严格保持商品结构、轮廓和比例', avoid: '结构变形、比例错误' },
  material: { fix: '准确还原材质纹理和反光特性', avoid: '材质错误、纹理混乱' },
  detail: { fix: '补齐关键结构细节并保持边缘清晰', avoid: '细节丢失、边缘模糊' },
  hands: { fix: '生成自然、结构正确的手部', avoid: '手指数异常、手部畸形、遮挡商品' },
  pose: { fix: '保持自然稳定的人体姿态', avoid: '姿态扭曲、重心不稳' },
  background: { fix: '使用干净统一的背景', avoid: '杂乱背景、无关物体' },
  composition: { fix: '保持主体完整且居中构图合理', avoid: '主体裁切、构图失衡' },
}

/** Deterministically merge a natural-language correction into the last prompt.
 * This is intentionally local-first: API cost is only spent after the user confirms. */
export function composePromptRevision(input: PromptRevisionInput): ComposedPromptRevision {
  const reasons = PROMPT_REJECT_REASONS.filter(item => input.reasons.includes(item.id))
  const instruction = input.instruction.trim()
  const fixes = reasons.map(item => REASON_RULES[item.id].fix)
  const referenceMode = input.referenceMode ?? 'original'
  const useMask = Boolean(input.useMask && referenceMode === 'generated')
  const modeGuide = referenceMode === 'generated'
    ? useMask
      ? '生成基准：以第一张当前生成图作为编辑基础，并配合 PNG 蒙版执行局部重绘；只重绘蒙版透明区域，蒙版未覆盖的像素必须保持一致。后续参考图是原始商品与身份约束，禁止让商品结构漂移'
      : '生成基准：以第一张当前生成图作为编辑基础，只修改用户指定问题；未被要求修改的姿态、脸部、构图、光线、背景和商品主体必须保持稳定。后续参考图是原始商品与身份约束，禁止让商品结构漂移'
    : '生成基准：以原始商品参考图为准重新生成，严格保留商品结构、比例、颜色和材质，同时执行用户修正要求'
  const promptParts = [
    modeGuide,
    input.originalPrompt.trim(),
    instruction ? `用户修正：${instruction}` : '',
    fixes.length ? `必须修正：${fixes.join('；')}` : '',
  ].filter(Boolean)

  const avoids = reasons.map(item => REASON_RULES[item.id].avoid)
  const negativeParts = [
    input.originalNegativePrompt?.trim(),
    instruction ? '违背用户修正要求' : '',
    referenceMode === 'generated' ? (useMask ? '修改蒙版未覆盖的区域' : '改变未被要求修改的区域') : '',
    ...avoids,
  ].filter(Boolean)

  return {
    prompt: promptParts.join('。').replaceAll('。。', '。'),
    negativePrompt: Array.from(new Set(negativeParts)).join('，'),
    changes: [
      referenceMode === 'generated'
        ? useMask ? '按当前图 + 局部蒙版微调' : '按当前生成图微调'
        : '按原始商品图重画',
      instruction ? `按用户要求：${instruction}` : '',
      ...fixes,
    ].filter(Boolean),
  }
}

export function promptChanged(before: string, after: string): boolean {
  return before.trim().length > 0 && after.trim() !== before.trim()
}
