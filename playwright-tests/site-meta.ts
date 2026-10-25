// Single source for page-title assertions: keep in sync with index.html
// (app/seo.test.ts checks that they match).
export const SITE_TITLE =
  "ScrollFlix: Spin a Globe of 100k+ Movies for Tonight's Pick"

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** The tab title animates trailing dots ("Title", "Title.", ...). */
export const SITE_TITLE_PATTERN = new RegExp(
  `^${escapeRegExp(SITE_TITLE)}\\.{0,3}$`,
)
