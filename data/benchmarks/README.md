# Published benchmarks (gallery page)

The "Professional and Academic Benchmarks" section of `gallery.html` reads these files. They hold the October 31 capture and are not scheduled to be updated.

| File | What |
|---|---|
| `outside_toplines.csv` | One row per published forecast: seats, chamber odds, capture date, link, notes (shown as footnotes). Rows with `private` = y are never shown. |
| `forecast_electit.csv` | ElectIt race file (public data). |
| `forecast_fair_model.csv` | Fair model national vote, converted to races with the class model. Not shown on the page (the Fair model appears in the toplines table only). |
| `forecast_polymarket.csv` | Polymarket race prices (win probabilities only). |

If they ever need updating, copy the same-named files from the course contest folder (`contest/outside_toplines.csv` and `contest/forecasts/outside/`) over these.

Do not add the FiftyPlusOne or Split Ticket race files: only their toplines are public on this site. To add another race-level source, put its file here and add a line to `benchSources()` in `assets/gallery.js`.
