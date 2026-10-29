# agentback

Collect feedback from AI agents and the people using your product, inside the MCP server, CLI, API, or web app you already ship, and manage it in the [Agentback](https://agentback.app) inbox.

```sh
npm install agentback
```

Requires Node.js 20 or newer; the core client also runs in browsers, Cloudflare
Workers, Deno, and Bun. The MCP integration also needs the MCP TypeScript SDK (either
`@modelcontextprotocol/sdk` 1.23+ or `@modelcontextprotocol/server` 2.x) and
`zod` 4.2+; the core client and CLI helpers can be used without those optional
peers.

Create a project in Agentback and copy its public key (`af_...`) from the Connect page. The public key is write-only, so it can ship inside a CLI or a locally installed MCP server. Keep the secret key (`af_sk_...`) on your backend.

## MCP server

```ts
import { Agentback } from 'agentback';
import { attachToMcp } from 'agentback/mcp';

const agentback = new Agentback({ projectKey: 'af_...' });
attachToMcp(server, agentback, { product: 'My product' });
```

`server` is an `McpServer` from either MCP SDK major version. This registers a `send_feedback` tool whose description tells agents when to report and what never to include. Reports carry source `mcp` and the connected MCP client's name and version.

If you create a server per session or per request (for example, a hosted Streamable HTTP server), call `attachToMcp` wherever you register your other tools.

## CLI

```ts
import { runFeedbackCommand, feedbackHint } from 'agentback/cli';

if (argv[0] === 'feedback')
  process.exitCode = await runFeedbackCommand(agentback, argv.slice(1), {
    program: 'mycli',
  });

// After printing an error, optionally:
console.error(feedbackHint('mycli'));
```

With commander, hand the raw arguments over so `runFeedbackCommand` parses them:

```ts
program
  .command('feedback')
  .description('Report a problem with mycli to its developers')
  .helpOption(false)
  .allowUnknownOption()
  .argument('[args...]')
  .action(async (args: string[]) => {
    process.exitCode = await runFeedbackCommand(agentback, args, {
      program: 'mycli',
    });
  });
```

`mycli feedback [--category bug|feature_request|docs|other] [--intent text] [--request-id id] [--model name] [--json] <message>`; use `-` to read the message from stdin.

## Web app

Let the people using your web app send feedback from a small panel. One script tag, using the public key:

```html
<script
  src="https://agentback.app/widget.js"
  data-project="af_..."
  async
></script>
```

Or from npm, in apps with a bundler:

```ts
import { createFeedbackWidget } from 'agentback/web';

const feedback = createFeedbackWidget({
  projectKey: 'af_...',
  product: 'My product',
});
```

A floating Feedback button opens the panel. Reports carry source `web` and the page's address (origin and path, never the query string). The panel follows the visitor's light or dark setting and uses your page's font.

| Option (`data-` attribute) | Default                     |                                                                                                                                     |
| -------------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `color`                    | `orange`                    | `orange`, `neutral`, `blue`, `violet`, or any hex colour                                                                            |
| `color-dark`               |                             | the button colour in dark mode, when it should differ from `color` (in code: `color: { light, dark }`)                              |
| `text-color`               | readable on `color`         | the button's text colour as a hex; `text-color-dark` for dark mode (in code: `textColor: { light, dark }`)                          |
| `launcher`                 | `true`                      | `false` hides the floating button; open the panel from your own menu                                                                |
| `position`                 | `bottom-right`              | or `bottom-left`                                                                                                                    |
| `theme`                    | `auto`                      | `light` or `dark` to match your app's own switch                                                                                    |
| `categories`               | `bug,feature_request,other` | order, relabel (`bug:Report a bug,other`) or hide (`false`) the types; stored values stay `bug`, `feature_request`, `docs`, `other` |
| `product`                  |                             | your product's name, used in the thank-you message                                                                                  |
| `locale`                   | page `lang`                 | `en` or `zh`; override any string with the `text` option                                                                            |
| `page`                     | `true`                      | `false` leaves out the page address                                                                                                 |

To open it from your own button, mark the element; no code needed:

```html
<button data-agentback-open>Feedback</button>
```

The widget is also available as `window.Agentback` after the `agentback:ready` event (the return value of `createFeedbackWidget` from npm): `open(anchor?)`, `close()`, `toggle()`, `identify(identity | null)`, `setTheme(theme)` and `destroy()`.

To attach the signed-in user, sign their account on your backend as in [Verified accounts](#verified-accounts), then pass both to the page: `data-account` and `data-signature` on the script tag, or `Agentback.identify({ account, signature })` after sign-in. Without a signature, reports stay anonymous.

To build your own form instead, call `send()` from the browser with `{ source: 'web' }` and an optional `page`.

## Verified accounts

To know which of your users sent a report, sign their account reference on your backend and pass it to the integration:

```ts
// Backend, with the identity secret (af_id_..., from the Connect page):
import { signAccount } from 'agentback';
const signature = await signAccount(
  process.env.AGENTBACK_IDENTITY_SECRET!,
  accountId,
);

// MCP server or CLI:
attachToMcp(server, agentback, {
  product: 'My product',
  identify: () => ({ account: accountId, signature }),
});
```

Use an opaque id, never an email. Rotating the project's secret key also replaces the identity secret and invalidates existing signatures.

## Server

```ts
const agentback = new Agentback({
  secretKey: process.env.AGENTBACK_SECRET_KEY!,
});
await agentback.send(
  { message, intent, category, request_id },
  {
    source: 'api',
    account: tenantId,
    context: { endpoint: '/search', status_code: 200 },
  },
);
```

`send()` resolves after Agentback stores the report and throws `AgentbackError` otherwise; `error.retryable` is true for rate limits, outages, and network failures.
