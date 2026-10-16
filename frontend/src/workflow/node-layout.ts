import type {
  AnyFlowNode,
  FlowInputNode,
  FlowModelNode,
  FlowOutputNode,
  FlowProcessingNode,
  ProcessType,
} from '../types/node-system'
import { PROCESS_ORDER } from '../data/process-templates'

interface Size {
  width: number
  height: number
}

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export const NODE_SIZE = {
  input: { width: 220, height: 320 },
  model: { width: 220, height: 390 },
  pose: { width: 220, height: 250 },
  reference: { width: 220, height: 250 },
  careInput: { width: 240, height: 150 },
  careOutput: { width: 220, height: 330 },
  processing: { width: 240, height: 150 },
} satisfies Record<string, Size>

const OUTPUT_SIZE: Record<ProcessType, Size> = {
  flat: { width: 220, height: 340 },
  detail: { width: 220, height: 340 },
  partial: { width: 220, height: 340 },
  model: { width: 220, height: 415 },
}

const NODE_GAP = 80
const OUTPUT_COLUMNS = 3
const OUTPUT_COLUMN_STEP = 300
const OUTPUT_ROW_STEP: Record<ProcessType, number> = {
  flat: 420,
  detail: 420,
  partial: 420,
  model: 495,
}
const PROCESS_X = 620
const OUTPUT_X = 940

// Initial source placement is deliberately staggered rather than forced into a
// row/column grid, while still reserving each control's full bounding box.
const INPUT_COLUMNS = [60, 320]
const INPUT_COLUMN_OFFSETS = [40, 170]

export const inputPosition = (index: number) => {
  const column = index % INPUT_COLUMNS.length
  const row = Math.floor(index / INPUT_COLUMNS.length)
  return {
    x: INPUT_COLUMNS[column],
    y: INPUT_COLUMN_OFFSETS[column] + row * (NODE_SIZE.input.height + NODE_GAP),
  }
}

export const modelPosition = (inputCount: number) => {
  if (inputCount <= 0) return { x: INPUT_COLUMNS[0], y: 40 }
  const bottom = Math.max(
    ...Array.from({ length: inputCount }, (_, index) => {
      const position = inputPosition(index)
      return position.y + NODE_SIZE.input.height
    }),
  )
  return { x: INPUT_COLUMNS[0], y: bottom + NODE_GAP }
}

export const referencePosition = (inputCount: number, index: number) => {
  const model = modelPosition(inputCount)
  return { x: INPUT_COLUMNS[1], y: model.y + index * (NODE_SIZE.reference.height + NODE_GAP) }
}

export const careInputPosition = (inputCount: number, referenceCount: number) => {
  const model = modelPosition(inputCount)
  const referenceBottom = referenceCount > 0
    ? model.y + referenceCount * (NODE_SIZE.reference.height + NODE_GAP)
    : model.y + NODE_SIZE.model.height
  return { x: INPUT_COLUMNS[0], y: referenceBottom + NODE_GAP }
}

export const careOutputPosition = (inputCount: number, referenceCount: number, index: number) => {
  const input = careInputPosition(inputCount, referenceCount)
  return { x: INPUT_COLUMNS[1], y: input.y + index * (NODE_SIZE.careOutput.height + NODE_GAP) }
}

export function nodeSize(node: AnyFlowNode): Size {
  if (node.type === 'input') return NODE_SIZE.input
  if (node.type === 'model') return NODE_SIZE.model
  if (node.type === 'pose') return NODE_SIZE.pose
  if (node.type === 'reference') return NODE_SIZE.reference
  if (node.type === 'careInput') return NODE_SIZE.careInput
  if (node.type === 'careOutput') return NODE_SIZE.careOutput
  if (node.type === 'processing') return NODE_SIZE.processing
  return OUTPUT_SIZE[(node as FlowOutputNode).data.imageType]
}

function rect(node: AnyFlowNode): Rect {
  const size = nodeSize(node)
  return { ...node.position, ...size }
}

export function boundsOverlap(left: Rect, right: Rect, gap = NODE_GAP): boolean {
  return (
    left.x < right.x + right.width + gap &&
    right.x < left.x + left.width + gap &&
    left.y < right.y + right.height + gap &&
    right.y < left.y + left.height + gap
  )
}

export function hasCollisions(nodes: AnyFlowNode[]): boolean {
  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      if (boundsOverlap(rect(nodes[i]), rect(nodes[j]))) return true
    }
  }
  return false
}

function findNonOverlappingPosition(node: AnyFlowNode, start: {x:number;y:number}, occupied: Rect[]): {x:number;y:number} {
  const size = nodeSize(node)
  let candidate = { ...start }
  // Keep horizontal identity (stage/column) and resolve downward only. This makes
  // the resulting graph predictable and guarantees control rectangles never intersect.
  for (let attempt = 0; attempt < 1000; attempt += 1) {
    const candidateRect = { ...candidate, ...size }
    if (!occupied.some(item => boundsOverlap(candidateRect, item, NODE_GAP))) return candidate
    candidate = { ...candidate, y: candidate.y + 40 }
  }
  return candidate
}

export const outputPosition = (type: ProcessType, index: number, baseY: number) => ({
  x: OUTPUT_X + (index % OUTPUT_COLUMNS) * OUTPUT_COLUMN_STEP,
  y: baseY + Math.floor(index / OUTPUT_COLUMNS) * OUTPUT_ROW_STEP[type],
})

/** Stage process/output nodes while preserving user-owned source-node positions. */
export function organizeNodes(nodes: AnyFlowNode[]): AnyFlowNode[] {
  const outputCounts = new Map<ProcessType, number>()
  nodes.forEach(node => {
    if (node.type !== 'output') return
    const type = (node as FlowOutputNode).data.imageType
    outputCounts.set(type, (outputCounts.get(type) ?? 0) + 1)
  })

  const positions = new Map<string, { x: number; y: number }>()
  const occupied: Rect[] = []

  // Source nodes are user-owned. Their actual rectangles become collision walls.
  nodes.forEach(node => {
    if (!['input', 'model', 'pose', 'reference', 'careInput', 'careOutput'].includes(node.type)) return
    positions.set(node.id, node.position)
    occupied.push(rect(node))
  })

  let cursorY = 40
  PROCESS_ORDER.forEach(type => {
    const processNode = nodes.find(node => {
      if (node.type !== 'processing') return false
      return (node as FlowProcessingNode).data.processType === type
    })
    if (!processNode) return

    const processPosition = findNonOverlappingPosition(
      processNode,
      { x: PROCESS_X, y: cursorY },
      occupied,
    )
    positions.set(processNode.id, processPosition)
    occupied.push({ ...processPosition, ...NODE_SIZE.processing })

    let groupBottom = processPosition.y + NODE_SIZE.processing.height
    let index = 0
    nodes.forEach(node => {
      if (node.type !== 'output') return
      const output = node as FlowOutputNode
      if (output.data.imageType !== type) return
      const ideal = outputPosition(type, index, processPosition.y)
      const position = findNonOverlappingPosition(output, ideal, occupied)
      positions.set(node.id, position)
      occupied.push({ ...position, ...OUTPUT_SIZE[type] })
      groupBottom = Math.max(groupBottom, position.y + OUTPUT_SIZE[type].height)
      index += 1
    })

    cursorY = groupBottom + NODE_GAP + 40
  })

  return nodes.map(node => {
    const position = positions.get(node.id)
    return position ? { ...node, position } : node
  })
}
