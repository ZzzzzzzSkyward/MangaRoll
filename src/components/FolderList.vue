<script setup>
import { computed, watch, onBeforeUnmount } from 'vue'
import { state, openFolderNode, openSelfComic } from '../store'

// 名称中含数字时提取每个连续数字，得到数字数组（如 '第1话第2节' → [1, 2]）；
// 不含数字返回 null。
function digitGroups(name) {
  const g = (name.match(/\d+/g) || []).map(Number)
  return g.length ? g : null
}

// 智能文件夹名称排序：两侧都含数字时，按数字数组逐位比较
//（arr[0] → arr[arr.length-1]），从小到大；其余情况回退自然字符串比较。
function folderNameCompare(a, b) {
  const na = digitGroups(a.name)
  const nb = digitGroups(b.name)
  if (na && nb) {
    const len = Math.min(na.length, nb.length)
    for (let i = 0; i < len; i++) {
      if (na[i] !== nb[i]) return na[i] - nb[i]
    }
    if (na.length !== nb.length) return na.length - nb.length
  }
  return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
}

const sortedFolders = computed(() =>
  [...(state.dir?.folders || [])].sort(folderNameCompare)
)

// 当前目录的层级链（根 → 当前），用于面包屑导航
const crumbs = computed(() => {
  const chain = []
  let node = state.dir
  while (node) {
    chain.push(node)
    node = node.parent
  }
  chain.reverse()
  return chain.map((n, i) => ({ node: n, current: i === chain.length - 1 }))
})

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
      <nav class="fl-crumbs">
        <template v-for="(c, i) in crumbs" :key="c.node.path">
          <span v-if="i > 0" class="fl-crumb-sep">/</span>
          <button
            v-if="!c.current"
            class="fl-crumb"
            :title="c.node.path"
            @click="openFolderNode(c.node)"
          >{{ c.node.name }}</button>
          <span v-else class="fl-crumb-current" :title="c.node.path">{{ c.node.name }}</span>
        </template>
      </nav>
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
        v-for="node in sortedFolders"
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
.fl-crumbs {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  min-width: 0;
  font-size: 18px;
  font-weight: 600;
  line-height: 1.3;
}
.fl-crumb {
  background: none;
  border: none;
  padding: 2px 6px;
  margin: -2px -6px;
  border-radius: var(--radius-s);
  font-size: inherit;
  font-weight: inherit;
  line-height: inherit;
  color: var(--text-dim);
  cursor: pointer;
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  transition: background 0.12s var(--ease), color 0.12s var(--ease);
}
.fl-crumb:hover {
  background: var(--hover);
  color: var(--accent);
}
.fl-crumb-sep {
  color: var(--text-dim);
  opacity: 0.55;
  user-select: none;
}
.fl-crumb-current {
  color: var(--text);
  max-width: 260px;
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
  border-radius: var(--radius-m);
  overflow: hidden;
  background: var(--panel);
  border: 1px solid var(--border);
  box-shadow: var(--shadow-1);
  transition: transform 0.18s var(--ease), box-shadow 0.18s var(--ease), border-color 0.18s var(--ease);
}
.fl-card:hover,
.fl-card:focus-visible {
  border-color: rgba(0, 120, 212, 0.55);
  box-shadow: var(--shadow-2);
  outline: none;
}
.fl-cover {
  position: relative;
  aspect-ratio: 3 / 4;
  background: #e9ecf0;
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
  background: var(--accent);
  border-radius: var(--radius-s);
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
  color: var(--text);
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
  .fl-crumbs {
    font-size: 16px;
  }
  .fl-crumb,
  .fl-crumb-current {
    max-width: 130px;
  }
}
</style>
