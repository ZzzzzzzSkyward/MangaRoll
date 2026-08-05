<script setup>
import { ref } from 'vue'
import { importFolder, importDirectoryHandle, importZip } from '../lib/importManager'

const supportsDirectoryPicker = typeof window.showDirectoryPicker === 'function'
const folderInput = ref(null)
const zipInput = ref(null)

function onFolderChange(e) {
  if (e.target.files.length) importFolder(e.target.files)
  e.target.value = ''
}

async function onPickFolder() {
  if (!supportsDirectoryPicker) {
    folderInput.value?.click()
    return
  }
  try {
    const dirHandle = await window.showDirectoryPicker()
    if (dirHandle) importDirectoryHandle(dirHandle)
  } catch (e) {
    // 用户取消（AbortError）不处理；其余异常（权限 / 环境）降级到传统 webkitdirectory 选择
    if (e?.name === 'AbortError') return
    console.error(e)
    folderInput.value?.click()
  }
}

function onZipChange(e) {
  const f = e.target.files[0]
  if (f) importZip(f)
  e.target.value = ''
}

defineExpose({
  pickFolder: onPickFolder,
  pickZip: () => zipInput.value?.click(),
})
</script>

<template>
  <input ref="folderInput" type="file" webkitdirectory hidden @change="onFolderChange" />
  <input ref="zipInput" type="file" accept=".zip" hidden @change="onZipChange" />
</template>
