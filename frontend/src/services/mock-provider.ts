import type { GenerateRequest, GenerateHandlers, ImageProvider } from './provider'
import type { TaskTier } from '../types/domain'

/**
 * 假 Provider：模拟 排队→上传→提交→服务端→下载→写入 与随机失败。
 * 不消耗任何真实 API，用于 v0.1 原型闭环验证（需求 17.1）。
 */
class MockProvider implements ImageProvider {
  id = 'mock'
  name = 'Mock 生图引擎'
  readonly supportedTiers: readonly TaskTier[] = ['draft', 'hd']
  readonly pricePerImage: Readonly<Record<'draft' | 'hd', number>> = { draft: 1, hd: 4 }

  estimate(tier: 'draft' | 'hd', count: number): number {
    return this.pricePerImage[tier] * count
  }

  generate(req: GenerateRequest, h: GenerateHandlers) {
    let cancelled = false
    const timers: ReturnType<typeof setTimeout>[] = []
    const stages: Array<[Parameters<typeof h.onStage>[0], string, number]> = [
      ['upload', '正在上传参考图', 500],
      ['submit', '正在组装提示词', 600],
      ['server', '服务端生成中', 1400 + Math.random() * 1600],
      ['download', '正在下载结果', 700],
      ['write', '写入本地', 400],
    ]
    let elapsed = 0
    let i = 0
    const step = () => {
      if (cancelled) return
      if (i < stages.length) {
        const [stage, msg, dur] = stages[i]
        elapsed += dur
        h.onStage(stage, msg)
        timers.push(setTimeout(step, dur))
        i++
      } else {
        // ~15% 概率模拟失败，覆盖异常反馈路径
        if (Math.random() < 0.15) {
          const errors = [
            { code: 'PROVIDER_TIMEOUT', message: '生成超时：服务端长时间未返回', suggestion: '重试 / 换 Provider' },
            { code: 'RATE_LIMIT', message: '请求过于频繁，已暂停部分任务', suggestion: '稍后重试 / 降低并发' },
            { code: 'DOWNLOAD_FAILED', message: '图片下载失败；生成结果可能已存在', suggestion: '重新下载，不重新扣费' },
          ]
          h.onError(errors[Math.floor(Math.random() * errors.length)])
        } else {
          h.onComplete({
            thumbnailSeed: `${req.taskId}-${Date.now()}`,
            cost: this.pricePerImage[req.tier],
            durationMs: elapsed,
          })
        }
      }
    }
    timers.push(setTimeout(step, 300))
    return {
      cancel() {
        cancelled = true
        timers.forEach(clearTimeout)
      },
    }
  }
}

export const mockProvider = new MockProvider()

/** Provider 注册表 —— 后续接入真实 API 时在此注册，任务级路由可扩展 */
export const providerRegistry: Record<string, ImageProvider> = {
  [mockProvider.id]: mockProvider,
}

export function resolveProvider(id: string): ImageProvider {
  return providerRegistry[id] ?? mockProvider
}


