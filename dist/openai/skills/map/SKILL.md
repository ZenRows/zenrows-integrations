---
name: map
description: Discover the URLs that exist on a site without fetching page content, usually from its sitemap. Use when the user wants a list of a site's pages, its structure, or "what's on this site". Not for retrieving page content (use scrape-webpage, batch, or crawl).
---

# Map a site's URLs

The user's instructions take precedence over this skill. If they conflict, follow the user.

Return a flat list of discovered URLs and nothing else. This costs 1 to 3 requests, not a full crawl.

## Instructions

1. Try the sitemap first: `scrape(url='https://<host>/sitemap.xml')`. If it returns a sitemap, parse out the URLs and stop. Most sites that have one expose it here.
2. If the sitemap is missing or empty, fetch `scrape(url='https://<host>/robots.txt', response_type='plaintext')` and read any `Sitemap:` lines, then fetch those sitemaps.
3. If both fail, do a single `scrape(url='https://<host>/', outputs='links')` on the homepage and dedupe to the same host.
4. Return the deduplicated URL list. Do not fetch the content of the discovered pages; that is what `crawl` is for.

## Notes

- Output is a list of URLs only. If the user then wants page content, hand off to `scrape-webpage` (one page) or `batch` (the discovered list, as one managed job).
- For a large list, report the count and a sample rather than pasting everything. If you can write files (for example in Codex), save the full list to `./.zenrows/map-<host>-<timestamp>.txt`.
