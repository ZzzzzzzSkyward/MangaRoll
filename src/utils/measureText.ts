export const DANMAKU_FONT_FAMILY = "'PingFang SC', 'Microsoft YaHei', sans-serif"
export const DANMAKU_WEIGHT = 'bold'

let ctx: CanvasRenderingContext2D | null = null

function resolveCtx(): CanvasRenderingContext2D | null {
  if (ctx) return ctx
  try {
    if (typeof OffscreenCanvas !== 'undefined') {
      ctx = new OffscreenCanvas(1, 1).getContext('2d')
    } else {
      ctx = document.createElement('canvas').getContext('2d')
    }
  } catch {
    ctx = null
  }
  return ctx
}

export function measureTextWidth(text: string, fontSize: number, fontFamily?: string): number {
  const c = resolveCtx()
  if (!c) return text.length * fontSize * 0.6
  c.font = `${DANMAKU_WEIGHT} ${fontSize}px ${fontFamily || DANMAKU_FONT_FAMILY}`
  return c.measureText(text).width
}