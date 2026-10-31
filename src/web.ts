import {
  Agentback,
  AgentbackError,
  categories as allCategories,
  identityOptions,
  type Category,
  type Identity,
  type Receipt,
} from './index.js';

export type WidgetColor =
  'orange' | 'neutral' | 'blue' | 'violet' | (string & {});
/** One value for both themes, or a separate one for each. */
export type ThemedValue<T> = T | { light: T; dark: T };
export type WidgetTheme = 'auto' | 'light' | 'dark';
export type WidgetLocale = 'en' | 'zh';
export type WidgetCategory = Category | { value: Category; label: string };

export interface WidgetText {
  launcher: string;
  title: string;
  categories: string;
  field: string;
  placeholder: string;
  pageNote: string;
  send: string;
  sending: string;
  retry: string;
  close: string;
  sentTitle: string;
  /** `{product}` is replaced with the `product` option when it is set. */
  sentBody: string;
  another: string;
  failed: string;
  rateLimited: string;
  poweredBy: string;
  bug: string;
  friction: string;
  feature_request: string;
  docs: string;
  other: string;
}

export interface FeedbackWidgetOptions {
  /** The project's public key (`af_...`). Write-only, safe in a web page. */
  projectKey: string;
  origin?: string;
  /** Your product's name, used in the thank-you message. */
  product?: string;
  /**
   * A preset or any CSS hex colour, or `{ light, dark }` for a separate one
   * in each theme. Defaults to `orange`.
   */
  color?: ThemedValue<WidgetColor>;
  /**
   * Text on the button, as a hex colour or `{ light, dark }`. Defaults to
   * whichever of dark or white reads better on `color`.
   */
  textColor?: ThemedValue<string>;
  /** `auto` follows the visitor's system setting. */
  theme?: WidgetTheme;
  /** Show the floating button. Turn it off to open from your own menu. */
  launcher?: boolean;
  position?: 'bottom-right' | 'bottom-left';
  /**
   * Which types people can pick, in order, optionally relabelled.
   * `false` hides the picker. Reports without a type are stored as `other`.
   */
  categories?: false | WidgetCategory[];
  /** Defaults to the page's `lang`: `zh` for Chinese, otherwise `en`. */
  locale?: WidgetLocale;
  text?: Partial<WidgetText>;
  /** The signed-in user, signed on your backend with `signAccount`. */
  identity?: Identity;
  /** Send the page's address (origin and path, never the query). */
  includePage?: boolean;
  /** Clicks on `[data-agentback-open]` elements open the widget. */
  bindTriggers?: boolean;
  container?: HTMLElement;
  fetch?: typeof fetch;
  onSent?: (receipt: Receipt) => void;
}

export interface FeedbackWidget {
  /** Opens the panel, next to `anchor` when given (e.g. your menu item). */
  open(anchor?: Element | null): void;
  close(): void;
  toggle(anchor?: Element | null): void;
  /** Attach the signed-in user, or pass `null` after they sign out. */
  identify(identity: Identity | null): void;
  setTheme(theme: WidgetTheme): void;
  destroy(): void;
  readonly isOpen: boolean;
}

const locales: Record<WidgetLocale, WidgetText> = {
  en: {
    launcher: 'Feedback',
    title: 'Send feedback',
    categories: 'Feedback type',
    field: 'Your feedback',
    placeholder: 'What happened, or what would make this better?',
    pageNote: 'Includes the address of this page.',
    send: 'Send',
    sending: 'Sending',
    retry: 'Try again',
    close: 'Close',
    sentTitle: 'Thanks, we got it',
    sentBody: 'Your feedback went straight to the {product} team.',
    another: 'Send another',
    failed: 'Couldn’t send. Your message is still here, so you can try again.',
    rateLimited: 'Too many reports from this network. Try again in a minute.',
    poweredBy: 'Powered by',
    bug: 'Problem',
    friction: 'Hard to use',
    feature_request: 'Idea',
    docs: 'Docs',
    other: 'Other',
  },
  zh: {
    launcher: '反馈',
    title: '发送反馈',
    categories: '反馈类型',
    field: '你的反馈',
    placeholder: '遇到了什么问题，或者有什么建议？',
    pageNote: '会附带当前页面的地址。',
    send: '发送',
    sending: '发送中',
    retry: '重试',
    close: '关闭',
    sentTitle: '收到了，谢谢',
    sentBody: '你的反馈已直接送达 {product} 团队。',
    another: '再发一条',
    failed: '没有发送成功。内容还在，可以再试一次。',
    rateLimited: '这个网络发送得太频繁了，请一分钟后再试。',
    poweredBy: 'Powered by',
    bug: '问题',
    friction: '不好用',
    feature_request: '建议',
    docs: '文档',
    other: '其他',
  },
};

