<script setup>
import { ref } from 'vue'
import { importFolder, importZip, loadDanmakuFile } from '../store'

const folderInput = ref(null)
const zipInput = ref(null)
const danmakuInput = ref(null)

function onFolderChange(e) {
  if (e.target.files.length) importFolder(e.target.files)
  e.target.value = ''
}

function onZipChange(e) {
  const f = e.target.files[0]
  if (f) importZip(f)
  e.target.value = ''
}

function onDanmakuChange(e) {
  const f = e.target.files[0]
  if (f) loadDanmakuFile(f)
  e.target.value = ''
}

defineExpose({
  pickFolder: () => folderInput.value?.click(),
  pickZip: () => zipInput.value?.click(),
  pickDanmaku: () => danmakuInput.value?.click(),
})
</script>

<template>
  <input ref="folderInput" type="file" webkitdirectory hidden @change="onFolderChange" />
  <input ref="zipInput" type="file" accept=".zip" hidden @change="onZipChange" />
  <input ref="danmakuInput" type="file" accept=".json" hidden @change="onDanmakuChange" />
</template>
