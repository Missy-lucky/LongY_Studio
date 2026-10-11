import type { AnyFlowNode, FlowInputNode, FlowProcessingNode, ProcessType } from '../types/node-system'
import type { ProjectLayout } from '../services/api'

export const PROJECT_LAYOUT_SCHEMA = 'longy.project-layout.v2'

export interface ProjectGenerationConfig {
  generationTypes: ProcessType[]
  inputGenerationTypes: Record<string, ProcessType[]>
}

export function buildProjectLayout(
  nodes: AnyFlowNode[],
  generation?: ProjectGenerationConfig,
): ProjectLayout {
  const positions: ProjectLayout['positions'] = {}
  const roles: ProjectLayout['roles'] = {}
  nodes.forEach(node => {
    const point = { x: Math.round(node.position.x), y: Math.round(node.position.y) }
    positions[node.id] = point
    if (node.type === 'model') roles.model = point
    if (node.type === 'input') {
      const input = node as FlowInputNode
      roles[`input:${input.data.categoryId}`] = point
    }
    if (node.type === 'processing') {
      const process = node as FlowProcessingNode
      roles[`processing:${process.data.processType}`] = point
    }
  })
  return {
    schemaVersion: PROJECT_LAYOUT_SCHEMA,
    positions,
    roles,
    generationTypes: generation?.generationTypes,
    inputGenerationTypes: generation?.inputGenerationTypes,
  }
}

const PROCESS_TYPE_SET = new Set<string>(['flat', 'partial', 'detail', 'model'])

function normalizeTypes(values: unknown): ProcessType[] | undefined {
  if (!Array.isArray(values)) return undefined
  const normalized = values.filter((value): value is ProcessType =>
    typeof value === 'string' && PROCESS_TYPE_SET.has(value))
  return normalized.length ? normalized : undefined
}

export function extractGenerationConfig(layout: ProjectLayout | null | undefined): ProjectGenerationConfig | null {
  const generationTypes = normalizeTypes(layout?.generationTypes)
  const rawScopes = layout?.inputGenerationTypes
  const inputGenerationTypes = rawScopes
    ? Object.fromEntries(Object.entries(rawScopes)
      .map(([itemId, values]) => [itemId, normalizeTypes(values) ?? []] as const)
      .filter(([, values]) => values.length > 0))
    : undefined
  if (!generationTypes && !inputGenerationTypes) return null
  return {
    generationTypes: generationTypes ?? ['flat', 'partial', 'detail', 'model'],
    inputGenerationTypes: inputGenerationTypes ?? {},
  }
}

export function applyProjectLayout(nodes: AnyFlowNode[], layout: ProjectLayout | null | undefined): AnyFlowNode[] {
  if (!layout) return nodes
  return nodes.map(node => {
    let key: string | null = null
    if (node.type === 'model') key = 'model'
    if (node.type === 'input') key = `input:${(node as FlowInputNode).data.categoryId}`
    if (node.type === 'processing') {
      key = `processing:${(node as FlowProcessingNode).data.processType}`
    }
    const point = layout.positions?.[node.id] ?? (key ? layout.roles?.[key] : undefined)
    return point ? { ...node, position: { x: point.x, y: point.y } } : node
  })
}
