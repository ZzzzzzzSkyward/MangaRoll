<script setup>
import { onMounted, onBeforeUnmount, computed } from 'vue'
import Toolbar from './components/Toolbar.vue'
import DropZone from './components/DropZone.vue'
import ReaderView from './components/ReaderView.vue'
import { state, dragging, toast, importDropped } from './store'

const loadPct = computed(() =>
  state.loading.total > 0 ? Math.round((state.loading.current / state.loading.total) * 100) : 0
)

let dragTimer = 0

function onDragOver(e) {
  if (!e.dataTransfer.types.includes('Files')) return
  e.preventDefault()
  clearTimeout(dragTimer)
  dragging.value = true
}

function onDragLeave() {
  clearTimeout(dragTimer)
  dragTimer = setTimeout(() => {
    dragging.value = false
  }, 100)
}

async function onDrop(e) {
  e.preventDefault()
  clearTimeout(dragTimer)
  dragging.value = false
  if (!e.dataTransfer.files.length) return
  await importDropped(e.dataTransfer.items || e.dataTransfer.files)
}

onMounted(() => {
  window.addEventListener('dragover', onDragOver)
  window.addEventListener('dragleave', onDragLeave)
  window.addEventListener('drop', onDrop)
})

onBeforeUnmount(() => {
  window.removeEventListener('dragover', onDragOver)
  window.removeEventListener('dragleave', onDragLeave)
  window.removeEventListener('drop', onDrop)
})
</script>

<template>
  <div class="app">
    <div class="stage">
      <ReaderView v-if="state.status === 'ready'" />
      <DropZone v-else />
      <DropZone v-if="dragging" overlay />
      <div v-if="state.status === 'loading'" class="loading-overlay">
        <div class="spinner"></div>
        <div class="load-label">{{ state.loading.label }}</div>
        <template v-if="state.loading.total > 0">
          <div class="load-bar">
            <div class="load-fill" :style="{ width: loadPct + '%' }"></div>
          </div>
          <div class="load-num">{{ state.loading.current }} / {{ state.loading.total }}</div>
        </template>
      </div>
    </div>
    <Toolbar />
    <Transition name="toast">
      <div v-if="toast" class="toast">{{ toast }}</div>
    </Transition>
  </div>
</template>

<style scoped>
.app {
  position: relative;
  height: 100%;
  background: var(--bg);
  color: var(--text);
}
.stage {
  position: absolute;
  inset: 0;
}
.loading-overlay {
  position: absolute;
  inset: 0;
  z-index: 40;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  background: rgba(10, 12, 16, 0.8);
  backdrop-filter: blur(2px);
}
.load-label {
  font-size: 15px;
  color: var(--text);
}
.spinner {
  width: 36px;
  height: 36px;
  border: 3px solid var(--border);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
.load-bar {
  width: 260px;
  height: 6px;
  border-radius: 3px;
  background: var(--panel);
  overflow: hidden;
}
.load-fill {
  height: 100%;
  background: var(--accent);
  transition: width 0.2s;
}
.load-num {
  font-size: 12px;
  color: var(--text-dim);
}
.toast {
  position: fixed;
  bottom: 28px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(20, 24, 32, 0.92);
  border: 1px solid var(--border);
  color: var(--text);
  padding: 8px 18px;
  border-radius: 8px;
  font-size: 14px;
  z-index: 100;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
}
.toast-enter-active,
.toast-leave-active {
  transition: opacity 0.25s, transform 0.25s;
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(8px);
}

@media (max-width: 640px) {
  .load-bar {
    width: 200px;
  }
  .toast {
    font-size: 13px;
    padding: 6px 14px;
    bottom: 20px;
  }
}
</style>
