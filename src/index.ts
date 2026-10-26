export const DEFAULT_ORIGIN = 'https://agentback.app';

export const categories = ['bug', 'feature_request', 'docs', 'other'] as const;
export type Category = (typeof categories)[number];
export type Source = 'direct' | 'api' | 'mcp' | 'cli';

export interface Feedback {
  /** What went wrong or what was missing. Required, at most 4000 characters. */
  message: string;
  /** What the agent was trying to do. */
  intent?: string;
  category?: Category;
  /** The id of the original call that had the problem, not of this report. */
  request_id?: string;
  agent?: { name?: string; model?: string };
}

export interface SendOptions {
  /** Defaults to `mcp`/`cli` from the integrations, otherwise `direct` or `api`. */
  source?: Source;
  /**
   * Your opaque reference for the end user or tenant. Never an email.
   * With a project key it must come with `accountSignature`.
   */
  account?: string;
  /** From `signAccount`, computed on your backend. Project-key clients only. */
  accountSignature?: string;
  /** Secret-key clients only: details of the call that had the problem. */
  context?: { endpoint?: string; status_code?: number; duration_ms?: number };
}

export interface Receipt {
  id: string;
  status: 'new';
}

export interface AgentbackOptions {
  /**
   * The project's public key (`af_...`). Write-only, safe to ship inside a CLI
   * or a locally installed MCP server.
   */
  projectKey?: string;
  /** The project's secret key (`af_sk_...`). Server-side code only. */
  secretKey?: string;
  origin?: string;
  timeoutMs?: number;
  fetch?: typeof fetch;
}

export class AgentbackError extends Error {
  readonly status: number;
  readonly details: { field: string; message: string }[];
  /** True for rate limits, storage outages, and network failures. */
  readonly retryable: boolean;
  constructor(
    status: number,
    message: string,
    details: { field: string; message: string }[] = [],
  ) {
    super(message);
    this.name = 'AgentbackError';
    this.status = status;
    this.details = details;
    this.retryable = status === 0 || status === 429 || status >= 500;
  }
}

export class Agentback {
  readonly mode: 'project' | 'secret';
  readonly #url: string;
  readonly #secretKey?: string;
  readonly #timeoutMs: number;
  readonly #fetch: typeof fetch;

  constructor(options: AgentbackOptions) {
    const { projectKey, secretKey } = options;
    if (Boolean(projectKey) === Boolean(secretKey))
      throw new TypeError('Pass exactly one of projectKey or secretKey.');
    if (secretKey && !/^af_sk_[a-f0-9]{64}$/.test(secretKey))
      throw new TypeError('secretKey must be an af_sk_ project secret.');
    if (projectKey && !/^af_[a-f0-9]{64}$/.test(projectKey))
      throw new TypeError('projectKey must be an af_ public project key.');
    const origin = (options.origin ?? DEFAULT_ORIGIN).replace(/\/+$/, '');
    this.mode = projectKey ? 'project' : 'secret';
    this.#url = projectKey ? `${origin}/f/${projectKey}` : `${origin}/feedback`;
    this.#secretKey = secretKey;
    this.#timeoutMs = options.timeoutMs ?? 5000;
    this.#fetch = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  /** Stores one report. Resolves only after Agentback has saved it. */
  async send(feedback: Feedback, options: SendOptions = {}): Promise<Receipt> {
    const body: Record<string, unknown> = { ...feedback };
    if (this.mode === 'project') {
      if (options.context)
        throw new TypeError('context requires a secretKey client.');
      if (options.source === 'api')
        throw new TypeError('source "api" requires a secretKey client.');
      if (Boolean(options.account) !== Boolean(options.accountSignature))
        throw new TypeError(
          'With a projectKey, account needs accountSignature from signAccount.',
        );
      if (options.account) {
        body.account = options.account.trim();
        body.account_signature = options.accountSignature;
      }
    } else {
      if (options.source === 'direct')
        throw new TypeError('source "direct" requires a projectKey client.');
      if (options.account) body.account = options.account.trim();
      if (options.context) body.context = options.context;
    }
    if (options.source) body.source = options.source;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.#secretKey) headers.Authorization = `Bearer ${this.#secretKey}`;
    let response: Response;
    try {
      response = await this.#fetch(this.#url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        redirect: 'manual',
        signal: AbortSignal.timeout(this.#timeoutMs),
      });
    } catch {
      throw new AgentbackError(0, 'Could not reach Agentback.');
    }
    const json = (await response.json().catch(() => null)) as {
      id?: string;
      status?: string;
      error?: string;
      details?: { field: string; message: string }[];
    } | null;
    if (response.status === 201 && json?.id)
      return { id: json.id, status: 'new' };
    throw new AgentbackError(
      response.status,
      json?.error ?? `Agentback returned HTTP ${response.status}.`,
      json?.details,
    );
  }
}

const encoder = new TextEncoder();
const hex = (bytes: ArrayBuffer) =>
  Array.from(new Uint8Array(bytes), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');

/**
 * Signs an account reference so a project-key client can attach it as a
 * verified account. Run this on your backend with the project's identity
 * secret (`af_id_...`, from the Connect page) and hand only the signature to
 * your CLI or MCP server, e.g. when it logs in.
 */
export async function signAccount(
  identitySecret: string,
  account: string,
): Promise<string> {
  if (!/^af_id_[a-f0-9]{64}$/.test(identitySecret))
    throw new TypeError('identitySecret must be an af_id_ identity secret.');
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(identitySecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return hex(
    await crypto.subtle.sign('HMAC', key, encoder.encode(account.trim())),
  );
}
/** Who is reporting. `signature` is required with a projectKey client. */
export interface Identity {
  account: string;
  signature?: string;
}
export type IdentityProvider = () =>
  Identity | undefined | Promise<Identity | undefined>;

export const identityOptions = (identity?: Identity): SendOptions =>
  identity
    ? { account: identity.account, accountSignature: identity.signature }
    : {};
