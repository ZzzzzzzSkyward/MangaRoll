import { applyMoire } from './moireFilter'

// 摩尔纹处理缓存：结果按 page.key+radius 缓存，移出视口延迟 revoke，重新导入整体 flush。
const cache = new Map() // key -> { url, radius }
const pending = new Map() // key -> Promise<url|null>
const revokeTimers = new Map()
let queueChain = Promise.resolve()

const REVOKE_DELAY = 2000

function cacheKey(key, radius, size) {
  return key + '@' + radius + '@' + (size || 0)
}

export function hasMoire(key, radius, size) {
  return cache.has(cacheKey(key, radius, size))
}

export function getMoireUrl(key, radius, size) {
  return cache.get(cacheKey(key, radius, size))?.url || ''
}

// 串行队列：一次只处理一页，避免长时间占用主线程/内存（WebGL 在 GPU 执行，串行仅为 toBlob 限流）。
// size 为目标显示分辨率长边（px），供按显示分辨率处理（见 applyMoire）。
export async function ensureMoire(page, radius, size) {
  const ck = cacheKey(page.key, radius, size)
  if (cache.has(ck)) return cache.get(ck).url
  if (pending.has(ck)) return pending.get(ck)

  const p = queueChain
    .then(() => applyMoire(page.file, radius, size))
    .then((blob) => {
      pending.delete(ck)
      if (!blob) return null
      const url = URL.createObjectURL(blob)
      cache.set(ck, { url, radius, size })
      return url
    })
    .catch(() => {
      pending.delete(ck)
      return null
    })
  pending.set(ck, p)
  queueChain = p.then(
    () => undefined,
    () => undefined
  )
  return p
}

export function scheduleMoireRevoke(key, radius, size) {
  const ck = cacheKey(key, radius, size)
  const url = cache.get(ck)?.url
  if (!url) return
  const t = revokeTimers.get(ck)
  if (t) clearTimeout(t)
  revokeTimers.set(
    ck,
    setTimeout(() => {
      if (cache.get(ck)?.url === url) {
        URL.revokeObjectURL(url)
        cache.delete(ck)
      }
      revokeTimers.delete(ck)
    }, REVOKE_DELAY)
  )
}

export function cancelMoireRevoke(key, radius, size) {
  const t = revokeTimers.get(cacheKey(key, radius, size))
  if (t) {
    clearTimeout(t)
    revokeTimers.delete(cacheKey(key, radius, size))
  }
}

export function flushMoireCache() {
  for (const v of cache.values()) URL.revokeObjectURL(v.url)
  for (const t of revokeTimers.values()) clearTimeout(t)
  cache.clear()
  revokeTimers.clear()
  pending.clear()
  queueChain = Promise.resolve()
}