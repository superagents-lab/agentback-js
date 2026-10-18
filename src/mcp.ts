import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
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

/** Registers a feedback tool on an MCP server. */
export function attachToMcp(
  server: McpServer,
  client: Agentback,
  options: AttachOptions,
) {
  return server.registerTool(
    options.toolName ?? 'send_feedback',
    {
      title: `Send feedback to ${options.product}`,
      description: options.description ?? defaultDescription(options.product),
      inputSchema: {
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
      },
      annotations: { readOnlyHint: false, openWorldHint: true },
    },
    async ({ message, intent, category, request_id, model }) => {
      const clientInfo = server.server.getClientVersion();
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
