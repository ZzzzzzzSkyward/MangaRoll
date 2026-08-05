import { isImage, naturalCompare, isJson, isDanmakuJson } from './importer'

// 远程来源统一输出页面条目：{ remote: true, src, name, path, w?, h? }，
// 走「URL 直读」路径（不创建 blob URL），依赖对方服务开启 CORS。
// 支持层级结构：返回带 path 的条目，用于构建文件夹树。

function assertHttp(url) {
  if (!/^https?:\/\//i.test(url)) throw new Error('URL 需为 http(s) 地址')
  return url.replace(/\/+$/, '')
}

function resolveUrl(ref, base) {
  try {
    return new URL(ref, ensureSlash(base)).href
  } catch {
    return ref
  }
}

function ensureSlash(u) {
  return /\/$/.test(u) ? u : u + '/'
}

// 递归处理 manifest 中的目录结构，返回扁平化的带 path 条目
function flattenManifestItems(items, basePath, parentPath = '') {
  const result = []
  if (!Array.isArray(items)) return result
  
  for (const item of items) {
    // 图片条目
    const ref = item.url || item.name
    if (ref && (isImage(ref) || isJson(ref))) {
      const src = resolveUrl(ref, basePath)
      const name = item.name || decodeURIComponent(src.split('/').pop() || ref)
      const path = parentPath ? `${parentPath}/${name}` : name
      result.push({
        remote: true,
        src,
        name,
        path,
        w: Number(item.w) || 0,
        h: Number(item.h) || 0,
      })
    }
    // 子目录条目
    if (item.folder && Array.isArray(item.items)) {
      const folderPath = parentPath ? `${parentPath}/${item.folder}` : item.folder
      const folderBase = resolveUrl(item.folder + '/', basePath)
      result.push(...flattenManifestItems(item.items, folderBase, folderPath))
    }
  }
  return result
}

export async function loadManifest(baseUrl) {
  const base = assertHttp(baseUrl)
  // 允许直接指向清单文件（以 .json 结尾）或目录 URL（读取目录下的 index.json）
  const isFile = /\.json$/i.test(base)
  // 相对路径以 .json 所在目录 / 目录 URL 为基准解析
  const dirBase = isFile ? base.replace(/[^/]+$/, '') : base
  const manifestUrl = isFile ? base : resolveUrl('index.json', dirBase)
  const res = await fetch(manifestUrl)
  if (!res.ok) throw new Error(`manifest 请求失败：${res.status}`)
  const m = await res.json()
  
  // 支持两种格式：
  // 1. 扁平格式：{ pages: [...] }
  // 2. 层级格式：{ pages: [...], folders: [{ folder: "name", items: [...] }] }
  const rawPages = Array.isArray(m.pages) ? m.pages : []
  const rawFolders = Array.isArray(m.folders) ? m.folders : []
  
  // 处理扁平页面
  const flatPages = rawPages
    .map((p) => {
      const ref = p.url || p.name
      if (!ref) return null
      const src = resolveUrl(ref, dirBase)
      const name = p.name || decodeURIComponent(src.split('/').pop() || ref)
      return {
        remote: true,
        src,
        name,
        path: name,
        w: Number(p.w) || 0,
        h: Number(p.h) || 0,
      }
    })
    .filter(Boolean)
  
  // 处理层级目录
  const folderItems = rawFolders.flatMap((f) => 
    flattenManifestItems(f.items || [], resolveUrl(f.folder + '/', dirBase), f.folder)
  )
  
  const pages = [...flatPages, ...folderItems]
  
  // 标题回退：以 .json 结尾时取清单所在目录名；否则取目录 URL 末段
  const segs = decodeURIComponent(base).split('/').filter(Boolean).map(decodeURIComponent)
  let fallbackTitle = segs[segs.length - 1] || base
  if (isFile) fallbackTitle = segs[segs.length - 2] || fallbackTitle
  const title = m.title || fallbackTitle
  return { title, pages }
}

// WebDAV 递归获取目录内容，返回带 path 的条目
async function fetchWebDavRecursive(dirUrl, basePath, parentPath = '') {
  const dir = assertHttp(dirUrl)
  const res = await fetch(dir, { method: 'PROPFIND', headers: { Depth: '1' } })
  if (!res.ok) throw new Error(`WebDAV 请求失败：${res.status}`)
  const xml = await res.text()
  const doc = new DOMParser().parseFromString(xml, 'text/xml')
  const parseErr = doc.querySelector('parsererror')
  if (parseErr) throw new Error('WebDAV 响应不是合法 XML')
  
  // 命名空间无关地收集所有 href（d:href / lp1:href 等）
  const hrefNodes = doc.getElementsByTagNameNS('*', 'href')
  const hrefs = Array.from(hrefNodes).map((e) => e.textContent.trim()).filter(Boolean)
  
  const pages = []
  const subDirs = []
  
  for (const href of hrefs) {
    const abs = resolveUrl(href, dir)
    const name = decodeURIComponent(abs.split('/').pop() || '')
    const path = parentPath ? `${parentPath}/${name}` : name
    
    // 跳过当前目录和父目录
    if (!name || name === '.' || name === '..') continue
    
    // 判断是否为目录（URL 以 / 结尾）
    const isDir = href.endsWith('/')
    
    if (isDir) {
      // 子目录，递归获取
      subDirs.push({ url: abs, path })
    } else if (isImage(name)) {
      // 图片文件
      pages.push({ remote: true, src: abs, name, path, w: 0, h: 0 })
    } else if (isJson(name)) {
      // JSON 文件（可能是弹幕）
      pages.push({ remote: true, src: abs, name, path, w: 0, h: 0 })
    }
  }
  
  // 递归处理子目录
  for (const subDir of subDirs) {
    const subPages = await fetchWebDavRecursive(subDir.url, basePath, subDir.path)
    pages.push(...subPages)
  }
  
  return pages
}

export async function loadWebDav(dirUrl) {
  const dir = assertHttp(dirUrl)
  const pages = await fetchWebDavRecursive(dir, dir)
  
  // 按路径自然排序
  pages.sort((a, b) => naturalCompare(a.path, b.path))
  
  const title = decodeURIComponent(dir.split('/').filter(Boolean).pop() || 'webdav')
  return { title, pages }
}