// The script-tag build served at https://agentback.app/widget.js:
// <script src="https://agentback.app/widget.js" data-project="af_..." async></script>
import { DEFAULT_ORIGIN } from './index.js';
import {
  createFeedbackWidget,
  type FeedbackWidget,
  type WidgetCategory,
  type WidgetLocale,
  type WidgetTheme,
} from './web.js';

declare global {
  interface Window {
    Agentback?: FeedbackWidget;
  }
}

// "bug:Report a bug,feature_request" relabels and orders; "false" hides.
function parseCategories(value?: string): false | WidgetCategory[] | undefined {
  if (value === undefined) return undefined;
  if (/^(false|none)$/i.test(value.trim())) return false;
  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [value, ...label] = part.split(':');
      return (
        label.length ? { value, label: label.join(':').trim() } : value
      ) as WidgetCategory;
    });
}

// `data-color="#007bff" data-color-dark="#3396ff"` sets each theme apart;
// a missing light value keeps the default for that theme.
function themed(
  light: string | undefined,
  dark: string | undefined,
  fallback: string,
) {
  return dark ? { light: light ?? fallback, dark } : light;
}

const script = document.currentScript as HTMLScriptElement | null;
const data = script?.dataset ?? {};
// Served by an Agentback deployment, the widget reports to that deployment.
const served = script?.src ? new URL(script.src) : null;
const origin =
  data.origin ??
  (served?.pathname === '/widget.js' ? served.origin : DEFAULT_ORIGIN);

function start() {
  if (window.Agentback) return;
  if (!data.project) {
    console.warn(
      'Agentback: add data-project="af_..." to the widget script tag.',
    );
    return;
  }
  const widget = createFeedbackWidget({
    projectKey: data.project,
    origin,
    product: data.product,
    color: themed(data.color, data.colorDark, 'orange'),
    // An empty light text colour is read as "pick one that reads well".
    textColor: themed(data.textColor, data.textColorDark, ''),
    theme: data.theme as WidgetTheme | undefined,
    launcher: data.launcher !== 'false',
    position: data.position === 'bottom-left' ? 'bottom-left' : 'bottom-right',
    categories: parseCategories(data.categories),
    locale: data.locale as WidgetLocale | undefined,
    identity: data.account
      ? { account: data.account, signature: data.signature }
      : undefined,
    includePage: data.page !== 'false',
  });
  window.Agentback = widget;
  window.dispatchEvent(new CustomEvent('agentback:ready', { detail: widget }));
}

if (document.body) start();
else document.addEventListener('DOMContentLoaded', start, { once: true });
