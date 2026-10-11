/** 生成中骨架屏：与图片卡同尺寸 */
export function SkeletonCard() {
  return (
    <div className="card overflow-hidden">
      <div className="relative aspect-[4/5] w-full">
        <div className="skeleton absolute inset-0" style={{ borderRadius: 0 }}/>
        <div className="skeleton absolute left-3 top-3 h-4 w-12" style={{ borderRadius: 4 }}/>
        <div className="skeleton absolute bottom-3 left-3 h-3 w-20" style={{ borderRadius: 4 }}/>
      </div>
      <div className="p-3">
        <div className="skeleton h-3 w-3/4" style={{ borderRadius: 4 }}/>
        <div className="skeleton mt-2 h-2 w-1/2" style={{ borderRadius: 4 }}/>
      </div>
    </div>
  )
}
