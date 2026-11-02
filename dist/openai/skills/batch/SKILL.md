---
name: batch
description: Fetch a list of URLs the user already has as one managed Zenrows job, with retries and per-task results. Use when the user supplies or points at roughly five or more URLs (a file, a pasted list, the output of map) and wants their content or extracted fields. Not for discovering URLs by following links (use crawl), not for listing a site's URLs (use map), and not for a single page (use scrape-webpage).
---

# Batch

The user's instructions take precedence over this skill. If they conflict, follow the user.

Zenrows Batch queues many URLs as one server-side job, retries transient failures, and stores the results.

## When to use this instead of `scrape`

Use batch at roughly five URLs or more. Below that, parallel `scrape` calls are faster and simpler, since a job costs a create, a wait and a results fetch. Above it, batch wins: one job instead of N round trips, server-side retries, and no plan-concurrency 429s (the Developer plan allows 5 concurrent requests).

## Instructions

1. Confirm the URL list and its size with the user before submitting. A batch bills per URL, so an unintended 5,000-URL job is expensive.
2. Submit the job:
   - Same options for every URL: `batch_create(urls=[...], response_type='markdown')`.
   - Different options per URL, or you need ids echoed back: `batch_create(tasks=[{url, external_id, metadata, zenrows_params}, ...])`.
   - `urls` is ignored when `tasks` is provided. Do not pass both.
3. Wait for completion:
   - Small jobs: pass `wait=true` to `batch_create` and get a terminal state in one call.
   - Larger jobs: let `batch_create` return, then call `batch_wait(job_id)`. Default timeout is 600000 ms; raise `timeout_ms` (max 3600000) for big jobs.
   - Report progress from `batch_status(job_id)` if the user asks mid-job.
4. Collect results with `batch_results(job_id)`. Use `status='successful'` or `status='failed'` to split them when reporting.
5. If you can write files (for example in Codex), save results to `./.zenrows/batch-<job_id>.jsonl`, one JSON object per line, and summarize instead of reading the whole file back. Otherwise, summarize the results directly.
6. If the user stops the task, call `batch_cancel(job_id)`. The job keeps consuming credits until cancelled.

## Options

| Need | Where | Note |
|------|-------|------|
| Same settings for all URLs | job level: `js_render`, `premium_proxy`, `proxy_country`, `response_type` | Simplest form |
| Different settings per URL | `tasks[].zenrows_params` | Accepts `js_render`, `premium_proxy`, `extract`, `autoparse`, and other scrape params |
| Structured fields, not page content | `tasks[].zenrows_params` with `extract` or `autoparse` | Batch and Extract compose |
| Track which result is which | `tasks[].external_id` and `tasks[].metadata` | Echoed back on results |
| Geo-restricted pages | `proxy_country` | Works with the default settings |

## Notes

- `batch_create` has no required field, but a job with neither `tasks` nor `urls` does nothing. Always supply one.
- Always report the failed count alongside the successful one. Batch retries transient failures itself, so a URL in the failed set has genuinely not worked.
- `browser_batch` is unrelated: it batches actions inside one browser session. It is not this.
