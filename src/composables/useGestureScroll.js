import { reactive } from 'vue'
import { MODE_VERTICAL } from '../lib/modes'

/**
 * 横向模式的滚轮横向滚动（平板模式带惯性），以及鼠标拖拽滚动 + 惯性滑动。
 * 不依赖全局 store，通过参数注入 axis / tabletMode 读取函数。
 */
export function useGestureScroll({ scroller, axis, isTablet, getViewport }) {
  const vertical = () => axis.value === MODE_VERTICAL

  const drag = reactive({ on: false, x: 0, y: 0, sx: 0, sy: 0, moved: false })
  const wheelAnim = reactive({ target: 0, raf: 0 })
  const inertia = reactive({ on: false, velocity: 0, raf: 0 })
  // 拖拽过程中的滚动位置采样（环形缓冲），松手时用最近 ~120ms 窗口的平均速度启动惯性。
  // 只取最后一次 move 的瞬时速度会在松手前的减速停顿处归零，导致惯性完全不触发。
  const samples = []

  function onWheel(e) {
    if (vertical()) return
    let dy = e.deltaY
    if (e.deltaMode === 1) dy *= 16
    else if (e.deltaMode === 2) dy *= getViewport()
    if (!dy) return
    e.preventDefault()

    if (isTablet()) {
      wheelAnim.target += dy
      if (!wheelAnim.raf) {
        const step = () => {
          const remaining = wheelAnim.target
          if (Math.abs(remaining) < 0.5) {
            scroller.value.scrollLeft += remaining
            wheelAnim.target = 0
            wheelAnim.raf = 0
            return
          }
          const move = remaining * 0.15
          scroller.value.scrollLeft += move
          wheelAnim.target -= move
          wheelAnim.raf = requestAnimationFrame(step)
        }
        wheelAnim.raf = requestAnimationFrame(step)
      }
    } else {
      scroller.value.scrollLeft += dy
    }
  }

  function onPointerDown(e) {
    if (e.pointerType !== 'mouse' || e.button !== 0) return
    if (!(e.target instanceof HTMLElement) || !e.target.closest('.page-slot')) return

    if (inertia.on) {
      inertia.on = false
      cancelAnimationFrame(inertia.raf)
    }

    drag.on = true
    drag.moved = false
    drag.x = e.clientX
    drag.y = e.clientY
    drag.sx = scroller.value.scrollLeft
    drag.sy = scroller.value.scrollTop
    samples.length = 0
    sample()
    try {
      scroller.value.setPointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
    e.preventDefault()
  }

  // 记录当前滚动位置采样，只保留最近 ~120ms（最多 16 条）
  function sample() {
    const now = Date.now()
    samples.push([now, vertical() ? scroller.value.scrollTop : scroller.value.scrollLeft])
    while (samples.length > 2 && samples[0][0] < now - 120) samples.shift()
    while (samples.length > 16) samples.shift()
  }

  // 最近窗口内的平均滚动速度（px/ms）；采样不足或窗口内无位移返回 0
  function estimateVelocity() {
    if (samples.length < 2) return 0
    const [t0, p0] = samples[0]
    const [t1, p1] = samples[samples.length - 1]
    const dt = t1 - t0
    if (dt <= 0) return 0
    return (p1 - p0) / dt
  }

  function onPointerMove(e) {
    if (!drag.on) return
    const dx = e.clientX - drag.x
    const dy = e.clientY - drag.y
    if (!drag.moved && Math.hypot(dx, dy) < 4) return
    drag.moved = true
    scroller.value.scrollLeft = drag.sx - dx
    scroller.value.scrollTop = drag.sy - dy
    sample()
  }

  function endDrag(e) {
    if (!drag.on) return
    drag.on = false
    try {
      scroller.value.releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }

    const vel = estimateVelocity()
    samples.length = 0
    if (isTablet() && drag.moved && Math.abs(vel) > 0.05) {
      inertia.on = true
      inertia.velocity = vel
      const friction = 0.95
      const minVelocity = 0.15

      const step = () => {
        if (!inertia.on) return
        inertia.velocity *= friction
        if (Math.abs(inertia.velocity) < minVelocity) {
          inertia.on = false
          return
        }
        if (vertical()) {
          scroller.value.scrollTop += inertia.velocity * 16
        } else {
          scroller.value.scrollLeft += inertia.velocity * 16
        }
        inertia.raf = requestAnimationFrame(step)
      }
      inertia.raf = requestAnimationFrame(step)
    }
  }

  // 拖拽结束后消费掉本次位移，避免触发点击翻页
  function consumeClick() {
    const m = drag.moved
    drag.moved = false
    return m
  }

  function dispose() {
    cancelAnimationFrame(wheelAnim.raf)
    cancelAnimationFrame(inertia.raf)
  }

  return { drag, onWheel, onPointerDown, onPointerMove, endDrag, consumeClick, dispose }
}
