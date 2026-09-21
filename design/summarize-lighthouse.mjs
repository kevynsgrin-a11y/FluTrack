import { readFileSync, writeFileSync } from 'node:fs';
const report = ['# Mobile Lighthouse Results', '', '| Page | Performance | Accessibility | Best Practices | SEO | LCP | CLS |', '| --- | ---: | ---: | ---: | ---: | ---: | ---: |'];
for (const [name, path] of [['Home', 'design/lighthouse/home-mobile.json'], ['Florida state report', 'design/lighthouse/florida-mobile.json']]) {
  const r = JSON.parse(readFileSync(path, 'utf8'));
  const score = (key) => Math.round(r.categories[key].score * 100);
  const audit = (key) => r.audits[key].numericValue;
  report.push(`| ${name} | ${score('performance')} | ${score('accessibility')} | ${score('best-practices')} | ${score('seo')} | ${(audit('largest-contentful-paint') / 1000).toFixed(2)} s | ${audit('cumulative-layout-shift').toFixed(3)} |`);
}
report.push('', 'The local preview server does not apply Cloudflare compression or immutable edge caching. The existing live-data refresh also requests and parses the current upstream CDC bundles during the Lighthouse trace. The measured Performance scores are therefore reported transparently and are below the requested 90 floor; no logic or data-fetching behavior was changed merely to improve the score.');
writeFileSync('design/LIGHTHOUSE-RESULTS.md', report.join('\n') + '\n');
console.log(report.join('\n'));
