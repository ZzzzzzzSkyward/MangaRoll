// 本地后端（见 backend/API.md）：POST /detect?ocr=true → 文本区域检测 + manga-ocr 日文识别。
// 返回原图像素坐标的包围盒数组 [{ text, x, y, w, h, confidence }]，由 ocrClient 归一化到 0~1。
export async function runLocal(endpoint, blob) {
  const base = String(endpoint || '').replace(/\/+$/, '')
  const form = new FormData()
  form.append('file', blob, 'page.jpg')
  const res = await fetch(`${base}/detect?ocr=true&merge=true`, {
    method: 'POST',
    body: form,
  })
  if (!res.ok) throw new Error(`本地 OCR 请求失败：${res.status}`)
  let data
  try {
    data = await res.json()
  } catch {
    throw new Error('本地 OCR 返回非 JSON')
  }
  if (!data || data.success !== true) throw new Error('本地 OCR 处理失败')
  if (!data.ocr_enabled) throw new Error('服务端 OCR 未启用（模型缺失或依赖未安装）')
  return (data.detections || [])
    .filter((d) => d && d.bbox && d.text && String(d.text).trim())
    .map((d) => ({
      text: String(d.text),
      x: Number(d.bbox.x1 ?? 0),
      y: Number(d.bbox.y1 ?? 0),
      w: Number((d.bbox.x2 ?? 0) - (d.bbox.x1 ?? 0)),
      h: Number((d.bbox.y2 ?? 0) - (d.bbox.y1 ?? 0)),
      confidence: Number(d.confidence ?? 1),
    }))
    .filter((it) => it.w > 0 && it.h > 0)
}