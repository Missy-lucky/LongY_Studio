import { useMemo, useEffect, useCallback } from 'react'
import { ReactFlow, Background, BackgroundVariant, Controls, MiniMap, useReactFlow, type Node, type Edge, type NodeTypes } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Layers, Loader2, Play, Plus } from 'lucide-react'
import { useNodeStore } from '../../stores/node-store'
import { InputNodeComponent, ModelNodeComponent, ProcessingNodeComponent, OutputNodeComponent } from './NodeComponents'
import { TypePicker, ModelPicker } from './TypePicker'
import { NodeImageViewer } from './ImageViewer'
import { VersionQcDialog } from './VersionQcDialog'
import { ExportPreviewCoverageDialog, ExportResultDialog, ProjectSettingsDialog, ProviderConfirmDialog } from './WorkflowDialogs'
import { EDGE_COLORS, type ProcessType } from '../../types/node-system'

const nodeTypes: NodeTypes = {
  inputNode: InputNodeComponent as any,
  modelNode: ModelNodeComponent as any,
  processingNode: ProcessingNodeComponent as any,
  outputNode: OutputNodeComponent as any,
}

export function NodeCanvas() {
  const nodes = useNodeStore(s => s.nodes)
  const edges = useNodeStore(s => s.edges)
  const initCanvas = useNodeStore(s => s.initCanvas)
  const setTypePickerOpen = useNodeStore(s => s.setTypePickerOpen)
  const setSelected = useNodeStore(s => s.setSelected)
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

  const rfNodes = useMemo<Node[]>(() =>
    nodes.map(n => ({
      id: n.id,
      type: n.type === 'input' ? 'inputNode'
        : n.type === 'model' ? 'modelNode'
        : n.type === 'processing' ? 'processingNode'
        : 'outputNode',
      position: n.position,
      data: n.data as any,
      selected: false,
    })), [nodes])

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
        onNodeDoubleClick={(_, node) => rf.fitView({ nodes: [{ id: node.id }], duration: 300, maxZoom: 1.2 })}
        fitView
        fitViewOptions={{ padding: 0.15, maxZoom: 1 }}
        onlyRenderVisibleElements
        panOnDrag
        zoomOnScroll={false}
        panOnScroll
        minZoom={0.9}
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

      {/* Workflow controls: only canvas-specific actions live here. Project and provider commands are in the menu bar. */}
      <div className="absolute left-4 top-4 z-10 flex w-[190px] flex-col gap-2">
        <button onClick={() => setTypePickerOpen(true)} className="btn btn-secondary !min-h-[36px] !rounded-xl" title="添加穿搭部位节点">
          <Plus size={14} strokeWidth={1.5}/>添加部位
        </button>
        <button onClick={() => void generatePlan()} disabled={workflowBusy} className="btn btn-secondary !min-h-[36px] !rounded-xl" title="按当前素材和模特生成后端任务">
          <Layers size={14} strokeWidth={1.5}/>生成方案
        </button>
        <div className="rounded-xl border p-2" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
          <div className="mb-1.5 text-[10px] font-semibold text-text-muted">生图范围</div>
          <div className="grid grid-cols-2 gap-1">
            {(['flat', 'partial', 'detail', 'model'] as const).map((type: ProcessType) => (
              <label key={type} className="flex cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-1 text-[10px] transition-colors hover:bg-[var(--surface-hover)]">
                <input
                  type="checkbox"
                  checked={generationTypes.includes(type)}
                  onChange={() => toggleGenerationType(type)}
                  className="h-3 w-3 accent-[var(--primary)]"
                />
                {{ flat: '平面', partial: '局部', detail: '细节', model: '模特' }[type]}
              </label>
            ))}
          </div>
        </div>
        <button onClick={() => void startGeneration()} disabled={workflowBusy} className="btn btn-primary !min-h-[36px] !rounded-xl" title="只提交当前勾选范围内的待生成任务；真实 Provider 会先确认">
          {workflowBusy ? <Loader2 size={14} className="anim-spin"/> : <Play size={14} strokeWidth={1.5}/>}开始流程
        </button>
        <button onClick={requestFitView} className="btn btn-secondary !min-h-[36px] !rounded-xl" title="只缩放视图适应内容，不改变节点位置">
          <Layers size={14} strokeWidth={1.5}/>适应视图
        </button>
        <div className="rounded-lg border px-2.5 py-2 text-[10px] leading-4" style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-3)' }}>
          左键或右键拖拽节点可自由调整位置；生成方案不会重排素材节点。
        </div>
        {workflowMessage && (
          <div className="rounded-lg border px-2.5 py-2 text-[10px] leading-4 shadow" style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-2)' }}>
            {workflowMessage}
          </div>
        )}
      </div>

      {/* 类型选择器 + 模特选择器 */}
      <TypePicker/>
      <ModelPicker/>
      <NodeImageViewer/>
      <VersionQcDialog/>
      <ProviderConfirmDialog/>
      <ExportPreviewCoverageDialog/>
      <ExportResultDialog/>
      <ProjectSettingsDialog/>
    </div>
  )
}
