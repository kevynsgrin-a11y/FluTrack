# Respiratory content review and owner release handoff

Prepared October 9, 2026, on branch `fix/respiratory-content-provenance`, from `main` at `c619cd47c1c75d1e0aeb2129ad9e7e8d8c4b1063`. This report records implementation evidence before merge. The associated GitHub pull request records final checks, merge status and subsequent production verification.

The release owner authorized PR creation and merge after code verification. For the checklist's screen-reader and real-device requirements, the owner explicitly instructed: “DROP LISTED REQUIRMENTS. I WILL ASSESS MANUALLY.” Those checks are assigned to the owner for this release; they are not represented as tests performed here. Automated checks remain required. The repository's general release checklist is unchanged.

## Result

The static state page and browser hydration now share the same evidence-qualified narrative. The combined score is identified as the **FluTrack combined respiratory index**. An observed measurement's trend is described as the latest observation compared with the mean of up to three prior observations. It is not presented as ordinary week-over-week change, a percentage change in the combined index, a case count or personal medical risk.

The model's `up`, `down`, `flat` and `unknown` directions have explicit presentation behavior. Missing latest observations remain missing; insufficient history remains unknown. Sample, stale and unverified provenance cannot produce an unsupported current reading. Pathogen readings retain their own evidence and never inherit the combined reading when a pathogen is missing. The existing scoring weights, breakpoints, ±8% trend boundaries, percentage clamp, 21-day observation guard, minimum live coverage and wastewater site threshold are unchanged.

Source listings follow the inputs actually used by each reading. Live state-index adapters are NSSP emergency-department diagnosis share, ARI activity category and NWSS wastewater viral activity. NREVSS test positivity has no live adapter and remains available only in explicitly labeled illustrative sample inputs. Hospital admissions used by the separate area report are not claimed as contributors to the state combined index.

National copy identifies the unweighted rollup of available jurisdictions; it is not represented as an official CDC national or population-weighted estimate. Historical rollup observations are aligned by date, and changing contributor identities suppress unsupported trends. Metro pages identify state context rather than independently measured city activity. Report cards preserve state hospital-admission geography, county wastewater coverage, observation periods and provenance. Unknown readings have no reassuring severity color or fabricated steady arrow. The default share image is a neutral, explicitly illustrative map.

## Exact before and after examples

These examples were reconstructed with the original main narrative/model and the approved CDC input responses for the week ending September 26, then compared with the repaired implementation. They describe that dated evidence, not October 9 health conditions.

### Alabama

Before:

> Combined flu, RSV and COVID-19 activity in Alabama is Low and holding steady (−16% week over week).

After:

> For observations ending Sep 26, 2026, the FluTrack combined respiratory index for Alabama was Low. It summarizes the available surveillance inputs; pathogen-specific readings may be missing. It is not a case count or an influenza-only level.

> The trend in the share of emergency-department visits was falling (−16%): latest observation compared with the mean of up to three prior observations. This comparison describes that measurement, not a percentage change in the combined index.

Before:

> No virus is rising sharply this week in Alabama.

After:

> Largest relative increase among available series for the share of emergency-department visits with the same comparison observations: Flu, +12%; latest observation compared with the mean of up to three prior observations. Rankings use the actual uncapped comparisons. Missing, insufficient and zero-baseline series are not ranked.

### Arizona

Before:

> Combined flu, RSV and COVID-19 activity in Arizona is Low and holding steady (+25% week over week).

After:

> For observations ending Sep 26, 2026, the FluTrack combined respiratory index for Arizona was Minimal. It summarizes the available surveillance inputs; pathogen-specific readings may be missing. It is not a case count or an influenza-only level.

> The trend in the share of emergency-department visits was rising (+25%): latest observation compared with the mean of up to three prior observations. This comparison describes that measurement, not a percentage change in the combined index.

Before:

> No virus is rising sharply this week in Arizona.

After:

