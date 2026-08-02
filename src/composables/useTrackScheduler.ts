export function useTrackScheduler(containerHeight: () => number, fontSize: number) {
  const releaseTimes: number[] = []

  function trackCount(): number {
    return Math.max(1, Math.floor(containerHeight() / fontSize) || 1)
  }

  function ensureCapacity(n: number) {
    while (releaseTimes.length < n) releaseTimes.push(0)
  }

  function getAvailableTrack(): number | null {
    const n = trackCount()
    ensureCapacity(n)
    const now = performance.now()
    const free: number[] = []
    for (let i = 0; i < n; i++) {
      if (releaseTimes[i] <= now) free.push(i)
    }
    if (!free.length) return null
    return free[Math.floor(Math.random() * free.length)]
  }

  function lockTrack(trackIdx: number, durationMs: number) {
    ensureCapacity(trackIdx + 1)
    releaseTimes[trackIdx] = performance.now() + Math.max(0, durationMs)
  }

  function resetTracks() {
    releaseTimes.length = 0
  }

  return { getAvailableTrack, lockTrack, resetTracks, trackCount }
}