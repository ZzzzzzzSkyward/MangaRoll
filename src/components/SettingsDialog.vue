<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { settings, currentKeybindings, resetKeybindings } from '../lib/settings'
import { ACTION_DEFS, ACTION_NAMES, serializeKey, bindKey, invalidateKeybindings } from '../lib/keybindings'
import { OCR_DEFAULT_ENDPOINT } from '../lib/ocr/ocrConfig'
import { ocrServiceStatus } from '../lib/ocr/ocrClient'
import { closeSettings } from '../lib/uiState'

const tab = ref('render')
const capturingAction = ref(null)
const candidate = ref(null)

const actionDefs = ACTION_DEFS
const actionNames = ACTION_NAMES

const keys = computed(() => currentKeybindings())

const maxSizeOptions = [
  { value: 0, label: '无限制（原图）' },
  { value: 2048, label: '长边 ≤ 2048' },
  { value: 4096, label: '长边 ≤ 4096' },
  { value: 8192, label: '长边 ≤ 8192' },
]

// OCR 表单用本地副本，避免输入过程中实时写盘
const localEndpoint = ref(OCR_DEFAULT_ENDPOINT)
watch(
  () => settings.ocrEndpoint,
  (v) => {
    localEndpoint.value = v || OCR_DEFAULT_ENDPOINT
  },
  { immediate: true }
)
function saveOcr() {
  settings.ocrEndpoint = localEndpoint.value.trim() || OCR_DEFAULT_ENDPOINT
}

const ocrStatusLabels = {
  idle: '未启用',
  ok: '正常',
  retrying: '连接失败，重试中…',
  down: '不可用（已自动关闭）',
}
const ocrStatusText = computed(() => ocrStatusLabels[ocrServiceStatus.value] || '未知')

function beginCapture(action) {
  candidate.value = null
  capturingAction.value = action
}

function cancelCapture() {
  capturingAction.value = null
  candidate.value = null
}

function onCaptureKey(e) {
  if (capturingAction.value === null) return
  e.preventDefault()
  e.stopPropagation()
  if (e.key === 'Escape') {
    cancelCapture()
    return
  }
  if (e.key === 'Enter') {
    if (candidate.value) {
      bindKey(candidate.value, capturingAction.value)
      cancelCapture()
    }
    return
  }
  const s = serializeKey(e)
  if (s) candidate.value = s
}

function restoreDefaults() {
  resetKeybindings()
  invalidateKeybindings()
}

onMounted(() => window.addEventListener('keydown', onCaptureKey, true))
onBeforeUnmount(() => window.removeEventListener('keydown', onCaptureKey, true))
</script>

<template>
  <Teleport to="body">
    <div class="settings-mask" @click.self="closeSettings()">
      <div class="settings-panel">
        <header class="settings-head">
          <span>设置</span>
          <button class="sp-close" @click="closeSettings()">×</button>
        </header>
        <nav class="sp-tabs">
          <button :class="{ on: tab === 'render' }" @click="tab = 'render'">渲染</button>
          <button :class="{ on: tab === 'keys' }" @click="tab = 'keys'">快捷键</button>
          <button :class="{ on: tab === 'ocr' }" @click="tab = 'ocr'">OCR</button>
        </nav>

        <div v-if="tab === 'render'" class="sp-body">
          <div class="sp-row">
            <label for="maxSize">最大渲染尺寸</label>
            <select id="maxSize" v-model.number="settings.maxRenderSize">
              <option v-for="opt in maxSizeOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
            </select>
            <span class="sp-hint">重新导入后生效</span>
          </div>
          <div class="sp-row">
            <label class="sp-switch">
              <input type="checkbox" v-model="settings.moireEnabled" />
              <span>摩尔纹去网纹（WebGL 双边滤波）</span>
            </label>
          </div>
          <div class="sp-row">
            <label>强度</label>
            <input type="range" min="1" max="5" step="1" v-model.number="settings.moireRadius" :disabled="!settings.moireEnabled" />
            <span class="sp-num">{{ settings.moireRadius }}</span>
            <span class="sp-hint">值越大去网纹越彻底</span>
          </div>
          <div class="sp-row">
            <label class="sp-switch">
              <input type="checkbox" v-model="settings.cropEnabled" />
              <span>自动裁边（白 / 黑边）</span>
            </label>
          </div>
        </div>

        <div v-if="tab === 'keys'" class="sp-body">
          <p class="sp-hint">点击“设置”后，在页面上按下组合键以绑定；Enter 确认，Esc 取消。</p>
          <table class="key-table">
            <tbody>
              <tr v-for="action in actionNames" :key="action">
                <td class="key-label">{{ actionDefs[action] }}</td>
                <td>
                  <span v-if="capturingAction === action" class="capture-tip">
                    {{ candidate ? `已捕获 ${candidate}，按 Enter 确认` : '输入中…' }}
                  </span>
                  <span v-else>{{ (keys[action] || []).join(' / ') || '（无）' }}</span>
                </td>
                <td class="key-btn-cell">
                  <button @click="beginCapture(action)">设置</button>
                </td>
              </tr>
            </tbody>
          </table>
          <div class="sp-actions">
            <button @click="restoreDefaults">恢复默认</button>
          </div>
        </div>

        <div v-if="tab === 'ocr'" class="sp-body">
          <div class="sp-row">
            <label class="sp-switch">
              <input type="checkbox" v-model="settings.ocrEnabled" />
              <span>启用本地 OCR 叠加（气泡检测 + 日文识别）</span>
            </label>
          </div>
          <div class="sp-row">
            <label>服务状态</label>
            <span :class="'ocr-status ocr-status-' + ocrServiceStatus">{{ ocrStatusText }}</span>
          </div>
          <div class="sp-row">
            <label>服务地址</label>
            <input v-model.trim="localEndpoint" type="text" :placeholder="OCR_DEFAULT_ENDPOINT" />
          </div>
          <div class="sp-row">
            <label>文本可见性</label>
            <select v-model="settings.ocrTextMode">
              <option value="show">显示文本</option>
              <option value="hide">隐藏文本</option>
              <option value="white">白底显示</option>
            </select>
          </div>
          <div class="sp-row">
            <label>文本方向</label>
            <select v-model="settings.ocrTextDirection">
              <option value="auto">智能检测（按文本区域宽高比）</option>
              <option value="horizontal">横向</option>
              <option value="vertical">纵向</option>
            </select>
          </div>
          <div class="sp-row">
            <label class="sp-switch">
              <input type="checkbox" v-model="settings.ocrSelectable" />
              <span>文本可选中（拖选复制）</span>
            </label>
          </div>
          <div class="sp-row">
            <label>透明度</label>
            <input type="range" min="10" max="100" step="5" v-model.number="settings.ocrTextOpacity" />
            <span class="sp-num">{{ settings.ocrTextOpacity }}%</span>
          </div>
          <div class="sp-row">
            <label>字号</label>
            <input type="range" min="8" max="32" step="1" v-model.number="settings.ocrFontSize" />
            <span class="sp-num">{{ settings.ocrFontSize }}px</span>
          </div>
          <div class="sp-row">
            <label>字体</label>
            <input v-model.trim="settings.ocrFontFamily" type="text" placeholder="默认（继承全局）" />
          </div>
          <div class="sp-row">
            <label>字重</label>
            <select v-model="settings.ocrFontWeight">
              <option value="400">常规</option>
              <option value="700">加粗</option>
            </select>
          </div>
          <div class="sp-row">
            <label>文字颜色</label>
            <input type="color" v-model="settings.ocrTextColor" />
            <span class="sp-hint">仅“显示文本”模式生效</span>
          </div>
          <p class="sp-warn">调用本地后端 /detect?ocr=true（文本区域检测 + manga-ocr 日文识别），需先启动 backend 服务。连接失败会自动重试，超过最大时长后标记服务不可用并自动关闭 OCR。</p>
          <div class="sp-actions">
            <button @click="saveOcr">保存 OCR 配置</button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.settings-mask { position: fixed; inset: 0; z-index: 90; background: rgba(8, 10, 14, 0.6); display: flex; align-items: center; justify-content: center; }