> Largest relative increase among available series for the share of emergency-department visits with the same comparison observations: Flu, +100%; latest observation compared with the mean of up to three prior observations. Rankings use the actual uncapped comparisons. Missing, insufficient and zero-baseline series are not ranked.

Arizona's index label also changes because its latest wastewater observation is unavailable under the existing three-site requirement: only two eligible sites report for each pathogen. Main silently promoted an older finite wastewater value. The repaired reading uses ED visits and ARI for the dated index and preserves older wastewater observations as noncontributing history. No scoring threshold changed.

### Undefined and capped percentages

The same September 26 inputs substantiate two additional presentation repairs. Georgia's RSV ED-visit share has three prior reported observations of zero and a latest value of 0.1%. The model's existing zero-baseline convention returns an internal `changePct` of 100; the display now says “increased from zero; percentage change is undefined” rather than presenting that convention as a measured +100% increase. Such series are excluded from relative-percentage rankings.

Vermont's influenza ED-visit share rises from a mean of approximately 0.0333% to 0.2%, an actual relative comparison of +500%. The internal model cap remains +200%, but the display explicitly says “+200% or more (display capped)” and preserves the actual comparison in trend metadata. Fastest-riser selection compares actual uncapped percentages instead of treating all capped values as tied. Weights, thresholds and internal clamp behavior remain unchanged.

### Evidence and terminology

Before, insufficient history produced `direction: 'flat'` and `changePct: 0`. After, it produces `direction: 'unknown'` and `changePct: null` with an insufficient-data explanation. A genuinely comparable flat series still produces `flat`.

Before, a missing level could be labeled Minimal through numeric coercion. After, a nonfinite level is Unknown. Missing data does not establish an absence of illness.

An example sample summary now reads:

> This is an illustrative sample for California, not observed health conditions. Sample inputs do not establish a current level or trend.

Before, the narrative called the combined score an influenza threat level and claimed four contributing CDC signals including laboratory positivity. After, the narrative identifies a combined respiratory index and lists only each reading's contributing inputs; laboratory positivity is explicitly unavailable live.

Before, state WebPage structured data used the observation week as both `datePublished` and `dateModified`. After, verified available observations use `temporalCoverage`; publication and page-modification fields are emitted only when independently supplied. Sample or missing evidence does not acquire a fabricated publication date.

## Actual refresh and source dates

The actual final network build used the existing approved read path, with TLS verification enabled and Node's supported environment-proxy transport:

```sh
NODE_USE_ENV_PROXY=1 LIVE_PRERENDER=require npm run build
```

The exact existing ingestion queries were retained:

```text
https://ingest.oakandmain.dev/data/cdc-socrata/resource/vutn-jzwm.json?$limit=60000&$order=week_end+DESC
https://ingest.oakandmain.dev/data/cdc-socrata/resource/f3zz-zga5.json?$limit=20000&$order=week_end+DESC
https://ingest.oakandmain.dev/data/cdc-socrata/resource/atcp-73re.json?$limit=60000&$order=week_end+DESC
```

Final local snapshot generation/request: **2026-10-09T13:26:51.448Z**. Latest reporting week: **2026-09-26**. These are different facts.

| Measure | Dataset | Active observation period | Upstream retrieval | Upstream update field | Official publication date | Contributing jurisdictions |
| --- | --- | --- | --- | --- | --- | --- |
| ED diagnosis share, percentage of emergency-department visits | `vutn-jzwm` | Week ending 2026-09-26 | 2026-10-09T12:11:21.972Z | Not supplied | Not supplied | 50 |
| State ARI activity category | `f3zz-zga5` | Week ending 2026-09-26 | 2026-10-09T12:11:26.259Z | `2026-10-02 16:03:50.980149` | Not supplied | 50 |
| Wastewater viral activity level | `atcp-73re` | Week ending 2026-09-26 for current contributors | 2026-10-09T12:11:32.157Z | `2026-10-02 11:03` | Not supplied | 31 |
| NREVSS laboratory test positivity | No live adapter | Unavailable live | None | None | Unknown | 0 |

