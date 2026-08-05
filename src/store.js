import { reactive, ref, watch } from 'vue'
import { MODE_VERTICAL, MODES, isMode, isHorizontalMode } from './lib/modes'
import { flushBlobCache } from './lib/blobUrlCache'
import { flushMoireCache } from './lib/moireCache'
import { flushOcrCache } from './lib/ocr/ocrClient'
import { saveProgress, restoreProgress } from './lib/progress'
import { settings } from './lib/settings'

export const state = reactive({
  status: 'empty',
  loading: { label: '', current: 0, total: 0 },
  title: '',
  pages: [],
  mode: MODE_VERTICAL,
  zoomMode: 'width',
  zoom: 1,
  danmaku: null,
  danmakuOn: true,
  danmakuOpacity: 0.85,
  danmakuSpeed: 1,
  current: 0,
  progressKey: '',

  view: 'comic',
  tree: null,
  dir: null,
  sourceEntry: null,
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

export function releasePages() {
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

watch(
  () => [state.current, state.mode, state.danmakuOn, state.danmakuOpacity, state.danmakuSpeed],
  () => saveProgress()
)
