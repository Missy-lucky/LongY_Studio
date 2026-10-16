import { describe, expect, it } from 'vitest'
import type { RemoteCareCard, RemoteItem, RemoteModel, RemoteProjectReference } from '../services/api'
import { buildRestoredProjectGraph } from './project-restore'


describe('buildRestoredProjectGraph project references', () => {
  it('恢复自定义模特、姿势子节点和角色化参考连线', () => {
    const models: RemoteModel[] = [{
      id: 'custom-1',
      name: '用户模特',
      source: 'custom',
      projectId: 'p1',
      referenceUrl: '/api/projects/p1/models/custom-1/reference',
    }]
    const references: RemoteProjectReference[] = [
      { id: 'pose-1', projectId: 'p1', role: 'pose', name: '站姿', filePath: 'pose.png', size: 1, width: 640, height: 960, createdAt: '1' },
      { id: 'style-1', projectId: 'p1', role: 'style', name: '棚拍', filePath: 'style.png', size: 1, width: 640, height: 960, createdAt: '2' },
      { id: 'detail-1', projectId: 'p1', role: 'detail', name: '袖口', filePath: 'detail.png', size: 1, width: 640, height: 960, createdAt: '3' },
    ]

    const graph = buildRestoredProjectGraph({
      projectId: 'p1',
      assets: [],
      tasks: [],
      selectedModelId: 'custom-1',
      models,
      references,
      createId: prefix => `${prefix}-test`,
    })

    const model = graph.nodes.find(node => node.type === 'model')
    expect(model?.data.modelId).toBe('custom-1')
    expect(model?.data.source).toBe('custom')
    expect(graph.nodes.filter(node => node.type === 'pose')).toHaveLength(1)
    expect(graph.nodes.filter(node => node.type === 'reference')).toHaveLength(2)
    expect(graph.edges).toContainEqual(expect.objectContaining({
      source: 'model-locked', target: 'reference-pose-1', edgeType: 'pose',
    }))
    expect(graph.edges).toContainEqual(expect.objectContaining({
      source: 'reference-detail-1', target: 'proc-detail', edgeType: 'reference',
    }))
    expect(graph.edges).not.toContainEqual(expect.objectContaining({
      source: 'reference-detail-1', target: 'proc-model',
    }))
    expect(graph.edges).toContainEqual(expect.objectContaining({
      source: 'reference-style-1', target: 'proc-model', edgeType: 'reference',
    }))
  })

  it('恢复独立洗护输入与白底图输出节点', () => {
    const careCards: RemoteCareCard[] = [{
      id: 'care-1',
      projectId: 'p1',
      sourceAssetId: null,
      brand: 'LONGY',
      productName: '棉质衬衫',
      filePath: 'projects/p1/care/care-1.png',
      createdAt: '1',
      updatedAt: '2',
      data: {
        brand: 'LONGY',
        productName: '棉质衬衫',
        composition: [{ name: '棉', percent: 100 }],
        instructions: ['max_30', 'line_dry'],
        warnings: [],
      },
    }]
    const graph = buildRestoredProjectGraph({
      projectId: 'p1', assets: [], tasks: [], careCards,
      createId: prefix => `${prefix}-test`,
    })

    expect(graph.nodes.filter(node => node.type === 'careInput')).toHaveLength(1)
    expect(graph.nodes.filter(node => node.type === 'careOutput')).toHaveLength(1)
    expect(graph.edges).toContainEqual(expect.objectContaining({
      source: 'care-input', target: 'care-output-care-1', edgeType: 'care',
    }))
  })

  it('未归类的水洗标素材不会恢复成服饰输入节点', () => {
    const graph = buildRestoredProjectGraph({
      projectId: 'p1',
      assets: [{
        id: 'label-1', name: 'wash-label.png', filePath: 'labels/wash-label.png',
        hash: 'hash', size: 1, width: 400, height: 400,
        categoryId: null, itemId: null, viewSlot: null,
      }],
      tasks: [],
      createId: prefix => `${prefix}-test`,
    })
    expect(graph.nodes.some(node => node.id === 'asset-label-1')).toBe(false)
  })

  it('恢复商品属性和结构事实，不退回模板默认值', () => {
    const items: RemoteItem[] = [{
      id: 'item-1', projectId: 'p1', name: '衬衫', categoryId: 'shirt',
      attributes: { hasPrint: false, hasChestPocket: true },
      structureFacts: { neckline: '小方领', closure: '单排七粒扣' },
      colorMaterial: '米白色棉质', sellingPoints: '', isSellable: true,
    }]
    const graph = buildRestoredProjectGraph({
      projectId: 'p1',
      items,
      assets: [{
        id: 'asset-1', name: 'shirt.png', filePath: 'assets/shirt.png',
        hash: 'hash', size: 1, width: 800, height: 1000,
        categoryId: 'shirt', itemId: 'item-1', viewSlot: 'front',
      }],
      tasks: [],
      createId: prefix => `${prefix}-test`,
    })

    const input = graph.nodes.find(node => node.type === 'input')
    expect(input?.type).toBe('input')
    if (input?.type !== 'input') throw new Error('input node missing')
    expect(input.data.attributes).toEqual({ hasPrint: false, hasChestPocket: true })
    expect(input.data.structureFacts).toEqual({ neckline: '小方领', closure: '单排七粒扣' })
  })
})
