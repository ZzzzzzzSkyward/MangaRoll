<script setup>
import { ref, computed } from 'vue'
import FilePicker from './FilePicker.vue'
import SettingsDialog from './SettingsDialog.vue'
import RemoteDialog from './RemoteDialog.vue'
import { state, setMode, setZoom, setZoomMode, jumpTo, toggleDanmaku, toggleTabletMode, toggleCrop } from '../store'
import { MODE_VERTICAL, MODE_HORIZONTAL, MODE_RIGHT_TO_LEFT, isHorizontalMode } from '../lib/modes'
import { settings } from '../lib/settings'
import { ui, toggleToolbar, openSettings, openRemote } from '../lib/uiState'

const picker = ref(null)
const jumpVal = ref(null)
const collapsed = computed(() => !ui.toolbarOpen)
const floatVisible = ref(true)
let fadeTimer = 0

function resetFadeTimer() {
  floatVisible.value = true
  clearTimeout(fadeTimer)
  fadeTimer = setTimeout(() => {
    floatVisible.value = false
  }, 10000)
}

const pct = computed(() => Math.round(state.zoom * 100))
const danmakuTip = computed(() => (isHorizontalMode(state.mode) ? '弹幕仅在纵向模式显示' : '切换弹幕显示'))
const cropClass = computed(() => ({ on: settings.cropEnabled }))

function doJump() {
  const v = parseInt(jumpVal.value, 10)
  if (!Number.isFinite(v)) return
  jumpTo(v - 1)
  jumpVal.value = null
}
function toggleCollapse() {
  toggleToolbar()
  if (!ui.toolbarOpen) {
    resetFadeTimer()
  }
}
</script>

<template>
  <header class="toolbar-wrap" :class="{ collapsed }">
    <header class="toolbar">
      <div class="tb-row-1">
        <span class="app-name">漫画阅读器</span>
        <span v-if="state.pages.length" class="tb-title" :title="state.title">{{ state.title }}</span>
        <template v-if="state.pages.length">
          <input
            v-model.number="jumpVal"
            class="page-jump"
            type="number"
            min="1"
            :max="state.pages.length"
            @keydown.enter="doJump"
            placeholder="页码"
          />
          <span class="page-info">/ {{ state.pages.length }}</span>
        </template>
        <button class="toggle-btn" @click="toggleCollapse" :title="collapsed ? '展开工具栏' : '收起工具栏'">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path v-if="collapsed" d="M6 9l6 6 6-6" stroke-linecap="round" stroke-linejoin="round"/>
            <path v-else d="M18 15l-6-6-6 6" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      </div>

      <div class="tb-row-2">
        <button title="打开文件夹" @click="picker.pickFolder()">文件夹</button>
        <button title="打开 ZIP" @click="picker.pickZip()">ZIP</button>
        <button title="加载远程漫画" @click="openRemote()">远程</button>
        <button title="导入弹幕 JSON" @click="picker.pickDanmaku()">弹幕</button>
        <span class="sep"></span>

        <button class="mode-btn" :class="{ on: state.mode === MODE_VERTICAL }" @click="setMode(MODE_VERTICAL)">纵向</button>
        <button class="mode-btn" :class="{ on: state.mode === MODE_HORIZONTAL }" @click="setMode(MODE_HORIZONTAL)">横向</button>
        <button class="mode-btn" :class="{ on: state.mode === MODE_RIGHT_TO_LEFT }" @click="setMode(MODE_RIGHT_TO_LEFT)">右左</button>
        <span class="sep"></span>

        <button title="缩小" @click="setZoom('out')">−</button>
        <span class="zoom-val">{{ pct }}%</span>
        <button title="放大" @click="setZoom('in')">+</button>
        <button :class="{ on: state.zoomMode === 'width' }" @click="setZoomMode('width')">适应宽</button>
        <button :class="{ on: state.zoomMode === 'height' }" @click="setZoomMode('height')">适应高</button>
        <span class="sep"></span>

        <button :class="cropClass" title="自动裁边（白/黑边）" @click="toggleCrop()">
          裁边
        </button>
        <span class="sep"></span>

        <button :class="{ on: state.danmakuOn }" :title="danmakuTip" @click="toggleDanmaku">
          弹幕 {{ state.danmakuOn ? '开' : '关' }}
        </button>
        <input v-model.number="state.danmakuOpacity" class="dm-opacity" type="range" min="0.15" max="1" step="0.05" />
        <select v-model="state.danmakuSpeed" title="弹幕速度">
          <option :value="0.5">0.5×</option>
          <option :value="0.75">0.75×</option>
          <option :value="1">1×</option>
          <option :value="1.5">1.5×</option>
          <option :value="2">2×</option>
        </select>
        <span class="sep"></span>
        <button :class="{ on: state.tabletMode }" title="平板模式：开启拖拽惯性和双指缩放" @click="toggleTabletMode">
          平板 {{ state.tabletMode ? '开' : '关' }}
        </button>
        <span class="sep"></span>
        <button title="设置（快捷键 / 渲染 / OCR）" @click="openSettings()">设置</button>
      </div>
    </header>

    <button
      v-if="collapsed"
      class="floating-toggle"
      :class="{ faded: !floatVisible }"
      @click="toggleCollapse"
      @mouseenter="floatVisible = true; clearTimeout(fadeTimer)"
      title="展开工具栏"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M6 9l6 6 6-6" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </button>

    <FilePicker ref="picker" />
    <SettingsDialog v-if="ui.settingsOpen" />
    <RemoteDialog />
  </header>
