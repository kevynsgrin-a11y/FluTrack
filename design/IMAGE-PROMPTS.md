# FluTrack Image Prompt Register

## Decision

**No external or raster imagery is requested for this overhaul.** The approved Public-Health Bulletin direction gains atmosphere from self-hosted typography, paper-toned surfaces, editorial rules, authored SVG severity patterns, the inline SVG map, the inline SVG gauge, and state-specific authored vector social cards. This avoids both empty decorative imagery and any conflict with the production Content Security Policy.

The only visual assets added are code-authored, same-origin SVG work. They are not AI-generated images, stock imagery, icon packs, or third-party resources. The state social cards are created during the static build from the report’s already-visible state name, level, trend, and activity-index value.

| Asset class | Path | Dimensions | Format | Placement | Alt-text requirement | Generation prompt |
| --- | --- | ---: | --- | --- | --- | --- |
| State report social card | `/assets/og/<state-slug>.svg` | 1200×630, 1.90:1 | Authored SVG | Per-state Open Graph and Twitter image metadata | Metadata `og:image:alt` remains present; the card’s visible state-specific data duplicates the report’s data. | Not applicable. Deterministic authored SVG generated from existing state report fields only. |
| Severity patterns | Inline `#map-pattern-0`–`#map-pattern-4` | Vector tile units | Inline SVG | Interactive cartogram and severity legend | Decorative within a labelled severity token; word and numeric level remain in text. | Not applicable. Authored vector patterns, with density increasing from level 0 to level 4. |

No placeholder image boxes are required because the chosen direction does not depend on a future image. If a later editorial campaign requests photography or illustration, its exact path, final dimensions, reserved layout frame, required alt text, and verbatim prompt must be added here before placement.
