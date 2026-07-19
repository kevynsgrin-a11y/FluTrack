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
| Backend | `functions/api/subscribe.js` | Cloudflare Pages Function for surge-alert signup. |

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

- KV namespace **`SUBSCRIBERS`** — persists signups.
- Env var **`ALERTS_WEBHOOK_URL`** — forwards signups to an email provider/automation.

With neither configured, `/api/subscribe` returns `501` and the form shows a friendly "not switched on" message — the site remains fully functional.

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
```

## License

Code is MIT-licensed (see `LICENSE`). The underlying CDC surveillance data is in the U.S. public domain. FluTrack's branding and presentation are its own.
