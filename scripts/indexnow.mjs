#!/usr/bin/env node

/**
 * IndexNow submitter for ScrollFlix
 *
 * Tells Bing (and every other IndexNow engine, such as Yandex, Naver and Seznam)
 * that URLs are new or changed, so they crawl them now instead of whenever.
 * The ownership key lives at public/<key>.txt and is served from the site root.
 *
 *   npm run seo:indexnow                  submit every URL in public/sitemap.xml
 *   npm run seo:indexnow -- <url> ...     submit specific URLs
 *   npm run seo:indexnow -- --dry-run     print the request without sending it
 *
 * Docs: https://www.bing.com/indexnow/getstarted
 */

import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const siteUrl = (process.env.SITE_URL || 'https://scrollflix.app').replace(
  /\/$/,
  '',
)
const endpoint = 'https://api.indexnow.org/indexnow'

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const explicitUrls = args.filter((arg) => !arg.startsWith('--'))

function findKey() {
  const dir = resolve('public')
  const file = readdirSync(dir).find((name) => /^[0-9a-f]{8,128}\.txt$/.test(name))
  if (!file) throw new Error('No IndexNow key file found in public/ (<key>.txt)')
  const key = file.replace(/\.txt$/, '')
  if (readFileSync(resolve(dir, file), 'utf8').trim() !== key) {
    throw new Error(`public/${file} must contain exactly its own name: ${key}`)
  }
  return key
}

function locs(file) {
  const xml = readFileSync(resolve('public', file), 'utf8')
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1])
}

// public/sitemap.xml is a sitemap index; follow it to the page sitemaps.
function sitemapUrls() {
  const root = locs('sitemap.xml')
  const children = root.filter((loc) => loc.endsWith('.xml'))
  if (children.length === 0) return root
  return children.flatMap((loc) => locs(loc.split('/').pop()))
}

const key = findKey()
const urlList = explicitUrls.length > 0 ? explicitUrls : sitemapUrls()
const body = {
  host: new URL(siteUrl).host,
  key,
  keyLocation: `${siteUrl}/${key}.txt`,
  urlList,
}

console.log(`IndexNow: ${urlList.length} URL(s) for ${body.host}`)
for (const url of urlList) console.log(`  ${url}`)

if (dryRun) {
  console.log('Dry run, nothing sent.')
  process.exit(0)
}

const response = await fetch(endpoint, {
  method: 'POST',
  headers: { 'content-type': 'application/json; charset=utf-8' },
  body: JSON.stringify(body),
})

// 200 = received, 202 = received and the key is still being validated.
if (response.status === 200 || response.status === 202) {
  console.log(`IndexNow accepted the submission (HTTP ${response.status}).`)
} else {
  const meaning = {
    400: 'invalid format',
    403: 'key not valid: is the key file live at the keyLocation?',
    422: 'URLs do not belong to the host, or the key does not match',
    429: 'too many requests',
  }[response.status]
  console.error(
    `IndexNow rejected the submission: HTTP ${response.status}${meaning ? ` (${meaning})` : ''}`,
  )
  process.exit(1)
}
