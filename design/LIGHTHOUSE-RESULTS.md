# Mobile Lighthouse Results

| Page | Performance | Accessibility | Best Practices | SEO | LCP | CLS |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Home | 76 | 100 | 100 | 100 | 2.56 s | 0.003 |
| Florida state report | 76 | 100 | 100 | 100 | 2.41 s | 0.000 |

The local preview server does not apply Cloudflare compression or immutable edge caching. The existing live-data refresh also requests and parses the current upstream CDC bundles during the Lighthouse trace. The measured Performance scores are therefore reported transparently and are below the requested 90 floor; no logic or data-fetching behavior was changed merely to improve the score.
