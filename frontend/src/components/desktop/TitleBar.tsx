import { useEffect, useState } from 'react'
import { Maximize2, Minus, Square, X } from 'lucide-react'
import { useNodeStore } from '../../stores/node-store'

declare global {
  interface Window {
    desktopAPI?: {
      platform: string; isElectron: boolean
      minimize: () => void; maximize: () => void; close: () => void
      confirmClose: () => void
      selectDirectory: () => Promise<string | null>
      openPath: (targetPath: string) => Promise<string>
      onBeforeClose: (cb: () => void) => void
      onMaximized: (cb: (v: boolean) => void) => void
    }
  }
}

export function DesktopTitleBar() {
  const [isElectron, setIsElectron] = useState(false)
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    if (!window.desktopAPI?.isElectron) return
    setIsElectron(true)
    window.desktopAPI.onMaximized(setMaximized)
    window.desktopAPI.onBeforeClose(() => useNodeStore.getState().requestAppClose())
  }, [])

  if (!isElectron) return null

  const btn: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: 32, height: 24, borderRadius: 6,
    color: 'var(--color-text-3)', background: 'transparent', border: 'none', cursor: 'pointer',
    transition: 'all 0.15s ease-out',
  }

  return (
    <div className="titlebar-drag relative z-[200] flex h-9 shrink-0 items-center justify-between px-3"
      style={{ background: 'transparent' }}>
      <div className="flex items-center gap-2 pl-2">
        <span className="text-[10px] font-medium tracking-widest" style={{ color: 'var(--color-text-3)' }}>
          LONGY STUDIO
        </span>
      </div>
      <div className="titlebar-no-drag flex items-center gap-0.5">
        <button style={btn} onClick={() => window.desktopAPI?.minimize()}
          onMouseEnter={e => { e.currentTarget.style.background='rgba(255,255,255,0.06)'; e.currentTarget.style.color='var(--color-text)' }}
          onMouseLeave={e => { e.currentTarget.style.background='transparent'; e.currentTarget.style.color='var(--color-text-3)' }}>
          <Minus size={13} strokeWidth={1.5}/>
        </button>
        <button style={btn} onClick={() => window.desktopAPI?.maximize()}
          onMouseEnter={e => { e.currentTarget.style.background='rgba(255,255,255,0.06)'; e.currentTarget.style.color='var(--color-text)' }}
          onMouseLeave={e => { e.currentTarget.style.background='transparent'; e.currentTarget.style.color='var(--color-text-3)' }}>
          {maximized ? <Square size={11} strokeWidth={1.5}/> : <Maximize2 size={11} strokeWidth={1.5}/>}
        </button>
        <button style={btn} onClick={() => window.desktopAPI?.close()}
          onMouseEnter={e => { e.currentTarget.style.background='rgba(248,113,113,0.15)'; e.currentTarget.style.color='#F87171' }}
          onMouseLeave={e => { e.currentTarget.style.background='transparent'; e.currentTarget.style.color='var(--color-text-3)' }}>
          <X size={14} strokeWidth={1.5}/>
        </button>
      </div>
    </div>
  )
}
