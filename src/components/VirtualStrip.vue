<script setup>
import { ref, reactive, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import PageSlot from './PageSlot.vue'
import { state, setZoomValue } from '../store'
import { MODE_VERTICAL } from '../lib/modes'
import { useStripLayout } from '../composables/useStripLayout'
import { useGestureScroll } from '../composables/useGestureScroll'
import { usePinch } from '../composables/usePinch'

const props = defineProps({
  axis: { type: String, default: MODE_VERTICAL },
})

const axis = computed(() => props.axis)
const scroller = ref(null)
const vp = reactive({ w: 800, h: 600 })
const pos = reactive({ v: 0 })
let raf = 0
let ro = null
let jumpPending = true

const strip = useStripLayout({
  axis,
  scroller,
  pos,
  vp,
  getPages: () => state.pages,
  getZoomMode: () => state.zoomMode,
  getZoom: () => state.zoom,
})

const gesture = useGestureScroll({
  scroller,
  axis,
  isTablet: () => state.tabletMode,
  getViewport: () => strip.viewport.value,
})

const pinch = usePinch({
  isTablet: () => state.tabletMode,
  getZoom: () => state.zoom,
  setZoom: setZoomValue,
})

const { vertical, layout, viewport, zoomAnim, rangeFor, pageAt, targetFor } = strip

const buffer = computed(() => {
  const { sizes } = layout.value
  if (!sizes.length) return viewport.value * 3
  let maxPage = 0
  for (const s of sizes) if (s > maxPage) maxPage = s
  return Math.max(viewport.value * 1.5, maxPage)
})

const visible = computed(() => {
  if (!layout.value.starts.length) return []
  const { from, to } = rangeFor(pos.v, buffer.value)
  const out = []
  for (let i = from; i < to; i++) out.push(i)
  if (!out.length) out.push(pageAt(pos.v))
  return out
})

const currentIndex = computed(() => (layout.value.starts.length ? pageAt(pos.v) : 0))

const stripStyle = computed(() => {
  if (!layout.value.starts.length) return vertical.value ? { height: '0px' } : { width: '0px' }
  return vertical.value
    ? { height: layout.value.total + 'px', width: '100%' }
    : { width: layout.value.total + 'px', height: '100%' }
})

watch(currentIndex, (v) => {
  if (v !== state.current) state.current = v
})

watch(
  () => state.current,
  (v) => {
    if (v !== currentIndex.value) scrollToPage(v, true)
  }
)

watch(
  () => state.zoom,
  (target) => strip.animateZoomTo(target)
)

watch(layout, () => {
  if (jumpPending) {
    jumpPending = false
    nextTick(() => scrollToPage(state.current, false))
    return
  }
  if (strip.isZooming()) return
  if (strip.consumeSnap()) return
  nextTick(() => scrollToPage(currentIndex.value, false))
})

watch(
  () => state.pages.length,
  (n, o) => {
    if (o === 0 && n > 0) {
      jumpPending = true
      strip.cancelZoom()
    }
  }
)

watch(
  () => props.axis,
  () => {
    pos.v = 0
    jumpPending = false
    strip.cancelZoom()
    nextTick(() => scrollToPage(state.current, false))
  }
)

function onScroll() {
  if (raf) return
  raf = requestAnimationFrame(() => {
    raf = 0
    pos.v = vertical.value ? scroller.value.scrollTop : scroller.value.scrollLeft
  })
}

function scrollToPage(i, smooth = true) {
  if (!layout.value.starts.length) return
  const target = targetFor(i)
  if (vertical.value) scroller.value.scrollTo({ top: target, behavior: smooth ? 'smooth' : 'auto' })
  else scroller.value.scrollTo({ left: target, behavior: smooth ? 'smooth' : 'auto' })
}

function scrollByViewport(dir) {
  const d = viewport.value * dir
  if (vertical.value) scroller.value.scrollBy({ top: d, behavior: 'smooth' })
  else scroller.value.scrollBy({ left: d, behavior: 'smooth' })
}

onMounted(() => {
  vp.w = scroller.value.clientWidth
  vp.h = scroller.value.clientHeight
  zoomAnim.value = state.zoom
  ro = new ResizeObserver(() => {
    vp.w = scroller.value.clientWidth
    vp.h = scroller.value.clientHeight
  })
  ro.observe(scroller.value)
  scroller.value.addEventListener('wheel', gesture.onWheel, { passive: false })
  scroller.value.addEventListener('touchstart', pinch.onTouchStart, { passive: false })
  scroller.value.addEventListener('touchmove', pinch.onTouchMove, { passive: false })
  scroller.value.addEventListener('touchend', pinch.onTouchEnd)
})

onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  strip.cancelZoom()
  gesture.dispose()
  ro?.disconnect()
  scroller.value?.removeEventListener('wheel', gesture.onWheel)
  scroller.value?.removeEventListener('touchstart', pinch.onTouchStart)
  scroller.value?.removeEventListener('touchmove', pinch.onTouchMove)
  scroller.value?.removeEventListener('touchend', pinch.onTouchEnd)
})

defineExpose({ scrollToPage, scrollByViewport, currentIndex, consumeClick: gesture.consumeClick })
</script>

<template>
  <div
    ref="scroller"
    class="strip-scroller"
    :class="{ dragging: gesture.drag.on }"
    @scroll.passive="onScroll"
    @pointerdown="gesture.onPointerDown"
    @pointermove="gesture.onPointerMove"
    @pointerup="gesture.endDrag"
    @pointercancel="gesture.endDrag"
  >
    <div class="strip" :class="vertical ? 'axis-y' : 'axis-x'" :style="stripStyle">
      <PageSlot
        v-for="i in visible"
        :key="state.pages[i].key"
        :index="i"
        :page="state.pages[i]"
        :axis="axis"
        :along="layout.sizes[i]"
        :cross="layout.cross[i]"
        :vp="vp"
        :offset="strip.pageStart(i)"
        :active="i === currentIndex"
      />
    </div>
  </div>
</template>

<style scoped>
.strip-scroller {
  position: absolute;
  inset: 0;
  overflow: auto;
  overscroll-behavior: contain;
  background: var(--bg);
  cursor: grab;
  user-select: none;
  touch-action: pan-x pan-y;
}
.strip-scroller.dragging {
  cursor: grabbing;
}
.strip {
  position: relative;
}
.axis-y {
  width: 100%;
}
.axis-x {
  height: 100%;
}
</style>
