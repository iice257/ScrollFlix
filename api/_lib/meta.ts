import type { Film } from './tmdb.js'

export const SITE = 'https://scrollflix.app'

// Link-preview fetchers. Googlebot is left out on purpose: it should see the
// app, not the stub. iMessage unfurls with the Facebook and Twitter tokens,
// so it matches below.
const BOTS =
  /facebookexternalhit|facebot|twitterbot|slackbot|slack-imgproxy|whatsapp|telegrambot|discordbot|linkedinbot|pinterest|redditbot|embedly|skypeuripreview|applebot|vkshare/i

export const isPreviewBot = (ua: string | null | undefined) =>
  !!ua && BOTS.test(ua)

export type Preview = {
  title: string
  description: string
  image: string
  imageAlt: string
  url: string
}

const DEFAULT_TITLE = 'ScrollFlix - Interactive Movie Discovery'
const DEFAULT_DESCRIPTION =
  'Spin a globe of 100k+ films. Open any poster, filter by mood, and find what to watch tonight.'

export const defaultPreview = (origin = SITE): Preview => ({
  title: DEFAULT_TITLE,
  description: DEFAULT_DESCRIPTION,
  image: `${origin}/api/og?kind=default`,
  imageAlt: 'ScrollFlix: a globe of film posters',
  url: `${origin}/`,
})

const clip = (text: string, max: number) =>
  text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`

// The id a shared film link carries: the bare TMDB id.
export const filmIdFromUrl = (url: URL) => {
  const id = url.searchParams.get('film')
  return id && /^\d{1,9}$/.test(id) ? id : null
}

export const previewFor = (url: URL, film: Film | null): Preview => {
  const id = filmIdFromUrl(url)
  const origin = url.origin
  if (!id || !film) return defaultPreview(origin)
  const facts = [film.year, film.rating ? `${film.rating.toFixed(1)}/10` : '']
    .filter(Boolean)
    .join(' · ')
  return {
    title: `${film.title}${film.year ? ` (${film.year})` : ''} on ScrollFlix`,
    description: clip(
      [facts, film.overview].filter(Boolean).join(' - ') || DEFAULT_DESCRIPTION,
      200,
    ),
    image: `${origin}/api/og?kind=film&id=${id}`,
    imageAlt: `${film.title} poster on ScrollFlix`,
    url: `${origin}/?film=${id}`,
  }
}

const esc = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

export const renderMetaHtml = (p: Preview) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${esc(p.title)}</title>
<meta name="description" content="${esc(p.description)}">
<link rel="canonical" href="${esc(p.url)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="ScrollFlix">
<meta property="og:title" content="${esc(p.title)}">
<meta property="og:description" content="${esc(p.description)}">
<meta property="og:url" content="${esc(p.url)}">
<meta property="og:image" content="${esc(p.image)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(p.imageAlt)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:site" content="@scrollflix">
<meta name="twitter:title" content="${esc(p.title)}">
<meta name="twitter:description" content="${esc(p.description)}">
<meta name="twitter:image" content="${esc(p.image)}">
<meta name="twitter:image:alt" content="${esc(p.imageAlt)}">
</head>
<body>
<h1>${esc(p.title)}</h1>
<p>${esc(p.description)}</p>
<p><a href="${esc(p.url)}">Open in ScrollFlix</a></p>
</body>
</html>
`
