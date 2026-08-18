# FluTrack

**A plain-English, mobile-first respiratory illness tracker — flu, RSV and COVID-19 — built on public-domain CDC surveillance data.**

FluTrack answers one question that the CDC's own dashboards make surprisingly hard: _how active is respiratory illness where I live, and which way is it heading?_ It blends several CDC public-domain surveillance signals into a single, transparent **Respiratory Threat Level** (Minimal → Very High) for every U.S. state, with a rising/falling trend and a per-virus breakdown.

> **Not medical advice.** FluTrack is an independent data-visualization utility and is **not affiliated with the CDC**. It shows directional, weekly _trends_ — not real-time case counts or individual risk. See [`/medical-disclaimer/`](src/../build/pages/content/medical-disclaimer.mjs).

---

## Why it exists

The 2025–26 "quad-demic" left consumers wanting a fast, local, jargon-free read on respiratory risk. The CDC publishes authoritative data (NSSP, NWSS, NREVSS) but its dashboards are built for epidemiologists. FluTrack is a sterile **interpreter**: it translates that data into one local answer and nothing more — deliberately avoiding medical advice so it stays defensible under Google's YMYL / E-E-A-T scrutiny and premium ad-network brand-safety rules.

## Architecture at a glance

FluTrack is a **static site** (Cloudflare Pages-ready) with **zero runtime dependencies** and a tiny custom build. Data is fetched **client-side, in the visitor's browser**, directly from the CDC's public Socrata API — so the site is cheap to host and always current, with a bundled sample snapshot as an instant, clearly-labeled fallback.

```
Browser ──▶ data.cdc.gov (Socrata/SODA, public domain, open CORS)
   │            └─ live refresh (progressive enhancement)
   └──▶ /data/snapshot.json (bundled sample; instant first paint + offline fallback)
```

| Layer | Files | Notes |
|------|-------|-------|
| Scoring model | `src/scripts/threat-index.js` | Pure, tested. The unified 0–4 threat level. |
| Data adapters | `src/scripts/data-sources.js` | CDC Socrata fetch + **WastewaterSCAN exclusion**. |
| Rendering | `src/scripts/render.js` | Pure HTML functions shared by **build and browser** (identical markup). |
| App controller | `src/scripts/app.js` | Snapshot → live upgrade, state picker, geolocation. |
| Design system | `src/styles/*.css` | Tokens, light/dark, severity scale, components. |
| Build | `build/build.mjs` | Emits `dist/` — home, 51 state pages, content pages, SEO, PWA. |
| Consent gate | `src/scripts/consent.js` | Default-deny gate for non-essential storage; honors GPC. |
| Backend | `functions/api/subscribe.js` | Cloudflare Pages Function for surge-alert signup. |
| CSP reports | `functions/api/csp-report.js` | First-party collector for CSP violation reports. |

Because the render functions are imported by **both** the Node build (static output) and the browser (live re-render), the server-rendered and hydrated markup are byte-identical — no flicker, no hydration mismatch.

## Data sources & licensing

FluTrack uses **only U.S. Government public-domain** feeds:

- **NSSP** — Emergency-department visits for flu/RSV/COVID (`vutn-jzwm`) and ARI activity level (`f3zz-zga5`).
- **NWSS** — Wastewater Viral Activity Level / WVAL (`atcp-73re`), an early indicator.
- **NREVSS** — Laboratory test positivity.

**It deliberately excludes WastewaterSCAN / SCAN / Verily data**, which is licensed **CC BY-NC 4.0 (non-commercial)** and cannot be used on a monetized site. The exclusion is enforced defensively in code (`excludeNonCommercial` in `data-sources.js`) and covered by tests. See [`/data-sources/`](build/pages/content/data-sources.mjs).

## The threat level (summary)

