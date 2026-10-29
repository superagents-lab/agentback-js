// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createFeedbackWidget,
  readableOn,
  type FeedbackWidget,
  type FeedbackWidgetOptions,
} from '../src/web.js';

const projectKey = `af_${'a'.repeat(64)}`;

function recorder(status = 201, body: unknown = { id: 'fb_1', status: 'new' }) {
  const calls: { url: string; body: any }[] = [];
  const fetch = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(init.body as string) });
    return Response.json(body, { status });
  }) as unknown as typeof globalThis.fetch;
  return { calls, fetch };
}

let widget: FeedbackWidget | undefined;
afterEach(() => {
  widget?.destroy();
  widget = undefined;
  document.body.innerHTML = '';
  document.documentElement.lang = '';
});

function mount(options: Partial<FeedbackWidgetOptions> = {}) {
  const net = recorder();
  widget = createFeedbackWidget({
    projectKey,
    origin: 'https://x.test',
    fetch: net.fetch,
    ...options,
  });
  const root = document.querySelector('[data-agentback]')!.shadowRoot!;
  const $ = <T extends Element = HTMLElement>(s: string) =>
    root.querySelector(s) as T;
  const type = (value: string) => {
    const field = $<HTMLTextAreaElement>('textarea');
    field.value = value;
    field.dispatchEvent(new Event('input'));
  };
  const settle = () => new Promise((r) => setTimeout(r, 0));
  return { ...net, root, $, type, settle };
}

describe('feedback widget', () => {
  it('sends a web report with the page and chosen type, then thanks the person', async () => {
    history.replaceState(null, '', '/billing?token=secret#plan');
    const { $, type, settle, calls, root } = mount({ product: 'Acme Cloud' });
    expect($('.panel').hidden).toBe(true);
    $<HTMLButtonElement>('.launcher').click();
    expect($('.panel').hidden).toBe(false);
    expect($('.launcher').getAttribute('aria-expanded')).toBe('true');

    const chips = Array.from(root.querySelectorAll('.chip'));
    expect(chips.map((c) => c.textContent)).toEqual([
      'Problem',
      'Idea',
      'Other',
    ]);
    expect($<HTMLButtonElement>('.send').disabled).toBe(true);
    (chips[0] as HTMLButtonElement).click();
    expect(chips[0]!.getAttribute('aria-pressed')).toBe('true');
    type('  The usage chart stops at yesterday.  ');
    expect($<HTMLButtonElement>('.send').disabled).toBe(false);
    $<HTMLButtonElement>('.send').click();
    await settle();

    expect(calls[0]!.url).toBe(`https://x.test/f/${projectKey}`);
    expect(calls[0]!.body).toEqual({
      message: 'The usage chart stops at yesterday.',
      category: 'bug',
      page: `${location.origin}/billing`,
      source: 'web',
    });
    expect($('.sent').hidden).toBe(false);
    expect($('.sent .body-text').textContent).toBe(
      'Your feedback went straight to the Acme Cloud team.',
    );
    expect($<HTMLTextAreaElement>('textarea').value).toBe('');
  });

  it('keeps the message and explains a rate limit', async () => {
    const fetch = vi.fn(async () =>
      Response.json({ error: 'Too many reports.' }, { status: 429 }),
    ) as unknown as typeof globalThis.fetch;
    const { $, type, settle } = mount({ fetch });
    widget!.open();
    type('Broken');
    $<HTMLButtonElement>('.send').click();
    await settle();
    expect($('.alert').hidden).toBe(false);
    expect($('.alert').textContent).toContain('Try again in a minute');
    expect($<HTMLTextAreaElement>('textarea').value).toBe('Broken');
    expect($('.send .label').textContent).toBe('Try again');
  });

  it('relabels, reorders or hides the types and can leave out the page', async () => {
    const relabelled = mount({
      categories: [{ value: 'feature_request', label: 'Suggestion' }, 'bug'],
    });
    expect(
      Array.from(relabelled.root.querySelectorAll('.chip')).map(
        (c) => c.textContent,
      ),
    ).toEqual(['Suggestion', 'Problem']);
    widget!.destroy();

    const plain = mount({ categories: false, includePage: false });
    expect(plain.root.querySelector('.chips')).toBeNull();
    expect(plain.root.querySelector('.note')).toBeNull();
    widget!.open();
    plain.type('Hi');
    plain.$<HTMLButtonElement>('.send').click();
    await plain.settle();
    expect(plain.calls[0]!.body).toEqual({ message: 'Hi', source: 'web' });
  });

  it('opens from the product’s own menu when the button is turned off', () => {
    document.body.innerHTML =
      '<nav><button id="menu" data-agentback-open>Feedback</button></nav>';
    const { $ } = mount({ launcher: false });
    expect($('.launcher').hidden).toBe(true);
    document.getElementById('menu')!.click();
    expect(widget!.isOpen).toBe(true);
    document.getElementById('menu')!.click();
    expect(widget!.isOpen).toBe(false);
  });

  it('attaches a signed account and refuses an unsigned one', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { $, type, settle, calls } = mount({
      identity: { account: 'user_1' },
    });
    expect(warn).toHaveBeenCalledOnce();
    widget!.identify({ account: ' user_2 ', signature: 'f'.repeat(64) });
    widget!.open();
    type('Hello');
    $<HTMLButtonElement>('.send').click();
    await settle();
    expect(calls[0]!.body).toMatchObject({
      account: 'user_2',
      account_signature: 'f'.repeat(64),
    });
    warn.mockRestore();
  });

  it('speaks Chinese on a Chinese page and closes on Escape', () => {
    document.documentElement.lang = 'zh-CN';
    const { $ } = mount();
    expect($('.launcher span').textContent).toBe('反馈');
    expect($('.sent .body-text').textContent).toBe('你的反馈已直接送达团队。');
    widget!.open();
    $('.panel').dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    expect(widget!.isOpen).toBe(false);
  });

  it('picks readable text for any brand colour', () => {
    expect(readableOn('#F58E02')).toBe('#18181B');
    expect(readableOn('#2563EB')).toBe('#FFFFFF');
    expect(readableOn('#fff')).toBe('#18181B');
    const { root } = mount({ color: '#0EA5E9' });
    const host = root.host as HTMLElement;
    expect(host.style.getPropertyValue('--accent-light')).toBe('#0EA5E9');
  });
});
