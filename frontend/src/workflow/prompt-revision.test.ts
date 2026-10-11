import { describe, expect, it } from 'vitest'
import { composePromptRevision, promptChanged } from './prompt-revision'

describe('composePromptRevision', () => {
  it('merges user correction and structured reasons into a complete prompt', () => {
    const result = composePromptRevision({
      originalPrompt: '白色衬衣电商图',
      originalNegativePrompt: '低清',
      reasons: ['color', 'hands'],
      instruction: '袖口改成米白色，手不要遮住腰带',
    })

    expect(result.prompt).toContain('白色衬衣电商图')
    expect(result.prompt).toContain('袖口改成米白色，手不要遮住腰带')
    expect(result.prompt).toContain('严格保持商品原始颜色')
    expect(result.negativePrompt).toContain('手部畸形')
  })

  it('uses the generated image as an edit base while preserving original constraints', () => {
    const result = composePromptRevision({
      originalPrompt: '白色衬衣电商图',
      reasons: ['hands'],
      instruction: '只修正手部，袖口保持不变',
      referenceMode: 'generated',
    })

    expect(result.prompt).toContain('以第一张当前生成图作为编辑基础')
    expect(result.prompt).toContain('只修改用户指定问题')
    expect(result.negativePrompt).toContain('改变未被要求修改的区域')
    expect(result.changes[0]).toBe('按当前生成图微调')
  })

  it('adds strict regional constraints when a mask is enabled', () => {
    const result = composePromptRevision({
      originalPrompt: '白色衬衣电商图',
      reasons: ['hands'],
      instruction: '只修正手部',
      referenceMode: 'generated',
      useMask: true,
    })
    expect(result.prompt).toContain('只重绘蒙版透明区域')
    expect(result.prompt).toContain('蒙版未覆盖的像素必须保持一致')
    expect(result.negativePrompt).toContain('修改蒙版未覆盖的区域')
  })

  it('detects an unchanged prompt so the UI can block wasteful calls', () => {
    expect(promptChanged('same', ' same ')).toBe(false)
    expect(promptChanged('same', 'changed')).toBe(true)
  })
})
