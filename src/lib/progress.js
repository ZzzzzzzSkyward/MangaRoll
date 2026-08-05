import { state } from '../store'
import { isMode } from './modes'

const LS_KEY = 'comicreader:v1'
let lastSave = 0

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

export function restoreProgress() {
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
