<script setup>
import { computed, onMounted, onBeforeUnmount } from 'vue'
import DanmakuLayer from './DanmakuLayer.vue'
import { state } from '../store'
import { MODE_VERTICAL } from '../lib/modes'
import { getBlobUrl, scheduleBlobRevoke } from '../lib/blobUrlCache'
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
  return base
})

const imgStyle = computed(() => {
  if (vertical.value) return { height: props.along + 'px', width: 'auto' }
  return { width: props.along + 'px', height: 'auto' }
})

const poolForPage = computed(() => {
  const raw = state.danmaku?.byPage?.get(props.index + 1)
  return raw ? toDanmakuItems(raw) : []
})

onMounted(() => {
  props.page.url = getBlobUrl(props.page.key, props.page.file)
})

onBeforeUnmount(() => {
  scheduleBlobRevoke(props.page.key)
})
</script>

<template>
  <div class="page-slot" :style="style">
    <img class="page-img" :src="page.url" :style="imgStyle" decoding="async" :alt="page.name" />
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
</style>
