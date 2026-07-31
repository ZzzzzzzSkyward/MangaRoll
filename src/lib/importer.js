import JSZip from 'jszip'

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

export function isZip(name) {
  return extOf(name) === 'zip'
}

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

function readDims(file) {
  const url = URL.createObjectURL(file)
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve({ w: img.naturalWidth, h: img.naturalHeight })
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(null)
    }
    img.src = url
  })
}

export async function extractDims(entries, onProgress, concurrency = 4) {
  const pages = new Array(entries.length)
  let idx = 0
  async function worker() {
    while (idx < entries.length) {
      const i = idx++
      const e = entries[i]
      try {
        const d = await readDims(e.file)
        if (d) {
          pages[i] = { file: e.file, path: e.path, name: e.file.name, w: d.w, h: d.h }
        }
      } catch {
        /* skip corrupt image */
      }
      if (onProgress) onProgress(idx, entries.length)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(1, entries.length)) }, worker))
  return pages.filter(Boolean)
}
