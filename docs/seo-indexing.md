# SEO and Indexing Strategy

## Indexing Expectations

### What Should Be Indexed
- **Main Application Interface** (`/`) - Primary entry point with interactive visualization
- **Static Assets** (favicon, manifest, etc.) - For proper application representation

### What Should NOT Be Indexed
- **API Data** (`/json/`) - Raw film metadata not meant for direct access
- **High-resolution Media** (`/media/high/`, `/media/mid/`, `/media/low/`) - Large assets for app performance
- **Build Assets** (`/assets/`) - Compiled application resources

## Technical Implementation

### Files
- `public/robots.txt` - Web crawler directives
- `public/sitemap.xml` - Site structure for search engines  
- `scripts/generate-sitemap.js` - Dynamic sitemap generation

### Scripts
```bash
# Generate/update sitemap
npm run seo:sitemap

# Validate SEO setup
npm run seo:validate
```

## SEO Considerations

### Single Page Application Challenges
- **Dynamic Content**: Movies are loaded dynamically via WebGL visualization
- **No Individual URLs**: Film discovery happens through interaction, not navigation
- **JavaScript Required**: Full functionality requires JS execution

### Optimization Strategy
1. **Meta Tags**: Proper title, description, and Open Graph tags in `index.html`
2. **Structured Data**: Consider adding JSON-LD for movie/application schema
3. **Social Sharing**: Film posters come from the TMDB image CDN
4. **Performance**: Fast loading for better Core Web Vitals

### Search Engine Guidance
- **Primary Focus**: Index the main application interface
- **Content Discovery**: Users discover films through interactive exploration
- **Social Sharing**: Individual films can be shared with poster images

## Deployment Considerations

### Production Checklist
- [ ] Update `SITE_URL` environment variable for sitemap generation
- [ ] Verify robots.txt is accessible at `/robots.txt`
- [ ] Confirm sitemap.xml is accessible at `/sitemap.xml`
- [ ] Submit sitemap to Google Search Console
- [ ] Monitor crawl errors and indexing status

### CDN/Edge Configuration
If using a CDN (Cloudflare, etc.), ensure:
- `robots.txt` and `sitemap.xml` are cached with appropriate TTL
- Gzip compression is enabled for text files
- Proper MIME types are set (`text/plain` for robots.txt, `application/xml` for sitemap.xml)

## Monitoring

### Key Metrics to Track
- **Indexing Status**: Pages indexed vs. submitted
- **Crawl Errors**: 404s, server errors, blocked resources
- **Core Web Vitals**: Loading performance metrics
- **Social Sharing**: Open Graph tag effectiveness

### Tools
- Google Search Console
- Google Analytics
- PageSpeed Insights
- Social media debuggers (Facebook, Twitter)

## Future Enhancements

### Potential Improvements
1. **Individual Film Pages**: Add URL routes for specific films
2. **Dynamic Sitemap**: Generate sitemap from film database
3. **Structured Data**: Add movie schema markup
4. **Meta Tag Management**: Dynamic meta tags per film view
5. **Server-side Rendering**: Consider SSR for improved SEO

### Migration Considerations
If adding individual film URLs, update:
- Sitemap generation to include film pages
- Robots.txt to allow film URL patterns
- Meta tag management for dynamic content
