import { useMemo, useEffect, useCallback } from 'react'
import { ReactFlow, Background, BackgroundVariant, Controls, MiniMap, useReactFlow, type Node, type Edge, type NodeTypes } from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import { useNodeStore } from '../../stores/node-store'
import { useWorkbench } from '../../stores/workbench-store'
import { CareInputNodeComponent, CareOutputNodeComponent, InputNodeComponent, ModelNodeComponent, PoseNodeComponent, ReferenceNodeComponent, ProcessingNodeComponent, OutputNodeComponent } from './NodeComponents'
import { TypePicker, ModelPicker } from './TypePicker'
import { NodeImageViewer } from './ImageViewer'
import { VersionQcDialog } from './VersionQcDialog'
import { ExportPreviewCoverageDialog, ExportResultDialog, ProjectSettingsDialog, ProviderConfirmDialog } from './WorkflowDialogs'
import { EDGE_COLORS, type ProcessType } from '../../types/node-system'
import { CareCardDialog } from './CareCardDialog'

const nodeTypes: NodeTypes = {
  inputNode: InputNodeComponent as any,
  modelNode: ModelNodeComponent as any,
  poseNode: PoseNodeComponent as any,
  referenceNode: ReferenceNodeComponent as any,
  careInputNode: CareInputNodeComponent as any,
  careOutputNode: CareOutputNodeComponent as any,
  processingNode: ProcessingNodeComponent as any,
  outputNode: OutputNodeComponent as any,
}

