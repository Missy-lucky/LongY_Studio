import type {
  AnyFlowNode,
  FlowEdge,
  FlowInputNode,
  FlowModelNode,
  FlowPoseNode,
  FlowReferenceNode,
  FlowCareInputNode,
  FlowCareOutputNode,
  FlowOutputNode,
  FlowProcessingNode,
  ProcessType,
} from '../types/node-system'
import { DEFAULT_INPUT_NODES, MODEL_STYLES, findCategory } from '../data/preset-categories'
import { PROCESS_ORDER, PROCESS_TITLES } from '../data/process-templates'
import type { RemoteAsset, RemoteCareCard, RemoteItem, RemoteModel, RemoteProjectReference, RemoteTask } from '../services/api'
import { careInputPosition, careOutputPosition, inputPosition, modelPosition, organizeNodes, outputPosition, referencePosition } from './node-layout'
import { outputStatus } from './task-sync'

export interface RestoredProjectGraph {
  nodes: AnyFlowNode[]
  edges: FlowEdge[]
}

interface BuildProjectGraphInput {
  projectId: string
  assets: RemoteAsset[]
  items?: RemoteItem[]
  tasks: RemoteTask[]
  selectedModelId?: string | null
  models?: RemoteModel[]
  references?: RemoteProjectReference[]
  careCards?: RemoteCareCard[]
  createId: (prefix: string) => string
}

function modelReferenceUrl(modelId?: string) {
  return modelId ? `/api/library/models/${modelId}/reference?variant=preview` : ''
}

