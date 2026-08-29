import { escapeHtml } from '../../../src/scripts/util.js';
import { hasPublisherEmail } from '../../lib/site.mjs';
import { icon } from '../../../src/scripts/icons.js';
import { pageHeader, prose } from '../../lib/partials.mjs';
import { breadcrumbLd } from '../../lib/seo.mjs';

/**
 * /accessibility/ — an Accessibility Statement built on measurements, not
 * assertions.
 *
 * The previous version claimed WCAG 2.2 AA conformance and listed features,
 * with no evidence for either, while the project's own release checklist
 * recorded that no screen-reader pass had ever been signed off. A conformance
 * claim stronger than its evidence is worse than the vague statement it
 * replaces, so this page does three things instead: it publishes figures that
 * can be re-derived from the stylesheet, it names what the build enforces
 * automatically, and it states plainly what no person has yet checked with
 * assistive technology.
 *
 * RULE FOR EDITING: every number here was computed from src/styles/tokens.css.
 * If you change a colour token, re-derive them. Do not add a figure you have not
 * measured, and do not move an item out of "not verified" until the release
 * checklist actually carries the sign-off.
 */
export default function accessibility(ctx) {
  const { site } = ctx;
  const email = escapeHtml(site.publisher.email);
  const contactLink = hasPublisherEmail()
    ? `<a href="mailto:${email}">${email}</a>`
    : '<a href="/contact/">our contact page</a>';
  const crumbs = [
    { name: 'Home', path: '/' },
    { name: 'Accessibility', path: '/accessibility/' },
  ];

  const body = `
  ${pageHeader({
    eyebrow: 'Accessibility',
    title: 'Accessibility statement',
    lede:
      'What has been measured on FluTrack, what every build checks automatically, what no screen-reader pass has yet confirmed, and how to report a barrier.',
  })}

  ${prose(
    `
    <h2>Conformance target</h2>
    <p>FluTrack is built against the <strong>Web Content Accessibility Guidelines (WCAG) 2.2, Level AA</strong>. That is a target, not a certification, and this page does not claim full conformance. What follows separates what has been measured, what the build enforces on every change, and what no person has yet checked with assistive technology.</p>

    <h2>What has been measured</h2>
    <p>The figures below are computed from the site's own design tokens and can be re-derived from them.</p>

    <h3>Text contrast</h3>
    <p>Text-and-background pairings were computed in both themes: body, secondary and muted text, links, and the five activity labels on their tinted cards. Every pairing checked clears the 4.5:1 that Level AA asks for at body size, with the tightest measuring just under 5:1 — the “High” activity label on its tinted card, at 5.00:1. Body text sits far above the threshold in both themes.</p>

    <h3>The state map</h3>
    <p>The map's five fill colours are ordered by lightness, not hue alone. Measured relative luminance runs 0.550, 0.353, 0.215, 0.115 and 0.042 from the lowest step of the scale to the highest — strictly decreasing, so the order of the scale survives a greyscale print. The ramp was also run through a standard dichromat simulation: under both deuteranopia and protanopia the luminance order remains strictly decreasing. An earlier ramp inverted under simulated deuteranopia, so a tile at the high end of the scale rendered lighter than one at the low end. That is why this ramp was rebuilt, and it is recorded in the <a href="/changelog/">changelog</a>.</p>
    <p>Colour is not the only channel. Each tile prints its two-letter state code and its numeric level, 0 through 4, and carries a text label naming the state and its level. The state code measures at least 4.77:1 against every fill, because the tile ink switches from dark to white partway up the scale.</p>

    <h2>What the build checks on every change</h2>
    <p>These run as part of the build and stop it when they fail:</p>
    <ul>
      <li>Every button in the generated HTML must have an accessible name — visible text, an <code>aria-label</code>, an <code>aria-labelledby</code> reference or a title. An icon-only control with none of these fails the build.</li>
      <li>Every page must carry a title, a meta description and a canonical, and exactly one top-level heading.</li>
      <li>Every internal link and asset reference must resolve to a file that was actually generated.</li>
      <li>The theme control's dark palette and the operating system's dark palette must declare an identical set of colour values, so one cannot drift from the other.</li>
      <li>Every generated icon and the share image must be decodable and reach the edge of its canvas, so a truncated or blank asset cannot ship.</li>
      <li>No published contact address may use a reserved domain that never resolves.</li>
    </ul>
    <p>A unit-test suite runs alongside them. Several tests are accessibility-specific: that the map emits one keyboard-reachable link for each of the 51 tiles, that each tile carries its numeric level as a non-colour cue, and that the bypass link is present.</p>

    <h2>What is built into the interface</h2>
    <p>Each item was confirmed in the current stylesheet and scripts:</p>
    <ul>
      <li>A skip-to-content link is the first focusable element on every page.</li>
      <li>The map is 51 consecutive tab stops. A “Skip the state map” link sits before it and moves focus past the whole grid in one keystroke.</li>
      <li>Every tile is an ordinary link, so the map works with scripting off. The state directory and the dropdown reach the same pages.</li>
      <li>Keyboard focus is a three-pixel outline held clear of the element it marks. On map tiles it sits outside the tile, so its contrast is against the page rather than the fill underneath.</li>
      <li>Animation is opt-in: tile and gauge animations are declared inside a reduced-motion “no-preference” query, so a system set to reduce motion never applies them.</li>
      <li>In forced-colours mode the severity fills, meter segments and legend swatches opt out of colour substitution, so the five steps do not flatten into one.</li>
      <li>A “prefers more contrast” setting strengthens card and control borders, thickens tile outlines and underlines every link.</li>
      <li>The theme control cycles through light, dark and follow-the-system, rather than pinning a visitor to one override after a single press.</li>
      <li>Links inside running text are underlined, not distinguished by colour alone.</li>
      <li>Wide tables sit in a focusable, labelled scrolling region and keep a minimum width, so they scroll instead of crushing their columns.</li>
      <li>Form errors mark the field invalid, point it at its message, and announce the result in a polite live region.</li>
      <li>Every state page restates its level, composite score and week-over-week direction as a sentence, not only as a graphic.</li>
    </ul>

    <h2>What has not been verified, and is therefore not claimed</h2>
    <p>The project's release checklist requires named manual sign-off for the items below. Every one is currently unsigned, so this statement makes no claim about them.</p>
    <ul>
      <li><strong>Screen readers.</strong> No screen-reader pass has been signed off. NVDA with Chrome and VoiceOver with Safari are both on the checklist and both outstanding. <strong>No claim of screen-reader compatibility is made here.</strong></li>
      <li><strong>200% zoom.</strong> Not signed off.</li>
      <li><strong>Forced colours and reduced motion on real hardware.</strong> Both are implemented in the stylesheet, as described above; neither has been confirmed on a device.</li>
      <li><strong>Viewport widths.</strong> Six widths — 320, 375, 390, 414, 768 and 1024 pixels — are unsigned. The browser used for an earlier measurement pass would not honour a 390-pixel viewport override, so no automated run has certified reflow at handset width.</li>
      <li><strong>Independent audit.</strong> No third party has audited this site.</li>
    </ul>

    <h2>Known limitations</h2>
    <ul>
      <li><strong>Form control borders.</strong> A text input's resting border, and the dropdown's, fall below the 3:1 that WCAG 2.2 asks of a control boundary. The focus outline and the dropdown chevron both clear that threshold, so the control is identifiable once focused or scanned, but the resting border alone is not sufficient on its own.</li>
      <li><strong>The tile level digit.</strong> The small 0-to-4 digit on each map tile is drawn at reduced opacity. Against the middle of the scale it clears the 3:1 asked of a graphical object but not the 4.5:1 asked of small text. It is a redundant cue — the state's level is also given in the tile's text label and in prose on the state page — but it is not itself text-contrast compliant.</li>
      <li><strong>The map is a tile grid.</strong> It is a deliberate simplification, so relative position is approximate. Below roughly 26rem of width it scrolls sideways inside its own container rather than shrinking tiles under the 24-pixel minimum target size.</li>
    </ul>

    <h2>Report a barrier</h2>
    <div class="callout">
      <p class="callout__title">${icon('bell')} Report an accessibility issue</p>
      <p class="text-secondary">If something here is difficult or impossible to use with assistive technology, write to ${contactLink}. Naming the page, the browser and the assistive technology makes a report much faster to reproduce. Reports about the items listed above as unverified are especially useful, because they cover ground no sign-off has reached yet.</p>
    </div>

    <h2>Date basis</h2>
    <p>The contrast figures and the colour-vision simulation were computed from the design tokens in the build dated below, and the automated checks listed are the ones in that build. The sign-off status was read from the release checklist the same day. This statement is revised when the code or that status changes, not on a fixed cycle.</p>
  `,
    { updated: 'August 2026' }
  )}
  `;

  return {
    title: 'Accessibility statement',
    description:
      'What has been measured on FluTrack, what the build checks on every change, what no screen-reader pass has yet confirmed, and how to report a barrier.',
    path: '/accessibility/',
    body,
    changefreq: 'yearly',
    priority: 0.3,
    jsonld: [breadcrumbLd(crumbs)],
  };
}
