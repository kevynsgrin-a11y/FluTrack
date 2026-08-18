import { icon } from '../../../src/scripts/icons.js';
import { cachedNotice } from '../../../src/scripts/render.js';

/**
 * /offline.html — shown by the service worker when a page is requested while
 * the device is offline and no cached copy exists. Minimal and self-contained.
 *
 * The freshness notice is server-rendered here rather than left to the client:
 * this page is itself served from the cache, so it must be able to state the
 * boundary without any script running at all. The timestamp is the snapshot
 * that shipped with this build, which is exactly the data a cached page holds.
 */
export default function offline(ctx) {
  const { weekEnding } = ctx;

  const body = `
  <section class="section">
    <div class="container">
      <div class="centered-page">
        <p class="eyebrow">${icon('pulse', { size: 15 })} Offline</p>
        <h1>You're offline</h1>
        <p class="lede" style="margin-top: var(--space-md)">FluTrack needs a connection to load the latest CDC surveillance data. Pages you've already visited may still be available — otherwise, reconnect and try again.</p>
        <div style="margin-top: var(--space-xl); text-align: start">${cachedNotice({ weekEnding })}</div>
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