.settings-panel { background: var(--panel); border: 1px solid var(--border); border-radius: 10px; width: 440px; max-width: calc(100vw - 32px); max-height: 82vh; overflow: auto; color: var(--text); box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5); }
.settings-head { display: flex; align-items: center; justify-content: space-between; padding: 10px 16px; border-bottom: 1px solid var(--border); font-weight: 700; }
.sp-close { background: none; border: none; color: var(--text-dim); font-size: 20px; cursor: pointer; line-height: 1; }
.sp-tabs { display: flex; border-bottom: 1px solid var(--border); }
.sp-tabs button { flex: 1; padding: 8px 0; background: none; border: none; color: var(--text-dim); cursor: pointer; font-size: 14px; border-bottom: 2px solid transparent; }
.sp-tabs button.on { color: var(--accent); border-bottom-color: var(--accent); }
.sp-body { padding: 14px 16px; display: flex; flex-direction: column; gap: 12px; }
.sp-row { display: flex; align-items: center; gap: 10px; font-size: 13px; }
.sp-row select, .sp-row input[type='text'] { background: var(--bg); color: var(--text); border: 1px solid var(--border); border-radius: 6px; padding: 6px 8px; flex: 1; min-width: 0; }
.sp-row input[type='color'] { width: 46px; height: 30px; padding: 2px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; }
.sp-row input[type='range'] { flex: 1; }
.sp-num { min-width: 24px; text-align: center; color: var(--text-dim); }
.sp-switch { display: flex; align-items: center; gap: 8px; cursor: pointer; }
.sp-hint { font-size: 12px; color: var(--text-dim); margin: 0; }
.ocr-status { font-size: 12px; padding: 1px 8px; border-radius: 4px; background: var(--bg); border: 1px solid var(--border); }
.ocr-status-ok { color: #67c23a; }
.ocr-status-retrying { color: #e6a23c; }
.ocr-status-down { color: #f56c6c; }
.sp-warn { font-size: 12px; color: #e6a23c; margin: 0; }
.sp-actions { display: flex; gap: 8px; }
.sp-actions button { background: var(--btn); color: var(--text); border: 1px solid var(--border); border-radius: 6px; padding: 6px 14px; cursor: pointer; }
.sp-actions button:hover { background: var(--btn-hover); }
.key-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.key-table td { padding: 6px 4px; border-bottom: 1px solid var(--border); }
.key-label { width: 130px; }
.key-btn-cell { width: 60px; text-align: right; }
.capture-tip { color: var(--accent); }
.key-table button { background: var(--btn); color: var(--text); border: 1px solid var(--border); border-radius: 6px; padding: 3px 10px; cursor: pointer; }
</style>