# FluTrack front-end audit

**Date:** 2026-07-25
**Scope:** full front end — rendered markup, CSS/design system, client JS, accessibility, performance, SEO/metadata, and live runtime behaviour in a browser.
**Method:** six independent audits run in parallel over the source tree and the built `dist/` output (66 pages), plus a live browser pass against a locally served build. Findings below are deduplicated and re-prioritised across all six; the highest-severity items were independently re-verified against the code.

Baseline: `npm run build` succeeds, `npm run check` passes (66 pages, links/assets/SEO intact), and all 29 unit tests pass. Nothing here is a build failure — these are defects the existing checks do not look for.

---

## Summary

| Tier | Theme | Count |
|---|---|---:|
| 0 | Data-integrity / user-trust defects | 3 |
| 1 | Functional breaks in shipped output | 4 |
| 2 | Correctness, accessibility & performance | 24 |
| 3 | Polish, SEO, maintainability | ~60 |

The three Tier-0 items all sit on the same seam: **the boundary between the bundled sample data and the live CDC feed**. That seam is the core of the architecture and it is where the defects cluster. Everything else is ordinary front-end work.

---

## Tier 0 — Data integrity (fix before any public launch)

### 0.1 · Synthetic sample data can be badged "Live CDC data"

`src/scripts/data-sources.js:225`, `src/scripts/app.js:51-54`

`build/lib/snapshot.mjs:23` generates the bundled dataset with a `mulberry32` PRNG. Its own header states the invariant:

> *deterministic, clearly-labeled SAMPLE data, not real surveillance … The UI always labels it as sample data until a live refresh succeeds.*

The control flow breaks that invariant:

- `data-sources.js:225` — `if (!sources.length) throw` fires only when **all three** requests reject. An HTTP 200 returning `[]`, or rows whose `geography` column no longer resolves to a state, counts as success.
- `app.js:53` — `store.provenance = { live: true, sources }` is then set unconditionally, without checking that `ingestLive` replaced a single state.

**Result:** CDC responds 200 with nothing usable → zero of 51 states get live data → the badge flips to "Live CDC data" and the screen reader announces `"Live CDC data loaded (week ending )."` over PRNG-generated numbers. On a health site, that presents fiction as federal surveillance. The same bug applies per-state: any state absent from the live feed keeps its synthetic values under a live badge.

**Fix:** have `ingestLive` return the count of states actually replaced. Set `live: true` only when that count clears a floor (e.g. ≥25 of 51) **and** `live.weekEnding` is a valid date. Otherwise treat the refresh as failed.

### 0.2 · A failed CDC fetch is indistinguishable from one still in flight

`src/scripts/app.js:56-58`, `src/scripts/render.js:110`

The failure branch is `console.info` only. After the full 12-second timeout the badge still reads "Sample data" with `title="Live CDC feed not loaded yet"` — *"yet"* implies it is still coming. `#live-status` stays empty, so nothing is announced.

The snapshot's own `note` field — *"Illustrative sample data for demonstration only — not real-time CDC surveillance"* — is **never rendered anywhere in the UI**. On a state page the provenance chip is the only signal (the `.prov` strip is home-only). A visitor sees a plausible "Low / 38 / as of Jul 11, 2026" with no way to learn it is synthetic.

**Fix:** set `{ live: false, failed: true }` in the catch branch, render "Sample data — live CDC feed unavailable", announce via `#live-status`, and surface `snapshot.note` whenever `kind === 'sample'`.

### 0.3 · A successful live refresh silently deletes a signal and changes the score

`src/scripts/data-sources.js:247,273` · `src/scripts/render.js:222`
*(Found independently by three agents; verified directly.)*

`fetchLiveSignals` hardcodes `positivityCombined: null` and `positivitySeries: []` — there is no NREVSS adapter in `DATASETS`. But `render.js:222` only emits the "Test positivity" row when the value `isFinite`.

