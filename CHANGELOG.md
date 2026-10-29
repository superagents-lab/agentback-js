# Changelog

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
