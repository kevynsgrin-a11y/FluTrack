# CDC epidemic trend (COVID-19 Rt): evidence review and owner handoff

Prepared October 9, 2026, on branch `ccr-76e7231f-a3g433`, from `main` at `c1ac14b`. This records what was verified against CDC's own files, the design decisions that followed, how the change was validated, and what is left for the owner. It does not claim anything about production: the feature has not been deployed.

The owner approved building the recommended design, including its new data path (a direct build-time fetch from cdc.gov rather than the ingest mirror), in the session that produced this change.

## What changed, and what did not

State pages now show CDC's own estimate of whether COVID-19 infections are growing — the category (Growing, Likely growing, Not changing, Likely declining, Declining), its probability, the Rt estimate with its 95% interval, the model report's date and the date its emergency-department (ED) data end — and the home page carries one national line. It is **direction only**: CDC says epidemic trends "do not reflect the burden of disease".

Unchanged: the combined respiratory index and every weight, breakpoint, trend rule and guard; hydration and the client modules (the blocks are static markup outside every `data-region`); the snapshot schema; the CSP and `_headers` rules; the workflows; secrets and `wrangler.toml`. No existing reading changed, and the changelog entry says so.

## Terminology: two scales that share words

CDC's categories are not FluTrack's levels. A COVID-19 wastewater value of 11.09 is CDC **High** (CDC's COVID-19 cutpoints: Very Low up to 2.6, Low to 4.9, Moderate to 7.9, High to 11.6, Very High above), while FluTrack's editorial wastewater band (`BREAKPOINTS.wastewater`, ≥ 8.5) would call it Very High. Neither is wrong; the site already says its breakpoints "are not CDC-defined cut points". The new blocks use CDC's labels only for CDC's own category and never colour, score or word it like the FluTrack scale (`build/check.mjs` fails the build if a block uses `level-token` or `data-sev`).

## Evidence and verification

The evidence package `CDC-COVID-evidence-2026-10-09.zip` (packaged 2026-10-09T17:22:33Z from files saved ~16:01–16:04 UTC) is **not committed** and is not a fresh CDC fetch: every file's SHA-256 matched its manifest, which shows integrity within the package, not CDC origin. It is internally consistent in ways that would be hard to fake (the Rt map's ED shares for Wyoming and Connecticut equal the separate ED files; 5,296 of 5,306 CDC wastewater category labels fit the published cutpoints and the other 10 sit exactly on a cutpoint).

| File (package path) | SHA-256 |
|---|---|
| `source-files/covid-19-rt-map.json` | `c49555ee002404f5cb7630f840dc14a78d327c38111920eddb67c31117de588d` |
| `source-files/epidemic-trends-page.html` | `7f7e7ac55549210515d7ac22125e6880625710489dbb953746ac23ac7149f3c2` |
| `source-files/illness-levels-page.html` | `6e4814d9310ff056d375ab951bbd1d5d1c0a69e6bd3bd849795da6a84af780f5` |

Checked against the raw files (not the packaged excerpts): Wyoming COVID-19 ED share 0.45 / 0.51 / 0.66% (weeks ending Sept 19, Sept 26, Oct 3); Connecticut 0.55 / 0.52 / 0.51%; Wyoming SARS-CoV-2 wastewater 4.22 / 2.86 / 4.27, CDC category Low throughout, five sites; Connecticut 6.05 / 8.69 / 11.09, Moderate then High, nine sites against thirteen last month; Rt report dated 2026-10-07 on data through 2026-10-06; Wyoming Likely growing (78.2%), Connecticut Declining (2.8%), national Not changing; the four Growing and eight Likely growing states exactly as reported; the ~200-site wastewater notice; `Date_Updated` "October 08, 2026 7:14 AM" with no timezone.

**Not verifiable from the package:** that Iowa, South Dakota, Tennessee, Utah and Wyoming are *newly* flagged against a Sept 30 baseline (no earlier map), and that national ED share and test positivity are declining (no national series, and the preserved pages state none; national wastewater actually ticked up 3.83 → 4.11).

Findings that shaped the design:

- **Small, noisy moves.** Wyoming's ED rise (+0.15) is about one typical weekly swing (sd 0.17) and ranks 17th of 53 weeks; its wastewater is back at its Sept 19 value; its Rt is 1.02 (95% interval 0.96–1.07), 6th of 8 Likely growing states by probability. CDC calls Rt direction-only. So no Wyoming-specific story was written; the signal is shown the same way for every state.
- **Two of the "three distinct signals" are one source.** CDC estimates Rt from the same NSSP ED visits as the ED-visit share, so their agreement is not independent confirmation. The block says so.
- **Disagreement is common, not a Connecticut quirk.** All nine states with High or Very High wastewater have an Rt category that is not growing. FluTrack's model keeps one trend per pathogen from one chosen source (ED first), which would hide Connecticut's wastewater rise (+85%) behind a flat ED share, so the block compares each COVID-19 measurement on its own.
- **Rt can rest on missing ED data.** Iowa and South Dakota have Rt categories although CDC's pages say Iowa's NSSP feed ended May 6, 2026 and that no ED data are available for South Dakota. They are withheld. Separately, CDC's Iowa ED export zero-fills seven weeks (May 16–June 27) before going null; see `docs/DATA-SCHEMAS.md`.

