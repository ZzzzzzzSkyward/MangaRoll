#!/usr/bin/env node
// 将 Niconico 弹幕 JSON（含 thread 与 chat 的数组）转换为通用弹幕格式（spec_danmaku.json）。
// 输出为最小体积：仅保留必填字段与非默认值的样式字段，省略全部可选元信息，并压缩为单行 JSON。
// 用法：node niconico.js <输入.json> [输出.json]
import fs from 'node:fs'
import path from 'node:path'

const FORMAT_CODE = 'comic-danmaku'
const FORMAT_VERSION = 1

const DEFAULT_COLOR = '#ffffff'
const DEFAULT_SIZE = 'normal'
const DEFAULT_POSITION = 'scroll'

// mail 指令中的位置 / 字号 / 颜色词
const NICO_POSITION = {
  u: 'top',
  ue: 'top',
  shita: 'bottom',
  naka: 'scroll',
}
const NICO_SIZE = {
  small: 'small',
  medium: 'normal',
  big: 'large',
}
const NICO_COLORS = {
  red: '#ff0000',
  pink: '#ff8080',
  orange: '#ffc000',
  yellow: '#ffff00',
  green: '#00ff00',
  cyan: '#00ffff',
  blue: '#0000ff',
  purple: '#c000ff',
  black: '#000000',
  white: '#ffffff',
}
// 未指定颜色时，按位置使用默认色（与 Niconico 行为一致）
const POSITION_DEFAULT_COLORS = { top: '#00ff00', bottom: '#0000ff', scroll: '#ffffff' }

function parseMailStyle(mail) {
  const style = { position: DEFAULT_POSITION, size: DEFAULT_SIZE, color: null }
  const words = String(mail || '').toLowerCase().split(/\s+/)
  for (const w of words) {
    if (!w) continue
    if (w in NICO_POSITION) style.position = NICO_POSITION[w]
    else if (w in NICO_SIZE) style.size = NICO_SIZE[w]
    else if (w in NICO_COLORS) style.color = NICO_COLORS[w]
  }
  if (!style.color) style.color = POSITION_DEFAULT_COLORS[style.position] || DEFAULT_COLOR
  return style
}

function toItems(data) {
  const danmaku = []
  let skipped = 0
  for (const block of Array.isArray(data) ? data : []) {
    const chat = block && block.chat
    if (!chat) continue
    const page = chat.leaf
    if (!Number.isInteger(page) || page < 1) {
      skipped++
      continue
    }
    if (typeof chat.content !== 'string' || !chat.content) {
      skipped++
      continue
    }
    const style = parseMailStyle(chat.mail)
    const item = { page, text: chat.content }
    if (style.color !== DEFAULT_COLOR) item.color = style.color
    if (style.size !== DEFAULT_SIZE) item.size = style.size
    if (style.position !== DEFAULT_POSITION) item.position = style.position
    danmaku.push(item)
  }
  danmaku.sort((a, b) => a.page - b.page)
  return { danmaku, skipped }
}

function buildResult(data) {
  const { danmaku, skipped } = toItems(data)
  return { format: FORMAT_CODE, version: FORMAT_VERSION, danmaku }
}

function main() {
  const [input, output] = process.argv.slice(2)
  if (!input) {
    console.error('用法：node niconico.js <输入.json> [输出.json]')
    process.exit(1)
  }
  const data = JSON.parse(fs.readFileSync(input, 'utf8'))
  const result = buildResult(data)
  const outPath = output || path.join(path.dirname(input), path.basename(input, '.json') + '.universal.json')
  fs.writeFileSync(outPath, JSON.stringify(result) + '\n')
  console.error(`已转换 ${result.danmaku.length} 条弹幕${result.skipped ? `，跳过 ${result.skipped} 条无效` : ''} → ${outPath}`)
}

main()