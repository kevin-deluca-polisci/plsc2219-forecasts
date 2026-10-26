"""Class model + polls: the class model averaged with the polls, race by race.

Builds class_polls/forecast.csv and class_polls/seat_sims.csv, the files the
"Class model + polls" view of class-model.html reads. A Python version of the
course folder's class_model/class_polls_forecast.R, extended to the House.

For each race the prediction is the simple average of the class model's
prediction (fundamentals only) and the race's polling average:

  Senate  polling = mean of whichever of these exist:
            (a) raw polls: mean two-party Democratic share of the polls in the
                race's Wikipedia polling table that ended in the last POLL_DAYS
                days (course file data/senate_polls_2026.csv; one version per
                poll: LV, else RV, else adults), as in the R script;
            (b) the aggregator average: the tracker's race polling average, the
                mean of the averages reported on Wikipedia (RealClearPolitics,
                270toWin, Race to the WH and others), from KD-website's
                assets/forecast_2026.json (published on kevinmdeluca.com).
          Montana (combined_D_side) uses (a) only: (b) is Bankhead vs Alme.
  House   polling = Race to the WH's district polling average (the latest
          daily capture in plsc2219-raw), for standard and independent-side
          districts. Two-Democrat and two-Republican races stay fixed.

Races without polls keep the class model. Errors are the class model's,
recomputed from the course data exactly as class_forecast.R does: one national
error shared by every race in both chambers plus an independent race error.
Win probabilities and 80% intervals use the total error around the new
centers; 10,000 simulations share one national draw across both chambers.
Montana's seat is assumed Republican (p_dem_win = 0), as in the class model.

The per-race poll inputs go to a private file (default: plsc2219-raw
model_private/class_polls_inputs.csv), not to this public repo: the public
files carry only the blended predictions.

    python3 tools/class_polls.py                 # defaults below (Kevin's Mac)
    python3 tools/class_polls.py --as-of 2026-11-01

Needs numpy and pandas.
"""
import argparse, glob, json, os, re, sys
from math import erf, sqrt
import numpy as np
import pandas as pd

HOME = os.path.expanduser("~")
DEF = {
    "course": f"{HOME}/Library/CloudStorage/Dropbox/Yale/Courses/AY2627/Midterm Elections/cowork space/2026_assignments",
    "raw": f"{HOME}/Documents/Claude/nondropbox data/plsc2219-raw/2026",
    "tracker": f"{HOME}/Documents/Claude/website/KD-website/assets/forecast_2026.json",
}
POLL_DAYS, N_SIMS, SEED, N_CYCLES, Z80 = 30, 10000, 2219, 7, 1.2815515655446004
HOUSE_TYPES = {"standard", "independent_D_side", "independent_R_side"}

def pnorm(x): return 0.5 * (1 + erf(x / sqrt(2)))

def ols(df, y, xs):
    X = np.column_stack([np.ones(len(df))] + [df[x].to_numpy(float) for x in xs])
    b, *_ = np.linalg.lstsq(X, df[y].to_numpy(float), rcond=None)
    resid = df[y].to_numpy(float) - X @ b
    return dict(zip(["const"] + xs, b)), sqrt((resid ** 2).sum() / (len(df) - X.shape[1]))

def class_errors(course):
    """nat_race, dist and total error for each chamber, as in class_forecast.R."""
    d = f"{course}/data"
    el = pd.read_csv(f"{d}/elections_pooled.csv")
    el["nat_d"] = np.where(el.in_party == "D", el.in_party_house_share, 100 - el.in_party_house_share)
    res = pd.read_csv(f"{d}/hw4_results_2012_2024.csv")
    res = res[res.contested == 1].merge(el[["year", "nat_d"]], on="year", how="left")
    res["inc_d"] = np.select([res.incumbent_party == "D", res.incumbent_party == "R"], [1, -1], 0)
    cycles = sorted(res.loc[(res.office == "house") & (res.year < 2026), "year"].unique(), reverse=True)[:N_CYCLES]
    fit = res[res.year.isin(cycles)]
    ts = pd.read_csv(f"{course}/class_model/output/class_timeseries.csv").sort_values("as_of")
    sigma_nat, as_of = float(ts.sigma_nat.iloc[-1]), str(ts.as_of.iloc[-1])
    out = {}
    for office in ("house", "senate"):
        b, s = ols(fit[fit.office == office], "dem_share", ["pvi", "nat_d", "inc_d"])
        nat = b["nat_d"] * sigma_nat
        out[office] = {"nat_race": nat, "dist": s, "total": sqrt(nat ** 2 + s ** 2)}
    return out, as_of

