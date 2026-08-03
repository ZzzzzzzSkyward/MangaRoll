<script setup>
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue'
import DanmakuLayer from './DanmakuLayer.vue'
import { state } from '../store'
import { MODE_VERTICAL } from '../lib/modes'
import { settings } from '../lib/settings'
import { getBlobUrl, scheduleBlobRevoke, cancelBlobRevoke } from '../lib/blobUrlCache'
import { ensureMoire, getMoireUrl, scheduleMoireRevoke, cancelMoireRevoke } from '../lib/moireCache'
import { runOcr } from '../lib/ocr/ocrClient'
import { toDanmakuItems } from '../utils/danmakuHelpers'

const props = defineProps({
  index: { type: Number, required: true },
  page: { type: Object, required: true },
  axis: { type: String, required: true },
  along: { type: Number, required: true },
  cross: { type: Number, required: true },
  vp: { type: Object, required: true },
  offset: { type: Number, required: true },
  active: { type: Boolean, default: false },
})

const vertical = computed(() => props.axis === MODE_VERTICAL)
const isRemote = computed(() => !!props.page.remote && !props.page.file)

// 单图缩放（Ctrl+滚轮）：命中本页时对 img 应用 transform，并把本槽临时置顶
const single = computed(() =>
  state.singleZoom && state.singleZoom.index === props.index ? state.singleZoom : null
)

// 槽位尺寸：竖轴为 宽(cross)×高(along)，横轴为 宽(along)×高(cross)
const boxW = computed(() => (vertical.value ? props.cross : props.along))
const boxH = computed(() => (vertical.value ? props.along : props.cross))

const cropRect = computed(() => {
  if (settings.cropEnabled && props.page.crop) {
    const r = props.page.crop
    const cw = props.page.w - r.left - r.right
    const ch = props.page.h - r.top - r.bottom
    if (cw > 0 && ch > 0) return r
  }
  return null
})

const style = computed(() => {
  const base = { position: 'absolute', display: 'flex', alignItems: 'center', justifyContent: 'center' }
  if (vertical.value) {
    base.top = props.offset + 'px'
    base.left = '0'
    base.width = props.vp.w + 'px'
    base.height = props.along + 'px'
  } else {
    base.left = props.offset + 'px'
    base.top = '0'
    base.height = props.vp.h + 'px'
    base.width = props.along + 'px'
  }
  // 单图缩放临时置顶需高于兄弟页（z-index:1）但低于工具栏（z-index:10），
  // 否则放大的图片会盖住工具栏使其无法交互。
  if (single.value) base.zIndex = 5
  return base
})

// 图片（object-fit: contain）在槽位内的可见区域几何，用于 clip-path 与 OCR 叠加换算
function contentGeom() {
  const iw = props.page.w
  const ih = props.page.h
  if (!iw || !ih || !boxW.value || !boxH.value) return null
  const boxRatio = boxW.value / boxH.value
  const imgRatio = iw / ih
  if (boxRatio > imgRatio) {
    const w = boxH.value * imgRatio
    return { x: (boxW.value - w) / 2, y: 0, w, h: boxH.value }
  }
  const h = boxW.value / imgRatio
  return { x: 0, y: (boxH.value - h) / 2, w: boxW.value, h }
}

// 裁剪开启时：布局槽位已按「裁剪后有效尺寸」分配（boxW/boxH = 裁剪宽高比）。
// 以裁剪区左上角为 transform-origin 放大，使裁剪内容精确填满槽位（符合适合宽度/高度），
// 溢出部分由外层 wrapper 的 overflow: hidden 裁掉。
const cropTransform = computed(() => {
  const c = cropRect.value
  const geo = contentGeom()
  if (!c || !geo || !props.page.w || !props.page.h) return { x: 0, y: 0, scale: 1 }
  const sx = geo.w / props.page.w
  const sy = geo.h / props.page.h
  const cw = props.page.w - c.left - c.right
  const x = geo.x + c.left * sx
  const y = geo.y + c.top * sy
  const scale = cw > 0 ? boxW.value / (cw * sx) : 1
  return { x, y, scale }
})

