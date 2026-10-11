/**
 * 主题切换器：基础模式 × 强调色
 * 参考 shadcn/ui 的主题系统（CSS 变量 + class 切换）
 */
import { useState, useEffect, useRef } from 'react'
import clsx from 'clsx'
import { Check, Moon, Palette, Sun, Star } from 'lucide-react'

export type BaseTheme = 'dark' | 'light' | 'midnight'
export type AccentColor = 'blue' | 'violet' | 'emerald' | 'rose' | 'amber' | 'cyan'

const BASE_THEMES: { id: BaseTheme; label: string; icon: typeof Sun }[] = [
  { id: 'dark', label: '深色', icon: Moon },
  { id: 'light', label: '浅色', icon: Sun },
  { id: 'midnight', label: '午夜', icon: Star },
]

const ACCENTS: { id: AccentColor; label: string; color: string }[] = [
  { id: 'blue', label: '蓝', color: '#5B8CFF' },
  { id: 'violet', label: '紫', color: '#A78BFA' },
  { id: 'emerald', label: '翠', color: '#34D399' },
  { id: 'rose', label: '玫', color: '#FB7185' },
  { id: 'amber', label: '琥珀', color: '#FBBF24' },
  { id: 'cyan', label: '青', color: '#22D3EE' },
]

export function applyTheme(base: BaseTheme, accent: AccentColor) {
  const root = document.documentElement
  // 移除旧主题类
  root.className = root.className.replace(/theme-\w+/g, '').replace(/accent-\w+/g, '').trim()
  // 添加新主题类
  root.classList.add(`theme-${base}`, `accent-${accent}`)
  // 持久化
  localStorage.setItem('lys-theme-base', base)
  localStorage.setItem('lys-theme-accent', accent)
}

export function initTheme(): [BaseTheme, AccentColor] {
  const base = (localStorage.getItem('lys-theme-base') as BaseTheme) || 'light'
  const accent = (localStorage.getItem('lys-theme-accent') as AccentColor) || 'blue'
  applyTheme(base, accent)
  return [base, accent]
}

export function ThemeSwitcher() {
  const [open, setOpen] = useState(false)
  const [base, setBase] = useState<BaseTheme>('light')
  const [accent, setAccent] = useState<AccentColor>('blue')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const [b, a] = initTheme()
    setBase(b)
    setAccent(a)
  }, [])

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const select = (b: BaseTheme, a: AccentColor) => {
    setBase(b)
    setAccent(a)
    applyTheme(b, a)
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex h-8 w-8 items-center justify-center rounded-xl border border-border-subtle bg-bg-card text-text-muted transition-all hover:border-border-light hover:text-text-primary"
        title="主题设置">
        <Palette size={14} />
      </button>

      {open && (
        <div className="anim-float-in absolute right-0 top-10 z-[300] w-[240px] rounded-2xl border border-border-subtle bg-bg-elevated p-4 shadow-2xl backdrop-blur-xl">
          {/* 基础模式 */}
          <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-text-muted">模式</div>
          <div className="mb-4 grid grid-cols-3 gap-2">
            {BASE_THEMES.map(t => (
              <button key={t.id}
                onClick={() => select(t.id, accent)}
                className={clsx(
                  'flex flex-col items-center gap-1.5 rounded-xl border py-3 transition-all',
                  base === t.id
                    ? 'border-accent bg-accent/10 shadow-sm'
                    : 'border-border-subtle hover:border-border-light hover:bg-bg-hover'
                )}>
                <t.icon size={16} className={base === t.id ? 'text-accent' : 'text-text-muted'} />
                <span className={clsx('text-[10px] font-medium', base === t.id ? 'text-accent' : 'text-text-secondary')}>{t.label}</span>
              </button>
            ))}
          </div>

          {/* 强调色 */}
          <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-text-muted">强调色</div>
          <div className="grid grid-cols-6 gap-2">
            {ACCENTS.map(a => (
              <button key={a.id}
                onClick={() => select(base, a.id)}
                title={a.label}
                className={clsx(
                  'group relative flex h-8 w-8 items-center justify-center rounded-full transition-all hover:scale-110',
                  accent === a.id ? 'ring-2 ring-offset-2 ring-offset-bg-elevated' : ''
                )}
                style={{
                  background: `${a.color}20`,
                  boxShadow: accent === a.id ? `0 0 12px ${a.color}40` : undefined,
                  ['--tw-ring-color' as string]: a.color,
                }}>
                <span className="h-3.5 w-3.5 rounded-full" style={{ background: a.color }} />
                {accent === a.id && (
                  <Check size={10} className="absolute inset-0 m-auto text-white" strokeWidth={3} />
                )}
              </button>
            ))}
          </div>

          {/* 当前组合 */}
          <div className="mt-4 rounded-lg bg-bg-deep px-3 py-2 text-center text-[10px] text-text-muted">
            {BASE_THEMES.find(t => t.id === base)?.label} · {ACCENTS.find(a => a.id === accent)?.label}
          </div>
        </div>
      )}
    </div>
  )
}

