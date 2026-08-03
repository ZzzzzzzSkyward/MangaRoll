import { reactive, watch } from 'vue'
import { normalizeKeybinding } from './keybindings'

// 统一设置存储：智能裁剪 / 摩尔纹 / 最大渲染尺寸 / OCR / 快捷键，全部持久化到 localStorage。
// 键为 defaultKeybindings 常量，避免与阅读进度（comicreader:v1）冲突。
const KEY = 'comicreader:settings'

const DEFAULT_ACTIONS = {
  nextPage: ['Space', 'ArrowDown', 'ArrowRight'],
  prevPage: ['ArrowLeft', 'ArrowUp'],
  scrollDown: ['PageDown'],
  scrollUp: ['PageUp'],
  goStart: ['Home'],
  goEnd: ['End'],
  toggleDanmaku: ['D'],
  toggleFullscreen: ['F'],
  zoomIn: ['='],
  zoomOut: ['-'],
  fitWidth: [],
  fitHeight: [],
  toggleCrop: [],
  toggleTablet: [],
  cycleMode: [],
  toggleToolbar: [],
  toggleOCR: [],
}

const defaults = {
  cropEnabled: false,
  moireEnabled: false,
  moireRadius: 2,
  maxRenderSize: 0,
  ocrEnabled: false,
  ocrClient: null, // null | { type: 'azure' | 'generic', endpoint, apiKey }
  keybindings: null, // null 表示使用默认 DEFAULT_KEYS，否则 { action: [按键串] }
}

export const settings = reactive({ ...defaults })

try {
  const saved = JSON.parse(localStorage.getItem(KEY) || 'null')
  if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
    for (const k of Object.keys(defaults)) {
      if (k in saved && saved[k] !== undefined && saved[k] !== null) {
        if (k === 'keybindings' && typeof saved[k] === 'object' && !Array.isArray(saved[k])) {
          const kb = {}
          for (const [action, keysArr] of Object.entries(saved[k])) {
            if (Array.isArray(keysArr)) kb[action] = keysArr.map((s) => normalizeKeybinding(s))
          }
          settings[k] = kb
        } else if (k !== 'keybindings') {
          settings[k] = saved[k]
        }
      }
    }
  }
} catch {
  /* ignore */
}

watch(
  settings,
  (v) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(v))
    } catch {
      /* ignore */
    }
  },
  { deep: true }
)

export function defaultKeybindings() {
  const out = {}
  for (const key of Object.keys(DEFAULT_ACTIONS)) out[key] = DEFAULT_ACTIONS[key].slice()
  return out
}

export function currentKeybindings() {
  return settings.keybindings ? settings.keybindings : defaultKeybindings()
}

export function resetKeybindings() {
  settings.keybindings = null
}