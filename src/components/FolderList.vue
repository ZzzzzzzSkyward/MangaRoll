<script setup>
import { watch, onBeforeUnmount } from 'vue'
import { state, openFolderNode, openSelfComic, goUp } from '../store'

// 封面 blob URL 按页面对象缓存；切换目录 / 卸载时统一释放
const coverUrls = new Map()
function coverUrl(node) {
  if (!node.cover) return ''
  let url = coverUrls.get(node.cover)
  if (!url) {
    url = URL.createObjectURL(node.cover.file)
    coverUrls.set(node.cover, url)
  }
  return url
}

// 目录包含的图片总数（含嵌套子目录），叶子目录即漫画页数
function nodeCount(node) {
  return node.images.length + node.folders.reduce((s, f) => s + nodeCount(f), 0)
}

watch(
  () => state.dir,
  () => {
    for (const url of coverUrls.values()) URL.revokeObjectURL(url)
    coverUrls.clear()
  }
)

onBeforeUnmount(() => {
  for (const url of coverUrls.values()) URL.revokeObjectURL(url)
  coverUrls.clear()
})
</script>

<template>
  <div class="folder-list">
    <div class="fl-header">
      <button v-if="state.dir?.parent" class="fl-back" @click="goUp()">← 上一级</button>
      <span class="fl-title" :title="state.dir?.name">{{ state.dir?.name }}</span>
    </div>
    <div v-if="state.dir?.folders.length || state.dir?.images.length" class="fl-grid">
      <div
        v-if="state.dir.images.length"
        class="fl-card"
        role="button"
        tabindex="0"
        @click="openSelfComic()"
        @keydown.enter="openSelfComic()"
      >
        <div class="fl-cover">
          <span class="fl-badge">本目录</span>
          <img
            v-if="coverUrl(state.dir)"
            class="fl-img"
            :src="coverUrl(state.dir)"
            loading="lazy"
            :alt="state.dir.name"
          />
          <div v-else class="fl-placeholder">无封面</div>
        </div>
        <div class="fl-name" :title="state.dir.name">{{ state.dir.name }}</div>
        <div class="fl-count">{{ state.dir.images.length }} 张</div>
      </div>
      <div
        v-for="node in state.dir.folders"
        :key="node.path"
        class="fl-card"
        role="button"
        tabindex="0"
        @click="openFolderNode(node)"
        @keydown.enter="openFolderNode(node)"
      >
        <div class="fl-cover">
          <img v-if="coverUrl(node)" class="fl-img" :src="coverUrl(node)" loading="lazy" :alt="node.name" />
          <div v-else class="fl-placeholder">无封面</div>
        </div>
        <div class="fl-name" :title="node.name">{{ node.name }}</div>
        <div class="fl-count">{{ nodeCount(node) }} 张</div>
      </div>
    </div>
    <div v-else class="fl-empty">此文件夹为空</div>
  </div>
</template>

<style scoped>
.folder-list {
  position: absolute;
  inset: 0;
  overflow-y: auto;
  padding: 100px 24px 32px;
  background: var(--bg);
}
.fl-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 18px;
}
.fl-back {
  background: var(--btn);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 6px 14px;
  font-size: 13px;
  cursor: pointer;
  flex-shrink: 0;
}
.fl-back:hover {
  background: var(--btn-hover);
  border-color: var(--accent);
}
.fl-title {
  font-size: 18px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.fl-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 18px;
}
.fl-card {
  cursor: pointer;
  border-radius: 10px;
  overflow: hidden;
  background: var(--panel);
  border: 1px solid var(--border);
  transition: border-color 0.15s, transform 0.15s;
}
.fl-card:hover,
.fl-card:focus-visible {
  border-color: var(--accent);
  transform: translateY(-2px);
  outline: none;
}
.fl-cover {
  position: relative;
  aspect-ratio: 3 / 4;
  background: #0e1118;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.fl-badge {
  position: absolute;
  top: 6px;
  left: 6px;
  z-index: 1;
  font-size: 11px;
  color: #fff;
  background: rgba(79, 140, 255, 0.92);
  border-radius: 4px;
  padding: 2px 6px;
  pointer-events: none;
}
.fl-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  background: var(--bg);
}
.fl-placeholder {
  color: var(--text-dim);
  font-size: 12px;
}
.fl-name {
  padding: 8px 10px 2px;
  font-size: 13px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.fl-count {
  padding: 0 10px 10px;
  font-size: 12px;
  color: var(--text-dim);
}
.fl-empty {
  padding: 40px 0;
  text-align: center;
  color: var(--text-dim);
  font-size: 14px;
}

@media (max-width: 640px) {
  .folder-list {
    padding: 94px 12px 24px;
  }
  .fl-grid {
    grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
    gap: 12px;
  }
  .fl-title {
    font-size: 16px;
  }
}
</style>
