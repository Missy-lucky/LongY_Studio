import { useEffect } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import { useWorkbench } from './stores/workbench-store'
import { useHotkeys } from './hooks/useHotkeys'
import { DesktopTitleBar } from './components/desktop/TitleBar'
import { TopBar } from './components/layout/TopBar'
import { AppMenuBar } from './components/layout/AppMenuBar'
import { NavRail } from './components/layout/NavRail'
import { NodeCanvas } from './components/nodes/NodeCanvas'
import { useNodeStore } from './stores/node-store'
import { QueueBar } from './components/layout/QueueBar'
import { CommandPalette } from './components/CommandPalette'
import { ContextMenu } from './components/ContextMenu'
import { PlanPreview } from './components/plan/PlanPreview'
import { RejectReasonDialog } from './components/review/RejectReasonDialog'
import { ExportPreviewModal } from './components/export/ExportPreviewModal'
import { NewProjectDialog } from './components/common/NewProjectDialog'
import { Lightbox } from './components/common/Lightbox'
import { ConfirmDialog } from './components/common/ConfirmDialog'
import { ErrorBoundary } from './components/common/ErrorBoundary'
import { Toasts } from './components/Toasts'

export default function App() {
  useEffect(() => {
    const dark = localStorage.getItem('lys-dark') === '1'
    const accent = localStorage.getItem('lys-accent') || 'indigo'
    const root = document.documentElement
    if (dark) root.classList.add('theme-dark')
    root.classList.add(`accent-${accent}`)
  }, [])

  useHotkeys({
    'mod+k': () => useWorkbench.getState().setPaletteOpen(!useWorkbench.getState().paletteOpen),
    'mod+p': () => useWorkbench.getState().setPaletteOpen(true),
    'mod+enter': () => {
      const st = useWorkbench.getState()
      if (st.mode === 'prepare') st.buildPlan()
    },
    'mod+s': () => useNodeStore.getState().setProjectSettingsOpen(true),
    'mod+o': () => useNodeStore.getState().setProjectLibraryOpen(true),
    'mod+1': () => useWorkbench.getState().setMode('prepare'),
    'mod+2': () => useWorkbench.getState().setMode('generate'),
    'mod+3': () => useWorkbench.getState().setMode('review'),
    'mod+4': () => useWorkbench.getState().setMode('export'),
    'escape': () => useWorkbench.getState().setLightbox(null),
  })

  return (
    <ReactFlowProvider>
      <div className="flex h-screen flex-col" style={{ background: 'var(--bg)' }}>
        <DesktopTitleBar/>
        <TopBar/>
        <AppMenuBar/>
        <div className="flex min-h-0 flex-1">
          <NavRail/>
          <main className="min-w-0 flex-1 anim-fade">
            <ErrorBoundary>
              <NodeCanvas/>
            </ErrorBoundary>
          </main>
        </div>
        <QueueBar/>

        <CommandPalette/>
        <ContextMenu/>
        <PlanPreview/>
        <RejectReasonDialog/>
        <ExportPreviewModal/>
        <NewProjectDialog/>
        <Lightbox/>
        <ConfirmDialog/>
        <Toasts/>
      </div>
    </ReactFlowProvider>
  )
}
