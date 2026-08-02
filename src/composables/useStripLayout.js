import { ref, computed } from 'vue'
import { MODE_VERTICAL, MODE_RIGHT_TO_LEFT } from '../lib/modes'

function lowerBound(arr, x) {
  let lo = 0
  let hi = arr.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (arr[mid] < x) lo = mid + 1
    else hi = mid
  }
  return lo
}

/**
 * 条带布局：正向前缀和 + 缩放动画。
 * 右左模式是正向前缀和的镜像，方向相关的换算（pageStart / rangeFor / pageAt / targetFor）集中在此处。
 */
export function useStripLayout({ axis, scroller, pos, vp, getPages, getZoomMode, getZoom }) {
  const zoomAnim = ref(1)

  const vertical = computed(() => axis.value === MODE_VERTICAL)
  const rightToLeft = computed(() => axis.value === MODE_RIGHT_TO_LEFT)
  const viewport = computed(() => (vertical.value ? vp.h : vp.w))

  const layout = computed(() => {
    const pages = getPages()
    const z = zoomAnim.value
    const starts = new Array(pages.length)
    const sizes = new Array(pages.length)
    const cross = new Array(pages.length)
    let acc = 0
    for (let i = 0; i < pages.length; i++) {
      const p = pages[i]
      if (vertical.value) {
        const w = getZoomMode() === 'width' ? vp.w * z : vp.h * z * (p.w / p.h)
        sizes[i] = w * (p.h / p.w)
        cross[i] = w
      } else {
        const h = getZoomMode() === 'height' ? vp.h * z : vp.w * z * (p.h / p.w)
        sizes[i] = h * (p.w / p.h)
        cross[i] = h
      }
      starts[i] = acc
      acc += sizes[i]
    }
    return { starts, sizes, cross, total: acc }
  })

  function pageStart(i) {
    if (!rightToLeft.value) return layout.value.starts[i]
    return layout.value.total - layout.value.starts[i] - layout.value.sizes[i]
  }

  // 与 [pos, pos + viewport] 相交的页索引区间 [from, to)，升序。
  // LTR：换算到内容坐标直接二分；RTL 是内容镜像，先把视口区间镜像到内容坐标系再二分。
  function rangeFor(p, buf) {
    const { starts, total } = layout.value
    const n = starts.length
    if (!n) return { from: 0, to: 0 }
    const lo = p - buf
    const hi = p + viewport.value + buf
    if (rightToLeft.value) {
      // 内容坐标 x 对应滚动位置 total - x，因此镜像区间为 [total - hi, total - lo]
      const x = total - hi
      const k = lowerBound(starts, x)
      const from = k >= n ? n - 1 : starts[k] === x ? k : Math.max(0, k - 1)
      const to = lowerBound(starts, total - lo)
      return { from, to }
    }
    const k = lowerBound(starts, lo)
    const from = k >= n ? n - 1 : starts[k] === lo ? k : Math.max(0, k - 1)
    const to = lowerBound(starts, hi)
    return { from, to }
  }

  // 当前所在页：LTR 为视口中心所在页，RTL 为右缘所在页
  function pageAt(p) {
    const { starts, total } = layout.value
    const n = starts.length
    if (!n) return 0
    if (rightToLeft.value) {
      const k = lowerBound(starts, total - (p + viewport.value))
      return Math.max(0, k - 1)
    }
    const c = p + viewport.value / 2
    let i = lowerBound(starts, c)
    if (i > 0 && starts[i] > c) i -= 1
    return Math.min(n - 1, i)
  }

  // 翻页时目标滚动位置：RTL 需滚动到内容右缘对应位置（scrollLeft 最大值方向）
  function targetFor(i) {
    const { starts, total } = layout.value
    if (!starts.length) return 0
    const t = Math.max(0, Math.min(starts.length - 1, i))
    if (!rightToLeft.value) return starts[t]
    return Math.max(0, total - starts[t] - viewport.value)
  }

  // ---- 缩放动画：以视口中心为锚点，rAF 驱动 ----
  const anim = { raf: 0, on: false, anchorFrac: 0, lastSet: null }
  let snapPending = false

  function animateZoomTo(target) {
    const el = scroller.value
    if (!el || !getPages().length || Math.abs(target - zoomAnim.value) < 0.001) return
    if (!anim.on) {
      anim.on = true
      anim.anchorFrac = (pos.v + viewport.value / 2) / Math.max(1, layout.value.total)
    }
    if (anim.raf) cancelAnimationFrame(anim.raf)
    anim.lastSet = null
    const step = () => {
      anim.raf = 0
      const d = target - zoomAnim.value
      if (Math.abs(d) < 0.001) {
        zoomAnim.value = target
        anim.on = false
        snapPending = true
        anim.lastSet = null
        return
      }
      zoomAnim.value += d * 0.25
      const total = layout.value.total
      if (total > 0) {
        const cur = vertical.value ? el.scrollTop : el.scrollLeft
        if (anim.lastSet !== null && Math.abs(cur - anim.lastSet) > 1) {
          anim.anchorFrac = (cur + viewport.value / 2) / total
        }
        const targetPos = anim.anchorFrac * total - viewport.value / 2
        if (vertical.value) el.scrollTop = targetPos
        else el.scrollLeft = targetPos
        anim.lastSet = targetPos
      }
      anim.raf = requestAnimationFrame(step)
    }
    anim.raf = requestAnimationFrame(step)
  }

  function cancelZoom() {
    if (anim.raf) cancelAnimationFrame(anim.raf)
    anim.raf = 0
    anim.on = false
    snapPending = false
    anim.lastSet = null
    zoomAnim.value = getZoom()
  }

  function isZooming() {
    return anim.on
  }

  // 缩放动画结束时标记：下一次布局刷新不再吸附回页首
  function consumeSnap() {
    const v = snapPending
    snapPending = false
    return v
  }

  return {
    zoomAnim,
    layout,
    vertical,
    viewport,
    pageStart,
    rangeFor,
    pageAt,
    targetFor,
    animateZoomTo,
    cancelZoom,
    isZooming,
    consumeSnap,
  }
}
