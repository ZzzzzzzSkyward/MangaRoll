#!/usr/bin/env node
// 使用大模型（deepseek-v4-flash）将日语弹幕批量翻译为本地化的简体中文，输出通用弹幕格式（spec_danmaku.json）。
// 针对弹幕特性设计的流程：
//   1. 缓存去重：相同原文只翻译一次，缓存写入 <输出>.cache.json（中断时可续译，运行结束即删除）
//   2. 批量请求：多条弹幕合并为一次模型调用，显著减少请求数与开销
//   3. 智能跳过：纯表情 / 颜文字 / 网址 / 「wwww」等无需调用模型，直译映射
//   4. 本地化提示：模型按中文网络语境意译（梗 / 语气 / 口语化），保留表情、专名与强调语气
//   5. 并发与重试：多批并发（默认 4）、指数退避重试，单批失败不影响整体输出
// 用法：DEEPSEEK_API_KEY=sk-xxx node translate_danmaku.js <输入.json> [输出.json]
// 环境变量：DEEPSEEK_API_KEY（必填）、DEEPSEEK_BASE_URL（默认 https://api.deepseek.com）、
//           DANMAKU_BATCH（每批条数，默认 30）、DANMAKU_CONCURRENCY（并发批数，默认 4）
// 注意：需要 Node.js >= 18（使用原生 fetch）。

import fs from 'node:fs'
import path from 'node:path'

const MODEL = 'deepseek-v4-flash'
const API_URL = (process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/+$/, '') + '/chat/completions'
const BATCH_SIZE = Math.max(1, Number(process.env.DANMAKU_BATCH || 30))
const CONCURRENCY = Math.max(1, Number(process.env.DANMAKU_CONCURRENCY || 4))
const MAX_RETRY = 10
const REQUEST_TIMEOUT_MS = 90_000
const JSON_MODE = process.env.DANMAKU_JSON_MODE !== '0'

// 表情符号 / 装饰符号范围（用于判定是否需要翻译）
const EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/gu

const SYSTEM_PROMPT = `你是一位精通日语与中文的弹幕本地化翻译专家，负责把日语弹幕翻译成贴合中文互联网语境、简洁传神的简体中文。

翻译要求：
1. 弹幕是极短的口语碎片，翻译必须简洁、口语化、有网感，优先意译，禁止书面语、翻译腔和逐字直译。
2. 日式网络用语与梗应本地化为对应的中文表达：例如「草」「wwww」→「哈哈哈/笑死」、「尊い」→「好尊/太顶了」、「ぴえん」→「呜呜呜/委屈」、「かわいい」→「好可爱/卡哇伊」、「おつかれ」→「辛苦啦」等；没有现成对应时给出最自然的中文表达。
3. 表情符号、颜文字、数字、专有名词（人物名、作品名等）一律原样保留；为表示强调而重复的字符，在中文中同样重复以保留语气。
4. 仅翻译内容本身，不添加解释、备注或吐槽；每条译文长度与原文相当或更短。
5. 输出必须是合法的 JSON，且只输出 JSON，不含任何其他文字。`

function buildUserPrompt(texts) {
  const lines = texts.map((t, i) => `${i + 1}. ${t}`).join('\n')
  return (
    `请将下面 ${texts.length} 条日语弹幕逐条翻译为本地化的简体中文，` +
    `严格输出 JSON 对象：{"translations": ["译文1", "译文2", ...]}，` +
    `数组长度必须等于 ${texts.length}，与下方编号一一对应，不要合并、省略或重排任何条目，不要输出任何其他内容。\n\n` +
    lines
  )
}

// 剔除表情与符号后仍含日文假名或汉字才值得调用模型
function needsTranslation(text) {
  if (!text || !text.trim()) return false
  if (/^https?:\/\/\S+$/i.test(text.trim())) return false
  const meaningful = text.replace(EMOJI_RE, '').replace(/[^\p{L}\p{N}]/gu, '')
  return /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uff66-\uff9f]/.test(meaningful)
}

