#!/usr/bin/env python3
"""Write the gallery's score files (data/scores/) from the contest session's scoring output.

    python3 tools/make_scores.py SCORES_GALLERY_SAFE.csv RESULTS_2026.csv \
        --asof 2026-11-05 --house 255 --senate 56 --uncalled 38 \
        --private "Split Ticket=<contest>/forecasts/outside/forecast_split_ticket.csv" \
        --competitive <course>/2026_assignments/data/competitive_races_2026.csv

SCORES_GALLERY_SAFE.csv  contest/output/gallery/scores_gallery_safe_<date>.csv (gallery opt-ins and benchmarks)
RESULTS_2026.csv         contest/results/results_2026.csv. Read here only to score the "Contest average" row; it is
                         never copied into this repo (no race-level results are published).
--competitive PATH       competitive_races_2026.csv (the 90 races within 5 points of PVI), read only to score the
                         Contest average's Brier score the way scoring/score_forecasts.R does.
--private NAME=PATH      a race file that is not in this repo (Split Ticket), read only to count its close races
                         called; repeatable.

Writes, in this repo:
  data/scores/scores.csv  name,mae,n_races,called,close_called,close_n: one row per forecast shown in the Forecast
                          Table, using the gallery's names. Over the scored races (scored = 1 in data/races_2026.csv,
                          status final or partial), as in scoring/score_forecasts.R:
                            mae     average absolute error, points of two-party vote share
                            called  winners called right (share above 0.5 = Democratic; never for the combined D-side
                                    seat, Montana), from the official scores file
                            close_called / close_n  the same, over the races decided by under 5 points so far
                            brier   Brier score of the win probabilities in the competitive races
                                    (brier_competitive in the scores file); blank without probabilities
                            brier_all  the same over all scored races (brier in the scores file)
  data/scores/result.csv  chamber,seats,asof,uncalled: the seat totals drawn as the "Result" line on the seat charts.

The Contest average is scored the way the page builds it: the average of the vote shares of the gallery entries
(gallery.csv, outliers left out) in each race, rounded to 2 decimals like the official scores.
"""
import argparse
import csv
import os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CLOSE = 0.05  # a close race: decided by under 5 points (|D share - R share| < 0.05)
# race files in this repo for the benchmark rows (gallery entries come from gallery.csv)
FILES = {"Class Fundamentals Model": "forecast.csv", "Class Fundamentals + Polls": "class_polls/forecast.csv",
         "ElectIt (Harvard)": "data/benchmarks/forecast_electit.csv",
         "Fair model (to seats)": "data/benchmarks/forecast_fair_model.csv"}

# scoring labels -> the names the gallery shows; rows not listed keep their label. "Class average" is not a row on
# the gallery and is dropped. FiftyPlusOne has probabilities only (Brier, no MAE). Polymarket is dropped: the gallery
# shows a Polymarket + Kalshi average row, which Polymarket's own score does not describe.
RENAME = {"Class model": "Class Fundamentals Model", "Class model + polls": "Class Fundamentals + Polls",
          "SK": "Shiro K."}  # gallery display name (Kevin, Nov 5)
DROP = {"Class average", "Polymarket"}