The update fields lack a supplied timezone and are retained as upstream build/update timestamps, not inferred official publication dates. Per-metric metadata preserves geography, observation periods, dated observations, publication date when supplied, upstream retrieval, local request time, cache status and source coverage. Older noncontributing wastewater periods, including September 19, remain visible in the metadata. They are excluded from an index for another period.

Initial read-only requests at approximately 11:52 UTC reached expired warm-cache envelopes retrieved around 00:11 UTC. The existing ingestion service subsequently refreshed the caches normally around 12:11 UTC. The final build used `cacheStale: false` envelopes, while the observation period remained September 26. Cache TTL and surveillance observation age are distinct checks. A fresh cache does not prove current-day conditions or a newer official observation, and a 13-day-old observation alone does not prove a publication-cadence failure.

The final snapshot has **51 usable combined jurisdiction readings**, verified from finite eligible same-period inputs rather than from 51 object keys. Iowa has missing ED and unavailable ARI data but eligible wastewater supports its combined reading. Arizona has no eligible latest wastewater reading. Maryland uses ED/ARI without wastewater. Wastewater coverage varies by state and pathogen; population coverage is not supplied. Commercial WastewaterSCAN/mixed-source rows, insufficient-site series and excluded repeated-value sites do not become usable coverage. Cases, positivity, wastewater, ED visits and hospital admissions remain different measures.

## History and overlap review

Remote main was rechecked and still matched `c619cd47c1c75d1e0aeb2129ad9e7e8d8c4b1063`. GitHub's public PR list showed zero open PRs and 28 closed PRs; PR pages and Git ancestry confirmed #23 and #26–#28 were merged.

- PR #23 already corrected metro JSON-LD, sample-map provenance, share cards and revision dates. Those fixes were retained.
- PR #26 added the production watchdog and weekly-rebuild dry run. This change strengthens its remaining key-count-only coverage check.
- PR #27 added official-first area reporting. This change qualifies its remaining date/geography/provenance presentation; it does not redo reporting or enrollment behavior.
- PR #28 repaired ingest loopback and symptom-report behavior. Those flows and the approved read path were retained.
- `data/live-accuracy-path-a` has two older unmerged commits, 34 behind main, including overlapping parsing/coverage changes and a different committed-snapshot architecture. Much of its parsing work is already superseded. Its branch was not replayed and its alternative refresh workflow was not adopted.
- `probe/ingest-health` is an explicitly throwaway probe, 85 behind main. Historical unique branch tips do not all represent outstanding work: season preview landed through PR #15, IndexNow emission exists on main, and the redundant deployment workflow is already absent.

The app inventory returned 50 recent non-pinned threads and all 10 pinned threads. The current active **Set up FluTrack** thread was the only FluTrack-related task identified in that returned inventory. This does not establish that no older, private or unlisted work exists. No other branch or task workspace was overwritten.

GitHub API access was initially unavailable, then became available in the replacement environment. Read-only API verification confirms #23 and #26–#28 are merged, with zero open PRs before this work's PR. Main was unchanged at the reviewed commit. No credentials or Access settings were changed to obtain access. The owner's subsequent instruction authorizes creating and merging this work's PR after verification.

## Validation

All checks below used the actual repository commands. The final code passed:

| Check | Result |
| --- | --- |
| `NODE_USE_ENV_PROXY=1 LIVE_PRERENDER=require npm run verify` | **427 passed, 0 failed, 0 skipped**, plus actual-network live build and QA; baseline was 334 tests |
| `LIVE_PRERENDER=off npm run build` | 75 sample-mode pages built |
| `npm run check` after sample build | Passed |
| Live build within `npm run verify` | 75 live-mode pages built from actual approved network responses |
| `npm run check` after live build | Passed |
| `npm run typecheck` | 115 files parsed and imports resolved |
| `node build/staleness-alarm.mjs --file dist/data/snapshot.json --now 2026-10-09` | Passed: live, September 26 observation period, 13 days old, 51 usable jurisdictions |
| `git diff --check` | Passed |