export function NodeCanvas() {
  const mode = useWorkbench(s => s.mode)
  const nodes = useNodeStore(s => s.nodes)
  const edges = useNodeStore(s => s.edges)
  const initCanvas = useNodeStore(s => s.initCanvas)
  const setTypePickerOpen = useNodeStore(s => s.setTypePickerOpen)
  const setSelected = useNodeStore(s => s.setSelected)
  const selectedNodeId = useNodeStore(s => s.selectedNodeId)
  const generatePlan = useNodeStore(s => s.generatePlan)
  const startGeneration = useNodeStore(s => s.startGeneration)
  const generationTypes = useNodeStore(s => s.generationTypes)
  const toggleGenerationType = useNodeStore(s => s.toggleGenerationType)
  const workflowBusy = useNodeStore(s => s.workflowBusy)
  const workflowMessage = useNodeStore(s => s.workflowMessage)
  const restoreLastProject = useNodeStore(s => s.restoreLastProject)
  const requestFitView = useNodeStore(s => s.requestFitView)
  const moveNode = useNodeStore(s => s.moveNode)
  const fitViewCounter = useNodeStore(s => s.fitViewCounter)
  const rf = useReactFlow()

  useEffect(() => {
    if (nodes.length === 0) initCanvas()
    void restoreLastProject()
  }, [nodes.length, initCanvas, restoreLastProject])

  useEffect(() => {
    if (fitViewCounter > 0) rf.fitView({ duration: 450, padding: 0.18, maxZoom: 1 })
  }, [fitViewCounter, rf])

  useEffect(() => {
    requestFitView()
  }, [mode, requestFitView])

  const rfNodes = useMemo<Node[]>(() => {
    const focusedTypes = {
      prepare: ['input', 'model', 'pose', 'reference', 'careInput'],
      generate: ['processing', 'output', 'careInput', 'careOutput'],
      review: ['output', 'careOutput'],
      export: ['output', 'careOutput'],
    }[mode]
    return nodes.map(n => ({
      id: n.id,
      type: n.type === 'input' ? 'inputNode'
        : n.type === 'model' ? 'modelNode'
        : n.type === 'pose' ? 'poseNode'
        : n.type === 'reference' ? 'referenceNode'
        : n.type === 'careInput' ? 'careInputNode'
        : n.type === 'careOutput' ? 'careOutputNode'
        : n.type === 'processing' ? 'processingNode'
        : 'outputNode',
      position: n.position,
      data: n.data as any,
      selected: n.id === selectedNodeId,
      className: focusedTypes.includes(n.type) ? 'workflow-node-focus' : 'workflow-node-dimmed',
    }))
  }, [mode, nodes, selectedNodeId])

  const rfEdges = useMemo<Edge[]>(() =>
    edges.map(e => ({
      id: e.id,
      source: e.source,
      target: e.target,
      animated: e.animated,
      style: {
        stroke: EDGE_COLORS[e.edgeType],
        strokeWidth: 1.35,
        opacity: ({
          material: 0.30,
          model: 0.48,
          pose: 0.48,
          reference: 0.42,
          care: 0.46,
          output: 0.42,
          review: 0.28,
          regen: 0.34,
        } as const)[e.edgeType],
      },
    })), [edges])

  const onNodeClick = useCallback((_: any, node: Node) => {
    setSelected(node.id)
  }, [setSelected])

  // Right-button drag is an explicit free-form placement mode. It starts on
  // right pointer-down so movement is tracked before the browser context event.
  const startRightDrag = useCallback((event: React.MouseEvent, node: Node) => {
    setSelected(node.id)
    const startPosition = { ...node.position }
    const startPointer = rf.screenToFlowPosition({
      x: event.clientX,
      y: event.clientY,
    })

    const move = (pointerEvent: PointerEvent) => {
      const current = rf.screenToFlowPosition({
        x: pointerEvent.clientX,
        y: pointerEvent.clientY,
      })
      moveNode(node.id, {
        x: startPosition.x + current.x - startPointer.x,
        y: startPosition.y + current.y - startPointer.y,
      })
    }
    const stop = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
      window.removeEventListener('pointercancel', stop)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
    window.addEventListener('pointercancel', stop)
  }, [moveNode, rf, setSelected])

  const onNodeContextMenu = useCallback((event: React.MouseEvent) => {
    event.preventDefault()
  }, [])

  const onCanvasPointerDown = useCallback((event: React.PointerEvent) => {
    if (event.button !== 2) return
    const element = (event.target as HTMLElement).closest('[data-id]')
    const nodeId = element?.getAttribute('data-id')
    const node = rfNodes.find(item => item.id === nodeId)
    if (!node) return
    event.preventDefault()
    startRightDrag(event, node)
  }, [rfNodes, startRightDrag])

  return (
    <div
      className="workflow-canvas relative h-full w-full"
      onContextMenu={event => event.preventDefault()}
      onPointerDownCapture={onCanvasPointerDown}>
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        onNodeClick={onNodeClick}
        onNodeContextMenu={onNodeContextMenu}
        nodesDraggable
        elementsSelectable
        elevateEdgesOnSelect
        onNodeDoubleClick={(_: unknown, node: Node) => rf.fitView({ nodes: [{ id: node.id }], duration: 300, maxZoom: 1.2 })}
        fitView
        fitViewOptions={{ padding: 0.15, maxZoom: 1 }}
        onlyRenderVisibleElements
        panOnDrag
        zoomOnScroll
        panOnScroll={false}
        minZoom={0.15}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}>
        <Background variant={BackgroundVariant.Dots} gap={24} size={1.2} color="var(--divider)"/>
        <Controls position="bottom-left" showInteractive={false}/>
        <MiniMap position="bottom-right"
          maskColor="rgba(0,0,0,0.5)"
          style={{
            background: 'var(--bg-2)',
            border: '1px solid var(--border)',
            borderRadius: 8, width: 140, height: 90,
          }}/>
      </ReactFlow>

      {/* 类型选择器 + 模特选择器 */}
      <TypePicker/>
      <ModelPicker/>
      <NodeImageViewer/>
      <VersionQcDialog/>
      <ProviderConfirmDialog/>
      <ExportPreviewCoverageDialog/>
      <ExportResultDialog/>
      <ProjectSettingsDialog/>
      <CareCardDialog/>
    </div>
  )
}
