export interface DanmakuItem {
  id: string | number
  text: string
  color?: string
  fontSize?: number
  weight?: string
  shadow?: string
}

export interface ActiveDanmakuItem {
  id: number
  item: DanmakuItem
  trackY: number
  textWidth: number
  done: boolean
  el: HTMLElement | null
  anim: Animation | null
}

export interface RandomSchedulerOptions {
  baseRate: number
  maxRate: number
  minRate: number
  burstProbability: number
  burstCount: number
  burstGapMs: number
  idleRetryDelayMs: number
  idealSize: number
}

export interface TrackScheduler {
  getAvailableTrack(): number | null
  lockTrack(trackIdx: number, durationMs: number): void
  resetTracks(): void
  trackCount(): number
}