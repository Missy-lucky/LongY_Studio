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
import { EDGE_COLORS } from '../../types/node-system'

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
  const workflowBusy = useNodeStore(s => s.workflowBusy)
  const workflowMessage = useNodeStore(s => s.workflowMessage)
  const restoreLastProject = useNodeStore(s => s.restoreLastProject)
  const organizeLayout = useNodeStore(s => s.organizeLayout)
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
        strokeWidth: 1.5,
        opacity: e.edgeType === 'material' ? 0.5 : 1,
      },
    })), [edges])

  const onNodeClick = useCallback((_: any, node: Node) => {
    setSelected(node.id)
  }, [setSelected])

  return (
    <div className="relative h-full w-full">
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        onNodeClick={onNodeClick}
        onNodeDoubleClick={(_, node) => rf.fitView({ nodes: [{ id: node.id }], duration: 300, maxZoom: 1.2 })}
        fitView
        fitViewOptions={{ padding: 0.15, maxZoom: 1 }}
        onlyRenderVisibleElements
        panOnDrag
        zoomOnScroll={false}
        panOnScroll
        minZoom={0.7}
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
        <button onClick={() => void startGeneration()} disabled={workflowBusy} className="btn btn-primary !min-h-[36px] !rounded-xl" title="提交队列并轮询结果；真实 Provider 会先确认">
          {workflowBusy ? <Loader2 size={14} className="anim-spin"/> : <Play size={14} strokeWidth={1.5}/>}开始流程
        </button>
        <button onClick={organizeLayout} className="btn btn-secondary !min-h-[36px] !rounded-xl" title="自动整理节点布局">
          <Layers size={14} strokeWidth={1.5}/>整理布局
        </button>
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



