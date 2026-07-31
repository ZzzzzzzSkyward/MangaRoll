const NICO_COLORS = {
  red: '#ff0000',
  pink: '#ff8080',
  orange: '#ffc000',
  yellow: '#ffff00',
  green: '#00ff00',
  cyan: '#00ffff',
  blue: '#0000ff',
  purple: '#c000ff',
  black: '#000000',
  white: '#ffffff',
  naka: '#ff0000',
  shita: '#0000ff',
  ue: '#00ff00',
}

function resolveMailColor(mail) {
  if (!mail) return '#ffffff'
  const parts = mail.split(/\s+/)
  for (const p of parts) {
    const lower = p.toLowerCase()
    if (lower in NICO_COLORS) return NICO_COLORS[lower]
  }
  return '#ffffff'
}

export function isNicoNicoFormat(data) {
  return Array.isArray(data) && data.some((item) => item && item.chat)
}

export function parseNicoNico(data) {
  const raw = new Map()
  for (const item of data) {
    if (!item || !item.chat) continue
    const chat = item.chat
    if (typeof chat.content !== 'string' || !chat.content) continue
    if (!Number.isFinite(chat.leaf) || chat.leaf < 1 || chat.leaf % 1 !== 0) continue
    const page = chat.leaf
    const arr = raw.get(page) || []
    arr.push({
      page,
      text: chat.content,
      color: resolveMailColor(chat.mail),
      size: 'normal',
      position: 'scroll',
    })
    raw.set(page, arr)
  }

  const INTERVAL = 100
  const byPage = new Map()
  let count = 0
  for (const [page, arr] of raw) {
    for (let i = 0; i < arr.length; i++) {
      arr[i].time = i * INTERVAL
    }
    byPage.set(page, arr)
    count += arr.length
  }
  return { byPage, count }
}
