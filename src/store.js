import { reactive, ref, watch } from 'vue'
import { walkItems, walkDirHandle, unzip, extractDims, extractDimsInto, naturalCompare, isImage, isJson, isDanmakuJson, isZip, buildFolderTree } from './lib/importer'
import { MODE_VERTICAL, MODES, isMode, isHorizontalMode } from './lib/modes'
import { parseUniversalDanmaku } from './lib/danmakuParser'
import { flushBlobCache } from './lib/blobUrlCache'
import { settings } from './lib/settings'
import { flushMoireCache } from './lib/moireCache'
import { flushOcrCache } from './lib/ocr/ocrClient'
import { loadManifest, loadWebDav } from './lib/remoteSource'

export const state = reactive({
  status: 'empty', // 'empty' | 'loading' | 'ready'
  loading: { label: '', current: 0, total: 0 },
  title: '',
  pages: [],
  mode: MODE_VERTICAL,
  zoomMode: 'width', // 'width' | 'height'
  zoom: 1,
  danmaku: null, // { byPage: Map, count: number }
  danmakuOn: true,
  danmakuOpacity: 0.85,
  danmakuSpeed: 1,
  current: 0,
  progressKey: '',
  tabletMode: false,
  // 文件夹列表视图：view 为 'list' 时阅读区显示目录列表（不渲染漫画）。
  // tree 为导入时构建的文件夹树（层级结构），dir 为列表当前所在目录节点。
  view: 'comic', // 'comic' | 'list'
  tree: null,
  dir: null,
  // 单图缩放（Ctrl+滚轮）：{ index, zoom, ax, ay }，仅对目标页 img 做 CSS transform，不改变布局。
  // index 为页下标；ax / ay 为图片内锚点比例（0~1，transform-origin 用）。切换阅读模式时重置。
  singleZoom: null,
})

export const dragging = ref(false)
export const toast = ref('')
let toastTimer = 0

export function showToast(msg) {
  toast.value = msg
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    toast.value = ''
  }, 2800)
}

const LS_KEY = 'comicreader:v1'
let lastSave = 0
let importId = 0

export function saveProgress() {
  if (!state.pages.length) return
  const now = Date.now()
  if (now - lastSave < 500) return
  lastSave = now
  try {
    localStorage.setItem(
      LS_KEY,
      JSON.stringify({
        key: state.progressKey,
        page: state.current,
        mode: state.mode,
        danmakuOn: state.danmakuOn,
        danmakuOpacity: state.danmakuOpacity,
        danmakuSpeed: state.danmakuSpeed,
      })
    )
  } catch {
    /* ignore */
  }
}

function restoreProgress() {
  try {
    const s = JSON.parse(localStorage.getItem(LS_KEY) || 'null')
    if (s && s.key === state.progressKey && isMode(s.mode)) {
      state.current = Math.min(Math.max(0, s.page || 0), state.pages.length - 1)
      state.mode = s.mode
      if (typeof s.danmakuOn === 'boolean') state.danmakuOn = s.danmakuOn
      if (typeof s.danmakuOpacity === 'number') state.danmakuOpacity = s.danmakuOpacity
      if (typeof s.danmakuSpeed === 'number') state.danmakuSpeed = s.danmakuSpeed
    }
  } catch {
    /* ignore */
  }
}

watch(
  () => [state.current, state.mode, state.danmakuOn, state.danmakuOpacity, state.danmakuSpeed],
  () => saveProgress()
)

function releasePages() {
  flushBlobCache()
  flushMoireCache()
  flushOcrCache()
  state.pages = []
  state.singleZoom = null
}

export function setMode(m) {
  state.mode = m
  if (m === MODE_VERTICAL && state.zoomMode === 'height') state.zoomMode = 'width'
  if (isHorizontalMode(m) && state.zoomMode === 'width') state.zoomMode = 'height'
}

export function cycleMode() {
  const idx = MODES.indexOf(state.mode)
  setMode(MODES[(idx + 1) % MODES.length])
}

export function toggleCrop() {
  settings.cropEnabled = !settings.cropEnabled
}

export function toggleOcr() {
  settings.ocrEnabled = !settings.ocrEnabled
}

export function toggleDanmaku() {
  state.danmakuOn = !state.danmakuOn
}

export function toggleTabletMode() {
  state.tabletMode = !state.tabletMode
}

export function setZoomValue(v) {
  state.zoom = Math.min(3, Math.max(0.5, v))
}

export function setZoom(dir) {
  setZoomValue(Math.round((state.zoom + (dir === 'in' ? 0.1 : -0.1)) * 10) / 10)
}

export function setZoomMode(m) {
  state.zoomMode = m
}

export function jumpTo(i) {
  if (!state.pages.length) return
  state.current = Math.max(0, Math.min(state.pages.length - 1, i))
}

// ---------- 文件夹列表视图导航 ----------

// 点击列表条目：含子文件夹则下钻一层；叶子文件夹（仅含图片）打开为漫画
export function openFolderNode(node) {
  if (node.folders.length) {
    state.dir = node
    state.title = node.name
    return
  }
  if (!node.images.length) {
    showToast('该文件夹内没有图片')
    return
  }
  openComicFromNode(node)
}

// 打开当前层级自身的漫画：目录同时含图片与子文件夹时，图片视为本层漫画
export function openSelfComic() {
  const dir = state.dir
  if (!dir || !dir.images.length) return
  openComicFromNode(dir)
}

// 从漫画返回目录列表（state.dir 仍指向打开漫画前所在目录）
export function backToList() {
  state.view = 'list'
  if (state.dir) state.title = state.dir.name
}

