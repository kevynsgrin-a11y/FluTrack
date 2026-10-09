# FOLLOWUPS — "Report your symptoms + Check your area"

Small intricacies deliberately skipped or stubbed to keep the build moving.
Each line says what, why, and where.

## Blockers needing Kevyn (Cloudflare access this session did not have)

- [ ] **Turnstile widget** — create one (Cloudflare dashboard → Turnstile → Add
      widget, domains `flufollower.com`, `flufollower.pages.dev`, mode Managed).
      Put the **site key** in `build/lib/site.mjs` → `turnstile.siteKey` (public),
      and the **secret** with `npx wrangler pages secret put TURNSTILE_SECRET
      --project-name flufollower`. Until then the report form shows "opens soon"
      and `/api/report` answers 503; "Check your area" works. See
      docs/DEPLOY-FEATURE.md §2.
- [ ] **Deploy `flutrack-ingest`** (`cd workers/ingest && npx wrangler deploy`),
      set `INGEST_TOKEN` (and optionally `SODA_APP_TOKEN`), then trigger one
      ingest and seed the crosswalk (docs/DEPLOY-FEATURE.md §3). Until then
      `/api/area` pulls each state from CDC on demand and the daily
      maintenance cron (salt rotation, 90-day purge, aggregates, anomaly
      checks) does not run — community counts stay at "fewer than 5".
- [ ] **Legal review** for WA My Health My Data Act (RCW 19.373) / NV SB 370 /
      CT consumer health data before any marketing push. The notice at
      `/consumer-health-data-privacy/` is written to the code, not reviewed by
      counsel.

## Data

- [ ] **CDC_Verily / CDC_Biobot wastewater rows are excluded.** The existing
      `excludeNonCommercial` regex in `src/scripts/data-sources.js` matches
      `verily`, so CDC's own contracted national-testing sites (public domain)
      are dropped along with WastewaterSCAN. After the 2026-09-28 vendor switch
      to Verily this will grow. Decide whether `CDC_Verily` is usable and, if
      so, narrow the regex (state-level readings would change → changelog).
- [ ] **Joint "State_Territory, WastewaterSCAN" sites are excluded** (licence
      cannot be separated). San Diego County's only site is one of these, so
      it shows "no wastewater site reporting".
- [ ] County names in `atcp-73re` are matched to FIPS by name within a state
      (`countyFipsByName`); a few spellings may not match and are skipped.
      Log `onUnmatched` from a real pull and add aliases. Connecticut's 2022
      planning regions vs. old counties need a look.
- [ ] ZIP→county uses the Census 2020 ZCTA file (largest **land-area** share).
      HUD's USPS crosswalk (largest **residential** share) is better: get a
      free HUD token and run `node scripts/zip-crosswalk.mjs --hud <csv>`.
      PO-box-only ZIPs have no ZCTA and return "try a nearby ZIP".
- [ ] ZIP3 suppression uses the HHS Safe Harbor list of 17 restricted ZIP3s
      (`RESTRICTED_ZIP3` in `src/server/geo.js`); refresh from 2020 Census
      ZCTA populations.
- [ ] Seed D1 `zip_crosswalk` (`POST /__seed-zip` once the Worker is live).
      Until then lookups use the static `/data/zip3/*.json` shards — fine,
      but D1 is the intended source.
- [ ] `NWSS_SITE` (ymmh-divb) and `DELPHI_FLUVIEW` are built but off. Delphi
      returned no rows for `ny` in a test call (NYC is split in ILINet) — check
      region codes before enabling.
- [ ] Later, flag only: FluSight ensemble, NREVSS `rgnm-fkqb` / `seuz-s2cv`,
      CDPH CKAN `00a147ba-0410-4699-9e34-fd18bbb7017d`.
- [ ] The card's state level comes from the build's snapshot (weekly rebuild);
      the NHSN/NWSS chips come from the ingest. They can show different weeks
      for a day or two after a Friday release — both are labeled.

## Product / UX

- [ ] Sending a report without JavaScript is not possible (Turnstile needs
      JS); the no-JS page explains this and "Check your area" works fully.
- [ ] Territories (PR, GU, VI…) are treated as non-US ("US-only for now").
- [ ] `FEATURE_REPORT=false` hides only the report form; "Check your area"
      stays (it is official data). Set it in `wrangler.toml [vars]` (runtime,
      503) **and** as a build variable to drop the form from the HTML.
- [ ] The existing site-wide "Live CDC data" provenance badge predates the
      "never say live" copy rule. Renaming it touches `build/check.mjs`,
      `build/staleness-alarm.mjs` and their tests — do it as its own change.
- [ ] Spanish copy, county pages, county-level alerts, embeddable widget —
      see the spec's §6.
- [ ] Named medical reviewer + "last reviewed" dates (E-E-A-T).

## Engineering

- [ ] Node 20 is EOL: `.nvmrc` still pins 20 for the Cloudflare build (CI
      builds on 20 and runs tests on 22 because the D1 test double uses
      `node:sqlite`). Move both to 22.
- [ ] `/api/subscribe` has no `SUBSCRIBERS` KV binding in `wrangler.toml`, so
      it answers 501 in production (pre-existing; bindings are now managed in
      that file).
- [ ] Integration tests run the Functions against an in-memory D1 on
      `node:sqlite`, not Miniflare. A `wrangler pages dev` smoke test in CI
      would also cover bundling.
