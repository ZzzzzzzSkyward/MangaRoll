import { ref, onMounted, onBeforeUnmount } from 'vue'

export function useVisibilityControl(
  getElement: () => HTMLElement | null,
  onVisible: () => void,
  onHidden: () => void,
  threshold = 0.1
) {
  const isVisible = ref(false)
  let observer: IntersectionObserver | null = null
  let elementVisible = false
  let docVisible = typeof document === 'undefined' || !document.hidden

  function update() {
    const next = elementVisible && docVisible
    if (next === isVisible.value) return
    isVisible.value = next
    if (next) onVisible()
    else onHidden()
  }

  function onDocVisibility() {
    docVisible = !document.hidden
    update()
  }

  onMounted(() => {
    const el = getElement()
    if (!el) return
    document.addEventListener('visibilitychange', onDocVisibility)
    if (typeof IntersectionObserver === 'undefined') {
      elementVisible = true
      update()
      return
    }
    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          elementVisible = entry.isIntersecting && entry.intersectionRatio >= threshold
        }
        update()
      },
      { threshold }
    )
    observer.observe(el)
  })

  onBeforeUnmount(() => {
    document.removeEventListener('visibilitychange', onDocVisibility)
    observer?.disconnect()
    observer = null
  })

  return { isVisible }
}