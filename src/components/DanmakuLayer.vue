<script setup lang="ts">
import { reactive, ref, watch, onMounted, onBeforeUnmount, type PropType } from 'vue'
import type { ActiveDanmakuItem, DanmakuItem } from '../types/danmaku'
import { useTrackScheduler } from '../composables/useTrackScheduler'
import { useRandomScheduler } from '../composables/useRandomScheduler'
import { useVisibilityControl } from '../composables/useVisibilityControl'
import { measureTextWidth } from '../utils/measureText'
import {
  DEFAULT_COLOR,
  DEFAULT_FONT_SIZE,
  DEFAULT_LANE_HEIGHT,
  DEFAULT_SHADOW,
  DEFAULT_WEIGHT,
  reinsertRandom,
  toDanmakuItem,
} from '../utils/danmakuHelpers'

const SPEED_PX_S = 60

const props = defineProps({
  initialPool: { type: Array as PropType<DanmakuItem[]>, default: () => [] },
  speed: { type: Number, default: 1 },
  opacity: { type: Number, default: 0.9 },
})

const root = ref<HTMLElement | null>(null)
const container = reactive({ width: 0, height: 0 })
const pool = ref<DanmakuItem[]>([])
const active = ref<ActiveDanmakuItem[]>([])

const els = new Map<number, HTMLElement>()
const pending = new Set<ActiveDanmakuItem>()
let itemId = 0
let pumpRaf = 0
let resizeObserver: ResizeObserver | null = null

const tracks = useTrackScheduler(() => container.height, DEFAULT_LANE_HEIGHT)

function addItem(raw: DanmakuItem): DanmakuItem {
  return toDanmakuItem({
    text: raw?.text,
    color: raw?.color,
    fontSize: raw?.fontSize,
    weight: raw?.weight,
    shadow: raw?.shadow,
  }, ++itemId)
}

const baseItems = ref<DanmakuItem[]>([])

function buildPool() {
  const base = baseItems.value
  const n = base.length
  if (!n) {
    pool.value = []
    return
  }
  const target = Math.max(tracks.trackCount(), n)
  const copies = Math.max(1, Math.ceil(target / n))
  const next: DanmakuItem[] = []
  for (let c = 0; c < copies; c++) {
    for (const it of base) next.push(addItem(it))
  }
  pool.value = next
}

watch(
  () => [props.initialPool, container.height],
  () => {
    baseItems.value = (props.initialPool || []).map((it) => toDanmakuItem(it, 0))
    buildPool()
  },
  { immediate: true }
)

function currentSpeed() {
  return SPEED_PX_S * (props.speed || 1)
}

function launch(): boolean {
  if (container.width <= 0 || container.height <= 0) return false
  const trackIdx = tracks.getAvailableTrack()
  if (trackIdx === null) return false
  if (!pool.value.length) return false

  const item = pool.value.shift()
  if (!item) return false

  const fontSize = item.fontSize || DEFAULT_FONT_SIZE
  const textWidth = measureTextWidth(item.text, fontSize)
  const durationMs = ((container.width + textWidth) / currentSpeed()) * 1000
  tracks.lockTrack(trackIdx, durationMs)

  const act: ActiveDanmakuItem = {
    id: ++itemId,
    item,
    trackY: Math.min(trackIdx * DEFAULT_LANE_HEIGHT, Math.max(0, container.height - fontSize)),
    textWidth,
    done: false,
    el: null,
    anim: null,
  }
  active.value.push(act)
  pending.add(act)
  flush()
  return true
}

function flush() {
  if (pumpRaf) return
  pumpRaf = requestAnimationFrame(() => {
    pumpRaf = 0
    for (const act of [...pending]) {
      const el = els.get(act.id)
      if (!el || act.done) continue
      act.done = true
      pending.delete(act)
      startAnim(act, el)
    }
  })
}

function startAnim(act: ActiveDanmakuItem, el: HTMLElement) {
  act.el = el
  const durationMs = ((container.width + act.textWidth) / currentSpeed()) * 1000
  act.anim = el.animate(
    [
      { transform: `translateX(${container.width}px)` },
      { transform: `translateX(-${act.textWidth}px)` },
    ],
    { duration: durationMs, easing: 'linear' }
  )
  act.anim.onfinish = () => recycle(act)
  if (!visible.value) act.anim.pause()
}

function recycle(act: ActiveDanmakuItem) {
  if (!act.anim) return
  act.anim.onfinish = null
  act.anim = null
  const i = active.value.indexOf(act)
  if (i >= 0) active.value.splice(i, 1)
  els.delete(act.id)
  reinsertRandom(pool.value, act.item)
}

function onElRef(id: number, el: Element | null) {
  if (el) {
    els.set(id, el as HTMLElement)
    flush()
  } else {
    els.delete(id)
  }
}

function itemStyle(act: ActiveDanmakuItem) {
  return {
    top: `${act.trackY}px`,
    color: act.item.color || DEFAULT_COLOR,
    fontSize: `${act.item.fontSize || DEFAULT_FONT_SIZE}px`,
    fontWeight: act.item.weight || DEFAULT_WEIGHT,
    textShadow: act.item.shadow || DEFAULT_SHADOW,
    transform: `translateX(${container.width}px)`,
  }
}

function pauseAllAnim() {
  for (const act of active.value) act.anim?.pause()
}

function playAllAnim() {
  for (const act of active.value) act.anim?.play()
  flush()
}

const { isVisible: visible } = useVisibilityControl(
  () => root.value,
  () => {
    scheduler.start()
    playAllAnim()
  },
  () => {
    scheduler.pause()
    pauseAllAnim()
  },
  0.1
)

const scheduler = useRandomScheduler(pool, launch, {})

function measure() {
  if (!root.value) return
  container.width = root.value.clientWidth
  container.height = root.value.clientHeight
}

onMounted(() => {
  measure()
  if (root.value) {
    resizeObserver = new ResizeObserver(() => {
      measure()
      tracks.resetTracks()
    })
    resizeObserver.observe(root.value)
  }
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
  scheduler.dispose()
  if (pumpRaf) cancelAnimationFrame(pumpRaf)
  for (const act of active.value) act.anim?.cancel()
  els.clear()
  pending.clear()
  pool.value = []
})

function refillPool(items: DanmakuItem[]) {
  pool.value.push(...(items || []).map(addItem))
}

function getPoolSize() {
  return pool.value.length
}

function clearPool() {
  for (const act of active.value) act.anim?.cancel()
  active.value = []
  els.clear()
  pending.clear()
  pool.value = []
}

defineExpose({ refillPool, getPoolSize, clearPool })
</script>

<template>
  <div ref="root" class="danmaku-layer" :style="{ opacity }">
    <div
      v-for="act in active"
      :key="act.id"
      class="danmaku-item"
      :ref="(el) => onElRef(act.id, el)"
      :style="itemStyle(act)"
    >
      {{ act.item.text }}
    </div>
  </div>
</template>

<style scoped>
.danmaku-layer {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  pointer-events: none;
  z-index: 5;
}
.danmaku-item {
  position: absolute;
  left: 0;
  white-space: nowrap;
  will-change: transform;
  backface-visibility: hidden;
  font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif;
  text-shadow: 0 0 4px rgba(0, 0, 0, 0.8);
  letter-spacing: 0.5px;
  -webkit-text-stroke: 1px #333;
}
</style>