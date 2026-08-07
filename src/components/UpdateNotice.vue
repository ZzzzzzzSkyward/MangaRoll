<script setup>
import { updateReady, applyUpdate, dismissUpdate } from '../pwa'
</script>

<template>
  <Transition name="update">
    <div v-if="updateReady" class="update-notice" role="status">
      <span class="update-text">发现新版本，是否立即更新？</span>
      <button class="update-btn" @click="applyUpdate()">立即更新</button>
      <button class="update-dismiss" @click="dismissUpdate()">稍后</button>
    </div>
  </Transition>
</template>

<style scoped>
.update-notice {
  position: fixed;
  bottom: 28px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 110;
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--panel);
  border: 1px solid var(--accent);
  border-radius: var(--radius-m);
  padding: 9px 14px;
  box-shadow: var(--shadow-3);
  font-size: 14px;
  color: var(--text);
  white-space: nowrap;
}
.update-text {
  color: var(--text);
}
.update-btn {
  border: none;
  background: var(--accent);
  color: #fff;
  border-radius: var(--radius-s);
  padding: 5px 12px;
  font-size: 13px;
  cursor: pointer;
}
.update-dismiss {
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-dim);
  border-radius: var(--radius-s);
  padding: 4px 10px;
  font-size: 13px;
  cursor: pointer;
}
.update-enter-active,
.update-leave-active {
  transition: opacity 0.25s, transform 0.25s;
}
.update-enter-from,
.update-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(8px);
}

@media (max-width: 640px) {
  .update-notice {
    bottom: 20px;
    font-size: 13px;
    padding: 6px 10px;
  }
}
</style>
