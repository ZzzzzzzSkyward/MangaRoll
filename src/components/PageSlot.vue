<script setup>
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue'
import DanmakuLayer from './DanmakuLayer.vue'
import MoireOverlay from './MoireOverlay.vue'
import OcrOverlay from './OcrOverlay.vue'
import { state } from '../store'
import { MODE_VERTICAL } from '../lib/modes'
import { settings } from '../lib/settings'
import { getBlobUrl, scheduleBlobRevoke, cancelBlobRevoke, isBlobCached } from '../lib/blobUrlCache'
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

const single = computed(() =>
  state.singleZoom && state.singleZoom.index === props.index ? state.singleZoom : null
)

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
  if (single.value) base.zIndex = 5
  return base
})

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
      transformOrigin: `${t.x}px ${t.y}px`,
      transform: `translate(${-t.x}px, ${-t.y}px) scale(${t.scale})`,
    }
  } else if (vertical.value) {
    base = { height: props.along + 'px', width: 'auto' }
  } else {
    base = { width: props.along + 'px', height: 'auto' }
  }
  if (single.value) {
    const s = single.value
    return {
      ...base,
      transformOrigin: `${s.ax * 100}% ${s.ay * 100}%`,
      transform: (base.transform ? base.transform + ' ' : '') + `scale(${s.zoom})`,
      transition: s.animating ? 'none' : 'transform 0.12s ease-out, transform-origin 0.12s ease-out',
    }
  }
  return base
})

const wrapStyle = computed(() => {
  if (!cropRect.value) return {}
  return { width: boxW.value + 'px', height: boxH.value + 'px' }
})

const imageSrc = computed(() => {
  if (isRemote.value) return props.page.src
  if (settings.moireEnabled) return moireOverlayRef.value?.moireSrc || props.page.url
  return props.page.url
})

const moireOverlayRef = ref(null)

const poolForPage = computed(() => {
  const raw = state.danmaku?.byPage?.get(props.index + 1)
  return raw ? toDanmakuItems(raw) : []
})

onMounted(() => {
  if (!isRemote.value && props.page.file) {
    if (!props.page.url || !isBlobCached(props.page.key)) {
      props.page.url = getBlobUrl(props.page.key, props.page.file)
    } else {
      cancelBlobRevoke(props.page.key)
    }
  } else if (isRemote.value && !props.page.w) {
    measureRemote()
  }
})

onBeforeUnmount(() => {
  if (!isRemote.value && props.page.url) scheduleBlobRevoke(props.page.key, props.page)
})

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
    <MoireOverlay
      ref="moireOverlayRef"
      :page="page"
      :active="active"
      :along="along"
      :cross="cross"
      :is-remote="isRemote"
    />
    <div v-if="moireOverlayRef?.moireProcessing" class="page-badge">去网纹中…</div>
    <OcrOverlay
      :page="page"
      :active="active"
      :crop-rect="cropRect"
      :box-w="boxW"
      :box-h="boxH"
      :is-remote="isRemote"
    />
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
</style>
