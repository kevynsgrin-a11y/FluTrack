# FluTrack — image & content generation plan

**Date:** 2026-08-16
**Scope:** visual assets and editorial content. What exists, what is broken, what is missing, and ready-to-paste generation prompts for every proposed asset.
**Companion:** `docs/FRONTEND-AUDIT.md` (code/a11y/perf/SEO audit and its two remediation passes). This document does not repeat those findings.

**Method:** three independent audits — visual assets, content, and YMYL/brand-safety compliance — run in parallel over the source tree and the built `dist/`. Every P0 was independently re-verified against the artifacts before being written up. Verification commands are given inline so each claim can be re-run.

---

## Executive summary

The site's **code** is in good shape after two remediation passes. Its **shipped media** and **editorial surface** are not.

| Layer | State |
|---|---|
| Build, CSS, JS, a11y, perf, SEO plumbing | Strong — see `FRONTEND-AUDIT.md` |
| **Raster assets** | **Every committed PNG is truncated. The favicon is blank.** |
| **The one shared social card** | **Broken four ways, and depicts fabricated per-state health data.** |
| **Contact** | **No working route anywhere on the site.** |
| **Factual self-consistency** | **55 of 66 pages contradict the methodology page about the site's own inputs.** |
| Editorial depth / E-E-A-T | No named human, no editorial policy, no corrections log, no guides, no glossary |

The four bolded rows are launch blockers. None is expensive; all are invisible to `npm run verify` today.

---

# Part 1 — Defects in shipped assets

## D1 · Every committed PNG is truncated by 87 px · **P0**

`build/lib/rasterize.mjs` drives Chromium with `--window-size=W,H`. In `--headless=new` the *viewport* comes out at `H − 87` (browser UI chrome), so every render loses the bottom 87 rows.

Verify:

```bash
node --input-type=module -e "
import { readFileSync } from 'node:fs';
import { decodePng, paintedRows } from './build/lib/png.mjs';   # see fix below
for (const f of ['favicon-32.png','apple-touch-icon.png','icon-192.png',
                 'icon-512.png','icon-maskable-512.png','og-default.png']) {
  const img = decodePng(readFileSync('src/assets/' + f));
  console.log(f, img.w + 'x' + img.h, 'painted rows:', paintedRows(img).count);
}"
```

Measured:

| File | Canvas | Painted rows | Lost | Consequence |
|---|---:|---:|---:|---|
| `favicon-32.png` | 32 | **1** | 31 (97%) | **Blank favicon**, and a blank `/favicon.ico` |
| `apple-touch-icon.png` | 180 | 93 | 87 (48%) | iOS home screen shows half a shield |
| `icon-192.png` | 192 | 105 | 87 (45%) | Android launcher / install prompt |
| `icon-512.png` | 512 | 425 | 87 (17%) | PWA splash **and `Organization.logo` in JSON-LD** |
| `icon-maskable-512.png` | 512 | 425 | 87 (17%) | as above |
| `og-default.png` | 630 | 543 | 87 (14%) | Dead band on every share card |

The lost height is **Chrome-version-dependent** — calibrate at runtime, never hardcode 87.

## D2 · The social card's brand mark is blown up to full canvas · **P0**

`rasterize.mjs` emits an **unscoped** `svg { width:${w}px; height:${h}px }`. That also matches the nested 84 px brand mark that `assets.mjs` embeds inside `ogSvg()`, inflating it to 1200×630 — a giant ghost shield painted straight across the cartogram. Fix: scope to `body > svg`.

## D3 · Duplicate SVG `id="bg"` kills the mark's fill · **P0**

`ogSvg()` defines `<linearGradient id="bg">` and the nested `iconSvg()` defines its own `id="bg"`. `url(#bg)` resolves to the *first* in document order — the pale page background — so the intended small logo beside the "FluTrack" wordmark is invisible. Fix: namespace nested ids (`idns` parameter).

## D4 · The social card depicts fabricated per-state severity · **P0 — integrity**

`build/lib/assets.mjs:45`:

```js
/** Deterministic plausible severity per state for static art (summer-ish skew). */
function ogLevel(abbr) { … return r < 42 ? 0 : r < 72 ? 1 : … }
```

Every state's colour on the shared card is a **hash of its abbreviation**, rendered under a "Minimal → Very High" legend and the caption *"One local respiratory threat level, built on public CDC data"*, with no "sample" marker.

This is the image-layer instance of the Tier-0 defect the previous audit fixed for data — synthetic values presented as real surveillance — on the single most-distributed asset the site owns. One card represents all 66 pages on every share, stripped of the footer disclaimer.

**Fix before adding any other imagery**, or the pattern gets codified. Three acceptable resolutions: label it visibly as illustrative; neutralise the tiles to a single brand tint; or generate from the real snapshot with a visible week-ending stamp.

## D5 · "Maskable" icon is a byte-identical copy of the standard icon · **P0**

`md5sum src/assets/icon-512.png src/assets/icon-maskable-512.png` → identical (`a029a09d…`).

`iconSvg()` uses `pad = size * 0.16`, so the shield spans 68% of the canvas; its centre-to-corner radius is **48.1%** of the canvas against Android's **40%** maskable safe radius — clipped by 8.1 percentage points, plus the rounded corners cropped to the OS background.

A maskable icon needs a **square, full-bleed, opaque** background with the glyph confined to ~66% of the canvas (340 px of 512), centred.

## D6 · The social card uses a severity ramp the site no longer has · **P1**

`assets.mjs` hardcodes `MAP_FILLS = ['#1c6b41','#467019','#795e00','#a04a00','#9b1c1c']`. The live map uses `--map-0…4` = `#90d2ac / #90ab36 / #aa760e / #a73c07 / #741313`.

**This drift was introduced by the second remediation pass** (`docs/FRONTEND-AUDIT.md`), which rebuilt the ramp in `tokens.css` for monotonic luminance and CVD safety but did not update the hardcoded copy in the OG generator. The share card therefore advertises a scale nobody sees on the site, and does not carry the accessibility guarantee the rebuild existed to provide.

## D7 · `og-default.png` is 322 KB — over WhatsApp's ~300 KB thumbnail ceiling · **P1**

322 KB of RGBA for flat vector art (0.44 B/px). Chromium writes with default filtering. Adaptive per-row filtering + `deflateSync({level:9})` lands ~130 KB; a 128-colour median-cut palette lands ~45 KB.

## D8 · Alpha channels on surfaces that flatten them · **P2**

`--default-background-color=00000000` makes every icon transparent. iOS composites `apple-touch-icon` onto **black**; `Organization.logo` should read on white. Emit opaque PNGs for `apple-touch-icon.png`, `icon-maskable-512.png` and `og-default.png`.

## D9 · Two source SVGs shipped to the CDN, referenced by nothing · **P3**

`icon-source.svg` (813 B) and `og-source.svg` (14.6 KB) are written into `dist/assets/` by `assetFiles()` and linked from nowhere.

## D10 · No build check opens a PNG · **P2**

`build/check.mjs` validates links, `_headers` overlap, dark-token parity, RFC-2606 addresses and ES-module parsing. **All six broken rasters pass `npm run verify` today.** Without a guard this class recurs.

---

# Part 2 — Defects in shipped content

## C1 · The site contradicts itself about its own inputs on 55 of 66 pages · **P0**

`/methodology/` and `/data-sources/` document **four** signals. These enumerate **three**, silently dropping the ARI activity level (weight 0.25):

| File | Line |
|---|---|
| `build/pages/home.mjs` | 88 |
| `build/pages/content/alerts.mjs` | 66 |
| `build/pages/content/medical-disclaimer.mjs` | 37 |
| `build/pages/content/affiliate-disclosure.mjs` | 56 |
| `build/pages/state.mjs` | 177 — replicated across **all 51 state pages** |

Verify: `grep -rl 'emergency-department visits (NSSP), wastewater viral activity (NWSS) and laboratory test positivity (NREVSS)' dist/ --include=index.html | wc -l` → `51`.

A YMYL reviewer comparing the home page to the methodology page finds the site disagreeing with itself about what it measures. **Fix first** — an editorial policy published on top of this documents a rule the site breaks on its own home page.

Fix: a single `SIGNALS_SENTENCE` constant in `site.mjs` beside `disclaimers`, used at all five sites.

## C2 · No working contact route exists anywhere · **P0**

`grep -ro 'mailto:' dist/ | wc -l` → **0**.

`site.publisher.email` is the RFC-2606 placeholder `hello@flutrack.example`. `hasPublisherEmail()` correctly suppresses it — but the fallback copy left behind is worse than the gap it papers over. All four `/contact/` routes render:

> "General question — email routing is being set up; use the alert form below in the meantime."

The alert form is a subscribe endpoint accepting only `email` + `state`, returning `501` without the KV binding. **It cannot carry a message.** Meanwhile the same page promises *"Pick the route that fits and a real person will read what you send"* and *"We read everything that comes in."*

Routed to this dead page: `/privacy/` (GDPR/CCPA access and deletion requests), `/accessibility/` (barrier reports), `/terms/` (§14), `/about/` (*"a real person will read it"*), `/medical-disclaimer/`, `/data-sources/`, `humans.txt`, `.well-known/security.txt`, and every page footer.

**This gating was introduced by the second remediation pass.** Removing the dead address was right; the fallback that directs people to a form which cannot receive their message, while still promising a reply, was not.

Two things are needed: a real monitored mailbox (a decision, not engineering), and honest interim copy that names a channel that actually works rather than one that doesn't.

## C3 · "Nearby states" is not nearby · **P0**

`neighborsFor()` groups by HHS region — the right join key for NREVSS data, the wrong word for a reader. `/state/california/` renders:

> "You can also compare nearby states such as Arizona, Hawaii and Nevada."

Hawaii is 2,500 miles from California. 51 pages assert something plainly false, on a site whose entire value is being trustworthy about data. Fix: rename to "Other states in HHS Region 9" (and give it a region page to link to), or add a real adjacency table.

## C4 · Content depth

Main-content word counts, `dist/`:

| Page | Words | Note |
|---|---:|---|
| `/accessibility/` | 339 | Conformance claim with no evidence — while `FRONTEND-AUDIT.md` holds measured contrast ratios, CVD-simulation results and a WCAG 2.2 target that never reached the public page |
| `/states/` | 622 | 51 chips, two sentences, `priority: 0.9` in the sitemap |
| `/contact/` | 719 | Structurally good, functionally dead (C2) |
| `/alerts/` | 761 | Never shows what an alert looks like; never states the ±8% trigger |
| `/data-sources/` | 898 | H1 promises *"Every number here traces back to the CDC"*; the **Dataset** column carries no dataset identifiers, though `vutn-jzwm` / `f3zz-zga5` / `atcp-73re` ship to browsers in the JS |
| `/about/` | 912 | Completely anonymous |
| `/` (home) | 961 | H1 carries no query term; zero data-derived prose |
| `/faq/` | 1,425 | Best page on the site; two answers are compressed articles |
| `/methodology/` | 2,217 | Excellent |
| Each state page | ~665 | ~95 words genuinely unique (`stateSummary()`) |

Missing entirely: guides, glossary, editorial policy, corrections log, methodology changelog, rankings, region pages, seasonal content, any named human.

---

# Part 3 — The advice line

The single most reusable artifact in this document. FluTrack's own rule, from `/about/`:

> "we publish only what the public CDC data shows. We do not forecast beyond it, we do not editorialize about it, and we do not add advice about vaccination, testing, or treatment."

Operationalised: **FluTrack may describe a measurement, its provenance, its method, its limits, and its movement. It may not describe a reader, a reader's risk, a reader's illness, or a reader's next action.**

Four tests — failing any one fails the sentence:

1. **Second person.** Subject is "you" or an implied you → advice.
2. **Imperative / deontic modal.** `should`, `need to`, `make sure`, `avoid`, `consider`, applied to anything but reading the data → advice.
3. **Tense.** Future tense about disease activity → forecasting.
4. **Referent.** If the referent narrows from a state/week/signal/method to a person, household or age band → advice.

