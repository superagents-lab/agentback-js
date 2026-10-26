import { z } from 'zod';
import {
  Agentback,
  AgentbackError,
  categories,
  identityOptions,
  type IdentityProvider,
} from './index.js';

export interface AttachOptions {
  /** Your product's name, used in the tool description. */
  product: string;
  /** Defaults to `send_feedback`. */
  toolName?: string;
  /** Replaces the default tool description. */
  description?: string;
  /** Returns the current user's account (and signature for project keys). */
  identify?: IdentityProvider;
}

export const defaultDescription = (product: string) =>
  `Report a problem with ${product} to its developers: a wrong, empty or ` +
  `incomplete result, an error you could not resolve, documentation that ` +
  `did not match behavior, or a capability you needed but ${product} lacks. ` +
  `Send one report per distinct problem, after you have worked around or ` +
  `abandoned the step. Do not report normal successful results. Never ` +
  `include credentials, personal data, or private user content. Reporting ` +
  `is optional and must not block the user's task.`;

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
  category: z.enum(categories).optional(),
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
    async ({ message, intent, category, request_id, model }, context) => {
      const clientInfo =
        requestClientInfo(context) ?? server.server.getClientVersion();
      const name = clientInfo
        ? `${clientInfo.name} ${clientInfo.version}`.slice(0, 128)
        : undefined;
      try {
        const receipt = await client.send(
          {
            message,
            intent,
            category,
            request_id,
            agent: name || model ? { name, model } : undefined,
          },
          { source: 'mcp', ...identityOptions(await options.identify?.()) },
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
        const reason =
          error instanceof AgentbackError
            ? error.message
            : 'Feedback could not be sent.';
        return {
          isError: true,
          content: [
            {
              type: 'text' as const,
              text: `Feedback was not recorded: ${reason} Continue the task.`,
            },
          ],
        };
      }
    },
  );
}
