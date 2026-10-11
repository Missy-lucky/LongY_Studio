import { useEffect } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import { useWorkbench } from './stores/workbench-store'
import { useHotkeys } from './hooks/useHotkeys'
import { DesktopTitleBar } from './components/desktop/TitleBar'
import { TopBar } from './components/layout/TopBar'
import { AppMenuBar } from './components/layout/AppMenuBar'
import { WorkflowConsole } from './components/layout/WorkflowConsole'
import { WorkflowStatusDock } from './components/layout/WorkflowStatusDock'
import { NodeCanvas } from './components/nodes/NodeCanvas'
import { useNodeStore } from './stores/node-store'
import { PromptRevisionDrawer } from './components/review/PromptRevisionDrawer'
import { CommandPalette } from './components/CommandPalette'
import { ContextMenu } from './components/ContextMenu'
import { PlanPreview } from './components/plan/PlanPreview'
import { ShotPlanReviewDialog } from './components/nodes/ShotPlanReviewDialog'
import { LayoutSavePromptDialog } from './components/nodes/WorkflowDialogs'
import { RejectReasonDialog } from './components/review/RejectReasonDialog'
import { ExportPreviewModal } from './components/export/ExportPreviewModal'
import { NewProjectDialog } from './components/common/NewProjectDialog'
import { Lightbox } from './components/common/Lightbox'
import { ConfirmDialog } from './components/common/ConfirmDialog'
import { ErrorBoundary } from './components/common/ErrorBoundary'
import { WorkflowOnboarding } from './components/common/WorkflowOnboarding'
import { Toasts } from './components/Toasts'

export default function App() {
  useEffect(() => {
    const dark = localStorage.getItem('lys-dark') === '1'
    const accent = localStorage.getItem('lys-accent') || 'indigo'
    const experienceMode = localStorage.getItem('lys-experience-mode')
    if (experienceMode === 'normal' || experienceMode === 'novice') {
      useWorkbench.getState().setExperienceMode(experienceMode)
    }
    if (experienceMode !== 'normal' && localStorage.getItem('lys-guide-completed') !== '1') {
      useWorkbench.getState().setGuideOpen(true)
    }
    const root = document.documentElement
    if (dark) root.classList.add('theme-dark')
    root.classList.add(`accent-${accent}`)
  }, [])

  useEffect(() => {
    const guardUnload = (event: BeforeUnloadEvent) => {
      if (!useNodeStore.getState().layoutDirty) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', guardUnload)
    return () => window.removeEventListener('beforeunload', guardUnload)
  }, [])

  useHotkeys({
    'mod+k': () => useWorkbench.getState().setPaletteOpen(!useWorkbench.getState().paletteOpen),
    'mod+p': () => useWorkbench.getState().setPaletteOpen(true),
    'mod+enter': () => {
      const mode = useWorkbench.getState().mode
      const nodeStore = useNodeStore.getState()
      if (mode === 'prepare') void nodeStore.generatePlan()
      if (mode === 'generate') void nodeStore.startGeneration()
    },
    'mod+s': () => void useNodeStore.getState().saveProjectLayout(),
    'mod+o': () => useNodeStore.getState().setProjectLibraryOpen(true),
    'mod+1': () => useWorkbench.getState().setMode('prepare'),
    'mod+2': () => useWorkbench.getState().setMode('generate'),
    'mod+3': () => useWorkbench.getState().setMode('review'),
    'mod+4': () => useWorkbench.getState().setMode('export'),
    '?': () => useWorkbench.getState().setGuideOpen(true),
    'shift+?': () => useWorkbench.getState().setGuideOpen(true),
    'escape': () => {
      useWorkbench.getState().setLightbox(null)
      useNodeStore.getState().openPromptRevision(null)
      if (useWorkbench.getState().guideOpen) useWorkbench.getState().setGuideOpen(false)
    },
  })

  return (
    <ReactFlowProvider>
      <div className="flex h-screen flex-col" style={{ background: 'var(--bg)' }}>
        <DesktopTitleBar/>
        <TopBar/>
        <AppMenuBar/>
        <div className="flex min-h-0 flex-1">
          <WorkflowConsole/>
          <main className="min-w-0 flex-1 anim-fade">
            <ErrorBoundary>
              <NodeCanvas/>
            </ErrorBoundary>
          </main>
          <PromptRevisionDrawer/>
        </div>
        <WorkflowStatusDock/>

        <CommandPalette/>
        <ContextMenu/>
        <PlanPreview/>
        <ShotPlanReviewDialog/>
        <LayoutSavePromptDialog/>
        <RejectReasonDialog/>
        <ExportPreviewModal/>
        <NewProjectDialog/>
        <Lightbox/>
        <ConfirmDialog/>
        <WorkflowOnboarding/>
        <Toasts/>
      </div>
    </ReactFlowProvider>
  )
}
