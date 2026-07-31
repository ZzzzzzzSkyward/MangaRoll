import { reactive, ref, watch } from 'vue'
import { walkItems, unzip, extractDims, naturalCompare, isImage, isJson, isZip } from './lib/importer'
import { MODE_VERTICAL, isMode, isHorizontalMode } from './lib/modes'
import { isNicoNicoFormat, parseNicoNico } from './lib/danmakuFormats'

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
  for (const p of state.pages) if (p.url) URL.revokeObjectURL(p.url)
  state.pages = []
}

export function setMode(m) {
  state.mode = m
  if (m === MODE_VERTICAL && state.zoomMode === 'height') state.zoomMode = 'width'
  if (isHorizontalMode(m) && state.zoomMode === 'width') state.zoomMode = 'height'
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

function titleFrom(entries, kind) {
  if (kind === 'zip') {
    const n = entries[0].path
    const i = n.lastIndexOf('.')
    return i > 0 ? n.slice(0, i) : n
  }
  return entries[0].path.split('/')[0]
}

async function handleEntries(entries, kind) {
  const currentImportId = ++importId
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
  // 与 ZIP 一起拖入的弹幕 JSON 优先于压缩包内的
  const jsons = externalJsons.length ? externalJsons : entries.filter((e) => isJson(e.path))
  if (jsons.length) await loadDanmakuFile(jsons[0].file)

  if (!imgs.length) {
    state.status = 'empty'
    showToast('未找到图片文件')
    return
  }

  state.loading = { label: '读取图片信息…', current: 0, total: imgs.length }
  const pages = await extractDims(imgs, (c) => {
    state.loading.current = c
  })
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
  restoreProgress()
  state.status = 'ready'
  showToast(`已加载 ${pages.length} 页`)
}

function onlyJsonEntries(entries) {
  return entries.length > 0 && entries.every((e) => isJson(e.path))
}

export async function importDropped(items) {
  const prevStatus = state.status
  state.status = 'loading'
  state.loading = { label: '扫描文件夹…', current: 0, total: 0 }
  try {
    const entries = await walkItems(items)
    if (!entries.length) {
      state.status = 'empty'
      showToast('未读取到文件')
      return
    }
    if (onlyJsonEntries(entries)) {
      await loadDanmakuFile(entries[0].file)
      state.status = prevStatus
      return
    }
    await handleEntries(entries, 'folder')
  } catch (e) {
    console.error(e)
    state.status = 'empty'
    showToast('导入失败：' + e.message)
  }
}

export async function importFolder(items) {
  const prevStatus = state.status
  state.status = 'loading'
  state.loading = { label: '扫描文件夹…', current: 0, total: 0 }
  try {
    const entries = items[0]?.path !== undefined ? items : await walkItems(items)
    if (!entries.length) {
      state.status = 'empty'
      showToast('未读取到文件')
      return
    }
    if (onlyJsonEntries(entries)) {
      await loadDanmakuFile(entries[0].file)
      state.status = prevStatus
      return
    }
    await handleEntries(entries, 'folder')
  } catch (e) {
    console.error(e)
    state.status = 'empty'
    showToast('导入失败：' + e.message)
  }
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

export async function loadDanmakuFile(file) {
  try {
    const text = await file.text()
    const data = JSON.parse(text)
    let byPage, count
    if (isNicoNicoFormat(data)) {
      const result = parseNicoNico(data)
      byPage = result.byPage
      count = result.count
      console.log(`[弹幕] NicoNico解析完成: ${count}条, 分布:`, [...byPage.entries()].map(([k,v]) => `p${k}:${v.length}`).join(', '))
    } else {
      if (!Array.isArray(data.danmaku)) throw new Error('缺少 danmaku 数组')
      byPage = new Map()
      count = 0
      const unit = Number(data.meta?.timeUnit) || 1
      for (const item of data.danmaku) {
        if (!item || typeof item.text !== 'string' || !Number.isFinite(item.page)) continue
        const time = Number(item.time)
        if (!Number.isFinite(time)) continue
        const arr = byPage.get(item.page) || []
        arr.push({ ...item, time: time * unit })
        byPage.set(item.page, arr)
        count++
      }
      for (const arr of byPage.values()) arr.sort((a, b) => a.time - b.time)
    }
    state.danmaku = { byPage, count }
    state.danmakuOn = true
    showToast(`弹幕已加载：${count} 条`)
  } catch (e) {
    console.error(e)
    showToast('弹幕 JSON 解析失败')
  }
}