const imgStyle = computed(() => {
  let base
  if (cropRect.value) {
    const t = cropTransform.value
    base = {
      width: boxW.value + 'px',
      height: boxH.value + 'px',
      objectFit: 'contain',
      // 先以裁剪区左上为原点缩放，再平移到槽位原点，使裁剪内容精确填满槽位
      transformOrigin: `${t.x}px ${t.y}px`,
      transform: `translate(${-t.x}px, ${-t.y}px) scale(${t.scale})`,
    }
  } else if (vertical.value) {
    base = { height: props.along + 'px', width: 'auto' }
  } else {
    base = { width: props.along + 'px', height: 'auto' }
  }
  // 单图缩放：以光标锚点（图片内比例）为 transform-origin 放大，叠在既有 transform 之后。
  // 加短过渡让 Ctrl+滚轮缩放有缓动（连续滚轮会不断更新目标值，过渡随之追平滑）。
  if (single.value) {
    return {
      ...base,
      transformOrigin: `${single.value.ax * 100}% ${single.value.ay * 100}%`,
      transform: (base.transform ? base.transform + ' ' : '') + `scale(${single.value.zoom})`,
      transition: 'transform 0.12s ease-out, transform-origin 0.12s ease-out',
    }
  }
  return base
})

// 图片外层容器：裁剪开启时固定为槽位尺寸并裁掉放大后的溢出
const wrapStyle = computed(() => {
  if (!cropRect.value) return {}
  return { width: boxW.value + 'px', height: boxH.value + 'px' }
})

// ---------- 摩尔纹（按需处理，单并发队列，处理完替换 src） ----------
// 按显示分辨率处理：目标长边 = 槽位显示尺寸 × devicePixelRatio。
// 槽位宽高 = 图片显示宽高（图片恰好填满槽位），随全局缩放变化 → 缩放后按新分辨率重新处理，
// 避免浏览器二次降采样把残余网点混叠成低倍率下可见的摩尔纹。
const moireSrc = ref('')
const moireProcessing = ref(false)
const moireSize = ref(0)
function currentMoireSize() {
  const s = Math.max(props.along, props.cross) * (window.devicePixelRatio || 1)
  return Math.max(1, Math.round(s))
}
function refreshMoire() {
  if (isRemote.value || !settings.moireEnabled) return
  const size = currentMoireSize()
  moireSize.value = size
  const radius = settings.moireRadius
  const cached = getMoireUrl(props.page.key, radius, size)
  if (cached) {
    moireSrc.value = cached
    return
  }
  moireProcessing.value = true
  ensureMoire(props.page, radius, size).then((url) => {
    moireProcessing.value = false
    if (size !== moireSize.value) return
    if (url) {
      moireSrc.value = url
      cancelMoireRevoke(props.page.key, radius, size)
    }
  })
}
let moireTimer = 0
watch(
  () => [props.active, settings.moireEnabled, settings.moireRadius, props.along, props.cross],
  ([active]) => {
    clearTimeout(moireTimer)
    if (active && settings.moireEnabled) moireTimer = setTimeout(refreshMoire, 150)
  },
  { immediate: true }
)

// ---------- OCR（页面进入视口且启用时触发，单并发限流见 ocrClient） ----------
const ocrOverlay = computed(() => (settings.ocrEnabled && props.page.ocr ? props.page.ocr : []))
// 全局 OCR 字体样式（字号 / 字体族 / 字重 / 颜色）、透明度、可选中性，叠加层继承给每个文本框
const ocrLayerStyle = computed(() => ({
  fontFamily: settings.ocrFontFamily || 'inherit',
  fontSize: settings.ocrFontSize + 'px',
  fontWeight: String(settings.ocrFontWeight),
  color: settings.ocrTextColor,
  opacity: (settings.ocrTextOpacity ?? 100) / 100,
  userSelect: settings.ocrSelectable ? 'text' : 'none',
  WebkitUserSelect: settings.ocrSelectable ? 'text' : 'none',
}))

