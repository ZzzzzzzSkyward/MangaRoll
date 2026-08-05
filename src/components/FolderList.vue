<script setup>
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import { state } from '../store'
import { openFolderNode, openSelfComic, openZipEntry } from '../lib/importManager'
import { naturalCompare, folderNameCompare } from '../lib/importer'

const sortedFolders = computed( () =>
  [ ...( state.dir?.folders || [] ) ].sort( ( a, b ) => folderNameCompare( a.name, b.name ) )
)

// 压缩包条目（{ file, path }），按路径自然排序
const sortedZips = computed( () =>
  [ ...( state.dir?.zips || [] ) ].sort( ( a, b ) => naturalCompare( a.path, b.path ) )
)

const searchQuery = ref( '' )

function setSort ( key ) {
  if ( state.flSortKey === key ) {
    state.flSortAsc = !state.flSortAsc
  } else {
    state.flSortKey = key
    state.flSortAsc = true
  }
}

function matchTerms ( name, terms ) {
  const lower = name.toLowerCase()
  return terms.every( ( t ) => lower.includes( t ) )
}

const showSelfCard = computed( () => {
  if ( !state.dir?.images.length ) return false
  const q = searchQuery.value.trim()
  if ( !q ) return true
  return matchTerms( state.dir.name, q.toLowerCase().split( /\s+/ ) )
} )

const filteredFolders = computed( () => {
  const q = searchQuery.value.trim()
  const terms = q ? q.toLowerCase().split( /\s+/ ) : null
  return terms
    ? sortedFolders.value.filter( ( n ) => matchTerms( n.name, terms ) )
    : sortedFolders.value
} )

const filteredZips = computed( () => {
  const q = searchQuery.value.trim()
  const terms = q ? q.toLowerCase().split( /\s+/ ) : null
  return terms
    ? sortedZips.value.filter( ( z ) => matchTerms( zipName( z ), terms ) )
    : sortedZips.value
} )

function zipName ( z ) {
  const parts = z.path.replace( /\\/g, '/' ).split( '/' )
  return parts[ parts.length - 1 ] || z.path
}

const sortArrow = ( key ) => state.flSortKey === key ? ( state.flSortAsc ? ' ▲' : ' ▼' ) : ''

const allListItems = computed( () => {
  const items = []
  if ( showSelfCard.value ) {
    items.push( { kind: 'self', name: state.dir.name, type: '本目录', count: state.dir.images.length, path: state.dir.path } )
  }
  for ( const n of filteredFolders.value ) {
    items.push( { kind: 'folder', ref: n, name: n.name, type: n.folders.length ? '文件夹' : '漫画', count: nodeCount( n ), path: n.path } )
  }
  for ( const z of filteredZips.value ) {
    items.push( { kind: 'zip', ref: z, name: zipName( z ), type: '压缩文件', count: -1, path: z.path } )
  }
  const k = state.flSortKey
  const dir = state.flSortAsc ? 1 : -1
  items.sort( ( a, b ) => {
    if ( k === 'name' ) return naturalCompare( a.name, b.name ) * dir
    if ( k === 'type' ) return a.type.localeCompare( b.type, 'zh' ) * dir || naturalCompare( a.name, b.name ) * dir
    if ( k === 'count' ) return ( a.count - b.count ) * dir || naturalCompare( a.name, b.name ) * dir
    if ( k === 'path' ) return naturalCompare( a.path, b.path ) * dir
    return 0
  } )
  return items
} )

// 当前目录的层级链（根 → 当前），用于面包屑导航
const crumbs = computed( () => {
  const chain = []
  let node = state.dir
  while ( node ) {
    chain.push( node )
    node = node.parent
  }
  chain.reverse()
  return chain.map( ( n, i ) => ( { node: n, current: i === chain.length - 1 } ) )
} )

// 封面 URL 按页面对象缓存；切换目录 / 卸载时统一释放
const coverUrls = new Map()
function coverUrl ( node ) {
  if ( !node.cover ) return ''
  let url = coverUrls.get( node.cover )
  if ( !url ) {
    // 远程页面使用 src URL，本地页面使用 blob URL
    if ( node.cover.remote ) {
      url = node.cover.src
    } else if ( node.cover.file ) {
      url = URL.createObjectURL( node.cover.file )
    } else {
      return ''
    }
    coverUrls.set( node.cover, url )
  }
  return url
}

