<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import VirtualStrip from './VirtualStrip.vue'
import { state } from '../store'
import { MODE_RIGHT_TO_LEFT, isHorizontalMode } from '../lib/modes'

const strip = ref(null)

function last() {
  return state.pages.length - 1
}

function onKey(e) {
  const t = e.target
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return
  switch (e.key) {
    case ' ':
      e.preventDefault()
      turn(1)
      break
    case 'ArrowRight':
    case 'ArrowDown':
      if (isHorizontalMode(state.mode) || e.key === 'ArrowDown') e.preventDefault(), turn(1)
      break
    case 'ArrowLeft':
    case 'ArrowUp':
      if (isHorizontalMode(state.mode) || e.key === 'ArrowUp') e.preventDefault(), turn(-1)
      break
    case 'PageDown':
      e.preventDefault()
      scrollVp(1)
      break
    case 'PageUp':
      e.preventDefault()
      scrollVp(-1)
      break
    case 'Home':
      e.preventDefault()
      strip.value?.scrollToPage(0)
      break
    case 'End':
      e.preventDefault()
      strip.value?.scrollToPage(last())
      break
    case 'd':
    case 'D':
      state.danmakuOn = !state.danmakuOn
      break
    case 'f':
    case 'F':
      toggleFullscreen()
      break
  }
}

function cur() {
  return strip.value ? strip.value.currentIndex : state.current
}

function turn(d) {
  strip.value?.scrollToPage(Math.max(0, Math.min(last(), cur() + d)))
}

function scrollVp(d) {
  strip.value?.scrollByViewport(d)
}

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen()
  else document.documentElement.requestFullscreen?.()
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

onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="reader" @click="onClick">
    <VirtualStrip ref="strip" :axis="state.mode" />
  </div>
</template>

<style scoped>
.reader {
  position: absolute;
  inset: 0;
}
</style>
