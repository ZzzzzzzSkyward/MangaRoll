import { reactive } from 'vue'
import { MODE_VERTICAL } from '../lib/modes'

/**
 * 横向模式的滚轮横向滚动，以及鼠标拖拽滚动。
 * 不依赖全局 store，通过参数注入 axis 读取函数。
 */
export function useGestureScroll({ scroller, axis, getViewport }) {
  const vertical = () => axis.value === MODE_VERTICAL

  const drag = reactive({ on: false, x: 0, y: 0, sx: 0, sy: 0, moved: false })

  function onWheel(e) {
    if (vertical()) return
    let dy = e.deltaY
    if (e.deltaMode === 1) dy *= 16
    else if (e.deltaMode === 2) dy *= getViewport()
    if (!dy) return
    e.preventDefault()
    scroller.value.scrollLeft += dy
  }

  function onPointerDown(e) {
    if (e.pointerType !== 'mouse' || e.button !== 0) return
    if (!(e.target instanceof HTMLElement) || !e.target.closest('.page-slot')) return

    drag.on = true
    drag.moved = false
    drag.x = e.clientX
    drag.y = e.clientY
    drag.sx = scroller.value.scrollLeft
    drag.sy = scroller.value.scrollTop
    try {
      scroller.value.setPointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
    e.preventDefault()
  }

  function onPointerMove(e) {
    if (!drag.on) return
    const dx = e.clientX - drag.x
    const dy = e.clientY - drag.y
    if (!drag.moved && Math.hypot(dx, dy) < 4) return
    drag.moved = true
    scroller.value.scrollLeft = drag.sx - dx
    scroller.value.scrollTop = drag.sy - dy
  }

  function endDrag(e) {
    if (!drag.on) return
    drag.on = false
    try {
      scroller.value.releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
  }

  // 拖拽结束后消费掉本次位移，避免触发点击翻页
  function consumeClick() {
    const m = drag.moved
    drag.moved = false
    return m
  }

  function dispose() {
  }

  return { drag, onWheel, onPointerDown, onPointerMove, endDrag, consumeClick, dispose }
}