A composite 0–100 score is a weighted average over whatever signals are present for a state/week — wastewater `0.30`, ARI `0.25`, ED visits `0.25`, positivity `0.20` (renormalized) — then bucketed: `<20` Minimal, `<40` Low, `<60` Moderate, `<80` High, `≥80` Very High. Wastewater is weighted highest because it leads clinical reporting by ~5–7 days. Full, transparent thresholds live on the **/methodology/** page and in `threat-index.js`.

## Develop

```bash
npm run build          # build the static site into dist/
npm run serve          # preview dist/ at http://localhost:8788
npm run dev            # build + serve
npm test               # run the unit + integration tests
npm run build:snapshot # regenerate the bundled sample data
```

No `npm install` is needed — there are no dependencies. Requires Node ≥ 20.

Icons and the Open Graph card are pre-rendered PNGs committed under `src/assets/`. To regenerate them from the SVG sources (requires a local Chromium):

```bash
node build/lib/rasterize.mjs
```

## Deploy (Cloudflare Pages)

- **Build command:** `npm run build`
- **Output directory:** `dist`
- **Functions:** the `functions/` directory is picked up automatically.

Optional bindings for live surge-alert delivery (Settings → Functions):

- KV namespace **`SUBSCRIBERS`** — **required**: persists signups and backs the per-IP rate limiter.
- Env var **`ALERTS_WEBHOOK_URL`** — forwards signups to an email provider/automation.

Without the KV binding, `/api/subscribe` returns `501` and the form shows a friendly "not switched on" message — the site remains fully functional. KV is required rather than optional because the rate limiter is backed by it; a webhook-only deployment would accept unlimited unauthenticated submissions with arbitrary recipient addresses.

### Cloudflare Web Analytics and the CSP

Web Analytics is enabled on the `flufollower.com` zone with **automatic injection**, so Cloudflare adds its `beacon.min.js` tag to every HTML response at the edge. That tag is not in this repository and cannot be hashed at build time, so the CSP names its host explicitly:

- `script-src` includes `https://static.cloudflareinsights.com`
- `connect-src` includes `https://cloudflareinsights.com` (where the beacon reports)

**If you disable Web Analytics, remove those two entries.** If you re-enable it after removing them, the tag will ship on every page and be blocked on every load — a broken beacon *and* a privacy policy describing analytics that never actually run. `build/check.mjs` fails the build if the allowance goes missing while the policy still claims the beacon.

The beacon is cookieless and writes nothing to the visitor's device, which is why it sits outside the consent gate. It is named by legal entity in `/privacy/` and `/vendors/`.

Set `SITE_ORIGIN` at build time to your production origin so canonical URLs, sitemap, and Open Graph tags are correct:

```bash
SITE_ORIGIN=https://your-domain.example npm run build
```

## Project structure

```
build/            Build pipeline (Node ESM, no deps)
  build.mjs       Orchestrator
  lib/            layout, site config, states, seo, partials, snapshot, assets
  pages/          home.mjs, state.mjs, content/*.mjs (auto-discovered)
src/
  scripts/        Client + shared ES modules (threat-index, render, app, …)
  styles/         Design system (tokens, base, components, main)
  assets/         Committed PNG icons + OG card
  data/           snapshot.json (generated)
functions/api/    Cloudflare Pages Functions
test/             node:test unit + integration tests
docs/             Architecture, audits, and the release checklist
```

## Compliance & release

Three pages carry the site's accountability obligations, and all three are
generated from configuration rather than hand-maintained prose:

- **`/consent/`** — the live preference centre. Advertising and analytics storage
  are denied by default for every visitor, not only where a prompt is legally
  required; nothing non-essential loads before a decision is recorded; Global
  Privacy Control is honored as an opt-out. The gate is `src/scripts/consent.js`,
  and registering a vendor in its `VENDORS` array is what arms the banner.
- **`/vendors/`** — the processor register, rendered from the `processors` array
  in `build/lib/site.mjs`. The Privacy Policy reads the same array, so the two
  cannot describe a vendor differently.
- **`/changelog/`** — append-only record of corrections and methodology changes,
  flagging which ones affected readings that had already been published.

**Before any release, work `docs/RELEASE-CHECKLIST.md`.** `npm run verify` covers
the automated half and blocks on it; the manual half (screen readers, real
devices, six viewport widths, PWA install/offline/update) needs a signature in
the PR because CI cannot certify it.

## License

Code is MIT-licensed (see `LICENSE`). The underlying CDC surveillance data is in the U.S. public domain. FluTrack's branding and presentation are its own.
