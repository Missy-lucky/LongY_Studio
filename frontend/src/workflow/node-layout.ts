import type {
  AnyFlowNode,
  FlowOutputNode,
  FlowProcessingNode,
  ProcessType,
} from '../types/node-system'
import { PROCESS_ORDER } from '../data/process-templates'

const OUTPUT_COLUMNS = 3
const INPUT_COLUMNS = 2
const INPUT_ROW_GAP = 340
const outputGap = (type: ProcessType) => type === 'model' ? 330 : 270

export const inputPosition = (index: number) => ({
  x: 60 + (index % INPUT_COLUMNS) * 220,
  y: 40 + Math.floor(index / INPUT_COLUMNS) * INPUT_ROW_GAP,
})

export const modelPosition = (inputCount: number) => ({
  x: 60,
  y: 40 + Math.ceil(inputCount / INPUT_COLUMNS) * INPUT_ROW_GAP + 20,
})

export const outputPosition = (type: ProcessType, index: number, baseY: number) => ({
  x: 760 + (index % OUTPUT_COLUMNS) * 200,
  y: baseY + Math.floor(index / OUTPUT_COLUMNS) * outputGap(type),
})

/** Organize a three-stage graph without shrinking image containers to avoid overlap. */
export function organizeNodes(
  nodes: AnyFlowNode[],
  options: { preserveSourcePositions?: boolean } = {},
): AnyFlowNode[] {
  const inputCount = nodes.filter(node => node.type === 'input').length
  const outputCounts = new Map<ProcessType, number>()
  nodes.forEach(node => {
    if (node.type !== 'output') return
    const type = (node as FlowOutputNode).data.imageType
    outputCounts.set(type, (outputCounts.get(type) ?? 0) + 1)
  })

  // Each process row reserves enough height for its own output grid.
  const processY = new Map<ProcessType, number>()
  let cursorY = 40
  PROCESS_ORDER.forEach(type => {
    processY.set(type, cursorY)
    const rows = Math.ceil((outputCounts.get(type) ?? 0) / OUTPUT_COLUMNS)
    const nodeHeight = type === 'model' ? 300 : 245
    const blockHeight = rows === 0 ? 210 : (rows - 1) * outputGap(type) + nodeHeight
    cursorY += Math.max(220, blockHeight + 85)
  })

  const counts = new Map<ProcessType, number>()
  return nodes.map(node => {
    if (options.preserveSourcePositions && (node.type === 'input' || node.type === 'model')) {
      return node
    }
    if (node.type === 'input') {
      const index = nodes.filter(item => item.type === 'input').indexOf(node)
      return { ...node, position: inputPosition(index) }
    }
    if (node.type === 'model') {
      return { ...node, position: modelPosition(inputCount) }
    }
    if (node.type === 'processing') {
      const process = node as FlowProcessingNode
      return { ...node, position: { x: 430, y: processY.get(process.data.processType) ?? 40 } }
    }
    const output = node as FlowOutputNode
    const count = counts.get(output.data.imageType) ?? 0
    counts.set(output.data.imageType, count + 1)
    return {
      ...node,
      position: outputPosition(
        output.data.imageType,
        count,
        processY.get(output.data.imageType) ?? 40,
      ),
    }
  })
}
