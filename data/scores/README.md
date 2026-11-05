# Contest scores (gallery page)

The Forecast Table ranks its rows by these scores, and the seat charts mark the expected result.

| File | What |
|---|---|
| `scores.csv` | `name`, `mae`, `n_races`, `called`, `close_called`, `close_n`, `brier`, `brier_all`: average error (points of two-party vote share), winners called right, winners called right in the races decided by under 5 points, and the Brier score of the win probabilities in the 90 competitive races (`brier_competitive`) and in all scored races (`brier`), for each forecast shown in the gallery, under the gallery's names. Includes the Contest average. |
| `result.csv` | `chamber`, `seats`, `asof`, `uncalled`: the Democratic seat totals drawn as the "Expected result" lines, the date of the returns, and the races not yet called. |

Both are written by `tools/make_scores.py` from the contest session's `scores_gallery_safe_<date>.csv` and `results_2026.csv`. The results file and Split Ticket's race file are only read, never copied here, so no race-level results or private race files are published. To refresh after new returns:

```
python3 tools/make_scores.py <contest>/output/gallery/scores_gallery_safe_<date>.csv <contest>/results/results_2026.csv \
    --asof <YYYY-MM-DD> --house <D House seats> --senate <D Senate seats> --uncalled <n> \
    --private "Split Ticket=<contest>/forecasts/outside/forecast_split_ticket.csv" \
    --competitive <course>/2026_assignments/data/competitive_races_2026.csv
```

The House and Senate numbers are chosen by Kevin (on Nov 5 the House is set to the expected 255, not the 261 that current leaders would give). Only postable rows go in `scores.csv`: gallery opt-ins and benchmarks. Rows without race-level vote shares have no MAE and are not ranked: FiftyPlusOne shows a Brier score only, and Polymarket's score is left out because the gallery's market row averages Polymarket and Kalshi.