// 目录包含的图片总数（含嵌套子目录），叶子目录即漫画页数
function nodeCount ( node ) {
  return node.images.length + node.folders.reduce( ( s, f ) => s + nodeCount( f ), 0 )
}

watch(
  () => state.dir,
  () => {
    searchQuery.value = ''
    for ( const [ page, url ] of coverUrls.entries() ) {
      // 只释放本地页面的 blob URL，远程页面的 URL 不需要释放
      if ( !page.remote ) {
        URL.revokeObjectURL( url )
      }
    }
    coverUrls.clear()
  }
)

onBeforeUnmount( () => {
  for ( const [ page, url ] of coverUrls.entries() ) {
    // 只释放本地页面的 blob URL，远程页面的 URL 不需要释放
    if ( !page.remote ) {
      URL.revokeObjectURL( url )
    }
  }
  coverUrls.clear()
} )
</script>

<template>
  <div class="folder-list">
    <div class="fl-header">
      <nav class="fl-crumbs">
        <template v-for="(c, i) in crumbs" :key="c.node.path">
          <span v-if="i > 0" class="fl-crumb-sep">/</span>
          <button v-if="!c.current" class="fl-crumb" :title="c.node.path" @click="openFolderNode(c.node)">{{ c.node.name
          }}</button>
          <span v-else class="fl-crumb-current" :title="c.node.path">{{ c.node.name }}</span>
        </template>
      </nav>
      <button class="fl-view-toggle" :title="state.flViewMode === 'grid' ? '切换为列表视图' : '切换为网格视图'"
        @click="state.flViewMode = state.flViewMode === 'grid' ? 'list' : 'grid'">
        <svg v-if="state.flViewMode === 'grid'" width="16" height="16" viewBox="0 0 16 16" fill="none">
          <rect x="1" y="1" width="6" height="6" rx="1" stroke="currentColor" stroke-width="1.2" />
          <rect x="9" y="1" width="6" height="6" rx="1" stroke="currentColor" stroke-width="1.2" />
          <rect x="1" y="9" width="6" height="6" rx="1" stroke="currentColor" stroke-width="1.2" />
          <rect x="9" y="9" width="6" height="6" rx="1" stroke="currentColor" stroke-width="1.2" />
        </svg>
        <svg v-else width="16" height="16" viewBox="0 0 16 16" fill="none">
          <rect x="1" y="2" width="14" height="2" rx="0.5" fill="currentColor" />
          <rect x="1" y="7" width="14" height="2" rx="0.5" fill="currentColor" />
          <rect x="1" y="12" width="14" height="2" rx="0.5" fill="currentColor" />
        </svg>
      </button>
      <input v-model="searchQuery" class="fl-search" type="text" placeholder="搜索…" spellcheck="false" />
    </div>
    <div v-if="showSelfCard || filteredFolders.length || filteredZips.length">
      <div v-if="state.flViewMode === 'grid'" class="fl-grid">
        <div v-if="showSelfCard" class="fl-card" role="button" tabindex="0" @click="openSelfComic()"
          @keydown.enter="openSelfComic()">
          <div class="fl-cover">
            <span class="fl-badge">本目录</span>
            <img v-if="coverUrl(state.dir)" class="fl-img" :src="coverUrl(state.dir)" loading="lazy"
              :alt="state.dir.name" />
          </div>
          <div class="fl-name" :title="state.dir.name">{{ state.dir.name }}</div>
          <div class="fl-count">{{ state.dir.images.length }} 张</div>
        </div>
        <div v-for="node in filteredFolders" :key="node.path" class="fl-card" role="button" tabindex="0"
          @click="openFolderNode(node)" @keydown.enter="openFolderNode(node)">
          <div class="fl-cover">
            <img v-if="coverUrl(node)" class="fl-img" :src="coverUrl(node)" loading="lazy" :alt="node.name" />
          </div>
          <div class="fl-name" :title="node.name">{{ node.name }}</div>
          <div class="fl-count">{{ nodeCount(node) }} 张</div>
        </div>
        <div v-for="z in filteredZips" :key="z.path" class="fl-card" role="button" tabindex="0" @click="openZipEntry(z)"
          @keydown.enter="openZipEntry(z)">
          <div class="fl-cover">
            <span class="fl-badge fl-badge-zip">ZIP</span>
            <div class="fl-placeholder">压缩包</div>
          </div>
          <div class="fl-name" :title="z.path">{{ zipName(z) }}</div>
          <div class="fl-count">压缩文件</div>
        </div>
      </div>
      <div v-else class="fl-list">
        <div class="fl-list-head">
          <span class="fl-list-col fl-list-col-icon"></span>
          <button class="fl-list-col fl-list-col-name fl-list-sort-btn" @click="setSort('name')">名称{{ sortArrow('name')
          }}</button>
          <button class="fl-list-col fl-list-col-type fl-list-sort-btn" @click="setSort('type')">类型{{ sortArrow('type')
          }}</button>
          <button class="fl-list-col fl-list-col-count fl-list-sort-btn" @click="setSort('count')">项目数{{
            sortArrow('count')
          }}</button>
          <button class="fl-list-col fl-list-col-path fl-list-sort-btn" @click="setSort('path')">路径{{ sortArrow('path')
          }}</button>
        </div>
        <template v-for="item in allListItems" :key="item.kind === 'self' ? 'self' : item.path">
          <div v-if="item.kind === 'self'" class="fl-list-row" role="button" tabindex="0" @click="openSelfComic()"
            @keydown.enter="openSelfComic()">
            <span class="fl-list-col fl-list-col-icon">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" stroke-width="1.2" />
                <path d="M5 8h6M8 5v6" stroke="currentColor" stroke-width="1.2" />
              </svg>
            </span>
            <span class="fl-list-col fl-list-col-name" :title="item.name">{{ item.name }}</span>
            <span class="fl-list-col fl-list-col-type">{{ item.type }}</span>
            <span class="fl-list-col fl-list-col-count">{{ item.count }} 张</span>
            <span class="fl-list-col fl-list-col-path" :title="item.path">{{ item.path }}</span>
          </div>
          <div v-else-if="item.kind === 'folder' && item.type === '漫画'" class="fl-list-row" role="button" tabindex="0"
            @click="openFolderNode(item.ref)" @keydown.enter="openFolderNode(item.ref)">
            <span class="fl-list-col fl-list-col-icon">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M3 2.5C3 2.5 5 2 8 2s5 .5 5 .5v11c0 0-2-.5-5-.5s-5 .5-5 .5v-11z" stroke="currentColor"
                  stroke-width="1.1" stroke-linejoin="round" />
                <path d="M8 2v11" stroke="currentColor" stroke-width="1.1" />
              </svg>
            </span>
            <span class="fl-list-col fl-list-col-name" :title="item.name">{{ item.name }}</span>
            <span class="fl-list-col fl-list-col-type">{{ item.type }}</span>
            <span class="fl-list-col fl-list-col-count">{{ item.count }} 张</span>
            <span class="fl-list-col fl-list-col-path" :title="item.path">{{ item.path }}</span>
          </div>
          <div v-else-if="item.kind === 'folder'" class="fl-list-row" role="button" tabindex="0"
            @click="openFolderNode(item.ref)" @keydown.enter="openFolderNode(item.ref)">
            <span class="fl-list-col fl-list-col-icon">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M2 4a1 1 0 011-1h3.172a1 1 0 01.707.293L8 4h5a1 1 0 011 1v7a1 1 0 01-1 1H3a1 1 0 01-1-1V4z"
                  stroke="currentColor" stroke-width="1.2" />
              </svg>
            </span>
            <span class="fl-list-col fl-list-col-name" :title="item.name">{{ item.name }}</span>
            <span class="fl-list-col fl-list-col-type">{{ item.type }}</span>
            <span class="fl-list-col fl-list-col-count">{{ item.count }} 张</span>
            <span class="fl-list-col fl-list-col-path" :title="item.path">{{ item.path }}</span>
          </div>
          <div v-else class="fl-list-row" role="button" tabindex="0" @click="openZipEntry(item.ref)"
            @keydown.enter="openZipEntry(item.ref)">
            <span class="fl-list-col fl-list-col-icon">
              <svg data-v-92fcd16b="" width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path data-v-92fcd16b=""
                  d="M4 3.333h8V2H4v1.333z m8.667 0.667v8h1.333V4h-1.333z m-0.667 8.667H4v1.333h8v-1.333z M3.333 12V4H2v8h1.333z m0.667 0.667a0.667 0.667 0 0 1-0.667-0.667H2a2 2 0 0 0 2 2v-1.333z m8.667-0.667a0.667 0.667 0 0 1-0.667 0.667v1.333a2 2 0 0 0 2-2h-1.333z M12 3.333a0.667 0.667 0 0 1 0.667 0.667h1.333a2 2 0 0 0-2-2v1.333z M4 2a2 2 0 0 0-2 2h1.333a0.667 0.667 0 0 1 0.667-0.667V2z M9.333 11.333h-2.667v-1.333h1.333v-1.333h1.333v2.667z m0-8v1.333h-1.333V3.333h1.333z m-1.333 1.333v1.333h-1.333V4.667h1.333z m1.333 1.333v1.333h-1.333V6h1.333z m-1.333 1.333v1.333h-1.333v-1.333h1.333z"
                  stroke="currentColor" stroke-width="0.8"></path>
              </svg> </span>
            <span class="fl-list-col fl-list-col-name" :title="item.name">{{ item.name }}</span>
            <span class="fl-list-col fl-list-col-type">{{ item.type }}</span>
            <span class="fl-list-col fl-list-col-count">—</span>
            <span class="fl-list-col fl-list-col-path" :title="item.path">{{ item.path }}</span>
          </div>
        </template>
      </div>
    </div>
    <div v-else-if="searchQuery.trim()" class="fl-empty">无匹配结果</div>
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

