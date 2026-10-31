# Changelog

## 0.5.0

- Reports take `expected` (what the reporter expected), `actual` (what happened instead, with the error text), `tool` (your product's tool, command or endpoint) and `version` (your product's version).
- New category `friction`: it worked, but only after retries, workarounds or guessing. The web widget can offer it (`Hard to use`, `不好用`); its default types are unchanged.
- MCP: `send_feedback` takes `expected`, `actual` and `tool`, its description asks agents to fill them, and reports carry your server's version from the `McpServer` constructor (or the new `version` option).
- CLI: `--expected`, `--actual` and `--tool`, and a `version` option for `runFeedbackCommand`.
- Needs an Agentback server that accepts these fields (agentback.app does from this release).

## 0.4.0

- Web widget: `color` takes `{ light, dark }` for a separate button colour in each theme, and the new `textColor` sets the button's text colour (a hex or `{ light, dark }`; unset, it still picks dark or white by contrast). Script tag: `data-color-dark`, `data-text-color`, `data-text-color-dark`.

## 0.3.0

- Web feedback widget for the people using your web app: `agentback/web` (`createFeedbackWidget`) and a script-tag build at `agentback/widget.js`, served at https://agentback.app/widget.js.
- New `web` source and `page` field on reports.

## 0.1.1

- Fix release package checks for npm 12's JSON output.
- Publish matching version tags through GitHub Actions using npm trusted publishing.
- Document the Node.js requirement and optional MCP peer dependencies.

## 0.1.0

- Initial public client for submitting feedback to Agentback.
- MCP tool integration, CLI feedback helpers, and signed account identities.
