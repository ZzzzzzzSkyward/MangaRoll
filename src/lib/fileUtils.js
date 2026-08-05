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

export function isDanmakuJson(name) {
  return isJson(name) && /danmaku|弹幕|字幕/i.test(name)
}

export function isInfoJson(name) {
  return isJson(name) && /(^|\/)info\.json$/i.test(name)
}

export function isZip(name) {
  return extOf(name) === 'zip'
}

function digitGroups(name) {
  const g = (name.match(/\d+/g) || []).map(Number)
  return g.length ? g : null
}

export function folderNameCompare(a, b) {
  const na = digitGroups(a)
  const nb = digitGroups(b)
  if (na && nb) {
    const len = Math.min(na.length, nb.length)
    for (let i = 0; i < len; i++) {
      if (na[i] !== nb[i]) return na[i] - nb[i]
    }
    if (na.length !== nb.length) return na.length - nb.length
  }
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
}

export function baseNameOf(name) {
  const i = name.lastIndexOf('.')
  return i > 0 ? name.slice(0, i) : name
}
