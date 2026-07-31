export const MODE_VERTICAL = 'vertical'
export const MODE_HORIZONTAL = 'horizontal'
export const MODE_RIGHT_TO_LEFT = 'right-to-left'

export const MODES = Object.freeze([MODE_VERTICAL, MODE_HORIZONTAL, MODE_RIGHT_TO_LEFT])

export function isMode(value) {
  return MODES.includes(value)
}

export function isVerticalMode(mode) {
  return mode === MODE_VERTICAL
}

export function isHorizontalMode(mode) {
  return mode === MODE_HORIZONTAL || mode === MODE_RIGHT_TO_LEFT
}
