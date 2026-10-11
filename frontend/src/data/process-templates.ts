import type { ProcessType } from '../types/node-system'

export const PROCESS_ORDER: ProcessType[] = ['flat', 'detail', 'partial', 'model']

export const PROCESS_TITLES: Record<ProcessType, string> = {
  flat: '平面图生成',
  detail: '细节图生成',
  partial: '局部图生成',
  model: '模特图生成',
}