Focused tests cover up/down/flat, insufficient history, missing latest data and pathogens, unavailable sources, stale observations and cache envelopes, sample/unverified provenance, date-aligned rollups, changing contributor identities, false 51-key coverage and source-specific measurements. Static and hydrated descriptions, summaries, cards, neighboring readings, source evidence, accessibility announcements, metadata and FAQ structured data use the same evidence rules. The QA check retains an existing nonblocking warning for eight artifacts without Cache-Control; header configuration was not changed.

Local HTTP checks returned 200 for Alabama and Arizona state pages, all three actual metro routes (Atlanta, Boston and Bay Area), the home page and the live snapshot. Alabama's falling −16% and Arizona's rising +25% summaries agree with the WebPage description and FAQ answer, with temporal coverage September 26 and no fabricated publication date. Metro pages explicitly qualify state context; the home page qualifies the unweighted rollup. The served default share PNG matches the revised source asset; its 51 state tiles are neutral and labeled illustrative. These checks verified the local build, not production.

Final Chromium 151 checks also passed with JavaScript disabled and enabled for Alabama, Arizona, Iowa, the national page and Atlanta. Descriptions, FAQ structured data and observation periods agree before and after hydration; no browser script exceptions occurred. Actual viewport widths were verified at 320/375/390/414/768/1024, with no page-body overflow. Keyboard skip link, menu/Escape/focus return and state selection passed; forced-colors and reduced-motion emulation retained the dated content. An independent browser review covered 12 affected routes at all six widths.

The browser review found and repaired a new source-table layout overflow: Alabama at 320px previously had a 792px body. Grid minimum sizes, comparison chips, card columns and long evidence text now shrink/wrap appropriately; the source table remains scrollable within its own 288px container. All evidence text remains available. These are browser/emulation checks, not the physical-device or screen-reader assessment delegated to the owner.

## Changed files

Model, evidence, hydration and reporting:

```text
src/scripts/aggregate.js
src/scripts/app.js
src/scripts/data-sources.js
src/scripts/model.js
src/scripts/reading-provenance.js (new)
src/scripts/render.js
src/scripts/report-render.js
src/scripts/state-narrative.js (new)
src/scripts/takeaways.js
src/scripts/threat-index.js
src/server/area.js
src/assets/og-default.png
src/styles/main.css
src/styles/components.css
```

Build, content, metadata and coverage checks:

```text
build/build.mjs
build/check.mjs
build/lib/assets.mjs
build/lib/layout.mjs
build/lib/live-snapshot.mjs
build/lib/partials.mjs
build/lib/seo.mjs
build/lib/site.mjs
build/pages/content/data-sources.mjs
build/pages/content/editorial-policy.mjs
build/pages/content/faq.mjs
build/pages/content/medical-disclaimer.mjs
build/pages/content/methodology.mjs
build/pages/content/season.mjs
build/pages/content/states.mjs
build/pages/home.mjs
build/pages/metro.mjs
build/pages/state.mjs
build/staleness-alarm.mjs
```

Tests and handoff:

```text
test/aggregate.test.mjs
test/content-consistency.test.mjs (new)
test/data-sources.test.mjs
test/functions-report-area.test.mjs
test/hydration-content.test.mjs (new)
test/live-snapshot.test.mjs
test/model.test.mjs
test/render-provenance.test.mjs (new)
test/report-render.test.mjs
test/seo.test.mjs
test/staleness-alarm.test.mjs
test/state-narrative.test.mjs (new)
test/state-page.test.mjs
test/takeaways.test.mjs
test/threat-index.test.mjs
docs/CONTENT-REVIEW.md (new)
```

