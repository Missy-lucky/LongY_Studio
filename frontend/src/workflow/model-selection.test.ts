import { describe, expect, it } from 'vitest'
import type { FlowModelNode, FlowProcessingNode } from '../types/node-system'
import { applyModelSelection, modelReferenceUrl } from './model-selection'

const modelNode: FlowModelNode = {
  id: 'model',
  type: 'model',
  position: { x: 40, y: 40 },
  collapsed: false,
  data: {
    styleId: 'chinese-grand',
    styleName: 'M1 中国风大气',
    styleGroup: 'v2 定稿',
    modelImage: modelReferenceUrl('chinese-grand'),
    locked: true,
  },
}

const processingNode: FlowProcessingNode = {
  id: 'processing',
  type: 'processing',
  position: { x: 320, y: 40 },
  collapsed: false,
  data: {
    processType: 'model',
    title: '模特图生成',
    status: 'planned',
    estimatedCount: 3,
    estimatedCost: 0.3,
    actualCost: 0,
  },
}

describe('applyModelSelection', () => {
  it('仅更新模特节点，并保留锁定状态与参考图完整地址', () => {
    const result = applyModelSelection([processingNode, modelNode], {
      id: 'korean-sweetcool',
      name: 'M2 韩系甜酷',
      group: 'v2 定稿',
      modelId: 'korean-sweetcool',
    })

    const updatedModel = result.find(node => node.type === 'model') as FlowModelNode
    const untouchedProcessing = result.find(node => node.type === 'processing') as FlowProcessingNode

    expect(result).toHaveLength(2)
    expect(untouchedProcessing).toEqual(processingNode)
    expect(updatedModel.data.styleId).toBe('korean-sweetcool')
    expect(updatedModel.data.styleName).toBe('M2 韩系甜酷')
    expect(updatedModel.data.modelImage).toBe('/api/library/models/korean-sweetcool/reference?variant=preview')
    expect(updatedModel.data.locked).toBe(true)
  })

  it('缺少 modelId 时清空预览地址，避免残留上一个模特', () => {
    const result = applyModelSelection([modelNode], {
      id: 'western-chic',
      name: 'M3 欧美飒爽',
      group: 'v2 定稿',
    })

    expect(result[0].data.styleId).toBe('western-chic')
    expect(result[0].data.modelImage).toBe('')
  })
})
