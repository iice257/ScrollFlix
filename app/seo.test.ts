import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { SITE_TITLE } from '../playwright-tests/site-meta'
// @ts-expect-error plain JS build script
import * as sitemap from '../scripts/generate-sitemap.js'

type Redirect = {
  source: string
  has?: { type: string; value: string }[]
  destination: string
  statusCode?: number
}

const vercel = JSON.parse(readFileSync('vercel.json', 'utf8')) as {
  redirects: Redirect[]
  rewrites: { source: string; destination: string }[]
}
const robots = readFileSync('public/robots.txt', 'utf8')
const html = readFileSync('index.html', 'utf8')

describe('vercel.json host redirects', () => {
  const hosts = ['scroll-flix.vercel.app', 'what-to-watch-brown.vercel.app']

  it('redirects exactly the two old hosts, once each', () => {
    const matched = vercel.redirects.flatMap((r) =>
      (r.has ?? []).filter((h) => h.type === 'host').map((h) => h.value),
    )
    expect(matched.sort()).toEqual([...hosts].sort())
  })

  it.each(hosts)('%s -> https://scrollflix.app with 308, path kept', (host) => {
    const rule = vercel.redirects.find((r) =>
      r.has?.some((h) => h.type === 'host' && h.value === host),
    )
    expect(rule?.statusCode).toBe(308)
    expect(rule?.destination).toBe('https://scrollflix.app/$1')
    // The captured group is the whole path; Vercel forwards the query string.
    expect(new RegExp(`^${rule?.source}$`).exec('/a/b')?.[1]).toBe('a/b')
    expect(new RegExp(`^${rule?.source}$`).exec('/')?.[1]).toBe('')
  })

  it('does not match preview deployment hosts (exact values only)', () => {
    for (const rule of vercel.redirects)
      for (const h of rule.has ?? []) {
        expect(h.value).not.toMatch(/[*()|\\^$[\]]/)
        expect(h.value).not.toBe('vercel.app')
      }
  })

  it('declares redirects, which Vercel applies before the SPA rewrite', () => {
    expect(Object.keys(vercel)).toContain('redirects')
    expect(vercel.rewrites.at(-1)?.destination).toBe('/index.html')
  })
})

describe('robots.txt', () => {
  const rules = robots
    .split('\n')
    .filter((l) => !l.trim().startsWith('#'))
    .join('\n')

  it('does not block render resources', () => {
    expect(rules).not.toMatch(/Disallow:\s*\/assets/i)
    expect(rules).not.toMatch(/Disallow:\s*\/json/i)
    expect(rules).not.toMatch(/Disallow:\s*\/media/i)
  })

  it('points at the sitemap index on the canonical host', () => {
    expect(rules).toMatch(/^Sitemap: https:\/\/scrollflix\.app\/sitemap\.xml$/m)
    expect(robots).not.toMatch(/vercel\.app/)
  })
})

describe('index.html', () => {
  const meta = (re: RegExp) => re.exec(html)?.[1] ?? ''

  it('has a 50-60 char title and 150-160 char description', () => {
    const title = meta(/<title>([^<]*)<\/title>/)
    const desc = meta(/<meta name="description" content="([^"]*)"/)
    expect(title.length).toBeGreaterThanOrEqual(50)
    expect(title.length).toBeLessThanOrEqual(60)
    expect(desc.length).toBeGreaterThanOrEqual(150)
    expect(desc.length).toBeLessThanOrEqual(160)
    for (const word of ['discover', 'mood', 'shuffle', 'trailers'])
      expect(desc).toContain(word)
  })

  it('matches the title constant used by the e2e specs', () => {
    expect(meta(/<title>([^<]*)<\/title>/)).toBe(SITE_TITLE)
  })

  it('keeps og/twitter tags consistent with title and description', () => {
    const title = meta(/<title>([^<]*)<\/title>/)
    const desc = meta(/<meta name="description" content="([^"]*)"/)
    expect(meta(/property="og:title" content="([^"]*)"/)).toBe(title)
    expect(meta(/name="twitter:title" content="([^"]*)"/)).toBe(title)
    expect(meta(/property="og:description" content="([^"]*)"/)).toBe(desc)
    expect(meta(/name="twitter:description" content="([^"]*)"/)).toBe(desc)
  })

  it('has no keywords meta and uses the new canonical host', () => {
    expect(html).not.toMatch(/name="keywords"/)
    expect(html).not.toMatch(/vercel\.app/)
    expect(meta(/rel="canonical" href="([^"]*)"/)).toBe(
      'https://scrollflix.app/',
    )
  })

  it('has valid JSON-LD with WebSite, Organization and WebApplication', () => {
    const raw = meta(
      /<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/,
    )
    const data = JSON.parse(raw)
    const types = data['@graph'].map((n: { '@type': string }) => n['@type'])
    expect(types).toEqual(['WebSite', 'Organization', 'WebApplication'])
    const org = data['@graph'][1]
    expect(org.logo.url).toMatch(/^https:\/\/scrollflix\.app\//)
    expect(org.sameAs).toEqual(['https://x.com/scrollflix'])
  })
})

describe('sitemap generation', () => {
  const baseUrl = 'https://scrollflix.app'
  const { files } = sitemap.generateSitemaps({
    baseUrl,
    pageTypes: sitemap.buildPageTypes({ lastmod: '2026-10-24' }),
  })

  it('emits an index plus one sitemap per non-empty page type', () => {
    expect(Object.keys(files).sort()).toEqual([
      'sitemap-pages.xml',
      'sitemap.xml',
    ])
    expect(files['sitemap.xml']).toContain('<sitemapindex')
    expect(files['sitemap.xml']).toContain(
      '<loc>https://scrollflix.app/sitemap-pages.xml</loc>',
    )
    expect(files['sitemap.xml']).toContain('<lastmod>2026-10-24</lastmod>')
  })

  it('lists the home page on the canonical host with the given lastmod', () => {
    expect(files['sitemap-pages.xml']).toContain(
      '<loc>https://scrollflix.app/</loc>',
    )
    expect(files['sitemap-pages.xml']).toContain(
      '<lastmod>2026-10-24</lastmod>',
    )
    expect(files['sitemap-pages.xml']).not.toMatch(/vercel\.app|2025-08-09/)
  })

  it('includes a type sitemap once it has URLs (film, lists, blog ready)', () => {
    const types = sitemap.buildPageTypes({ lastmod: '2026-10-24' })
    types
      .find((t: { name: string }) => t.name === 'film')
      .urls.push({
        loc: '/film/603-the-matrix',
        lastmod: '2026-10-25',
      })
    const out = sitemap.generateSitemaps({ baseUrl, pageTypes: types }).files
    expect(out['sitemap-film.xml']).toContain('/film/603-the-matrix')
    expect(out['sitemap.xml']).toContain('sitemap-film.xml')
  })

  it('committed public sitemaps point at the canonical host', () => {
    const idx = readFileSync('public/sitemap.xml', 'utf8')
    expect(idx).toContain('<sitemapindex')
    expect(idx).not.toMatch(/vercel\.app/)
  })
})

describe('index.html share image', () => {
  it('declares the size the default card is drawn at', async () => {
    const { OG_IMAGE_WIDTH, OG_IMAGE_HEIGHT } = await import('../api/_lib/meta')
    expect(html).toContain(
      `<meta property="og:image:width" content="${OG_IMAGE_WIDTH}" />`,
    )
    expect(html).toContain(
      `<meta property="og:image:height" content="${OG_IMAGE_HEIGHT}" />`,
    )
  })
})
