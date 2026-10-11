import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { useWorkbench } from '../../stores/workbench-store'
import { Modal } from './Modal'

export function NewProjectDialog() {
  const open = useWorkbench(s => s.newProjectOpen)
  const setOpen = useWorkbench(s => s.setNewProjectOpen)
  const newProject = useWorkbench(s => s.newProject)
  const importDemo = useWorkbench(s => s.importDemoAssets)
  const [sku, setSku] = useState('A200')
  const [name, setName] = useState('春季衬衫套装')
  const [platform, setPlatform] = useState('淘宝')
  const [style, setStyle] = useState('简约通勤')
  const [budget, setBudget] = useState(100)

  if (!open) return null
  return (
    <Modal
      title="新建商品任务"
      subtitle="必填：商品编号、商品名称；编号参与默认导出命名，创建后修改会提示影响"
      onClose={() => setOpen(false)}
      width="max-w-lg"
      footer={
        <>
          <button onClick={() => setOpen(false)} className="rounded-md border border-border-subtle px-3 py-1.5 text-[11px] text-text-secondary">取消</button>
          <button disabled={!sku.trim() || !name.trim()}
            onClick={() => { newProject({ sku: sku.trim(), name: name.trim(), platform, style, budget }); setOpen(false); setTimeout(importDemo, 100) }}
            className="flex items-center gap-1.5 rounded-md bg-accent px-4 py-1.5 text-[11px] font-medium text-white hover:bg-accent/85 disabled:opacity-40">
            <Sparkles size={12} />创建并导入演示素材
          </button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="商品编号 *" value={sku} onChange={setSku} placeholder="A200" />
        <Field label="商品名称 *" value={name} onChange={setName} placeholder="春季衬衫套装" />
        <Field label="平台" value={platform} onChange={setPlatform} placeholder="淘宝 / 抖音 / 拼多多" />
        <Field label="目标风格" value={style} onChange={setStyle} placeholder="简约通勤" />
        <Field label="单次预算上限（¥）" value={String(budget)} onChange={v => setBudget(Number(v) || 0)} placeholder="100" />
      </div>
      <p className="mt-3 rounded-md bg-bg-app p-2 text-[10px] leading-4 text-text-muted">
        预算达到 80% 提醒，达到 100% 自动暂停未开始任务；支持从上一套商品复制配置（v0.1 预留）。
      </p>
    </Modal>
  )
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] text-text-secondary">{label}</span>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="rounded-md border border-border-subtle bg-bg-app px-2.5 py-1.5 text-[11px] outline-none placeholder:text-text-muted focus:border-accent/60" />
    </label>
  )
}

