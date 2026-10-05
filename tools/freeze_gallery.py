"""Freeze the class gallery at the forecast deadline.

For every student listed in gallery.csv, find what their GitHub Pages site was serving at the
deadline and save copies of forecast.csv and seat_sims.csv under snapshots/. The gallery reads
those copies from then on, so edits made after the deadline never reach it.

How "what the site was serving" is found:
  1. GitHub records every Pages publish as a deployment with a server timestamp that students can't
     change. Take the last successful deployment made at or before the deadline, and its commit.
  2. If a repository has no deployment records, fall back to the last commit dated at or before the
     deadline. Commit dates are set by GitHub for uploads made on github.com, which is how students
     are told to update their sites.
Then download the two files exactly as they were in that commit.

Runs from the GitHub Action in .github/workflows/freeze-gallery.yml. Safe to run more than once:
each run rebuilds the same snapshot. Before the deadline it refuses to run unless --force is given.

Usage: python tools/freeze_gallery.py [--cutoff 2026-11-02T04:59:59Z] [--force]
"""
import csv, json, os, re, sys, urllib.request, urllib.error
from datetime import datetime, timezone

CUTOFF = "2026-11-02T04:59:59Z"   # Sunday Nov 1, 11:59:59pm Eastern (clocks fall back that morning, so UTC-5)
API = os.environ.get("GITHUB_API_URL", "https://api.github.com")
RAW = os.environ.get("RAW_BASE_URL", "https://raw.githubusercontent.com")
TOKEN = os.environ.get("GITHUB_TOKEN", "")
FILES = ["forecast.csv", "seat_sims.csv"]


def get(url, raw=False):
    req = urllib.request.Request(url, headers={"User-Agent": "plsc2219-gallery-freeze"})
    if not raw:
        req.add_header("Accept", "application/vnd.github+json")
        req.add_header("X-GitHub-Api-Version", "2022-11-28")
    if TOKEN and url.startswith(API):
        req.add_header("Authorization", "Bearer " + TOKEN)
    with urllib.request.urlopen(req, timeout=60) as r:
        data = r.read()
    return data if raw else json.loads(data)


def when(s):
    return datetime.strptime(s, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)


def repo_of(url):
    """https://owner.github.io/repo/ -> (owner, repo); https://owner.github.io/ -> (owner, owner.github.io)"""
    m = re.match(r"^https://([A-Za-z0-9-]+)\.github\.io/?([^/?#]*)", url.strip())
    if not m:
        return None
    owner, repo = m.group(1), m.group(2) or (m.group(1) + ".github.io")
    return owner, repo


def norm(url):
    url = url.strip()
    return url if url.endswith("/") else url + "/"


def find_commit(owner, repo, cutoff):
    """Return (sha, published_at, method) for what the site served at the cutoff, or None."""
    deps, page = [], 1
    while True:
        batch = get(f"{API}/repos/{owner}/{repo}/deployments?environment=github-pages&per_page=100&page={page}")
        deps += batch
        if len(batch) < 100:
            break
        page += 1
    deps = sorted((d for d in deps if when(d["created_at"]) <= cutoff), key=lambda d: d["created_at"], reverse=True)
    for d in deps:
        statuses = get(f"{API}/repos/{owner}/{repo}/deployments/{d['id']}/statuses?per_page=100")
        if any(s.get("state") == "success" for s in statuses):
            return d["sha"], d["created_at"], "deployment"
    if deps:
        return None  # deployments exist but none before the deadline succeeded
    commits = get(f"{API}/repos/{owner}/{repo}/commits?until={cutoff.strftime('%Y-%m-%dT%H:%M:%SZ')}&per_page=1")
    if commits:
        c = commits[0]
        return c["sha"], c["commit"]["committer"]["date"], "commit"
    return None


def main():
    args = sys.argv[1:]
    cutoff = when(args[args.index("--cutoff") + 1]) if "--cutoff" in args else when(CUTOFF)
    now = datetime.now(timezone.utc)
    if now < cutoff and "--force" not in args:
        sys.exit(f"The deadline ({cutoff:%Y-%m-%d %H:%M} UTC) hasn't passed yet. Nothing frozen. Use --force to test.")

    rows = [r for r in csv.DictReader(open("gallery.csv", newline="", encoding="utf-8-sig")) if (r.get("url") or "").strip()]
    out = {"cutoff": cutoff.strftime("%Y-%m-%dT%H:%M:%SZ"), "frozen_at": now.strftime("%Y-%m-%dT%H:%M:%SZ"), "entries": {}}
    for r in rows:
        url, name = norm(r["url"]), r.get("forecaster_name", "").strip()
        entry = {"forecaster_name": name}
        out["entries"][url] = entry
        rep = repo_of(url)
        if not rep:
            entry["status"] = "not a github.io address; not frozen"
            print(f"{name}: {entry['status']}")
            continue
        owner, repo = rep
        folder = f"snapshots/{owner.lower()}--{repo.lower()}/"
        try:
            found = find_commit(owner, repo, cutoff)
        except urllib.error.HTTPError as e:
            entry["status"] = f"could not read the repository ({e.code})"
            print(f"{name}: {entry['status']}")
            continue
        if not found:
            entry["status"] = "nothing published by the deadline"
            print(f"{name}: {entry['status']}")
            continue
        sha, published, method = found
        entry.update(sha=sha, published_at=published, method=method, folder=folder, files=[])
        os.makedirs(folder, exist_ok=True)
        for f in FILES:
            try:
                data = get(f"{RAW}/{owner}/{repo}/{sha}/{f}", raw=True)
            except urllib.error.HTTPError as e:
                if e.code == 404:
                    if os.path.exists(folder + f):
                        os.remove(folder + f)  # a rerun must not keep a file that wasn't there at the deadline
                    continue
                raise
            open(folder + f, "wb").write(data)
            entry["files"].append(f)
        entry["status"] = "frozen" if "forecast.csv" in entry["files"] else "no forecast.csv at the deadline"
        print(f"{name}: {entry['status']} ({', '.join(entry['files']) or 'no files'}; {method} {published}; {sha[:7]})")

    json.dump(out, open("freeze.json", "w"), indent=2)
    print(f"Wrote freeze.json for {len(rows)} listed forecaster(s).")


if __name__ == "__main__":
    main()
