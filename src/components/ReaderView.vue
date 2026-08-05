<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import VirtualStrip from './VirtualStrip.vue'
import { state, setZoom, setZoomMode, toggleDanmaku, toggleCrop, toggleOcr, cycleMode } from '../store'
import { MODE_VERTICAL, MODE_RIGHT_TO_LEFT, isHorizontalMode } from '../lib/modes'
import { serializeKey, resolveAction } from '../lib/keybindings'
import { ui, toggleToolbar } from '../lib/uiState'
import { backToList, navChapter } from '../lib/importManager'

const strip = ref(null)
let lastTurnEdge = null
let lastTurnTime = 0

function last() {
  return state.pages.length - 1
}

function cur() {
  return strip.value ? strip.value.currentIndex : state.current
}

function turn(d) {
  if (!strip.value) return
  const s = strip.value
  let edge
  if (state.mode === MODE_VERTICAL) {
    edge = d > 0 ? 'bottom' : 'top'
  } else if (state.mode === MODE_RIGHT_TO_LEFT) {
    edge = d > 0 ? 'left' : 'right'
  } else {
    edge = d > 0 ? 'right' : 'left'
  }
  const now = performance.now()
  // 同一方向短时间内连续按键 → 跳过对齐检查，直接前进
  if (lastTurnEdge === edge && now - lastTurnTime < 800) {
    const edgePage = s.pageAtEdge(edge)
    s.scrollToPage(Math.max(0, Math.min(last(), edgePage + d)))
    lastTurnTime = now
    return
  }
  const edgePage = s.pageAtEdge(edge)
  if (s.isEdgeAligned(edgePage, edge)) {
    s.scrollToPage(Math.max(0, Math.min(last(), edgePage + d)))
  } else {
    s.scrollToPageEdge(edgePage, edge)
  }
  lastTurnEdge = edge
  lastTurnTime = now
}

function scrollVp(d) {
  strip.value?.scrollByViewport(d)
}

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen()
  else document.documentElement.requestFullscreen?.()
}

const ACTIONS = {
  nextPage: () => turn(1),
  prevPage: () => turn(-1),
  scrollDown: () => scrollVp(1),
  scrollUp: () => scrollVp(-1),
  goStart: () => strip.value?.scrollToPage(0),
  goEnd: () => strip.value?.scrollToPage(last()),
  toggleDanmaku: () => toggleDanmaku(),
  toggleFullscreen: () => toggleFullscreen(),
  zoomIn: () => setZoom('in'),
  zoomOut: () => setZoom('out'),
  fitWidth: () => setZoomMode('width'),
  fitHeight: () => setZoomMode('height'),
  toggleCrop: () => toggleCrop(),
  cycleMode: () => cycleMode(),
  toggleToolbar: () => toggleToolbar(),
  toggleOCR: () => toggleOcr(),
  backToList: () => backToList(),
  prevChapter: () => navChapter(-1),
  nextChapter: () => navChapter(1),
}

function onKey(e) {
  if (ui.settingsOpen || ui.remoteOpen) return
  const t = e.target
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return
  const s = serializeKey(e)
  if (!s) return
  const action = resolveAction(s)
  if (!action || !ACTIONS[action]) return
  e.preventDefault()
  ACTIONS[action]()
}

function onClick(e) {
  if (strip.value?.consumeClick()) return
  if (!isHorizontalMode(state.mode)) return
  const x = e.clientX / window.innerWidth
  if (state.mode === MODE_RIGHT_TO_LEFT) {
    if (x < 0.33) turn(1)
    else if (x > 0.67) turn(-1)
  } else {
    if (x < 0.33) turn(-1)
    else if (x > 0.67) turn(1)
  }
}

function onContextMenu(e) {
  e.preventDefault()
  toggleToolbar()
}

onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="reader" @click="onClick" @contextmenu="onContextMenu">
    <VirtualStrip ref="strip" :axis="state.mode" />
  </div>
</template>

<style scoped>
.reader {
  position: absolute;
  inset: 0;
}
</style>