## Official explanatory evidence and remaining gaps

The three requested CDC explanatory pages were retrieved successfully with verified TLS between **2026-10-09T12:47:50Z and 12:47:54Z**. All displayed October 2, 2026 update dates:

- https://www.cdc.gov/respiratory-viruses/data/
- https://www.cdc.gov/wastewater/respiratory-viruses/state.html?cove-tab=1
- https://www.cdc.gov/respiratory-viruses/data/activity-levels.html

CDC's October 2 national summary states: “COVID-19 activity remains elevated in some regions but is declining nationally.” The season page quotes that explicitly dated national context, not a current-week conclusion or the trend for a selected state or city. No invented numbers or personal medical recommendations were added.

CDC documents Iowa's NSSP feed termination on May 6, 2026 after an HIE vendor change: May 2 is the last complete included week, and May 9 onward shows Data Unavailable. The shared Iowa source-evidence note and methodology/source pages explain this surveillance gap rather than interpreting it as absence of illness. CDC also documents Missouri's historical ARI baseline substitution for weeks before March 2–8, 2025.

The October 2 wastewater notice describes the September 28 Verily contract award and a brief data gap affecting about 200 sites while reporting restarts. Its timing does not, by itself, explain missing September 26 observations. CDC updates on Fridays with prior-week observations and subsequent revisions; observations, explanatory-page update dates and retrieval timestamps remain distinct. CDC's population-coverage caveats are separate from FluTrack's existing eligible-site threshold and license exclusions.

Metric publication dates remain unknown where the ingestion payload does not supply them, regardless of the explanatory pages' publication dates. Population coverage and live NREVSS positivity also remain unavailable. The mirror's latest reporting week was September 26 at verification time; its retrieval timestamp does not independently certify the latest possible upstream publication.

### Socrata publishing incident: verified caveat

