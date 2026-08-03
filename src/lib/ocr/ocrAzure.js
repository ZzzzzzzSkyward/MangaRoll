// Azure AI Vision Read 4.0：POST read:analyze → 轮询 operation-location → 结果归一化。
// 返回分析图坐标系下的包围盒数组 [{ text, x, y, w, h, confidence }]。

export async function runAzure({ endpoint, apiKey }, blob) {
  const base = String(endpoint || '').replace(/\/+$/, '')
  const analyzeUrl = `${base}/computervision/read:analyze?language=ja&api-version=2024-02-01`
  const init = {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': apiKey,
      'Content-Type': 'application/octet-stream',
    },
    body: blob,
  }
  const res = await fetch(analyzeUrl, init)
  if (!res.ok) throw new Error(`Azure OCR 请求失败：${res.status}`)
  const opLocation = res.headers.get('operation-location')
  if (!opLocation) throw new Error('Azure OCR 缺少 operation-location')

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  for (let i = 0; i < 60; i++) {
    await sleep(1000)
    const pollRes = await fetch(opLocation, { headers: { 'Ocp-Apim-Subscription-Key': apiKey } })
    if (!pollRes.ok) continue
    const j = await pollRes.json()
    if (j.status === 'failed') throw new Error('Azure OCR 分析失败')
    if (j.status !== 'succeeded') continue
    const out = []
    const lines = j.analyzeResult?.readResults?.[0]?.lines || []
    for (const ln of lines) {
      const box = ln.boundingBox || []
      let x0 = Infinity
      let y0 = Infinity
      let x1 = -Infinity
      let y1 = -Infinity
      for (let k = 0; k + 1 < box.length; k += 2) {
        x0 = Math.min(x0, box[k])
        y0 = Math.min(y0, box[k + 1])
        x1 = Math.max(x1, box[k])
        y1 = Math.max(y1, box[k + 1])
      }
      out.push({ text: ln.text, x: x0, y: y0, w: x1 - x0, h: y1 - y0, confidence: ln.confidence || 1 })
    }
    return out
  }
  throw new Error('Azure OCR 超时')
}