#!/usr/bin/env node

/**
 * Sitemap Generator for ScrollFlix
 *
 * This script generates a sitemap.xml for the movie discovery application.
 * Since this is primarily a SPA with dynamic content, the sitemap focuses
 * on the main application interface rather than individual film pages.
 */

import { writeFileSync } from 'fs'
import { resolve } from 'path'

// Configuration
const config = {
  baseUrl: process.env.SITE_URL || 'https://scroll-flix.vercel.app',
  outputPath: resolve('public/sitemap.xml'),
  lastModified: new Date().toISOString().split('T')[0], // YYYY-MM-DD format
}

// Generate sitemap URLs
const urls = [
  {
    loc: '/',
    lastmod: config.lastModified,
    changefreq: 'weekly',
    priority: '1.0',
    description: 'Main application - Interactive movie discovery visualization',
  },
]

// Optional: Add film URLs if the app grows to have individual film pages
// This would require reading film data and generating URLs dynamically
// const filmUrls = await generateFilmUrls() // Future enhancement

function generateSitemap(baseUrl, urls) {
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9
        http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd">
  
${urls
  .map(
    (url) => `  <!-- ${url.description} -->
  <url>
    <loc>${baseUrl}${url.loc}</loc>
    <lastmod>${url.lastmod}</lastmod>
    <changefreq>${url.changefreq}</changefreq>
    <priority>${url.priority}</priority>
  </url>`,
  )
  .join('\n\n')}
  
  <!-- Note: This is a SPA (Single Page Application) with dynamic content.
       Individual films are discovered through the interactive visualization
       rather than traditional URL routes. Search engines will primarily
       index the main application interface. -->
  
</urlset>`

  return sitemap
}

// Generate and write sitemap
try {
  const sitemapContent = generateSitemap(config.baseUrl, urls)
  writeFileSync(config.outputPath, sitemapContent, 'utf8')
  console.log(`✅ Sitemap generated successfully at ${config.outputPath}`)
  console.log(`📍 Base URL: ${config.baseUrl}`)
  console.log(`📊 URLs included: ${urls.length}`)
} catch (error) {
  console.error('❌ Error generating sitemap:', error)
  process.exit(1)
}

// Optional: Validate sitemap format
console.log('💡 To validate your sitemap:')
console.log('   - Use Google Search Console')
console.log(
  '   - Or visit: https://www.xml-sitemaps.com/validate-xml-sitemap.html',
)
console.log('   - Or use: npx sitemap-validator public/sitemap.xml')
