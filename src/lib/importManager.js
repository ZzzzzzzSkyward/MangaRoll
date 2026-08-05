import { state, showToast, releasePages } from '../store'
import { walkItems, walkDirHandle, unzip, extractDims, extractDimsInto, naturalCompare, isImage, isJson, isDanmakuJson, isZip, buildFolderTree } from './importer'
import { settings } from './settings'
import { restoreProgress } from './progress'
import { loadDanmakuFile, loadRemoteDanmaku } from './danmakuLoader'
import { loadManifest, loadWebDav } from './remoteSource'
import { prefetchedChapter, setPrefetchedChapter, chapterNav } from './chapterNav'

let importId = 0
let openSeq = 0

export function getOpenSeq() {
  return openSeq
}

export function titleFrom(entries, kind) {
  if (kind === 'zip') {
    const n = entries[0].path
    const i = n.lastIndexOf('.')
    return i > 0 ? n.slice(0, i) : n
  }
  return entries[0].path.split('/')[0]
}

export async function openComicFromNode(node) {
  const seq = ++openSeq
  const pending = node.images.filter((p) => !(p.w > 0) && !p.remote)
  if (pending.length) {
    state.status = 'loading'
    state.loading = { label: '读取图片信息…', current: 0, total: pending.length }
    await extractDimsInto(
      node.images,
      (c) => {
        if (seq === openSeq) state.loading.current = c
      },
      4,
      settings.maxRenderSize
    )
    if (seq !== openSeq) return
  }
  releasePages()
  state.pages = node.images
  state.sourceEntry = node
  state.title = node.name
  state.progressKey = node.path
  state.current = 0
  state.zoom = 1
  state.zoomMode = 'width'
  restoreProgress()
  if (node.jsons.length && node.images.length) {
    const imgDir = node.images[0].path.substring(0, node.images[0].path.lastIndexOf('/'))
    const levelJsons = node.jsons.filter((e) => e.path.substring(0, e.path.lastIndexOf('/')) === imgDir)
    const j = levelJsons.find((e) => isDanmakuJson(e.path))
    if (j) {
      if (j.remote) {
        loadRemoteDanmaku(j.src)
      } else if (j.file) {
        loadDanmakuFile(j.file)
      }
    } else {
      state.danmaku = null
    }
  } else {
    state.danmaku = null
  }
  state.view = 'comic'
  state.status = 'ready'
}

export function openFolderNode(node) {
  if (node.folders.length || node.zips.length) {
    state.dir = node
    state.title = node.name
    state.view = 'list'
    return
  }
  if (!node.images.length) {
    showToast('该文件夹内没有图片')
    return
  }
  const nodeKey = node.path || node.name
  if (prefetchedChapter && prefetchedChapter.key === nodeKey) {
    node.images = prefetchedChapter.pages
  }
  openComicFromNode(node)
}

export function openSelfComic() {
  const dir = state.dir
  if (!dir || !dir.images.length) return
  openComicFromNode(dir)
}

export async function openZipEntry(zipEntry) {
  const seq = ++openSeq
  const zipKey = zipEntry.path || zipEntry.name
  if (prefetchedChapter && prefetchedChapter.key === zipKey && !zipEntry.pages) {
    zipEntry.pages = prefetchedChapter.pages
  }
  if (!zipEntry.pages) {
    state.status = 'loading'
    state.loading = { label: '解压中…', current: 0, total: 0 }
    let unzipped
    try {
      unzipped = await unzip(zipEntry.file, (c, t) => {
        if (seq !== openSeq) return
        state.loading.current = c
        state.loading.total = t
        state.loading.label = '解压中…'
      })
    } catch (e) {
      console.error(e)
      state.status = 'ready'
      showToast('解压失败：' + e.message)
      return
    }
    if (seq !== openSeq) return
    const imgs = unzipped
      .filter((e) => isImage(e.path))
      .sort((a, b) => naturalCompare(a.path, b.path))
    if (!imgs.length) {
      state.status = 'ready'
      showToast('压缩包内未找到图片')
      return
    }
    const jsons = unzipped.filter((e) => isJson(e.path))
    const danmakuJson = jsons.find((e) => isDanmakuJson(e.path))
    if (danmakuJson) zipEntry.danmakuFile = danmakuJson.file
    state.loading = { label: '读取图片信息…', current: 0, total: imgs.length }
    const pages = await extractDims(imgs, (c) => {
      if (seq === openSeq) state.loading.current = c
    }, 4, settings.maxRenderSize)
    if (seq !== openSeq) return
    pages.forEach((p, i) => (p.key = i))
    zipEntry.pages = pages
  }
  releasePages()
  state.pages = zipEntry.pages
  state.sourceEntry = zipEntry
  const base = zipEntry.path.split('/').pop()
  state.title = base.slice(0, base.lastIndexOf('.')) || base
  state.progressKey = zipEntry.path
  state.current = 0
  state.zoom = 1
  state.zoomMode = 'width'
  restoreProgress()
  if (zipEntry.danmakuFile) loadDanmakuFile(zipEntry.danmakuFile)
  else state.danmaku = null
  state.view = 'comic'
  state.status = 'ready'
}

