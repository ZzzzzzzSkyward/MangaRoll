import JSZip from 'jszip'
import { naturalCompare, isImage, isJson, isZip, baseNameOf } from './fileUtils'
import { walkDirHandle, walkItems } from './fileWalker'
import { extractDims, extractDimsInto } from './imageProcessor'

export { naturalCompare, isImage, isJson, isZip, isDanmakuJson, extOf, IMAGE_EXTS, folderNameCompare, baseNameOf } from './fileUtils'
export { walkDirHandle, walkItems } from './fileWalker'
export { extractDims, extractDimsInto } from './imageProcessor'

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

export function buildFolderTree(entries, pages) {
  const pageByPath = new Map(pages.map((p) => [p.path, p]))
  const sorted = [...entries].sort((a, b) => naturalCompare(a.path, b.path))
  const root = { name: '', path: '', parent: null, folders: [], images: [], zips: [], jsons: [], cover: null }
  for (const e of sorted) {
    const segs = e.path.split('/')
    let node = root
    for (let i = 1; i < segs.length - 1; i++) {
      const seg = segs[i]
      let child = node.folders.find((f) => f.name === seg)
      if (!child) {
        child = {
          name: seg,
          path: segs.slice(0, i + 1).join('/'),
          parent: node,
          folders: [],
          images: [],
          zips: [],
          jsons: [],
          cover: null,
        }
        node.folders.push(child)
      }
      node = child
    }
    if (isJson(e.path)) node.jsons.push(e)
    else if (isImage(e.path)) {
      const page = pageByPath.get(e.path)
      if (page) node.images.push(page)
    } else if (isZip(e.path)) node.zips.push({ ...e, parent: node })
  }
  function prune(n) {
    for (const f of n.folders) prune(f)
    n.folders = n.folders.filter((f) => f.images.length || f.folders.length || f.zips.length)
  }
  prune(root)
  const rootName = sorted[0]?.path.split('/')[0] || ''
  root.name = rootName
  root.path = rootName
  function assignCovers(n) {
    n.cover = n.images.find((p) => baseNameOf(p.name).toLowerCase() === 'cover') || n.images[0] || null
    for (const f of n.folders) assignCovers(f)
  }
  assignCovers(root)
  return root
}
