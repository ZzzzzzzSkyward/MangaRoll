// 预加载管理器：顺序加载全部图片的 blob URL，按页面顺序依次创建。
// 支持中断（AbortController）和优先级（当前页优先）。
import { getBlobUrl, cancelBlobRevoke } from './blobUrlCache'

// 按顺序预加载所有页面的图片，从 startPage 开始向后加载，到达末尾后从头加载到 startPage。
// 返回 AbortController，调用 abort() 可中断预加载。
export function preloadImage(pages, startPage = 0) {
  const controller = new AbortController()
  const signal = controller.signal

  async function run() {
    const len = pages.length
    if (!len) return

    // 构建加载顺序：从 startPage 开始，到末尾，再从 0 到 startPage
    const order = []
    for (let i = startPage; i < len; i++) order.push(i)
    for (let i = 0; i < startPage; i++) order.push(i)

    for (const i of order) {
      if (signal.aborted) return
      const page = pages[i]
      if (!page) continue

      // 远程页面不需要预加载 blob URL
      if (page.remote) continue

      // 本地页面：如果还没有 blob URL，创建它
      if (page.file && !page.url) {
        try {
          page.url = getBlobUrl(page.key, page.file)
          cancelBlobRevoke(page.key)
        } catch {
          // 忽略创建失败
        }
      }

      // 每加载一张后让出主线程，避免阻塞 UI
      await new Promise((r) => setTimeout(r, 0))
    }
  }

  run()
  return controller
}

// 中止所有预加载（导入新漫画时调用）
let currentAbort = null
export function abortPreload() {
  if (currentAbort) {
    currentAbort.abort()
    currentAbort = null
  }
}

export function startPreload(pages, startPage = 0) {
  abortPreload()
  currentAbort = preloadImage(pages, startPage)
  return currentAbort
}
