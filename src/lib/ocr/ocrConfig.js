import { settings } from '../settings'

// OCR 配置：本地后端地址（默认 http://localhost:8000，见 backend/API.md）。
// 仅存 localStorage（`comicreader:settings`）。
export const OCR_DEFAULT_ENDPOINT = 'http://localhost:8000'

export function ocrEndpoint() {
  return settings.ocrEndpoint || OCR_DEFAULT_ENDPOINT
}

export function setOcrEndpoint(url) {
  settings.ocrEndpoint = url || OCR_DEFAULT_ENDPOINT
}

export function ocrEnabled() {
  return settings.ocrEnabled
}

export function setOcrEnabled(on) {
  settings.ocrEnabled = !!on
}