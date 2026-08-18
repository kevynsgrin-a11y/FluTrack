# FluTrack release checklist

**This is a gate, not a guide.** A release does not ship until every blocking
item below is either green in CI or signed off by name in the pull request.

The split matters. Automated checks run on every push and fail the build — they
need no discipline to enforce. The manual checks cannot be automated in CI
because they need a real browser, a real screen reader, or a real phone, so they
need a name and a date against them instead.

---

## 1. Automated — blocking, runs in CI

`npm run verify` (build → `check.mjs` → tests). A red result blocks the merge.

| Check | What it catches |
|---|---|
| Dead internal links & missing assets | A page linking to something that was never emitted |
| `<title>`, meta description, canonical, single `<h1>` | Pages that ship without the tags search and social need |
| Unresolved `{{template}}` markers, stray `undefined` | Template bugs that render as literal text |
| ES-module parse of every emitted script | A comment-stripper bug shipping broken syntax |
| No RFC-2606 reserved-TLD addresses in output | A contact route that silently never delivers |
| Non-overlapping `Cache-Control` rules | Two rules matching one asset, so the effective policy is indeterminate |
| Dark-theme token parity | The two dark contexts drifting apart |
| **Affiliate disclosure attached to every `rel="sponsored"` link** | A commercial link whose disclosure was separated from it |
| **Every `theme-color` meta is media-scoped** | An unscoped duplicate making browser chrome depend on first-vs-last tag resolution |
| **Required CSP / COOP / CORP / HSTS directives present** | A silent security downgrade |
| **HSTS carries no `preload` token** | An effectively irreversible commitment made before the subdomain inventory |
| **CSP allows the injected analytics beacon host** | A privacy policy describing analytics that CSP is actually blocking |
| **Every `<button>` has an accessible name** | An icon-only control announced as just "button" |

Run locally before pushing:

```bash
npm run verify
```

---

## 2. Manual — blocking, signed off per release

The controlled browser used for the 2026-07-25 audit **failed to honour a
390 × 844 viewport override**, so no automated run has yet certified real-device
responsiveness or reflow. Until that is fixed, these are done by hand on real
hardware and recorded in the PR.

### 2.1 Keyboard only

- [ ] Select a state with the keyboard alone — Tab to the picker, choose, submit, and land on the updated reading. No mouse.
- [ ] Skip link reaches `#main`; the "skip the state map" bypass skips all 51 tiles.
- [ ] Open and close the mobile nav with the keyboard; focus moves into the panel on open and back to the toggle on close.
- [ ] Escape closes the nav. Focus is never trapped anywhere on any page.

### 2.2 Screen readers

- [ ] **NVDA + Chrome** smoke test: home, one state page, `/alerts/`, `/consent/`.
- [ ] **VoiceOver + Safari** smoke test: same four pages.
- [ ] The threat level, trend and "as of" date are announced with their meaning, not as bare words.
- [ ] The severity meter announces "Severity unknown" for missing data, never "Minimal".
- [ ] Form errors on the alert form are announced and reachable.

### 2.3 Visual and motion

- [ ] **200% zoom** — no content lost, no horizontal scroll on the page body.
- [ ] **`forced-colors: active`** (Windows High Contrast) — all five severity levels remain distinguishable.
- [ ] **`prefers-reduced-motion: reduce`** — no gauge or tile animation, no smooth scroll.
- [ ] **`prefers-contrast: more`** — control boundaries and link underlines strengthen.

### 2.4 Widths

Check every one. Wide content (tables, the map, code blocks) may scroll inside
its own container; the page body may not.

- [ ] 320 px
- [ ] 375 px
- [ ] 390 px
- [ ] 414 px
- [ ] 768 px
- [ ] 1024 px

### 2.5 PWA flows, on real devices

- [ ] **iOS Safari** — install to home screen, launch, load a state page.
- [ ] **Android Chrome** — install, launch, load a state page.
- [ ] **Offline**: go offline and reload. The cached page shows the freshness notice naming the last verified snapshot, and the Retry refresh button is visible.
- [ ] **Recovery**: come back online. The notice clears and the reading refreshes without a manual reload.
- [ ] **Update**: deploy, then reload an installed instance — the new build is picked up rather than serving one deploy behind.

### 2.6 Consent and privacy

- [ ] With no decision recorded, no non-essential tag has run.
- [ ] Reject all and Accept all are the same size and weight wherever the choice appears.
- [ ] Withdrawing a decision returns everything to denied.
- [ ] With Global Privacy Control enabled, a rejection is recorded automatically and no prompt appears.
- [ ] `/vendors/` matches what the site actually loads. Check the network panel against the register.

---

## 3. Release blockers

**Ship nothing that exhibits any of these**, regardless of how minor it looks or
how close the deadline is:

1. **Horizontal overflow** of the page body at any width in §2.4.
2. **Unnamed controls** — any interactive element a screen reader announces without a meaningful name.
3. **Trapped focus** — any state the keyboard cannot escape.
4. **Clipped alert errors** — a form error that is cut off, hidden behind an ancestor's `overflow`, or announced but not visible.

Any one of these is a hard stop. Fix it or hold the release.

---

## 4. Invariants that outlive any single release

These are properties of the product, not of a build. A change that breaks one is
wrong even if every check above is green.

- **Sample data is never badged as live.** A live refresh must replace at least 25 of 51 states and carry a valid week-ending date before the provenance badge may say "Live CDC data".
- **No severity is announced as current while offline.** A cached page can hold a weeks-old reading; stating it bare is indistinguishable from a live alert. `app.js` qualifies every offline announcement, and any future in-page escalation notice must carry the same `isOffline()` guard.
- **Non-essential storage is denied until a decision is recorded** — everywhere, not only where a prompt is legally required.
- **The threat level is never a targeting signal.** It is not passed to any advertising system and is not available as a targeting parameter. See `/affiliate-disclosure/`.
- **No medical advice, and no implied clinical review.** Nothing on the site is medically reviewed, and the About page says so plainly. Do not add a review claim without naming a qualified reviewer.

---

## 5. Sign-off

Paste into the release PR:

```
Release gate
- npm run verify: PASS (commit <sha>)
- Keyboard-only state selection: PASS  — <name>, <date>
- NVDA/Chrome + VoiceOver/Safari:  PASS — <name>, <date>
- 200% zoom / forced-colors / reduced motion: PASS — <name>, <date>
- Widths 320/375/390/414/768/1024: PASS — <name>, <date>
- iOS Safari + Android Chrome install/offline/update: PASS — <name>, <date>
- Consent + vendor register spot-check: PASS — <name>, <date>
- Blockers (overflow / unnamed controls / trapped focus / clipped errors): NONE
```
