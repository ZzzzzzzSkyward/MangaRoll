import { ref } from 'vue'
import type { DanmakuItem, RandomSchedulerOptions } from '../types/danmaku'

type PoolSource = { readonly value: DanmakuItem[] }

const DEFAULT_OPTIONS: RandomSchedulerOptions = {
  baseRate: 0.8,
  maxRate: 2.0,
  minRate: 0.1,
  burstProbability: 0.25,
  burstCount: 2,
  burstGapMs: 80,
  idleRetryDelayMs: 500,
  idealSize: 30,
}

export function useRandomScheduler(
  pool: PoolSource,
  launchFn: () => boolean,
  options: Partial<RandomSchedulerOptions> = {}
) {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  const isRunning = ref(false)
  let timers: number[] = []
  let disposed = false

  function rate() {
    const size = pool.value.length
    const factor = Math.min(size / opts.idealSize, 1)
    return opts.minRate + (opts.maxRate - opts.minRate) * factor
  }

  function expDelayMs() {
    return -Math.log(1 - Math.random()) / Math.max(rate(), 1e-4) * 1000
  }

  function clearTimers() {
    while (timers.length) {
      const t = timers.pop()
      if (t) clearTimeout(t)
    }
  }

  function schedule(cb: () => void, ms: number) {
    if (disposed || !isRunning.value) return
    timers.push(
      window.setTimeout(() => {
        cb()
      }, Math.max(0, ms))
    )
  }

  function onLaunch() {
    if (disposed || !isRunning.value) return
    const ok = launchFn()
    if (!ok) {
      schedule(onLaunch, opts.idleRetryDelayMs)
      return
    }
    const next = expDelayMs()
    if (Math.random() < opts.burstProbability) {
      let shots = opts.burstCount
      const burstTick = () => {
        if (disposed || !isRunning.value || shots <= 0) {
          schedule(onLaunch, next)
          return
        }
        launchFn()
        shots--
        schedule(burstTick, opts.burstGapMs)
      }
      schedule(burstTick, opts.burstGapMs)
    } else {
      schedule(onLaunch, next)
    }
  }

  function start() {
    if (disposed || isRunning.value) return
    isRunning.value = true
    schedule(onLaunch, 0)
  }

  function pause() {
    isRunning.value = false
    clearTimers()
  }

  function dispose() {
    disposed = true
    pause()
  }

  return { start, pause, dispose, isRunning }
}