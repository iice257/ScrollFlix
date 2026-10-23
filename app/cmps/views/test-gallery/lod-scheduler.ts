// Decides which posters earn a mid or detail texture layer. Pure: the engine
// measures each poster's on-screen size and calls this every so often.

export type LodPoster = {
  index: number
  key: string
  visible: boolean
  // The poster's full width in device pixels as drawn right now.
  deviceWidthPx: number
  // 0 at the screen centre, 1 at the globe rim.
  focusDistance: number
}

export type LodPlan = { mid: string[]; detail: string[] }

// Above these angular speeds (rad/s) no new detail / mid requests are made.
export const DETAIL_SPEED_MAX = 0.6
export const MID_SPEED_MAX = 2.5
// A tier is only skipped when the next one down is at least this much wider
// than the poster: no poster samples a tier more than 1.5x smaller than it
// is drawn.
export const SHARPNESS_SLACK = 1.5

export type LodInput = {
  posters: readonly LodPoster[]
  angularSpeed: number
  openedKey: string | null
  midCapacity: number
  detailCapacity: number
  // Pixel widths of the tiers below, for the "is this tier needed" rule.
  baseWidth?: number
  midWidth?: number
}

const byFocus = (a: LodPoster, b: LodPoster) =>
  a.focusDistance - b.focusDistance || a.index - b.index

export const planLod = (input: LodInput): LodPlan => {
  const baseWidth = input.baseWidth ?? 92
  const midWidth = input.midWidth ?? 185
  const midNeeded = baseWidth * SHARPNESS_SLACK
  const detailNeeded = midWidth * SHARPNESS_SLACK
  const mid: LodPoster[] = []
  const detail: LodPoster[] = []
  const fastForDetail = input.angularSpeed > DETAIL_SPEED_MAX
  const fastForMid = input.angularSpeed > MID_SPEED_MAX

  for (const poster of input.posters) {
    if (!poster.visible) continue
    if (!fastForMid && poster.deviceWidthPx > midNeeded) mid.push(poster)
    if (
      !fastForDetail &&
      poster.deviceWidthPx > detailNeeded &&
      poster.key !== input.openedKey
    )
      detail.push(poster)
  }
  mid.sort(byFocus)
  detail.sort(byFocus)

  const detailKeys: string[] = []
  const opened = input.openedKey
  if (opened !== null && input.detailCapacity > 0) detailKeys.push(opened)
  for (const poster of detail) {
    if (detailKeys.length >= input.detailCapacity) break
    detailKeys.push(poster.key)
  }

  // Whatever has a detail layer needs no mid layer, but the poster keeps
  // its mid layer as the step below while detail loads.
  const midKeys: string[] = []
  for (const poster of mid) {
    if (midKeys.length >= input.midCapacity) break
    midKeys.push(poster.key)
  }
  return { mid: midKeys, detail: detailKeys }
}
