import { unzip as unzipitUnzip } from 'unzipit'
import { naturalCompare, isImage, isJson, isZip, baseNameOf } from './fileUtils'
import { walkDirHandle, walkItems } from './fileWalker'
import { extractDims, extractDimsInto } from './imageProcessor'

export { naturalCompare, isImage, isJson, isZip, isDanmakuJson, isInfoJson, extOf, IMAGE_EXTS, folderNameCompare, baseNameOf } from './fileUtils'
export { walkDirHandle, walkItems } from './fileWalker'
export { extractDims, extractDimsInto } from './imageProcessor'

export async function unzip(file, onProgress) {
  const { entries: zipEntries } = await unzipitUnzip(file)
  const names = Object.keys(zipEntries)
    .filter((n) => !zipEntries[n].isDirectory)
    .sort(naturalCompare)
  const entries = []
  for (const name of names) {
    const entry = zipEntries[name]
    if (isImage(name) || isJson(name)) {
      const blob = await entry.blob()
      blob.name = name.split('/').pop()
      entries.push({ file: blob, path: name })
    }
    if (onProgress) onProgress(entries.length, names.length)
  }
  return entries
}

// 提取压缩包封面：优先主名完全等于 cover（不区分大小写）的图片，否则取第一张。
// 未解压过的压缩包走分块读取——先只读文件尾部的中央目录定位条目，再仅解压封面单条目，
// 不整体加载 / 解压；已解压过的直接复用内存中页面数据。
export async function extractZipCover(file, pages) {
  if (pages && pages.length) {
    const cover = pages.find((p) => baseNameOf(p.name).toLowerCase() === 'cover') || pages[0]
    return cover ? cover.file : null
  }
  const { entries: zipEntries } = await unzipitUnzip(file)
  const names = Object.keys(zipEntries)
    .filter((n) => isImage(n) && !zipEntries[n].isDirectory)
    .sort(naturalCompare)
  if (!names.length) return null
  const coverName = names.find((n) => baseNameOf(n).toLowerCase() === 'cover') || names[0]
  const blob = await zipEntries[coverName].blob()
  blob.name = coverName.split('/').pop()
  return blob
}

// 统计压缩包内图片条目数：仅读文件尾部中央目录，不解压任何条目；
// 已解压过的直接复用内存中页面数据。
export async function countZipImages(file, pages) {
  if (pages && pages.length) return pages.length
  const { entries: zipEntries } = await unzipitUnzip(file)
  let count = 0
  for (const name of Object.keys(zipEntries)) {
    if (isImage(name) && !zipEntries[name].isDirectory) count++
  }
  return count
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