Safe move when a reader clearly wants an action: **point at who does give guidance.** Use verbatim — *"For guidance about your health, consult a qualified health provider."*

## Paired examples

| Situation | SAFE | UNSAFE |
|---|---|---|
| Interpreting a level | "Ohio's composite is 68 of 100 (High). ED visits for respiratory illness are 6.1% of all visits, up from a prior three-week average of 5.2%." | "Ohio is at High — you should avoid indoor gatherings this week." |
| Level → personal risk | "A 'Low' reading does not mean you are safe, and a 'High' reading does not mean you are sick." *(existing copy)* | "At High, there's a good chance you'll catch something." |
| Vaccination timing | "In each of the last three seasons, influenza ED visits first crossed the Moderate band in weeks 46–48." | "Now is the right time to get your flu shot." |
| Symptoms | "The ED-visit signal counts visits coded to influenza, RSV or COVID-19. It does not distinguish which illness any individual has." | "Fever plus body aches during a High flu week usually means influenza." |
| Gatherings | "Thanksgiving week (MMWR 47) coincided with the steepest week-over-week rise in four of the last five seasons." | "Hosting Thanksgiving? At Very High, consider moving dinner outdoors." |
| Masks | "Masks are one of the affiliate categories on this site. Listing a category is not a recommendation." *(existing copy)* | "Mask up in crowded indoor spaces once your state hits High." |
| Testing | "Positivity reflects testing behaviour — who chooses to get tested — as much as prevalence." *(existing copy)* | "If activity is High and you feel unwell, take an at-home test." |
| High-risk groups | "The NSSP product is published by state, not by age band. The index does not resolve risk for any group." | "If you're over 65, take extra precautions when your state reads High." |
| Travel | "Compare two states' reported activity side by side." | "Avoid travel to the states shaded red." |
| Trend → prediction | "The trend compares the latest week against the mean of the prior up-to-three weeks, with a ±8% band." | "At this rate, your state will peak in about two weeks." |
| Season framing | "This is the highest composite FluTrack has recorded for this state since it began publishing on 19 July 2026." | "This is shaping up to be the worst flu season in a decade." |
| Treatment | *(no safe version — out of scope)* "FluTrack does not describe treatments." | "Antivirals work best within 48 hours — ask about Tamiflu." |
| Ranking | "The ten states with the highest composite score, week ending 14 Nov." | "The ten most dangerous states for flu right now." |
| Alert subject | "Ohio: respiratory activity rising (Moderate → High), week ending 14 Nov" | "⚠️ URGENT: Flu is surging in Ohio — protect your family now" |

## The line applies to images

An image asserts as forcefully as a sentence and carries no hedging.

| SAFE image | UNSAFE image |
|---|---|
| Abstract brand-palette diagram of a sampling flow | Photo of a person coughing |
| The site's own gauge / tile grid as SVG | A doctor pointing at a chart |
| Line chart with axes, units and a source line | A family gathering captioned with a threat level |
| Alt: "Line chart: combined ED visits, Ohio, weeks 40–52" | Alt: "Chart showing dangerously high flu levels in Ohio" |

**Rule: any image depicting a person in a health context is an assertion about that person's health status and is out of scope.** This resolves the advice-line, model-release, false-light and brand-safety problems in one line.

---

# Part 4 — Compliance guardrails for new media

## 4.1 Affiliation

**CDC *data* is public domain. CDC *marks* are not.** Nothing about `data.cdc.gov`'s licensing extends to CDC's brand.

The site already does this well — `/methodology/`: *"They are not CDC-defined cut points, and no U.S. government agency sets, reviews, or endorses them."* `/terms/` §7 makes it a term of use that readers must not misrepresent the data as official. The visual identity is deliberately non-federal: teal `#0b7285` (not federal navy/gold), a tile cartogram (not a geographic choropleth), a green→red ramp matching no CDC dashboard.

Prohibited in any new asset: CDC/HHS logos, seals, wordmarks; the Great Seal; `.gov` banner conventions; USWDS components or Public Sans; CDC dashboard palettes; screenshots of CDC dashboards; converting the `NSSP`/`NWSS`/`NREVSS` text tags into agency logos; any lock/shield/checkmark "verified" badge beside a figure.

**Watch the brand mark.** It is already a shield. A teal shield outline is fine; a shield with stars, stripes, an eagle, a laurel wreath, gold-on-navy, or circular badge framing is not.

Banned phrasing in copy, headings, alt text, filenames and meta: *official*, *CDC-approved*, *CDC-verified*, *government-verified*, *certified*, *in partnership with the CDC*, *powered by the CDC*, *federal respiratory alert*. Permitted, and already in use: *built on public-domain CDC surveillance data*, *derived from*, *we read the same open feeds available to anyone*.

**Highest blast radius: the OG card and the alert email** — both are consumed stripped of the footer disclaimer.

## 4.2 Brand safety

The README already names the stake: the sterile posture exists so the site "stays defensible under Google's YMYL / E-E-A-T scrutiny and premium ad-network brand-safety rules." Getting classified as crisis content suppresses demand across the whole domain, not one page.

**Never:** ICU beds, ventilators, ambulances, morgues, body bags, grieving people; crisis photojournalism including 2020-era stock (empty streets, hazmat teams, testing queues); sick children; menacing red-lit virion renders with backlit spikes (the default flu-article stock image, and precisely what fear classifiers are tuned to); biohazard symbols, skulls, sirens; blood-red full-bleed backgrounds.

**Safe:** the site's own SVG output; diagrammatic explainers in the brand palette; charts with visible axes, units and a source line; abstract geometric texture.

**Banned lexis:** *deadly, killer, ravages, explodes, slams, worst ever, nightmare, outbreak* (as a headline noun for routine seasonal activity), *emergency, crisis, experts warn, what doctors won't tell you*.

**One honest note on "surge":** the flagship retention product is *surge alerts*. It survives because every use is immediately defused — `/alerts/` is headed *"A heads-up, not an alarm"* and states *"It is not an emergency notification, and it is not a medical alert."* **Do not extend the word beyond the product name.**

**Ad placement**, per the firewall `/affiliate-disclosure/` already commits to: no ad slot inside the threat card, between the level and `trendDisclaimer()`, or inside `signalRows`. No native unit styled as `.card` or `.callout`. No product image adjacent to a state's level. Never sell, sponsor or feature a state.

## 4.3 Licensing

The site already enforces a commercial-licence rule **in code** — `excludeNonCommercial()` drops WastewaterSCAN/SCAN/Verily rows because CC BY-NC 4.0 bars commercial use and the site carries ads. `/data-sources/`: *"This is not left to good intentions."*

**Images and text must meet that same bar: an explicit rule, a machine check, and a public statement.**

| Class | Use? | Conditions |
|---|---|---|
| Own work (build-generated SVG, own charts) | ✅ Preferred | Zero exposure. Current state; keep it the default. |
| CC0 / public domain | ✅ | Record the source anyway. |
| US Government public domain | ⚠️ Legal, still unwise | Reintroduces affiliation risk. A CDC PHIL photo is legal and still a bad idea. PHIL also contains flagged third-party items. |
| CC BY 4.0 | ✅ with attribution | Needs title, creator, source, licence + link, modification note — i.e. a `<figcaption>` mechanism that does not exist yet. |
| Paid stock, standard RF commercial | ✅ | Retain invoice and licence ID. Check for medical-context restrictions. |
| **CC BY-NC / NC-SA / NC-ND** | ❌ | Same logic as WastewaterSCAN. Ads are a commercial use, sitewide. |
| **CC BY-SA** | ❌ | ShareAlike on an adapted work contradicts `/terms/` §8's ownership claim over the presentation. Bright-line exclusion is cheaper than case-by-case. |
| **Editorial-use-only stock** | ❌ | Barred from commercial contexts. The most common licensing failure on monetized health sites. |
| **Wikimedia without per-file check** | ❌ | Licence is per file. "It was on Commons" is not a licence. |
| **WHO material** | ❌ | CC BY-NC-SA — fails on both grounds. Worth naming; it is an obvious-looking source. |

**Model releases / identifiable people.** Separate from copyright and sharper here: a photo of an identifiable person beside a "High respiratory activity" heading implies that person is ill. A release covers likeness; it does not cure a defamatory implication. **Simplest defensible rule: no identifiable people in any image.**

**AI-generated imagery.** Purely machine-generated output is not copyrightable in the US, which sits awkwardly against `/terms/` §8. Generator terms vary and bind — some plans prohibit health use outright. Label decorative AI illustration in the caption; never depict a real person, place or event; preserve provenance metadata.

> **Hard prohibition:** never AI-generate a chart, map, dashboard, or anything that reads as a screenshot of surveillance output. An AI-generated chart is fabricated data wearing the costume of a measurement — the same defect as D4.

## 4.4 E-E-A-T — what can be added honestly

Google's QRG recognises that required expertise varies with purpose. **For a page whose purpose is "faithfully report what a public dataset says," the relevant expertise is data provenance and methodological transparency, not clinical credentials.**

**Present and genuinely strong:** `/methodology/` (every weight, breakpoint and cut point, a worked example, a Limitations section); `/data-sources/` with a licence column and a code-enforced exclusion; a stated editorial principle; a corrections *policy*; complete legal set; transparent monetization with a stated firewall; consolidated `Organization` JSON-LD with `email`/`sameAs` correctly suppressed when unverified; honest live-vs-sample provenance labelling.

**Absent:** any named human; a working contact route; a standalone editorial policy; a corrections *log*; honest maintainable dates (`updated: 'July 2026'` is a hardcoded literal on six pages); any off-site identity; published dataset identifiers.

**Addable honestly, in value order:**

1. **A real monitored mailbox.** One line in `site.mjs`; `hasPublisherEmail()` unlocks everything automatically.
2. **Name the person responsible**, with an honest bio: *"FluTrack is built and maintained by [name]. [Name] is not a clinician; FluTrack does not provide medical advice, and its thresholds are editorial choices documented on the methodology page."* **A named non-expert is a materially stronger trust signal than an anonymous site**, and stating the limits of your expertise is itself an E-E-A-T positive.
3. `/editorial-policy/` — hoisting rules already scattered across five pages.
4. `/corrections/` — seeded with three real, already-fixed bugs.
5. Version the methodology; `/methodology/` already promises *"If the method changes, this page changes with it."*
6. Print the Socrata dataset IDs and query window on `/data-sources/`.
7. Link the source repository — a verifiable method is this project's honest substitute for credentials.

**FORBIDDEN — manufacturing false authority.** Each is a deceptive trust claim on a YMYL page, not a nice-to-have:

- **A "Medically reviewed by Dr. —" badge when no clinician reviewed anything.** The worst thing this expansion could produce.
- Upgrading `statePageLd` to `MedicalWebPage` — that type invites `reviewedBy`/`lastReviewed` and no review occurs. Plain `WebPage` with `MedicalCondition` entities in `about` is the correct, honest modelling.
- "The FluTrack research team", "our epidemiologists", "our medical advisory board".
- Stock or AI headshots attached to bylines.
- Fabricated credentials, trust seals, accreditation badges, awards, "as seen in" strips.
- Fake testimonials — directly actionable under 16 CFR Part 465.
- Claiming the methodology is "peer-reviewed", "validated" or "clinically validated." It is *transparent*. That is a different, defensible, true claim.
- Bulk AI-written clinical content. It converts a defensible data utility into an undifferentiated health site competing where it has no authority. The fix for thin state pages is **more data-derived specificity**, never more generic health prose.

## 4.5 Required disclosures by content type

Always automatic via `layout.mjs`: the footer strip (`Not medical advice.` + `disclaimers.notAffiliated`). That is the floor, not sufficient alone.

Existing reusable strings: `disclaimers.short` · `.notAffiliated` · `.notMedical` · `.trendNotLive` · `trendDisclaimer()` · `signupBand()`.

