## Usage examples

| Prompt | What the agent does |
|--------|---------------------|
| Fetch the OpenAI streaming docs and tell me how to stream responses. | Scrapes the page and summarizes the streaming section. |
| Scrape competitor.com/pricing and compare it to ours. | Scrapes and parses the pricing into a comparison. |
| Get all the product links from shop.example.com/phones. | Extracts links from the page. |
| Map the URLs on docs.example.com. | Lists the site's URLs from its sitemap. |
| Crawl all the pages under example.com/guide. | Follows internal links and collects each page. |
| Extract every email address from dir.example.com. | Returns a deduplicated email list. |
| Log into this site, open the first result, and give me its content. | Runs a browser session through the steps. |
| What internal API does this page use to load its data? | Inspects the page's network calls and surfaces the endpoint. |

The plugin also adds `/zenrows-doctor`, which checks that the Zenrows connection is live and authorized.
