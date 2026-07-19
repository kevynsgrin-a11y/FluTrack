import { escapeHtml } from '../../../src/scripts/util.js';
import { icon } from '../../../src/scripts/icons.js';
import { pageHeader, prose } from '../../lib/partials.mjs';
import { breadcrumbLd } from '../../lib/seo.mjs';

/**
 * /accessibility/ — an Accessibility Statement. A public utility that targets
 * WCAG 2.2 AA should publish its conformance target, known limitations, and a
 * way to report barriers. Sterile, factual voice.
 */
export default function accessibility(ctx) {
  const { site } = ctx;
  const email = site.publisher.email;
  const crumbs = [
    { name: 'Home', path: '/' },
    { name: 'Accessibility', path: '/accessibility/' },
  ];

  const body = `
  ${pageHeader({
    eyebrow: 'Accessibility',
    title: 'Accessibility statement',
    lede:
      'FluTrack is built to be usable by everyone, including people who rely on assistive technology. This page states our conformance target, what we have done, the known limitations, and how to tell us when something gets in your way.',
  })}

  ${prose(
    `
    <h2>Our target</h2>
    <p>FluTrack aims to conform to the <strong>Web Content Accessibility Guidelines (WCAG) 2.2, Level AA</strong>. Accessibility is treated as a build requirement, not an afterthought: it is checked as the site is developed and again before changes ship.</p>

    <h2>What we do</h2>
    <ul>
      <li>Semantic HTML with a logical heading structure, landmarks, and a skip-to-content link on every page.</li>
      <li>Full keyboard operability — the state map is a set of ordinary links, and menus, accordions and forms all work without a mouse, with visible focus styles.</li>
      <li>Colour is never the only signal: the threat level is always accompanied by a word and a label, and text meets AA contrast in both the light and dark themes.</li>
      <li>Motion respects your <code>prefers-reduced-motion</code> setting — animations are removed when you ask your system to reduce motion.</li>
      <li>The interface is responsive and works at high zoom and on small screens.</li>
      <li>Data figures use tabular numerals and are described in text, not conveyed by shape or colour alone.</li>
    </ul>

    <h2>Known limitations</h2>
    <p>The U.S. map is presented as a tile grid rather than a geographic outline; it is a deliberate simplification for clarity, and every state is also reachable through the plain <a href="/states/">state directory</a> and the dropdown selector. If any data visualization is ever unclear with a screen reader, the same information is available as text on the relevant state page. We are continually working to find and fix gaps.</p>

    <h2>Tell us about a barrier</h2>
    <div class="callout">
      <p class="callout__title">${icon('bell')} Report an accessibility issue</p>
      <p class="text-secondary">If you encounter anything on FluTrack that is difficult to use with assistive technology, please email <a href="mailto:${escapeHtml(
        email
      )}">${escapeHtml(
      email
    )}</a> with the page and what you experienced. We take these reports seriously and will respond as quickly as we can.</p>
    </div>

    <p class="muted">This statement was last reviewed in July 2026 and is updated as the site changes.</p>
  `
  )}
  `;

  return {
    title: 'Accessibility statement',
    description:
      'FluTrack targets WCAG 2.2 AA: keyboard-operable, contrast-checked in light and dark, reduced-motion aware. How to report an accessibility barrier.',
    path: '/accessibility/',
    body,
    changefreq: 'yearly',
    priority: 0.3,
    jsonld: [breadcrumbLd(crumbs)],
  };
}
