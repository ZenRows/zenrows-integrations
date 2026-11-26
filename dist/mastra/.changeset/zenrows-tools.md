---
'@mastra/zenrows': minor
---

Added `@mastra/zenrows`, Zenrows tools for Mastra agents. `zenrows-scrape` reads any public page as Markdown, plaintext or HTML, and `zenrows-extract` returns its fields as structured JSON, with Zenrows handling proxies, JavaScript rendering and anti-bot protection.

```typescript
import { Agent } from '@mastra/core/agent';
import { createZenrowsTools } from '@mastra/zenrows';

export const researchAgent = new Agent({
  id: 'research-agent',
  name: 'Research Agent',
  model: 'anthropic/claude-sonnet-4-5',
  instructions:
    'Read pages with the scrape tool, and use the extract tool for the fields of a product or listing page.',
  tools: createZenrowsTools(),
});
```

`createZenrowsAllTools()` adds a tool for every other Zenrows endpoint, such as batch jobs and crawls.
