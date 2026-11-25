---
name: crawl
description: Collect the URLs, and optionally the pages, behind one start URL by following its links, for example "every product in this category" or "all the posts on this blog". Use when the user has one start page and wants many pages from that site. Not for listing a site's URLs from its sitemap (use map), not for a single page (use scrape-webpage), and not for a list of URLs the user already has (use batch).
---

# Crawl from a start URL

Zenrows Crawl runs as a background job: it follows the links in each page up to `depth` hops, keeps the URLs that match your patterns, removes duplicates and stays on the start URL's domain (subdomains included).

The user's instructions take precedence over this skill. If they conflict, follow the user.

## Instructions

1. Confirm the start URL and the limits before starting. Each page fetched bills as one scrape, so `max_pages` is the cost control (default 100). `max_items` caps how many URLs are kept (default 100). Without `depth`, the crawl follows links until a limit stops it.
2. Start the job: `crawl_create(url, max_pages, max_items, depth, include_patterns, exclude_patterns)`.
   - Use `include_patterns` and `exclude_patterns` (substrings, for example `["/product/"]`) to keep only the URLs the user wants.
   - Add `output_format='html'` only when the user needs each page's content, not just its URL.
3. Wait for it: `crawl_wait(crawl_id)`. It returns the status, the counts and the first 20 URLs. If it returns `status: running` with a note, call `crawl_wait` again, or read the partial list with `crawl_results`.
4. Read every URL with `crawl_results(crawl_id)`. Pass the returned `next_cursor` as `cursor` until it is `null`.
5. For a page's content (only with `output_format='html'`): `crawl_content(crawl_id, content_id)`, using the `content_url` from a `crawl_results` row. It returns raw HTML, capped by `max_chars`. For markdown, call `scrape` on that page's URL instead.
6. If the user stops the task, call `crawl_stop(crawl_id)`. Pages already in flight still finish and are billed. A stopped crawl cannot resume.
7. Summarize from what you read. For a large result, report the count and a sample rather than every URL.

## Notes

- `crawl_download` writes a local file only when the MCP server runs on the user's machine. On the hosted server it writes nothing and returns a download URL and a command that needs an API key. Use `crawl_results` instead.
- `CRAWL_NOT_ENABLED`: Crawl is not enabled for this account. Do not retry; tell the user.
- `CRAWL_TOO_MANY_CRAWLS`: the account already runs its limit of active jobs (3 by default, shared with Batch). Retry after the `retry_after` seconds in the error.
- For URL discovery from a sitemap, use the `map` skill instead. It costs 1 to 3 requests.
- Once the URL list is known, use the `batch` skill to fetch the pages as one managed job.
