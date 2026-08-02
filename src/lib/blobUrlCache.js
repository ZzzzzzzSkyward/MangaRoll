// blob URL 缓存与延迟释放：页节点在视口中复用同一 URL，
// 移出视口后延迟 revoke；整批导入会被 flush，防止跨次导入复用已失效的 URL。
const urlCache = new Map()
const revokeTimers = new Map()

const REVOKE_DELAY = 1000

export function getBlobUrl(key, file) {
  let url = urlCache.get(key)
  if (!url) {
    url = URL.createObjectURL(file)
    urlCache.set(key, url)
  }
  const t = revokeTimers.get(key)
  if (t) clearTimeout(t)
  revokeTimers.delete(key)
  return url
}

export function scheduleBlobRevoke(key) {
  const url = urlCache.get(key)
  if (!url) return
  const t = revokeTimers.get(key)
  if (t) clearTimeout(t)
  revokeTimers.set(
    key,
    setTimeout(() => {
      if (urlCache.get(key) === url) {
        URL.revokeObjectURL(url)
        urlCache.delete(key)
      }
      revokeTimers.delete(key)
    }, REVOKE_DELAY)
  )
}

export function flushBlobCache() {
  for (const url of urlCache.values()) URL.revokeObjectURL(url)
  for (const t of revokeTimers.values()) clearTimeout(t)
  urlCache.clear()
  revokeTimers.clear()
}