// [light, dark] button colours. A custom hex works in both themes.
const presets: Record<string, [string, string]> = {
  orange: ['#F58E02', '#F58E02'],
  neutral: ['#18181B', '#FAFAFA'],
  blue: ['#2563EB', '#2563EB'],
  violet: ['#6D28D9', '#7C3AED'],
};

const defaultCategories: Category[] = ['bug', 'feature_request', 'other'];

/** Dark text on light colours, white on dark ones (WCAG luminance). */
export function readableOn(hex: string): string {
  const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(hex.trim());
  if (!m) return '#FFFFFF';
  const full =
    m[1]!.length === 3 ? m[1]!.replace(/./g, (c) => c + c) : (m[1] as string);
  const [r, g, b] = [0, 2, 4].map((i) => {
    const v = parseInt(full.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  // Contrast against #18181B (L≈0.0093) beats white once L passes ~0.18.
  return (l + 0.05) / 0.0593 > 1.05 / (l + 0.05) ? '#18181B' : '#FFFFFF';
}

const hex = (value: string) => /^#([0-9a-f]{6}|[0-9a-f]{3})$/i.test(value);

/** [light, dark] button colours, each one a preset's own shade or a hex. */
function accent(color: ThemedValue<WidgetColor> = 'orange'): [string, string] {
  const [light, dark] =
    typeof color === 'string' ? [color, color] : [color.light, color.dark];
  const pick = (value: WidgetColor, theme: 0 | 1) =>
    presets[value]?.[theme] ?? (hex(value) ? value : undefined);
  const l = pick(light, 0);
  const d = pick(dark, 1);
  return l && d ? [l, d] : presets.orange!;
}

/** [light, dark] text colours: the given hex, or readable on the button. */
function onAccent(
  [light, dark]: [string, string],
  text: ThemedValue<string> | undefined,
): [string, string] {
  const [l, d] =
    text === undefined
      ? []
      : typeof text === 'string'
        ? [text, text]
        : [text.light, text.dark];
  return [
    l && hex(l) ? l : readableOn(light),
    d && hex(d) ? d : readableOn(dark),
  ];
}

function pickLocale(locale?: WidgetLocale): WidgetLocale {
  if (locale) return locale;
  const lang =
    typeof document === 'undefined' ? '' : document.documentElement.lang;
  return /^zh\b/i.test(lang) ? 'zh' : 'en';
}

const logo = `<svg aria-hidden="true" viewBox="0 0 600 600"><path d="M 98.678 24.077 C 71.567 26.993, 45.177 42.123, 28.322 64.413 C 22.179 72.536, 14.515 88.529, 11.747 99 C 9.500 107.500, 9.500 107.500, 9.500 300 C 9.500 492.500, 9.500 492.500, 11.751 501 C 21.137 536.442, 48.284 563.627, 84.875 574.226 C 92.500 576.435, 92.500 576.435, 295 576.767 C 442.567 577.009, 499.664 576.791, 505.476 575.962 C 545.004 570.325, 577.986 540.783, 588.607 501.500 C 590.434 494.745, 590.500 487.682, 590.500 299.500 C 590.500 104.500, 590.500 104.500, 588.161 96.500 C 579.059 65.365, 554.431 39.381, 524.004 28.811 C 508.083 23.280, 522.573 23.638, 306 23.428 C 196.275 23.322, 102.980 23.614, 98.678 24.077" fill="#f58e02"/><path d="M 292.250 109.084 C 267.364 112.250, 245.401 125.560, 230.511 146.500 C 226.058 152.762, 215.160 172.364, 185.755 227 C 166.459 262.854, 147.209 298.408, 113.334 360.760 C 101.006 383.454, 88.124 407.722, 84.709 414.691 C 78.500 427.361, 78.500 427.361, 78.500 437.430 C 78.500 449.343, 80.957 455.957, 87.997 462.997 C 102.121 477.121, 124.222 476.854, 138.448 462.386 C 143.361 457.388, 158.597 429.567, 199.718 350.500 C 241.879 269.434, 279.974 198.701, 284.299 193.454 C 290.764 185.610, 302.025 183.481, 310.566 188.486 C 315.924 191.626, 318.086 194.474, 325.757 208.500 C 340.966 236.306, 390.284 329.797, 391.565 333.250 C 392.177 334.899, 389.766 335, 349.607 335 C 307 335, 307 335, 307 320.923 C 307 306.846, 307 306.846, 304.077 303.923 C 300.665 300.512, 295.853 300.028, 291.973 302.707 C 290.613 303.646, 274.817 316.246, 256.871 330.707 C 234.403 348.813, 223.855 357.936, 222.998 360.005 C 221.059 364.686, 222.165 373.481, 225.083 376.593 C 227.328 378.987, 251.293 398.227, 280.708 421.250 C 291.730 429.877, 293.625 431, 297.159 431 C 300.241 431, 301.822 430.332, 304.077 428.077 C 307 425.154, 307 425.154, 307 411.077 C 307 397, 307 397, 364.250 397.020 C 421.500 397.040, 421.500 397.040, 426.348 406.770 C 446.046 446.300, 453.210 458.991, 458.610 463.926 C 473.821 477.828, 495.940 476.694, 510.019 461.289 C 516.158 454.572, 519 447.248, 519 438.144 C 519 425.543, 521.208 430.295, 469.224 331 C 438.821 272.928, 385.229 171.811, 377.004 157 C 365.810 136.843, 353.750 124.994, 335.744 116.464 C 322.548 110.212, 305.765 107.364, 292.250 109.084" fill="#25252a"/></svg>`;
const icons = {
  chat: '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z"/></svg>',
  close:
    '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>',
  check:
    '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5 10 17 19 7.5"/></svg>',
  alert:
    '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v4.5"/><path d="M12 16h.01"/></svg>',
  spin: '<svg aria-hidden="true" class="spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M21 12a9 9 0 1 1-9-9"/></svg>',
};

const css = `
:host{all:initial;position:fixed;z-index:2147483000}
:host,:host([data-theme=light]){--surface:#fff;--footer:#fafafa;--border:#e4e4e7;--field:#d4d4d8;--input:#fff;--text:#18181b;--muted:#52525b;--faint:#6b6b75;--handle:#d4d4d8;--shadow:0 16px 40px rgba(24,24,27,.14),0 2px 8px rgba(24,24,27,.06);--err:#b42318;--err-bg:#fef3f2;--err-border:#fecdca;--accent:var(--accent-light);--on-accent:var(--on-accent-light)}
:host([data-theme=dark]){--surface:#18181b;--footer:#151518;--border:#2e2e33;--field:#3f3f46;--input:#0f0f11;--text:#fafafa;--muted:#a1a1aa;--faint:#9b9ba5;--handle:#3f3f46;--shadow:0 16px 40px rgba(0,0,0,.55),0 2px 8px rgba(0,0,0,.4);--err:#fda29b;--err-bg:#2a1513;--err-border:#55201b;--accent:var(--accent-dark);--on-accent:var(--on-accent-dark)}
@media (prefers-color-scheme:dark){:host([data-theme=auto]){--surface:#18181b;--footer:#151518;--border:#2e2e33;--field:#3f3f46;--input:#0f0f11;--text:#fafafa;--muted:#a1a1aa;--faint:#9b9ba5;--handle:#3f3f46;--shadow:0 16px 40px rgba(0,0,0,.55),0 2px 8px rgba(0,0,0,.4);--err:#fda29b;--err-bg:#2a1513;--err-border:#55201b;--accent:var(--accent-dark);--on-accent:var(--on-accent-dark)}}
*{box-sizing:border-box}
[hidden]{display:none!important}
.root{font-family:var(--font);font-size:14px;line-height:1.45;color:var(--text);letter-spacing:normal;text-transform:none;text-align:left;-webkit-font-smoothing:antialiased}
button{font:inherit;color:inherit;cursor:pointer;margin:0}
button:focus-visible,a:focus-visible{outline:2px solid #71717a;outline-offset:2px}
svg{width:16px;height:16px;flex:none;display:block}
.sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
.launcher{position:fixed;bottom:24px;right:24px;height:44px;padding:0 18px 0 14px;border:0;border-radius:999px;background:var(--accent);color:var(--on-accent);font-size:14px;font-weight:600;display:inline-flex;align-items:center;gap:8px;box-shadow:0 6px 20px rgba(0,0,0,.18)}
.launcher svg{width:18px;height:18px}
.left .launcher{right:auto;left:24px}
.panel{position:fixed;width:360px;max-width:calc(100vw - 16px);max-height:calc(100vh - 16px);overflow:auto;display:flex;flex-direction:column;background:var(--surface);border:1px solid var(--border);border-radius:14px;box-shadow:var(--shadow);animation:in .14s ease-out}
@keyframes in{from{opacity:0;transform:translateY(6px)}}
.handle{display:none}
header{display:flex;align-items:center;justify-content:space-between;padding:4px 4px 0 16px}
h2{margin:0;font-size:15px;font-weight:600;letter-spacing:-.01em}
.icon{width:44px;height:44px;border:0;border-radius:10px;background:transparent;color:var(--muted);display:inline-flex;align-items:center;justify-content:center}
.body{display:flex;flex-direction:column;gap:12px;padding:4px 16px 16px}
.chips{display:flex;flex-wrap:wrap;gap:6px}
.chip{height:32px;padding:0 12px;border-radius:999px;border:1px solid var(--border);background:transparent;color:var(--muted);font-size:13px;font-weight:500}
.chip[aria-pressed=true]{background:color-mix(in srgb,var(--accent) 14%,var(--surface));border-color:color-mix(in srgb,var(--accent) 72%,var(--text));color:var(--text)}
textarea{display:block;width:100%;height:120px;resize:none;margin:0;padding:10px 12px;border-radius:10px;border:1px solid var(--field);background:var(--input);color:var(--text);font:inherit;font-size:14px;line-height:1.5}
textarea::placeholder{color:var(--faint);opacity:1}
textarea:focus{outline:none;border-color:#71717a;box-shadow:0 0 0 3px rgba(113,113,122,.22)}
.note{margin:0;font-size:12px;color:var(--faint)}
.alert{display:flex;gap:10px;align-items:flex-start;margin:0;padding:10px 12px;border-radius:10px;border:1px solid var(--err-border);background:var(--err-bg);color:var(--err);font-size:13px}
.alert svg{margin-top:1px}
.sent{min-height:224px;padding:20px 24px 24px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;text-align:center}
.mark{width:44px;height:44px;margin-bottom:6px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:color-mix(in srgb,var(--accent) 14%,var(--surface));color:color-mix(in srgb,var(--accent) 72%,var(--text))}
.mark svg{width:20px;height:20px}
.sent p{margin:0}
.sent .title{font-size:15px;font-weight:600}
.sent .body-text{max-width:250px;font-size:13px;line-height:1.5;color:var(--muted)}
.ghost{margin-top:10px;height:36px;padding:0 14px;border-radius:8px;border:1px solid var(--border);background:transparent;font-size:13px;font-weight:500}
footer{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 12px 10px 16px;border-top:1px solid var(--border);background:var(--footer)}
.brand{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--faint);text-decoration:none}
.brand svg{width:14px;height:14px}
.brand b{font-weight:600;color:var(--muted)}
.send{height:36px;padding:0 14px;border:0;border-radius:8px;background:var(--accent);color:var(--on-accent);font-size:13px;font-weight:600;display:inline-flex;align-items:center;gap:8px}
.send:disabled{cursor:default;opacity:.45}
.send[aria-busy=true]{opacity:1}
.send[aria-busy=true] kbd{display:none}
.send svg{width:14px;height:14px}
kbd{font:inherit;font-size:12px;font-weight:500;opacity:.65}
.spin{animation:spin .8s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.backdrop{position:fixed;inset:0;background:rgba(9,9,11,.45)}
@media (hover:none){kbd{display:none}}
@media (max-width:640px){
.launcher{right:16px;bottom:24px;width:52px;height:52px;padding:0;justify-content:center}
.left .launcher{left:16px}
.launcher span{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}
.launcher svg{width:22px;height:22px}
.panel{left:0!important;right:0!important;bottom:0!important;top:auto!important;width:100%;max-width:none;max-height:calc(100vh - 48px);border-radius:16px 16px 0 0;border-bottom:0}
.handle{display:flex;justify-content:center;padding-top:8px}
.handle i{width:36px;height:4px;border-radius:2px;background:var(--handle)}
.chip{height:40px}
textarea{height:148px;font-size:16px}
.sent{min-height:252px}
footer{padding:12px 16px 20px}
.send{height:44px;padding:0 18px}
}
@media (prefers-reduced-motion:reduce){.panel{animation:none}.spin{animation-duration:2.4s}}
`;

type Stage = 'compose' | 'sending' | 'sent' | 'error';

/**
 * Mounts the Agentback feedback widget: a floating button (optional) and a
 * panel where people describe a problem or an idea. Reports arrive in the
 * Agentback inbox with source `web` and the page they were sent from.
 */
export function createFeedbackWidget(
  options: FeedbackWidgetOptions,
): FeedbackWidget {
  const client = new Agentback({
    projectKey: options.projectKey,
    origin: options.origin,
    fetch: options.fetch,
  });
  const text: WidgetText = {
    ...locales[pickLocale(options.locale)],
    ...options.text,
  };
  const types =
    options.categories === false
      ? []
      : (options.categories ?? defaultCategories)
          .map((c) =>
            typeof c === 'string'
              ? { value: c, label: text[c] }
              : { value: c.value, label: c.label },
          )
          .filter((c) => allCategories.includes(c.value));
  const [light, dark] = accent(options.color);
  const [onLight, onDark] = onAccent([light, dark], options.textColor);
  let identity = signed(options.identity);
  let stage: Stage = 'compose';
  let category: Category | undefined;
  let anchor: Element | null = null;
  let open = false;

  const host = document.createElement('div');
  host.setAttribute('data-agentback', '');
  host.dataset.theme = options.theme ?? 'auto';
  host.style.setProperty('--accent-light', light);
  host.style.setProperty('--accent-dark', dark);
  host.style.setProperty('--on-accent-light', onLight);
  host.style.setProperty('--on-accent-dark', onDark);
  // Take the page's typeface so the widget reads as part of the product.
  const pageFont = getComputedStyle(document.body).fontFamily;
  host.style.setProperty(
    '--font',
    pageFont && !/^(serif|"?times)/i.test(pageFont)
      ? pageFont
      : 'system-ui,-apple-system,"Segoe UI",Roboto,sans-serif',
  );
  const shadow = host.attachShadow({ mode: 'open' });
  const product = options.product?.trim();
  const sentBody = product
    ? text.sentBody.replace('{product}', product)
    : text.sentBody
        .replace(/\s*\{product\}\s*/, ' ')
        .replace(/ (?=[\u3000-\u9fff])|(?<=[\u3000-\u9fff]) /g, '');
  const mac =
    typeof navigator !== 'undefined' &&
    /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent);
  shadow.innerHTML = `<style>${css}</style>
<div class="root${options.position === 'bottom-left' ? ' left' : ''}">
<button type="button" class="launcher" aria-expanded="false" aria-controls="panel" aria-label="${esc(text.launcher)}">${icons.chat}<span>${esc(text.launcher)}</span></button>
<div class="backdrop" hidden></div>
<section class="panel" id="panel" role="dialog" aria-labelledby="title" hidden>
<div class="handle" aria-hidden="true"><i></i></div>
<header><h2 id="title">${esc(text.title)}</h2><button type="button" class="icon close" aria-label="${esc(text.close)}">${icons.close}</button></header>
<div class="body">
${
  types.length
    ? `<div class="chips" role="group" aria-label="${esc(text.categories)}">${types
        .map(
          (t) =>
            `<button type="button" class="chip" aria-pressed="false" data-value="${t.value}">${esc(t.label)}</button>`,
        )
        .join('')}</div>`
    : ''
}
<label class="sr" for="message">${esc(text.field)}</label>
<textarea id="message" maxlength="4000" placeholder="${esc(text.placeholder)}"></textarea>
${options.includePage === false ? '' : `<p class="note">${esc(text.pageNote)}</p>`}
<p class="alert" role="alert" hidden>${icons.alert}<span></span></p>
</div>
<div class="sent" role="status" hidden><div class="mark">${icons.check}</div><p class="title">${esc(text.sentTitle)}</p><p class="body-text">${esc(sentBody)}</p><button type="button" class="ghost another">${esc(text.another)}</button></div>
<footer><a class="brand" href="https://agentback.app" target="_blank" rel="noopener">${esc(text.poweredBy)}${logo}<b>Agentback</b></a><button type="button" class="send" disabled><span class="label">${esc(text.send)}</span><kbd>${mac ? '⌘↵' : 'Ctrl↵'}</kbd></button></footer>
</section>
</div>`;
  const $ = <T extends Element>(selector: string) =>
    shadow.querySelector(selector) as T;
  const launcher = $<HTMLButtonElement>('.launcher');
  const backdrop = $<HTMLDivElement>('.backdrop');
  const panel = $<HTMLElement>('.panel');
  const body = $<HTMLDivElement>('.body');
  const field = $<HTMLTextAreaElement>('textarea');
  const alert = $<HTMLParagraphElement>('.alert');
  const sent = $<HTMLDivElement>('.sent');
  const send = $<HTMLButtonElement>('.send');
  const chips = Array.from(shadow.querySelectorAll<HTMLButtonElement>('.chip'));
  launcher.hidden = options.launcher === false;
  (options.container ?? document.body).appendChild(host);

  const narrow = () => window.matchMedia('(max-width: 640px)').matches;

  function render() {
    const busy = stage === 'sending';
    body.hidden = stage === 'sent';
    sent.hidden = stage !== 'sent';
    send.hidden = stage === 'sent';
    alert.hidden = stage !== 'error';
    field.disabled = busy;
    for (const chip of chips) {
      chip.disabled = busy;
      chip.setAttribute(
        'aria-pressed',
        String(chip.dataset.value === category),
      );
    }
    send.disabled = busy || !field.value.trim();
    send.setAttribute('aria-busy', String(busy));
    send.querySelector('.label')!.textContent = busy
      ? text.sending
      : stage === 'error'
        ? text.retry
        : text.send;
    send.querySelector('.spin')?.remove();
    if (busy) send.insertAdjacentHTML('afterbegin', icons.spin);
    const fromLauncher = open && !anchor;
    launcher.setAttribute('aria-expanded', String(fromLauncher));
    launcher.firstElementChild!.outerHTML = fromLauncher
      ? icons.close
      : icons.chat;
    launcher.querySelector('span')!.textContent = fromLauncher
      ? text.close
      : text.launcher;
    launcher.setAttribute(
      'aria-label',
      fromLauncher ? text.close : text.launcher,
    );
  }

  function place() {
    const style = panel.style;
    style.top = style.bottom = style.left = style.right = '';
    if (narrow()) return;
    const width = panel.offsetWidth || 360;
    if (!anchor) {
      style.bottom = '80px';
      if (options.position === 'bottom-left') style.left = '24px';
      else style.right = '24px';
      return;
    }
    const rect = anchor.getBoundingClientRect();
    const left = Math.min(
      Math.max(8, rect.right - width),
      window.innerWidth - width - 8,
    );
    style.left = `${left}px`;
    if (window.innerHeight - rect.bottom >= panel.offsetHeight + 16)
      style.top = `${rect.bottom + 8}px`;
    else style.bottom = `${window.innerHeight - rect.top + 8}px`;
  }

  function outside(event: Event) {
    const path = event.composedPath();
    if (path.includes(host) || (anchor && path.includes(anchor))) return;
    widget.close();
  }

  function trigger(event: MouseEvent) {
    const target = (event.target as Element | null)?.closest?.(
      '[data-agentback-open]',
    );
    if (!target) return;
    event.preventDefault();
    widget.toggle(target);
  }

  async function submit() {
    const message = field.value.trim();
    if (!message || stage === 'sending') return;
    stage = 'sending';
    render();
    try {
      const receipt = await client.send(
        {
          message,
          ...(category ? { category } : {}),
          ...(options.includePage === false
            ? {}
            : { page: location.origin + location.pathname }),
        },
        { source: 'web', ...identityOptions(identity) },
      );
      stage = 'sent';
      field.value = '';
      category = undefined;
      render();
      sent.querySelector<HTMLButtonElement>('.another')!.focus();
      options.onSent?.(receipt);
    } catch (error) {
      stage = 'error';
      alert.querySelector('span')!.textContent =
        error instanceof AgentbackError && error.status === 429
          ? text.rateLimited
          : text.failed;
      render();
      field.focus();
    }
  }

  launcher.addEventListener('click', () => widget.toggle());
  $('.close').addEventListener('click', () => widget.close());
  backdrop.addEventListener('click', () => widget.close());
  sent.querySelector('.another')!.addEventListener('click', () => {
    stage = 'compose';
    render();
    field.focus();
  });
  send.addEventListener('click', () => void submit());
  field.addEventListener('input', () => {
    if (stage === 'error') stage = 'compose';
    render();
  });
  field.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void submit();
    }
  });
  panel.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') widget.close();
  });
  for (const chip of chips)
    chip.addEventListener('click', () => {
      const value = chip.dataset.value as Category;
      category = category === value ? undefined : value;
      render();
    });
  if (options.bindTriggers !== false)
    document.addEventListener('click', trigger);
  window.addEventListener('resize', place);

  const widget: FeedbackWidget = {
    get isOpen() {
      return open;
    },
    open(target) {
      anchor = target ?? null;
      if (stage === 'sent') stage = 'compose';
      open = true;
      panel.hidden = false;
      backdrop.hidden = !narrow();
      launcher.style.visibility = narrow() ? 'hidden' : '';
      render();
      place();
      field.focus();
      // Defer so the click that opened the panel does not close it.
      setTimeout(() => document.addEventListener('pointerdown', outside));
    },
    close() {
      if (!open) return;
      document.removeEventListener('pointerdown', outside);
      open = false;
      panel.hidden = true;
      backdrop.hidden = true;
      launcher.style.visibility = '';
      const returnTo = anchor ?? (launcher.hidden ? null : launcher);
      render();
      (returnTo as HTMLElement | null)?.focus?.();
    },
    toggle(target) {
      if (open && (target ?? null) === anchor) widget.close();
      else widget.open(target);
    },
    identify(next) {
      identity = signed(next ?? undefined);
    },
    setTheme(theme) {
      host.dataset.theme = theme;
    },
    destroy() {
      widget.close();
      document.removeEventListener('click', trigger);
      window.removeEventListener('resize', place);
      host.remove();
    },
  };
  render();
  return widget;
}

// A web page cannot vouch for an account, so it needs your backend's signature.
function signed(identity?: Identity): Identity | undefined {
  if (!identity) return undefined;
  if (identity.account?.trim() && identity.signature) return identity;
  console.warn(
    'Agentback: identity needs { account, signature } from signAccount on your backend; sending anonymously.',
  );
  return undefined;
}

function esc(value: string) {
  return value.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!,
  );
}
