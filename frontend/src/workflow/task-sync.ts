import type { AnyFlowNode, FlowOutputNode, OutputStatus, FlowProcessingNode } from '../types/node-system'
import type { RemoteTask } from '../services/api'

export function outputStatus(status: string): OutputStatus {
  if (status === 'review') return 'pending'
  if (status === 'accepted') return 'satisfied'
  if (status === 'locked') return 'locked'
  if (status === 'exported') return 'exported'
  if (status === 'rejected') return 'unsatisfied'
  if (status === 'failed') return 'failed'
  return 'generating'
}

export function activeBackendStatus(status: string): boolean {
  return ['planned', 'cached', 'queued', 'generating'].includes(status)
}

function taskVersion(task: RemoteTask) {
  if (!task.currentVersionId) return undefined
  return task.versions.find(version => version.id === task.currentVersionId)
}

/** Map backend task facts onto output nodes and recalculate processing rollups. */
export function syncNodesWithTasks(
  tasks: RemoteTask[],
  projectId: string,
  nodes: AnyFlowNode[],
): AnyFlowNode[] {
  const taskById = new Map(tasks.map(task => [task.id, task]))
  const withOutputs = nodes.map(node => {
    if (node.type !== 'output') return node
    const output = node as FlowOutputNode
    const task = taskById.get(output.data.taskId)
    if (!task) return node
    const version = taskVersion(task)
    return {
      ...node,
      data: {
        ...output.data,
        status: outputStatus(task.status),
        itemId: task.itemId ?? output.data.itemId,
        prompt: task.prompt ?? output.data.prompt,
        negativePrompt: task.negativePrompt ?? output.data.negativePrompt,
        shotId: task.shotId ?? null,
        shotName: task.shotName ?? null,
        priority: task.priority ?? null,
        versionId: task.currentVersionId,
        version: version?.version ?? output.data.version,
        referenceMode: version?.referenceMode ?? 'original',
        baseVersionId: version?.baseVersionId ?? null,
        cost: version?.cost ?? output.data.cost,
        durationMs: version?.durationMs ?? output.data.durationMs,
        tier: task.tier,
        qcScore: version?.qcScore ?? null,
        qcPassed: version?.qcPassed ?? null,
        versions: task.versions,
        thumbnail: version?.filePath
          ? `/api/projects/${projectId}/tasks/${task.id}/versions/${version.id}/file`
          : null,
      },
    }
  })

  const outputData = withOutputs
    .filter(node => node.type === 'output')
    .map(node => (node as FlowOutputNode).data)

  return withOutputs.map(node => {
    if (node.type !== 'processing') return node
    const process = node as FlowProcessingNode
    const outputs = outputData.filter(item => item.imageType === process.data.processType)
    const running = outputs.some(item => ['queued', 'generating'].includes(item.status))
    const failed = outputs.length > 0 && outputs.every(item => item.status === 'failed')
    const done = outputs.length > 0 && outputs.every(item => !['queued', 'generating'].includes(item.status))
    return {
      ...node,
      data: {
        ...process.data,
        status: running ? 'running' : failed ? 'failed' : done ? 'done' : process.data.status,
        actualCost: outputs.reduce((sum, item) => sum + item.cost, 0),
      },
    }
  })
}