export function backToList() {
  state.view = 'list'
  if (state.dir) state.title = state.dir.name
}

export function goUp() {
  if (state.dir?.parent) {
    state.dir = state.dir.parent
    state.title = state.dir.name
  }
}

export function navChapter(dir) {
  const nav = chapterNav.value
  if (!nav) return
  const target = dir < 0 ? nav.prev : nav.next
  if (!target) return
  if (target.kind === 'zip') openZipEntry(target.entry)
  else openFolderNode(target.entry)
}

async function handleEntries(entries, kind) {
  const currentImportId = ++importId
  openSeq++
  state.danmaku = null
  state.sourceEntry = null
  const externalJsons = entries.filter((e) => isJson(e.path))
  const zips = entries.filter((e) => isZip(e.path))
  let titleEntries = entries
  const nonZipEntries = entries.filter((e) => !isJson(e.path) && !isZip(e.path))
  const soloZip = kind === 'zip' || (nonZipEntries.length === 0 && zips.length === 1)
  if (soloZip) {
    state.loading = { label: '解压中…', current: 0, total: 0 }
    entries = await unzip(zips[0].file, (c, t) => {
      state.loading.current = c
      state.loading.total = t
      state.loading.label = '解压中…'
    })
    if (currentImportId !== importId) return
    kind = 'zip'
    titleEntries = [{ path: zips[0].path }]
  }

  const imgs = entries
    .filter((e) => isImage(e.path))
    .sort((a, b) => naturalCompare(a.path, b.path))
  const allJsons = externalJsons.length ? externalJsons : entries.filter((e) => isJson(e.path))
  const imgDirs = new Map()
  for (const img of imgs) {
    const dir = img.path.substring(0, img.path.lastIndexOf('/'))
    imgDirs.set(dir, (imgDirs.get(dir) || 0) + 1)
  }
  let bestDir = null
  let bestCount = 0
  for (const [dir, count] of imgDirs) {
    if (count > bestCount) { bestDir = dir; bestCount = count }
  }
  const levelJsons = bestDir != null
    ? allJsons.filter((e) => e.path.substring(0, e.path.lastIndexOf('/')) === bestDir)
    : []
  const danmakuJson = levelJsons.find((e) => isDanmakuJson(e.path))
  if (danmakuJson) await loadDanmakuFile(danmakuJson.file)

  if (kind === 'folder') {
    if (currentImportId !== importId) return
    const rawPages = imgs.map((e, i) => ({
      file: e.file,
      path: e.path,
      name: e.file.name,
      w: 0,
      h: 0,
      crop: null,
      key: i,
    }))
    const tree = buildFolderTree(entries, rawPages)
    if (tree.folders.length || tree.zips.length) {
      releasePages()
      state.tree = tree
      state.dir = tree
      state.view = 'list'
      state.title = tree.name
      state.progressKey = ''
      state.status = 'ready'
      showToast(`检测到 ${tree.folders.length} 个子文件夹${tree.zips.length ? `、${tree.zips.length} 个压缩包` : ''}`)
      return
    }
  }

  if (!imgs.length) {
    state.status = 'empty'
    showToast('未找到图片文件')
    return
  }

  state.loading = { label: '读取图片信息…', current: 0, total: imgs.length }
  const pages = await extractDims(imgs, (c) => {
    state.loading.current = c
  }, 4, settings.maxRenderSize)
  if (currentImportId !== importId) return
  if (!pages.length) {
    state.status = 'empty'
    showToast('图片加载失败')
    return
  }
  pages.forEach((p, i) => (p.key = i))

  releasePages()
  state.pages = pages
  state.title = titleFrom(titleEntries, kind)
  state.progressKey = state.title
  state.current = 0
  state.zoom = 1
  state.zoomMode = 'width'
  state.tree = null
  state.view = 'comic'
  restoreProgress()
  state.status = 'ready'
  showToast(`已加载 ${pages.length} 页`)
}

function onlyJsonEntries(entries) {
  return entries.length > 0 && entries.every((e) => isJson(e.path))
}

