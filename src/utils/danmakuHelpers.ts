import type { DanmakuItem } from '../types/danmaku'

export const DEFAULT_FONT_SIZE = 28
export const DEFAULT_LANE_HEIGHT = 28
export const DEFAULT_COLOR = '#ffffff'
export const DEFAULT_WEIGHT = 'bold'
export const DEFAULT_SHADOW = '0 0 4px rgba(0,0,0,0.8)'

const SIZE_MAP: Record<string, number> = { small: 22, normal: 28, large: 36 }

export function toDanmakuItem(raw: unknown, id: string | number): DanmakuItem {
  const r = raw as Record<string, unknown>
  const sizeNum = typeof r?.size === 'string' ? SIZE_MAP[r.size] : undefined
  return {
    id,
    text: String(r?.text ?? ''),
    color: typeof r?.color === 'string' ? r.color : undefined,
    fontSize: sizeNum || (typeof r?.fontSize === 'number' ? (r.fontSize as number) : undefined),
    weight: typeof r?.weight === 'string' ? (r.weight as string) : DEFAULT_WEIGHT,
    shadow: typeof r?.shadow === 'string' ? (r.shadow as string) : DEFAULT_SHADOW,
  }
}

export function toDanmakuItems(raw: unknown): DanmakuItem[] {
  if (!Array.isArray(raw)) return []
  return raw.map((it, i) => toDanmakuItem(it, i))
}

export function reinsertRandom<T>(arr: T[], item: T): void {
  const pos = Math.floor(Math.random() * (arr.length + 1))
  arr.splice(pos, 0, item)
}