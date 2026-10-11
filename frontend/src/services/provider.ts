import type { GenerateStage, TaskTier } from '../types/domain'

export interface GenerateRequest {
  taskId: string
  tier: TaskTier
  prompt: string
  negativePrompt: string
  seed: number
}

export interface GenerateHandlers {
  onStage: (stage: GenerateStage, message: string) => void
  onComplete: (result: { thumbnailSeed: string; cost: number; durationMs: number }) => void
  onError: (error: { code: string; message: string; suggestion: string }) => void
}

/** Provider 统一接口 —— 真实生图 API（后续：ComfyUI / 云端 API）按此适配 */
export interface ImageProvider {
  id: string
  name: string
  readonly supportedTiers: readonly TaskTier[]
  readonly pricePerImage: Readonly<Record<TaskTier, number>>
  estimate(tier: TaskTier, count: number): number
  generate(req: GenerateRequest, handlers: GenerateHandlers): { cancel(): void }
}

