# Zenrows for {{host_full}}

{{< zenrows-description}}. This plugin connects {{host}} to the Zenrows MCP server and adds skills that tell {{host}} which Zenrows tool fits each task and how to keep requests efficient.

## What you get

- The Zenrows MCP server (`https://mcp.zenrows.com/mcp`). You sign in to your Zenrows account with OAuth; there is no API key to copy.
- Skills:

| Skill | Use it for |
|---|---|
| `{{skill:using-zenrows}}` | Overview: tools, defaults, errors and plan limits |
| `{{skill:getting-started}}` | First-run checks and troubleshooting |
| `{{skill:scrape-webpage}}` | Reading one page |
| `{{skill:extract-structured-data}}` | Named fields or JSON from one page |
| `{{skill:batch}}` | A list of five or more URLs as one job |
| `{{skill:crawl}}` | Many pages under one site section |
| `{{skill:map}}` | Listing a site's URLs without fetching them |
| `{{skill:browser-automation}}` | Clicks, forms, pagination and multi-step flows |
| `{{skill:capture-api-calls}}` | Finding the API calls a page makes |

## Requirements

A Zenrows account. Requests use credits on your Zenrows plan. You can [sign up here](https://app.zenrows.com/register).

## Setup

{{> setup}}

{{>? more}}

## Privacy

The plugin sends the URLs and options you ask {{host}} to fetch to Zenrows, which processes them under the [Zenrows privacy policy](https://www.zenrows.com/legal/privacy).

## Support

- Documentation: [docs.zenrows.com](https://docs.zenrows.com)
- MCP server documentation: [docs.zenrows.com/mcp/overview](https://docs.zenrows.com/mcp/overview)
- Contact: [integrations@zenrows.com](mailto:integrations@zenrows.com)

## License

MIT
