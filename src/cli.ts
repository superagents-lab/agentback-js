import { parseArgs } from 'node:util';
import {
  Agentback,
  AgentbackError,
  categories,
  identityOptions,
  outcomes,
  type Category,
  type IdentityProvider,
  type Outcome,
} from './index.js';

export interface FeedbackCommandOptions {
  /** Your CLI's name, used in help and hints, e.g. `mycli`. */
  program: string;
  /** Your CLI's version, attached to every report, e.g. `pkg.version`. */
  version?: string;
  /** Returns the logged-in user's account (and signature for project keys). */
  identify?: IdentityProvider;
  stdout?: { write(text: string): unknown };
  stderr?: { write(text: string): unknown };
  /** Read when the message is `-`. Defaults to process.stdin. */
  stdin?: AsyncIterable<string | Uint8Array>;
}

export const feedbackHelp = (
  program: string,
) => `Usage: ${program} feedback --outcome <outcome> [options] <message>

Report a problem with ${program} to its developers, once you have finished
your task or given up on it. Use "-" to read the message from stdin. Do not
include credentials or private data.

Options:
  -o, --outcome <blocked|worked_around|friction>
                           How your task ended (required). blocked: you
                           could not finish. worked_around: you finished
                           another way. friction: you finished, but only
                           after retries or guessing
  -c, --category <bug|feature_request|docs|other>
  -i, --intent <text>      What you were trying to do
  -e, --expected <text>    What you expected to happen
  -a, --actual <text>      What happened instead: the commands you ran and
                           the error text
  -s, --suggestion <text>  What would have helped
  -t, --tool <command>     The ${program} command that had the problem
  -r, --request-id <id>    Request id of the call that had the problem
  -m, --model <name>       Your model name, if you are an AI agent
      --json               Print the receipt as JSON
  -h, --help
`;

/** A line to print after an error so agents know they can report it. */
export const feedbackHint = (program: string) =>
  `If this looks like a problem with ${program}, report it: ${program} feedback --outcome blocked "<what happened>"`;

/**
 * Runs the `feedback` subcommand. Pass the arguments after `feedback`.
 * Returns the process exit code.
 */
export async function runFeedbackCommand(
  client: Agentback,
  argv: string[],
  options: FeedbackCommandOptions,
): Promise<number> {
  const out = options.stdout ?? process.stdout;
  const err = options.stderr ?? process.stderr;
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        outcome: { type: 'string', short: 'o' },
        category: { type: 'string', short: 'c' },
        suggestion: { type: 'string', short: 's' },
        intent: { type: 'string', short: 'i' },
        expected: { type: 'string', short: 'e' },
        actual: { type: 'string', short: 'a' },
        tool: { type: 'string', short: 't' },
        'request-id': { type: 'string', short: 'r' },
        model: { type: 'string', short: 'm' },
        json: { type: 'boolean' },
        help: { type: 'boolean', short: 'h' },
      },
    });
  } catch (error) {
    err.write(
      `${(error as Error).message}\n\n${feedbackHelp(options.program)}`,
    );
    return 2;
  }
  const { values, positionals } = parsed;
  if (values.help) {
    out.write(feedbackHelp(options.program));
    return 0;
  }
  let message = positionals.join(' ').trim();
  if (message === '-') {
    let text = '';
    const decoder = new TextDecoder();
    for await (const chunk of options.stdin ?? process.stdin)
      text += typeof chunk === 'string' ? chunk : decoder.decode(chunk);
    message = text.trim();
  }
  const category = values.category as Category | undefined;
  const outcome = values.outcome as Outcome | undefined;
  const problem = !message
    ? 'A message is required.'
    : !outcome
      ? `--outcome is required: ${outcomes.join(', ')}.`
      : !outcomes.includes(outcome)
        ? `Unknown outcome "${outcome}": use ${outcomes.join(', ')}.`
        : category && !categories.includes(category)
          ? `Unknown category "${category}": use ${categories.join(', ')}.`
          : '';
  if (problem) {
    err.write(`${problem}\n\n${feedbackHelp(options.program)}`);
    return 2;
  }
  try {
    const receipt = await client.send(
      {
        message,
        intent: values.intent,
        expected: values.expected,
        actual: values.actual,
        tool: values.tool,
        version: options.version?.slice(0, 64),
        category,
        outcome,
        suggestion: values.suggestion,
        request_id: values['request-id'],
        agent: values.model ? { model: values.model } : undefined,
      },
      { source: 'cli', ...identityOptions(await options.identify?.()) },
    );
    out.write(
      values.json
        ? `${JSON.stringify(receipt)}\n`
        : `Feedback sent (${receipt.id}). Thank you.\n`,
    );
    return 0;
  } catch (error) {
    const reason =
      error instanceof AgentbackError ? error.message : 'Unexpected error.';
    // A timeout may come after Agentback stored the report.
    const unsure = error instanceof AgentbackError && error.status === 0;
    if (values.json)
      out.write(
        `${JSON.stringify({ error: reason, sent: unsure ? 'unknown' : false })}\n`,
      );
    else
      err.write(
        unsure
          ? `Feedback may already have been sent (${reason}). Do not send it again.\n`
          : `Feedback was not sent: ${reason}\n`,
      );
    return 1;
  }
}
