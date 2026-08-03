import { settings } from '../settings'

// OCR 配置：provider 类型（azure / generic）、endpoint、apiKey。
// 仅存 localStorage（`comicreader:settings`），失败会提示安全风险。
export const OCR_PROVIDER_TYPES = [
  { value: 'azure', label: 'Azure AI Vision Read' },
  { value: 'generic', label: '自定义 JSON 端点' },
]

export function ocrConfig() {
  return settings.ocrClient || null
}

export function setOcrConfig(cfg) {
  settings.ocrClient = cfg
}

export function ocrEnabled() {
  return settings.ocrEnabled
}

export function setOcrEnabled(on) {
  settings.ocrEnabled = !!on
}