// OCR 文本方向：'horizontal' / 'vertical' 为全局强制；'auto' 时按包围盒宽高比智能判定——
// 日文纵向气泡框明显高瘦（高/宽 ≥ 1.5），横向文本框明显扁宽（宽/高 ≥ 1.5），
// 接近方形的区域视为不明显，回退纵向显示（日文默认竖排）。
const OCR_DIR_VERTICAL_RATIO = 1.5
const OCR_DIR_HORIZONTAL_RATIO = 1 / 1.5
function lineDirection(line) {
  if (settings.ocrTextDirection !== 'auto') return settings.ocrTextDirection
  const ratio = (line.h || 0) / (line.w || 0)
  if (ratio >= OCR_DIR_VERTICAL_RATIO) return 'vertical'
  if (ratio <= OCR_DIR_HORIZONTAL_RATIO) return 'horizontal'
  return 'vertical'
}
function ocrStyle(line) {
  // 裁剪开启时：OCR 坐标为整图归一化，映射到裁剪后内容在槽位内的位置（与 img 缩放一致）
  if (cropRect.value) {
    const c = cropRect.value
    const cw = props.page.w - c.left - c.right
    const ch = props.page.h - c.top - c.bottom
    if (cw > 0 && ch > 0) {
      return {
        left: ((line.x * props.page.w - c.left) / cw) * boxW.value + 'px',
        top: ((line.y * props.page.h - c.top) / ch) * boxH.value + 'px',
        width: Math.max(1, (line.w * props.page.w) / cw) * boxW.value + 'px',
        height: Math.max(1, (line.h * props.page.h) / ch) * boxH.value + 'px',
        writingMode: lineDirection(line) === 'vertical' ? 'vertical-rl' : 'horizontal-tb',
      }
    }
  }
  const geo = contentGeom()
  if (!geo) return {}
  return {
    left: geo.x + line.x * geo.w + 'px',
    top: geo.y + line.y * geo.h + 'px',
    width: Math.max(1, line.w * geo.w) + 'px',
    height: Math.max(1, line.h * geo.h) + 'px',
    writingMode: lineDirection(line) === 'vertical' ? 'vertical-rl' : 'horizontal-tb',
  }
}
watch(
  () => [props.active, settings.ocrEnabled, props.page.ocr, props.page.ocrLoading, props.page.url],
  ([active, on, ocr, loading, url]) => {
    if (!on || !active || ocr || loading) return
    // 本地页需等 blob URL 创建（onMounted）后再触发，避免加载空 src
    if (!props.page.remote && !url) return
    props.page.ocrLoading = true
    runOcr(props.page)
      .then((lines) => {
        if (lines && lines.length) props.page.ocr = lines
        props.page.ocrLoading = false
      })
      .catch(() => {
        props.page.ocrLoading = false
      })
  },
  { immediate: true }
)

// ---------- 图片源 ----------
const imageSrc = computed(() => {
  if (isRemote.value) return props.page.src
  if (settings.moireEnabled) return moireSrc.value || props.page.url
  return props.page.url
})

const poolForPage = computed(() => {
  const raw = state.danmaku?.byPage?.get(props.index + 1)
  return raw ? toDanmakuItems(raw) : []
})

onMounted(() => {
  // 每次挂载都重新获取 blob URL：getBlobUrl 命中缓存时返回原 URL 并清除 revoke 定时器，
  // 命中失败（旧 URL 已被延迟 revoke）时创建新 URL，避免页面对象上残留已失效的 url 导致空白图。
  if (!isRemote.value && props.page.file) {
    props.page.url = getBlobUrl(props.page.key, props.page.file)
  } else if (isRemote.value && !props.page.w) {
    measureRemote()
  }
})
onBeforeUnmount(() => {
  if (!isRemote.value && props.page.url) scheduleBlobRevoke(props.page.key)
  if (moireSrc.value) scheduleMoireRevoke(props.page.key, settings.moireRadius, moireSize.value)
  clearTimeout(moireTimer)
})

