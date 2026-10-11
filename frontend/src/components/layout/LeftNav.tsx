import clsx from 'clsx'
import { FolderTree, History, Images, Package, Settings, Shirt, SquareStack, User } from 'lucide-react'
import { useState } from 'react'
import { useWorkbench } from '../../stores/workbench-store'

const NAV = [
  { icon: Package, label: '项目' },
  { icon: Images, label: '素材' },
  { icon: Shirt, label: '品类' },
  { icon: SquareStack, label: '规范' },
  { icon: User, label: '模特' },
  { icon: History, label: '版本' },
  { icon: FolderTree, label: '导出' },
  { icon: Settings, label: '设置' },
]

export function LeftNav() {
  const [active, setActive] = useState('素材')
  const toast = useWorkbench(s => s.toast)
  const openExport = useWorkbench(s => s.openExport)

  return (
    <aside className="panel-left z-10 flex w-[60px] shrink-0 flex-col items-center gap-1 py-4">
      {NAV.map(n => (
        <button key={n.label}
          title={n.label}
          onClick={() => {
            setActive(n.label)
            if (n.label === '导出') openExport()
            else if (n.label !== '素材') toast('info', n.label, '已预留', false)
          }}
          className={clsx(
            'flex h-10 w-10 items-center justify-center rounded-xl transition-all duration-200',
            active === n.label
              ? 'bg-black/[0.06] dark:bg-white/[0.08]'
              : 'hover:bg-black/[0.03] dark:hover:bg-white/[0.04]'
          )}
          style={{ color: active === n.label ? 'var(--apple-text)' : 'var(--apple-text-3)' }}>
          <n.icon size={18} strokeWidth={1.8} />
        </button>
      ))}
    </aside>
  )
}
