<script setup>
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'

const props = defineProps({
  pageKey: { type: Number, required: true },
  list: { type: Array, default: () => [] },
  width: { type: Number, default: 800 },
  height: { type: Number, default: 1200 },
  speed: { type: Number, default: 1 },
  opacity: { type: Number, default: 0.9 },
})

const progress = new Map()
const items = ref([])
let activeCount = 0
let topN = 0
let bottomN = 0

const MAX_CONCURRENT = 50
const FIXED_HOLD = 4200
const LANE_HEIGHT = 34
const SPAWN_INTERVAL = 2000

let raf = 0
let curKey = -1
let activatedAt = 0
let base = 0
let spawnIdx = 0
let nextId = 1
let generation = 0
let lanes = []
let shuffledList = []
let lastSpawnTime = 0

const elapsed = () => base + (performance.now() - activatedAt)

function activate() {
  if (curKey >= 0) progress.set(curKey, elapsed())
  curKey = props.pageKey
  generation++
  items.value = []
  activeCount = topN = bottomN = 0
  spawnIdx = 0
  lanes = []
  shuffledList = []
  lastSpawnTime = 0
  base = progress.get(curKey) || 0
  activatedAt = performance.now()
  console.log(`[弹幕] 激活 pageKey=${curKey}, list.length=${props.list.length}, base=${base.toFixed(0)}`)
}

function sizeFactor(dm) {
  return dm.size === 'small' ? 0.75 : dm.size === 'large' ? 1.4 : 1
}

function lineH(dm) {
  return 28 * sizeFactor(dm) + 6
}

function findLane(height) {
  const maxLane = Math.floor((props.height * 0.65) / LANE_HEIGHT)
  for (let i = 0; i < maxLane; i++) {
    const laneEnd = lanes[i] || 0
    if (elapsed() >= laneEnd) return i
  }
  return -1
}

function spawn(dm) {
  const gen = generation
  const kind = dm.position === 'top' ? 'top' : dm.position === 'bottom' ? 'bottom' : 'scroll'
  let y = 0
  if (kind === 'top') {
    y = 8 + topN * lineH(dm)
    if (y + lineH(dm) > props.height) return
    topN++
  } else if (kind === 'bottom') {
    bottomN++
    y = Math.max(0, props.height - 8 - bottomN * lineH(dm))
    if (y < 0) return
  } else {
    const lane = findLane()
    if (lane === -1) return
    y = 8 + lane * LANE_HEIGHT
    const dur = (props.width / (140 * props.speed)) * 1000
    lanes[lane] = elapsed() + dur
  }
  items.value.push({
    id: nextId++,
    dm,
    kind,
    y,
    dur: kind === 'scroll' ? null : (FIXED_HOLD / 1000).toFixed(1) + 's',
    fontSize: 24 * sizeFactor(dm),
    gen,
  })
  activeCount++
}

function shuffleArray(arr) {
  const result = [...arr]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

function trySpawn() {
  const t = elapsed()
  const list = props.list || []
  
  if (!list.length) return false
  
  if (shuffledList.length === 0 || spawnIdx >= shuffledList.length) {
    shuffledList = shuffleArray(list)
    spawnIdx = 0
  }
  
  if (t - lastSpawnTime < SPAWN_INTERVAL) return false
  if (activeCount >= MAX_CONCURRENT) return false
  
  spawn(shuffledList[spawnIdx])
  spawnIdx++
  lastSpawnTime = t
  return true
}

function loop() {
  raf = requestAnimationFrame(loop)
  if (curKey !== props.pageKey) activate()
  trySpawn()
}

function onEnd(it) {
  if (it.gen !== generation) return
  if (it.kind === 'top') topN--
  if (it.kind === 'bottom') bottomN--
  activeCount--
  const i = items.value.findIndex((x) => x.id === it.id)
  if (i >= 0) items.value.splice(i, 1)
}

function measure(el, it) {
  if (!el || it.dur) return
  const w = el.offsetWidth
  it.dur = ((props.width + w) / (140 * props.speed)).toFixed(2)
}

function styleOf(it) {
  return {
    '--dur': (it.dur ? it.dur + 's' : '1s'),
    '--dm-color': it.dm.color || '#fff',
    top: it.y + 'px',
    fontSize: it.fontSize + 'px',
  }
}

watch(() => props.pageKey, () => {
  if (curKey !== props.pageKey) activate()
})

onMounted(() => {
  activate()
  loop()
})

onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  if (curKey >= 0) progress.set(curKey, elapsed())
})
</script>

<template>
  <div class="dm-layer" :style="{ opacity }">
    <div
      v-for="it in items"
      :key="it.id"
      class="dm-item"
      :class="[it.kind, it.dur && 'measured']"
      :style="styleOf(it)"
      :ref="(el) => measure(el, it)"
      @animationend="onEnd(it)"
    >
      {{ it.dm.text }}
    </div>
  </div>
</template>

<style scoped>
.dm-layer {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  z-index: 5;
}
.dm-item {
  position: absolute;
  left: 0;
  white-space: nowrap;
  font-weight: 600;
  color: var(--dm-color, #fff);
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.85);
  will-change: transform;
  opacity: 0;
  line-height: 1.2;
}
.dm-item.measured {
  opacity: 1;
}
.dm-item.scroll.measured {
  animation: dm-scroll var(--dur) linear forwards;
}
.dm-item.top,
.dm-item.bottom {
  left: 50%;
  animation: dm-fixed var(--dur) ease forwards;
}
@keyframes dm-scroll {
  from {
    transform: translateX(100vw);
  }
  to {
    transform: translateX(-100%);
  }
}
@keyframes dm-fixed {
  0% {
    opacity: 0;
    transform: translateX(-50%) translateY(-8px);
  }
  6% {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
  90% {
    opacity: 1;
  }
  100% {
    opacity: 0;
    transform: translateX(-50%);
  }
}
</style>