.fl-search {
  margin-left: auto;
  flex-shrink: 0;
  width: 200px;
  padding: 5px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-s);
  background: var(--panel);
  color: var(--text);
  font-size: 13px;
  outline: none;
  transition: border-color 0.15s var(--ease);
}

.fl-search:focus {
  border-color: var(--accent);
}

.fl-search::placeholder {
  color: var(--text-dim);
}

.fl-view-toggle {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: 1px solid var(--border);
  border-radius: var(--radius-s);
  background: var(--panel);
  color: var(--text-dim);
  cursor: pointer;
  transition: background 0.12s var(--ease), color 0.12s var(--ease), border-color 0.12s var(--ease);
}

.fl-view-toggle:hover {
  background: var(--hover);
  color: var(--accent);
  border-color: var(--border-strong);
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

.fl-badge-zip {
  background: #b26a00;
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

.fl-list {
  border: 1px solid var(--border);
  border-radius: var(--radius-m);
  background: var(--panel);
  overflow: hidden;
}

.fl-list-head {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  background: var(--hover);
  border-bottom: 1px solid var(--border);
  font-size: 12px;
  font-weight: 600;
  color: var(--text-dim);
  user-select: none;
}

.fl-list-sort-btn {
  background: none;
  border: none;
  padding: 0;
  font: inherit;
  color: inherit;
  cursor: pointer;
  text-align: left;
  transition: color 0.12s var(--ease);
}

.fl-list-sort-btn:hover {
  color: var(--accent);
}

.fl-list-row {
  display: flex;
  align-items: center;
  padding: 6px 12px;
  border-bottom: 1px solid var(--border);
  font-size: 13px;
  color: var(--text);
  cursor: pointer;
  transition: background 0.1s var(--ease);
}

.fl-list-row:last-child {
  border-bottom: none;
}

.fl-list-row:hover,
.fl-list-row:focus-visible {
  background: var(--hover);
  outline: none;
	--text-dim: #411111;
}

.fl-list-col {
  flex-shrink: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fl-list-col-icon {
  width: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-dim);
}

.fl-list-col-name {
  flex: 1;
  min-width: 0;
  font-weight: 500;
}

.fl-list-col-type {
  width: 80px;
  color: var(--text-dim);
}

.fl-list-col-count {
  width: 80px;
  text-align: left;
  color: var(--text-dim);
}

.fl-list-col-path {
  flex: 2;
  min-width: 0;
  color: var(--text-dim);
  font-size: 12px;
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

  .fl-search {
    width: 120px;
    font-size: 12px;
  }

  .fl-list-col-type,
  .fl-list-col-path {
    display: none;
  }

  .fl-list-col-count {
    width: 60px;
  }
}
</style>
