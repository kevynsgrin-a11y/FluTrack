# FluTrack Design Kit

## Design identity

**FluTrack is the weekly state bulletin.** Its visual language takes its authority from a measured public record rather than a product dashboard. The site is constructed from paper-toned surfaces, ink rules, data labels, and a single instrument readout. The reading itself is the memorable object. Everything else is quieter and placed to help a visitor understand, compare, or act on it.

## Palette

| Role | Token family | Value | Application |
| --- | --- | --- | --- |
| Bulletin paper | `--bg`, `--surface` | `#F5F0E6`, `#FFFDF8` | Default light canvas and report plates. |
| Press ink | `--text` | `#18272B` | Text, high-order rules, instrument marks, and footer boundary. |
| Agency teal | `--brand-500` | `#127C74` | Brand anchor, actions, and minimal activity. |
| Survey blue | `--sev-1` | `#3E8FB0` | Low activity. |
| Archive amber | `--sev-2` | `#E8B21F` | Moderate activity and careful-warning emphasis. |
| Vermillion signal | `--sev-3` | `#D4541E` | High activity. |
| Oxblood signal | `--sev-4` | `#8C1D33` | Very-high activity and form errors. |
| Night edition | dark `--bg` | `#102126` | Low-glare dark canvas, distinct from a simple inversion. |

Severity is never represented by hue alone. Each level combines an ordered field pattern, a distinct glyph, the written level, and its numeric index. The patterns become denser from Minimal to Very High. `--map-*` remains aligned to the same ramp, and the map uses the corresponding SVG pattern definitions rather than flat fill colors.

## Typography

| Role | Typeface | Usage | Delivery |
| --- | --- | --- | --- |
| Editorial display | Newsreader Variable | H1–H4, threat level word, major question and section headings. | Self-hosted `newsreader-latin.woff2`; preloaded. |
| Interface and body | Public Sans Variable | Navigation, form fields, legal prose, captions, buttons, tables, and state names. | Self-hosted `public-sans-latin.woff2`; preloaded. |
| Instrument numeral | IBM Plex Mono | The large 0–100 gauge number only. | Self-hosted numeral subset; not preloaded. |

Newsreader establishes the report’s editorial authority, while Public Sans reflects the federal-data provenance without impersonating an official agency. IBM Plex Mono is deliberately quarantined to the activity-index reading. Tabular figures elsewhere come from Public Sans. Font assets total **94,468 bytes**, beneath the 120 KB budget. Display fallback metrics are tuned to avoid a disruptive swap; body text uses `font-display: swap`.

## Scale and layout

The retained fluid type tokens now extend from `--step--1` to `--step-5`, where `--step-5` spans `4.75rem` to `9.5rem`. That scale is reserved for the numerical instrument. The body measure remains capped below 80 characters through the existing narrow container. Standard content sections use 3rem vertical rhythm. Only the hero instrument receives a 5px severity rule and broad internal spacing.

The desktop page is built on asymmetry: the threat readout owns the broad first hero column and explanation sits beside it. On small screens, the reading comes first. State reports use an editorial main column and a ruled utility rail. The sticky status strip appears only after the state masthead has left view.

## Geometry and elevation

| Element type | Radius | Elevation | Meaning |
| --- | --- | --- | --- |
| Data plates, tables, map field | Square or 2px | None | These are part of the report surface, not floating interface widgets. |
| Controls and status badges | 2px | None | Precise, practical controls. |
| Hero instrument | 0px with a severity top rule | None | Importance comes from scale and structure, never a generic rounded card. |
| Overlay navigation | 0px | Restrained | The only context that may layer above the document. |

## Component inventory

The system contains the threat instrument, severity specimen, trend shape, patterned cartogram, data ledger, by-virus comparison, state index, state status strip, alert service notice, advertisement reservation, season-kit frame, FAQ rows, legal disclaimer strip, footer, and visible System/Light/Dark theme group. Each component follows the paper, ink, rule, and field-pattern language. The home page and state reports use the same threat renderer so sample and live data are structurally identical.

## Accessibility and motion

The severity chip combinations meet 4.5:1 contrast in both light and dark themes. The map has a meaningful region label, descriptive links, structured legend entries, and a roving arrow-key model that avoids a 51-stop Tab sequence after JavaScript loads. Static anchors remain usable without JavaScript. The three theme buttons use the existing `data-theme` mechanism and include a system mode. Focus rings are high-contrast, reduced motion renders the settled instrument immediately, and forced-colors rules prioritize system colors and marks over decorative backgrounds.

Movement is restricted to one needle settle on the gauge. No sections fade or slide into view, cards do not lift on hover, and data surfaces do not pulse. Below-fold sections use `content-visibility` to defer work without moving the page layout.

## Principles

The visual system is intentionally specific to FluTrack. It makes the weekly, state-level surveillance report feel legible and calm at the moment a visitor asks whether something is going around. It accepts the limits of reported data through prominent provenance and lag language. It places conversion beside trust rather than above it. It treats disclaimers as report content, not as a legal footnote. It does not borrow the startup, hospital, or generic dashboard visual grammar.

## References

[1]: https://github.com/productiontype/Newsreader "Newsreader Open Font License"
[2]: https://github.com/uswds/public-sans "Public Sans open-source typeface"
[3]: https://github.com/IBM/plex "IBM Plex typeface repository"
