import { render } from 'preact';
import { App } from './app';

render(<App />, document.getElementById('app')!);

// Offline support: production hosted build only — the dev server has no sw.js
// and the single-file build (window.__HATCHLAB_EMBED) needs none.
if (import.meta.env.PROD
  && 'serviceWorker' in navigator
  && !(window as unknown as { __HATCHLAB_EMBED?: unknown }).__HATCHLAB_EMBED) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {
      /* offline mode unavailable (e.g. file://) — the app still works online */
    });
  });
}