| Content type | Required |
|---|---|
| **Explainer** | New `disclaimers.explainerScope` near the top; `trendDisclaimer()` if any figure appears; `.notMedical` in a warn callout at close; `/affiliate-disclosure/` link if a product category is named |
| **Glossary** | One page-level notice (new `disclaimers.glossaryScope`) + `.short`; every clinically-adjacent term defines the **measure**, not the condition |
| **Seasonal** | `trendDisclaimer()` + `.notMedical` + new `disclaimers.retrospective`; visible published/updated dates; **re-dated or retired each season** |
| **State page** | Already compliant. On adding images: alt restates, never interprets. Any "what to do" module must instead be a *"where to find official guidance"* module |
| **Ranking** | `trendDisclaimer()` + `.notMedical` + dated week stamp + new `disclaimers.rankingScope` explaining that states reporting fewer signals rest on fewer inputs; superlatives banned; **regenerate with the data or freeze and label** |
| **Alert email** | **The footer strip does not travel with email** — restate `.short`, `.notAffiliated`, `.trendNotLive`, links to `/medical-disclaimer/` and `/privacy/`, one-click unsubscribe, plus new `disclaimers.alertScope`. ⚠️ **If the email carries any promotional content it is a commercial message under CAN-SPAM and requires a valid physical postal address, which the site does not publish.** Keep alert emails strictly transactional, or obtain an address. |
| **Blog** | Footer strip + `.notMedical` + `trendDisclaimer()` if data shown. **Two permitted lanes only:** data commentary, or project/meta. There is no third lane. |

---

# Part 5 — Visual asset plan

## Format rules (from this site's actual constraints)

- **CSP `img-src 'self' data:`** forbids any CDN, third-party or hotlinked image. Everything ships from `/assets/` or is inlined.
- **Theme-awareness has exactly one reliable mechanism: inline SVG.** The toggle sets `data-theme` on `<html>`. An SVG loaded through `<img>` is a separate document — it cannot see `data-theme` or read `var(--brand-500)`, and self-responding to `prefers-color-scheme` **desynchronises from the manual toggle**. External files are acceptable only for theme-independent art (icons, OG cards, screenshots).
- **The site currently has zero `<img>` and therefore zero image-driven CLS.** Any raster introduced must carry explicit `width`/`height` (or an `aspect-ratio` wrapper), `decoding="async"`, and `loading="lazy"` unless above the fold.
- **`_headers` trap:** `build/check.mjs` fails the build when a file matches two `Cache-Control` rules. `/assets/og/ca.png` would match `/assets/*.png` *and* a new `/assets/og/*` rule. Put per-state cards at `/og/<slug>.png` (site root) or narrow the existing rule first.

## Asset register

| ID | Asset | Placement | Format | Size budget | Priority |
|---|---|---|---|---|---|
| A1 | `favicon-32.png` regenerate | `layout.mjs` `<link rel=icon>`; payload of `/favicon.ico` | PNG-8 | ≤ 1.0 KB | **P0** |
| A2 | `favicon.ico` regenerate | `layout.mjs` | ICO | ≤ 1.2 KB | **P0** |
| A3 | `apple-touch-icon.png`, **opaque** | `layout.mjs` | PNG, no alpha | ≤ 6 KB | **P0** |
| A4 | `icon-192.png` regenerate | manifest | PNG RGBA | ≤ 6 KB | **P0** |
| A5 | `icon-512.png` regenerate + re-encode | manifest **+ `Organization.logo`** | PNG | ≤ 20 KB | **P0** |
| A6 | `icon-maskable-512.png` **new artwork** | manifest `purpose: maskable` | PNG opaque full-bleed | ≤ 14 KB | **P0** |
| A7 | `og-default.png` fix + shrink + correct ramp | `og:image` on all 66 pages | PNG opaque | ≤ 120 KB | **P0** |
| A8 | 51 per-state OG cards | `/state/<slug>/` | PNG | ≤ 60 KB ea | P1 |
| A9 | 11 content-page OG cards | content pages | PNG | ≤ 45 KB ea | P2 |
| A10 | PWA screenshots (wide + narrow) | `manifest.screenshots[]` | PNG — **real captures** | ≤ 180 KB ea | P2 |
| A11 | **Multi-week composite history chart** | state pages + home | **inline SVG** | ≤ 2.5 KB markup | **P1** |
| A12 | Methodology pipeline diagram | `/methodology/` | inline SVG hand-authored | ≤ 4 KB | P2 |
| A13 | Score→level band ruler | `/methodology/` | inline SVG | ≤ 1.5 KB | P3 |
| A14 | Data-flow provenance diagram | `/data-sources/` | inline SVG | ≤ 3 KB | P2 |
| A15 | Surge-alert trigger diagram | `/alerts/` | inline SVG | ≤ 2 KB | P3 |
| A16 | Step glyphs on home "How it works" | `home.mjs` | existing `icons.js` — **zero new bytes** | 0 | P3 |
| A17 | 404 plate | `notfound.mjs` | inline SVG | ≤ 1.5 KB | P3 |
| A18 | Offline plate | `offline.mjs` | **inline SVG, mandatory** | ≤ 1.2 KB | P3 |
| A19 | "No data" empty-state mark | `render.js` | inline SVG | ≤ 600 B | P3 |
| A20 | Season-position band | home, `/methodology/` | inline SVG | ≤ 1.2 KB | P3 |
| A21 | National-vs-state comparison bar | state "At a glance" | inline SVG | ≤ 800 B | P3 |
| A22 | `/about/` header plate | `partials.mjs` | CSS `data:` SVG, dual-token | ≤ 3 KB | P3 |
| A23 | Monochrome PWA icon | manifest `purpose: monochrome` | PNG | ≤ 4 KB | P3 |

**A18 must be inlined, not a file.** `sw.js` precaches only `['/', '/offline.html', '/manifest.webmanifest']` plus CSS/JS — an external image on the offline page would 404 in exactly the situation the page exists for.

## Alt text specimens

Alt for a data visual must convey **the data**, not describe the picture.

- **A7 (og-default):** *"FluTrack — a tile map of all 50 U.S. states and DC, each shaded by combined flu, RSV and COVID-19 activity from Minimal to Very High, beside the headline 'Flu, RSV & COVID-19, for your state — in plain English.'"*
- **A8 (per-state):** *"Texas respiratory threat level: Moderate, composite score 55 of 100, rising about 12% week over week. Flu, RSV and COVID-19 combined, from CDC surveillance data for the week ending July 11, 2026."*
- **A11 (history chart):** *"Composite respiratory activity in Texas over the last 12 weeks, rising from 22 in late April to 55 in the week ending July 11, 2026. The line crossed from Low into Moderate in the week ending June 20."*
- **A12 (pipeline diagram):** *"Four CDC signals feed one score: wastewater at weight 0.30, ARI activity level at 0.25, emergency-department visits at 0.25, and lab test positivity at 0.20. Their weighted average becomes a score from 0 to 100, bucketed into five levels and paired with a rising, falling or steady trend."*
- **A13, A17, A18, A19:** `aria-hidden="true"` — an adjacent table or heading already carries the meaning.

## What is NOT an image-model candidate, and why

| Asset | Reason |
|---|---|
| Brand mark, all icons | Already hand-authored SVG. A trademark should be deterministic and owned; purely machine-generated output is not copyrightable. |
| OG typography + cartogram | Must render 51 exact abbreviations, exact level words, exact dates. |
| History chart, gauge, sparklines, map | Must be a true function of the data and re-render on live refresh. |
| Methodology / data-flow / trigger diagrams | Carry exact constants; must stay in lockstep with `threat-index.js`. A diffusion model renders numerals as plausible-looking wrong glyphs — on a methodology page that is a trust defect, not a cosmetic one. |
| PWA screenshots | Must be genuine captures. A synthesised "screenshot" of a health product is a misrepresentation. |
| Severity swatches / band ruler | Must be the literal `--map-0…4` tokens, which carry a verified monotonic-luminance and CVD guarantee a redraw would silently break. |

---

# Part 6 — Image generation prompts

Only genuinely decorative, non-informational plates belong to an image model on this site. Each prompt is ready to paste verbatim, and each carries a mandatory post-processing step so it can ship under this CSP and theme model.

## GP-1 · 404 page plate

> Flat vector illustration, 16:9, for a data-visualisation website's "page not found" screen. Subject: a single continuous thin line chart that rises smoothly from the lower left, then breaks — the line's right-hand portion dissolves into four or five small detached dashes that drift upward and off the right edge, like a signal losing its track. Beneath the line, a faint baseline grid of thin 1px rules on a 56px pitch, fading out toward the edges with a soft radial mask. One small filled circle marks the last intact data point at the break.
>
> Composition: the line occupies the lower two thirds; generous empty space in the upper third. Left-weighted, asymmetric, calm. No focal object in the exact centre.
>
> Style: flat 2D vector, geometric, editorial-infographic, in the manner of a modern financial-data product's empty-state art. Uniform 3px stroke weight. No 3D, no perspective, no gradients on the line itself, no drop shadows, no texture, no bevels, no glow.
>
> Palette, strictly: background very pale cool grey-white #f7f9fa; grid rules #e0e6ea; the intact line segment teal #0b7285; the dissolving dashes light teal #56acbf fading to 20% opacity; the marker dot deep teal #073f4a. No other hues anywhere. No red, no orange, no amber.
>
> Lighting: none — flat, uniform, unlit. No cast shadows, no ambient occlusion, no highlights.
>
> Negative constraints, all mandatory: no text, no letters, no numbers, no words, no watermarks, no signatures. No people, no faces, no hands, no body parts. No medical imagery of any kind — no stethoscopes, no syringes, no pills, no masks, no virus particles, no spiky coronavirus spheres, no DNA helices, no microscopes, no hospital or clinic settings, no lab coats, no crosses, no caduceus or Rod of Asclepius, no heartbeat/ECG motifs. No government seals, eagles, shields-with-stars, flags, or any emblem resembling a federal agency logo. No warning triangles, no exclamation marks, no alarm or emergency styling. No photorealism, no stock-photo look. No UI chrome, no browser windows, no device mockups.
>
> Output: 1600×900 PNG, transparent background, flat colour, no anti-aliasing artefacts on the strokes.

**Post-processing (required):** hand-trace to a ≤2 KB inline SVG using `currentColor` and `var(--brand-500)` / `var(--brand-300)` so it follows the theme toggle; mark `aria-hidden="true"`.

## GP-2 · Offline page plate

> Flat vector illustration, 4:3, for a website's offline screen. Subject: three concentric arcs suggesting a broadcast or connectivity fan, drawn as thin open strokes radiating from a small solid dot at the bottom centre — the outermost arc is broken into short dashes, the middle arc is faint, the innermost arc is solid, reading as reach diminishing outward. A single small rounded square sits below the dot as a stable anchor.
>
> Composition: bottom-anchored and vertically symmetric, with large clear space above. Nothing touches the frame edges.
>
> Style: flat 2D vector, geometric, minimal, editorial-infographic. Uniform 3px strokes, round caps. No 3D, no gradients, no shadows, no texture, no glow, no skeuomorphism.
>
> Palette, strictly: background transparent; solid inner arc and dot deep teal #073f4a; middle arc teal #0b7285 at 60% opacity; dashed outer arc light teal #56acbf at 35% opacity; anchor square outline #cbd4da. No other hues. No red, orange, or amber.
>
> Lighting: none — flat and unlit.
>
> Negative constraints, all mandatory: no text, letters, numbers, words, watermarks or signatures. No people, faces, hands. No medical imagery whatsoever — no stethoscopes, syringes, pills, masks, virus particles, coronavirus spheres, DNA, microscopes, hospitals, lab coats, crosses, caduceus. No government seals, eagles, star-shields, or flags. No warning triangles, exclamation marks, sirens, or emergency red. No wifi-router or smartphone devices, no UI chrome, no device mockups. No photorealism.
>
> Output: 1200×900 PNG, transparent background, flat colour.

**Post-processing (required):** must be traced to inline SVG — `sw.js` precaches only `/`, `/offline.html` and the manifest, so an external image would 404 in exactly the offline case the page exists for. `aria-hidden="true"`.

## GP-3 · `/about/` header plate

