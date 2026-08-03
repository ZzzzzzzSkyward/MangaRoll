import JSZip from 'jszip'
import { detectCrop } from './cropDetect'

export const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'avif', 'ico'])
const JSON_EXTS = new Set(['json'])

export const naturalCompare = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' }).compare

export function extOf(name) {
  const i = name.lastIndexOf('.')
  return i >= 0 ? name.slice(i + 1).toLowerCase() : ''
}

export function isImage(name) {
  return IMAGE_EXTS.has(extOf(name))
}

export function isJson(name) {
  return JSON_EXTS.has(extOf(name))
}

// 弹幕 JSON 文件名识别：名称（含扩展名）中带 danmaku 或 弹幕 即视为弹幕文件（不区分大小写）
export function isDanmakuJson(name) {
  return isJson(name) && /danmaku|弹幕/i.test(name)
}

export function isZip(name) {
  return extOf(name) === 'zip'
}

// 逐层递归读取目录条目。浏览器要求多次 readEntries 才能取完一个目录，
// 因此每次取一批后继续拼装，直到某批为空（readEntries 每次最多返回100项）。
function walkEntry(entry, path, out) {
  if (entry.isFile) {
    return new Promise((resolve, reject) => {
      entry.file(
        (f) => {
          out.push({ file: f, path })
          resolve()
        },
        reject
      )
    })
  }
  if (entry.isDirectory) {
    const reader = entry.createReader()
    return new Promise((resolve, reject) => {
      const loop = () =>
        reader.readEntries(
          (batch) => {
            if (!batch.length) return resolve()
            Promise.all(batch.map((e) => walkEntry(e, path + '/' + e.name, out))).then(loop, reject)
          },
          reject
        )
      loop()
    })
  }
  return Promise.resolve()
}

export async function walkItems(items) {
  const out = []
  const jobs = []
  for (const item of Array.from(items || [])) {
    if (item instanceof File) {
      out.push({ file: item, path: item.webkitRelativePath || item.name })
      continue
    }
    if (!item) continue
    // webkitGetAsEntry 仅在拖拽场景提供目录句柄；普通文件选择走 getAsFile 兜底
    const entry = item.webkitGetAsEntry && item.webkitGetAsEntry()
    if (entry) jobs.push(walkEntry(entry, entry.name, out))
    else if (item.getAsFile) {
      const f = item.getAsFile()
      if (f) out.push({ file: f, path: f.name })
    }
  }
  await Promise.all(jobs)
  return out
}

export async function unzip(file, onProgress) {
  const zip = await JSZip.loadAsync(file)
  const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir).sort(naturalCompare)
  const entries = []
  for (const name of names) {
    const entry = zip.files[name]
    if (isImage(name) || isJson(name)) {
      const blob = await entry.async('blob')
      blob.name = name.split('/').pop()
      entries.push({ file: blob, path: name })
    }
    if (onProgress) onProgress(entries.length, names.length)
  }
  return entries
}

// 解码失败返回 null（调用方过滤掉损坏图片），对象 URL 在此及时释放。
// 顺带完成两件事：
//  1. 超过 maxDim（长边上限，0=不限制）的图缩到上限并重新编码替换原 blob；
//  2. 分析四周白/黑边，返回裁剪矩形（自然像素坐标），供智能裁边开关使用。
async function readDims(file, maxDim) {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise((resolve, reject) => {
      const im = new Image()
      im.onload = () => resolve(im)
      im.onerror = () => reject(new Error('decode failed'))
      im.src = url
    })
    let w = img.naturalWidth
    let h = img.naturalHeight
    let outFile = file
    let srcForCrop = img
    if (maxDim && Math.max(w, h) > maxDim) {
      const ds = await downscaleImg(img, w, h, maxDim, file.type)
      outFile = ds.blob
      w = ds.w
      h = ds.h
      srcForCrop = ds.canvas
    }
    let crop = null
    try {
      crop = detectCrop(srcForCrop)
    } catch {
      /* 裁边分析失败不影响页面 */
    }
    return { file: outFile, w, h, crop }
  } catch {
    return null
  } finally {
    URL.revokeObjectURL(url)
  }
}

// 等比缩小并重新编码为 JPEG / PNG（来源带透明通道时保留 PNG）。
// 返回 { blob, canvas, w, h }；canvas 供后续裁剪分析复用，避免二次绘制。
async function downscaleImg(img, w, h, maxDim, srcType) {
  const scale = maxDim / Math.max(w, h)
  const nw = Math.max(1, Math.round(w * scale))
  const nh = Math.max(1, Math.round(h * scale))
  const canvas = document.createElement('canvas')
  canvas.width = nw
  canvas.height = nh
  const ctx = canvas.getContext('2d')
  ctx.drawImage(img, 0, 0, nw, nh)
  const keepAlpha = srcType === 'image/png' || srcType === 'image/webp' || srcType === 'image/gif'
  const blob = await new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b), keepAlpha ? 'image/png' : 'image/jpeg', keepAlpha ? undefined : 0.92)
  )
  return { blob, canvas, w: nw, h: nh }
}

// 固定并发数的 Worker 池：各 worker 共享一个原子游标 idx，
// 保证每个条目恰好被读取一次且整体并发不超过 concurrency
export async function extractDims(imgs, onProgress, concurrency = 4, maxDim = 0) {
  const pages = new Array(imgs.length)
  let idx = 0
  async function worker() {
    while (idx < imgs.length) {
      const i = idx++
      const e = imgs[i]
      try {
        const d = await readDims(e.file, maxDim)
        if (d) {
          pages[i] = { file: d.file, path: e.path, name: e.file.name, w: d.w, h: d.h, crop: d.crop }
        }
      } catch {
        /* skip corrupt image */
      }
      if (onProgress) onProgress(idx, imgs.length)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(1, imgs.length)) }, worker))
  return pages.filter(Boolean)
}
