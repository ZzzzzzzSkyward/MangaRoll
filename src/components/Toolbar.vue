<script setup>
import { ref, computed, nextTick } from 'vue'
import FilePicker from './FilePicker.vue'
import SettingsDialog from './SettingsDialog.vue'
import RemoteDialog from './RemoteDialog.vue'
import { state, setMode, setZoom, setZoomMode, jumpTo, toggleDanmaku, toggleCrop } from '../store'
import { backToList, navChapter } from '../lib/importManager'
import { chapterNav } from '../lib/chapterNav'
import { MODE_VERTICAL, MODE_HORIZONTAL, MODE_RIGHT_TO_LEFT, isHorizontalMode } from '../lib/modes'
import { settings } from '../lib/settings'
import { ui, toggleToolbar, openSettings, openRemote } from '../lib/uiState'

const picker = ref(null)
const jumpVal = ref(null)
const jumpFocused = ref(false)
// 页码响应式显示：未聚焦时显示当前页（state.current + 1），聚焦编辑时显示输入值
const jumpDisplay = computed({
  get: () => (jumpFocused.value ? jumpVal.value : state.current + 1),
  set: (v) => (jumpVal.value = v),
})
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

const titleRef = ref(null)
const tooltipRef = ref(null)
const showTip = ref(false)
const tipPos = ref(null)

async function onTitleHover() {
  showTip.value = false
  tipPos.value = null
  const el = titleRef.value
  if (!el || el.scrollWidth <= el.clientWidth) return
  showTip.value = true
  await nextTick()
  const wrap = titleRef.value
  const tip = tooltipRef.value
  if (!wrap || !tip) return
  const r = wrap.getBoundingClientRect()
  const top = r.top - tip.offsetHeight - 10 >= 2 ? r.top - tip.offsetHeight - 10 : r.bottom + 10
  tipPos.value = { top: `${top}px`, left: `${r.left}px` }
}
function hideTitleTip() {
  showTip.value = false
  tipPos.value = null
}
</script>

<template>
  <header class="toolbar-wrap" :class="{ collapsed }">
    <header class="toolbar">
      <div class="tb-row-1">
        <div v-if="state.pages.length" class="tb-title-wrap" @mouseenter="onTitleHover" @mouseleave="hideTitleTip">
          <span ref="titleRef" class="tb-title">{{ state.title }}</span>
          <div v-if="showTip" ref="tooltipRef" class="tb-title-tooltip" :style="tipPos">{{ state.title }}</div>
        </div>
        <template v-if="chapterNav">
          <button class="ch-nav" :disabled="!chapterNav.prev" @click="navChapter(-1)">上一话</button>
          <button class="ch-nav" :disabled="!chapterNav.next" @click="navChapter(1)">下一话</button>
        </template>
        <template v-if="state.pages.length">
          <input
            v-model.number="jumpDisplay"
            class="page-jump"
            type="number"
            min="1"
            :max="state.pages.length"
            @focus="jumpFocused = true"
            @blur="jumpFocused = false; jumpVal = null"
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
        <button v-if="state.tree && state.view === 'comic'" title="返回目录列表" @click="backToList()">返回目录</button>
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
        <input
          v-model.number="state.danmakuOpacity"
          class="dm-opacity"
          type="range"
          min="0.15"
          max="1"
          step="0.05"
          :style="{ '--fill': ((state.danmakuOpacity - 0.15) / 0.85) * 100 + '%' }"
        />
        <select v-model="state.danmakuSpeed" title="弹幕速度">
          <option :value="0.5">0.5×</option>
          <option :value="0.75">0.75×</option>
          <option :value="1">1×</option>
          <option :value="1.5">1.5×</option>
          <option :value="2">2×</option>
        </select>
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
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
  flex-wrap: wrap;
  transition: transform 0.25s var(--ease);
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
.tb-title-wrap {
  width: 50%;
  flex: none;
  min-width: 0;
}
.tb-title {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text);
  font-size: 13px;
  font-weight: 600;
}
.tb-title-tooltip {
  position: fixed;
  z-index: 60;
  max-width: 80vw;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: var(--radius-m);
  padding: 6px 12px;
  font-size: 13px;
  line-height: 1.4;
  color: var(--text);
  word-break: break-all;
  box-shadow: var(--shadow-2);
  pointer-events: none;
}
.toggle-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--hover);
  border: 1px solid var(--border);
  border-radius: var(--radius-s);
  padding: 4px;
  cursor: pointer;
  color: var(--text);
  margin-left: auto;
  flex-shrink: 0;
  transition: background 0.12s var(--ease), border-color 0.12s var(--ease);
}
.toggle-btn:hover {
  background: #e7ebf0;
  border-color: var(--border-strong);
}
.toggle-btn svg {
  width: 16px;
  height: 16px;
}
.floating-toggle {
  position: fixed;
  top: 8px;
  right: 10px;
  z-index: 11;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.88);
  backdrop-filter: blur(8px);
  border: 1px solid var(--border);
  border-radius: var(--radius-m);
  padding: 6px 9px;
  cursor: pointer;
  color: var(--text);
  pointer-events: auto;
  opacity: 0.7;
  box-shadow: var(--shadow-1);
  transition: opacity 0.5s ease, background 0.12s var(--ease), box-shadow 0.12s var(--ease);
}
.floating-toggle.faded {
  opacity: 0;
}
.floating-toggle:hover {
  background: #fff;
  opacity: 1;
  box-shadow: var(--shadow-2);
}
.floating-toggle svg {
  width: 16px;
  height: 16px;
}
button {
  background: transparent;
  color: var(--text);
  border: 1px solid transparent;
  border-radius: var(--radius-s);
  padding: 4px 10px;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.12s var(--ease), color 0.12s var(--ease), border-color 0.12s var(--ease);
  white-space: nowrap;
}
button:hover {
  background: var(--hover);
}
button:active {
  background: var(--pressed);
}
button.on {
  background: var(--accent-soft);
  border-color: rgba(0, 120, 212, 0.28);
  color: var(--accent);
  font-weight: 600;
}
.ch-nav {
  flex-shrink: 0;
}
button:disabled {
  opacity: 0.4;
  cursor: default;
}
button:disabled:hover {
  background: transparent;
}
.sep {
  width: 1px;
  height: 16px;
  background: var(--border);
  margin: 0 4px;
}
.zoom-val {
  min-width: 44px;
  text-align: center;
  font-size: 13px;
  color: var(--text-dim);
  font-variant-numeric: tabular-nums;
}
.page-jump {
  width: 70px;
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
}

@media (max-width: 640px) {
  .toolbar {
    padding: 6px 8px;
    gap: 4px;
  }
  .tb-row-1 {
    gap: 6px;
  }
  .tb-row-2 {
    gap: 3px;
  }
  .tb-title {
    max-width: 80px;
    font-size: 12px;
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
    padding: 4px 26px 4px 6px;
    font-size: 12px;
  }
}

@media (max-width: 380px) {
  .tb-title {
    display: none;
  }
  button {
    padding: 6px 6px;
    font-size: 11px;
  }
}
</style>