> Flat vector abstract banner, 3:1, for the header of an "About" page on an independent public-data website. Subject: an abstract representation of dense information resolving into a simple answer. On the left third, a dense field of many short thin vertical strokes of varying heights, tightly packed and slightly irregular, like an unreadable barcode of raw measurements. Moving rightward the strokes progressively thin out, merge and smooth into a single clean continuous horizontal line that exits the right edge. One small filled circle sits on that clean line near the right.
>
> Composition: strong left-to-right gradient of density; horizontally banded; the resolved line sits on the lower third so page text can sit above it. Wide, calm, unobtrusive — this sits behind or above a headline, so it must not compete for attention.
>
> Style: flat 2D vector, geometric, restrained editorial-infographic, in the register of a serious open-data or civic-technology publication. Uniform hairline strokes, 2px. No 3D, no perspective, no drop shadows, no texture, no noise, no glow, no lens flare.
>
> Palette, strictly: background transparent; dense left-hand strokes pale teal #c3e3ea; mid-transition strokes #56acbf; the resolved right-hand line #0b7285; the marker dot #073f4a. Overall impression should be quiet and low-contrast, never bold. No other hues. No red, orange, amber, green, purple or pink.
>
> Lighting: none — flat, unlit, no highlights or shading.
>
> Negative constraints, all mandatory: no text, letters, numbers, words, watermarks, signatures. No people, faces, hands, silhouettes or crowds. No medical imagery of any kind — no stethoscopes, syringes, vials, pills, masks, virus particles, spiky coronavirus spheres, DNA helices, cells, microscopes, hospitals, clinics, ambulances, lab coats, red crosses, caduceus or Rod of Asclepius, no ECG/heartbeat waveform. No government or institutional emblems — no seals, eagles, star-spangled shields, laurel wreaths, capitol domes, flags, or anything resembling a CDC or HHS logo. No map of the United States (the site already has a real one; a decorative fake would be mistaken for data). No charts with plausible-looking axis labels or plotted values that a reader could misread as real surveillance data. No alarm or emergency styling. No photorealism, no stock-photo aesthetic, no gradients-as-mesh.
>
> Output: 2400×800 PNG, transparent background, flat colour.

**Post-processing (required):** deliver as an inline `data:image/svg+xml` background on `.page-header__bg`, with a `:root[data-theme='dark'] .page-header__bg` rule swapping `#c3e3ea/#56acbf/#0b7285` for `#08505d/#0a6474/#56acbf` — the pattern `components.css` already uses for the select chevron, and the only way to get toggle-aware background art under this CSP without a second request.

## GP-4 · OG card background plate (texture layer only)

> Flat vector abstract background plate, 1200×630, for a social-media link-preview card belonging to an independent public-health-data website. Subject: a very subtle field texture only — a soft, wide radial wash in the upper right suggesting light, over a faint square grid of hairline rules on a 46px pitch that fades out toward the lower left behind a soft mask. Nothing figurative. No focal subject at all. The plate must remain almost empty, because live typography and a data map will be composited over it.
>
> Composition: the entire left half and lower half must be visually near-empty and uniform enough to carry black headline text at 60px and a 51-tile grid on the right. No element may sit between x=60 and x=700, or below y=430.
>
> Style: flat 2D vector, extremely restrained, no illustration. Hairline 1px grid rules only.
>
> Palette, strictly: base fill #f7f9fa; the radial wash #8fc9d6 at a maximum of 30% opacity, falling to 0; grid rules #e0e6ea at 40% opacity. Fully opaque across the entire 1200×630 canvas — no transparency anywhere, including the outer 100px margin. No other hues.
>
> Lighting: a single soft diffuse wash from the upper right only. No specular highlights, no shadows, no vignette on the lower edge.
>
> Negative constraints, all mandatory: no text, letters, numbers, words, watermarks, signatures. No people, faces, hands. No medical imagery — no stethoscopes, syringes, vials, pills, masks, virus particles, coronavirus spheres, DNA, cells, microscopes, hospitals, clinics, lab coats, crosses, caduceus, ECG lines. No government emblems, seals, eagles, star-shields, laurels, capitol domes or flags. No map of the United States and no state outlines. No charts, no axes, no plotted data. No alarm, siren, or emergency red. No photorealism. No borders, frames, or rounded corners. No logo of any kind.
>
> Output: 1200×630 PNG, fully opaque, sRGB, flat colour, ≤80 KB.

**Post-processing (required):** flatten to fully opaque before use — a transparent band is what makes the current card render with a black bar in Slack dark mode (D1). Composite under the programmatically generated typography and cartogram; **never let a model render the map or the wordmark.**

---

# Part 7 — Content plan

## Proposed pages

### Tier A — Data literacy (the site's most defensible territory)

These are pages FluTrack can legitimately outrank the CDC on, because the CDC explains its systems for epidemiologists and FluTrack explains them for the person who just saw a number.

| Slug | Reader question | Words | Cadence | Risk |
|---|---|---:|---|---|
| `/guides/what-the-levels-mean/` | "It says Moderate — is that bad?" | 1,300–1,500 | Static | **Highest on the site** |
| `/guides/reporting-lag/` | "Is this current?" | 900–1,100 | Static | Low |
| `/guides/wastewater-surveillance/` | "Why does wastewater matter?" | 1,000–1,200 | Static | Moderate (lead-time claim) |
| `/guides/test-positivity/` | "Is 13% positivity high?" | 900–1,100 | Static | Low |
| `/guides/ed-visits/` | "What is % of ED visits?" | 700–900 | Static | Very low |
| `/glossary/` | "What is WVAL / an MMWR week?" | 1,400–1,800 | Static | Low (two landmines) |

`/guides/what-the-levels-mean/` is the highest-value page in the plan: it answers the question every one of the 52 data pages provokes and none answers. It is also the highest-risk, because the reader's real question is "should I do something differently?" — which must not be answered.

### Tier B — E-E-A-T surface

| Slug | Purpose | Words |
|---|---|---:|
| `/editorial-policy/` | The document a quality rater looks for by name. Every rule already exists, scattered across five pages. | 1,100–1,400 |
| `/corrections/` | A corrections *promise* is worth little; a *log with entries* is worth a great deal. | 500–650 + log |
| `/methodology/changelog/` | A scored index that changes silently cannot be trusted. Rare, cheap, genuine differentiator. | 400 + entries |
| `/about/` expansion | Name a real person. See §4.4. | +400–600 |

**Seed `/corrections/` honestly.** Three real entries exist today and cost nothing to publish — all documented in `FRONTEND-AUDIT.md`: the live badge could label sample data as "Live CDC data"; the ARI label drift dropped a 0.25-weighted signal for the most-affected states; state pages could render national figures under a state heading. **Publishing bugs you found and fixed is a stronger trust signal than an empty log.**

### Tier C — Ranking and comparison (**blocked on a scheduled rebuild**)

| Slug | Note |
|---|---|
| `/rankings/` | Best new-traffic opportunity; fixes site flatness with 51 inbound links from one hub. Language discipline is the whole risk. |
| `/region/<n>-<name>/` ×10 | Gives "Nearby states" (C3) a truthful destination; the honest home for NREVSS, which *is* reported at region level. |
| `/compare/<a>-vs-<b>/` | **Scope to ~120–150 adjacency/region pairs only.** All 1,275 is a textbook programmatic-thin-content pattern and a YMYL liability. |

### Tier D — Seasonal

| Slug | Note |
|---|---|
| `/guides/respiratory-season/` | Large seasonal volume (Sept–Nov). **Highest forecasting risk in the plan.** |
| `/guides/off-season-readings/` | "Why is my state Minimal in July?" Currently unserved and currently very relevant. |
| `/seasons/` + `/seasons/2026-2027/` | **Blocked on data** — the snapshot holds 12 weeks; needs an append-only `history.json`. |
| `/updates/<date>/` | Freshness cadence. Only publish when something changed, or you generate 52 near-identical pages a year. |

### Tier E — Hub

`/learn/` — the site is flat because it has no middle tier. ~350 words plus a card grid, and a sixth nav item.

## Two hard dependencies

> **Dependency A — scheduled rebuild.** Deploy runs on push only. Any page whose copy says "this week" is wrong within seven days of the last commit. **Do not ship a single weekly page until a cron rebuild exists.** A stale "This week's highest activity" page is worse than no page.
>
> **Dependency B — a real mailbox.** Corrections, editorial policy and accessibility reporting all resolve to `/contact/`, which currently resolves to nothing (C2).

## State-page depth

Current: ~665 words, ~95 genuinely unique (`stateSummary()`), ~18% unique sentences vs a sibling state.

**Cut first.** Delete the 4-question FAQ block (~185 words × 51). Three of its four questions are generic and answered better on `/faq/`. **Unique-content ratio rises from ~18% to ~24% before a single new word is generated.**

**Then add — all computable from data already held:**

| # | Section | Words | Note |
|---|---|---:|---|
| 1 | 12-week trajectory table | ~40 + table | 12 unique numbers per signal |
| 2 | Weeks-at-level | ~25 | |
| 3 | Window peak & trough | ~30 | |
| 4 | Streak | ~15 | |
| 5 | **Distance to next threshold** ⭐ | ~30 | Highest-value single addition — answers "is 44 close to bad?" using only published thresholds. **State the boundary as a fact about the scale; never "is approaching".** |
| 6 | **Rank among 51** ⭐ | ~25 | Also generates the `/rankings/` inbound link |
| 7 | Rank within HHS region | ~20 | |
| 8 | **Signal disagreement** ⭐ | ~35 | Fires only when the spread warrants; doubles as data literacy exactly where needed |
| 9 | Coverage note | ~25 | |
| 10 | Per-virus 12-week table | table | 36 unique numbers |
| 11 | Change vs 4 weeks ago | ~20 | |
| 12 | **State health department link** | ~30 | Hand-curated ×51. The only outbound authority signal, and the correct destination for readers wanting advice FluTrack must not give. |

**Realistic result: ~780 words, ~48–55% unique**, and the unique portion is numeric and changes weekly.

**Be honest about what stays templated.** Sentence frames come from a small set of forms; two states with identical readings produce near-identical sentences. That is fine — Google's problem with programmatic content is pages with nothing to say, not pages with a consistent way of saying different things. The intro, `trendDisclaimer()`, signup band and chrome (~210 words) stay byte-identical across 51 pages and **should** — varying legal copy per state is actively bad.

---

# Part 8 — Content generation prompts

**Assembly rule:** every prompt is **BLOCK A reproduced verbatim**, immediately followed by the piece-specific block. A prompt sent without BLOCK A is non-compliant and will produce non-compliant output. Do not paraphrase BLOCK A.

## BLOCK A — the standard header (paste before every piece-specific block)