// 远程页未知尺寸：加载完成后回填 w/h（布局 computed 自动重算，位置微调可接受）
function measureRemote() {
  const img = new Image()
  img.onload = () => {
    if (props.page.w || !img.naturalWidth) return
    props.page.w = img.naturalWidth
    props.page.h = img.naturalHeight
  }
  img.src = props.page.src
}
</script>

<template>
  <div class="page-slot" :style="style">
    <div v-if="imageSrc" class="img-wrap" :class="{ cropped: !!cropRect }" :style="wrapStyle">
      <img
        class="page-img"
        :src="imageSrc"
        :style="imgStyle"
        decoding="async"
        :alt="page.name"
        crossorigin="anonymous"
      />
    </div>
    <div v-if="moireProcessing" class="page-badge">去网纹中…</div>
    <div
      v-if="ocrOverlay.length"
      class="ocr-layer"
      :class="['ocr-mode-' + settings.ocrTextMode, { 'ocr-selectable': settings.ocrSelectable }]"
      :style="ocrLayerStyle"
    >
      <!-- 白底模式：背景垫块单独渲染在文本层之下，重叠时上层白块不再遮挡下层文字 -->
      <span
        v-if="settings.ocrTextMode === 'white'"
        v-for="(line, i) in ocrOverlay"
        :key="'bg-' + i"
        class="ocr-bg"
        :style="ocrStyle(line)"
      ></span>
      <span v-for="(line, i) in ocrOverlay" :key="'tx-' + i" class="ocr-box" :style="ocrStyle(line)">{{ line.text }}</span>
    </div>
    <DanmakuLayer
      v-if="state.mode === MODE_VERTICAL && state.danmaku && state.danmakuOn"
      :initial-pool="poolForPage"
      :speed="state.danmakuSpeed"
      :opacity="state.danmakuOpacity"
    />
  </div>
</template>

<style scoped>
.page-slot {
  z-index: 1;
}
.page-img {
  object-fit: contain;
  background: var(--bg);
  user-select: none;
  -webkit-user-drag: none;
  flex: none;
}
.img-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
}
.img-wrap.cropped {
  overflow: hidden;
  position: relative;
}
.page-badge {
  position: absolute;
  top: 6px;
  right: 6px;
  font-size: 11px;
  color: var(--text-dim);
  background: rgba(0, 0, 0, 0.45);
  border-radius: 4px;
  padding: 2px 6px;
  pointer-events: none;
}
.ocr-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: visible;
}
.ocr-box {
  position: absolute;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  color: inherit;
  /* 半透明描影：重叠的文本框（DOM 靠后的绘制在上层）不再被高浓度实心阴影完全盖住，
     与下层文本按透明度混合，保证重叠区域的下方文字仍可见 */
  text-shadow: 0 0 2px rgba(0, 0, 0, 0.8), 0 0 5px rgba(0, 0, 0, 0.4);
  box-sizing: border-box;
}
/* 文本可见性：默认显示（继承叠加层颜色 + 描影）；隐藏时文字透明；白底时白色背景垫底、深色文字 */
.ocr-layer.ocr-mode-hide .ocr-box {
  color: transparent;
  text-shadow: none;
}
.ocr-layer.ocr-mode-white .ocr-bg {
  position: absolute;
  background: #fff;
}
.ocr-layer.ocr-mode-white .ocr-box {
  color: #000;
  text-shadow: none;
  background: none;
}
/* 默认不可选中、不拦截鼠标；开启“可选中”后允许框内拖选复制文本 */
.ocr-box {
  user-select: none;
  -webkit-user-select: none;
  pointer-events: none;
}
.ocr-layer.ocr-selectable .ocr-box {
  user-select: text;
  -webkit-user-select: text;
  pointer-events: auto;
  cursor: text;
}
</style>