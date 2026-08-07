import { ref } from 'vue'
import { showToast } from './store'

export const updateReady = ref(false)
export const offlineReady = ref(false)

let registration = null
let applying = false

function onNeedRefresh() {
  updateReady.value = true
}

function trackInstalling(worker) {
  worker.addEventListener('statechange', () => {
    if (worker.state === 'installed' && navigator.serviceWorker.controller) {
      onNeedRefresh()
    }
  })
}

export function applyUpdate() {
  if (applying) return
  applying = true
  if (registration && registration.waiting) {
    registration.waiting.postMessage({ type: 'SKIP_WAITING' })
  } else {
    window.location.reload()
  }
}

export function dismissUpdate() {
  updateReady.value = false
}

export function initPWA() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return

  const firstControl = () => {
    offlineReady.value = true
    showToast('已缓存，可离线使用')
  }

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (applying) {
      window.location.reload()
    } else if (!offlineReady.value && navigator.serviceWorker.controller) {
      firstControl()
    }
  })

  window.addEventListener('load', async () => {
    try {
      registration = await navigator.serviceWorker.register('sw.js')
    } catch (e) {
      console.error('Service worker registration failed:', e)
      return
    }

    if (navigator.serviceWorker.controller) {
      offlineReady.value = true
      showToast('已缓存，可离线使用')
      return
    }

    if (registration.waiting) {
      onNeedRefresh()
    } else if (registration.installing) {
      trackInstalling(registration.installing)
    } else {
      registration.addEventListener('updatefound', () => {
        trackInstalling(registration.installing)
      })
    }

    if (navigator.storage && navigator.storage.persist) {
      navigator.storage.persist().catch(() => {})
    }
  })
}