```
You are writing one page of web copy for FluTrack, a free, independent,
advertising-supported website that publishes a plain-English "respiratory threat
level" for every U.S. state, built entirely from public-domain CDC surveillance
data (NSSP emergency-department visits, NSSP Acute Respiratory Illness activity
level, NWSS wastewater viral activity, NREVSS laboratory test positivity).

WHAT FLUTRACK IS
- A data-visualization utility. It describes what published federal surveillance
  data shows, for a whole state, for a past reporting week.
- It blends four CDC signals into a 0-100 composite score, mapped to five levels:
  Minimal (0-19), Low (20-39), Moderate (40-59), High (60-79), Very High (80-100).
  Signal weights: wastewater 0.30, ARI activity level 0.25, ED visits 0.25,
  test positivity 0.20, renormalized over whichever signals a state actually
  reported that week.
- Trend rule: the latest week is compared with the mean of the prior up-to-three
  weeks. >= +8% is "Rising", <= -8% is "Falling", anything between is
  "Holding steady".
- These thresholds are FluTrack's own published editorial choices. They are NOT
  CDC-defined cut points and no government agency sets, reviews or endorses them.
- Data is reported with a lag of roughly one to two weeks and is revised as later
  reports arrive.

ABSOLUTE CONTENT PROHIBITIONS - these are not style preferences, they are the
conditions under which this site is allowed to exist. Violating any one of them
makes the output unusable:
1. NO MEDICAL ADVICE of any kind. Never tell the reader what to do, consider
   doing, think about doing, or "might want to" do. No masking, distancing,
   gathering, travel, testing, vaccination, treatment, medication, or timing
   guidance. Not even softened, hedged, or attributed to "many people".
2. NO DIAGNOSIS AND NO SYMPTOMS. Never describe symptoms, incubation periods,
   transmission routes, severity, complications, or who is at higher risk. Never
   help a reader work out whether they or anyone else is ill.
3. NO PREDICTION AND NO FORECASTING. Never use a future-tense verb about disease
   activity. No "will rise", "is expected to", "is likely to", "is approaching",
   "is on track to", "watch for". Describing what published data has done in the
   past is allowed and must be attributed as such. Estimating what an unreported
   current week looks like is forbidden.
4. NO CDC AFFILIATION. FluTrack is independent. Never imply endorsement,
   partnership, official standing, or that FluTrack's thresholds are CDC's.
5. NO INDIVIDUAL RISK CLAIMS. The data describes a population over a week. It
   says nothing about any specific person. Never write that a reader is safe, at
   risk, likely infected, or protected.
6. NO ALARM AND NO REASSURANCE. Do not use "outbreak", "surge" (except the
   product name "surge alert"), "spike", "hotspot", "epicenter", "hardest hit",
   "worst", "danger", "deadly", "crisis", "wave", "battle", "fight". Equally, do
   not write "nothing to worry about" or "no cause for concern". State the data
   flatly and stop.
7. NO INVENTED FACTS. Do not state a statistic, date, dataset name, study,
   percentage or authority that is not supplied in this prompt. If a fact is
   needed and not supplied, write [VERIFY: what is needed] and continue.

THE ONLY PERMITTED REFERRAL, use verbatim where a reader clearly wants guidance:
"For guidance about your health, consult a qualified health provider."

VOICE AND TONE
- Plain English, aimed at a general adult reader with no epidemiology background.
- Sterile, flat, factual. The register of a well-written instrument manual, not
  a health blog and not a news report.
- Describe the data. Never characterize how the reader should feel about it.
- Short declarative sentences. Prefer a period to a semicolon.
- Second person sparingly and only for site mechanics ("the state you selected"),
  never for health ("your risk").
- No hype, no urgency, no rhetorical questions, no "let's dive in", no "in today's
  world", no exclamation marks, no emoji, no marketing adjectives ("powerful",
  "comprehensive", "cutting-edge"), no first-person-singular.
- Contractions are fine. American spelling. Sentence case for all headings.
- Never open a section by restating its own heading.
- Where a limitation exists, state it plainly in the main text. Do not bury
  caveats in a closing paragraph.

OUTPUT FORMAT
- Semantic HTML fragment only: <h2>, <h3>, <p>, <ul>/<li>, <table>, <strong>,
  <em>, <a>. No <html>, <head>, <body>, <h1>, no CSS, no classes, no inline
  styles, no markdown.
- Internal links as root-relative hrefs exactly as specified in the brief.
- External links carry rel="noopener".
- Do not add a disclaimer of your own invention. Use only the exact disclaimer
  text the brief supplies, placed where the brief says.

MANDATORY DISCLAIMER TEXT - reproduce character for character where instructed:

[NOT-MEDICAL] "The information on FluTrack is provided for general informational
purposes only and is not a substitute for professional medical advice, diagnosis,
or treatment. Always seek the advice of a qualified health provider with any
questions you may have regarding a medical condition."

[NOT-AFFILIATED] "FluTrack is an independent project and is not affiliated with,
endorsed by, or sponsored by the Centers for Disease Control and Prevention (CDC)
or any government agency."

[TREND-NOT-LIVE] "Surveillance data is reported with an inherent lag of roughly
one to two weeks. FluTrack shows directional trends, not a real-time case count."

[SHORT] "For general information only - not medical advice."

BEFORE YOU RETURN THE DRAFT, self-check it against prohibitions 1-7 line by line.
If any sentence tells the reader what to do, describes a symptom, predicts a
future value, or characterizes a state as good or bad, delete or rewrite it.
State at the end which prohibitions you checked.
```

## CP-1 · Glossary

```
PIECE: FluTrack glossary of respiratory surveillance terms.
URL: /glossary/
TARGET LENGTH: 1,400-1,800 words total.

PURPOSE
FluTrack uses terms most readers have never met - WVAL, MMWR week, test
positivity, sewershed, provisional data. This page defines each one in the
reader's language and says where on FluTrack they encounter it. It is also the
site's internal-linking hub: other pages link individual terms to anchors here.

STRUCTURE
- One short intro paragraph (40-60 words): what this page is, and that these are
  definitions of measurement terms, not of illnesses.
- Then one <h2> per term, alphabetical. Under each <h2>:
  - one <p> of 40-90 words defining the term;
  - where relevant, a second short <p> beginning "On FluTrack:" saying exactly
    where the reader sees it.
- Give every <h2> an id attribute using the kebab-case term, e.g.
  <h2 id="wval">Wastewater Viral Activity Level (WVAL)</h2>.

TERMS TO DEFINE (all of them, alphabetically):
ARI activity level; Case count; Composite score; ED visit share; Epidemiological
week (MMWR week); HHS region; Leading indicator; MMWR; NREVSS; NSSP; NWSS;
Positivity rate; Provisional data; Public-domain data; Renormalized weighting;
Reporting lag; Respiratory season; Revision; RSV; Sentinel surveillance;
Sewershed; Surveillance (public health); Syndromic surveillance; Threat level
(FluTrack); Trend (FluTrack); Wastewater Viral Activity Level (WVAL).

FACTUAL ANCHORS - use these and only these numbers:
- Weights: wastewater 0.30, ARI 0.25, ED visits 0.25, positivity 0.20.
- Levels: Minimal 0-19, Low 20-39, Moderate 40-59, High 60-79, Very High 80-100.
- Trend band: +/-8% against the mean of the prior up-to-three weeks.
- Season: MMWR week 40 through week 20.
- MMWR weeks run Sunday through Saturday and are numbered within a year.
- NSSP = National Syndromic Surveillance Program. NWSS = National Wastewater
  Surveillance System. NREVSS = National Respiratory and Enteric Virus
  Surveillance System. MMWR = Morbidity and Mortality Weekly Report.
- HHS regions are the ten U.S. Department of Health and Human Services
  administrative regions. Some CDC products report at region level rather than
  state level. Region membership is administrative, not geographic - Hawaii and
  Arizona are both in Region 9.

CRITICAL CONSTRAINT ON THE DISEASE TERM
"RSV" must be defined as a SURVEILLANCE CATEGORY, not as an illness. Write what
FluTrack tracks and how. Do not write a single word about symptoms, who it
affects, how it spreads, or how serious it is. Correct model:
"RSV - respiratory syncytial virus. On FluTrack, one of three pathogens scored
separately. Its level is computed from RSV-coded emergency-department visits,
RSV laboratory test positivity, and RSV wastewater signals, using RSV-specific
breakpoints published on the methodology page."
Apply the same treatment if influenza or COVID-19 come up.

INTERNAL LINKS - place each at least once, in running text:
/methodology/ · /data-sources/ · /guides/what-the-levels-mean/ ·
/guides/reporting-lag/ · /guides/wastewater-surveillance/ ·
/guides/test-positivity/ · /states/

EXTERNAL LINKS
For NSSP, NWSS, NREVSS and MMWR you may link to data.cdc.gov or cdc.gov with
rel="noopener". Do not invent deep URLs - if you are not certain of a path, link
https://www.cdc.gov/ or https://data.cdc.gov/ and no deeper.

DISCLAIMER PLACEMENT
Close the page with a single <p> containing [NOT-AFFILIATED] verbatim, followed
by [SHORT] verbatim. Nothing after it.
```

## CP-2 · What does "Moderate" actually mean?

```
PIECE: What FluTrack's threat levels mean.
URL: /guides/what-the-levels-mean/
TARGET LENGTH: 1,300-1,500 words.

THE READER
Someone has just looked at a state page, seen the word "Moderate" and a gauge
reading 44, and wants to know what that is. This page answers that question
completely, using only the data - and is explicit about the part of the question
the data cannot answer.

THIS IS THE HIGHEST-RISK PAGE ON THE SITE. The reader's real question is "should
I do something differently?" You must not answer that question. You answer the
answerable part - what the number measures, what produces it, what it excludes -
and you say plainly that the rest is not something a population statistic can
answer, followed by the permitted referral sentence.

BANNED CONSTRUCTIONS ON THIS PAGE, in addition to BLOCK A's prohibitions:
"consider", "you may want to", "it's a good time to", "many people choose to",
"if you are high-risk", "take precautions", "be careful", "stay safe",
"peace of mind", "err on the side of". No sentence may make an action more or
less advisable at any level.

STRUCTURE
<h2> What the level measures
<h2> The five levels
  <h3> Minimal  <h3> Low  <h3> Moderate  <h3> High  <h3> Very High
  For each: the composite score range, the approximate combined ED-visit
  percentage and wastewater index that produce it, and one flat sentence of what
  that band represents in the data. No adjectives of concern.
<h2> What a level does not tell you
  <h3> It is not your personal risk
  <h3> It is not today
  <h3> It is not a case count
  <h3> It is not a forecast
<h2> Why two states at the same level can look different
<h2> Where the boundaries come from
<h2> Reading the level together with the trend

FACTUAL ANCHORS - use these exactly, no others:
- Levels by composite score: Minimal 0-19, Low 20-39, Moderate 40-59,
  High 60-79, Very High 80-100.
- Combined ED-visit breakpoints (% of all emergency-department visits):
  Minimal below 2.0; Low 2.0-3.5; Moderate 3.5-5.5; High 5.5-8.0;
  Very High 8.0 and above.
- Wastewater viral activity index breakpoints: Minimal below 3; Low 3-5;
  Moderate 5-7; High 7-8.5; Very High 8.5 and above.
- Weights: wastewater 0.30, ARI 0.25, ED visits 0.25, positivity 0.20,
  renormalized over signals actually reported.
- Trend: +/-8% versus the mean of the prior up-to-three weeks.
- Worked example to use verbatim in "Why two states can look different":
  a state reporting wastewater 6.0 (sub-score 50), combined ED visits 4.2%
  (sub-score 47) and an ARI label of High (sub-score 70), with positivity not
  reported, has present weights summing to 0.80 and a composite of
  (50x0.30 + 47x0.25 + 70x0.25) / 0.80 = 44.25 / 0.80, approximately 55 - which
  falls in the Moderate band. A second state at Moderate reporting all four
  signals arrives there by a different route.

REQUIRED SENTENCES - reproduce these two verbatim inside "It is not your personal
risk". They are existing reviewed FluTrack copy:
"A 'Low' reading does not mean you are safe, and a 'High' reading does not mean
you are sick."
"FluTrack reflects the data; it does not reflect you."

INTERNAL LINKS - place each at least once:
/methodology/ (twice: once for the full computation, once for the breakpoint
table) · /glossary/ · /medical-disclaimer/ · /guides/reporting-lag/ ·
/guides/wastewater-surveillance/ · /states/

DISCLAIMER PLACEMENT
- End "It is not your personal risk" with the permitted referral sentence.
- Close the page with a <p> containing [NOT-MEDICAL] verbatim, then a <p>
  containing [NOT-AFFILIATED] verbatim.
```

## CP-3 · Data-literacy explainer (parameterised — covers four pages)

Paste BLOCK A, then this, filling in one TOPIC block.