def senate_raw_polls(course, as_of):
    p = pd.read_csv(f"{course}/data/senate_polls_2026.csv", parse_dates=["start_date", "end_date"])
    p["rank"] = p.population.map({"LV": 1, "RV": 2}).fillna(3)
    key = ["race_id", "pollster", "start_date", "end_date"]
    p = p[p["rank"] == p.groupby(key, dropna=False)["rank"].transform("min")]
    p = p[p.end_date >= pd.Timestamp(as_of) - pd.Timedelta(days=POLL_DAYS)]
    g = p.groupby("race_id").agg(raw_n=("dem_two_party", "size"), raw_share=("dem_two_party", "mean"),
                                 raw_last=("end_date", "max"))
    return g

def senate_aggregator(tracker):
    d = json.load(open(tracker))
    rows = [(r["race_id"], 50 + r["polling_margin"] / 2, r.get("polling_n"))
            for r in d["senate_table"]["races"]
            if r.get("polling_margin") is not None and not r.get("polling_withheld")]
    return pd.DataFrame(rows, columns=["race_id", "agg_share", "agg_n"]).set_index("race_id"), d.get("latest_snapshot", "")

def house_rttwh(raw, as_of_max):
    days = sorted(x for x in os.listdir(f"{raw}/raw/race_to_the_wh") if re.match(r"\d{4}-\d{2}-\d{2}$", x) and x <= as_of_max)
    for day in reversed(days):
        f = [x for x in glob.glob(f"{raw}/raw/race_to_the_wh/{day}/live__2026-House---Table-Summarizing-Lean-Last-Election-Polling__*.json")
             if not x.endswith(".meta.json")]
        if not f: continue
        d = json.load(open(f[0])); rows = []
        for name, sheet in zip(d["sheetNames"], d["data"]):
            m = re.match(r"^([A-Z]{2}) - (\d+)$", name)
            if not m: continue
            vals = {r[0]: r[1] for r in sheet if isinstance(r, list) and len(r) > 1 and isinstance(r[0], str)}
            v = str(vals.get("Polling", "")).strip()
            mm = re.match(r"^(D|R) \+(\d+(?:\.\d+)?)%$", v)
            margin = 0.0 if v == "Tie" else (float(mm.group(2)) * (1 if mm.group(1) == "D" else -1) if mm else None)
            if margin is None: continue
            rows.append((f"HOU_{m.group(1)}_{max(1, int(m.group(2))):02d}_2026", 50 + margin / 2))
        return pd.DataFrame(rows, columns=["race_id", "rttwh_share"]).set_index("race_id"), day
    sys.exit("no Race to the WH House capture found")

