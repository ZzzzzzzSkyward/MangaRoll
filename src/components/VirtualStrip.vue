<script setup>
import { ref, reactive, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import PageSlot from './PageSlot.vue'
import { state } from '../store'
import { MODE_VERTICAL, MODE_RIGHT_TO_LEFT } from '../lib/modes'
import { settings } from '../lib/settings'
import { useStripLayout } from '../composables/useStripLayout'
import { useGestureScroll } from '../composables/useGestureScroll'
import { preloadImage } from '../lib/preloadManager'

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
  getCrop: () => settings.cropEnabled,
})

const gesture = useGestureScroll({
  scroller,
  axis,
  getViewport: () => strip.viewport.value,
})

const { vertical, rightToLeft, layout, viewport, zoomAnim, rangeFor, pageAt, pageAtEdge, pageEnd, pageStart, targetFor } = strip

const buffer = computed(() => {
  const { sizes } = layout.value
  if (!sizes.length) return viewport.value * 3
  let maxPage = 0
  for (const s of sizes) if (s > maxPage) maxPage = s
  return Math.max(viewport.value * 1.5, maxPage)
})

const visible = computed(() => {
  if (!layout.value.starts.length) return []
  // 预加载模式：扩大渲染范围（3倍视口），同时由 preloadManager 在后台顺序加载全部图片
  if (settings.imageLoadMode === 'preload') {
    const { from, to } = rangeFor(pos.v, viewport.value * 3)
    const out = []
    for (let i = from; i < to; i++) out.push(i)
    if (!out.length) out.push(pageAt(pos.v))
    return out
  }
  const { from, to } = rangeFor(pos.v, buffer.value)
  const out = []
  for (let i = from; i < to; i++) out.push(i)
  if (!out.length) out.push(pageAt(pos.v))
  return out
})

const currentIndex = computed(() => (layout.value.starts.length ? pageAt(pos.v) : 0))

// 预加载模式：当前页变化时触发后台顺序预加载
let preloadAbort = null
watch(
  () => [settings.imageLoadMode, state.pages.length, currentIndex.value],
  ([mode, len, cur]) => {
    if (preloadAbort) {
      preloadAbort.abort()
      preloadAbort = null
    }
    if (mode === 'preload' && len > 0) {
      preloadAbort = preloadImage(state.pages, cur)
    }
  },
  { immediate: true }
)

const stripStyle = computed(() => {
  if (!layout.value.starts.length) return vertical.value ? { height: '0px' } : { width: '0px' }
  return vertical.value
    ? { height: layout.value.total + 'px', width: '100%' }
    : { width: layout.value.total + 'px', height: '100%' }
})

// 轴切换期间禁止 currentIndex watch 用旧 pos.v 在新布局里算出脏页覆写 state.current
let axisSwitching = false

watch(currentIndex, (v) => {
  if (axisSwitching) return
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
  if (axisSwitching) return
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
      cancelSingleAnim()
    }
  }
)

watch(
  () => props.axis,
  () => {
    // flush: 'sync' —— 在 setMode 赋值的同一同步时刻捕获当前页。
    // 若用默认 pre flush，同轮 flush 里先注册的 currentIndex watch 会用旧 pos.v
    // 在新布局中算出脏页并覆写 state.current，导致跳转目标错误。
    const target = state.current
    axisSwitching = true
    pos.v = 0
    jumpPending = false
    strip.cancelZoom()
    // 切换阅读模式（布局）时重置单图缩放
    cancelSingleAnim()
    state.singleZoom = null
    nextTick(() => {
      scrollToPage(target, false)
      axisSwitching = false
    })
  },
  { flush: 'sync' }
)

function onScroll() {
  if (raf) return
  raf = requestAnimationFrame(() => {
    raf = 0
    pos.v = vertical.value ? scroller.value.scrollTop : scroller.value.scrollLeft
  })
}

function scrollToPage(i, smooth = true) {
  if (!layout.value.starts.length) {
    return
  }
  const target = targetFor(i)
  if (vertical.value) scroller.value.scrollTo({ top: target, behavior: smooth ? 'smooth' : 'auto' })
  else scroller.value.scrollTo({ left: target, behavior: smooth ? 'smooth' : 'auto' })
}

