# Port-forward plan: main's security and compliance work

**Status: plan only. Nothing here is implemented.** This branch adds one
document. It exists so the combined policy can be reviewed before any of it is
written, and so the work stays out of PR #10.

## Why this exists

`main` carries 23 commits the deploying lineage has never had. None of it has
ever been served: the repository's default branch — the branch Cloudflare Pages
builds production from — is `claude/respiratory-tracker-feasibility-sykoxq`,
and `main` is not an ancestor of it. Merging the two directions into each other
is explicitly off the table; this is the alternative, carried forward
deliberately, one reviewable piece at a time.

Two things are worth porting:

1. Eight security directives and two response headers absent from the deploying
   lineage.
2. Four compliance pages that are built but linked from nowhere, and the build
   guard that would have caught that.

---

## 1. Combined header policy

Facelift cache rules preserved exactly; main's security directives layered on
top. **Bold** rows are the ones that need a decision, not just a copy.

### Content-Security-Policy

| Directive | Deploying lineage today | After port | Breaks anything? |
|---|---|---|---|
| `default-src` | `'self'` | `'self'` | No |
| `base-uri` | `'self'` | `'self'` | No |
| `object-src` | `'none'` | `'none'` | No |
| `frame-ancestors` | `'none'` | `'none'` | No |
| `form-action` | `'self'` | `'self'` | No |
| `script-src` | `'self' 'sha256-…'` | **`'self' 'sha256-…' https://static.cloudflareinsights.com`** | Only if Web Analytics is actually on — see note A |
| **`script-src-attr`** | absent | `'none'` | **No.** `check.mjs` already fails the build on any inline event handler, so the site is provably compliant before the directive lands |
| `style-src` | `'self' 'unsafe-inline'` | `'self' 'unsafe-inline'` | No — the inline critical CSS needs it |
| `img-src` | `'self' data:` | `'self' data:` | No |
| `font-src` | `'self'` | `'self'` | No |
| **`connect-src`** | `'self' data.cdc.gov geo.fcc.gov` **`ingest.oakandmain.dev`** | must keep the ingest host **and** add `https://cloudflareinsights.com` | **YES — see note B. This is the one that bites.** |
| **`manifest-src`** | absent | `'self'` | No — `/manifest.webmanifest` is same-origin |
| **`worker-src`** | absent | `'self'` | No — `sw.js` is same-origin, emitted at the root |
| `upgrade-insecure-requests` | present | present | No |
| **`report-uri`** | absent | `/api/csp-report` | **Only if the endpoint ships — see note C** |
| **`report-to`** | absent | `csp-endpoint` | Same as above |

### Response headers

| Header | Today | After port | Breaks anything? |
|---|---|---|---|
| `X-Content-Type-Options` | `nosniff` | unchanged | No |
| `X-Frame-Options` | `DENY` | unchanged | No |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | unchanged | No |
| **`Permissions-Policy`** | `geolocation=(self), camera=(), microphone=(), payment=()` | `+ browsing-topics=()` | No |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains` | unchanged — still no `preload` | No |
| **`Cross-Origin-Opener-Policy`** | absent | `same-origin` | No — nothing calls `window.open` or reads `opener` (0 matches in `src/scripts/`) |
| **`Cross-Origin-Resource-Policy`** | absent | `same-origin` | **Low risk — see note D** |
| **`Reporting-Endpoints`** | absent | `csp-endpoint="<origin>/api/csp-report"` | Same as note C |
| `Cache-Control` (all 12 rules) | from PR #10 | **unchanged, preserved verbatim** | No |

### Notes

**A — the Cloudflare beacon.** `static.cloudflareinsights.com` is only needed if
Cloudflare Web Analytics is enabled for the Pages project. If it is not, adding
it widens `script-src` for no benefit. Check the Pages dashboard before porting;
omit both beacon hosts if Web Analytics is off.

**B — `connect-src` must not be copied from main.** main's version predates the
ingest Worker and reads
`'self' https://data.cdc.gov https://geo.fcc.gov`. Copying it wholesale would
silently delete `https://ingest.oakandmain.dev` and re-break the live refresh
that PR #10 just unblocked — reintroducing the exact bug `b817d55` created. The
merged directive must be the union, not main's copy. **This is the single most
likely way this port-forward causes a regression.**

**C — `report-uri` needs its endpoint.** `functions/api/csp-report.js` exists
**only on main**. Porting the two reporting directives without porting that
Pages Function points every violation report at a 404. Port the function in the
same commit or leave both directives out.

**D — `Cross-Origin-Resource-Policy: same-origin`.** This blocks *other origins*
from embedding this site's resources as subresources. It does not affect social
scrapers, which fetch `og:image` server-side where the header is not enforced.
The only thing it breaks is third-party hotlinking of the OG cards, which is
arguably the point. Flagged rather than assumed.

---

## 2. Compliance pages and the orphan guard

`main` has four page modules the deploying lineage lacks:

| Module | Route | What it is |
|---|---|---|
| `build/pages/content/changelog.mjs` | `/changelog/` | Append-only corrections record |
| `build/pages/content/editorial-policy.mjs` | `/editorial-policy/` | Editorial policy |
| `build/pages/content/consent.mjs` | `/consent/` | Privacy-choices / consent gate |
| `build/pages/content/vendors.mjs` | `/vendors/` | Vendor register |

Content pages are auto-discovered from the directory, so dropping the four
modules in builds the four routes. The footer is the part that needs a decision:
main's `FOOTER` map links all four under *Legal*; the facelift's does not.

**The footer is a symptom. The guard is the fix.** Nothing in `check.mjs` — on
either lineage — asserts that a generated page is reachable. Four pages could be
built and linked from nowhere and every check would pass.

### Orphan-page guard, spec

Add to `build/check.mjs`, alongside the existing link-integrity pass:

- Build the set of every emitted route (each `dist/**/index.html` as its
  directory URL, plus root-level `.html` files).
- Build the set of every internal `href` target across all emitted HTML,
  normalising to the same directory-URL form.
- **Error** on any emitted route that is indexable (`robots` meta does not
  contain `noindex`) and appears in neither set of inbound links nor
  `sitemap.xml`.
- **Exempt** deliberately unlinked routes by an explicit allowlist in the page
  module — `/offline.html` (service-worker fallback) and `/404.html` are the
  known cases. An exemption must be declared, not inferred from absence.
- Negative-test it the way the CSP and placeholder guards were tested: remove
  one footer link, prove the build fails, restore it.

This guard is worth more than the footer edit. It makes "built but unreachable"
a build failure permanently, rather than something a reviewer has to notice.

---

## Suggested sequence

1. Port the orphan guard **first**, with the current footer. It should pass.
2. Port the four page modules. The guard should now **fail** on four orphans —
   that is the guard proving itself.
3. Add the footer links. The guard passes again.
4. Port the security directives and `csp-report.js` together, honouring notes
   A–D, with `connect-src` built as a union rather than copied.

Each step is independently reviewable and independently revertible.
