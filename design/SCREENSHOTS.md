# FluTrack Visual Evidence

The required **40 viewport screenshots** are retained under `design/screenshots/`. Each page has a production **before** and rebuilt **after** view at 390px and 1440px, in both light and dark modes.

| Page | Before captures | After captures |
| --- | --- | --- |
| Home | `before/home-{390,1440}-{light,dark}.png` | `after/home-{390,1440}-{light,dark}.png` |
| Florida report | `before/florida-{390,1440}-{light,dark}.png` | `after/florida-{390,1440}-{light,dark}.png` |
| States directory | `before/states-{390,1440}-{light,dark}.png` | `after/states-{390,1440}-{light,dark}.png` |
| Alerts | `before/alerts-{390,1440}-{light,dark}.png` | `after/alerts-{390,1440}-{light,dark}.png` |
| 404 | `before/404-{390,1440}-{light,dark}.png` | `after/404-{390,1440}-{light,dark}.png` |

Production captures were collected from `https://flufollower.com`. Rebuilt captures were collected from the local static preview after the final build. The capture script is `design/capture-screenshots.sh` and applies a 25-second limit to each Chromium invocation to keep visual validation reproducible.
