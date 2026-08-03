import { ref, watch } from 'vue'
import { showToast } from '../../store'
import { ocrEndpoint } from './ocrConfig'
import { settings } from '../settings'
import { runLocal } from './ocrLocal'

// OCR 客户端：按 page.key 内存缓存，1 并发限流（避免同时发起大量请求占用后台服务）。
// 取原图字节 → 本地后端 /detect?ocr=true（气泡检测 + 日文 OCR）→ 归一到图片坐标（0~1）。
// 网络连接失败（fetch 层 TypeError）时自动重试：指数退避，直至超过最大重试时长；
// 超时后标记服务不可用、自动关闭 OCR 开关，待用户重新启用或更换端点时恢复。
const cache = new Map()
let chain = Promise.resolve()
// 同一批 OCR 期间只提示一次错误（后台未启动 / 模型缺失等），避免逐页刷屏
let errorNotified = false

// OCR 服务状态：'idle'（未启用/已重置）| 'ok' | 'retrying'（网络失败重试中）| 'down'（不可用，已自动关闭）
export const ocrServiceStatus = ref('idle')

// 网络失败重试参数：最大重试时长 30s，首间隔 1s，指数退避封顶 8s
const RETRY_MAX_MS = 30_000
const RETRY_BASE_MS = 1_000
const RETRY_CAP_MS = 8_000
let retrying = false
let serviceDown = false

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

// 仅 fetch 网络层失败（连接拒绝 / 中断 / 超时）需要重试，
// 服务端返回错误（HTTP 状态 / 非 JSON / 处理失败）一律直接抛出不重试。
function isNetworkFailure(e) {
  return e instanceof TypeError || (e && e.name === 'TypeError')
}

function markServiceDown() {
  if (serviceDown) return
  serviceDown = true
  retrying = false
  ocrServiceStatus.value = 'down'
  // 中断串行队列：尚未开始的 OCR 任务立即失败，不再排队重试
  chain = Promise.resolve()
  cache.clear()
  errorNotified = true
  settings.ocrEnabled = false
  showToast('OCR 服务不可用，已自动关闭')
}

function resetOcrService() {
  serviceDown = false
  retrying = false
  if (ocrServiceStatus.value === 'down') ocrServiceStatus.value = 'idle'
}

// 用户重新启用 OCR 或更换服务地址时，清除不可用标记，允许再次重试
watch(
  () => [settings.ocrEnabled, settings.ocrEndpoint],
  () => {
    if (settings.ocrEnabled) resetOcrService()
  }
)

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
  // 本地页直接取原始字节（blob URL，无 CORS 问题），避免二次编码损失；
  // 远端图需图像服务器支持 CORS，否则回退到 canvas 重编码（质量略降）。
  let blob = null
  if (!page.remote) {
    try {
      const res = await fetch(src)
      if (res.ok) blob = await res.blob()
    } catch {
      blob = null
    }
  }
  if (!blob) {
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    canvas.getContext('2d').drawImage(img, 0, 0, w, h)
    blob = await new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.9))
  }
  // 后端 /detect 返回原图像素坐标，因此归一化必须以实际上传字节的尺寸为准（w/h）。
  return { blob, w, h }
}

// 网络失败时重试：指数退避直到 RETRY_MAX_MS 上限；超时仍未恢复则标记服务不可用并抛出。
// 同一次网络故障只提示一次「重试中」，恢复后提示一次「已恢复」。
async function runLocalWithRetry(endpoint, blob) {
  const deadline = Date.now() + RETRY_MAX_MS
  let delay = RETRY_BASE_MS
  for (;;) {
    // 服务已被判不可用（其他任务超时）时立即放弃，不再发起新请求
    if (serviceDown) throw new Error('OCR 服务不可用')
    try {
      const lines = await runLocal(endpoint, blob)
      if (retrying) {
        retrying = false
        showToast('OCR 服务已恢复')
      }
      ocrServiceStatus.value = 'ok'
      return lines
    } catch (e) {
      if (!isNetworkFailure(e) || Date.now() >= deadline) {
        if (isNetworkFailure(e)) markServiceDown()
        throw e
      }
      if (serviceDown) throw new Error('OCR 服务不可用')
      if (!retrying) {
        retrying = true
        ocrServiceStatus.value = 'retrying'
        errorNotified = true
        showToast('OCR 服务连接失败，自动重试中…')
      }
      await sleep(delay)
      delay = Math.min(delay * 2, RETRY_CAP_MS)
    }
  }
}

export function runOcr(page) {
  if (serviceDown) return Promise.reject(new Error('OCR 服务不可用'))
  if (cache.has(page.key)) return cache.get(page.key)
  const task = chain
    .then(async () => {
      const { blob, w, h } = await makeAnalysis(page)
      const lines = await runLocalWithRetry(ocrEndpoint(), blob)
      return (lines || []).map((ln) => ({
        text: ln.text,
        x: ln.x / w,
        y: ln.y / h,
        w: ln.w / w,
        h: ln.h / h,
      }))
    })
    .catch((e) => {
      cache.delete(page.key)
      if (!errorNotified) {
        errorNotified = true
        showToast('OCR 失败：' + e.message)
      }
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
  errorNotified = false
  retrying = false
  serviceDown = false
  ocrServiceStatus.value = 'idle'
}