// 纯罗马字「wwww」等弹幕直译映射，避免浪费模型调用
function matchPredefined(text) {
  const m = /^w{2,}$/i.exec(text.trim())
  if (m) return '哈'.repeat(m[0].length)
  return null
}

function parseTranslations(content, expected) {
  if (typeof content !== 'string' || !content) return null
  let obj = null
  try {
    obj = JSON.parse(content)
  } catch {
    const start = content.indexOf('{')
    const end = content.lastIndexOf('}')
    if (start !== -1 && end > start) {
      try {
        obj = JSON.parse(content.slice(start, end + 1))
      } catch {
        obj = null
      }
    }
  }
  let list = obj && Array.isArray(obj.translations) ? obj.translations : null
  if (!list && Array.isArray(obj)) list = obj
  if (!list) return null
  const out = []
  let missing = 0
  for (let i = 0; i < expected; i++) {
    const v = list[i]
    if (typeof v === 'string' && v.trim()) out.push(v.trim())
    else {
      out.push(null)
      missing++
    }
  }
  return { list: out, missing }
}

async function callModel(userPrompt) {
  const body = {
    model: MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.3,
    max_tokens: 4096,
    stream: false,
  }
  if (JSON_MODE) body.response_format = { type: 'json_object' }
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  if (!res.ok) {
    let detail = ''
    try {
      detail = (await res.text()).slice(0, 200)
    } catch {
      detail = ''
    }
    throw new Error(`HTTP ${res.status}${detail ? '：' + detail : ''}`)
  }
  const data = await res.json()
  const content = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content
  if (!content) throw new Error('模型返回为空')
  return content
}

async function translateBatch(texts) {
  const userPrompt = buildUserPrompt(texts)
  let lastError = null
  for (let attempt = 1; attempt <= MAX_RETRY; attempt++) {
    if (attempt > 1) await sleep(1000 * 2 ** (attempt - 2) + Math.floor(Math.random() * 500))
    try {
      const content = await callModel(userPrompt)
      const parsed = parseTranslations(content, texts.length)
      if (!parsed) throw new Error('无法解析模型输出（期望 JSON 数组）')
      if (parsed.missing > 0) throw new Error(`模型输出缺少 ${parsed.missing} 条译文`)
      return new Map(texts.map((t, i) => [t, parsed.list[i]]))
    } catch (err) {
      lastError = err
      console.error(`  批次重试（${attempt}/${MAX_RETRY}）：${err.message}`)
    }
  }
  console.error(`  批次最终失败：${lastError.message}`)
  return null
}

function loadInput(input) {
  const data = JSON.parse(fs.readFileSync(input, 'utf8'))
  if (!data || typeof data !== 'object' || !Array.isArray(data.danmaku)) {
    throw new Error(`输入文件不是有效的通用弹幕格式：${input}`)
  }
  const items = []
  let skipped = 0
  for (const raw of data.danmaku) {
    if (!raw || typeof raw !== 'object') {
      skipped++
      continue
    }
    if (!Number.isInteger(raw.page) || raw.page < 1) {
      skipped++
      continue
    }
    if (typeof raw.text !== 'string' || !raw.text) {
      skipped++
      continue
    }
    items.push({ ...raw, text: raw.text })
  }
  return { data, items, skipped }
}

function loadCache(cachePath) {
  const cache = new Map()
  if (!fs.existsSync(cachePath)) return cache
  try {
    const data = JSON.parse(fs.readFileSync(cachePath, 'utf8'))
    if (data && typeof data === 'object' && data.entries && typeof data.entries === 'object') {
      for (const [key, value] of Object.entries(data.entries)) {
        if (key && typeof value === 'string' && value) cache.set(key, value)
      }
    }
  } catch (err) {
    console.error(`警告：缓存文件损坏，已忽略（${err.message}）`)
  }
  return cache
}

