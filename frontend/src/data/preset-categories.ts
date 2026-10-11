import type { CategoryType, ModelStyle } from '../types/node-system'
import allCategories from '../../../asset-library/categories/all.json'
import modelStyles from '../../../asset-library/model-library/model-styles.json'

/** 品类与模特风格唯一来源：asset-library/，前端不再复制业务规则。 */
export const PRESET_CATEGORIES: CategoryType[] = allCategories as CategoryType[]
export const DEFAULT_INPUT_NODES = ['top', 'pants', 'shoes', 'belt']
export const MODEL_STYLES: ModelStyle[] = modelStyles as ModelStyle[]

/** 按大类分组 */
export const CATEGORIES_BY_GROUP = PRESET_CATEGORIES.reduce<Record<string, CategoryType[]>>((acc, c) => {
  if (!acc[c.group]) acc[c.group] = []
  acc[c.group].push(c)
  return acc
}, {})

/** 根据 ID 查找 */
export function findCategory(id: string): CategoryType | undefined {
  return PRESET_CATEGORIES.find(c => c.id === id)
}