The [official Socrata status page](https://status.socrata.com/) was checked October 9 around 13:21 UTC. It lists the Datasync incident as open/monitoring, Ingress-Publishing as partially disrupted, and the SODA API as operational. Investigation began October 8 at 16:56 UTC; an October 8 **19:04 UTC** update says a solution was implemented, Datasync was operational and monitoring continued. This qualifies the original report of a continuously active outage. Read availability still does not establish completeness of publisher updates or rule out delayed publication/backlog.

The exposure is verified: the three TrueAPI CDC/Socrata feeds used by the site are scheduled every six hours, while the independent FluTrack Worker reads six CDC/Socrata datasets directly. No particular CDC delay or failed public-site refresh caused by this incident was established. The code therefore continues to qualify readings by their actual observation periods and publication/update/retrieval evidence rather than treating HTTP 200, `fetchedAt` or 51 keys as proof of fresh observations. No migration deadline or ingestion-path change follows from this incident.

The configured Friday Worker ingestion at **18:00 UTC / 11 a.m. PDT** is later than this verification. TrueAPI's six-hour mirror schedule runs at minute 11, including **18:11 UTC**; audit each path after its own run completes. A post-run freshness audit remains pending: compare each source's observation period, publisher update timestamp, ingestion result, served week and stale/fetchedAt metadata against its own publication cadence. That future audit cannot be represented as completed in this report. The existing workflow and credentials are unchanged.

Pre-release live home, Alabama, Arizona, Iowa, Atlanta and snapshot requests returned 200 around 12:48 UTC. Production still served the old build generated at **2026-10-09T05:20:43.117Z**, with September 26 observations and the confirmed false “holding steady” statements. This established the deployed defect, not verification of the pending fix.

Merge may trigger the existing git-connected Cloudflare Pages release and ingest deployment workflow. After the authorized merge, verify live Alabama, Arizona and Iowa pages, national and Atlanta pages, and `/data/snapshot.json`; compare static first paint, hydrated text, source dates/contributors, cards, metadata, FAQ structured data and share assets. Confirm sample/missing qualifications and run the production surveillance check. Record those post-release results on the PR before claiming deployed completion.

Access, credentials, subscriptions, notification enrollment, Wrangler configuration, manifests and deployment workflows are unchanged. The cloud environment setup was saved separately with reusable installation/start instructions and the approved ingestion domain; no repository dependency was added.


## Production verification and cache follow-up

PR [#29](https://github.com/kevynsgrin-a11y/FluTrack/pull/29) merged at **2026-10-09T13:33:49Z**, commit `dd63ab82cd4208fd8b5567dfb26bb77f4c0deddd`. Post-merge CI passed both builds, QA and all 427 tests. Cloudflare Pages reported a successful deployment of that commit. Its new regular-URL snapshot was generated at **2026-10-09T13:34:49.280Z**, with September 26 observations, the same October 9 12:11 upstream retrievals, and 50/50/31 ED/ARI/wastewater contributors. Usable combined coverage remained 51 jurisdictions.

Actual production browser checks around **13:38–13:39 UTC** verified corrected static AL/AZ/IA descriptions, OG/Twitter metadata, FAQ answers, source dates, the national rollup qualification and Atlanta state context. All 30 viewport checks passed. However, after a confirmed snapshot request and card replacement, hydration restored the old card copy. The browser loaded old Cloudflare-cached `app`, `model`, `render`, `data-sources`, `aggregate`, `takeaways` and `threat-index` modules from stable URLs with `max-age=14400`. The stable default PNG was also old. A fresh service worker and repeat visit reproduced the mismatch; read-only no-cache requests did not resolve it. Static-page success therefore did not establish complete release success.

The follow-up emits the entire client module graph into one content-addressed directory, such as `/assets/js/edd47d267e77/`. Entry modules, relative imports and lazy imports then share the same release address. The unchanged compatibility URLs remain available to older pages. The default share PNG receives a content-addressed filename and both OG/Twitter tags use it. The service-worker cache version includes the JavaScript content revision, so a JavaScript-only release changes the cache key. No cache policy, configuration, credential or Access change is needed.

The live no-JS area page also exposed an unsupported `This week near Alameda County` title. It now reads `Respiratory readings for Alameda County, CA`; description metadata retains the state index's actual date and live/sample/historical/unknown qualifications, while identifying county wastewater and statewide hospital admissions as separate observations. A raw numeric unknown or undated level no longer adds a reassuring severity color to the area map.

Follow-up files: `build/build.mjs`, `build/check.mjs`, `build/lib/layout.mjs`, `build/lib/versioned-assets.mjs` (new), `src/server/page.js`, `test/report-render.test.mjs`, `test/versioned-assets.test.mjs` (new), and this report. Actual live `npm run verify` passed **431 tests, zero failures or skips**, a 75-page build and QA; typecheck passed 117 files. The new cache regression imports both static and lazy dependencies from two release addresses and verifies that a cached old graph cannot supply the new reading. Area result-page tests cover neutral titles, metadata and unknown map severity. Final live verification of this follow-up will be recorded on its PR.

The existing ingest workflow passed 25 Worker tests after #29 but explicitly skipped deployment because its repository API-token secret is absent. The Pages presentation fixes are independent of that deployment: the changed Worker-imported helpers have unchanged implementations. No Worker redeployment is claimed and no secret was added. The Socrata post-ingestion audit after 18:00/18:11 UTC remains pending.


Independent local browser verification of the cache follow-up confirmed an actual completed snapshot request plus a card replacement on AL/AZ/IA/home/Atlanta. Static and hydrated text/metadata/FAQ remained equal; 20 module response bodies, including focus-triggered lazy imports, matched the versioned build bytes. The fingerprinted neutral PNG also matched, and the 320/390px checks passed without script exceptions. Future deployments prune older hash directories; an already-open older page may need a reload for an uncached lazy module. The existing report loader falls back to its native server form when its lazy module is unavailable. Initial migration keeps legacy script URLs available.
