import { useMemo, useCallback, DragEvent } from 'react'
import { ReactFlow, Background, BackgroundVariant, Controls, MiniMap, useReactFlow, type Edge, type Node, type NodeTypes, type NodeProps } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useWorkbench } from '../../stores/workbench-store'
import { EmptyState } from '../common/EmptyState'
import { TaskNode, MaterialNode, GroupNode, PlanNode, GateNode, ExportNode, type TaskNodeData, type MaterialNodeData, type GroupNodeData, type PlanNodeData, type GateNodeData, type ExportNodeData } from './CanvasNodes'
import { TYPE_META } from '../../lib/status'
import type { TaskType } from '../../types/domain'

const nodeTypes: NodeTypes = {
  task: TaskNode as unknown as React.ComponentType<NodeProps>,
  material: MaterialNode as unknown as React.ComponentType<NodeProps>,
  group: GroupNode as unknown as React.ComponentType<NodeProps>,
  plan: PlanNode as unknown as React.ComponentType<NodeProps>,
  gate: GateNode as unknown as React.ComponentType<NodeProps>,
  exportNode: ExportNode as unknown as React.ComponentType<NodeProps>,
}

export function FlowCanvas() {
  const project = useWorkbench(s => s.project)
  const mode = useWorkbench(s => s.mode)
  const items = useWorkbench(s => s.items)
  const materials = useWorkbench(s => s.materials)
  const categories = useWorkbench(s => s.categories)
  const tasks = useWorkbench(s => s.tasks)
  const selection = useWorkbench(s => s.selection)
  const select = useWorkbench(s => s.select)
  const statusFilter = useWorkbench(s => s.statusFilter)
  const setNewProjectOpen = useWorkbench(s => s.setNewProjectOpen)
  const importDemo = useWorkbench(s => s.importDemoAssets)
  const buildPlan = useWorkbench(s => s.buildPlan)
  const setMode = useWorkbench(s => s.setMode)
  const importFiles = useWorkbench(s => s.importFiles)
  const rf = useReactFlow()

  const visibleTasks = statusFilter ? tasks.filter(t => t.status === statusFilter) : tasks

  const { nodes, edges } = useMemo(() => {
    const nds: Node[] = []
    const eds: Edge[] = []
    if (!project) return { nodes: nds, edges: eds }

    // 列 1：素材节点（单品）
    items.forEach((item, i) => {
      const cat = categories.find(c => c.id === item.categoryId)
      const views = materials.filter(m => m.itemId === item.id)
      nds.push({
        id: `mat-${item.id}`, type: 'material', position: { x: 0, y: i * 110 },
        data: {
          item, categoryName: cat?.name ?? '未分类', viewCount: views.length,
          requiredCount: cat?.requiredViews.length ?? 0, thumbUrl: views[0]?.previewUrl ?? null,
          onOpen: () => select({ kind: 'material', id: views[0]?.id ?? '' }),
        } satisfies MaterialNodeData,
      })
      eds.push({ id: `e-mat-${item.id}`, source: `mat-${item.id}`, target: 'plan', style: { stroke: '#3B82F6', strokeWidth: 1.5 } })
    })

    // 列 2：规划节点
    const estimated = visibleTasks.reduce((a, t) => a + t.estimatedCost, 0)
    nds.push({
      id: 'plan', type: 'plan', position: { x: 240, y: Math.max(0, (items.length - 1) * 55) },
      data: { total: visibleTasks.length, estimated, cached: visibleTasks.filter(t => t.cacheHit).length } satisfies PlanNodeData,
    })

    // 列 3：四类分组 + 任务节点
    const types: TaskType[] = ['flat', 'detail', 'partial', 'model']
    let yOffset = 0
    types.forEach(type => {
      const row = visibleTasks.filter(t => t.type === type)
      const yBase = yOffset
      nds.push({
        id: `grp-${type}`, type: 'group', position: { x: 460, y: yBase },
        data: {
          label: TYPE_META[type].label, icon: TYPE_META[type].icon, total: row.length,
          done: row.filter(t => ['accepted', 'locked', 'exported'].includes(t.status)).length,
          running: row.filter(t => t.status === 'generating').length,
          failed: row.filter(t => t.status === 'failed').length,
        } satisfies GroupNodeData,
      })
      eds.push({ id: `e-plan-${type}`, source: 'plan', target: `grp-${type}`, style: { stroke: '#3B82F6', strokeWidth: 1.5 }, label: TYPE_META[type].label, labelStyle: { fontSize: 9, fill: '#A6B4C8' } })

      row.forEach((task, j) => {
        nds.push({
          id: task.id, type: 'task', position: { x: 610, y: yBase + j * 145 - 30 },
          data: {
            task, mode, selected: selection.kind === 'task' && selection.id === task.id,
            onOpen: () => select({ kind: 'task', id: task.id }),
          } satisfies TaskNodeData,
        })
        eds.push({
          id: `e-${task.id}`, source: `grp-${type}`, target: task.id,
          style: { stroke: task.status === 'failed' ? '#EF4444' : task.status === 'generating' ? '#06B6D4' : '#334155', strokeWidth: 1.2, strokeDasharray: task.status === 'failed' ? '4 3' : undefined },
          className: task.status === 'generating' ? 'edge-active' : undefined,
        })
        eds.push({
          id: `e-gate-${task.id}`, source: task.id, target: 'gate',
          style: { stroke: task.status === 'locked' || task.status === 'exported' ? '#22C55E' : task.status === 'review' ? '#A855F7' : '#334155', strokeWidth: task.status === 'locked' || task.status === 'exported' ? 2 : 1 },
        })
      })
      yOffset += Math.max(160, row.length * 145 + 20)
    })

    // 列 4：审核门
    nds.push({
      id: 'gate', type: 'gate', position: { x: 880, y: Math.max(40, yOffset / 2 - 60) },
      data: {
        review: tasks.filter(t => t.status === 'review').length,
        accepted: tasks.filter(t => t.status === 'accepted').length,
        rejected: tasks.filter(t => t.status === 'rejected').length,
        locked: tasks.filter(t => t.status === 'locked' || t.status === 'exported').length,
      } satisfies GateNodeData,
    })

    // 列 5：导出
    nds.push({
      id: 'export', type: 'exportNode', position: { x: 1080, y: Math.max(40, yOffset / 2 - 60) },
      data: { exported: tasks.filter(t => t.status === 'exported').length, path: `./exports/${project.sku}_套图` } satisfies ExportNodeData,
    })
    eds.push({ id: 'e-gate-export', source: 'gate', target: 'export', style: { stroke: '#22C55E', strokeWidth: 1.5 } })

    return { nodes: nds, edges: eds }
  }, [project, items, materials, categories, visibleTasks, mode, selection, select])

  const onDrop = useCallback((e: DragEvent) => {
    e.preventDefault()
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'))
    if (files.length) importFiles(files)
  }, [importFiles])

  if (!project) {
    return (
      <div className="flex-1 p-6" onDrop={onDrop} onDragOver={e => e.preventDefault()}>
        <EmptyState
          icon={<span className="text-2xl">🧵</span>}
          title="从第一个商品任务开始"
          description="创建项目后导入商品图，系统会按哈希去重并给出品类建议；也可以直接把图片拖到这里。"
          actions={
            <>
              <button onClick={() => setNewProjectOpen(true)} className="rounded-md bg-accent px-3 py-1.5 text-[11px] font-medium text-white hover:bg-accent/85">新建商品任务</button>
              <button className="rounded-md border border-border-subtle px-3 py-1.5 text-[11px] text-text-secondary">导入上一项目</button>
            </>
          }
        />
      </div>
    )
  }

  if (materials.length === 0) {
    return (
      <div className="flex-1 p-6" onDrop={onDrop} onDragOver={e => e.preventDefault()}>
        <EmptyState
          icon={<span className="text-2xl">🖼️</span>}
          title="先拖入商品图，系统会自动识别候选品类"
          description="支持批量拖入图片与文件夹；保留原图不改写，按哈希去重，导入后自动生成素材卡片与候选分组。"
          actions={
            <>
              <button onClick={importDemo} className="rounded-md bg-accent px-3 py-1.5 text-[11px] font-medium text-white hover:bg-accent/85">导入演示素材</button>
              <button className="rounded-md border border-border-subtle px-3 py-1.5 text-[11px] text-text-secondary">打开文件夹</button>
            </>
          }
        />
      </div>
    )
  }

  if (tasks.length === 0) {
    return (
      <div className="flex-1 p-6" onDrop={onDrop} onDragOver={e => e.preventDefault()}>
        <EmptyState
          icon={<span className="text-2xl">🗺️</span>}
          title="当前方案还没有生成任务"
          description="系统会按品类必需视角 + 默认细节/局部任务 + 启用模特组合，自动生成低清草稿任务清单与成本预估。"
          actions={
            <>
              <button onClick={buildPlan} className="rounded-md bg-accent px-3 py-1.5 text-[11px] font-medium text-white hover:bg-accent/85">自动生成方案</button>
              <button onClick={() => setMode('review')} className="rounded-md border border-border-subtle px-3 py-1.5 text-[11px] text-text-secondary">手动添加任务</button>
            </>
          }
        />
      </div>
    )
  }

  return (
    <div className="canvas-grid relative flex-1" onDrop={onDrop} onDragOver={e => e.preventDefault()}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.15, maxZoom: 1 }}
        minZoom={0.2}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        onNodeClick={(_: unknown, node: Node) => {
          if (node.type === 'task') select({ kind: 'task', id: node.id })
        }}
        onNodeDoubleClick={(_: unknown, node: Node) => {
          rf.fitView({ nodes: [{ id: node.id }], duration: 300, maxZoom: 1.2 })
        }}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1.2} color="#16203A" />
        <Controls position="bottom-left" showInteractive={false} className="!border-border-subtle !bg-bg-panel [&>button]:!border-border-subtle [&>button]:!bg-bg-panel [&>button]:!fill-text-secondary [&>button]:!text-text-secondary" />
        <MiniMap
          position="bottom-right"
          maskColor="rgba(11,17,32,.7)"
          style={{ background: 'rgba(8,13,24,.8)', border: '1px solid #1C2940', borderRadius: 10, width: 150, height: 95, backdropFilter: 'blur(4px)' }}
          nodeColor={n => n.type === 'task' ? '#3B82F6' : '#334155'}
        />
      </ReactFlow>
      <div className="pointer-events-none absolute left-3 top-3 rounded-md border border-border-subtle bg-bg-panel/85 px-2.5 py-1.5 font-mono text-[9px] text-text-secondary backdrop-blur">
        滚轮缩放 · 空格拖拽 · 双击聚焦 · F 聚焦选中 · Ctrl+K 命令面板
        {statusFilter && <span className="ml-2 text-accent">过滤中</span>}
      </div>
    </div>
  )
}

