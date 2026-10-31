import { describe, expect, it, vi } from 'vitest';
import { McpServer as McpServerV1 } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client as ClientV1 } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport as InMemoryTransportV1 } from '@modelcontextprotocol/sdk/inMemory.js';
import {
  McpServer as McpServerV2,
  InMemoryTransport as InMemoryTransportV2,
} from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { Client as ClientV2 } from '@modelcontextprotocol/client';
import { Agentback, AgentbackError, signAccount } from '../src/index.js';
import { attachToMcp } from '../src/mcp.js';
import { feedbackHint, runFeedbackCommand } from '../src/cli.js';
import { createHmac } from 'node:crypto';

const projectKey = `af_${'a'.repeat(64)}`;
const secretKey = `af_sk_${'b'.repeat(64)}`;
const identitySecret = `af_id_${'c'.repeat(64)}`;

function recorder(status = 201, body: unknown = { id: 'fb_1', status: 'new' }) {
  const calls: { url: string; init: RequestInit; body: any }[] = [];
  const fetch = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init, body: JSON.parse(init.body as string) });
    return Response.json(body, { status });
  }) as unknown as typeof globalThis.fetch;
  return { calls, fetch };
}
const sink = () => {
  let text = '';
  return {
    write: (t: string) => (text += t),
    get text() {
      return text;
    },
  };
};

describe('Agentback client', () => {
  it('sends project-key reports to the public endpoint with a signed account', async () => {
    const { calls, fetch } = recorder();
    const client = new Agentback({
      projectKey,
      origin: 'https://x.test/',
      fetch,
    });
    await expect(
      client.send(
        { message: 'Missing dates' },
        { source: 'cli', account: ' acct ', accountSignature: 'f'.repeat(64) },
      ),
    ).resolves.toEqual({ id: 'fb_1', status: 'new' });
    expect(calls[0]!.url).toBe(`https://x.test/f/${projectKey}`);
    expect(calls[0]!.body).toEqual({
      message: 'Missing dates',
      source: 'cli',
      account: 'acct',
      account_signature: 'f'.repeat(64),
    });
    expect(new Headers(calls[0]!.init.headers).get('authorization')).toBeNull();
  });
  it('refuses fields a public client cannot vouch for', async () => {
    const client = new Agentback({ projectKey, fetch: recorder().fetch });
    await expect(
      client.send({ message: 'x' }, { account: 'a' }),
    ).rejects.toThrow(/accountSignature/);
    await expect(
      client.send({ message: 'x' }, { context: { status_code: 500 } }),
    ).rejects.toThrow(/secretKey/);
    expect(() => new Agentback({ projectKey, secretKey })).toThrow();
    expect(() => new Agentback({ secretKey: 'af_sk_short' })).toThrow();
  });
  it('forwards secret-key reports with bearer auth and context', async () => {
    const { calls, fetch } = recorder();
    await new Agentback({ secretKey, fetch }).send(
      { message: 'x' },
      { source: 'mcp', account: 'acct', context: { status_code: 502 } },
    );
    expect(calls[0]!.url).toBe('https://agentback.app/feedback');
    expect(new Headers(calls[0]!.init.headers).get('authorization')).toBe(
      `Bearer ${secretKey}`,
    );
    expect(calls[0]!.body).toMatchObject({
      account: 'acct',
      context: { status_code: 502 },
    });
  });
  it('surfaces errors with retryability', async () => {
    const client = new Agentback({
      projectKey,
      fetch: recorder(429, { error: 'Too many reports.' }).fetch,
    });
    const error = await client.send({ message: 'x' }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AgentbackError);
    expect(error).toMatchObject({ status: 429, retryable: true });
    const invalid: AgentbackError = await new Agentback({
      projectKey,
      fetch: recorder(400, { error: 'Invalid feedback.' }).fetch,
    })
      .send({ message: 'x' })
      .then(
        () => {
          throw new Error('expected failure');
        },
        (e: AgentbackError) => e,
      );
    expect(invalid.retryable).toBe(false);
  });
  it('signs trimmed accounts with HMAC-SHA256', async () => {
    const signature = await signAccount(identitySecret, ' acct-1 ');
    expect(signature).toBe(
      createHmac('sha256', identitySecret).update('acct-1').digest('hex'),
    );
    expect(await signAccount(identitySecret, 'acct-2')).not.toBe(signature);
    expect(await signAccount(`af_id_${'d'.repeat(64)}`, 'acct-1')).not.toBe(
      signature,
    );
    await expect(signAccount(secretKey, 'acct-1')).rejects.toThrow(/af_id_/);
  });
});

const mcpSdks = [
  {
    version: 'v1',
    connect: async (attach: (server: McpServerV1) => void, name: string) => {
      const server = new McpServerV1({ name: 'demo', version: '1.0.0' });
      attach(server);
      const client = new ClientV1({ name, version: '2.0' });
      const [a, b] = InMemoryTransportV1.createLinkedPair();
      await Promise.all([server.connect(a), client.connect(b)]);
      return client;
    },
  },
  {
    version: 'v2',
    connect: async (attach: (server: McpServerV2) => void, name: string) => {
      const server = new McpServerV2({ name: 'demo', version: '1.0.0' });
      attach(server);
      const client = new ClientV2({ name, version: '2.0' });
      const [a, b] = InMemoryTransportV2.createLinkedPair();
      await Promise.all([server.connect(a), client.connect(b)]);
      return client;
    },
  },
];

