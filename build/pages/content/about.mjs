import { escapeHtml } from '../../../src/scripts/util.js';
import { icon } from '../../../src/scripts/icons.js';
import { pageHeader, prose, signupBand } from '../../lib/partials.mjs';
import { organizationLd } from '../../lib/seo.mjs';

/**
 * About page — mission, editorial stance (E-E-A-T), independence, funding,
 * and contact. Static, sterile data-visualizer voice; no medical guidance.
 */
export default function about(ctx) {
  const { site, disclaimers } = ctx;

  const body = `
  ${pageHeader({
    eyebrow: 'About FluTrack',
    title: 'Dense CDC data, one plain-English answer',
    lede:
      "FluTrack reads the CDC's weekly respiratory surveillance and translates it into a single, local answer to the question people actually ask: how much flu, RSV and COVID-19 is going around near me — and is it rising or falling?",
  })}

  ${prose(`
    <h2>What FluTrack is</h2>
    <p>Every week, the Centers for Disease Control and Prevention publish an enormous amount about respiratory illness: the share of emergency-department visits tied to flu, RSV and COVID-19, laboratory test positivity, wastewater viral activity, and categorical activity levels — all sliced by state and by pathogen. It is authoritative and public-domain, and it is almost impossible to read at a glance.</p>
    <p>FluTrack exists to close that last mile. We combine those signals into one transparent 0–4 threat level for your state, alongside a plain rising-or-falling trend — the same picture a public-health analyst would assemble, rendered in language anyone can use. We describe what the data shows. We do not tell you what to do about it.</p>

    <h2>Who it's for</h2>
    <p>FluTrack is for the person deciding whether to visit an older relative this weekend, the parent weighing a crowded indoor party, the manager watching for a wave of sick days, and anyone who simply wants to know whether respiratory illness is climbing or easing where they live. Getting that answer should not require an epidemiology degree, a paid subscription, or a login. FluTrack asks for none of them.</p>

    <h2>Our editorial principle: a neutral data visualizer</h2>
    <p>FluTrack is a data-visualization utility — not a publisher of opinion, and not a source of medical guidance. We hold to one editorial rule above all others: <strong>we publish only what the public CDC data shows.</strong> We do not forecast beyond it, we do not editorialize about it, and we do not add advice about vaccination, testing, or treatment. When the underlying data is thin or unsettled — during holiday reporting gaps, say, or within the one-to-two-week window before a week's figures firm up — we label that plainly rather than paper over it. Our job is to represent the CDC's numbers faithfully and legibly. Nothing more, and nothing less.</p>

    <h3>How we show our work</h3>
    <p>Every threat level on FluTrack is traceable back to its inputs. We document exactly which surveillance systems feed the index, and how they are combined, on our <a href="/methodology/">methodology</a> and <a href="/data-sources/">data sources</a> pages. We label whether a reading is live or cached, and we date every figure to the week it represents. We deliberately draw on U.S. Government public-domain sources only, so that anyone can audit, reproduce, or reuse the very same inputs we do.</p>

    <h3>Corrections</h3>
    <p>Surveillance data is revised as later reports arrive, and no translation of it is ever perfect. When an underlying CDC figure is restated, FluTrack's numbers move with it on the next weekly refresh. If we find a mistake in how we have computed or described something, we correct it promptly — and where a change materially alters what a page said, we note the correction rather than quietly editing it away. If something here looks wrong to you, please <a href="/contact/">tell us</a> and we will look into it.</p>

    <h2>Independence from the CDC</h2>
    <p>FluTrack is built entirely on the CDC's public-domain data, but it is an independent project. We have no affiliation, funding relationship, or special access; we read the same open feeds that are available to anyone. Building on government data does not imply that the government endorses this site.</p>
    <div class="callout">
      <p class="callout__title">${icon('check')} Independent, not official</p>
      <p class="text-secondary">${escapeHtml(disclaimers.notAffiliated)}</p>
    </div>

    <h2>How FluTrack is funded</h2>
    <p>FluTrack is free to use, and we intend to keep it that way. It is supported by advertising and by clearly disclosed affiliate links — where we may earn a commission if you buy something through certain links, at no extra cost to you. That revenue never influences the threat levels we report or the way we describe the data: the index is computed the same way no matter who advertises, and it always reflects the CDC's figures alone. You can read exactly how these relationships work on our <a href="/affiliate-disclosure/">affiliate disclosure</a> page.</p>

    <div class="callout callout--warn" role="note">
      <p class="callout__title">${icon('clock')} Not medical advice</p>
      <p>${escapeHtml(disclaimers.notMedical)}</p>
    </div>

    <h2>Get in touch</h2>
    <p>Questions, corrections, press inquiries, and partnership ideas are all welcome. <a href="/contact/">Contact us</a> and a real person will read it.</p>
  `)}

  ${signupBand()}
  `;

  return {
    title: 'About',
    description:
      "What FluTrack is and how we turn public-domain CDC respiratory data into one plain-English state threat level — independent, free, not medical advice.",
    path: '/about/',
    body,
    changefreq: 'monthly',
    priority: 0.5,
    jsonld: [organizationLd()],
  };
}
