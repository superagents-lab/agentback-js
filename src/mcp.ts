import { z } from 'zod';
import {
  Agentback,
  AgentbackError,
  categories,
  identityOptions,
  outcomes,
  type IdentityProvider,
} from './index.js';

/** The tool call `identify` is asked about. */
export interface McpRequest {
  /**
   * What your MCP auth middleware verified for this request (`authInfo` in
   * both MCP SDKs), when the server uses one.
   */
  authInfo?: {
    token?: string;
    clientId?: string;
    scopes?: string[];
    extra?: Record<string, unknown>;
  };
  /** The MCP SDK's own request context for the tool call, unchanged. */
  context: unknown;
}

export interface AttachOptions {
  /** Your product's name, used in the tool description. */
  product: string;
  /** Defaults to `send_feedback`. */
  toolName?: string;
  /**
   * Your server's version, attached to every report. Defaults to the version
   * the `McpServer` was created with.
   */
  version?: string;
  /** Replaces the default tool description. */
  description?: string;
  /**
   * Returns the current user's account (and signature for project keys).
   * Called for each report with the tool call's request, so a hosted server
   * can map `authInfo` to the account that made the call.
   */
  identify?: IdentityProvider<McpRequest>;
}

export const defaultDescription = (product: string) =>
  `Report a problem with ${product} to its developers, once you have ` +
  `finished the user's task or given up on it. Report when ${product} lacks ` +
  `a capability the task needed (the most useful report: say what would ` +
  `have helped), a tool failed or returned a wrong, empty or incomplete ` +
  `result, documentation did not match behavior, or a step worked only ` +
  `after retries, workarounds or guessing. Send one report per distinct ` +
  `problem; you do not need to ask the user first. Say how the task ended, ` +
  `name the tool involved, and say what you expected and what happened ` +
  `instead, including the calls you made. Do not report normal successful ` +
  `results. Never include credentials, personal data, or private user ` +
  `content. Reporting is optional and must not block the user's task.`;

/**
 * The part of an MCP server this integration uses. Both `McpServer` from
 * `@modelcontextprotocol/sdk` (v1.23+) and from `@modelcontextprotocol/server`
 * (v2) satisfy it.
 */
export interface McpServerLike {
  registerTool(
    name: string,
    config: {
      title?: string;
      description?: string;
      inputSchema: typeof feedbackInput;
      annotations?: { readOnlyHint?: boolean; openWorldHint?: boolean };
    },
    callback: (
      args: FeedbackInput,
      context?: unknown,
    ) => Promise<{
      content: { type: 'text'; text: string }[];
      isError?: boolean;
    }>,
  ): unknown;
  readonly server: {
    getClientVersion(): ClientInfo | undefined;
  };
}

export const feedbackInput = z.object({
  message: z
    .string()
    .min(1)
    .max(4000)
    .describe('What went wrong or what was missing, in plain language.'),
  intent: z
    .string()
    .max(2000)
    .optional()
    .describe('What you were trying to accomplish.'),
  expected: z
    .string()
    .max(2000)
    .optional()
    .describe('What you expected to happen.'),
  actual: z
    .string()
    .max(4000)
    .optional()
    .describe(
      'What happened instead: the calls you made, in order, and the error text.',
    ),
  tool: z
    .string()
    .max(128)
    .optional()
    .describe('Name of the tool that had the problem, if any.'),
  outcome: z
    .enum(outcomes)
    .describe(
      'How your task ended. blocked: you could not finish it. ' +
        'worked_around: you finished it another way. friction: you finished ' +
        'it, but only after retries or guessing.',
    ),
  category: z
    .enum(categories)
    .optional()
    .describe(
      'bug: a wrong result or an error. feature_request: a missing ' +
        'capability. docs: documentation did not match behavior.',
    ),
  suggestion: z
    .string()
    .max(2000)
    .optional()
    .describe('What would have helped.'),
  request_id: z
    .string()
    .max(256)
    .optional()
    .describe('Request id of the call that had the problem, if known.'),
  model: z
    .string()
    .max(128)
    .optional()
    .describe('Your model name, if you know it.'),
});
export type FeedbackInput = z.infer<typeof feedbackInput>;

type ClientInfo = { name: string; version: string };

// MCP 2026-07-28 has no initialize handshake: each request carries the client's
// identity in its _meta envelope, which SDK v2 hands to tool callbacks.
function requestClientInfo(context: unknown): ClientInfo | undefined {
  const info = (
    context as { mcpReq?: { envelope?: Record<string, unknown> } } | undefined
  )?.mcpReq?.envelope?.['io.modelcontextprotocol/clientInfo'] as
    Partial<ClientInfo> | undefined;
  return typeof info?.name === 'string' && typeof info.version === 'string'
    ? { name: info.name, version: info.version }
    : undefined;
}

