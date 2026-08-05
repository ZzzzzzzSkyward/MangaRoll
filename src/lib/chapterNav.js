import { computed, watch } from 'vue'
import { state } from '../store'
import { folderNameCompare } from './importer'
import { settings } from './settings'
import { unzip, extractDims, extractDimsInto, naturalCompare, isImage } from './importer'

export let prefetchedChapter = null
let prefetchAbort = null

export function setPrefetchedChapter(chapter) {
  prefetchedChapter = chapter
}

function zipName(z) {
  const base = z.path.split('/').pop()
  const i = base.lastIndexOf('.')
  return i > 0 ? base.slice(0, i) : base
}

function chapterItems(node) {
  const items = [
    ...node.folders.map((f) => ({ kind: 'folder', entry: f, name: f.name })),
    ...node.zips.map((z) => ({ kind: 'zip', entry: z, name: zipName(z) })),
  ]
  return items.sort((a, b) => folderNameCompare(a.name, b.name))
}

export const chapterNav = computed(() => {
  if (!state.tree) return null
  const container =
    state.view === 'comic' && state.sourceEntry ? state.sourceEntry.parent : state.dir?.parent
  if (!container) return null
  const items = chapterItems(container)
  if (items.length < 2) return null
  const idx =
    state.view === 'comic' && state.sourceEntry
      ? items.findIndex((it) => it.entry === state.sourceEntry)
      : items.findIndex((it) => it.entry === state.dir)
  if (idx === -1) return null
  return { prev: items[idx - 1] || null, next: items[idx + 1] || null }
})

async function prefetchNextChapter() {
  const nav = chapterNav.value
  if (!nav || !nav.next) return

  const nextKey = nav.next.entry.path || nav.next.entry.name
  if (prefetchedChapter && prefetchedChapter.key === nextKey) return

  if (prefetchAbort) {
    prefetchAbort.abort()
    prefetchAbort = null
  }

  const target = nav.next
  const entry = target.entry

  try {
    if (target.kind === 'zip') {
      if (!entry.pages) {
        const unzipped = await unzip(entry.file)
        const imgs = unzipped
          .filter((e) => isImage(e.path))
          .sort((a, b) => naturalCompare(a.path, b.path))
        if (imgs.length) {
          const pages = await extractDims(imgs, null, 4, settings.maxRenderSize)
          pages.forEach((p, i) => (p.key = i))
          entry.pages = pages
        }
      }
      if (entry.pages) {
        prefetchedChapter = { key: nextKey, pages: entry.pages }
      }
    } else {
      const pending = entry.images.filter((p) => !(p.w > 0) && !p.remote)
      if (pending.length) {
        await extractDimsInto(entry.images, null, 4, settings.maxRenderSize)
      }
      prefetchedChapter = { key: nextKey, pages: entry.images }
    }
  } catch (e) {
    console.error('预读下一话失败:', e)
  }
}

watch(
  () => [state.current, state.pages.length, settings.prefetchChapter, chapterNav.value],
  ([current, total, enabled, nav]) => {
    if (!enabled || !nav || !nav.next || total === 0) {
      if (prefetchAbort) {
        prefetchAbort.abort()
        prefetchAbort = null
      }
      return
    }

    const threshold = Math.max(1, Math.floor(total * 0.7))
    if (current >= threshold) {
      prefetchNextChapter()
    }
  }
)

watch(
  () => state.status,
  (status) => {
    if (status === 'loading') {
      if (prefetchAbort) {
        prefetchAbort.abort()
        prefetchAbort = null
      }
      prefetchedChapter = null
    }
  }
)
