# Changelog

## 0.6.0

- Reports take `outcome`, how the reporter's task ended: `blocked` (could not finish), `worked_around` (finished another way) or `friction` (finished, but only after retries or guessing), and `suggestion`, what would have helped.
- `friction` is now an outcome instead of a category; categories are `bug`, `feature_request`, `docs` and `other`. The web widget's `friction` type ("Hard to use") files the report with the friction outcome.
- MCP: `send_feedback` requires `outcome` and takes `suggestion`. Its description asks agents to report once the task is finished or abandoned, says they need not ask the user first, and calls a missing capability the most useful report.
- MCP: on a server that builds an `McpServer` per request, reports name the agent from the HTTP `User-Agent` when the client's name is not known (generic clients such as `node` or `curl` are skipped).
- MCP: `identify` receives the tool call's request (`authInfo` and the SDK's context), so a hosted server can sign the account that made the call.
- MCP: failures tell the agent not to resend; after a timeout, that the report may already be recorded. Errors only the developer can fix, such as a wrong project key, are logged with `console.error`.
- CLI: `--outcome` is required and `--suggestion` is new. After a timeout the command says the report may already be sent.
- Needs an Agentback server that accepts `outcome` and `suggestion` (agentback.app does from this release).

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
