import { useEffect, useRef, useState } from 'react'
import { ExternalLink, Minus, Plus, RotateCcw, X } from 'lucide-react'
import clsx from 'clsx'
import { useNodeStore } from '../../stores/node-store'

export function NodeImageViewer() {
  const viewer = useNodeStore(state => state.imageViewer)
  const close = useNodeStore(state => state.closeImageViewer)
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const dragPoint = useRef<{ x: number; y: number; offsetX: number; offsetY: number } | null>(null)

  useEffect(() => {
    setScale(1)
    setOffset({ x: 0, y: 0 })
  }, [viewer?.src])

  useEffect(() => {
    if (!viewer) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
      if (event.key === '+' || event.key === '=') setScale(value => Math.min(5, value + 0.25))
      if (event.key === '-') setScale(value => Math.max(1, value - 0.25))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [viewer, close])

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const point = dragPoint.current
      if (!point) return
      setOffset({
        x: point.offsetX + event.clientX - point.x,
        y: point.offsetY + event.clientY - point.y,
      })
    }
    const onUp = () => { dragPoint.current = null }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [])

  if (!viewer) return null
  const reset = () => {
    setScale(1)
    setOffset({ x: 0, y: 0 })
  }

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center p-8"
      style={{ background: 'rgba(8,10,16,0.9)', backdropFilter: 'blur(8px)' }}
      onMouseDown={event => { if (event.target === event.currentTarget) close() }}
    >
      <div className="flex max-h-full w-full max-w-[1500px] flex-col overflow-hidden rounded-2xl border"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-lg)' }}>
        <div className="flex items-center gap-3 border-b px-4 py-3" style={{ borderColor: 'var(--divider)' }}>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium" style={{ color: 'var(--text)' }}>{viewer.title}</div>
            {viewer.subtitle && (
              <div className="mt-0.5 truncate text-xs" style={{ color: 'var(--text-3)' }}>{viewer.subtitle}</div>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => setScale(value => Math.min(5, value + 0.25))} className="btn btn-secondary !px-2 !py-1.5" title="放大 (+)">
              <Plus size={13} strokeWidth={1.8}/>
            </button>
            <button onClick={() => setScale(value => Math.max(1, value - 0.25))} className="btn btn-secondary !px-2 !py-1.5" title="缩小 (-)">
              <Minus size={13} strokeWidth={1.8}/>
            </button>
            <button onClick={reset} className="btn btn-secondary !px-2 !py-1.5" title="重置视图">
              <RotateCcw size={13} strokeWidth={1.8}/>
            </button>
            <a href={viewer.src} target="_blank" rel="noreferrer" className="btn btn-secondary !px-2 !py-1.5" title="在新窗口打开原图">
              <ExternalLink size={13} strokeWidth={1.8}/>
            </a>
            <button onClick={close} className="btn btn-secondary !px-2 !py-1.5" title="关闭 (Esc)">
              <X size={13} strokeWidth={1.8}/>
            </button>
          </div>
        </div>

        <div
          className={clsx('relative flex min-h-0 flex-1 items-center justify-center overflow-hidden', scale > 1 ? 'cursor-grab active:cursor-grabbing' : 'cursor-zoom-in')}
          style={{
            background: 'repeating-conic-gradient(#eef0f4 0% 25%, #ffffff 0% 50%) 50%/24px 24px',
          }}
          onDoubleClick={() => {
            if (scale === 1) setScale(2)
            else reset()
          }}
          onPointerDown={event => {
            if (scale <= 1) return
            dragPoint.current = { x: event.clientX, y: event.clientY, offsetX: offset.x, offsetY: offset.y }
          }}
        >
          <img
            src={viewer.src}
            alt={viewer.title}
            draggable={false}
            className="max-h-[78vh] max-w-full select-none object-contain"
            style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`, transformOrigin: 'center center' }}
          />
          <div className="absolute bottom-3 right-4 rounded-full bg-black/60 px-2.5 py-1 font-mono text-[10px] text-white">
            {Math.round(scale * 100)}%
          </div>
        </div>

        <div className="border-t px-4 py-2 text-[10px]" style={{ borderColor: 'var(--divider)', color: 'var(--text-3)' }}>
          双击图片可在 100% / 200% 间切换；放大后可拖拽平移；Esc 关闭。
        </div>
      </div>
    </div>
  )
}
