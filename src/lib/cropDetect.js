// 智能裁剪：检测漫画页四周的纯白/纯黑边，返回自然像素坐标的裁剪矩形。
// 输入任意可绘制图像（Image / Canvas / ImageBitmap），内部缩小后分析，无重新编码。
// 返回 { top, right, bottom, left }（自然像素）；无背景 / 整页纯色 / 无需裁剪时返回 null。

const THUMB_MAX = 512 // 缩略边长，分析精度足够且开销小

const WHITE_THRESHOLD = 230 // 像素三通道均 ≥ 此值视为白背景
const BLACK_THRESHOLD = 25 // 像素三通道均 ≤ 此值视为黑背景
const MAX_NON_BG = 0.05 // 一行/列中非背景像素占比上限（≥95% 纯色判为空白边）

export function detectCrop(image) {
  const w = image.width || image.naturalWidth
  const h = image.height || image.naturalHeight
  if (!w || !h) return null
  const scale = Math.min(1, THUMB_MAX / Math.max(w, h))
  const tw = Math.max(1, Math.round(w * scale))
  const th = Math.max(1, Math.round(h * scale))
  const c = document.createElement('canvas')
  c.width = tw
  c.height = th
  const ctx = c.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  ctx.drawImage(image, 0, 0, tw, th)
  const data = ctx.getImageData(0, 0, tw, th).data

  // 四角采样判断背景类型
  const r0 = data[0]
  const g0 = data[1]
  const b0 = data[2]
  const w1 = tw - 1
  const h1 = th - 1
  const idx = (x, y) => (y * tw + x) * 4
  const corners = [
    [r0, g0, b0],
    [data[(idx(w1, 0))], data[idx(w1, 0) + 1], data[idx(w1, 0) + 2]],
    [data[idx(0, h1)], data[idx(0, h1) + 1], data[idx(0, h1) + 2]],
    [data[idx(w1, h1)], data[idx(w1, h1) + 1], data[idx(w1, h1) + 2]],
  ]
  const lum = (p) => (p[0] + p[1] + p[2]) / 3
  const maxLum = Math.max(...corners.map(lum))
  const minLum = Math.min(...corners.map(lum))
  const isWhiteBg = maxLum >= WHITE_THRESHOLD && minLum >= WHITE_THRESHOLD * 0.92
  const isBlackBg = minLum <= BLACK_THRESHOLD && maxLum <= BLACK_THRESHOLD * 1.15
  if (!isWhiteBg && !isBlackBg) return null
  const bg = isWhiteBg ? 'white' : 'black'

  const isBgPixel = (x, y) => {
    const i = idx(x, y)
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    if (bg === 'white') return r >= WHITE_THRESHOLD && g >= WHITE_THRESHOLD && b >= WHITE_THRESHOLD
    return r <= BLACK_THRESHOLD && g <= BLACK_THRESHOLD && b <= BLACK_THRESHOLD
  }

  const blankRow = (y) => {
    let bgCount = 0
    for (let x = 0; x < tw; x += 2) if (isBgPixel(x, y)) bgCount++
    return bgCount / Math.ceil(tw / 2) >= 1 - MAX_NON_BG
  }
  const blankCol = (x) => {
    let bgCount = 0
    for (let y = 0; y < th; y += 2) if (isBgPixel(x, y)) bgCount++
    return bgCount / Math.ceil(th / 2) >= 1 - MAX_NON_BG
  }

  let top = 0
  while (top < th - 1 && blankRow(top)) top++
  let bottom = 0
  while (bottom < th - 1 && blankRow(th - 1 - bottom)) bottom++
  let left = 0
  while (left < tw - 1 && blankCol(left)) left++
  let right = 0
  while (right < tw - 1 && blankCol(tw - 1 - right)) right++

  if (top + bottom >= th - 1 || left + right >= tw - 1) return null // 整页纯色
  // 无可见边（四周都贴边读到内容），无意义裁剪
  if (top < 1 && bottom < 1 && left < 1 && right < 1) return null

  return {
    top: Math.round((top / scale)),
    right: Math.round((right / scale)),
    bottom: Math.round((bottom / scale)),
    left: Math.round((left / scale)),
  }
}