Measured: built pages render **3** signal rows; after a successful live refresh they render **2**. Document height drops 4890 → 4783 on home, 3653 → 3546 on `/state/california/`.

Two consequences, the second worse than the first:

1. ~107px of layout shift seconds after paint.
2. The composite is computed from 3 signals instead of 4 (positivity carries weight `0.20`, renormalised away), so **the displayed threat level changes for a reason unrelated to any change in disease activity** — and the "live" view is strictly less informative than the sample view it replaced. Meanwhile the home page, state-page intro, `/methodology/` and `/data-sources/` all tell the user positivity is one of four blended signals, and the provenance strip advertises an NREVSS wordmark.

**Fix:** either add the NREVSS adapter, or merge per-field (carry snapshot positivity forward when live lacks it) and remove positivity from the copy and from `SIGNAL_WEIGHTS`. The SSR and live signal sets must be identical.

---

## Tier 1 — Functional breaks in shipped output

### 1.1 · No `[hidden]` CSS rule — the state filter is broken and shows a contradictory message on load

`src/styles/main.css:245,388` · `src/scripts/states-filter.js:25,28`

No `[hidden] { display: none }` rule exists in any stylesheet. `.state-chip { display: flex }` and `.notice { display: flex }` are **author** rules, which beat the UA's `[hidden] { display: none }` regardless of specificity.

Three shipped symptoms:

- `dist/states/index.html:716` renders `<p class="notice" id="state-empty" hidden>🔍 No states match that name…</p>` **visibly on page load**, directly above the 51 chips it contradicts.
- Typing in the filter hides nothing, while the `aria-live` counter announces "3 of 51" — the announcement contradicts the screen.
- `app.js:213`'s `geoBtn.hidden = true` leaves the "Use my location" button visible and focusable on browsers without geolocation, doing nothing when pressed.

**Fix:** one line — `[hidden] { display: none !important; }` in `src/styles/base.css`.

### 1.2 · Dark-theme token drift — first-visit OS-dark users get light trend colours

`src/styles/tokens.css:158-197` vs `:200-235`
*(Found independently by two agents; verified — 33 declarations vs 29.)*

The `@media (prefers-color-scheme: dark)` block is a hand-maintained copy of `:root[data-theme='dark']` and has drifted. Missing: `--trend-up`, `--trend-down`, `--trend-flat`, `--map-empty`.

This is the **default path for every dark-mode user who has never clicked the toggle**, because `build/lib/layout.mjs:13` only sets `data-theme` when `localStorage` already holds a value.

Pixel-measured in that state: trend chip 2.40:1 (the same element measures 6.26:1 after clicking the toggle); up/down/flat 2.89 / 2.92 / 2.96:1 against AA's 4.5:1. `--map-empty` renders a near-white "No data" swatch on the dark map.

**Fix:** do not hand-maintain paired blocks. Declare the dark palette once and share it via a selector list, or generate the media block from the attribute block at build time, plus a `build/check.mjs` assertion that the two token sets are equal.

### 1.3 · Focus ring and invalid state are nullified on the site's only form

`src/styles/components.css:743-750` vs `src/styles/main.css:314-319`

All three selectors are specificity `0-2-0`; `build/build.mjs:115` concatenates `main.css` last, so it wins on source order.

- `.input:focus { outline: none }` kills the global `:focus-visible` outline. The surviving `box-shadow` halo measures **1.22:1** over the teal band (needs 3:1). Keyboard users get no visible focus on the site's single conversion path, present on all 66 pages.
- `alerts.js:36,45` sets `aria-invalid="true"`, but the red border it should trigger never paints — and at `#c62828` on that band it would be 1.21:1 anyway.

**Fix:** re-declare focus and invalid states scoped inside the band with light-on-dark values. Structurally, adopt `@layer tokens, base, components, pages` so page CSS cannot beat component state rules at equal specificity.

### 1.4 · Every page load requests up to 140,000 unfiltered Socrata rows