```
PIECE: One FluTrack data-literacy explainer.
TARGET LENGTH: as stated in the TOPIC block.

THE READER
Someone who has seen a number on FluTrack and wants to understand what kind of
number it is. They are curious, not worried. Teach the measurement. Do not teach
the disease.

UNIVERSAL RULES FOR EVERY EXPLAINER IN THIS SERIES
- Explain the instrument, never the illness.
- Every limitation of the metric goes in the main text, in the section where it
  arises - never collected into a closing caveat.
- Where FluTrack made a choice (a weight, a window, a threshold), say it was
  FluTrack's choice and say why.
- Use one concrete worked illustration with invented-but-labeled round numbers.
  Introduce it with "Suppose" and keep it to four sentences or fewer. Never
  present an illustration as a real reading from a real place.
- No future-tense verbs about disease activity anywhere on the page.
- Close every explainer with a <p> containing [TREND-NOT-LIVE] verbatim followed
  by [SHORT] verbatim.

STRUCTURE
Follow the H2/H3 outline in the TOPIC block exactly, in order. Under each H2,
one to three paragraphs. Use a <ul> at most twice on the page.

--------------------------------------------------------------------
TOPIC BLOCK - VARIANT 1: REPORTING LAG
URL: /guides/reporting-lag/   LENGTH: 900-1,100 words
Outline:
  <h2> The pipeline, step by step
  <h2> Why Friday
  <h2> Provisional, then revised
    <h3> What a revision looks like
  <h2> What lag does to a trend
  <h2> Which signals lag least, and which lag most
  <h2> How to read the most recent week
Anchors: CDC surveillance systems publish weekly, typically Fridays. A given
week's figures generally reflect illness from roughly one to two weeks earlier.
The most recent one or two weeks can still move as late reports arrive.
FluTrack's trend compares the latest week against the mean of the prior up-to-
three weeks and uses a +/-8% band, chosen to be wide enough to ignore ordinary
week-to-week wobble. Wastewater is the least lagged of the four signals; test
positivity is the noisiest.
Must include verbatim: "FluTrack does not estimate what the current week looks
like. It reports what has been published."
Internal links: /methodology/ · /data-sources/ · /guides/wastewater-surveillance/
· /glossary/ · /states/
--------------------------------------------------------------------
TOPIC BLOCK - VARIANT 2: WASTEWATER
URL: /guides/wastewater-surveillance/   LENGTH: 1,000-1,200 words
Outline:
  <h2> What NWSS measures
  <h2> Why the signal moves early
  <h2> What WVAL is, and what it is not
  <h2> Sewersheds: who is counted and who is not
  <h2> Why FluTrack weights wastewater most heavily
  <h2> Why some wastewater data is deliberately excluded
  <h2> What wastewater cannot tell you
Anchors: NWSS is the CDC's National Wastewater Surveillance System. WVAL is a
normalized viral activity index, not a raw concentration, and indexes from
different networks are not interchangeable. In published comparisons wastewater
signals have typically moved ahead of clinical reporting by roughly five to seven
days - state this as an observed historical relationship, never as a basis for
predicting next week. FluTrack weights wastewater 0.30, the highest of the four.
WastewaterSCAN (also referenced as SCAN or Verily) is licensed CC BY-NC 4.0,
which permits non-commercial use only; FluTrack is advertising-supported, so it
excludes that data entirely and filters it out in code. Wastewater says nothing
about severity, age, vaccination status, or any individual household.
Internal links: /data-sources/ · /methodology/ · /glossary/ ·
/guides/reporting-lag/ · /states/
--------------------------------------------------------------------
TOPIC BLOCK - VARIANT 3: TEST POSITIVITY
URL: /guides/test-positivity/   LENGTH: 900-1,100 words
Outline:
  <h2> What the number actually divides
  <h2> The denominator problem
    <h3> A worked illustration
  <h2> Why positivity can rise while emergency-department visits fall
  <h2> Why FluTrack weights positivity lowest
  <h2> Why you may see a dash instead of a number
  <h2> Reading positivity alongside the other three signals
Anchors: Positivity is positive tests divided by tests performed, not by people.
It therefore reflects who chose to get tested as much as underlying prevalence.
FluTrack weights it 0.20, the lowest of the four, for exactly that reason.
Influenza positivity breakpoints: below 3; 3-8; 8-15; 15-25; 25 and above.
Worked illustration to use: suppose a state runs 1,000 tests in one week and 100
come back positive - 10% positivity. The next week the same amount of illness is
circulating but only 400 tests are run, mostly on people with a strong reason to
test, and 80 come back positive - 20% positivity. The number doubled; the illness
did not.
Must include, in "Why you may see a dash": FluTrack's live refresh does not
currently supply NREVSS positivity for every view. Rather than silently drop the
row, FluTrack renders a dash so the gap is visible, and the composite is
recomputed over the signals that were reported.
Internal links: /methodology/ · /data-sources/ · /methodology/changelog/ ·
/glossary/ · /states/
--------------------------------------------------------------------
TOPIC BLOCK - VARIANT 4: ED VISIT SHARE
URL: /guides/ed-visits/   LENGTH: 700-900 words
Outline:
  <h2> A share, not a count
  <h2> The denominator moves too
  <h2> Why a share is used at all
  <h2> What syndromic coding captures, and what it misses
  <h2> Why sub-state regions are collapsed to one weekly figure
Anchors: The signal is respiratory-coded emergency-department visits as a
percentage of all emergency-department visits, from NSSP. Combined breakpoints:
below 2.0; 2.0-3.5; 3.5-5.5; 5.5-8.0; 8.0 and above. Weight 0.25. A quieter
emergency department raises the percentage without any change in respiratory
illness. NSSP publishes by state and by sub-state region; FluTrack collapses
those to one value per week so that a trend compares time against time rather
than one region against its neighbors.
Internal links: /methodology/ · /data-sources/ · /glossary/ ·
/guides/what-the-levels-mean/ · /states/
--------------------------------------------------------------------
```

## CP-4 · Editorial policy

```
PIECE: FluTrack editorial policy and standards.
URL: /editorial-policy/
TARGET LENGTH: 1,100-1,400 words.

PURPOSE
A standing, citable statement of what FluTrack publishes, what it refuses to
publish, how its copy is produced, and how a reader can challenge it. It exists
to be read by a careful reader, a search-quality reviewer, or an advertising
partner - not to rank for a query.

TONE NOTE SPECIFIC TO THIS PAGE
Institutional and unhedged. Commitments in the present tense: "We do not publish
X", not "We try to avoid X". No aspiration, no marketing. If a rule has an
exception, state the exception.

STRUCTURE
<h2> What we publish
<h2> What we do not publish
  <h3> No medical advice
  <h3> No diagnosis or symptom information
  <h3> No treatment, testing or vaccination guidance
  <h3> No forecasts or predictions
  <h3> No claim of government affiliation
<h2> How our copy is produced
<h2> Our sourcing standard
<h2> Editorial independence from revenue
<h2> Corrections and revisions
<h2> Accessibility
<h2> How to challenge something we published

CONTENT REQUIREMENTS PER SECTION
- "What we publish": FluTrack describes published federal surveillance data for
  a population, for a past reporting week, using a method published in full. It
  publishes the method, the thresholds, the sources, and the limitations.
- "What we do not publish": each H3 gets two to four sentences. Be concrete about
  the boundary. Example of the required specificity: FluTrack will state that a
  state's wastewater index is 6.0 and that FluTrack's Moderate band for that
  signal runs 5 to 7. It will not state what a reader should do at 6.0, whether
  6.0 is concerning, or what 6.0 means for anyone's health.
- "No forecasts": state that FluTrack publishes no forward-looking statement
  about disease activity of any kind, and that its trend label describes a change
  that has already been reported, not one that is expected.
- "How our copy is produced": be straightforwardly honest. Per-state prose is
  generated from the same published model that produces the numbers, so the text
  and the figures cannot disagree. Explanatory and policy pages are drafted with
  automated assistance against a fixed set of editorial constraints and reviewed
  against those constraints before release. Do not oversell this as human
  authorship and do not hide it.
- "Our sourcing standard": U.S. Government public-domain surveillance only.
  Explain the CC BY-NC 4.0 exclusion of WastewaterSCAN / SCAN / Verily: FluTrack
  is advertising-supported, which is a commercial use, so that data would breach
  its license. The exclusion is enforced in code, not by intention.
- "Editorial independence from revenue": no advertiser or affiliate partner can
  influence a threat level, a trend, or how data is described. A reading is never
  sold, sponsored or adjusted. Affiliate links are never placed within, adjacent
  to, or conditioned on a threat-level reading. Link /affiliate-disclosure/.
- "Corrections and revisions": distinguish a revision (the CDC restating a
  figure, which flows through automatically and is not an error) from a
  correction (a mistake in FluTrack's computation or description). Link
  /corrections/.
- "Accessibility": FluTrack targets WCAG 2.2 Level AA. Link /accessibility/.
- "How to challenge something": link /contact/ and state that reports are
  compared against the underlying CDC source before anything changes.

INTERNAL LINKS - all required:
/methodology/ · /methodology/changelog/ · /data-sources/ · /corrections/ ·
/affiliate-disclosure/ · /medical-disclaimer/ · /accessibility/ · /contact/ ·
/about/

DISCLAIMER PLACEMENT
Under "No claim of government affiliation", one <p> containing [NOT-AFFILIATED]
verbatim. Close the page with a <p> containing [NOT-MEDICAL] verbatim.
```

## CP-5 · Corrections policy and log

```
PIECE: FluTrack corrections and revisions.
URL: /corrections/
TARGET LENGTH: 500-650 words of policy, plus the seeded log entries below.

PURPOSE
State how FluTrack handles errors, distinguish an error from a routine data
revision, and publish a permanent, append-only log.

TONE NOTE
Plain and unembarrassed. A corrections page that reads as reluctant is worse
than none. Do not apologize, do not dramatize, do not minimize. Say what was
wrong, say what it now says.

STRUCTURE
<h2> What counts as a correction
<h2> What is a revision, not a correction
<h2> How to report something
<h2> Correction log

CONTENT REQUIREMENTS
- "What counts as a correction": a miscomputed index, a mislabeled state, a wrong
  threshold in published documentation, a broken or wrong source attribution, or
  any statement of fact that was not true. Confirmed errors are fixed promptly
  and logged. Where a change alters what a page said, the change is noted rather
  than quietly made.
- "What is a revision": surveillance data is routinely restated as later reports
  arrive; FluTrack's figures move with those restatements on the next refresh.
  That is the data working as designed, not an error, and it is not logged.
- "How to report": link /contact/. State that a report is checked against the
  underlying CDC source before anything is changed.
- "Correction log": reverse chronological. Render each entry as:
  <h3>[date] - [one-line summary]</h3> followed by a <p> covering: pages
  affected, what was wrong, what it says now, and whether the fault was in
  FluTrack's handling or in how an upstream figure was interpreted.

SEED ENTRIES - write these three up from the facts given. Do not invent detail
beyond what is here. Use [VERIFY: date] for each date rather than inventing one.

Entry 1 - Sample data could be labeled as live CDC data.
  The live-refresh path set its provenance badge to "Live CDC data" whenever the
  network requests succeeded, without checking that any state's figures had
  actually been replaced. A response that returned successfully but carried no
  usable rows could therefore leave bundled sample figures on screen under a live
  label. FluTrack now marks a refresh as live only when at least 25 of 51
  jurisdictions were actually replaced and the reporting week resolves to a valid
  date. Affected: all data pages.

Entry 2 - The highest ARI activity label was being discarded.
  FluTrack's data adapter carried its own copy of the mapping from the CDC's
  categorical ARI activity label to a 0-4 level, and that copy had drifted from
  the canonical one. The label "Extremely High" was not recognized, so the ARI
  signal - weight 0.25 - was dropped and the composite renormalized over the
  remaining signals. The effect was that the states reporting the highest
  activity read lower than the data supported. The duplicate mapping was deleted
  in favor of the single canonical one. Affected: state pages for any state
  reporting "Extremely High" in an affected week.

Entry 3 - State pages could show national figures.
  When a state was missing from the live feed, the page fell back to the national
  aggregate rather than to a no-data state, so a state heading could sit above
  national figures. The fallback was removed; a state with no data now renders an
  explicit no-data view. Affected: individual state pages, intermittently.

INTERNAL LINKS: /contact/ · /methodology/ · /methodology/changelog/ ·
/editorial-policy/ · /data-sources/

DISCLAIMER PLACEMENT
Close with a <p> containing [NOT-AFFILIATED] verbatim.
```

