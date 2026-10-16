import { describe, expect, it } from 'vitest'
import { useNodeStore } from '../stores/node-store'
import type { AnyFlowNode, FlowEdge } from '../types/node-system'
import { outputStatus } from './task-sync'


describe('provider failure recovery', () => {
  it('keeps existing outputs visible while selecting a recovery provider', () => {
    const output = {
      id: 'task-1',
      type: 'output',
      position: { x: 0, y: 0 },
      collapsed: false,
      data: {
        errorCode: 'QUOTA_EXCEEDED',
      },
    } as AnyFlowNode
    const edge = {
      id: 'edge-1', source: 'proc-flat', target: 'task-1', edgeType: 'output',
    } as FlowEdge
    const nodes = [output]
    const edges = [edge]
    useNodeStore.setState({
      providerId: 'mock',
      providers: [{
        id: 'openai', name: 'OpenAI Images', supportedTiers: ['draft'],
        pricePerImage: { draft: 0 }, rateLimitPerMin: 10, available: true,
      }],
      nodes,
      edges,
      workflowMessage: '',
    })

    useNodeStore.getState().setProviderId('openai')

    const state = useNodeStore.getState()
    expect(state.providerId).toBe('openai')
    expect(state.nodes).toBe(nodes)
    expect(state.edges).toBe(edges)
    expect(state.workflowMessage).toContain('迁移并恢复')
  })

  it('shows planned and queued backend tasks as queued, not generating', () => {
    expect(outputStatus('planned')).toBe('queued')
    expect(outputStatus('cached')).toBe('queued')
    expect(outputStatus('queued')).toBe('queued')
    expect(outputStatus('generating')).toBe('generating')
  })
})