`src/scripts/data-sources.js:125,150,168`
*(Found by two agents; verified.)*

Three queries at `$limit: 60000 / 20000 / 60000` with **no `$select` and no `$where`** — full row width, every state, every historical week, on every one of the 66 pages including all 51 single-state pages. Parsed with `res.json()` on the main thread against a 12-second aggregate abort.

Compounding it, `resolveState()` (`:194-199`) is O(rows × 51) with two `toLowerCase()` allocations per comparison — at the row ceiling that is millions of temporary strings in one synchronous loop.

On mobile this will time out more often than it succeeds, which means the live upgrade rarely lands at all — and when it does, it janks the main thread.

**Fix:** add `$select` for the six columns actually read, `$where` on a ~90–120 day window, and on state pages `$where` the geography to the one state; drop `$limit` to a few hundred. Build two module-level `Map`s for state lookup. Expected: multi-MB → low tens of KB, and post-fetch CPU to near zero.

---

## Tier 2 — Correctness, accessibility, performance

**Data correctness**

- **State pages can render national numbers under the state's heading.** `app.js:91` — `store.signals.get(st.abbr) || store.signals.get('US')`. The `|| 'US'` fallback is right on home, wrong on `/state/<slug>/`: a state missing from the feed renders "Respiratory threat level · Wyoming" with the US score, gauge, trend and sparkline. Plausible-looking and undetectable by the user. Use `st.isNational ? … : null` and let the existing "No data" branch handle it.
- **ARI label table has drifted, deleting the signal for the worst-affected states.** `data-sources.js:260-267` re-implements `threat-index.js:63-77` with a different table; CDC's `"Extremely High"` → `null` instead of `4`, so the ARI signal (weight `0.25`) is renormalised away and those states read *lower* than they should. The "deferred import avoids a cycle" comment is wrong — `threat-index.js` imports nothing. Delete `labelFromRow`, import `labelToLevel`.
- **ED rows are never collapsed per week.** `data-sources.js:231-235` — wastewater gets `collapseWeeklyMax()`, ED does not, but NSSP publishes by state *and* sub-state region. `computeTrend` can therefore compare one region against three siblings **from the same week**, producing a "Rising +37%" chip that reflects geography, not time.
- **`numeric(' ')` returns `0`.** `data-sources.js:99-103` — a blank-padded field becomes a real `0.0%`, dragging a state from "Moderate" to "Minimal". Conversely CDC suppression markers (`'<1'`) → `NaN` → filtered out entirely, so `computeTrend` compares non-adjacent weeks as if adjacent.
- **Per-state `weekEnding` is computed then discarded.** `data-sources.js:248` vs `app.js:94` — a lagging state displays the *national* newest week as its "as of" date, overstating freshness exactly where it matters.
- **Gauge never reaches 100%.** `render.js:62` computes the arc from `R = 80`, but the path on `:70` is `A82 82` (true arc length π×82 = 257.6). At score 100 the stroke covers 97.6% of the track.

**Robustness**

