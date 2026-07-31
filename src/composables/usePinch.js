import { reactive } from 'vue'

/**
 * 平板模式双指捏合缩放。缩放上下限由 store 的 setZoomValue 统一约束。
 */
export function usePinch({ isTablet, getZoom, setZoom }) {
  const pinch = reactive({ on: false, startDist: 0, startZoom: 1 })

  function onTouchStart(e) {
    if (!isTablet()) return
    if (e.touches.length === 2) {
      e.preventDefault()
      const dx = e.touches[0].clientX - e.touches[1].clientX
      const dy = e.touches[0].clientY - e.touches[1].clientY
      pinch.on = true
      pinch.startDist = Math.hypot(dx, dy)
      pinch.startZoom = getZoom()
    }
  }

  function onTouchMove(e) {
    if (!pinch.on || e.touches.length !== 2) return
    e.preventDefault()
    const dx = e.touches[0].clientX - e.touches[1].clientX
    const dy = e.touches[0].clientY - e.touches[1].clientY
    const dist = Math.hypot(dx, dy)
    setZoom(pinch.startZoom * (dist / pinch.startDist))
  }

  function onTouchEnd(e) {
    if (pinch.on && e.touches.length < 2) {
      pinch.on = false
    }
  }

  return { onTouchStart, onTouchMove, onTouchEnd }
}
