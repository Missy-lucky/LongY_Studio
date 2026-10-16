import type { CategoryConfig, ModelProfile, SpecTemplate } from '../types/domain'
import { placeholderThumb } from '../lib/placeholder'
import top from '../../../asset-library/categories/top.json'
import pants from '../../../asset-library/categories/pants.json'
import belt from '../../../asset-library/categories/belt.json'
import shoes from '../../../asset-library/categories/shoes.json'
import specFlat from '../../../asset-library/reference-styles/spec-flat.json'
import specDetail from '../../../asset-library/reference-styles/spec-detail.json'
import specPartial from '../../../asset-library/reference-styles/spec-partial.json'
import specModel from '../../../asset-library/reference-styles/spec-model.json'
import chineseGrand from '../../../asset-library/model-library/chinese-grand.json'
import koreanSweetcool from '../../../asset-library/model-library/korean-sweetcool.json'
import westernChic from '../../../asset-library/model-library/western-chic.json'

export const BUILT_IN_CATEGORIES: CategoryConfig[] = [top, pants, belt, shoes] as CategoryConfig[]
export const BUILT_IN_SPECS: SpecTemplate[] = [specFlat, specDetail, specPartial, specModel] as SpecTemplate[]

const finalModels = [chineseGrand, koreanSweetcool, westernChic]
export const BUILT_IN_MODELS: ModelProfile[] = finalModels.map((model, index) => ({
  ...model,
  avatarUrl: `/api/library/models/${model.id}/reference?variant=preview`,
  favorite: index === 0,
}))

export const MODEL_ANGLES = ['正面全身', '侧面全身', '背面全身', '动态行走']

/** 演示素材：真实导入走拖拽/文件选择，哈希由后端计算 */
export function buildDemoMaterials(sku: string) {
  const defs = [
    { item: '针织高领上衣', cat: 'top', views: ['正面', '反面', '侧面', '细节', '材质'], color: '燕麦色 / 粗针织', points: '重磅针织，廓形挺阔', hue: 1 },
    { item: '直筒休闲裤', cat: 'pants', views: ['正面', '反面', '侧面', '裤脚', '材质'], color: '炭灰 / 斜纹布', points: '直筒显瘦，裤脚卷边', hue: 2 },
    { item: '真皮腰带', cat: 'belt', views: ['正面', '扣头特写', '孔位'], color: '黑色 / 头层牛皮', points: '黄铜扣头，手工油边', hue: 3 },
  ]
  const materials = [] as any[]
  const items = [] as any[]
  defs.forEach((d, di) => {
    const itemId = `${sku}-item-${di + 1}`
    items.push({
      id: itemId,
      name: d.item,
      categoryId: d.cat,
      colorMaterial: d.color,
      sellingPoints: d.points,
      isSellable: true,
      structureFacts: {},
    })
    d.views.forEach((v, vi) => {
      const id = `${itemId}-m${vi + 1}`
      materials.push({
        id, name: `${d.item}-${v}.jpg`, hash: `sha256:${sku}-${di}-${vi}-${(d.hue * 131 + vi)}`,
        size: 1024 * (180 + di * 40 + vi * 15), width: 2400, height: 3000,
        previewUrl: placeholderThumb(id, `${d.item}\n${v}`, d.hue + vi),
        categoryId: d.cat, viewSlot: v, itemId, duplicated: false,
      })
    })
  })
  return { items, materials }
}
