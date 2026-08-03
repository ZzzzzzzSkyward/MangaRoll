import { settings, currentKeybindings } from './settings'

// 动作注册表：所有可绑定动作及其中文名。默认键定义在 settings.js 的 DEFAULT_ACTIONS。
export const ACTION_DEFS = {
  nextPage: '下一页',
  prevPage: '上一页',
  scrollDown: '向下滚动一屏',
  scrollUp: '向上滚动一屏',
  goStart: '回到开头',
  goEnd: '跳到末页',
  toggleDanmaku: '弹幕开关',
  toggleFullscreen: '全屏开关',
  zoomIn: '放大',
  zoomOut: '缩小',
  fitWidth: '适应宽度',
  fitHeight: '适应高度',
  toggleCrop: '自动裁边开关',
  toggleTablet: '平板模式开关',
  cycleMode: '切换阅读模式',
  toggleToolbar: '收起/展开工具栏',
  toggleOCR: 'OCR 开关',
}

export const ACTION_NAMES = Object.keys(ACTION_DEFS)

let reverseMap = null

// e.code 转可读名称：KeyA → A、Digit1 → 1、Numpad3 → 3、Space / ArrowRight 等原文不变
export function codeToLabel(code) {
  if (!code) return ''
  if (code.startsWith('Key')) return code.slice(3)
  if (code.startsWith('Digit')) return code.slice(5)
  if (code === 'Space') return 'Space'
  if (code === 'Backquote') return '`'
  if (code.startsWith('Numpad')) return 'Num' + code.slice(6)
  if (code === 'Comma') return ','
  if (code === 'Period') return '.'
  if (code === 'Semicolon') return ';'
  if (code === 'Quote') return "'"
  if (code === 'BracketLeft') return '['
  if (code === 'BracketRight') return ']'
  if (code === 'Backslash') return '\\'
  if (code === 'Slash') return '/'
  if (code === 'Minus') return '-'
  if (code === 'Equal') return '='
  return code
}

// 组合键序列化：均匀前缀 + code 派生名（如 Shift+D）。纯修饰键（Ctrl/Shift 等）返回 null。
export function serializeKey(e) {
  const mods = []
  if (e.ctrlKey) mods.push('Ctrl')
  if (e.altKey) mods.push('Alt')
  if (e.shiftKey) mods.push('Shift')
  if (e.metaKey) mods.push('Meta')
  const code = e.code
  // 判定是否为纯修饰键（按物理键码，避免大小写分词干扰）
  if (/^(Control|Shift|Alt|Meta)$/.test(code)) return null
  const label = codeToLabel(code)
  if (!label || label === 'Unidentified') return null
  return [...mods, label].join('+')
}

// 兼容历史存储的原始 e.code 形式（如 Equal / KeyD），统一规范为 serializeKey 输出的紧凑标签（= / D）。
// 对已是标签形式的字符串幂等（codeToLabel 对非 code 字符串原样返回）。
export function normalizeKeybinding(s) {
  if (!s) return s
  const parts = s.split('+')
  const key = codeToLabel(parts[parts.length - 1])
  return [...parts.slice(0, -1), key].join('+')
}

// 由当前绑定（自定义或默认）构建 按键串 → 动作 的查找表
function refreshReverseMap() {
  const bindings = currentKeybindings()
  const map = new Map()
  for (const [action, keys] of Object.entries(bindings)) {
    const def = ACTION_DEFS[action]
    if (!def || !Array.isArray(keys)) continue
    for (const k of keys) {
      const nk = k && normalizeKeybinding(k)
      if (nk) map.set(nk, action)
    }
  }
  reverseMap = map
}

export function resolveAction(serialized) {
  if (!reverseMap) refreshReverseMap()
  return reverseMap.get(serialized)
}

// 设置项变化时失效缓存
export function invalidateKeybindings() {
  reverseMap = null
}

// 绑定唯一性：把序列化键记到某动作（从其它动作移除同键）
export function bindKey(serialized, actionLabel) {
  const bindings = { ...currentKeybindings() }
  // 从任意动作中移除该键
  for (const k of Object.keys(bindings)) {
    if (k !== actionLabel && Array.isArray(bindings[k])) {
      bindings[k] = bindings[k].filter((s) => s !== serialized)
    }
  }
  if (!bindings[actionLabel]) bindings[actionLabel] = []
  if (!bindings[actionLabel].includes(serialized)) bindings[actionLabel].push(serialized)
  settings.keybindings = bindings
  invalidateKeybindings()
}