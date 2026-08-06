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
// 实际生成 moireSrc 时使用的半径/尺寸（unmount 回收需用同一缓存键，settings 可能已变）
let moireKeyRadius = 0
let moireKeySize = 0

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
    moireKeyRadius = radius
    moireKeySize = size
    return
  }
  moireProcessing.value = true
  ensureMoire(props.page, radius, size).then((url) => {
    moireProcessing.value = false
    if (size !== moireSize.value) return
    if (!url) return
    if (alive) {
      moireSrc.value = url
      moireKeyRadius = radius
      moireKeySize = size
      cancelMoireRevoke(props.page.key, radius, size)
    } else {
      // 处理完成时组件已卸载（切页/关开关）：结果已入缓存，立即排入延迟回收
      scheduleMoireRevoke(props.page.key, radius, size)
    }
  })
}

let alive = true
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
  alive = false
  clearTimeout(moireTimer)
  // 无条件延迟 revoke：无论 moireSrc 是否已设置（含处理中/已禁用但结果已入缓存），
  // 无缓存条目时 scheduleMoireRevoke 内部为空操作；处理尚未完成的情况由上面的
  // alive 分支兜底（回调持有创建缓存条目时的原始 radius/size）
  if (moireKeySize) scheduleMoireRevoke(props.page.key, moireKeyRadius, moireKeySize)
})

defineExpose({
  moireSrc,
  moireProcessing,
})
</script>

<template></template>