- **Geolocation hangs forever.** `app.js:228` — the `geo.fcc.gov` fetch has no `AbortController` and no `res.ok` check (only `getCurrentPosition` has a timeout). If that endpoint stalls the button stays disabled reading "Locating…" until reload.
- **`loadSnapshot()` has no timeout**, and `boot()` awaits it before wiring anything (`app.js:38`) — behind a captive portal, nothing is ever wired. The two fetches are also sequential rather than concurrent.
- **"See my area" loses the selection.** `app.js:37-47` — the form has no `action`/`method` and `wirePicker()` runs only after the snapshot resolves. Submitting early does a native GET to `/?state=CA`, which nothing on the home page reads. Same outcome with JS disabled. Attach the listener synchronously and honour `?state=` on boot (which also makes selections linkable — `alerts.js:16` already establishes that convention).
- **Geolocation button corrupts its own label.** `app.js:219,239-245` — `original` is captured at click time, so a second click during the 2.5s error window permanently destroys the icon and label; a pending timer can also stamp "Location unavailable" onto a button that just succeeded.
- **Service worker caches non-OK responses.** `sw.js:46-52,65-72` — no `res.ok` check, so a deploy blip's 500 page gets cached and served offline forever in place of `offline.html`. The `c.put` is also outside `event.waitUntil`.
- **SW precache omits CSS and JS.** `sw.js:9` precaches only `/`, `/offline.html`, `/manifest.webmanifest`, so the offline shell paints unstyled. `sw.js:73-75`'s `.catch(() => hit)` resolves to `undefined` on a miss — a hard network error rather than a graceful fallback.
- **SW cache version is keyed on the CSS hash only.** `build/build.mjs:139` → `VERSION = 'stylesd7cab2e63acss'`. A JS-only deploy rotates nothing.
- **JS assets are unhashed but cached 24h.** CSS is content-hashed and `immutable`; the 14 JS modules are copied verbatim under `/assets/*` → `max-age=86400, stale-while-revalidate=604800`. Combined with the SW versioning above, a JS-only fix can stay invisible for up to ~8 days, and fresh HTML can pair with week-old JS.
- **Picker fails silently on an empty store.** `app.js:92` returns early, so selecting a state updates nothing, announces nothing, and shows no error.

**Accessibility** (WCAG references are AA unless noted)

- **Mobile menu links precede the button that opens them.** `layout.mjs:123` vs `:130` — opening the menu and pressing Tab lands in `<main>`, skipping the whole menu; the links are only reachable by Shift+Tab. `aria-controls` does not fix tab order. (2.4.3)
- **Map severity is hue-only and inverts under colour blindness.** `tokens.css:41-48` — measured luminances are **not monotonic** (0.111 → 0.130 → 0.121 → 0.124 → 0.079), contradicting the comment at `:20-22`. Under simulated deuteranopia "High" renders *lighter* than "Minimal" — the reader infers the opposite of the truth. The only non-colour channel is a per-tile `aria-label`, useless for at-a-glance comparison. (1.4.1)
- **Inline links outside `.prose` are colour-only**, at 1.08–1.18:1 against surrounding text (needs 3:1). `base.css:75` removes underlines globally; `components.css:809` restores them only inside `.prose`. (1.4.1)
- **Focus ring is invisible on the signup band** — 1.89–2.45:1 where the form actually sits. (1.4.11)
- **"No data" is rendered and announced as "Minimal".** `render.js:99-101` emits `aria-label="Severity 0 of 5: Minimal"` for an unknown value; `:202` gives it the green `data-sev="0"` dot; `:130` themes the whole card green under a "No data" headline.
- **Map tiles are 15.7–18.2 CSS px at 320px** (needs 24×24), with 3.0–3.5px gaps so the SC 2.5.8 spacing exception does not apply. 51 targets. (2.5.8)
- **Scrollable tables are not keyboard-operable** — `.table-wrap` has `overflow-x: auto` but no `tabindex="0"`/`role="region"`, and contains nothing focusable. Note the wrapper is currently a no-op anyway: `.prose table { width: 100% }` guarantees the table never overflows it, so columns crush to ~44px instead of scrolling. (2.1.1)
- **Severity meter segments fail 3:1** filled-vs-empty in light theme (1.47–2.69:1 for four of five levels). (1.4.11)
- **Form borders fail 3:1** in both themes (1.42:1 light, 1.91:1 dark), with no fill cue either. (1.4.11)
- **The select chevron is 1.13:1 on the signup band** — `appearance: none` removed the native one and the hardcoded `%236b7785` stroke was never overridden for the dark band. (1.4.11)
- **`forced-colors` and `prefers-contrast` are unhandled** — every severity signal is a `background`/`fill`, so all five levels and all 51 tiles collapse to one colour in High Contrast Mode, and `.hero h1 em`'s `background-clip: text` disappears.
- **The live-data announcement says a fetch finished, not what changed** — `app.js:248-251` announces "Live CDC data loaded" while the level may have moved Moderate → Very High.
- **51 consecutive tab stops** in the map with no bypass link.

