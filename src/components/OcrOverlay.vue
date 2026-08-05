<script setup>
import { computed, watch } from 'vue'
import { settings } from '../lib/settings'
import { runOcr } from '../lib/ocr/ocrClient'

const props = defineProps({
  page: { type: Object, required: true },
  active: { type: Boolean, default: false },
  cropRect: { type: Object, default: null },
  boxW: { type: Number, required: true },
  boxH: { type: Number, required: true },
  isRemote: { type: Boolean, default: false },
})

const OCR_DIR_VERTICAL_RATIO = 1.5
const OCR_DIR_HORIZONTAL_RATIO = 1 / 1.5

const ocrOverlay = computed(() => (settings.ocrEnabled && props.page.ocr ? props.page.ocr : []))

const ocrLayerStyle = computed(() => ({
  fontFamily: settings.ocrFontFamily || 'inherit',
  fontSize: settings.ocrFontSize + 'px',
  fontWeight: String(settings.ocrFontWeight),
  color: settings.ocrTextColor,
  opacity: (settings.ocrTextOpacity ?? 100) / 100,
  userSelect: settings.ocrSelectable ? 'text' : 'none',
  WebkitUserSelect: settings.ocrSelectable ? 'text' : 'none',
}))

function lineDirection(line) {
  if (settings.ocrTextDirection !== 'auto') return settings.ocrTextDirection
  const ratio = (line.h || 0) / (line.w || 0)
  if (ratio >= OCR_DIR_VERTICAL_RATIO) return 'vertical'
  if (ratio <= OCR_DIR_HORIZONTAL_RATIO) return 'horizontal'
  return 'vertical'
}

function contentGeom() {
  const iw = props.page.w
  const ih = props.page.h
  if (!iw || !ih || !props.boxW || !props.boxH) return null
  const boxRatio = props.boxW / props.boxH
  const imgRatio = iw / ih
  if (boxRatio > imgRatio) {
    const w = props.boxH * imgRatio
    return { x: (props.boxW - w) / 2, y: 0, w, h: props.boxH }
  }
  const h = props.boxW / imgRatio
  return { x: 0, y: (props.boxH - h) / 2, w: props.boxW, h }
}

function ocrStyle(line) {
  if (props.cropRect) {
    const c = props.cropRect
    const cw = props.page.w - c.left - c.right
    const ch = props.page.h - c.top - c.bottom
    if (cw > 0 && ch > 0) {
      return {
        left: ((line.x * props.page.w - c.left) / cw) * props.boxW + 'px',
        top: ((line.y * props.page.h - c.top) / ch) * props.boxH + 'px',
        width: Math.max(1, (line.w * props.page.w) / cw) * props.boxW + 'px',
        height: Math.max(1, (line.h * props.page.h) / ch) * props.boxH + 'px',
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
</script>

<template>
  <div
    v-if="ocrOverlay.length"
    class="ocr-layer"
    :class="['ocr-mode-' + settings.ocrTextMode, { 'ocr-selectable': settings.ocrSelectable }]"
    :style="ocrLayerStyle"
  >
    <span
      v-if="settings.ocrTextMode === 'white'"
      v-for="(line, i) in ocrOverlay"
      :key="'bg-' + i"
      class="ocr-bg"
      :style="ocrStyle(line)"
    ></span>
    <span v-for="(line, i) in ocrOverlay" :key="'tx-' + i" class="ocr-box" :style="ocrStyle(line)">{{ line.text }}</span>
  </div>
</template>

<style scoped>
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
  text-shadow: 0 0 2px rgba(0, 0, 0, 0.8), 0 0 5px rgba(0, 0, 0, 0.4);
  box-sizing: border-box;
  user-select: none;
  -webkit-user-select: none;
  pointer-events: none;
}
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
.ocr-layer.ocr-selectable .ocr-box {
  user-select: text;
  -webkit-user-select: text;
  pointer-events: auto;
  cursor: text;
}
</style>
