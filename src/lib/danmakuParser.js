export const FORMAT_CODE = 'comic-danmaku'
export const SUPPORTED_VERSION = 1

// 已知字段：核心 + 样式 + 扩展容器；其余未知字段（含旧版 time / timeUnit 等）一律剔除，避免冗余
const KNOWN_ITEM_KEYS = ['page', 'text', 'color', 'size', 'fontSize', 'position', 'weight', 'shadow', 'extra']

function isValidItem(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return false
  if (!Number.isInteger(item.page) || item.page < 1) return false
  return typeof item.text === 'string' && item.text.length > 0
}

function normalizeItem(item) {
  const out = {}
  for (const key of KNOWN_ITEM_KEYS) {
    if (key in item) out[key] = item[key]
  }
  return out
}

// 解析通用弹幕格式（规范见 spec_danmaku.json）：
// - format 存在时必须等于 comic-danmaku，缺失时按 danmaku 结构启发式识别（兼容旧文件）
// - version 必须为正整数，高于当前支持版本时尝试宽松解析并告警
// - 无效条目（page 非 >=1 整数 / text 非非空字符串）跳过并计数
// - 未知字段一律忽略；extra 扩展容器保留
// - 输入已按 page 升序时直接复用原 Map，避免额外排序
export function parseUniversalDanmaku(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('弹幕文件顶层必须是 JSON 对象')
  }

  if (data.format != null && data.format !== FORMAT_CODE) {
    throw new Error(`未知弹幕格式标识：${data.format}`)
  }

  const version = data.version == null ? 1 : Number(data.version)
  if (!Number.isInteger(version) || version < 1) {
    throw new Error('version 必须为正整数')
  }
  if (version > SUPPORTED_VERSION) {
    console.warn(`弹幕格式版本 v${version} 高于当前支持的 v${SUPPORTED_VERSION}，尝试宽松解析`)
  }

  if (data.meta != null && (typeof data.meta !== 'object' || Array.isArray(data.meta))) {
    throw new Error('meta 必须为对象')
  }
  if (!Array.isArray(data.danmaku)) {
    return { byPage: new Map(), count: 0, skipped: 0 }
  }

  const byPage = new Map()
  let count = 0
  let skipped = 0
  let lastPage = 0
  let sorted = true
  for (const item of data.danmaku) {
    if (!isValidItem(item)) {
      skipped++
      continue
    }
    if (item.page < lastPage) sorted = false
    lastPage = item.page
    const arr = byPage.get(item.page) || []
    arr.push(normalizeItem(item))
    byPage.set(item.page, arr)
    count++
  }

  const result = sorted ? byPage : new Map([...byPage.entries()].sort((a, b) => a[0] - b[0]))
  return { byPage: result, count, skipped }
}