def rows(path):
    with open(path, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("scores")
    ap.add_argument("results")
    ap.add_argument("--asof", required=True, help="date of the returns, YYYY-MM-DD")
    ap.add_argument("--house", type=int, required=True, help="Democratic House seats to mark as the result")
    ap.add_argument("--senate", type=int, required=True, help="Democratic Senate seats to mark as the result")
    ap.add_argument("--uncalled", type=int, default=0, help="races not yet called (shown in the table note)")
    ap.add_argument("--competitive", help="competitive_races_2026.csv, for the Contest average's Brier score")
    ap.add_argument("--private", action="append", default=[], metavar="NAME=PATH",
                    help="race file kept out of this repo, read only to count close races called")
    a = ap.parse_args()
    files = {k: os.path.join(HERE, v) for k, v in FILES.items()}
    for x in a.private:
        k, v = x.split("=", 1)
        files[k.strip()] = v.strip()

    races = {r["race_id"]: r for r in rows(os.path.join(HERE, "data", "races_2026.csv"))}
    res = [r for r in rows(a.results) if r.get("status") in ("final", "partial") and num(r.get("dem_share")) is not None]
    actual = {r["race_id"]: num(r["dem_share"]) for r in res}
    dem_won = {r["race_id"]: r.get("dem_win") == "1" for r in res}
    scored = [k for k in actual if races.get(k, {}).get("scored") == "1"]
    close = [k for k in scored if abs(2 * actual[k] - 1) < CLOSE]
    combined = {k for k, r in races.items() if r.get("race_type") == "combined_D_side"}

    def calls(shares, ids):
        hit = [((shares[k] > 0.5 and k not in combined) == dem_won[k]) for k in ids if shares.get(k) is not None]
        return sum(hit), len(hit)

    def shares_of(path):
        return {f["race_id"]: num(f.get("pred_dem_share")) for f in rows(path) if num(f.get("pred_dem_share")) is not None}

    # gallery entries (outliers left out of the Contest average only)
    share, n = {}, {}
    for g in rows(os.path.join(HERE, "gallery.csv")):
        if not (g.get("data_url") or "").strip():
            continue
        path = os.path.join(HERE, g["data_url"].strip().rstrip("/"), "forecast.csv")
        files[g["forecaster_name"].strip()] = path
        if (g.get("outlier") or "").strip().lower().startswith("y"):
            continue
        for k, v in shares_of(path).items():
            share[k] = share.get(k, 0) + v
            n[k] = n.get(k, 0) + 1

    out = []
    for r in rows(a.scores):
        lab = r["label"].strip()
        if lab in DROP or (num(r.get("mae")) is None and num(r.get("brier_competitive")) is None and num(r.get("brier")) is None):
            continue
        name = RENAME.get(lab, lab)
        b = num(r.get("brier_competitive"))
        row = {"name": name, "mae": "%.2f" % num(r["mae"]) if num(r.get("mae")) is not None else "",
               "n_races": r.get("n_races_scored", "") if num(r.get("mae")) is not None else "",
               "called": r.get("races_called", ""), "close_called": "", "close_n": "",
               "brier": "%.4f" % b if b is not None else "",
               "brier_all": "%.4f" % num(r["brier"]) if num(r.get("brier")) is not None else ""}
        if row["mae"] and name in files and os.path.exists(files[name]):
            sh = shares_of(files[name])
            c, m = calls(sh, scored)
            if str(c) != row["called"] or str(m) != row["n_races"]:
                print("  note: %s calls %d/%d here vs %s/%s in the scores file" % (name, c, m, row["called"], row["n_races"]))
            row["close_called"], row["close_n"] = calls(sh, close)
        out.append(row)

    # Contest average: mean vote share across the gallery entries in each race
    avg = {k: share[k] / n[k] for k in share}
    errs = [abs(avg[k] - actual[k]) * 100 for k in scored if k in avg]
    if errs:
        c, m = calls(avg, scored)
        cc, cm = calls(avg, close)
        row = {"name": "Contest average", "mae": "%.2f" % (sum(errs) / len(errs)), "n_races": str(len(errs)),
               "called": c, "close_called": cc, "close_n": cm, "brier": "", "brier_all": ""}
        # Brier: the average of the entrants' own win probabilities in each competitive race (entrants who gave them)
        if a.competitive:
            comp = {r["race_id"] for r in rows(a.competitive)}
            pp, pn = {}, {}
            for g in rows(os.path.join(HERE, "gallery.csv")):
                if not (g.get("data_url") or "").strip() or (g.get("outlier") or "").strip().lower().startswith("y"):
                    continue
                for f in rows(os.path.join(HERE, g["data_url"].strip().rstrip("/"), "forecast.csv")):
                    v = num(f.get("p_dem_win"))
                    if v is not None:
                        if f["race_id"] in combined:
                            v = 0.0  # the combined D-side seat counts as Republican for every forecaster
                        pp[f["race_id"]] = pp.get(f["race_id"], 0) + v
                        pn[f["race_id"]] = pn.get(f["race_id"], 0) + 1
            sq = [(pp[k] / pn[k] - (1 if dem_won[k] else 0)) ** 2 for k in scored if k in comp and k in pp]
            if sq:
                row["brier"] = "%.4f" % (sum(sq) / len(sq))
            sq = [(pp[k] / pn[k] - (1 if dem_won[k] else 0)) ** 2 for k in scored if k in pp]
            if sq:
                row["brier_all"] = "%.4f" % (sum(sq) / len(sq))
        out.append(row)

    os.makedirs(os.path.join(HERE, "data", "scores"), exist_ok=True)
    with open(os.path.join(HERE, "data", "scores", "scores.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, ["name", "mae", "n_races", "called", "close_called", "close_n", "brier", "brier_all"])
        w.writeheader()
        out.sort(key=lambda r: float(r["mae"]) if r["mae"] else 99)
        w.writerows(out)
    with open(os.path.join(HERE, "data", "scores", "result.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["chamber", "seats", "asof", "uncalled"])
        w.writerow(["house", a.house, a.asof, a.uncalled])
        w.writerow(["senate", a.senate, a.asof, a.uncalled])
    print("wrote data/scores/scores.csv (%d rows) and data/scores/result.csv" % len(out))
    for r in out:
        print("  %-28s %-5s called %s/%s  close %s/%s  brier %s / all %s" % (r["name"], r["mae"], r["called"], r["n_races"],
              r["close_called"], r["close_n"], r["brier"], r["brier_all"]))


if __name__ == "__main__":
    main()
