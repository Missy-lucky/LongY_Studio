import type { ReactNode } from 'react'

export function EmptyState({ icon, title, description, actions }: { icon: ReactNode; title: string; description: string; actions?: ReactNode }) {
  return (
    <div className="anim-float-in flex h-full w-full flex-col items-center justify-center gap-5 rounded-3xl border border-dashed border-border-subtle bg-bg-card/30 p-12 text-center backdrop-blur-sm">
      <div className="relative">
        <div className="absolute inset-0 rounded-3xl bg-accent/15 blur-3xl" />
        <div className="relative flex h-[72px] w-[72px] items-center justify-center rounded-3xl border border-accent/25 bg-accent-soft text-3xl shadow-xl">
          {icon}
        </div>
      </div>
      <div>
        <div className="text-[15px] font-bold tracking-wide">{title}</div>
        <div className="mx-auto mt-2 max-w-[380px] text-[12px] leading-5 text-text-secondary">{description}</div>
      </div>
      {actions && (
        <div className="anim-float-in flex items-center gap-3 pt-2" style={{ animationDelay: '0.1s' }}>
          {actions}
        </div>
      )}
    </div>
  )
}