**Layout & performance**

- **`/methodology/` needs two-dimensional scrolling at 320px.** `methodology.mjs:192` joins a formula entirely with `&nbsp;`, producing one unbreakable ~440px run in a 272px column. Measured `scrollWidth 468` vs `clientWidth 320` — 148px of overflow. All 15 other pages measure exactly 320. (1.4.10 Reflow)
- **Home personalisation swaps the LCP element after a round trip.** `app.js:45` reads the saved state from `localStorage` only after the module waterfall and snapshot fetch, rewriting `.threat__level` with no reserved height — even though `BOOT_SCRIPT` already reads `localStorage` pre-paint.
- **51 state pages fetch the full 51-state snapshot they already server-rendered** — 12.4 KB gzip, 25% of a state page's gzipped bytes, entirely redundant.
- **Module waterfall is 3 waves deep with zero resource hints** — no `modulepreload`, `preconnect` or `preload` anywhere in `dist/`. Five sequential round trips before the CDC request even starts.
- **The live fetch is serialised behind the snapshot fetch** (`app.js:38` then `:51`) rather than running in parallel.
- **JS ships unminified with full JSDoc** — 58,109 B raw / 21,186 B gzip for the home page's 10 modules; comment-stripping alone yields −33% gzip (−6.9 KB), while CSS already gets a minify pass.
- **`.hero__bg` holds an unconditional `will-change: transform`** on a ~120vw × 150vh filtered layer — allocated even under `prefers-reduced-motion`, where the animation is correctly suppressed but the ~10–25 MB GPU texture is not.
- **Two `_headers` rules match the hashed stylesheet**, so the one asset that earned `immutable` has an ambiguous merged `Cache-Control`.
- **The first client re-render is byte-identical to the SSR markup** but still tears down the DOM, restarting the gauge and tile animations — users see the gauge sweep up to three times per load.
- **No print styles at all.** With background graphics off (the browser default) the entire signup band prints white-on-white, step markers and primary buttons vanish, and the sticky header and 4-column footer print. In dark mode the whole document prints near-white on white.

**Security / backend boundary**

- **No rate limiting in the webhook-only deployment.** `functions/api/subscribe.js:72` puts the limiter inside `if (hasKv)`. In the documented KV-less config every request goes straight to `postWebhook()`. The endpoint also accepts `x-www-form-urlencoded` (a CORS simple request) with no `Origin` check or CSRF token, and the client never sends the `company` honeypot field (`alerts.js:7`) — so the honeypot only fires on the no-JS path. Require the limiter unconditionally, verify `Origin`, reject `Sec-Fetch-Site: cross-site`.
- **No-JS form submission returns raw JSON.** The form is a real `method="post"` (good), but the Function only ever returns `application/json`, so a JS-less visitor lands on a white page reading `{"ok":true,…}`. `novalidate` on the form also strips native validation for that same user. Branch on `Sec-Fetch-Dest: document` and 303-redirect.
- **Attacker-controlled `User-Agent` is persisted to KV and relayed to the webhook** unbounded (`subscribe.js:98`) — a stored-XSS vector one hop downstream if the receiving system renders HTML.

---

## Tier 3 — SEO, polish, maintainability

**SEO / metadata** (full detail in the per-area notes)

