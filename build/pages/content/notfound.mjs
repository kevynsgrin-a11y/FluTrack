import { icon } from '../../../src/scripts/icons.js';

/**
 * 404 — served at the literal path /404.html (not a trailing-slash directory) so
 * static hosts can use it as the not-found fallback. Deliberately minimal: a
 * friendly message and clear routes back into the site. No signup band, no
 * indexing. The sterile data-visualizer voice carries a light on-brand touch.
 */
export default function notFound(ctx) {
  const body = `
  <section class="section">
    <div class="container">
      <div class="centered-page">
        <p class="eyebrow">${icon('pulse')} Error 404</p>
        <h1>This page went off the chart</h1>
        <p class="lede" style="margin-top: var(--space-md)">The address you followed doesn't match anything on FluTrack. The page may have moved, or the link may be incomplete — but the data is still just a click away.</p>
        <h2 class="visually-hidden">Where to go next</h2>
        <div class="cluster" style="justify-content: center; margin-top: var(--space-xl)">
          <a class="btn btn--primary" href="/">Back to home</a>
          <a class="btn btn--secondary" href="/states/">All states</a>
          <a class="btn btn--ghost" href="/methodology/">How it's built</a>
        </div>
        <p class="muted" style="margin-top: var(--space-lg)">Still stuck? Browse the <a href="/faq/">FAQ</a> or <a href="/contact/">get in touch</a>.</p>
      </div>
    </div>
  </section>
  `;

  return {
    title: 'Page not found',
    description:
      "The page you're looking for isn't here. Head back to FluTrack's home, browse all states, or see how the respiratory threat level is built.",
    path: '/404.html',
    body,
    noindex: true,
  };
}