describe('MCP integration (v2, 2026-07-28 protocol)', () => {
  it('reads the client name from the per-request envelope', async () => {
    const { calls, fetch } = recorder();
    const [a, b] = InMemoryTransportV2.createLinkedPair();
    const handle = serveStdio(
      () => {
        const server = new McpServerV2({ name: 'demo', version: '1.0.0' });
        attachToMcp(server, new Agentback({ projectKey, fetch }), {
          product: 'Demo',
        });
        return server;
      },
      { transport: a },
    );
    const client = new ClientV2(
      { name: 'modern-agent', version: '3.1' },
      { versionNegotiation: { mode: { pin: '2026-07-28' } } },
    );
    await client.connect(b);
    const result = await client.callTool({
      name: 'send_feedback',
      arguments: { message: 'x' },
    });
    await client.close();
    await handle.close();
    expect(result.isError).toBeFalsy();
    expect(calls[0]!.body.agent).toEqual({ name: 'modern-agent 3.1' });
  });
});

describe.each(mcpSdks)('MCP integration ($version)', ({ connect }) => {
  it('registers a feedback tool that reports the MCP client and account', async () => {
    const { calls, fetch } = recorder();
    const client = await connect(
      (server) =>
        attachToMcp(server, new Agentback({ projectKey, fetch }), {
          product: 'Demo',
          identify: () => ({ account: 'acct', signature: 'e'.repeat(64) }),
        }),
      'test-agent',
    );
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual(['send_feedback']);
    expect(tools[0]!.description).toContain('Demo');
    expect(tools[0]!.inputSchema.required).toEqual(['message']);
    const result = await client.callTool({
      name: 'send_feedback',
      arguments: {
        message: 'No dates',
        expected: 'A published date per result',
        actual: 'date is undefined',
        tool: 'search',
        category: 'friction',
        model: 'm-1',
      },
    });
    expect(result.isError).toBeFalsy();
    expect(calls[0]!.body).toEqual({
      message: 'No dates',
      expected: 'A published date per result',
      actual: 'date is undefined',
      tool: 'search',
      version: '1.0.0',
      category: 'friction',
      agent: { name: 'test-agent 2.0', model: 'm-1' },
      source: 'mcp',
      account: 'acct',
      account_signature: 'e'.repeat(64),
    });
  });
  it('lets the integration set the version', async () => {
    const { calls, fetch } = recorder();
    const client = await connect(
      (server) =>
        attachToMcp(server, new Agentback({ projectKey, fetch }), {
          product: 'Demo',
          version: '2.3.1',
        }),
      'agent',
    );
    await client.callTool({
      name: 'send_feedback',
      arguments: { message: 'x' },
    });
    expect(calls[0]!.body.version).toBe('2.3.1');
  });
  it('rejects invalid arguments before sending', async () => {
    const { calls, fetch } = recorder();
    const client = await connect(
      (server) =>
        attachToMcp(server, new Agentback({ projectKey, fetch }), {
          product: 'Demo',
        }),
      'agent',
    );
    const result = await client.callTool({
      name: 'send_feedback',
      arguments: { message: '', category: 'praise' },
    });
    expect(result.isError).toBe(true);
    expect(calls).toHaveLength(0);
  });
  it('reports failures as tool errors without throwing', async () => {
    const client = await connect(
      (server) =>
        attachToMcp(
          server,
          new Agentback({
            projectKey,
            fetch: recorder(503, { error: 'Down.' }).fetch,
          }),
          { product: 'Demo' },
        ),
      'agent',
    );
    const result = await client.callTool({
      name: 'send_feedback',
      arguments: { message: 'x' },
    });
    expect(result.isError).toBe(true);
  });
});

describe('CLI integration', () => {
  it('sends a report and prints the receipt', async () => {
    const { calls, fetch } = recorder();
    const stdout = sink();
    const code = await runFeedbackCommand(
      new Agentback({ projectKey, fetch }),
      [
        '--category',
        'docs',
        '-i',
        'find articles',
        '--expected',
        'a date per result',
        '-a',
        'Error: Unknown option: --dates',
        '-t',
        'search',
        'Dates',
        'missing',
        '--json',
      ],
      { program: 'demo', version: '2.3.1', stdout, stderr: sink() },
    );
    expect(code).toBe(0);
    expect(JSON.parse(stdout.text)).toEqual({ id: 'fb_1', status: 'new' });
    expect(calls[0]!.body).toEqual({
      message: 'Dates missing',
      intent: 'find articles',
      expected: 'a date per result',
      actual: 'Error: Unknown option: --dates',
      tool: 'search',
      version: '2.3.1',
      category: 'docs',
      source: 'cli',
    });
  });
  it('reads stdin, validates input, and reports failures', async () => {
    const { calls, fetch } = recorder();
    const client = new Agentback({ projectKey, fetch });
    const io = { program: 'demo', stdout: sink(), stderr: sink() };
    expect(
      await runFeedbackCommand(client, ['-'], {
        ...io,
        stdin: (async function* () {
          yield 'from stdin\n';
        })(),
      }),
    ).toBe(0);
    expect(calls[0]!.body.message).toBe('from stdin');
    expect(await runFeedbackCommand(client, [], io)).toBe(2);
    expect(await runFeedbackCommand(client, ['-c', 'nope', 'x'], io)).toBe(2);
    const failing = new Agentback({
      projectKey,
      fetch: recorder(400, { error: 'Bad.' }).fetch,
    });
    const stderr = sink();
    expect(await runFeedbackCommand(failing, ['x'], { ...io, stderr })).toBe(1);
    expect(stderr.text).toContain('Bad.');
    expect(feedbackHint('demo')).toContain('demo feedback');
  });
});