- Home `og:title` and `twitter:title` collapse to just **"FluTrack"** — `layout.mjs:87,97` fall back to `site.name` because `home.mjs:157` passes `title: ''`. The highest-value share target has an 8-character social title. It is the only page of 66 with this problem.
- `hello@flutrack.example` — an RFC-2606 non-routable placeholder — is published in **24 places**, including five `mailto:` links, `security.txt` and `humans.txt`. `seo.mjs:21` already suppresses it from JSON-LD, so the build knows it is fake and renders it anyway.
- Deploy runs on push only, so server-rendered data, `dateModified` and 53 sitemap `lastmod` values are all frozen at `2026-07-11` while the client shows a different, newer date. Add a scheduled rebuild.
- State pages are **19.6% unique word content** (112 of 571 words); 25 of 28 sentences are byte-identical across states after name substitution. Inject data-derived prose that changes weekly.
- `FAQPage` markup is duplicated across 51 state pages (`"Is this medical advice?"` appears verbatim on 52), earning nothing since the 2023 restriction to authoritative sites. Keep it on `/faq/` and `/methodology/` only.
- JSON-LD has no `@id`/`@graph` wiring — `Organization` is emitted as three unconnected duplicate nodes, so the publisher entity cannot consolidate. `about` uses bare strings where schema.org requires a `Thing`. `datePublished` advances on every rebuild. `Dataset` omits `distribution` despite one existing at `/data/snapshot.json`.
- Eight content pages emit `BreadcrumbList` with no visible trail; `/about/` — the primary E-E-A-T page — has no breadcrumb markup at all.
- Home `<h1>` ("How bad is it near you, in plain English?") contains none of the target keywords, unlike every other page.
- Brand/domain mismatch: `name: 'FluTrack'` vs `origin: 'https://flufollower.com'`.
- Minor: two meta descriptions exceed 160 chars; five titles waste 30–40 chars of SERP width; `twitter:image:alt` missing sitewide; one global `og:image` for all 66 pages though the per-state generator already exists; `lang="en"` vs `og:locale` `en_US`; 404 carries a self-referencing canonical.

**CSS maintainability**

- **955 bytes of provably dead CSS** across 7 class blocks and one keyframes (`.skeleton`, `.field__error`, `.field__label`, `.section-head--center`, `.btn--lg`, `.hide-sm` — including a literally empty rule — `.container--wide`, `@keyframes shimmer`), plus 7 unused tokens. Two of the seven `!important`s exist only to support dead rules.
- **Five classes shipped in HTML have no CSS rule**, two of them real bugs: `.threat__readout` and `.state-chip__name` both lack `min-width: 0` and so cannot shrink below their content.
- **The CSS is desktop-first throughout** — all 8 layout media queries are `max-width`, across 5 undocumented ad-hoc breakpoints (30/34/40/48/56rem), contradicting the mobile-first premise.
- **Viewport queries stand in for container queries** — `.threat__body` collapses at a *viewport* width, but on state pages the card lives in a `1.6fr` track, so it mis-sizes at ~900px where no breakpoint has fired. `46vw` measures the wrong box for the same reason.
- **Hardcoded values bypass an otherwise-complete token system** — off-scale spacing, radii, tracking and weight; two font sizes below the scale's floor (10.9px, 11.5px); raw `z-index: -1` in four places while `--z-overlay` goes unused; `--gray-400`/`--gray-500` pasted as hex literals into the chevron data URIs.
- **No measure cap on `.callout`/`.notice`/`.disclaimer-strip`** — ~117 characters per line at the container's full width, roughly double the readable measure. `state.mjs:34,37` already patches around this inline.
- `.between.section-head` conflict strands two section CTAs mid-page on desktop. `.hero__lead` vs `.hero__lede` on adjacent lines is a near-homograph trap. Theme choice is one-way with no "system" state and no `matchMedia` listener; `theme-color` never follows a manual toggle.

**Testing**

Currently covered: threat-index maths, the WastewaterSCAN licence filter, tile-grid layout, snapshot shape/determinism. **Not covered at all:** `render.js` (no escaping assertion anywhere), `app.js`, `util.js`, `aggregate.js`'s NaN behaviour, every row→signal adapter in `data-sources.js`, and `functions/api/subscribe.js`.

Findings 0.1, 0.3, and the ARI/ED/`numeric()`/`weekEnding` items above all live in untested code. Highest-value additions, in order:

