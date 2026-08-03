import { isImage, naturalCompare } from './importer'

// 远程来源统一输出页面条目：{ remote: true, src, name, w?, h? }，
// 走「URL 直读」路径（不创建 blob URL），依赖对方服务开启 CORS。

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

export async function loadManifest(baseUrl) {
  const base = assertHttp(baseUrl)
  const manifestUrl = resolveUrl('index.json', base)
  const res = await fetch(manifestUrl)
  if (!res.ok) throw new Error(`manifest 请求失败：${res.status}`)
  const m = await res.json()
  const rawPages = Array.isArray(m.pages) ? m.pages : []
  const pages = rawPages
    .map((p) => {
      const ref = p.url || p.name
      if (!ref) return null
      const src = resolveUrl(ref, base)
      return {
        remote: true,
        src,
        name: p.name || decodeURIComponent(src.split('/').pop() || ref),
        w: Number(p.w) || 0,
        h: Number(p.h) || 0,
      }
    })
    .filter(Boolean)
  const title = m.title || decodeURIComponent(base.split('/').filter(Boolean).pop() || base)
  return { title, pages }
}

export async function loadWebDav(dirUrl) {
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
  for (const href of hrefs) {
    const abs = resolveUrl(href, dir)
    const name = decodeURIComponent(abs.split('/').pop() || '')
    if (!isImage(name)) continue
    pages.push({ remote: true, src: abs, name, w: 0, h: 0 })
  }
  pages.sort((a, b) => naturalCompare(a.name, b.name))
  const title = decodeURIComponent(dir.split('/').filter(Boolean).pop() || 'webdav')
  return { title, pages }
}