## CP-6 · Methodology changelog

```
PIECE: FluTrack methodology changelog.
URL: /methodology/changelog/
TARGET LENGTH: 400 words of framing plus the four seeded version entries.

PURPOSE
A scored index that changes silently cannot be trusted. This page records every
change to the method and states which changes will never be made without notice.

STRUCTURE
<h2> How the method is versioned
<h2> What will not change silently
<h2> Version history

CONTENT REQUIREMENTS
- Versioning scheme: MAJOR when a weight, a breakpoint or the level cut points
  change; MINOR when a signal is added or removed, or coverage changes materially;
  PATCH for documentation and wording. State that the version shown on the
  methodology page is the version in force.
- "What will not change silently": weights, breakpoints, level cut points, the
  trend threshold, and the set of data sources. Any change to these is logged
  here with the date it took effect and whether earlier readings were recomputed.
- Version history entries, reverse chronological, each as:
  <h3>Version X.Y.Z - [date]</h3> then a <p> stating what changed, why, which
  pages' numbers moved, and whether historical readings were recomputed. Use
  [VERIFY: date] rather than inventing dates.

SEED ENTRIES - from these facts only:

v1.1.0 - Data-derived per-state summaries added.
  Each state report now carries a paragraph generated from that state's own
  model: level, composite score, trend, which virus contributes most, the
  concrete ED-visit, wastewater and positivity readings, and which of the four
  signals were present. Computation unchanged; no reading moved.

v1.0.2 - Test positivity row now always rendered.
  The positivity row had been rendered only when a value was present, so a live
  refresh that did not supply positivity silently removed a row the static page
  had shown. The row is now always present and renders a dash when no value is
  available. Computation unchanged; no reading moved. The provenance strip also
  stopped listing NREVSS when positivity did not in fact contribute.

v1.0.1 - "Extremely High" ARI label now recognized.
  A duplicate label-mapping table did not recognize the CDC's "Extremely High"
  ARI activity label, so that signal - weight 0.25 - was dropped for affected
  states and the composite renormalized without it. Readings for states reporting
  "Extremely High" moved upward once the canonical mapping was restored. Earlier
  weeks were not recomputed.

v1.0.0 - Initial published method.
  Four signals: wastewater 0.30, ARI activity level 0.25, emergency-department
  visits 0.25, laboratory test positivity 0.20, renormalized over the signals a
  state actually reported. Composite 0-100 mapped to five levels at 20, 40, 60
  and 80. Trend from the latest week against the mean of the prior up-to-three
  weeks, with a +/-8% band.

INTERNAL LINKS: /methodology/ · /corrections/ · /editorial-policy/ ·
/data-sources/

DISCLAIMER PLACEMENT
Under "How the method is versioned", one sentence stating that FluTrack's
thresholds are its own editorial choices and are not CDC-defined, followed by a
<p> containing [NOT-AFFILIATED] verbatim.
```

## CP-7 · The respiratory season, explained

```
PIECE: What the respiratory season means in surveillance data.
URL: /guides/respiratory-season/
TARGET LENGTH: 900-1,100 words.

THIS PAGE HAS THE HIGHEST FORECASTING RISK ON THE SITE. Read this before writing
a word.

The subject invites prediction. It must contain none. The test for every sentence:
does it describe data that has already been published, or does it say something
about what has not yet happened? Only the first is allowed.

PERMITTED, with attribution:
  "In CDC surveillance for past seasons, influenza indicators have most often
   reached their highest values between December and February."
FORBIDDEN, in any phrasing:
  "Flu usually peaks in January, so expect activity to rise through December."
  "Activity typically starts climbing in October."   <- "starts climbing" is
   present-tense-generic and reads as a claim about this year. Do not use it.
  "This season is shaping up to be..."  "Watch for..."  "Now is when..."

ALSO FORBIDDEN ON THIS PAGE
Any mention of vaccination timing, in any form, including "many people get
vaccinated before the season". If a reader would plausibly arrive asking when to
be vaccinated, the only permitted response is the referral sentence plus a link
to https://www.cdc.gov/ with rel="noopener". Do not build a section around it.

STRUCTURE
<h2> What "the season" means in surveillance
<h2> Why weeks, not months
<h2> What the signals have done across past seasons
<h2> Why the off-season is not zero
<h2> How FluTrack's levels behave across a season
<h2> Where these season dates come from

FACTUAL ANCHORS - use these and only these:
- FluTrack defines the respiratory season as MMWR week 40 through MMWR week 20.
  For 2026-2027 that is 4 October 2026 through 22 May 2027.
- MMWR weeks run Sunday through Saturday and are numbered within a year. MMWR is
  the CDC's Morbidity and Mortality Weekly Report.
- The week-40-to-week-20 framing is a surveillance convention for aligning
  seasons, not a statement that respiratory illness is absent outside it.
- FluTrack reports year-round. Its levels are computed the same way in July as in
  January - the same weights, the same breakpoints, the same trend rule.
- Off-season readings sit low against the same fixed thresholds, so the same
  reading means the same thing in any month.
- At very low baselines, percentage changes get large and unstable: a signal
  moving from 0.05 to 0.15 is a 200% change over a figure that is close to the
  measurement floor. FluTrack clamps the reported percentage change to a range of
  -200% to +200% so that an off-season wobble cannot produce an alarming headline
  number. Direction is still detected.
[VERIFY] Any statement about which months past seasons peaked in must be checked
against a citable CDC source before publication. If you cannot attribute it,
write [VERIFY: source needed for seasonal timing claim] and do not assert it.

INTERNAL LINKS: /glossary/#mmwr-week · /glossary/#respiratory-season ·
/methodology/ · /guides/off-season-readings/ · /guides/what-the-levels-mean/ ·
/states/

DISCLAIMER PLACEMENT
Close with a <p> containing [TREND-NOT-LIVE] verbatim, then a <p> containing
[NOT-MEDICAL] verbatim.
```

## CP-8 · Why is my state "Minimal" in July?

```
PIECE: Reading FluTrack outside the respiratory season.
URL: /guides/off-season-readings/
TARGET LENGTH: 600-800 words.

THE READER
It is July. They have checked their state and everything says Minimal. They
suspect the site is broken or out of date. Reassure them about the instrument -
not about their health.

Do not write a single sentence that could be read as "there is nothing going
around, you're fine". The subject of every reassurance on this page is the
measurement, never the reader.

STRUCTURE
<h2> A low reading is a reading
<h2> Why the thresholds do not move with the calendar
<h2> Why one virus can be elevated while the others are not
<h2> Why trend percentages get strange at low baselines
<h2> Why FluTrack keeps reporting through the summer

FACTUAL ANCHORS:
- FluTrack computes the same way year-round: identical weights (wastewater 0.30,
  ARI 0.25, ED visits 0.25, positivity 0.20) and identical breakpoints in every
  month. A Minimal reading in July means the same thing as a Minimal reading in
  January.
- Minimal is composite 0-19, which corresponds to combined ED visits below about
  2.0% and a wastewater index below about 3.
- FluTrack scores influenza, COVID-19 and RSV separately, so the combined level
  can sit at Minimal while one of the three sits higher. Say this as an
  arithmetic property of the model. Do NOT explain why any virus behaves the way
  it does - that is epidemiology this page must not do.
- The trend clamp: FluTrack limits the reported percentage change to -200% to
  +200%, because at a very small base an ordinary fluctuation produces an
  arbitrarily large percentage. Direction is still reported.
- Data still arrives weekly through the summer with the same one-to-two-week lag.

INTERNAL LINKS: /guides/respiratory-season/ · /methodology/ ·
/guides/what-the-levels-mean/ · /glossary/ · /states/

DISCLAIMER PLACEMENT
Close with a <p> containing [TREND-NOT-LIVE] verbatim, then [SHORT] verbatim.
```

## CP-9 · Rankings page framing copy

**Only the framing copy is generated. The table and every figure come from the build. Never let the model write a number here.**

```
PIECE: Framing copy for FluTrack's national activity ranking.
URL: /rankings/
TARGET LENGTH: 550-700 words of static framing copy. The ranked table, the
national composite, and all per-state figures are produced by the build and are
NOT your output. Do not write, guess, estimate or illustrate any state's figure.

WHAT YOU ARE WRITING
The evergreen prose that surrounds a weekly generated table: what this ranking is,
how to read it, and - most importantly - the ways it can mislead.

Where the build injects generated text, emit the exact placeholder token given
below on its own line. Do not write around it, do not add a sentence describing
what it will say.

STRUCTURE
<h2> How to read this ranking
<h2> The national picture this week
  {{GENERATED_NATIONAL_SUMMARY}}
<h2> Highest reported activity
  {{GENERATED_TOP_TEN}}
<h2> Lowest reported activity
  {{GENERATED_BOTTOM_TEN}}
<h2> Largest changes since last week
  {{GENERATED_MOVERS}}
<h2> By HHS region
  {{GENERATED_REGION_TABLE}}
<h2> What this ranking does not measure

LANGUAGE DISCIPLINE - this page is where a data site most easily becomes a scare
site. In addition to BLOCK A's prohibitions, these words must not appear
anywhere on the page: worst, best, hardest hit, danger, dangerous, risky,
safest, avoid, hotspot, epicenter, ground zero, outbreak, wave, spike, surge,
crisis, alarming, concerning, troubling. The permitted formulation throughout is
"highest reported activity" and "lowest reported activity".

"WHAT THIS RANKING DOES NOT MEASURE" IS THE MOST IMPORTANT SECTION. It must make
all five of these points, each in its own short paragraph:
1. Reporting coverage differs. A state reporting all four signals and a state
   reporting three are both scored, because FluTrack renormalizes the weights
   over whatever is present - but they are not measured equally well, and the
   ranking cannot show that difference.
2. A rank is a comparison between states in one week. It is not a comparison
   against that state's own history, and a state ranked first may still be at a
   low level in absolute terms.
3. Ranks are unstable near the middle. States separated by one or two composite
   points can swap places on ordinary week-to-week variation.
4. This describes reported activity in a population over a past week. It does not
   describe conditions today, and it does not describe any individual.
5. Activity varies within a state. A state-level rank says nothing about any
   county, city, or neighborhood.

INTERNAL LINKS: /methodology/ · /guides/what-the-levels-mean/ ·
/guides/reporting-lag/ · /states/ · /glossary/

DISCLAIMER PLACEMENT
Immediately under the <h2> "How to read this ranking", a <p> containing
[TREND-NOT-LIVE] verbatim. Close the page with a <p> containing [NOT-MEDICAL]
verbatim, then a <p> containing [NOT-AFFILIATED] verbatim.
```

## CP-10 · Accessibility statement rewrite

