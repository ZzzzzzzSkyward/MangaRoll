import { reactive } from 'vue'

// 全局 UI 状态：对话框可见性、工具栏收起状态（供快捷键 toggleToolbar 以及工具栏自身读写）
export const ui = reactive({
  toolbarOpen: true,
  settingsOpen: false,
  remoteOpen: false,
})

export function toggleToolbar() {
  ui.toolbarOpen = !ui.toolbarOpen
  if (!ui.toolbarOpen) {
    // 收起后建议用户仍可通过浮动按钮展开
  }
}

export function openSettings() {
  ui.settingsOpen = true
}

export function closeSettings() {
  ui.settingsOpen = false
}

export function openRemote() {
  ui.remoteOpen = true
}

export function closeRemote() {
  ui.remoteOpen = false
}