1. A fixture-driven `fetchLiveSignals` test — empty array, renamed geography column, duplicate week rows. This catches 0.1 and 0.3 directly.
2. An `escapeHtml`-at-every-callsite test over `render.js`, so a future unescaped interpolation cannot ship silently.
3. `formatDate` boundary cases and the `numeric()` coercion table.

---

## What is genuinely well built

Worth stating plainly, because the defects above are concentrated rather than pervasive:

- **XSS-clean.** Every interpolation of a non-numeric value in `render.js` goes through `escapeHtml`, including API-derived values. An injected `"><img src=x onerror=alert(1)>` as `weekEnding` renders as inert entities. `app.js` uses `textContent`/`setAttribute`, `alerts.js` puts server messages in `textContent`. No XSS was found on any path — API, URL, `localStorage`, or form input. (One cosmetic exception: `render.js:202` interpolates `state.slug` unescaped; not exploitable, since slugs are `[a-z0-9-]` from a static table, but inconsistent with `map-render.js:34`.)
- **The CSP is real and tight** — the inline theme-boot script is SHA-256 hashed at build time from the actual string (`build.mjs:213`), so it cannot drift out of sync; `connect-src` is limited to exactly the two origins used; `object-src 'none'`, `frame-ancestors 'none'`.
- **Genuine progressive enhancement** — the map is 51 real `<a>` elements, the filter degrades to a full list, and the site is usable with JS off apart from two picker buttons. Zero broken internal links across all pages; `/404.html` returns a real 404.
- **The shared-render architecture works.** Build and browser import the *same* pure functions, so SSR and hydrated markup cannot structurally diverge. The one exception (0.3) is a data bug, not an architectural one.
- **Offline genuinely works** — verified by killing the server, not by a `setOffline` toggle: precached and visited pages serve fully styled from cache; never-visited pages serve the styled `offline.html`.
- **The CDC failure path is clean where it counts** — no spinner, no `NaN`/`undefined`/`Infinity` in any rendered text, no layout shift through the full 12s timeout. `Promise.allSettled` + `AbortController` let the three datasets fail independently.
- **The alerts form handles all five outcomes with human copy**, including the documented 501, with focus management and `aria-invalid` set and cleared correctly.
- **`threat-index.js` is uniformly defensive** — every entry point `Number.isFinite`-guarded, weights renormalised over present signals, "No data" propagating cleanly instead of producing `NaN`.
- **Reduced motion is comprehensive**, not a token gesture — three mechanisms covering all five animations.
- **Landmark and heading structure is correct** on every page sampled: one `<h1>`, no skipped levels, labelled landmarks, no duplicate IDs, and a live region present in the DOM at load rather than injected at update time.
- **Specificity discipline is excellent** — zero ID selectors, max specificity `0-3-0`, max nesting depth 2, no conflicting selector redefinitions in 1,788 lines.
- **Zero duplicate titles, descriptions, H1s or canonicals** across 66 pages; sitemap, canonicals and robots agree exactly; the link graph has no orphans and no dead links.
- **No web fonts, no third-party scripts, no analytics** — nothing to preconnect for and no FOIT/FOUT to manage.

---

## Suggested order of work

1. **0.1 + 0.2 + 0.3** — the provenance seam. These are the only findings that make the site actively misleading about health data.
2. **1.1** — one CSS line, fixes a visibly broken page.
3. **1.4** — the Socrata queries. This is what makes the live upgrade actually land on mobile, which in turn is what makes 0.1 rare rather than routine.
4. **1.2 + 1.3** — dark-mode drift and the form focus ring; both are small, and both should be made structurally impossible (build assertion, cascade layers) rather than just patched.
5. Tier 2 correctness items — the state-page `|| 'US'` fallback and the ARI table drift are the two that produce wrong numbers.
6. Tier 2 accessibility, then performance, then Tier 3.

Add the three tests listed above alongside step 1 — the Tier-0 defects are exactly the class of bug that the current suite is structured to miss.
