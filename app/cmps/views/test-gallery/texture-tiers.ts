// How the globe's poster textures are laid out and how much GPU memory they
// take. Pure maths, so the budget is testable without WebGL.
//
// Three tiers, every one 2:3 and mipmapped:
//   base    one 2D atlas holding every poster (small cells, edge gutters)
//   mid     a TEXTURE_2D_ARRAY pool for the posters near the viewer
//   detail  a TEXTURE_2D_ARRAY pool for the few posters at the focus

export const MB = 1024 * 1024
export const BYTES_PER_TEXEL = 4

export type TierConfig = {
  desktop: boolean
  baseWidth: number
  baseHeight: number
  gutter: number
  baseMipLevels: number
  midWidth: number
  midHeight: number
  midMipLevels: number
  midLayers: number
  detailWidth: number
  detailHeight: number
  detailMipLevels: number
  detailLayers: number
}

// The budget the tiers are sized to (the whole poster texture memory).
export const DESKTOP_BUDGET_BYTES = 160 * MB
export const PHONE_BUDGET_BYTES = 80 * MB

// How many posters the globe lays out. Desktop is the catalogue's whole first
// chunk (2,000 films in vote order), so the rest of the catalogue arriving
// never changes the globe's films and never rebuilds it (a rebuild used to
// reset the globe to its default front, always Con Air); phones and
// lightweight devices keep fewer.
export const DESKTOP_GLOBE_COUNT = 2000
export const PHONE_GLOBE_COUNT = 1260

// Bytes of a mip chain of `levels` levels, for a w x h image.
export const mipChainBytes = (
  width: number,
  height: number,
  levels: number,
) => {
  let total = 0
  let w = width
  let h = height
  for (let level = 0; level < levels; level += 1) {
    total += w * h * BYTES_PER_TEXEL
    w = Math.max(1, w >> 1)
    h = Math.max(1, h >> 1)
  }
  return total
}

export type AtlasLayout = {
  columns: number
  rows: number
  // One cell, gutter included.
  cellWidth: number
  cellHeight: number
  width: number
  height: number
}

// Cells in a near-square grid (a 2:3 cell means about 1.5 times as many
// columns as rows would be square), shrunk by whole cells if it would not
// fit a texture of `maxTextureSize`.
export const atlasLayout = (
  itemCount: number,
  config: Pick<TierConfig, 'baseWidth' | 'baseHeight' | 'gutter'>,
  maxTextureSize = 8192,
): AtlasLayout => {
  const cellWidth = config.baseWidth + config.gutter * 2
  const cellHeight = config.baseHeight + config.gutter * 2
  const count = Math.max(1, itemCount)
  let columns = Math.max(
    1,
    Math.ceil(Math.sqrt((count * cellHeight) / cellWidth)),
  )
  // A wide layout when the tall one would exceed the texture limit.
  const maxColumns = Math.max(1, Math.floor(maxTextureSize / cellWidth))
  columns = Math.min(Math.max(columns, 1), maxColumns)
  const rows = Math.ceil(count / columns)
  return {
    columns,
    rows,
    cellWidth,
    cellHeight,
    width: columns * cellWidth,
    height: rows * cellHeight,
  }
}

export const atlasBytes = (layout: AtlasLayout, levels: number) =>
  mipChainBytes(layout.width, layout.height, levels)

export const estimateTextureBytes = (config: TierConfig, itemCount: number) => {
  const atlas = atlasLayout(itemCount, config)
  return (
    atlasBytes(atlas, config.baseMipLevels) +
    config.midLayers *
      mipChainBytes(config.midWidth, config.midHeight, config.midMipLevels) +
    config.detailLayers *
      mipChainBytes(
        config.detailWidth,
        config.detailHeight,
        config.detailMipLevels,
      )
  )
}

export type TierCaps = {
  maxTextureSize: number
  maxArrayLayers: number
}

export const tierConfig = (desktop: boolean): TierConfig =>
  desktop
    ? {
        desktop,
        baseWidth: 64,
        baseHeight: 96,
        gutter: 2,
        baseMipLevels: 4,
        midWidth: 154,
        midHeight: 231,
        midMipLevels: 3,
        midLayers: 320,
        detailWidth: 342,
        detailHeight: 513,
        detailMipLevels: 4,
        detailLayers: 24,
      }
    : {
        desktop,
        baseWidth: 48,
        baseHeight: 72,
        gutter: 2,
        baseMipLevels: 4,
        // A lighter mid tier (from TMDB's w154): phone posters are drawn at
        // most ~90 device px wide (the canvas caps DPR at 2), so a 104 px
        // layer is sharp, costs a third of a 154 px one, and leaves room for
        // more of them.
        midWidth: 104,
        midHeight: 156,
        midMipLevels: 3,
        midLayers: 160,
        detailWidth: 342,
        detailHeight: 513,
        detailMipLevels: 4,
        detailLayers: 8,
      }

// Clamps a config to what the GPU allows, then trims the mid pool (and last
// the detail pool) until the whole thing is within budget.
export const fitTierConfig = (
  config: TierConfig,
  itemCount: number,
  caps: TierCaps,
  budget = config.desktop ? DESKTOP_BUDGET_BYTES : PHONE_BUDGET_BYTES,
): TierConfig => {
  const fitted = {
    ...config,
    midLayers: Math.min(config.midLayers, caps.maxArrayLayers),
    detailLayers: Math.min(config.detailLayers, caps.maxArrayLayers),
  }
  const midLayerBytes = mipChainBytes(
    fitted.midWidth,
    fitted.midHeight,
    fitted.midMipLevels,
  )
  const detailLayerBytes = mipChainBytes(
    fitted.detailWidth,
    fitted.detailHeight,
    fitted.detailMipLevels,
  )
  const fixed = atlasBytes(
    atlasLayout(itemCount, fitted, caps.maxTextureSize),
    fitted.baseMipLevels,
  )
  let detailLayers = fitted.detailLayers
  let midLayers = fitted.midLayers
  while (
    fixed + midLayers * midLayerBytes + detailLayers * detailLayerBytes >
      budget &&
    (midLayers > 16 || detailLayers > 4)
  ) {
    if (midLayers > 16) midLayers = Math.max(16, Math.floor(midLayers * 0.9))
    else detailLayers = Math.max(4, detailLayers - 2)
  }
  return { ...fitted, midLayers, detailLayers }
}