def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    for k, v in DEF.items(): ap.add_argument(f"--{k}", default=v)
    ap.add_argument("--as-of", help="poll window end for the Senate raw polls (default: the class model's run date)")
    ap.add_argument("--out", default=os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "class_polls"))
    ap.add_argument("--r-version", action="store_true",
                    help="reproduce class_polls_forecast.R (Senate raw polls only) as a check")
    ap.add_argument("--details", default=None, help="private per-race inputs CSV (default: RAW/model_private/class_polls_inputs.csv)")
    a = ap.parse_args()

    err, class_as_of = class_errors(a.course)
    as_of = a.as_of or class_as_of
    races = pd.read_csv(f"{a.course}/data/races_2026.csv")
    cls = pd.read_csv(f"{a.course}/class_model/output/forecast_class_latest.csv")[["race_id", "pred_dem_share", "lo_80", "hi_80"]]
    r = races.merge(cls, on="race_id", how="left", validate="1:1")
    assert r.pred_dem_share.notna().all() and len(r) == 470, "class forecast does not cover the race file"
    r["class_pred"] = 100 * r.pred_dem_share
    r["fixed"] = r.fixed_prediction.notna()
    r["seat_r"] = r.race_type == "combined_D_side"
    r["sd"] = np.where(r.office == "house", err["house"]["total"], err["senate"]["total"])
    # check: the recomputed errors reproduce the class model's own 80% intervals
    chk = r[~r.fixed & (100 * r.hi_80 < 100) & (100 * r.lo_80 > 0)]
    implied = 100 * (chk.hi_80 - chk.lo_80) / (2 * Z80)
    assert np.allclose(implied, chk.sd, atol=1e-6), "error sizes differ from the class model's"

    raw = senate_raw_polls(a.course, as_of)
    agg, tracker_day = senate_aggregator(a.tracker)
    hou, rttwh_day = house_rttwh(a.raw, max(as_of, pd.Timestamp.today().strftime("%Y-%m-%d")))
    r = r.join(raw, on="race_id").join(agg, on="race_id").join(hou, on="race_id")
    if a.r_version: r["agg_share"] = np.nan; r["rttwh_share"] = np.nan
    r.loc[r.seat_r, ["agg_share", "agg_n"]] = np.nan                        # Montana: (b) is not the combined share
    r.loc[(r.office != "house") | ~r.race_type.isin(HOUSE_TYPES), "rttwh_share"] = np.nan
    r["poll_share"] = np.where(r.office == "senate", r[["raw_share", "agg_share"]].mean(axis=1), r.rttwh_share)
    use = ~r.fixed & r.poll_share.notna()
    r["pred"] = np.where(use, (r.class_pred + r.poll_share) / 2, r.class_pred)
    r.loc[r.fixed, "pred"] = 100 * r.loc[r.fixed, "fixed_prediction"]
    r["p_dem_win"] = [fp if fx else (0.0 if sr else 1 - pnorm((50 - p) / s))
                      for fx, fp, sr, p, s in zip(r.fixed, r.fixed_prediction, r.seat_r, r.pred, r.sd)]
    r["lo"] = np.where(r.fixed, r.pred, np.maximum(0, r.pred - Z80 * r.sd))
    r["hi"] = np.where(r.fixed, r.pred, np.minimum(100, r.pred + Z80 * r.sd))

    rng = np.random.default_rng(SEED)
    nat = rng.standard_normal(N_SIMS)                                      # shared by both chambers
    def sims(rows, e, base=0):
        p = rows.pred.to_numpy()
        draw = p[None, :] + nat[:, None] * e["nat_race"] + rng.normal(0, e["dist"], (N_SIMS, len(p)))
        return base + (draw > 50).sum(axis=1)
    notup = pd.read_csv(f"{a.course}/data/senate_seats_not_up_2026.csv")
    dem_not_up = int(notup.loc[notup.party != "R", "seats_not_up"].sum())
    h, s = r[r.office == "house"], r[(r.office == "senate") & ~r.seat_r]
    hs, ss = sims(h, err["house"]), sims(s, err["senate"], dem_not_up)

    os.makedirs(a.out, exist_ok=True)
    fc = pd.DataFrame({"race_id": r.race_id, "pred_dem_share": r.pred / 100, "p_dem_win": r.p_dem_win,
                       "lo_80": r.lo / 100, "hi_80": r.hi / 100,
                       "asof": max(as_of, rttwh_day, tracker_day or as_of)})   # the newest input used
    fc.to_csv(f"{a.out}/forecast.csv", index=False)
    pd.DataFrame({"sim": np.arange(1, N_SIMS + 1), "house_dem_seats": hs, "senate_dem_seats": ss}).to_csv(f"{a.out}/seat_sims.csv", index=False)

    details = a.details or f"{a.raw}/model_private/class_polls_inputs.csv"
    os.makedirs(os.path.dirname(details), exist_ok=True)
    d = r[use].assign(p_class=[1 - pnorm((50 - p) / s) for p, s in zip(r[use].class_pred, r[use].sd)])
    d[["race_id", "class_pred", "raw_n", "raw_share", "agg_n", "agg_share", "rttwh_share", "poll_share", "pred", "p_class", "p_dem_win"]] \
        .round(4).to_csv(details, index=False)

    q = lambda x, p: int(np.quantile(x, p))
    print(f"As of {as_of}. Senate raw polls: {POLL_DAYS} days to {as_of}. Tracker averages: snapshot {tracker_day}. "
          f"Race to the WH House: {rttwh_day}.")
    print(f"Errors: house nat {err['house']['nat_race']:.2f} dist {err['house']['dist']:.2f}; "
          f"senate nat {err['senate']['nat_race']:.2f} dist {err['senate']['dist']:.2f}")
    print(f"Polled races averaged in: Senate {int((use & (r.office == 'senate')).sum())}, House {int((use & (r.office == 'house')).sum())}")
    print(f"House: point {int((h.pred > 50).sum())}, median {int(np.median(hs))}, 80% {q(hs, .1)}-{q(hs, .9)}, P(majority) {np.mean(hs >= 218):.3f}")
    print(f"Senate: point {dem_not_up + int((s.pred > 50).sum())}, median {int(np.median(ss))}, 80% {q(ss, .1)}-{q(ss, .9)}, P(control) {np.mean(ss >= 51):.3f}")
    print(f"Both: {np.mean((hs >= 218) & (ss >= 51)):.3f}\nWrote {a.out}/forecast.csv, seat_sims.csv; inputs to {details}")

if __name__ == "__main__":
    main()
