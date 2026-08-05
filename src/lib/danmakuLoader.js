import { state } from '../store'
import { parseUniversalDanmaku } from './danmakuParser'
import { showToast } from '../store'

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