## Design decisions

1. **Separate and named.** The category is CDC's, under CDC's name, dated twice (report date and training-data end), never scored or folded into the index.
2. **Fail soft, never invent.** `parseEpidemicTrend` validates schema `rt-map/1.x`, disease, status, dates, ≥ 40 estimated states, and that every category agrees with its own probability (CDC's published 90 / 75 / 25 / 10% bands). A failed fetch, bad JSON, old report (> 21 days) or invalid row omits the blocks; there is no sample fallback and no `require` mode. A build with sample data carries none.
3. **Only with the data it rests on.** A state's category is withheld when CDC's notes document an ED gap (`DOCUMENTED_ED_GAPS`: Iowa, South Dakota) or FluTrack holds no current COVID-19 ED observation for it.
4. **Side by side.** The block lists CDC's category and FluTrack's own ED and wastewater directions (latest against the mean of up to three prior observations), flags only *opposite* directions, and does not average them.
5. **Auditable.** The record behind the blocks ships as `/data/epidemic-trends.json`, and `build/check.mjs` ties every page to it.

## Validation

| Check | Result |
|---|---|
| `node --test test/*.test.mjs` | **508 passed, 0 failed** (baseline 431; +46 data-layer, +31 renderer and content) |
| `node build/typecheck.mjs` | passed |
| Mutation checks (remove the category-against-probability check, the ED gate, the disagreement flag, the staleness guard, the declining-probability inversion, the certainty clamp) | each caught by one to four tests; files restored byte-for-byte |
| QA negative controls (category ≠ record, missing record, alarm word, severity token in a block, wrong report date, category on a withheld block) | all six caught by `build/check.mjs` |
| Build matrix, real build code with a stubbed `fetch` serving the retained file | offline; live + CDC OK (49 shown, 2 withheld, 52 pages carry blocks); CDC 503 (3 attempts); not JSON (1); report 69 days old (1); `EPIDEMIC_TREND=off` (0 requests); default build with this sandbox's blocked network; invalid `EPIDEMIC_TREND` fails loudly. Every build exited 0 (except the invalid setting) and passed QA |
| Chromium, 320 / 390 / 1440 px, light and dark | no horizontal overflow, no script errors; screenshots reviewed |

## What this did not verify

- **A real fetch from cdc.gov.** The build sandbox could not reach CDC (proxy 403, DNS failure), so the fetch path was exercised with a stubbed `fetch` serving the retained file. The first real fetch happens in CI and on Cloudflare.
- **Freshness of the evidence.** It is one retained vintage; CDC revises records.

## For the owner

1. **Licence.** The preserved CDC Rt pages state no licence or reuse terms either way. The sources page labels this feed "Public Domain" like CDC's other U.S. Government products. Please confirm that is the position you want to publish.
2. **New egress path.** The build now calls `www.cdc.gov` directly (not the ingest mirror). If CDC or its CDN blocks the Cloudflare Pages or GitHub runner addresses, the blocks silently never appear; the build log says `epidemic trend: unavailable (…)`. If that matters, add the endpoint to the mirror and change `EPIDEMIC_TREND_URL`.
3. **After merge, check production:** `/data/epidemic-trends.json` exists with the latest `reportDate`; Wyoming and Connecticut show blocks and Iowa shows the withheld note; the home page has the national line. If absent, read the `epidemic trend:` line in the Cloudflare build log.
4. **Review `DOCUMENTED_ED_GAPS`** (`build/lib/epidemic-trend.mjs`) whenever CDC's data notes change; a stale entry errs toward withholding.
5. **Wastewater vintage.** CDC says (second-hand, from the category-verification note in the evidence package) that it recalculates COVID-19 wastewater baselines on April 1 and October 1 and revises history. The retained CDC state file is one vintage, but the site reads a different dataset through the mirror, and its only comparability guard is the Aug 14 method change. Confirm the mirror's wastewater history is a single vintage before relying on first-week-of-October wastewater trends, including the new comparison rows.
6. **Deploy timing.** The weekly rebuild deploys only when the feed has a newer Socrata week, so an Rt report published between deploys appears with the next one. Each block shows its own report date.
7. **Not covered by design:** metro pages, `/states/`, and browser re-rendering (the blocks are static).

## Files

New: `build/lib/epidemic-trend.mjs`, `build/lib/epidemic-trend-render.mjs`, `test/epidemic-trend.test.mjs`, `test/epidemic-trend-render.test.mjs`, `test/fixtures/cdc/covid-19-rt-map.json` (a faithful subset of the October 7 release: national, 51 state and 3 substate rows, values untouched), this document.

Changed: `build/build.mjs`, `build/check.mjs`, `build/pages/state.mjs`, `build/pages/home.mjs`, `build/pages/content/{data-sources,methodology,faq,changelog}.mjs`, `src/scripts/render.js` (exports `trendShape`), `src/styles/components.css`, `README.md`, `docs/ARCHITECTURE.md`, `docs/DATA-SCHEMAS.md`.