```
PIECE: FluTrack accessibility statement (replacing the current 339-word version).
URL: /accessibility/
TARGET LENGTH: 900-1,100 words.

PURPOSE
Replace an unevidenced conformance claim with a statement that names the target,
the testing method, the measured results, the known gaps, and the reporting route.

TONE NOTE
Technical and specific. Every claim carries evidence or is deleted. Do not write
"we care deeply about accessibility".

STRUCTURE
<h2> Conformance target
<h2> How we test
<h2> What we have measured
  <h3> Color and contrast
  <h3> Keyboard and focus
  <h3> Screen readers and semantics
  <h3> Motion and reduced motion
  <h3> Zoom and small screens
<h2> Known limitations
<h2> Reporting a barrier
<h2> When this statement was last reviewed

FACTUAL ANCHORS - use these and only these; do not add measurements:
- Target: WCAG 2.2 Level AA.
- Testing method: automated checks in the build pipeline plus manual review in a
  browser, including measured contrast ratios and simulated color-vision
  deficiency. The build fails on defined accessibility regressions rather than
  warning about them.
- Color: the severity color ramp was rebuilt so that luminance decreases
  monotonically across the five levels (0.550, 0.353, 0.215, 0.115, 0.042), with
  adjacent-step contrast between 1.49 and 1.78. The ramp stays monotonic under
  simulated deuteranopia and protanopia (1.43 to 1.87). Map tile text switches
  from dark to white at level 3 so labels clear 4.5:1 across the whole ramp.
- Non-color cues: each map tile carries its 0-4 level as a digit, so severity
  survives grayscale printing and monochrome displays. Every threat level is
  accompanied by its word label. The severity meter distinguishes filled from
  empty segments by fill and outline, not color alone.
- Keyboard: the state map is 51 ordinary links; a bypass link is provided so the
  51 tab stops can be skipped. The mobile menu is ordered so that opening it and
  pressing Tab moves into it. Focus indicators are re-declared on the dark signup
  band to clear 3:1 there.
- Screen readers: one h1 per page, no skipped heading levels, labeled landmarks,
  no duplicate ids, and a live region present in the DOM at load rather than
  injected on update. A missing value is announced as "Severity unknown - no
  data", never as the lowest level. Scrollable tables are focusable, have a role
  and an accessible name, and carry captions.
- Motion: animations are removed under prefers-reduced-motion, through three
  separate mechanisms rather than one.
- Other: prefers-contrast: more and forced-colors are both supported. A three-
  state theme control offers light, dark and system, and follows the system
  setting when set to system. A full print stylesheet exists.
- Zoom and reflow: horizontal overflow was measured as scrollWidth against
  clientWidth across eight pages at four viewport widths, with no page requiring
  two-dimensional scrolling.

KNOWN LIMITATIONS - state all four plainly:
1. The U.S. map is a tile grid, not a geographic outline. This is a deliberate
   simplification; every state is also reachable from the state directory and the
   dropdown selector, and every figure on the map is available as text on the
   state page.
2. The stylesheet's layout breakpoints are written desktop-first. This does not
   produce a known barrier, but it is not the structure we would choose today.
3. One card-based layout can size against the viewport rather than its own
   container, so it can mis-size at intermediate widths near 900 pixels.
4. Live data is fetched in the browser; when the feed is unavailable the page
   shows clearly labeled sample data. The label is text, not color.

REPORTING
Link /contact/. State what to include: the page URL, the assistive technology and
version, and what happened. Commit to a specific response window only if you are
given one - otherwise write [VERIFY: response commitment].

INTERNAL LINKS: /contact/ · /states/ · /methodology/ · /editorial-policy/

DISCLAIMER PLACEMENT
None. Do not append medical disclaimers to an accessibility statement.
```

## CP-11 · State-page sentence frames (a code spec, not a prose prompt)

Per-state text must be generated **by code** so it cannot contradict the numbers rendered beside it — the reason `stateSummary()` lives in `render.js` and re-renders inside `data-region="state-summary"`. Use a model to draft the *frames* once, then implement.

```
PIECE: Sentence frames for FluTrack's generated per-state sections.
OUTPUT: Not prose. A set of JavaScript template functions.

You are writing the sentence frames that a build script will fill with real
numbers for each of 51 jurisdictions. You will never see the numbers. Your job is
the wording, the branching, and the constraint compliance.

REQUIREMENTS
- Write plain ES module functions returning HTML strings. No dependencies.
- Every interpolated value must be assumed to come from data. Never hard-code a
  figure. Never produce a sentence that reads as an assertion when the underlying
  value is null - branch and omit instead.
- Provide at least three interchangeable phrasings for any frame that will render
  on all 51 pages, selected deterministically from the state abbreviation, so
  sibling pages do not read identically. Do not vary the meaning between
  phrasings - only the wording.
- Every frame must survive the "no advice, no prediction, no individual risk"
  test. In particular, the threshold-distance frame must state the boundary as a
  fact about the published scale and must NOT imply movement toward it. Write
  "FluTrack's published boundary between Moderate and High for this signal is
  5.5%." Never "is approaching High", "only 1.5 points away from", "could tip
  into", "is nearing".

FRAMES TO WRITE:
1. weeksAtLevel(state, levels)
   -> "Nine of the last twelve reported weeks in {state} were at Moderate or
       higher."
2. windowExtremes(state, series, weeks)
   -> "Over the last twelve reported weeks, the combined emergency-department
       reading in {state} ranged from 3.55% (week ending 25 April) to 4.72%
       (week ending 27 June)."
3. streak(state, series)
   -> "The combined emergency-department reading has risen in three of the last
       four reported weeks."
4. thresholdDistance(state, signal, value, bandLow, bandHigh, nextLabel)
   -> "{state}'s combined emergency-department reading is 4.0%. FluTrack's
       published boundary between Moderate and High for this signal is 5.5%."
   No comparison of the two numbers. State both, stop.
5. nationalRank(state, rank, total, composite, nationalComposite)
   -> "{state}'s composite of 44 is the 12th-highest of 51 jurisdictions for this
       reporting week. The national composite is 41."
   Include a link to /rankings/. Never use "worst", "best" or "top".
6. regionRank(state, region, rank, total)
   -> "Within HHS Region 9, {state}'s composite is the second-highest of four
       reporting jurisdictions." Link the region page.
7. signalDisagreement(state, signalScores)
   -> Fires only when the highest and lowest present sub-scores differ by 20 or
      more. "The four signals do not agree for {state} this week: wastewater
      scores in the Moderate band while emergency-department visits score Low.
      FluTrack's composite is a weighted average of the signals that were
      reported." Link /guides/what-the-levels-mean/.
8. coverageNote(state, contributors)
   -> Fires only when fewer than four signals contributed. "Laboratory test
      positivity was not reported for {state} this reporting week. The composite
      is a weighted average of the three signals that were." Link
      /guides/test-positivity/.
9. changeVsFourWeeks(state, series)
   -> "Four reported weeks ago the combined reading was 4.26%. It is now 4.60%."
      No characterization of the difference.
10. trajectoryTable(state, weeks, edSeries, wwSeries, levels)
   -> A <table> with a <caption>, <thead> with scope="col", one row per reported
      week: week ending, combined ED %, wastewater index, level. Wrap in a
      container the caller can make scrollable. Every cell escaped.

ALSO REQUIRED
- Escape every interpolated string. Assume values may come from an API.
- Return an empty string, never a partial or malformed sentence, when required
  inputs are missing.
- Add a one-line comment above each function naming the constraint it is most at
  risk of violating.
```

---

# Part 9 — Making it enforceable

The repo's standard is that compliance rules live in code, not intentions — `excludeNonCommercial()` is the precedent, and `build/check.mjs` already contains five structurally identical scans. Six additions put the media and content expansion on the same footing:

1. **PNG canvas assertion.** Every emitted PNG's painted alpha bbox must reach its declared canvas (±2 px; maskable exempt, it is full-bleed). Catches D1 permanently.
2. **`og:image` size ceiling.** Fail if `og-default.png` exceeds 300 KB.
3. **Credits coverage.** Every image under `dist/assets/` must have an entry in a `src/assets/credits.json` manifest (`source`, `creator`, `license`, `licenseUrl`, `acquired`, `modifications`, `modelRelease`, and for synthetic assets `generator`, `model`, `planTier`, `prompt`).
4. **Licence allowlist.** No credits entry may match `/-NC\b|NonCommercial|-SA\b|ShareAlike|editorial/i`. The direct analogue of `NONCOMMERCIAL_SOURCE`.
5. **Alt-text presence.** Every `<img>` must carry `alt` (empty only alongside `aria-hidden="true"`). Backs the WCAG 2.2 AA claim.
6. **Prohibited-phrase scan** over `dist/` HTML, `alt`, `title`, meta descriptions and filenames: error on `CDC-approved`, `government-verified`, `official CDC`, `medically reviewed`, `in partnership with the CDC`; warn on the crisis lexicon.

Plus one content check: **assert that no page enumerates the signals without ARI** (C1), once `SIGNALS_SENTENCE` exists.

---

# Part 10 — Prioritised backlog

Effort in engineer-days (E) and model-drafting sessions (M).

## P0 — the site is currently wrong

| # | Item | Why | Effort |
|---|---|---|---|
| 1 | Scope `svg{}` to `body > svg` (D2) | One line; removes the ghost shield from the share card | 10 min |
| 2 | Namespace nested SVG ids (D3) | Restores the brand mark's fill | 20 min |
| 3 | Self-calibrate + crop the rasterizer (D1) | Every PNG is truncated; the favicon is blank | 4–6 E-h |
| 4 | PNG assertions in `check.mjs` (D10) | Add the guard **before** regenerating, so the fix is verified | 1 E-h |
| 5 | Regenerate A1–A5 (needs a 32 px simplified variant) | Restores tab icon, iOS home screen, `Organization.logo` | 1–2 E-h |
| 6 | Real maskable icon (D5, A6) | Android crops the current one | 1 E-h |
| 7 | Fix `og-default.png`: opaque, <300 KB, correct ramp (D6, D7, A7) | The share card for all 66 pages | 1 E-h |
| 8 | **Resolve the fabricated OG map (D4)** | Synthetic health data on the most-shared asset | 1 E-h + decision |
| 9 | **`SIGNALS_SENTENCE` — fix the 3-vs-4 contradiction (C1)** | 55 of 66 pages contradict the methodology page | 0.25 E |
| 10 | **Honest `/contact/` interim copy (C2)** | Stop directing people to a form that cannot receive a message | 0.25 E |
| 11 | **A real monitored mailbox** | Unblocks corrections, editorial policy, a11y reporting, `security.txt` | decision |
| 12 | **Name a real accountable person (§4.4)** | Largest E-E-A-T deficit; no content substitutes | 0.5 E + decision |
| 13 | Fix "Nearby states" (C3) | 51 pages assert something false | 0.25 E |
| 14 | Scheduled rebuild (Dependency A) | Gates every weekly page and every honest `dateModified` | 0.5 E |

## P1 — highest ROI

| # | Item | Rationale | Effort |
|---|---|---|---|
| 15 | **State-page sections 1–11 + cut the 4-question FAQ** | 51 pages are 77% of the site's URLs. ~18% → ~50% unique, changing weekly. | 3 E + 1 M |
| 16 | **A11 · multi-week history chart** | The site's core promise is direction-of-travel and there is no chart of the headline score anywhere | 6–8 E-h |
| 17 | `/guides/what-the-levels-mean/` (CP-2) | Answers the question all 52 data pages provoke. Highest-risk — write early, review hard. | 1 M + 0.5 E |
| 18 | `/glossary/` (CP-1) | The internal-linking substrate the flat site needs | 1.5 M + 0.5 E |
| 19 | `/editorial-policy/` + `/corrections/` (CP-4, CP-5) | The two documents a rater looks for by name. Blocked on #9 and #11. | 1 M + 0.5 E |
| 20 | A8 · 51 per-state OG cards | Largest share-CTR lift; generator is 90% written | 4–6 E-h |
| 21 | Guides CP-3 variants 1–3 + `/learn/` hub + nav item | Three ownable explainers plus the hub that makes them findable | 1.5 M + 0.75 E |
| 22 | 51 state health department links | The only outbound authority signal, and the right destination for advice-seekers | 0.5 E |
| 23 | Accessibility statement rewrite (CP-10) | 339 → ~1,000 words of evidence that already exists in a private file | 0.75 M + 0.25 E |

## P2

A12 methodology diagram · A14 data-flow diagram · A10 PWA screenshots · A9 content-page OG cards · `/rankings/` (CP-9, blocked on #14) · `/methodology/changelog/` (CP-6) · seasonal guides (CP-7, CP-8 — ship before September) · home-page `nationalSummary()` + keyworded H2 · dataset IDs and the honest NREVSS gap on `/data-sources/` · `/guides/ed-visits/` + 8 new FAQ questions with anchors · `history.json` plumbing.

## P3

A13, A15–A23 · HHS region pages ×10 · `/updates/<date>/` · `/seasons/` archive (blocked until May 2027) · scoped `/compare/` pairs · per-state surveillance notes (only if someone owns the maintenance).

**Sequenced total to end of P2: roughly 12–14 engineer-days and 8–9 model-drafting sessions**, producing ~11 new pages, a substantially rebuilt state template, six regenerated assets, and the three E-E-A-T documents the site currently lacks.
