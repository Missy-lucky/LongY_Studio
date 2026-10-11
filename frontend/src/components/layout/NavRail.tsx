import clsx from 'clsx'
import { FolderTree, HelpCircle, History, Image, Package, Settings, Shirt, User } from 'lucide-react'
import { useState } from 'react'
import { useWorkbench } from '../../stores/workbench-store'

const NAV = [
  { icon: Package, label: '项目' },
  { icon: Image, label: '素材' },
  { icon: Shirt, label: '品类' },
  { icon: User, label: '模特' },
  { icon: History, label: '版本' },
  { icon: FolderTree, label: '导出' },
]

export function NavRail() {
  const [active, setActive] = useState('素材')
  const toast = useWorkbench(s => s.toast)

  return (
    <nav className="flex w-[68px] shrink-0 flex-col items-center gap-1 py-3"
      style={{ background: 'var(--bg-2)' }}>
      {NAV.map(n => (
        <button key={n.label}
          onClick={() => {
            setActive(n.label)
            if (n.label === '导出') useWorkbench.getState().openExport()
            else if (n.label !== '素材') toast('info', n.label, '模块已预留', false)
          }}
          className={clsx(
            'flex w-[56px] flex-col items-center gap-0.5 rounded-xl py-2 transition-all duration-150 hover:scale-105 active:scale-95',
            active === n.label ? 'bg-[var(--surface)] shadow-sm' : 'hover:bg-[var(--surface-hover)]'
          )}
          style={{ color: active === n.label ? 'var(--primary)' : 'var(--text-3)' }}>
          <n.icon size={18} strokeWidth={1.5}/>
          <span className="text-[10px] font-medium">{n.label}</span>
        </button>
      ))}

      {/* 底部：设置 + 帮助 */}
      <div className="flex-1"/>
      <button onClick={() => toast('info', '设置', '偏好设置面板已预留', false)}
        className="flex w-[56px] flex-col items-center gap-0.5 rounded-xl py-2 transition-all hover:bg-[var(--surface-hover)]"
        style={{ color: 'var(--text-3)' }}>
        <Settings size={18} strokeWidth={1.5}/>
        <span className="text-[10px]">设置</span>
      </button>
      <button onClick={() => {
        const st = useWorkbench.getState()
        st.toast('info', '快捷键一览',
          'Ctrl+K 搜索 · Ctrl+1~4 切模式 · Ctrl+Enter 生成 · Ctrl+R 重生成 · Ctrl+S 保存 · 图片右键菜单', false)
      }}
        className="flex w-[56px] flex-col items-center gap-0.5 rounded-xl py-2 transition-all hover:bg-[var(--surface-hover)]"
        style={{ color: 'var(--text-3)' }}
        title="点击查看快捷键">
        <HelpCircle size={18} strokeWidth={1.5}/>
        <span className="text-[10px]">帮助</span>
      </button>
    </nav>
  )
}
