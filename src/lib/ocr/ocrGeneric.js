// 自定义 JSON 端点：POST 分析图，期望返回 [{ text, x, y, w, h }]（或含 lines 字段的小节结构）。
// 坐标以分析图坐标系为准，由 ocrClient 归一化到 0~1。
export async function runGeneric(entry, blob, width, height) {
  const res = await fetch(entry.endpoint, {
    method: 'POST',
    headers: entry.apiKey ? { Authorization: entry.apiKey } : {},
    body: blob,
  })
  if (!res.ok) throw new Error(`自定义 OCR 请求失败：${res.status}`)
  let data
  try {
    data = await res.json()
  } catch {
    throw new Error('自定义 OCR 返回非 JSON')
  }
  const items = Array.isArray(data) ? data : data.items || data.lines || data.boxes || data.ocr || data.results || []
  return items
    .filter((it) => it && it.text)
    .map((it) => ({
      text: String(it.text),
      x: Number(it.x ?? it.left ?? 0),
      y: Number(it.y ?? it.top ?? 0),
      w: Number(it.w ?? it.width ?? 0),
      h: Number(it.h ?? it.height ?? 0),
      confidence: Number(it.confidence ?? it.score ?? 1),
    }))
    .filter((it) => it.w > 0 && it.h > 0)
}