import type {
  AnyFlowNode,
  FlowOutputNode,
  FlowProcessingNode,
  ProcessType,
} from '../types/node-system'
import { PROCESS_ORDER } from '../data/process-templates'

const OUTPUT_COLUMNS = 3
const outputGap = (type: ProcessType) => type === 'model' ? 330 : 270

// Initial source placement is deliberately staggered rather than forced into a
// row/column grid. Users can drag each source node freely at any time.
const INPUT_SEED_POSITIONS = [
  { x: 60, y: 48 },
  { x: 248, y: 138 },
  { x: 104, y: 342 },
  { x: 238, y: 468 },
  { x: 68, y: 634 },
]

export const inputPosition = (index: number) => {
  if (index < INPUT_SEED_POSITIONS.length) return INPUT_SEED_POSITIONS[index]
  const ring = Math.floor((index - INPUT_SEED_POSITIONS.length) / 5) + 1
  const slot = (index - INPUT_SEED_POSITIONS.length) % 5
  const angle = (slot / 5) * Math.PI * 2 + ring * 0.55
  return {
    x: Math.round(190 + Math.cos(angle) * (215 + ring * 58)),
    y: Math.round(360 + Math.sin(angle) * (245 + ring * 72)),
  }
}

export const modelPosition = (inputCount: number) => ({
  x: 238,
  y: 905 + inputCount * 8,
})

export const outputPosition = (type: ProcessType, index: number, baseY: number) => ({
  x: 760 + (index % OUTPUT_COLUMNS) * 200,
  y: baseY + Math.floor(index / OUTPUT_COLUMNS) * outputGap(type),
})

/** Stage process/output nodes while preserving user-owned source-node positions. */
export function organizeNodes(nodes: AnyFlowNode[]): AnyFlowNode[] {
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
    if (node.type === 'input' || node.type === 'model') return node
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
