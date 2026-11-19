# @mastra/zenrows

[ZenRows](https://www.zenrows.com) web scraping and structured extraction tools for [Mastra](https://mastra.ai) agents.

ZenRows handles proxies, JavaScript rendering and anti-bot protection. The scrape tool returns a page as Markdown, plaintext or HTML; the extract tool returns the fields ZenRows parsed out of it as JSON.

## Installation

```bash
npm install @mastra/zenrows
```

## Usage

Set `ZENROWS_API_KEY`, or pass `{ apiKey }` to the factory.

```typescript
import { createZenrowsTools } from '@mastra/zenrows';
import { Agent } from '@mastra/core/agent';

const { zenrowsScrape, zenrowsExtract } = createZenrowsTools();

export const researchAgent = new Agent({
  id: 'research-agent',
  name: 'Research Agent',
  model: 'anthropic/claude-sonnet-4-5',
  instructions: 'Read pages with the scrape tool, and use the extract tool for the fields of a product or listing page.',
  tools: { zenrowsScrape, zenrowsExtract },
});
```

## Documentation

- [@mastra/zenrows documentation](https://mastra.ai/integrations/tools/zenrows)

## Changelog

See the [package changelog](https://github.com/mastra-ai/mastra/blob/main/integrations/zenrows/CHANGELOG.md) for version history and release notes.

## Support

We have an [open community Discord](https://discord.gg/mastra-ai). Come and say hello and let us know if you have any questions or need any help getting things running.
