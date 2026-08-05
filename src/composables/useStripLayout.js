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
export function useStripLayout({ axis, scroller, pos, vp, getPages, getZoomMode, getZoom, getCrop }) {
  const zoomAnim = ref(1)

  const vertical = computed(() => axis.value === MODE_VERTICAL)
  const rightToLeft = computed(() => axis.value === MODE_RIGHT_TO_LEFT)
  const viewport = computed(() => (vertical.value ? vp.h : vp.w))

  const layout = computed(() => {
    const pages = getPages()
    const cropEnabled = !!getCrop?.()
    const z = zoomAnim.value
    const starts = new Array(pages.length)
    const sizes = new Array(pages.length)
    const cross = new Array(pages.length)
    let acc = 0
    for (let i = 0; i < pages.length; i++) {
      const p = pages[i]
      // 尺寸未知（远程页懒加载回填前）用占位比例，避免除零/NaN，加载后自动重算
      let pw = p.w > 0 ? p.w : p.h > 0 ? p.h * 100 / 141 : 100
      let ph = p.h > 0 ? p.h : p.w > 0 ? p.w * 141 / 100 : 141
      // 有效尺寸：开启裁边时扣除四边（裁剪后的页面填充槽位，阅读位置稳定）
      if (cropEnabled && p.crop) {
        const r = p.crop
        const cw = p.w - r.left - r.right
        const ch = p.h - r.top - r.bottom
        if (cw > 0 && ch > 0) {
          pw = cw
          ph = ch
        }
      }
      if (vertical.value) {
        const w = getZoomMode() === 'width' ? vp.w * z : vp.h * z * (pw / ph)
        sizes[i] = w * (ph / pw)
        cross[i] = w
      } else {
        const h = getZoomMode() === 'height' ? vp.h * z : vp.w * z * (ph / pw)
        sizes[i] = h * (pw / ph)
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

  // 当前所在页：视口中心所在页
  function pageAt(p) {
    const { starts, total } = layout.value
    const n = starts.length
    if (!n) return 0
    if (rightToLeft.value) {
      const y = total - (p + viewport.value / 2)
      const k = lowerBound(starts, y)
      return Math.min(n - 1, Math.max(0, k - 1))
    }
    const c = p + viewport.value / 2
    let i = lowerBound(starts, c)
    if (i > 0 && starts[i] > c) i -= 1
    return Math.min(n - 1, i)
  }

  // 视口边缘所在页：edge = 'top' | 'bottom' | 'left' | 'right'
  function pageAtEdge(edge) {
    const { starts, sizes, total } = layout.value
    const n = starts.length
    if (!n) return 0
    const p = pos.v
    let contentPos
    if (vertical.value) {
      contentPos = edge === 'top' ? p : p + viewport.value - 1
    } else if (rightToLeft.value) {
      contentPos = edge === 'right' ? total - p - viewport.value : total - p - 1
    } else {
      contentPos = edge === 'left' ? p : p + viewport.value - 1
    }
    contentPos = Math.max(0, Math.min(total - 1, contentPos))
    let i = lowerBound(starts, contentPos)
    if (i > 0 && starts[i] > contentPos) i -= 1
    return Math.min(n - 1, Math.max(0, i))
  }

  // 页尾位置（start + size）
  function pageEnd(i) {
    const { starts, sizes } = layout.value
    return starts[i] + sizes[i]
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

  function animateZoomTo(target, anchorFrac) {
    const el = scroller.value
    if (!el || !getPages().length || Math.abs(target - zoomAnim.value) < 0.001) return
    const start = !anim.on
    if (start) {
      anim.on = true
      // 自定义锚点（如 Ctrl+滚轮光标位置）；缺省以视口中心为锚点
      anim.anchorFrac =
        typeof anchorFrac === 'number'
          ? Math.max(0, Math.min(1, anchorFrac))
          : (pos.v + viewport.value / 2) / Math.max(1, layout.value.total)
    } else if (typeof anchorFrac === 'number') {
      // 连续缩放（如持续滚轮）时更新锚点
      anim.anchorFrac = Math.max(0, Math.min(1, anchorFrac))
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
    rightToLeft,
    viewport,
    pageStart,
    pageEnd,
    pageAtEdge,
    rangeFor,
    pageAt,
    targetFor,
    animateZoomTo,
    cancelZoom,
    isZooming,
    consumeSnap,
  }
}
