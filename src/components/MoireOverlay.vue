<script setup>
import { ref, watch, onBeforeUnmount } from 'vue'
import { settings } from '../lib/settings'
import { ensureMoire, getMoireUrl, scheduleMoireRevoke, cancelMoireRevoke } from '../lib/moireCache'

const props = defineProps({
  page: { type: Object, required: true },
  active: { type: Boolean, default: false },
  along: { type: Number, required: true },
  cross: { type: Number, required: true },
  isRemote: { type: Boolean, default: false },
})

const moireSrc = ref('')
const moireProcessing = ref(false)
const moireSize = ref(0)

function currentMoireSize() {
  const s = Math.max(props.along, props.cross) * (window.devicePixelRatio || 1)
  return Math.max(1, Math.round(s))
}

function refreshMoire() {
  if (props.isRemote || !settings.moireEnabled) return
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

onBeforeUnmount(() => {
  if (moireSrc.value) scheduleMoireRevoke(props.page.key, settings.moireRadius, moireSize.value)
  clearTimeout(moireTimer)
})

defineExpose({
  moireSrc,
  moireProcessing,
})
</script>

<template></template>
