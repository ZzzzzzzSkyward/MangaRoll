import { ocrConfig } from './ocrConfig'
import { runAzure } from './ocrAzure'
import { runGeneric } from './ocrGeneric'

// OCR 客户端：按 page.key 内存缓存，1 并发限流（避免同时发起大量云端请求/占用网络）。
// 生成分析图（长边 ≤2000 JPEG）→ 调 provider → 归一化到图片坐标（0~1）。
const cache = new Map()
let chain = Promise.resolve()
const MAX_SIDE = 2000

function loadImage(src, crossOrigin) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('OCR 分析图加载失败'))
    if (crossOrigin) img.crossOrigin = crossOrigin
    img.src = src
  })
}

async function makeAnalysis(page) {
  const src = page.remote ? page.src : page.url
  const img = await loadImage(src, page.remote ? 'anonymous' : undefined)
  const w = img.naturalWidth || page.w || 1
  const h = img.naturalHeight || page.h || 1
  const scale = Math.min(1, MAX_SIDE / Math.max(w, h))
  const nw = Math.max(1, Math.round(w * scale))
  const nh = Math.max(1, Math.round(h * scale))
  const canvas = document.createElement('canvas')
  canvas.width = nw
  canvas.height = nh
  const ctx = canvas.getContext('2d')
  ctx.drawImage(img, 0, 0, nw, nh)
  const blob = await new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.85))
  return { blob, nw, nh }
}

export function runOcr(page) {
  if (cache.has(page.key)) return cache.get(page.key)
  const task = chain
    .then(async () => {
      const cfg = ocrConfig()
      if (!cfg) return null
      const { blob, nw, nh } = await makeAnalysis(page)
      let lines
      if (cfg.type === 'azure') lines = await runAzure(cfg, blob)
      else if (cfg.type === 'generic') lines = await runGeneric(cfg, blob, nw, nh)
      else return null
      return (lines || []).map((ln) => ({
        text: ln.text,
        x: ln.x / nw,
        y: ln.y / nh,
        w: ln.w / nw,
        h: ln.h / nh,
      }))
    })
    .catch((e) => {
      cache.delete(page.key)
      throw e
    })
  cache.set(page.key, task)
  chain = task.then(
    () => undefined,
    () => undefined
  )
  return task
}

export function flushOcrCache() {
  cache.clear()
  chain = Promise.resolve()
}