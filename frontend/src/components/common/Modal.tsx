import type { ReactNode } from 'react'
import { X } from 'lucide-react'

export function Modal({ title, subtitle, onClose, children, footer, width = 'max-w-3xl' }: {
  title: string; subtitle?: string; onClose: () => void; children: ReactNode; footer?: ReactNode; width?: string
}) {
  return (
    <div className="anim-float-in fixed bg-[rgba(3,5,10,0.7)] backdrop-blur-xl inset-0 z-[110] flex items-center justify-center p-6" onMouseDown={onClose}>
      <div className={`anim-modal-pop card-float !border-border-light flex max-h-[86vh] w-full ${width} flex-col overflow-hidden rounded-2xl shadow-2xl`}
        onMouseDown={e => e.stopPropagation()}>
        {/* 顶部渐变装饰线 */}
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-accent/50 via-ai/40 to-transparent" />
        <div className="flex items-start justify-between border-b border-border-subtle/50 px-6 py-4">
          <div>
            <div className="text-[15px] font-bold tracking-wide">{title}</div>
            {subtitle && <div className="mt-1 text-[11px] leading-4 text-text-secondary">{subtitle}</div>}
          </div>
          <button onClick={onClose}
            className="btn-premium rounded-lg p-1.5 text-text-muted transition-all hover:bg-white/5 hover:text-text-primary">
            <X size={15} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-2.5 border-t border-border-subtle/50 bg-bg-deep/40 px-6 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}


