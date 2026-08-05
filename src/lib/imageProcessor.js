import { detectCrop } from './cropDetect'

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

export async function extractDimsInto(pages, onProgress, concurrency = 4, maxDim = 0) {
  const todo = pages.filter((p) => !(p.w > 0))
  if (!todo.length) return
  let idx = 0
  async function worker() {
    while (idx < todo.length) {
      const i = idx++
      const p = todo[i]
      try {
        const d = await readDims(p.file, maxDim)
        if (d) {
          p.file = d.file
          p.w = d.w
          p.h = d.h
          p.crop = d.crop
        }
      } catch {
        /* skip corrupt image */
      }
      if (onProgress) onProgress(idx, todo.length)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(1, todo.length)) }, worker))
}
