import type {
  AnyFlowNode,
  FlowEdge,
  FlowInputNode,
  FlowModelNode,
  FlowOutputNode,
  FlowProcessingNode,
  ProcessType,
} from '../types/node-system'
import { DEFAULT_INPUT_NODES, MODEL_STYLES, findCategory } from '../data/preset-categories'
import { PROCESS_ORDER, PROCESS_TITLES } from '../data/process-templates'
import type { RemoteAsset, RemoteTask } from '../services/api'
import { organizeNodes, outputPosition } from './node-layout'
import { outputStatus } from './task-sync'

export interface RestoredProjectGraph {
  nodes: AnyFlowNode[]
  edges: FlowEdge[]
}

interface BuildProjectGraphInput {
  projectId: string
  assets: RemoteAsset[]
  tasks: RemoteTask[]
  selectedModelId?: string | null
  createId: (prefix: string) => string
}

function modelReferenceUrl(modelId?: string) {
  return modelId ? `/api/library/models/${modelId}/reference?variant=preview` : ''
}

export function buildRestoredProjectGraph({
  projectId,
  assets,
  tasks,
  selectedModelId,
  createId,
}: BuildProjectGraphInput): RestoredProjectGraph {
  const selectedStyle = MODEL_STYLES.find(style => style.id === selectedModelId) ?? MODEL_STYLES[0]
  const inputNodes: FlowInputNode[] = assets.map((asset, index) => {
    const category = findCategory(asset.categoryId || 'top') ?? findCategory('top')!
    return {
      id: `asset-${asset.id}`,
      type: 'input' as const,
      position: { x: 60, y: 40 + index * 280 },
      collapsed: false,
      data: {
        categoryId: category.id,
        categoryName: category.name,
        categoryGroup: category.group,
        attributeOptions: [],
        attributes: {},
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
      position: { x: 60, y: 40 + index * 250 },
      collapsed: false,
      data: {
        categoryId: category.id,
        categoryName: category.name,
        categoryGroup: category.group,
        attributeOptions: [],
        attributes: {},
        image: null,
        status: 'empty' as const,
      },
    }
  })
  const allInputs = [...inputNodes, ...blankInputs]

  const modelNode: FlowModelNode = {
    id: 'model-locked',
    type: 'model' as const,
    position: { x: 60, y: 40 + allInputs.length * 280 + 20 },
    collapsed: false,
    data: {
      styleId: selectedStyle.id,
      styleName: selectedStyle.name,
      styleGroup: selectedStyle.group,
      modelImage: modelReferenceUrl(selectedStyle.modelId),
      locked: true,
    },
  }

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
        imageType: task.type,
        status: outputStatus(task.status),
        thumbnail: version?.filePath
          ? `/api/projects/${projectId}/tasks/${task.id}/versions/${version.id}/file`
          : null,
        version: version?.version ?? 1,
        parentOutputId: null,
        rejectReason: null,
        customPrompt: null,
        cost: version?.cost ?? 0,
        durationMs: version?.durationMs ?? null,
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
    target: processNodes.find(node => node.data.processType === 'model')!.id,
    edgeType: 'model',
  })
  outputNodes.forEach(output => edges.push({
    id: `edge-output-${output.data.taskId}`,
    source: processNodes.find(node => node.data.processType === output.data.imageType)!.id,
    target: output.id,
    edgeType: 'output',
  }))

  return {
    nodes: organizeNodes([...allInputs, modelNode, ...processNodes, ...outputNodes]),
    edges,
  }
}