// 检查指定页的边缘是否已与屏幕边缘对齐
function isEdgeAligned(i, edge) {
  const { starts, sizes } = layout.value
  const n = starts.length
  if (!n || i < 0 || i >= n) return false
  const el = scroller.value
  if (!el) return false
  const p = vertical.value ? el.scrollTop : el.scrollLeft
  if (vertical.value) {
    if (edge === 'top') return Math.abs(p - starts[i]) < 1
    return Math.abs(p - (starts[i] + sizes[i] - viewport.value)) < 1
  } else if (rightToLeft.value) {
    if (edge === 'right') return Math.abs(p - (layout.value.total - starts[i] - viewport.value)) < 1
    return Math.abs(p - (layout.value.total - starts[i] - sizes[i])) < 1
  } else {
    if (edge === 'left') return Math.abs(p - starts[i]) < 1
    return Math.abs(p - (starts[i] + sizes[i] - viewport.value)) < 1
  }
}

// 将指定页的边缘与屏幕边缘对齐
function scrollToPageEdge(i, edge, smooth = true) {
  if (!layout.value.starts.length) return
  const { starts, sizes, total } = layout.value
  const n = starts.length
  const t = Math.max(0, Math.min(n - 1, i))
  let target
  if (vertical.value) {
    target = edge === 'bottom' ? starts[t] + sizes[t] - viewport.value : starts[t]
  } else if (rightToLeft.value) {
    target = edge === 'left' ? total - starts[t] - sizes[t] : total - starts[t] - viewport.value
  } else {
    target = edge === 'right' ? starts[t] + sizes[t] - viewport.value : starts[t]
  }
  if (vertical.value) scroller.value.scrollTo({ top: target, behavior: smooth ? 'smooth' : 'auto' })
  else scroller.value.scrollTo({ left: target, behavior: smooth ? 'smooth' : 'auto' })
}

function scrollByViewport(dir) {
  const d = viewport.value * dir
  if (vertical.value) scroller.value.scrollBy({ top: d, behavior: 'smooth' })
  else scroller.value.scrollBy({ left: d, behavior: 'smooth' })
}

function lowerBound(arr, x) {
  let lo = 0
  let hi = arr.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (arr[mid] < x) lo = mid + 1
    else hi = mid
  }
  return lo
}

// ---- 单图缩放动画（双击恢复原大小）：rAF 缓动，结束置空 ----
let singleAnim = 0

function cancelSingleAnim() {
  if (singleAnim) cancelAnimationFrame(singleAnim)
  singleAnim = 0
}

// 缩放锚点钳制：确保放大后图片的左 / 上边缘不超出屏幕，无需拖动即可查看完整图片。
// 横向轴（无滚动）：左边缘保持在视口内 → ax 上限 marginX/((z-1)W)；
// 纵向轴（可滚动）：上/左边缘不越过页面起始位置（保证可滚动到）→ ay/ax 上限 starts[i]/((z-1)*尺寸)。
function clampZoomAnchor(idx, ax, ay, zoom) {
  const { starts, sizes, cross } = layout.value
  if (!sizes.length || idx < 0 || idx >= sizes.length) return { ax, ay }
  const W = vertical.value ? cross[idx] : sizes[idx]
  const H = vertical.value ? sizes[idx] : cross[idx]
  const z = zoom
  if (!(W > 0) || !(H > 0) || z <= 1) return { ax, ay }
  const marginX = vertical.value ? (vp.w - W) / 2 : (vp.h - H) / 2
  const maxAx = marginX / ((z - 1) * W)
  let maxAy
  if (vertical.value) {
    maxAy = starts[idx] / ((z - 1) * H)
  } else if (rightToLeft.value) {
    maxAy = (starts[idx] + z * W) / ((z - 1) * W)
  } else {
    maxAy = starts[idx] / ((z - 1) * W)
  }
  return {
    ax: Math.min(ax, maxAx),
    ay: Math.min(ay, maxAy),
  }
}

function animateSingleZoomReset(idx) {
  const s = state.singleZoom
  if (!s || s.index !== idx) return
  cancelSingleAnim()
  const start = s.zoom
  if (start <= 1.001) {
    state.singleZoom = null
    return
  }
  const t0 = performance.now()
  const dur = 240
  const step = (t) => {
    const k = Math.min(1, (t - t0) / dur)
    const e = 1 - Math.pow(1 - k, 3)
    const zoom = start + (1 - start) * e
    state.singleZoom = {
      index: idx,
      zoom,
      ax: s.ax,
      ay: s.ay,
      animating: true,
    }
    if (k < 1) singleAnim = requestAnimationFrame(step)
    else {
      singleAnim = 0
      state.singleZoom = null
    }
  }
  singleAnim = requestAnimationFrame(step)
}

