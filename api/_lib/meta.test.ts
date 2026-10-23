import { describe, expect, it } from 'vitest'
import {
  defaultPreview,
  isPreviewBot,
  previewFor,
  renderMetaHtml,
} from './meta'
import { parseFilm } from './tmdb'

const film = parseFilm({
  title: 'Inception',
  release_date: '2010-07-15',
  vote_average: 8.369,
  vote_count: 36000,
  poster_path: '/abc.jpg',
  overview: 'A thief who steals secrets through dreams.',
})

describe('isPreviewBot', () => {
  it.each([
    'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
    'Twitterbot/1.0',
    'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)',
    'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)',
    'WhatsApp/2.23.20.0 A',
    'TelegramBot (like TwitterBot)',
    'LinkedInBot/1.0 (compatible; Mozilla/5.0; Apache-HttpClient +http://www.linkedin.com)',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15 Applebot/0.1',
    'Mozilla/5.0 (compatible; redditbot/1.0; +http://www.reddit.com/feedback)',
  ])('matches %s', (ua) => expect(isPreviewBot(ua)).toBe(true))

  it.each([
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    '',
  ])('ignores %s', (ua) => expect(isPreviewBot(ua)).toBe(false))

  it('handles a missing user agent', () => {
    expect(isPreviewBot(null)).toBe(false)
    expect(isPreviewBot(undefined)).toBe(false)
  })
})

describe('previewFor', () => {
  it('describes a found film', () => {
    const p = previewFor(new URL('https://x.test/?film=27205'), film)
    expect(p.title).toBe('Inception (2010) on ScrollFlix')
    expect(p.description).toContain('8.4/10')
    expect(p.image).toContain('/api/og?kind=film&id=27205')
    expect(p.url).toContain('?film=27205')
  })

  it('falls back when the film is missing', () => {
    expect(previewFor(new URL('https://x.test/?film=27205'), null)).toEqual(
      defaultPreview(),
    )
  })

  it('falls back on a bad id', () => {
    for (const id of ['abc', '1;2', '', '../x']) {
      const url = new URL('https://x.test/')
      url.searchParams.set('film', id)
      expect(previewFor(url, film)).toEqual(defaultPreview())
    }
  })

  it('falls back with no film param', () => {
    expect(previewFor(new URL('https://x.test/'), film)).toEqual(
      defaultPreview(),
    )
  })
})

describe('parseFilm', () => {
  it('rejects empty data and hides unreliable ratings', () => {
    expect(parseFilm(null)).toBeNull()
    expect(parseFilm({ title: ' ' })).toBeNull()
    expect(
      parseFilm({ title: 'Obscure', vote_average: 9.5, vote_count: 2 })?.rating,
    ).toBeNull()
  })
})

describe('renderMetaHtml', () => {
  it('writes the tags and escapes everything', () => {
    const html = renderMetaHtml({
      ...defaultPreview(),
      title: '"><script>alert(1)</script>',
      description: "Tom & Jerry's <b>",
    })
    expect(html).not.toContain('<script>')
    expect(html).toContain('&quot;&gt;&lt;script&gt;')
    expect(html).toContain('Tom &amp; Jerry&#39;s &lt;b&gt;')
    expect(html).toContain('twitter:card" content="summary_large_image"')
    expect(html).toContain('rel="canonical"')
    expect(html).toContain('og:image:width" content="1200"')
  })
})
