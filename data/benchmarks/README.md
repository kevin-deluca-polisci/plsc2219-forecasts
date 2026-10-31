# Published benchmarks (gallery page)

The gallery reads these files. They hold the Oct 29–31 captures and are not scheduled to be updated.

| File | What |
|---|---|
| `outside_toplines.csv` | One row per published forecast: seats, chamber odds, races favored (where known), capture date, link, notes (shown as footnotes). Rows with `private` = y are never shown. |
| `forecast_electit.csv` | ElectIt race file (public data). Race table, and ElectIt's simulated seat range. |
| `forecast_fair_model.csv` | Fair model national vote, converted to races with the class model. Fair's seat range and chamber odds only. |
| `forecast_polymarket.csv` | Polymarket race prices (win probabilities only). Race table, and the markets' simulated seats. |

## Columns in `outside_toplines.csv` that drive the page

- `group`: `academic`, `professional` or `market`. This sets the Academics, Professionals and Markets cards, and the averages in the Contest view.
- `in_average`: `n` keeps a row out of its group's average. The Fair model is `n`.
- `source`: "captured Oct 31" (our own capture) or "John Sides compilation". The compiled rows are credited in a footnote.
- `house_favored`, `senate_favored`: races favored, for sources whose race files stay private.

## Sources

- Silver Bulletin, FiftyPlusOne, Split Ticket, ElectIt and the markets were captured by us on Oct 31. Fair was captured on Oct 29.
- The other academic and professional rows come from John Sides' compilation of 2026 forecasts, one headline spec per author. The full table is in the forecast archive: `ForecastDataArchive/snapshots/sides_ps_forecasts_2026-10-31/`.

If any of these files ever need updating, edit or replace them here. The repo copy of `outside_toplines.csv` has extra columns and shorter notes than the contest folder's copy, so don't copy that one over.

Do not add the FiftyPlusOne, Split Ticket or Silver Bulletin race files: only their toplines are public. To add another race-level source, put its file here and add a line to `benchSources()` in `assets/gallery.js`.
