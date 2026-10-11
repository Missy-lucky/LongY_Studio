import { useEffect } from 'react'

type Handler = (e: KeyboardEvent) => void

/** 全局快捷键 Hook：自动忽略输入框内的触发 */
export function useHotkeys(map: Record<string, Handler>) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA' || el?.isContentEditable) {
        // 输入框内只允许 Esc 和 Cmd+K
        if (e.key === 'Escape' || ((e.ctrlKey || e.metaKey) && e.key === 'k')) {
          // fallthrough
        } else return
      }
      const mod = e.ctrlKey || e.metaKey
      const key = e.key.toLowerCase()
      const combo = [
        mod && e.shiftKey ? 'mod+shift+' : mod ? 'mod+' : '',
        e.shiftKey && !mod ? 'shift+' : '',
        key,
      ].join('')
      const fn = map[combo] || map[key]
      if (fn) {
        e.preventDefault()
        fn(e)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [map])
}