export function buildRestoredProjectGraph({
  projectId,
  assets,
  items = [],
  tasks,
  selectedModelId,
  models = [],
  references = [],
  careCards = [],
  createId,
}: BuildProjectGraphInput): RestoredProjectGraph {
  const selectedRemoteModel = models.find(model => model.id === selectedModelId)
  const selectedStyle = MODEL_STYLES.find(style => style.modelId === selectedModelId) ?? MODEL_STYLES[0]
  const garmentAssets = assets.filter(asset => asset.itemId && asset.categoryId)
  const itemsById = new Map(items.map(item => [item.id, item]))
  const inputNodes: FlowInputNode[] = garmentAssets.map((asset, index) => {
    const category = findCategory(asset.categoryId || 'top') ?? findCategory('top')!
    const item = itemsById.get(asset.itemId || '')
    return {
      id: `asset-${asset.id}`,
      type: 'input' as const,
      position: inputPosition(index),
      collapsed: false,
      data: {
        categoryId: category.id,
        categoryName: category.name,
        categoryGroup: category.group,
        parentCategoryId: category.parentId,
        attributeOptions: [],
        attributes: item?.attributes ?? {},
        structureFieldOptions: [],
        structureFacts: item?.structureFacts ?? {},
        status: 'confirmed' as const,
        image: {
          id: asset.id,
          fileName: asset.filePath.split('/').pop() || asset.id,
          thumbnailUrl: `/api/projects/${projectId}/assets/${asset.id}/file`,
          width: asset.width,
          height: asset.height,
          fileSize: asset.size,
          remote: { projectId, itemId: asset.itemId || '', assetId: asset.id },
        },
      },
    }
  })

  const blankInputs: FlowInputNode[] = inputNodes.length ? [] : DEFAULT_INPUT_NODES.map((categoryId, index) => {
    const category = findCategory(categoryId)!
    return {
      id: createId('input'),
      type: 'input' as const,
      position: inputPosition(index),
      collapsed: false,
      data: {
        categoryId: category.id,
        categoryName: category.name,
        categoryGroup: category.group,
        parentCategoryId: category.parentId,
        attributeOptions: [],
        attributes: {},
        structureFieldOptions: [],
        structureFacts: {},
        image: null,
        status: 'empty' as const,
      },
    }
  })
  const allInputs = [...inputNodes, ...blankInputs]

  const modelNode: FlowModelNode = {
    id: 'model-locked',
    type: 'model' as const,
    position: modelPosition(allInputs.length),
    collapsed: false,
    data: {
      modelId: selectedRemoteModel?.id ?? selectedStyle.modelId,
      styleId: selectedRemoteModel?.id ?? selectedStyle.id,
      styleName: selectedRemoteModel?.name ?? selectedStyle.name,
      styleGroup: selectedRemoteModel?.source === 'custom' ? '自定义模特' : selectedStyle.group,
      modelImage: selectedRemoteModel?.referenceUrl ?? modelReferenceUrl(selectedStyle.modelId),
      locked: true,
      source: selectedRemoteModel?.source ?? 'builtin',
    },
  }

  const referenceNodes = references.map((reference, index): FlowPoseNode | FlowReferenceNode => {
    const base = {
      id: `reference-${reference.id}`,
      position: referencePosition(allInputs.length, index),
      collapsed: false,
    }
    const data = {
      referenceId: reference.id,
      name: reference.name,
      image: `/api/projects/${projectId}/references/${reference.id}/file`,
    }
    if (reference.role === 'pose') {
      return { ...base, type: 'pose', data: { ...data, role: 'pose' } }
    }
    return { ...base, type: 'reference', data: { ...data, role: reference.role } }
  })

  const careInputNode: FlowCareInputNode = {
    id: 'care-input',
    type: 'careInput',
    position: careInputPosition(allInputs.length, referenceNodes.length),
    collapsed: false,
    data: {
      cardCount: careCards.length,
      latestProductName: careCards[0]?.productName ?? '',
    },
  }
  const careOutputNodes: FlowCareOutputNode[] = careCards.map((card, index) => ({
    id: `care-output-${card.id}`,
    type: 'careOutput',
    position: careOutputPosition(allInputs.length, referenceNodes.length, index),
    collapsed: false,
    data: {
      cardId: card.id,
      productName: card.productName || '洗护与成分说明',
      brand: card.brand,
      compositionSummary: card.data.composition
        .map(part => `${part.name}${part.percent}%`)
        .join(' / '),
      thumbnail: `/api/projects/${projectId}/care-cards/${card.id}/file`,
    },
  }))

  const processNodes: FlowProcessingNode[] = PROCESS_ORDER.map((processType, index) => ({
    id: `proc-${processType}`,
    type: 'processing' as const,
    position: { x: 430, y: 40 + index * 350 },
    collapsed: false,
    data: {
      processType,
      title: PROCESS_TITLES[processType],
      status: 'idle' as const,
      estimatedCount: 0,
      estimatedCost: 0,
      actualCost: 0,
    },
  }))

  const counts = new Map<ProcessType, number>()
  const outputNodes: FlowOutputNode[] = tasks.map(task => {
    const count = counts.get(task.type) ?? 0
    counts.set(task.type, count + 1)
    const process = processNodes.find(node => node.data.processType === task.type)!
    const version = task.versions.find(item => item.id === task.currentVersionId)
    return {
      id: `task-${task.id}`,
      type: 'output' as const,
      position: outputPosition(task.type, count, process.position.y),
      collapsed: false,
      data: {
        taskId: task.id,
        versionId: task.currentVersionId,
        taskCode: task.code,
        taskName: task.name,
        itemId: task.itemId ?? null,
        prompt: task.prompt ?? '',
        negativePrompt: task.negativePrompt ?? '',
        shotId: task.shotId ?? null,
        shotName: task.shotName ?? null,
        priority: task.priority ?? null,
        imageType: task.type,
        status: outputStatus(task.status),
        thumbnail: version?.filePath
          ? `/api/projects/${projectId}/tasks/${task.id}/versions/${version.id}/file`
          : null,
        version: version?.version ?? 1,
        parentOutputId: null,
        rejectReason: null,
        customPrompt: null,
        revisionNote: null,
        referenceMode: version?.referenceMode ?? 'original',
        baseVersionId: version?.baseVersionId ?? null,
        cost: version?.cost ?? 0,
        durationMs: version?.durationMs ?? null,
        tier: task.tier,
        qcScore: version?.qcScore ?? null,
        qcPassed: version?.qcPassed ?? null,
        errorCode: version?.errorCode ?? null,
        errorMessage: version?.errorMessage ?? null,
        versions: task.versions,
      },
    }
  })

  processNodes.forEach(process => {
    const rows = tasks.filter(task => task.type === process.data.processType)
    process.data.status = rows.length ? 'done' : 'idle'
    process.data.estimatedCount = rows.length
    process.data.estimatedCost = rows.reduce((sum, task) => sum + task.estimatedCost, 0)
    process.data.actualCost = rows.reduce((sum, task) => sum + (task.versions.at(-1)?.cost ?? 0), 0)
  })

  const edges: FlowEdge[] = []
  allInputs.forEach(input => processNodes.forEach(process => edges.push({
    id: `edge-${input.id}-${process.id}`,
    source: input.id,
    target: process.id,
    edgeType: 'material',
  })))
  edges.push({
    id: 'edge-model',
    source: modelNode.id,
    target: processNodes.find(node => node.data.processType === 'partial')!.id,
    edgeType: 'model',
  })
  edges.push({
    id: 'edge-model-display',
    source: modelNode.id,
    target: processNodes.find(node => node.data.processType === 'model')!.id,
    edgeType: 'model',
  })
  referenceNodes.forEach(reference => {
    if (reference.type === 'pose') {
      edges.push({
        id: `edge-model-${reference.id}`,
        source: modelNode.id,
        target: reference.id,
        edgeType: 'pose',
      })
      return
    }
    const targetTypes: ProcessType[] = reference.data.role === 'detail'
      ? ['detail', 'partial']
      : ['flat', 'detail', 'partial', 'model']
    targetTypes.forEach(type => edges.push({
      id: `edge-${reference.id}-${type}`,
      source: reference.id,
      target: processNodes.find(node => node.data.processType === type)!.id,
      edgeType: 'reference',
    }))
  })
  outputNodes.forEach(output => edges.push({
    id: `edge-output-${output.data.taskId}`,
    source: processNodes.find(node => node.data.processType === output.data.imageType)!.id,
    target: output.id,
    edgeType: 'output',
  }))
  careOutputNodes.forEach(output => edges.push({
    id: `edge-care-${output.data.cardId}`,
    source: careInputNode.id,
    target: output.id,
    edgeType: 'care',
  }))

  return {
    nodes: organizeNodes([
      ...allInputs, modelNode, ...referenceNodes, careInputNode, ...careOutputNodes,
      ...processNodes, ...outputNodes,
    ]),
    edges,
  }
}
