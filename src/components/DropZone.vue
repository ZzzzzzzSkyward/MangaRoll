<script setup>
import { ref } from 'vue'
import FilePicker from './FilePicker.vue'

defineProps({
  overlay: { type: Boolean, default: false },
})

const picker = ref(null)
</script>

<template>
  <div class="dropzone" :class="{ overlay }">
    <svg class="dz-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <path d="M12 16V4m0 0l-4 4m4-4l4 4" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M4 16v3a2 2 0 002 2h12a2 2 0 002-2v-3" stroke-linecap="round" />
    </svg>
    <h2>将文件夹或 ZIP 拖入此处</h2>
    <p>支持 jpg / png / gif / webp / bmp / avif / ico 图片与弹幕 JSON，按文件名自然排序</p>
    <div v-if="!overlay" class="dz-buttons">
      <button @click="picker.pickFolder()">选择文件夹</button>
      <button @click="picker.pickZip()">选择 ZIP 文件</button>
      <button @click="picker.pickDanmaku()">选择弹幕 JSON</button>
    </div>
    <FilePicker ref="picker" />
  </div>
</template>

<style scoped>
.dropzone {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  color: var(--text-dim);
  text-align: center;
  padding: 24px;
  animation: rise-in 0.35s var(--ease);
}
.dropzone.overlay {
  background: rgba(255, 255, 255, 0.8);
  border: 2px dashed var(--accent);
  z-index: 50;
}
.dz-icon {
  width: 56px;
  height: 56px;
  color: var(--accent);
}
h2 {
  margin: 0;
  font-size: 22px;
  color: var(--text);
  font-weight: 600;
}
p {
  margin: 0;
  font-size: 13px;
  max-width: 460px;
}
.dz-buttons {
  display: flex;
  gap: 10px;
  margin-top: 8px;
}
.dz-buttons button {
  background: #fff;
  color: var(--text);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-s);
  padding: 8px 18px;
  font-size: 14px;
  cursor: pointer;
  box-shadow: var(--shadow-1);
  transition: background 0.12s var(--ease), border-color 0.12s var(--ease), box-shadow 0.12s var(--ease);
}
.dz-buttons button:hover {
  background: var(--hover);
  border-color: var(--accent);
  box-shadow: var(--shadow-2);
}
.dz-buttons button:first-child {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}
.dz-buttons button:first-child:hover {
  background: var(--accent-strong);
  border-color: var(--accent-strong);
}

@media (max-width: 640px) {
  .dropzone {
    padding: 16px;
    gap: 10px;
  }
  .dz-icon {
    width: 44px;
    height: 44px;
  }
  h2 {
    font-size: 18px;
  }
  p {
    font-size: 12px;
  }
  .dz-buttons {
    flex-direction: column;
    gap: 8px;
    width: 100%;
    max-width: 280px;
  }
  .dz-buttons button {
    width: 100%;
    padding: 12px 16px;
    font-size: 14px;
  }
}
</style>
