## Summary

This draft rebuilds FluTrack as a **Public-Health Bulletin**: an editorial state report whose central object is the live respiratory threat instrument. It replaces generic rounded dashboard surfaces with paper-toned report plates, press-ink rules, self-hosted type, structured data ledgers, and a severity system that remains legible when hue is unavailable. The data formula, data fetching, routes, slugs, titles, descriptions, canonicals, sitemap, alert endpoint, and user-facing health copy remain unchanged.

## Included work

- Self-hosted Newsreader Variable, Public Sans Variable, and a narrowly subsetted IBM Plex Mono numeral face. The combined font payload is **94,468 bytes**, below the 120 KB cap. Newsreader and Public Sans are the only preloaded fonts.
- A threat instrument with named thresholds, tick marks, a large mono index, trend shapes, provenance status, and one reduced-motion-safe needle settle.
- A pattern-plus-colour severity language. Every level presents a glyph, word, numeric index, and increasing field-pattern density in addition to colour.
- A semantic state cartogram with SVG patterns, a readable legend, descriptive state links, and a roving arrow-key model that reduces the map to one Tab stop after JavaScript loads.
- A visible **System / Light / Dark** selector wired to the pre-existing `data-theme` mechanism.
- State report status strip, comparison strip, ledger treatment for source signals, reserved advertising frames, affiliate season-kit frame, and state-specific authored SVG Open Graph cards.
- Complete design register, deferred data requests, contrast/simulation results, and 40 required before/after screenshots.

## Lighthouse, mobile preset

| Page | Performance | Accessibility | Best Practices | SEO | LCP | CLS |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Home | 76 | 100 | 100 | 100 | 2.56 s | 0.003 |
| `/state/florida/` | 76 | 100 | 100 | 100 | 2.41 s | 0.000 |

The local preview server does not provide Cloudflare compression or edge caching. The unchanged live-data enhancement also downloads and parses the existing upstream CDC bundles during the trace. The Performance floor of 90 was **not met locally**. I did not defer or remove that existing data behavior solely to raise a synthetic score because the work order requires byte-identical behavior. See `design/LIGHTHOUSE-RESULTS.md` for the complete measured report.

## Severity colour accessibility

Each light- and dark-theme chip combination passes 4.5:1 text contrast. The minimum adjacent colour distances after simulation were **67.1** for deuteranopia, **68.7** for protanopia, and **52.7** for tritanopia. Because all levels also retain monotonic SVG patterns, glyphs, words, and numeric indices, the ramp does not rely on colour. Full calculations are in `design/COLOR-ACCESSIBILITY.md`.

## JavaScript hooks touched or preserved

The following existing hooks remain functional and are either preserved directly or intentionally extended:

| Area | Hooks |
| --- | --- |
| Theme and navigation | `data-theme`, `#theme-toggle`, `#nav-toggle`, `#primary-nav`, `is-open` |
| Home selection | `#state-picker`, `#state-select`, `data-default`, `#geo-btn`, `#breakdown` |
| Live data refresh | `data-region="threat-card"`, `data-week`, `data-state`, `data-region="pathogen-tiles"`, `data-region="signal-rows"`, `data-region="state-name"`, `data-region="state-link"`, `data-region="glance-level"`, `data-region="glance-trend"`, `data-region="glance-week"`, `.hero__bg` |
| State cartogram | `.us-map__svg`, `.us-tile`, `data-abbr`, `data-sev`; extended with `data-row` and `data-col` for arrow-key navigation |
| Alert form | `#alert-form`, `#alert-email`, `#alert-state`, `#alert-company`, `#alert-status`, plus the original `email`, `state`, and `company` field names |
| New visual-only behavior | `[data-theme-choice]`, `[data-sticky-status]`, `[data-state-masthead]`, `data-region="sticky-level"`, `data-region="sticky-trend"` |

`ui.js` was updated for the visible three-mode control. `app.js` was updated only to retain heading semantics during live rerender and refresh the visual sticky-status values. `map-keyboard.js` and `sticky-status.js` add visual/accessibility behavior only. The added behavior modules total approximately 3.1 KB unminified, beneath the 8 KB added-JavaScript budget when minified. No inline script was added. The existing theme boot script was updated to understand `system`; its CSP hash is regenerated automatically by the existing build pipeline in `dist/_headers`.

## Advertising reservations

Home has frames below the threat readout and above the footer. State reports have frames after the virus trio and after the signal ledger. Each reserves **970×90 desktop** space and **320×100 mobile** space, is visibly labeled “Advertisement,” and has a `data-empty="true"` collapse contract for future integration. No network, product, or affiliate link is included.

## Deliberately not done

No raster, AI-generated, stock, or remotely hosted images were added. The state share-card issue is addressed through same-origin, authored SVG report cards generated from already-visible state fields. No new health copy is invented: the affiliate season kit is a three-slot frame with explicit `[COPY NEEDED]` placeholders recorded in `design/COPY-SLOTS.md`. No index formula, data-fetching rule, routing rule, title, description, canonical, sitemap entry, or alert behavior was changed. The deferred historical, baseline, completeness, regional-benchmark, and source-revision visual ideas are fully specified in `design/DATA-REQUESTS.md`.

## Validation

- `npm run verify` passed: build, static link/asset/SEO QA, and 29 test assertions.
- `node design/verify-overhaul.mjs` passed: required hooks, 94,468-byte font payload, 51 state-specific social cards, no interactive map marked as presentation, and required theme controls.
- `node design/verify-colors.mjs` passed: chip contrast and the three colour-vision simulation checks.
- `git diff --check` passed.
- `design/screenshots/` contains all 40 required before/after screenshots, indexed by `design/SCREENSHOTS.md`.