async function runImport(obtainEntries, prevStatus) {
  state.status = 'loading'
  state.loading = { label: '扫描文件夹…', current: 0, total: 0 }
  try {
    const entries = await obtainEntries()
    if (!entries.length) {
      showToast('未读取到文件')
      state.status = prevStatus === 'ready' ? prevStatus : 'empty'
      return
    }
    if (onlyJsonEntries(entries)) {
      const danmakuJson = entries.find((e) => isDanmakuJson(e.path))
      if (danmakuJson) await loadDanmakuFile(danmakuJson.file)
      state.status = prevStatus === 'ready' ? prevStatus : 'empty'
      return
    }
    await handleEntries(entries, 'folder')
  } catch (e) {
    console.error(e)
    showToast('导入失败：' + e.message)
    state.status = prevStatus === 'ready' ? prevStatus : 'empty'
  }
}

export async function importDropped(items) {
  return runImport(
    () => walkItems(items),
    state.status
  )
}

export async function importFolder(items) {
  return runImport(
    () => (items[0]?.path !== undefined ? items : walkItems(items)),
    state.status
  )
}

export async function importDirectoryHandle(dirHandle) {
  return runImport(
    () => walkDirHandle(dirHandle, dirHandle.name),
    state.status
  )
}

export async function importZip(file) {
  state.status = 'loading'
  state.loading = { label: '解压中…', current: 0, total: 0 }
  try {
    await handleEntries([{ file, path: file.name }], 'zip')
  } catch (e) {
    console.error(e)
    state.status = 'empty'
    showToast('导入失败：' + e.message)
  }
}

export async function importRemote(mode, url, opts = {}) {
  const currentImportId = ++importId
  openSeq++
  state.status = 'loading'
  state.loading = { label: mode === 'manifest' ? '加载清单…' : '读取 WebDAV…', current: 0, total: 0 }
  try {
    const { title, pages } = mode === 'manifest' ? await loadManifest(url) : await loadWebDav(url)
    if (currentImportId !== importId) return
    if (!pages.length) {
      showToast('远程目录中未找到图片')
      state.status = 'empty'
      return
    }
    pages.forEach((p, i) => (p.key = i))
    
    const hasHierarchy = pages.some((p) => p.path && p.path.includes('/'))
    
    if (hasHierarchy) {
      const tree = buildRemoteFolderTree(pages, title)
      if (tree.folders.length || tree.zips.length) {
        releasePages()
        state.tree = tree
        state.dir = tree
        state.view = 'list'
        state.title = title
        state.progressKey = ''
        state.status = 'ready'
        showToast(`已加载 ${pages.length} 页（远程），${tree.folders.length} 个子文件夹`)
        return
      }
    }
    
    releasePages()
    state.pages = pages
    state.title = title
    state.progressKey = state.title
    state.current = 0
    state.zoom = 1
    state.zoomMode = 'width'
    state.tree = null
    state.view = 'comic'
    restoreProgress()
    if (Number.isInteger(opts.page) && opts.page >= 1) {
      state.current = Math.min(Math.max(0, opts.page - 1), pages.length - 1)
    }
    state.status = 'ready'
    showToast(`已加载 ${pages.length} 页（远程）`)
    if (opts.danmakuUrl) await loadRemoteDanmaku(opts.danmakuUrl)
  } catch (e) {
    console.error(e)
    showToast('远程加载失败：' + e.message)
    if (state.status === 'loading') state.status = 'empty'
  }
}

function buildRemoteFolderTree(pages, rootName) {
  const root = {
    name: rootName,
    path: rootName,
    parent: null,
    folders: [],
    images: [],
    zips: [],
    jsons: [],
    cover: null,
  }
  
  for (const page of pages) {
    const path = page.path || page.name
    const segs = path.split('/')
    let node = root
    
    for (let i = 0; i < segs.length - 1; i++) {
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
    
    const fileName = segs[segs.length - 1]
    if (isJson(fileName)) {
      node.jsons.push(page)
    } else if (isImage(fileName)) {
      node.images.push(page)
    }
  }
  
  function prune(n) {
    for (const f of n.folders) prune(f)
    n.folders = n.folders.filter((f) => f.images.length || f.folders.length || f.jsons.length)
  }
  prune(root)
  
  function assignCovers(n) {
    n.cover = n.images.find((p) => {
      const baseName = p.name.split('.')[0].toLowerCase()
      return baseName === 'cover'
    }) || n.images[0] || null
    for (const f of n.folders) assignCovers(f)
  }
  assignCovers(root)
  
  return root
}