function chunk(list, size) {
  const out = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function mapLimit(list, limit, fn) {
  const results = new Array(list.length)
  let next = 0
  const worker = async () => {
    while (next < list.length) {
      const i = next++
      results[i] = await fn(list[i], i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, list.length) }, worker))
  return results
}

async function main() {
  const [input, output] = process.argv.slice(2)
  if (!input) {
    console.error('用法：DEEPSEEK_API_KEY=sk-xxx node translate_danmaku.js <输入.json> [输出.json]')
    console.error('环境变量：DEEPSEEK_API_KEY（必填）、DEEPSEEK_BASE_URL（默认 https://api.deepseek.com）、DANMAKU_BATCH（每批条数，默认 30）、DANMAKU_CONCURRENCY（并发批数，默认 4）')
    process.exit(1)
  }
  if (!process.env.DEEPSEEK_API_KEY) {
    console.error('错误：缺少环境变量 DEEPSEEK_API_KEY（DeepSeek API 密钥）')
    process.exit(1)
  }
  const outPath = output || path.join(path.dirname(input), path.basename(input, '.json') + '.translated.json')
  const cachePath = outPath + '.cache.json'

  const { data, items, skipped } = loadInput(input)
  const cache = loadCache(cachePath)

  const stats = { cached: 0, predefined: 0, skipped: 0, translated: 0, failed: 0 }
  const plan = new Map()

  for (const item of items) {
    const text = item.text
    if (plan.has(text)) continue
    if (cache.has(text)) {
      plan.set(text, { value: cache.get(text) })
      stats.cached++
      continue
    }
    const predefined = matchPredefined(text)
    if (predefined !== null) {
      plan.set(text, { value: predefined })
      stats.predefined++
      continue
    }
    if (!needsTranslation(text)) {
      plan.set(text, { value: text })
      stats.skipped++
      continue
    }
    plan.set(text, { value: null })
  }

  const pending = [...plan].filter(([, p]) => p.value === null).map(([text]) => text)
  const batches = chunk(pending, BATCH_SIZE)

  if (batches.length > 0) {
    console.error(`待翻译 ${pending.length} 条（${batches.length} 批，每批最多 ${BATCH_SIZE} 条）`)
    let batchDone = 0
    await mapLimit(batches, CONCURRENCY, async (batch) => {
      const result = await translateBatch(batch)
      for (const text of batch) {
        if (result && result.has(text)) {
          plan.get(text).value = result.get(text)
          stats.translated++
        } else {
          plan.get(text).value = text
          stats.failed++
        }
      }
      batchDone++
      console.error(`翻译进度：${batchDone}/${batches.length} 批（累计成功 ${stats.translated} 条）`)
    })
  }

  const mergedCache = new Map(cache)
  for (const [text, entry] of plan) {
    if (entry.value !== text) mergedCache.set(text, entry.value)
  }

  const out = {
    ...(data.format !== undefined ? { format: data.format } : {}),
    ...(data.version !== undefined ? { version: data.version } : {}),
    meta: {
      ...(data.meta && typeof data.meta === 'object' ? data.meta : {}),
      generator: `translate_danmaku.js (${MODEL})`,
      generatedAt: new Date().toISOString(),
    },
    danmaku: items.map((item) => ({ ...item, text: plan.get(item.text)?.value ?? item.text })),
  }

  fs.writeFileSync(outPath, JSON.stringify(out) + '\n')
  fs.writeFileSync(cachePath, JSON.stringify({ version: 1, model: MODEL, entries: Object.fromEntries(mergedCache) }) + '\n')
  fs.rmSync(cachePath, { force: true })

  console.error(`已输出 ${items.length} 条弹幕 → ${outPath}`)
  console.error(
    `统计：新译 ${stats.translated} · 缓存复用 ${stats.cached} · 直译 ${stats.predefined} · 免译跳过 ${stats.skipped} · 失败 ${stats.failed}` +
      (skipped ? `（另跳过 ${skipped} 条无效条目）` : '')
  )
  if (stats.failed > 0) process.exitCode = 1
}

await main()