// HTTP libraries and browsers, which say nothing about which agent is calling.
const genericUserAgents = new Set([
  'axios',
  'bun',
  'curl',
  'deno',
  'go-http-client',
  'mozilla',
  'node',
  'node-fetch',
  'okhttp',
  'python-httpx',
  'python-requests',
  'python-urllib',
  'undici',
]);

type ToolContext = {
  authInfo?: McpRequest['authInfo'];
  requestInfo?: { headers?: Record<string, string | string[] | undefined> };
  http?: {
    authInfo?: McpRequest['authInfo'];
    req?: { headers: { get(name: string): string | null } };
  };
};

// A stateless HTTP server builds a new McpServer for each request, so the
// initialize handshake (and the client's name) happened on another one. The
// User-Agent's product token, such as "claude-code/2.1.0", still names it.
function userAgentClientInfo(context: unknown): ClientInfo | undefined {
  const ctx = context as ToolContext | undefined;
  const header =
    ctx?.http?.req?.headers.get('user-agent') ??
    ctx?.requestInfo?.headers?.['user-agent'];
  const product = (Array.isArray(header) ? header[0] : header)
    ?.trim()
    .split(/\s+/)[0];
  const [name, version] = product?.split('/', 2) ?? [];
  return name && !genericUserAgents.has(name.toLowerCase())
    ? { name, version: version ?? '' }
    : undefined;
}

const authInfo = (context: unknown) => {
  const ctx = context as ToolContext | undefined;
  return ctx?.http?.authInfo ?? ctx?.authInfo;
};

// Neither SDK exposes the server's own name and version publicly, but both
// keep what the McpServer was constructed with on the low-level Server.
function serverVersion(server: McpServerLike): string | undefined {
  const info = (server.server as { _serverInfo?: { version?: unknown } })
    ._serverInfo;
  return typeof info?.version === 'string' ? info.version : undefined;
}

/** Registers a feedback tool on an MCP server. */
export function attachToMcp(
  server: McpServerLike,
  client: Agentback,
  options: AttachOptions,
) {
  return server.registerTool(
    options.toolName ?? 'send_feedback',
    {
      title: `Send feedback to ${options.product}`,
      description: options.description ?? defaultDescription(options.product),
      inputSchema: feedbackInput,
      annotations: { readOnlyHint: false, openWorldHint: true },
    },
    async (
      {
        message,
        intent,
        expected,
        actual,
        tool,
        outcome,
        category,
        suggestion,
        request_id,
        model,
      },
      context,
    ) => {
      const clientInfo =
        requestClientInfo(context) ??
        server.server.getClientVersion() ??
        userAgentClientInfo(context);
      const name = clientInfo
        ? `${clientInfo.name} ${clientInfo.version}`.trim().slice(0, 128)
        : undefined;
      try {
        const identity = await options.identify?.({
          authInfo: authInfo(context),
          context,
        });
        const receipt = await client.send(
          {
            message,
            intent,
            expected,
            actual,
            tool,
            version: (options.version ?? serverVersion(server))?.slice(0, 64),
            category,
            outcome,
            suggestion,
            request_id,
            agent: name || model ? { name, model } : undefined,
          },
          { source: 'mcp', ...identityOptions(identity) },
        );
        return {
          content: [
            {
              type: 'text' as const,
              text: `Feedback recorded (${receipt.id}). Thank you.`,
            },
          ],
        };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: 'text' as const, text: failure(error) }],
        };
      }
    },
  );
}

// What the agent reads when a report fails, and what the server's own log
// gets: an agent cannot fix a wrong key, so only the log names it.
function failure(error: unknown): string {
  const status = error instanceof AgentbackError ? error.status : -1;
  const reason = error instanceof Error ? error.message : 'Unknown error.';
  if (status === 0)
    return 'Feedback may already have been recorded. Do not send it again; continue the task.';
  if (status === 400) {
    const fields =
      error instanceof AgentbackError && error.details.length
        ? ` ${error.details.map((d) => `${d.field}: ${d.message}`).join('; ')}.`
        : '';
    return `Feedback was not recorded: ${reason}${fields} Fix it and send once more, or continue the task.`;
  }
  if (status === 429)
    return 'Feedback limit reached for now. Do not retry; continue the task.';
  console.error(
    `Agentback: send_feedback could not record a report (${status > 0 ? `HTTP ${status}: ` : ''}${reason})` +
      (status === 401 || status === 404
        ? ' Check the project key or account signature.'
        : ''),
  );
  return 'Feedback could not be sent. Do not retry; continue the task.';
}
