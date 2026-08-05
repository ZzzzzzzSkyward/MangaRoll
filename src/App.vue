<script setup>
import { onMounted, onBeforeUnmount, computed } from 'vue'
import Toolbar from './components/Toolbar.vue'
import DropZone from './components/DropZone.vue'
import ReaderView from './components/ReaderView.vue'
import FolderList from './components/FolderList.vue'
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
      <ReaderView v-if="state.status === 'ready' && state.view === 'comic'" />
      <FolderList v-else-if="state.status === 'ready' && state.view === 'list'" />
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
  background: rgba(242, 243, 245, 0.85);
}
.load-label {
  font-size: 15px;
  color: var(--text);
}
.spinner {
  width: 34px;
  height: 34px;
  border: 3px solid #d9dde3;
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
  height: 4px;
  border-radius: 2px;
  background: #e4e7eb;
  overflow: hidden;
}
.load-fill {
  height: 100%;
  background: var(--accent);
  border-radius: 2px;
  transition: width 0.2s var(--ease);
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
  background: var(--panel);
  border: 1px solid var(--border);
  border-left: 3px solid var(--accent);
  color: var(--text);
  padding: 9px 18px;
  border-radius: var(--radius-m);
  font-size: 14px;
  z-index: 100;
  box-shadow: var(--shadow-3);
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
