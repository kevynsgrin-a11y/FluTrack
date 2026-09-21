import { icon } from '../../../src/scripts/icons.js';

/**
 * /offline.html — shown by the service worker when a page is requested while
 * the device is offline and no cached copy exists. Minimal and self-contained.
 */
export default function offline() {
  const body = `
  <section class="section">
    <div class="container">
      <div class="centered-page">
        <p class="eyebrow">${icon('pulse', { size: 15 })} Offline</p>
        <h1>You're offline</h1>
        <p class="lede" style="margin-top: var(--space-md)">FluTrack needs a connection to load the latest CDC surveillance data. Pages you've already visited may still be available — otherwise, reconnect and try again.</p>
        <div class="cluster" style="justify-content: center; margin-top: var(--space-xl)">
          <a class="btn btn--primary" href="/">Try the home page</a>
          <a class="btn btn--secondary" href="/states/">All states</a>
        </div>
      </div>
    </div>
  </section>
  `;

  return {
    title: 'Offline',
    description: 'FluTrack is offline. Reconnect to load the latest CDC surveillance data.',
    path: '/offline.html',
    body,
    noindex: true,
  };
}
