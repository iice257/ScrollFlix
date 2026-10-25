import { expect, test } from '@playwright/test'

test.describe('SEO foundation', () => {
  test('home HTML carries the canonical host, title and JSON-LD', async ({
    request,
  }) => {
    const response = await request.get('/')
    expect(response.status()).toBe(200)
    const html = await response.text()
    expect(html).toContain(
      '<link rel="canonical" href="https://scrollflix.app/" />',
    )
    expect(html).toContain(
      'property="og:url" content="https://scrollflix.app/"',
    )
    expect(html).toMatch(/<title>ScrollFlix: Spin a Globe of 100k\+ Movies/)
    expect(html).not.toContain('vercel.app')
    expect(html).not.toContain('name="keywords"')
    expect(html).toContain('application/ld+json')
  })

  test('robots.txt does not block /assets/ or the catalogue', async ({
    request,
  }) => {
    const robots = await (await request.get('/robots.txt')).text()
    expect(robots).not.toMatch(/^Disallow:\s*\/assets/im)
    expect(robots).not.toMatch(/^Disallow:\s*\/json/im)
    expect(robots).toMatch(
      /^Sitemap: https:\/\/scrollflix\.app\/sitemap\.xml$/m,
    )
  })

  test('sitemap index is served and lists the pages sitemap', async ({
    request,
  }) => {
    const index = await (await request.get('/sitemap.xml')).text()
    expect(index).toContain('<sitemapindex')
    expect(index).toContain('https://scrollflix.app/sitemap-pages.xml')
    const pages = await request.get('/sitemap-pages.xml')
    expect(pages.status()).toBe(200)
    expect(await pages.text()).toContain('<loc>https://scrollflix.app/</loc>')
  })
})
