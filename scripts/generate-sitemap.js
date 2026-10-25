#!/usr/bin/env node

/**
 * Sitemap generator for ScrollFlix. Runs as part of `npm run build`.
 *
 * Writes a sitemap index (public/sitemap.xml) that points at one sitemap per
 * page type (public/sitemap-<type>.xml). Only the home page exists today;
 * `film`, `lists` and `blog` are listed so the structure is ready, and a type
 * with no URLs is simply not written or linked (an empty sitemap would only
 * add noise in Search Console).
 */

import { execFileSync } from 'node:child_process'
import { mkdirSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const DEFAULT_BASE_URL = 'https://scrollflix.app'

const today = () => new Date().toISOString().slice(0, 10)

/** Date (YYYY-MM-DD) of the last commit touching the given paths, else today. */
export const lastCommitDate = (paths) => {
  try {
    const out = execFileSync(
      'git',
      ['log', '-1', '--format=%cs', '--', ...paths],
      {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      },
    ).trim()
    return /^\d{4}-\d{2}-\d{2}$/.test(out) ? out : today()
  } catch {
    return today()
  }
}

/**
 * Page types, in index order. `urls` is a list of
 * { loc, lastmod, changefreq?, priority? } with `loc` a path.
 */
export const buildPageTypes = ({ lastmod }) => [
  {
    name: 'pages',
    urls: [{ loc: '/', lastmod, changefreq: 'weekly', priority: '1.0' }],
  },
  { name: 'film', urls: [] },
  { name: 'lists', urls: [] },
  { name: 'blog', urls: [] },
]

const esc = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

export const renderUrlset = (baseUrl, urls) => {
  const entries = urls
    .map((url) => {
      const lines = [`    <loc>${esc(baseUrl + url.loc)}</loc>`]
      if (url.lastmod) lines.push(`    <lastmod>${url.lastmod}</lastmod>`)
      if (url.changefreq)
        lines.push(`    <changefreq>${url.changefreq}</changefreq>`)
      if (url.priority) lines.push(`    <priority>${url.priority}</priority>`)
      return `  <url>\n${lines.join('\n')}\n  </url>`
    })
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`
}

export const renderIndex = (baseUrl, sitemaps) => {
  const entries = sitemaps
    .map(
      (entry) =>
        `  <sitemap>\n    <loc>${esc(`${baseUrl}/sitemap-${entry.name}.xml`)}</loc>\n    <lastmod>${entry.lastmod}</lastmod>\n  </sitemap>`,
    )
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</sitemapindex>\n`
}

/** Returns { files: { [filename]: xml } } for the given page types. */
export const generateSitemaps = ({ baseUrl, pageTypes }) => {
  const files = {}
  const index = []
  for (const type of pageTypes) {
    if (type.urls.length === 0) continue
    const file = `sitemap-${type.name}.xml`
    files[file] = renderUrlset(baseUrl, type.urls)
    const newest = type.urls
      .map((url) => url.lastmod)
      .sort()
      .at(-1)
    index.push({ name: type.name, lastmod: newest })
  }
  files['sitemap.xml'] = renderIndex(baseUrl, index)
  return { files }
}

const main = () => {
  const baseUrl = (process.env.SITE_URL || DEFAULT_BASE_URL).replace(/\/$/, '')
  const outDir = resolve('public')
  // Home page content lives in the app, index.html and the public assets.
  const lastmod = lastCommitDate(['app', 'index.html', 'public'])
  const { files } = generateSitemaps({
    baseUrl,
    pageTypes: buildPageTypes({ lastmod }),
  })
  mkdirSync(outDir, { recursive: true })
  for (const name of readdirSync(outDir)) {
    if (/^sitemap-.+\.xml$/.test(name) && !(name in files))
      unlinkSync(resolve(outDir, name))
  }
  for (const [name, xml] of Object.entries(files))
    writeFileSync(resolve(outDir, name), xml, 'utf8')
  console.log(`Sitemaps written to ${outDir}: ${Object.keys(files).join(', ')}`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main()
