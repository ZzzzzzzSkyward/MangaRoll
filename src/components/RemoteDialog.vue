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
.remote-mask { position: fixed; inset: 0; z-index: 85; background: rgba(8, 10, 14, 0.6); display: flex; align-items: center; justify-content: center; }
.remote-panel { background: var(--panel); border: 1px solid var(--border); border-radius: 10px; width: 400px; max-width: calc(100vw - 32px); color: var(--text); box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5); }
.remote-head { display: flex; align-items: center; justify-content: space-between; padding: 10px 16px; border-bottom: 1px solid var(--border); font-weight: 700; }
.remote-close { background: none; border: none; color: var(--text-dim); font-size: 20px; cursor: pointer; line-height: 1; }
.remote-body { padding: 14px 16px; display: flex; flex-direction: column; gap: 12px; }
.remote-row { display: flex; flex-direction: column; gap: 6px; font-size: 13px; }
.remote-row input[type='text'] { background: var(--bg); color: var(--text); border: 1px solid var(--border); border-radius: 6px; padding: 8px 10px; }
.seg { display: flex; gap: 6px; }
.seg button { flex: 1; background: var(--btn); color: var(--text); border: 1px solid var(--border); border-radius: 6px; padding: 7px 10px; font-size: 13px; cursor: pointer; }
.seg button.on { background: var(--accent); border-color: var(--accent); color: #fff; }
.remote-note { font-size: 12px; color: var(--text-dim); line-height: 1.5; }
.remote-note code { background: var(--bg); padding: 1px 4px; border-radius: 3px; }
.remote-actions { display: flex; justify-content: flex-end; }
.remote-primary { background: var(--accent); color: #fff; border: none; border-radius: 6px; padding: 8px 20px; font-size: 14px; cursor: pointer; }
.remote-primary:disabled { opacity: 0.5; cursor: not-allowed; }
</style>