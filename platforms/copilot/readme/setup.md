Install the plugin. In Copilot CLI, add this repository as a marketplace and install from it:

```
copilot plugin marketplace add ZenRows/zenrows-integrations
copilot plugin install zenrows@zenrows
```

In VS Code, run **Chat: Plugins** from the Command Palette and install from `ZenRows/zenrows-integrations`. For Copilot cloud agent, add the plugin to `enabledPlugins` in the repository's `.github/copilot/settings.json`.

Then sign in to Zenrows:

- **Copilot CLI:** run `/mcp auth zenrows` and sign in in the browser.
- **VS Code:** run **MCP: List Servers**, select `zenrows`, start it and allow it to authenticate.

Then ask Copilot something like: "Use Zenrows to get the product names and prices from https://www.scrapingcourse.com/ecommerce/".
