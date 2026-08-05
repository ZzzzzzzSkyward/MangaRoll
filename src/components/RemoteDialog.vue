<script setup>
import { ref, watch } from 'vue'
import { importRemote } from '../store'
import { closeRemote, ui } from '../lib/uiState'

const mode = ref('manifest')
const url = ref('')
const loading = ref(false)

watch(
  () => ui.remoteOpen,
  (open) => {
    if (open) {
      url.value = ''
      mode.value = 'manifest'
      loading.value = false
    }
  }
)

async function go() {
  if (!url.value || loading.value) return
  loading.value = true
  await importRemote(mode.value, url.value)
  loading.value = false
  if (url.value) closeRemote()
}
</script>

<template>
  <Teleport to="body">
    <div v-if="ui.remoteOpen" class="remote-mask" @click.self="closeRemote()">
      <div class="remote-panel">
        <header class="remote-head">
          <span>远程加载</span>
          <button class="remote-close" @click="closeRemote()">×</button>
        </header>
        <div class="remote-body">
          <div class="remote-row">
            <label>来源类型</label>
            <div class="seg">
              <button :class="{ on: mode === 'manifest' }" @click="mode = 'manifest'">Manifest JSON</button>
              <button :class="{ on: mode === 'webdav' }" @click="mode = 'webdav'">WebDAV 目录</button>
            </div>
          </div>
          <div class="remote-row">
            <label>URL</label>
            <input v-model.trim="url" type="text" placeholder="https://nas.local/comic/…" @keydown.enter="go" />
          </div>
          <div class="remote-note">
            <template v-if="mode === 'manifest'">服务目录下需提供 <code>index.json</code>（格式见 README「远程来源」）。</template>
            <template v-else>服务需支持 PROPFIND。</template>
            图片与接口需允许跨域（CORS）。
          </div>
          <div class="remote-actions">
            <button class="remote-primary" :disabled="!url || loading" @click="go">
              {{ loading ? '加载中…' : '载入' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.remote-mask {
  position: fixed;
  inset: 0;
  z-index: 85;
  background: rgba(15, 23, 42, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  animation: mask-in 0.18s ease;
}
.remote-panel {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: var(--radius-l);
  width: 420px;
  max-width: calc(100vw - 32px);
  color: var(--text);
  box-shadow: var(--shadow-3);
  animation: dialog-in 0.2s var(--ease);
}
.remote-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  border-bottom: 1px solid var(--border);
  font-size: 15px;
  font-weight: 600;
}
.remote-close {
  background: none;
  border: none;
  color: var(--text-dim);
  font-size: 18px;
  width: 30px;
  height: 30px;
  border-radius: var(--radius-s);
  cursor: pointer;
  line-height: 1;
  transition: background 0.12s var(--ease), color 0.12s var(--ease);
}
.remote-close:hover {
  background: var(--hover);
  color: var(--text);
}
.remote-body {
  padding: 18px 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.remote-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
}
.remote-row input[type='text'] {
  padding: 8px 10px;
}
.seg {
  display: flex;
}
.seg button {
  flex: 1;
  background: #fff;
  color: var(--text);
  border: 1px solid var(--border-strong);
  padding: 7px 10px;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.12s var(--ease), color 0.12s var(--ease), border-color 0.12s var(--ease);
}
.seg button:first-child {
  border-radius: var(--radius-s) 0 0 var(--radius-s);
  margin-right: -1px;
}
.seg button:last-child {
  border-radius: 0 var(--radius-s) var(--radius-s) 0;
}
.seg button:hover {
  background: var(--hover);
  border-color: var(--accent);
  z-index: 1;
}
.seg button.on {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
  z-index: 1;
}
.remote-note {
  font-size: 12px;
  color: var(--text-dim);
  line-height: 1.6;
}
.remote-note code {
  background: var(--hover);
  padding: 1px 5px;
  border-radius: 3px;
  color: var(--text);
}
.remote-actions {
  display: flex;
  justify-content: flex-end;
}
.remote-primary {
  background: var(--accent);
  color: #fff;
  border: none;
  border-radius: var(--radius-s);
  padding: 8px 22px;
  font-size: 14px;
  cursor: pointer;
  box-shadow: var(--shadow-1);
  transition: background 0.12s var(--ease), box-shadow 0.12s var(--ease);
}
.remote-primary:hover:not(:disabled) {
  background: var(--accent-strong);
  box-shadow: var(--shadow-2);
}
.remote-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>