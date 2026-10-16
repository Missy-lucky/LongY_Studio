import type { AnyFlowNode, FlowModelNode } from '../types/node-system'

export interface ModelSelection {
  id: string
  name: string
  group: string
  modelId?: string
  referenceUrl?: string
  source?: 'builtin' | 'custom'
}

export function modelReferenceUrl(modelId?: string): string {
  return modelId ? `/api/library/models/${modelId}/reference?variant=preview` : ''
}

/** 将已定稿的模特选择同步到画布中的模特节点。 */
export function applyModelSelection<T extends AnyFlowNode>(nodes: T[], selection: ModelSelection): T[] {
  return nodes.map(node => {
    if (node.type !== 'model') return node
    const model = node as FlowModelNode
    return {
      ...node,
      data: {
        ...model.data,
        modelId: selection.modelId,
        styleId: selection.id,
        styleName: selection.name,
        styleGroup: selection.group,
        modelImage: selection.referenceUrl ?? modelReferenceUrl(selection.modelId),
        source: selection.source ?? 'builtin',
      },
    } as T
  })
}
