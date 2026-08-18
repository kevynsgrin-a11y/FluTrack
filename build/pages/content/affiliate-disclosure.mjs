import { escapeHtml } from '../../../src/scripts/util.js';
import { icon } from '../../../src/scripts/icons.js';
import { pageHeader, prose, signupBand, affiliateLink } from '../../lib/partials.mjs';
import { breadcrumbLd } from '../../lib/seo.mjs';

/**
 * /affiliate-disclosure/ — Affiliate & Advertising Disclosure. Required for
 * ad-network eligibility and FTC compliance, and load-bearing for trust on a
 * free, ad-supported YMYL utility. States plainly how FluTrack is funded
 * (display advertising + disclosed affiliate links), that money never touches
 * the threat level (the index is computed from CDC data and is never for sale
 * or sponsorship), that ads and affiliate links are labeled and kept separate
 * from the data, and — in plain language — that we follow the FTC's endorsement
 * guidelines. Reiterates that nothing here is medical advice or a product
 * endorsement. Sterile data-visualizer voice; legal wording drawn from
 * ctx.disclaimers.
 */
export default function affiliateDisclosure(ctx) {
  const { disclaimers } = ctx;

  const crumbs = [
    { name: 'Home', path: '/' },
    { name: 'Affiliate & Advertising Disclosure', path: '/affiliate-disclosure/' },
  ];

  const body = `
  ${pageHeader({
    eyebrow: 'Disclosure',
    title: 'Affiliate & Advertising Disclosure',
    lede:
      'FluTrack is free to use. This page explains, plainly, how the site pays for itself — through display advertising and clearly labeled affiliate links — and, just as importantly, the firewall that keeps that money from ever touching the threat level we report.',
  })}

  ${prose(
    `
    <div class="callout">
      <p class="callout__title">${icon('check')} The short version</p>
      <p class="text-secondary">FluTrack is supported by display advertising and by affiliate links. If you click certain links and buy something, we may earn a commission — at no extra cost to you. None of that changes the threat level. The index is computed from public-domain CDC data alone, and it is never for sale, sponsorship, or promotion.</p>
    </div>

    <h2>How FluTrack is funded</h2>
    <p>FluTrack turns the CDC's weekly respiratory surveillance into a plain-English threat level, free of charge and without a login. Keeping a free utility online still costs money, and we fund it in two ordinary ways: <strong>display advertising</strong> served on the site, and <strong>affiliate links</strong> to products and services a reader might reasonably look for after checking respiratory activity. We disclose both here so you always know how the site earns, and can weigh what you read accordingly.</p>

    <h2>What an affiliate link is</h2>
    <p>An affiliate link is a normal link that carries a referral code. If you follow one of these links and go on to make a purchase, the merchant may pay FluTrack a small commission for the referral. The price you pay is exactly the same whether you use our link or navigate to the merchant directly — <strong>the commission comes out of the merchant's margin, at no extra cost to you.</strong></p>
    <p>Where they appear, affiliate links point to categories that relate to respiratory-illness season — for example:</p>
    <ul>
      <li><strong>Telehealth services</strong>, for people who want to speak with a clinician;</li>
      <li><strong>At-home test kits</strong> for flu, COVID-19 and other respiratory illnesses;</li>
      <li><strong>Air purifiers, filters and indoor-air products</strong>; and</li>
      <li><strong>Masks and other personal protective equipment (PPE)</strong>.</li>
    </ul>
    <p>Listing a category is not a recommendation that you buy anything in it. FluTrack describes what the CDC's data shows; it does not tell you what to purchase, and the presence of an affiliate link says nothing about whether a product is right for you.</p>

    <h2>Advertising and affiliate revenue never influence the data</h2>
    <p>This is the part that matters most, so we will be unambiguous about it. <strong>No advertiser and no affiliate partner can influence the threat level, the trend, or anything else FluTrack reports about respiratory activity.</strong> The index is computed purely from public-domain CDC surveillance signals — emergency-department visits, laboratory test positivity and wastewater viral activity — using the same published method for every state, regardless of who advertises or which links a page carries.</p>
    <div class="callout callout--warn" role="note">
      <p class="callout__title">${icon('alert')} The threat level is not for sale</p>
      <p>A state's reading is never sold, sponsored, promoted, or adjusted for any commercial reason. No payment can raise or lower a threat level, feature a state, or change how the data is described. If it could, the number would be worthless — so it cannot.</p>
    </div>

    <h2>Advertising is kept separate from the data</h2>
    <p>Advertising and editorial data live in separate lanes. Display ads are supplied by third-party advertising partners and are presented as advertising — distinct from the CDC-derived threat level, pathogen breakdown, and underlying signals, which are ours and are never sponsored. An advertiser's presence on a page has no bearing on the numbers shown beside it. We do not let sponsors review the data before it publishes, and we do not shade our description of the CDC's figures to suit anyone paying to reach our readers. How the index is built is documented in full on our <a href="/methodology/">methodology</a> and <a href="/data-sources/">data sources</a> pages, so anyone can check it against the public feeds.</p>

    <h2>How we label ads and affiliate links</h2>
    <p>We aim to make the commercial parts of the page obvious rather than disguised. Advertising is presented as advertising. Every affiliate or sponsored link on FluTrack is rendered by a single shared component that carries its disclosure with it, so the label cannot drift away from the link it describes. It looks exactly like this, every time:</p>

    ${affiliateLink({ label: 'Visit merchant', example: true })}

    <p style="margin-top: var(--space-lg)">The disclosure always appears <strong>immediately before</strong> the link, never in a footer or a collapsed panel, and the link itself carries <code>rel="sponsored nofollow"</code> so search engines can see the relationship too. Our build fails if a sponsored link ever ships without that disclosure attached — this is enforced mechanically, not by remembering. You should never have to guess whether FluTrack stands to earn from a link.</p>

    <h2>What we will never target</h2>
    <p>This is a respiratory-illness data utility, and that puts one particular temptation in front of us: the ability to sell against fear. We do not. <strong>No advertising or affiliate placement on FluTrack may be targeted using any of the following:</strong></p>
    <ul>
      <li><strong>Precise location</strong> — beyond the state page you chose to look at;</li>
      <li><strong>Alert status</strong> — whether you have subscribed to surge alerts, or been sent one;</li>
      <li><strong>Threat level</strong> — a state's reading may never be used to select, price, or intensify a commercial message;</li>
      <li><strong>Symptom, diagnosis, or health condition</strong> — inferred or stated;</li>
      <li><strong>Pregnancy</strong>;</li>
      <li><strong>Age</strong>; and</li>
      <li><strong>Inferred vulnerability</strong> of any other kind.</li>
    </ul>
    <div class="callout callout--warn" role="note">
      <p class="callout__title">${icon('alert')} Severity is not a targeting signal</p>
      <p>Showing a reader more or different commercial content <em>because</em> their state's respiratory activity is climbing would turn a public-health readout into a pressure tactic. The threat level drives what the data says and nothing else. It is not passed to any advertising system, and it is not available as a targeting parameter to any partner.</p>
    </div>
    <p>These rules bind our partners as well as us: any advertising or affiliate arrangement we enter carries them as a condition, and we will end an arrangement rather than relax them. They are recorded alongside our <a href="/vendors/">vendor register</a>, and any change to them is logged in our <a href="/changelog/">changelog</a>.</p>

    <h2>Following the FTC's guidance</h2>
    <p>In the United States, the Federal Trade Commission asks websites to disclose, clearly and conspicuously, any financial relationship behind a recommendation or a link — so that readers can factor it in. Its Endorsement Guides (16 CFR Part 255) are the plain-language rulebook for this. This page, together with the labels on individual links, is how FluTrack meets that standard: we tell you up front that we may be paid when you buy through certain links, we keep those disclosures near the links themselves, and we do not dress up paid placement as neutral editorial content. When we describe the CDC's data, that description is not sponsored; when a link can earn us a commission, we say so.</p>

    <h2>Not an endorsement, and not medical advice</h2>
    <p>An affiliate link is a funding mechanism, not a seal of approval. FluTrack does not test, certify, or vouch for the products and services these links point to, and their inclusion is not an endorsement of any brand, seller, test, device, treatment, or vaccine. Merchants set their own prices, availability, terms, and privacy practices, and we do not control them.</p>
    <div class="callout callout--warn" role="note">
      <p class="callout__title">${icon('clock')} Not medical advice</p>
      <p>${escapeHtml(disclaimers.notMedical)}</p>
    </div>
    <p>Nothing on this page — and no product or service linked from it — should be read as guidance about testing, treatment, prevention, or your personal risk. Decisions about your health belong between you and a qualified health provider, not a link. ${escapeHtml(
      disclaimers.notAffiliated
    )}</p>

    <h2>Questions</h2>
    <p>If anything about how FluTrack is funded is unclear, or you spot a link that should be labeled and is not, please <a href="/contact/">tell us</a> and we will fix it. You can also read how affiliate and advertising data is handled in our <a href="/privacy/">Privacy Policy</a>, and the governing terms on our <a href="/terms/">Terms of Use</a> page.</p>

    <div class="callout">
      <p class="callout__title">${icon('check')} The bottom line</p>
      <p class="text-secondary">FluTrack earns from advertising and from disclosed affiliate links, at no extra cost to you. That revenue keeps the site free — and it never touches the CDC-derived threat level, which is computed the same way for every state and is never for sale. ${escapeHtml(
        disclaimers.short
      )}</p>
    </div>
  `,
    { updated: 'August 2026' }
  )}

  ${signupBand()}
  `;

  return {
    title: 'Affiliate & Advertising Disclosure',
    description:
      'How FluTrack is funded: display advertising and disclosed affiliate links, at no extra cost to you. Revenue never influences the CDC-derived threat level.',
    path: '/affiliate-disclosure/',
    body,
    changefreq: 'yearly',
    priority: 0.3,
    noindex: false,
    jsonld: [breadcrumbLd(crumbs)],
  };
}
