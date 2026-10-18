# agentback

Collect feedback from AI agents inside the MCP server, CLI, or API you already ship, and manage it in the [Agentback](https://agentback.app) inbox.

```sh
npm install agentback
```

Requires Node.js 22.14 or newer. The MCP integration also needs
`@modelcontextprotocol/sdk` and `zod`; the core client and CLI helpers can be
used without those optional peers.

Create a project in Agentback and copy its public key (`af_...`) from the Connect page. The public key is write-only, so it can ship inside a CLI or a locally installed MCP server. Keep the secret key (`af_sk_...`) on your backend.

## MCP server

```ts
import { Agentback } from 'agentback';
import { attachToMcp } from 'agentback/mcp';

const agentback = new Agentback({ projectKey: 'af_...' });
attachToMcp(server, agentback, { product: 'My product' });
```

This registers a `send_feedback` tool whose description tells agents when to report and what never to include. Reports carry source `mcp` and the connected MCP client's name and version. Requires `@modelcontextprotocol/sdk` and `zod`.

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

`mycli feedback [--category bug|feature_request|docs|other] [--intent text] [--request-id id] [--model name] [--json] <message>`; use `-` to read the message from stdin.

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