// Ctrl+滚轮：单图缩放 —— 只对光标下的图片做 CSS transform 缩放，不改变整条 strip 布局。
// 目标图 z-index 临时置顶；切换阅读模式（布局）时重置，单纯滚动不重置。
// 锚点取光标在图片内的比例（纵/横模式下图片恰好填满槽位，槽位比例即图片比例）。
function onCtrlWheel(e) {
  if (!e.ctrlKey) return
  e.preventDefault()
  const el = scroller.value
  const { starts, sizes, cross, total } = layout.value
  const n = starts.length
  if (!el || !n) return
  const rect = el.getBoundingClientRect()
  const isRtl = props.axis === MODE_RIGHT_TO_LEFT
  const raw = vertical.value ? e.clientY - rect.top + el.scrollTop : e.clientX - rect.left + el.scrollLeft
  const contentPos = isRtl ? total - raw : raw

  let idx = lowerBound(starts, contentPos)
  if (idx > 0 && starts[idx] > contentPos) idx -= 1
  idx = Math.min(n - 1, Math.max(0, idx))

  const alongSize = sizes[idx]
  const pageStartPos = isRtl ? total - starts[idx] - alongSize : starts[idx]
  const ax = alongSize > 0 ? Math.min(1, Math.max(0, (contentPos - pageStartPos) / alongSize)) : 0.5
  const acrossClient = vertical.value ? e.clientX - rect.left : e.clientY - rect.top
  const acrossSize = cross[idx]
  const ay = acrossSize > 0 ? Math.min(1, Math.max(0, acrossClient / acrossSize)) : 0.5

  const prev = state.singleZoom && state.singleZoom.index === idx ? state.singleZoom.zoom : 1
  const zoom = Math.min(3, Math.max(0.5, prev * Math.exp(-e.deltaY * 0.0016)))
  cancelSingleAnim()
  const c = clampZoomAnchor(idx, ax, ay, zoom)
  state.singleZoom = { index: idx, zoom, ax: c.ax, ay: c.ay, animating: false }
}

function onDblClick(e) {
  const el = scroller.value
  const { starts, sizes, cross, total } = layout.value
  const n = starts.length
  if (!el || !n) return
  const rect = el.getBoundingClientRect()
  const isRtl = props.axis === MODE_RIGHT_TO_LEFT
  const raw = vertical.value ? e.clientY - rect.top + el.scrollTop : e.clientX - rect.left + el.scrollLeft
  const contentPos = isRtl ? total - raw : raw

  let idx = lowerBound(starts, contentPos)
  if (idx > 0 && starts[idx] > contentPos) idx -= 1
  idx = Math.min(n - 1, Math.max(0, idx))

  const alongSize = sizes[idx]
  const pageStartPos = isRtl ? total - starts[idx] - alongSize : starts[idx]
  const ax = alongSize > 0 ? Math.min(1, Math.max(0, (contentPos - pageStartPos) / alongSize)) : 0.5
  const acrossClient = vertical.value ? e.clientX - rect.left : e.clientY - rect.top
  const acrossSize = cross[idx]
  const ay = acrossSize > 0 ? Math.min(1, Math.max(0, acrossClient / acrossSize)) : 0.5

  const prev = state.singleZoom && state.singleZoom.index === idx ? state.singleZoom.zoom : 1
  if (prev === 1) {
    cancelSingleAnim()
    const c = clampZoomAnchor(idx, ax, ay, 1.5)
    state.singleZoom = { index: idx, zoom: 1.5, ax: c.ax, ay: c.ay, animating: false }
  } else {
    animateSingleZoomReset(idx)
  }
}

function onWheelProxy(e) {
  if (e.ctrlKey) onCtrlWheel(e)
  else gesture.onWheel(e)
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
  scroller.value.addEventListener('wheel', onWheelProxy, { passive: false })
})

onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  strip.cancelZoom()
  cancelSingleAnim()
  gesture.dispose()
  ro?.disconnect()
  scroller.value?.removeEventListener('wheel', onWheelProxy)
})

defineExpose({ scrollToPage, scrollToPageEdge, scrollByViewport, isEdgeAligned, pageAtEdge, currentIndex, consumeClick: gesture.consumeClick })
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
    @dblclick="onDblClick"
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
