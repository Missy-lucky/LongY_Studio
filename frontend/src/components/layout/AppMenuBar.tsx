import { useEffect, useRef, useState } from 'react'
import { ChevronRight, FolderOpen, Keyboard, Maximize2, Plus, Save, Settings2, Sparkles } from 'lucide-react'
import clsx from 'clsx'
import { useNodeStore } from '../../stores/node-store'
import { useWorkbench } from '../../stores/workbench-store'
import { ProjectLibraryDialog } from './ProjectLibraryDialog'
import { ProviderSettingsDialog } from './ProviderSettingsDialog'

interface MenuItem {
  label: string
  icon?: typeof Plus
  shortcut?: string
  disabled?: boolean
  danger?: boolean
  action?: () => void
}

export function AppMenuBar() {
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const busy = useNodeStore(state => state.workflowBusy)
  const resetCanvas = useNodeStore(state => state.resetCanvas)
  const setProjectLibraryOpen = useNodeStore(state => state.setProjectLibraryOpen)
  const setProjectSettingsOpen = useNodeStore(state => state.setProjectSettingsOpen)
  const setProviderSettingsOpen = useNodeStore(state => state.setProviderSettingsOpen)
  const setTypePickerOpen = useNodeStore(state => state.setTypePickerOpen)
  const setModelPickerOpen = useNodeStore(state => state.setModelPickerOpen)
  const exportLocked = useNodeStore(state => state.exportLocked)
  const saveProjectLayout = useNodeStore(state => state.saveProjectLayout)
  const requestFitView = useNodeStore(state => state.requestFitView)
  const providerId = useNodeStore(state => state.providerId)
  const setProviderId = useNodeStore(state => state.setProviderId)
  const providers = useNodeStore(state => state.providers)
  const toast = useWorkbench(state => state.toast)

  useEffect(() => {
    const close = () => setOpenMenu(null)
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openMenu])

  const menus: Array<{ id: string; label: string; items: MenuItem[] }> = [
    {
      id: 'file', label: '文件',
      items: [
        { label: '新建项目', icon: Plus, disabled: busy, action: resetCanvas },
        { label: '打开项目库…', icon: FolderOpen, shortcut: 'Ctrl+O', disabled: busy, action: () => setProjectLibraryOpen(true) },
        { label: '保存画布布局', icon: Save, shortcut: 'Ctrl+S', disabled: busy, action: () => void saveProjectLayout() },
        { label: '保存项目资料…', icon: Settings2, disabled: busy, action: () => setProjectSettingsOpen(true) },
        { label: '导出锁定图…', icon: Save, disabled: busy, action: () => void exportLocked() },
      ],
    },
    {
      id: 'edit', label: '编辑',
      items: [
        { label: '添加素材部位…', icon: Plus, action: () => setTypePickerOpen(true) },
        { label: '切换模特身份…', icon: Sparkles, action: () => setModelPickerOpen(true) },
      ],
    },
    {
      id: 'layout', label: '布局',
      items: [
        { label: '适配全部节点', icon: Maximize2, action: requestFitView },
      ],
    },
    {
      id: 'options', label: '选项',
      items: [
        { label: 'Provider 与 API Key 设置…', icon: Settings2, action: () => setProviderSettingsOpen(true) },
        ...(providers.length ? providers.map(provider => ({
          label: provider.name + (provider.available === false ? '（未配置）' : ''),
          icon: ChevronRight,
          disabled: provider.available === false || provider.id === providerId,
          action: () => setProviderId(provider.id),
        })) : [
          { label: 'Mock 生图引擎', icon: ChevronRight, disabled: providerId === 'mock', action: () => setProviderId('mock') },
        ]),
      ],
    },
    {
      id: 'help', label: '帮助',
      items: [
        {
          label: '快捷键与工作流说明', icon: Keyboard,
          action: () => toast('info', '常用操作', 'Ctrl+K 命令面板；Ctrl+Enter 生成方案；双击图片放大；Esc 关闭弹窗', true),
        },
        { label: '生成选项与目录说明', icon: Settings2, action: () => toast('info', '目录说明', '素材与生成结果保存在 storage/；导出文件写入 storage/exports/，重名不覆盖', true) },
      ],
    },
  ]

  return (
    <div ref={rootRef} className="relative z-[90] flex h-9 shrink-0 items-center gap-1 border-b px-3"
      style={{ background: 'var(--surface)', borderColor: 'var(--divider)' }}>
      {openMenu && (
        <div
          className="fixed inset-0 z-0 cursor-default"
          onPointerDown={event => {
            event.preventDefault()
            event.stopPropagation()
            setOpenMenu(null)
          }}
        />
      )}
      {menus.map(menu => (
        <div key={menu.id} className="relative">
          <button
            onClick={() => setOpenMenu(current => current === menu.id ? null : menu.id)}
            onMouseEnter={() => { if (openMenu) setOpenMenu(menu.id) }}
            className={clsx('flex !min-h-[28px] items-center rounded-md px-2.5 text-[12px] transition-colors',
              openMenu === menu.id ? 'bg-[var(--surface-hover)] text-text-primary' : 'text-text-secondary hover:text-text-primary')}
            style={{ color: openMenu === menu.id ? 'var(--text)' : undefined }}>
            {menu.label}
          </button>

          {openMenu === menu.id && (
            <div className="absolute left-0 top-[32px] z-10 w-[260px] overflow-hidden rounded-xl border py-1.5"
              style={{ background: 'var(--surface)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-lg)' }}>
              {menu.items.map(item => (
                <button
                  key={item.label}
                  disabled={item.disabled}
                  onClick={() => {
                    if (item.disabled) return
                    setOpenMenu(null)
                    item.action?.()
                  }}
                  className={clsx('flex !min-h-[36px] w-full items-center gap-2.5 px-3 text-left text-[12px] transition-colors',
                    item.disabled ? 'cursor-not-allowed text-text-muted opacity-50' : 'text-text-secondary hover:bg-[var(--surface-hover)] hover:text-text-primary')}>
                  {item.icon ? <item.icon size={14} strokeWidth={1.6}/> : <span className="w-[14px]"/>}
                  <span className="flex-1">{item.label}</span>
                  {item.shortcut && <span className="kbd">{item.shortcut}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}

      <ProjectLibraryDialog/>
      <ProviderSettingsDialog/>
    </div>
  )
}