</template>

<style scoped>
.toolbar-wrap {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 10;
  pointer-events: none;
}
.toolbar-wrap.collapsed .toolbar {
  transform: translateY(-100%);
}
.toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background: var(--panel);
  border-bottom: 1px solid var(--border);
  flex-wrap: wrap;
  transition: transform 0.25s ease;
  pointer-events: auto;
}
.tb-row-1 {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}
.tb-row-2 {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
  width: 100%;
}
.app-name {
  font-weight: 700;
  color: var(--accent);
  white-space: nowrap;
}
.tb-title {
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-dim);
  font-size: 13px;
  flex: 1;
  min-width: 0;
}
.toggle-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--btn);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 4px;
  cursor: pointer;
  color: var(--text);
  margin-left: auto;
  flex-shrink: 0;
}
.toggle-btn svg {
  width: 16px;
  height: 16px;
}
.floating-toggle {
  position: fixed;
  top: 4px;
  right: 8px;
  z-index: 11;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 6px 8px;
  cursor: pointer;
  color: var(--text);
  pointer-events: auto;
  opacity: 0.6;
  transition: opacity 0.5s ease;
}
.floating-toggle.faded {
  opacity: 0;
}
.floating-toggle:hover {
  background: var(--btn-hover);
  opacity: 1;
}
.floating-toggle svg {
  width: 16px;
  height: 16px;
}
button {
  background: var(--btn);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 4px 10px;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
  white-space: nowrap;
}
button:hover {
  background: var(--btn-hover);
}
button.on {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}
.sep {
  width: 1px;
  height: 18px;
  background: var(--border);
  margin: 0 4px;
}
.zoom-val {
  min-width: 44px;
  text-align: center;
  font-size: 13px;
  color: var(--text-dim);
}
.page-jump {
  width: 70px;
  background: var(--bg);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 3px 6px;
  font-size: 13px;
  text-align: center;
}
.page-info {
  font-size: 13px;
  color: var(--text-dim);
  white-space: nowrap;
}
.dm-opacity {
  width: 60px;
  accent-color: var(--accent);
}
select {
  background: var(--btn);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 3px 4px;
  font-size: 13px;
}

@media (max-width: 640px) {
  .toolbar {
    padding: 6px 8px;
    gap: 4px;
  }
  .tb-row-1 {
    gap: 6px;
  }
  .tb-title {
    max-width: 80px;
    font-size: 12px;
  }
  .tb-row-2 {
    gap: 3px;
  }
  button {
    padding: 6px 8px;
    font-size: 12px;
    min-height: 32px;
  }
  .sep {
    display: none;
  }
  .zoom-val {
    min-width: 36px;
    font-size: 12px;
  }
  .page-jump {
    width: 60px;
    padding: 4px;
    font-size: 12px;
  }
  .dm-opacity {
    width: 50px;
  }
  select {
    padding: 4px;
    font-size: 12px;
  }
}

@media (max-width: 380px) {
  .tb-title {
    display: none;
  }
  .app-name {
    font-size: 14px;
  }
  button {
    padding: 6px 6px;
    font-size: 11px;
  }
}
</style>