// 列表视图返回上一级目录
export function goUp() {
  if (state.dir?.parent) {
    state.dir = state.dir.parent
    state.title = state.dir.name
  }
}

// 打开漫画竞态防护：进行中的懒加载解析会被更新的打开操作或新导入作废
let openSeq = 0

// 将目录节点直接打开为漫画。页面尺寸按需解析：首次打开时以遮罩解析该目录的
// 尺寸 / 裁边 / 超限缩小（结果就地写回树上，会话内再次打开秒开），
// 已解析过则直接打开。进度按目录路径独立记忆；
// 弹幕优先加载该目录内的 JSON（同名规则见 importer），无则清空。
async function openComicFromNode(node) {
  const seq = ++openSeq
  const pending = node.images.filter((p) => !(p.w > 0))
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
  state.title = node.name
  state.progressKey = node.path
  state.current = 0
  state.zoom = 1
  state.zoomMode = 'width'
  restoreProgress()
  if (node.jsons.length) {
    const j = node.jsons.find((e) => isDanmakuJson(e.path)) || node.jsons[0]
    loadDanmakuFile(j.file)
  } else {
    state.danmaku = null
  }
  state.view = 'comic'
  state.status = 'ready'
}

function titleFrom(entries, kind) {
  if (kind === 'zip') {
    const n = entries[0].path
    const i = n.lastIndexOf('.')
    return i > 0 ? n.slice(0, i) : n
  }
  return entries[0].path.split('/')[0]
}

async function handleEntries(entries, kind) {
  // importId 递增标记用于竞态防护：解压 / 读图是异步的，
  // 若期间用户又触发了新导入，旧的异步结果应被丢弃。
  const currentImportId = ++importId
  openSeq++ // 新导入作废进行中的漫画打开（懒加载解析）
  // 打开新漫画时清空上一本的弹幕：新漫画自带弹幕 JSON 时
  // 由下方 loadDanmakuFile 重新填充，否则应保持为空。
  state.danmaku = null
  const externalJsons = entries.filter((e) => isJson(e.path))
  const zips = entries.filter((e) => isZip(e.path))
  let titleEntries = entries
  if (zips.length) {
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
  // 与 ZIP 一起拖入的弹幕 JSON 优先于压缩包内的；
  // 自动打开名称带 danmaku / 弹幕 的 JSON，未命中时回退到第一个 JSON（兼容旧文件）
  const jsons = externalJsons.length ? externalJsons : entries.filter((e) => isJson(e.path))
  const danmakuJson = jsons.find((e) => isDanmakuJson(e.path)) || jsons[0]
  if (jsons.length) await loadDanmakuFile(danmakuJson.file)

  if (!imgs.length) {
    state.status = 'empty'
    showToast('未找到图片文件')
    return
  }

  // 文件夹层级结构（存在子文件夹）→ 进入列表视图：不直接打开漫画。
  // 页面先以占位尺寸挂到树上（封面显示无需尺寸，列表立即进入），
  // 尺寸 / 裁边 / 超限缩小在打开对应漫画时按需解析（见 openComicFromNode），
  // 已解析页面挂回树上，会话内重复打开秒开。
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
    if (tree.folders.length) {
      releasePages()
      state.tree = tree
      state.dir = tree
      state.view = 'list'
      state.title = tree.name
      state.progressKey = ''
      state.status = 'ready'
      showToast(`检测到 ${tree.folders.length} 个子文件夹`)
      return
    }
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
      const danmakuJson = entries.find((e) => isDanmakuJson(e.path)) || entries[0]
      await loadDanmakuFile(danmakuJson.file)
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

// File System Access API：showDirectoryPicker() 返回的目录句柄直接递归遍历。
// 根路径以 dirHandle.name 开头，保证标题提取（path 首段）与 webkitdirectory 行为一致。
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

// 远程 URL 导入：走 runImport 类似流程（loading 层 + 竞态防护），
// 远程页不挂 blob URL，标题取 manifest.title 或 URL 末段目录名。
// opts.page 为起始页码（1 起），opts.danmakuUrl 为联动远程弹幕 JSON（见 README「URL 接口」）。
export async function importRemote(mode, url, opts = {}) {
  const currentImportId = ++importId
  openSeq++ // 新导入作废进行中的漫画打开（懒加载解析）
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
    // 显式指定的起始页优先于进度记忆（会覆盖 restoreProgress 的结果）
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

// 从远程 URL 拉取并挂载弹幕 JSON（通用弹幕格式，见 spec_danmaku.json），需服务端开 CORS
export async function loadRemoteDanmaku(url) {
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    const result = parseUniversalDanmaku(data)
    state.danmaku = { byPage: result.byPage, count: result.count }
    state.danmakuOn = true
    showToast(`弹幕已加载（${result.count} 条${result.skipped ? `，跳过 ${result.skipped} 条无效` : ''}）`)
  } catch (e) {
    console.error(e)
    showToast('远程弹幕加载失败')
  }
}

export async function loadDanmakuFile(file) {
  try {
    const text = await file.text()
    const result = parseUniversalDanmaku(JSON.parse(text))
    state.danmaku = { byPage: result.byPage, count: result.count }
    state.danmakuOn = true
    showToast(`弹幕已加载：${file.name}（${result.count} 条${result.skipped ? `，跳过 ${result.skipped} 条无效` : ''}）`)
  } catch (e) {
    console.error(e)
    showToast('弹幕 JSON 解析失败')
  }
}
