/* Class gallery: compares the forecasts entrants sent in, from copies kept in this repo. It never reads their sites.
   gallery.csv columns: forecaster_name, url, data_url, outlier.
     forecaster_name  the gallery nickname
     url              optional: the entrant's own site, linked from their name (must start with https://)
     data_url         the folder in this repo with their forecast.csv (and seat_sims.csv, if they sent one),
                      e.g. entries/the-last-neocon/. See entries/README.md.
     outlier          y for an entry flagged under the competition's outlier rule (K = 4): still listed everywhere,
                      but left out of the "Contest entries (average)" rows in the benchmarks section. */
(function () {
  "use strict";
  var esc = FC.esc, getCSV = FC.getCSV, quant = FC.quant;
  var HOUSE_MAJ = 218, SENATE_MAJ = 51;
  var $ = function (id) { return document.getElementById(id); };
  function pct(x) { return Math.round(100 * x) + "%"; }
  function slash(u) { return u && u.slice(-1) !== "/" ? u + "/" : u; }
  var STATE_NAMES = {AL:"Alabama",AK:"Alaska",AZ:"Arizona",AR:"Arkansas",CA:"California",CO:"Colorado",CT:"Connecticut",DE:"Delaware",FL:"Florida",GA:"Georgia",HI:"Hawaii",ID:"Idaho",IL:"Illinois",IN:"Indiana",IA:"Iowa",KS:"Kansas",KY:"Kentucky",LA:"Louisiana",ME:"Maine",MD:"Maryland",MA:"Massachusetts",MI:"Michigan",MN:"Minnesota",MS:"Mississippi",MO:"Missouri",MT:"Montana",NE:"Nebraska",NV:"Nevada",NH:"New Hampshire",NJ:"New Jersey",NM:"New Mexico",NY:"New York",NC:"North Carolina",ND:"North Dakota",OH:"Ohio",OK:"Oklahoma",OR:"Oregon",PA:"Pennsylvania",RI:"Rhode Island",SC:"South Carolina",SD:"South Dakota",TN:"Tennessee",TX:"Texas",UT:"Utah",VT:"Vermont",VA:"Virginia",WA:"Washington",WV:"West Virginia",WI:"Wisconsin",WY:"Wyoming"};
  function raceName(r) {
    if (r.office === "senate") return STATE_NAMES[r.state] + " Senate";
    var d = Number(r.district); return r.state + "-" + (d < 10 ? "0" : "") + d;
  }
  function marginText(m) { if (Math.abs(m) < 0.05) return "Even"; return (m > 0 ? "D +" : "R +") + Math.abs(m).toFixed(1); }

  var races, notup, results = null, entries = [], cls = null, ref = null; // cls: the class model; ref: class model + polls
  var DEADLINE = new Date("2026-11-02T04:59:59Z");   // 11:59:59 pm Eastern, Sunday Nov 1
  var closed = Date.now() > DEADLINE.getTime();

  // data/results_2026.csv (race_id, dem_share: the actual D-side share of the two-party vote, as a proportion,
  // final round in Maine and Alaska) is added once results are in; until then the accuracy column is blank.
  Promise.all([getCSV("data/races_2026.csv"), getCSV("data/senate_seats_not_up_2026.csv"), getCSV("gallery.csv"),
               getCSV("data/results_2026.csv").catch(function () { return null; }), loadBench()])
    .then(function (res) {
      races = res[0]; notup = res[1]; results = res[3];
      if (closed) {
        $("frozen").innerHTML = "<strong>Entries are closed.</strong> The deadline was 11:59 pm Eastern on Sunday, November 1.";
        $("frozen").hidden = false;
        $("live-note").textContent = "";
      }
      var list = res[2].filter(function (r) { return r.forecaster_name && (r.data_url || "").trim(); });
      $("count").textContent = list.length ? list.length + " forecast" + (list.length === 1 ? "" : "s") + " listed." : "No forecasts listed yet.";
      // the class model and the class model + polls first (this repo's own files), then each student, one at a time so
      // the page stays responsive. Both are reference rows: neither enters the forecaster average.
      var jobs = [{ name: "Class model", url: "class-model.html?model=fundamentals", data: "./", isClass: true },
                  { name: "Class model + polls", short: "Class + polls", url: "class-model.html", data: "class_polls/", isClass: true, isRef: true }].concat(list.map(function (r) {
        return { name: r.forecaster_name, url: /^https:\/\//.test(r.url || "") ? r.url.trim() : "", data: slash(r.data_url.trim()),
                 outlier: /^y/i.test((r.outlier || "").trim()) };
      }));
      return jobs.reduce(function (p, job) { return p.then(function () { return load(job); }); }, Promise.resolve());
    })
    .then(function () { $("loading").hidden = true; })
    .catch(function (e) { $("loading").textContent = "The gallery could not load: " + e; });

  function load(job) {
    if (job.error) { entries.push({ name: job.name, url: job.url, error: job.error }); render(); return Promise.resolve(); }
    $("loading").textContent = "Reading " + job.name + "…";
    return Promise.all([
      getCSV(job.data + "forecast.csv").catch(function () { return null; }),
      getCSV(job.data + "seat_sims.csv").catch(function () { return null; })
    ]).then(function (res) {
      return new Promise(function (done) {
        setTimeout(function () { // let the page repaint between forecasters
          var e = { name: job.name, short: job.short, url: job.url, isClass: !!job.isClass, isRef: !!job.isRef, outlier: !!job.outlier };
          if (!res[0]) { e.error = "no forecast.csv found yet"; }
          else {
            var A = FC.analyze(races, notup, res[0], res[1]);
            if (!A.S) e.error = "forecast.csv has errors";
            else {
              e.A = A; e.asof = A.asof; e.own = !A.S.isDefault;
              e.hD = A.races.filter(function (r) { return r.office === "house" && r.share > 0.5; }).length;
              e.sD = A.demNotUp + A.races.filter(function (r) { return r.office === "senate" && r.share > 0.5; }).length;
              e.H = FC.chamber(A.S.h, HOUSE_MAJ); e.Sn = FC.chamber(A.S.s, SENATE_MAJ);
              e.flag = A.problems.length > 0;
              e.both = both(A.S.h, A.S.s);
              e.err = accuracy(A.races);
            }
          }
          if (e.isRef) ref = e; else if (e.isClass) cls = e; else entries.push(e);
          render(); done();
        }, 0);
      });
    });
  }

  // ---------------------------------------------------------------- render
  // chance Democrats win both chambers: the share of simulations with a House majority AND Senate control
  function both(h, s) {
    if (!h || !s || h.length !== s.length) return null;
    var n = 0; for (var i = 0; i < h.length; i++) if (h[i] >= HOUSE_MAJ && s[i] >= SENATE_MAJ) n++;
    return n / h.length;
  }
  // the competition's measure: average absolute error, in points, over the scored races with a result
  function accuracy(rs) {
    if (!results) return null;
    var act = {}; results.forEach(function (r) { var v = FC.num(r.dem_share); if (v != null && !isNaN(v)) act[r.race_id] = v; });
    var sum = 0, n = 0;
    rs.forEach(function (r) {
      if (r.scored !== "1" || !(r.race_id in act) || r.share == null) return;
      sum += Math.abs(r.share - act[r.race_id]) * 100; n++;
    });
    return n ? { mae: sum / n, n: n } : null;
  }
  // rank the listed forecasters (not the two reference rows) by error, lowest first; ties share a rank
  function rankAll(ok) {
    var s = ok.filter(function (e) { return e.err; }).sort(function (a, b) { return a.err.mae - b.err.mae; });
    s.forEach(function (e, i) { e.rank = i && Math.abs(e.err.mae - s[i - 1].err.mae) < 1e-9 ? s[i - 1].rank : i + 1; });
  }
  function accText(e) {
    if (!e.err) return "<span class='muted'>after results</span>";
    return (e.isClass ? "reference" : e.rank) + " <span class='muted'>(" + e.err.mae.toFixed(2) + " pts)</span>";
  }

  var sortKey = "both", sortDir = -1;
  function render() {
    var ok = entries.filter(function (e) { return !e.error; });
    summary(ok);
    $("chart-house").innerHTML = ""; $("chart-senate").innerHTML = "";
    var rows = refRows().concat(ok);
    if (rows.length) {
      $("chart-house").appendChild(strip(rows, "H", HOUSE_MAJ, "Democratic House seats"));
      $("chart-senate").appendChild(strip(rows, "Sn", SENATE_MAJ, "Democratic Senate seats"));
    }
    table(rows);
    disagreements(ok);
    benchmarks(ok);
    var bad = entries.filter(function (e) { return e.error; });
    $("errors").hidden = !bad.length;
    $("errors").innerHTML = bad.length ? "<strong>Not shown:</strong> " + bad.map(function (e) {
      return nameLink(e) + " (" + esc(e.error) + ")"; }).join("; ") : "";
  }

  function nameLink(e) { return e.url ? "<a href='" + esc(e.url) + "'>" + esc(e.name) + "</a>" : esc(e.name); }
  function refRows() { return [cls, ref].filter(function (e) { return e && !e.error; }); }
  function rank(e) { return e === cls ? 2 : e === ref ? 1 : 0; }
  function mean(a, f) { return a.reduce(function (s, x) { return s + f(x); }, 0) / a.length; }
  function summary(ok) {
    var html = "";
    if (cls && !cls.error) html += cardHTML("Class model", cls.H.pmaj, cls.Sn.pmaj, Math.round(cls.H.med), Math.round(cls.Sn.med), "The model PLSC 2219 built together in class. Entries are scored against it.");
    if (ref && !ref.error) html += cardHTML("Class model + polls", ref.H.pmaj, ref.Sn.pmaj, Math.round(ref.H.med), Math.round(ref.Sn.med), "The class model averaged with the polls in each race that has them. An instructor reference forecast.");
    if (ok.length) html += cardHTML("Forecaster average", mean(ok, function (e) { return e.H.pmaj; }), mean(ok, function (e) { return e.Sn.pmaj; }),
      Math.round(quant(ok.map(function (e) { return e.H.med; }), 0.5)), Math.round(quant(ok.map(function (e) { return e.Sn.med; }), 0.5)),
      "Average chance of a Democratic majority across " + ok.length + " forecast" + (ok.length === 1 ? "" : "s") + "; seats are the middle forecaster's median.");
    else html += "<div class='placeholder'><strong>Listed forecasts appear here</strong> next to the class model, with an average across forecasters.</div>";
    $("summary").innerHTML = html;
  }
  function cardHTML(lab, ph, ps, mh, ms, note) {
    return "<div class='card'><p class='lab'>" + lab + "</p>" +
      "<div class='pair'><div><p class='hero num'>" + pct(ph) + "</p><p class='sub'>Democratic House majority<br><span class='num'>median " + mh + " seats</span></p></div>" +
      "<div><p class='hero num'>" + pct(ps) + "</p><p class='sub'>Democratic Senate control<br><span class='num'>median " + ms + " seats</span></p></div></div>" +
      "<p class='sub' style='font-size:13px'>" + note + "</p></div>";
  }

  // one row per forecaster: 80% seat range (bar) and median (dot), with the majority line
  function strip(rows, key, maj, label) {
    rows = rows.slice().sort(function (a, b) { return (rank(b) - rank(a)) || (b[key].med - a[key].med); });
    var lo = Math.floor(Math.min.apply(null, rows.map(function (e) { return e[key].lo; }).concat([maj])) - 3);
    var hi = Math.ceil(Math.max.apply(null, rows.map(function (e) { return e[key].hi; }).concat([maj])) + 3);
    var W = 470, L = 118, R = 12, rowH = 26, top = 24, H = top + rows.length * rowH + 26;
    var x = function (v) { return L + (v - lo) / (hi - lo) * (W - L - R); };
    var svg = "<svg viewBox='0 0 " + W + " " + H + "' role='img' aria-label='" + label + ": 80% range and median for each forecaster'>";
    var step = (hi - lo) > 60 ? 10 : (hi - lo) > 25 ? 5 : 2;
    for (var v = Math.ceil(lo / step) * step; v <= hi; v += step)
      svg += "<line class='grid' x1='" + x(v) + "' x2='" + x(v) + "' y1='" + (top - 4) + "' y2='" + (H - 22) + "'></line><text class='tick' x='" + x(v) + "' y='" + (H - 6) + "' text-anchor='middle'>" + v + "</text>";
    svg += "<line class='maj' x1='" + x(maj - 0.5) + "' x2='" + x(maj - 0.5) + "' y1='" + (top - 14) + "' y2='" + (H - 22) + "'></line>" +
      "<text class='majlab' x='" + (x(maj - 0.5) + 4) + "' y='" + (top - 6) + "'>" + maj + " for a majority</text>";
    rows.forEach(function (e, i) {
      var y = top + i * rowH + rowH / 2, c = e[key], col = c.med >= maj ? "var(--likely-d)" : "var(--likely-r)";
      svg += "<g class='row' data-i='" + i + "'><rect class='hit' x='0' y='" + (y - rowH / 2) + "' width='" + W + "' height='" + rowH + "'></rect>" +
        "<text class='name" + (e.isClass ? " cls" : "") + "' x='" + (L - 10) + "' y='" + (y + 4) + "' text-anchor='end'>" + esc((e.short || e.name).length > 16 ? (e.short || e.name).slice(0, 15) + "…" : (e.short || e.name)) + "</text>" +
        "<line class='rng' x1='" + x(c.lo) + "' x2='" + x(c.hi) + "' y1='" + y + "' y2='" + y + "' stroke='" + col + "'></line>" +
        "<circle cx='" + x(c.med) + "' cy='" + y + "' r='5.5' fill='" + (e.own ? col : "var(--card)") + "' stroke='" + col + "' stroke-width='2'></circle></g>";
    });
    svg += "</svg>";
    var div = document.createElement("div"); div.className = "card";
    div.innerHTML = "<h3>" + (key === "H" ? "House" : "Senate") + "</h3>" + svg;
    var tip = $("tip");
    div.querySelectorAll("g.row").forEach(function (g) {
      var e = rows[Number(g.dataset.i)], c = e[key];
      var show = function (ev) {
        tip.innerHTML = "<b>" + esc(e.name) + "</b><div class='row'><span>Median</span><span class='num'>" + Math.round(c.med) + " seats</span></div>" +
          "<div class='row'><span>80% range</span><span class='num'>" + Math.round(c.lo) + " to " + Math.round(c.hi) + "</span></div>" +
          "<div class='row'><span>D majority</span><span class='num'>" + pct(c.pmaj) + "</span></div>" +
          (e.own ? "" : "<div class='row'><span>Uncertainty</span><span>default</span></div>");
        tip.hidden = false; var b = g.getBoundingClientRect();
        tip.style.left = Math.min(Math.max(8, (ev.clientX || b.left) - tip.offsetWidth / 2), window.innerWidth - tip.offsetWidth - 8) + "px";
        tip.style.top = Math.max(8, b.top - tip.offsetHeight - 6) + "px";
      };
      g.addEventListener("mousemove", show); g.addEventListener("click", function (ev) { show(ev); ev.stopPropagation(); });
      g.addEventListener("mouseleave", function () { tip.hidden = true; });
    });
    return div;
  }
  document.addEventListener("click", function () { $("tip").hidden = true; });
  window.addEventListener("scroll", function () { $("tip").hidden = true; }, { passive: true });

  function table(rows) {
    rankAll(entries.filter(function (e) { return !e.error; }));
    var cols = [
      ["name", "Forecaster", function (e) { return e.name.toLowerCase(); }],
      ["hs", "House seats: projected (median)", function (e) { return e.hD; }],
      ["hp", "House: D majority", function (e) { return e.H.pmaj; }],
      ["ss", "Senate seats: projected (median)", function (e) { return e.sD; }],
      ["sp", "Senate: D control", function (e) { return e.Sn.pmaj; }],
      ["both", "Both chambers: D", function (e) { return e.both == null ? -1 : e.both; }],
      ["rk", "Accuracy rank (avg. error)", function (e) { return e.rank || 1e9; }],
      ["as", "As of", function (e) { return e.asof || ""; }]
    ];
    var f = cols.filter(function (c) { return c[0] === sortKey; })[0][2];
    var body = rows.filter(function (e) { return !e.isClass; }).sort(function (a, b) { var x = f(a), y = f(b); return (x < y ? -1 : x > y ? 1 : 0) * sortDir; });
    body = refRows().concat(body);
    var head = "<thead><tr>" + cols.map(function (c, i) {
      return "<th class='" + (i ? "r " : "") + "sort' data-k='" + c[0] + "' aria-sort='" + (c[0] === sortKey ? (sortDir > 0 ? "ascending" : "descending") : "none") + "'>" +
        c[1] + (c[0] === sortKey ? (sortDir > 0 ? " ▲" : " ▼") : "") + "</th>"; }).join("") + "</tr></thead>";
    var tb = body.map(function (e) {
      return "<tr" + (e.isClass ? " class='clsrow'" : "") + "><td>" + (e.isClass ? "<a href='" + esc(e.url) + "'><strong>" + esc(e.name) + "</strong></a>" : nameLink(e)) +
        (e.flag ? " <span class='badge' title='The site shows a warning about this forecast file'>check file</span>" : "") + "</td>" +
        "<td class='r num'>" + e.hD + " (" + Math.round(e.H.med) + ")</td><td class='r num'>" + pct(e.H.pmaj) + "</td>" +
        "<td class='r num'>" + e.sD + " (" + Math.round(e.Sn.med) + ")</td><td class='r num'>" + pct(e.Sn.pmaj) + "</td>" +
        "<td class='r num'>" + (e.both == null ? "" : pct(e.both)) + "</td>" +
        "<td class='r num'>" + accText(e) + "</td><td class='r num'>" + esc(e.asof || "") + "</td></tr>";
    }).join("");
    $("table").innerHTML = head + "<tbody>" + tb + "</tbody>";
    $("table").querySelectorAll("th.sort").forEach(function (th) {
      th.addEventListener("click", function () {
        var k = th.dataset.k; if (k === sortKey) sortDir = -sortDir; else { sortKey = k; sortDir = (k === "name" || k === "rk") ? 1 : -1; }
        table(rows);
      });
    });
  }

  // ---------------------------------------------------------------- published benchmarks
  // data/benchmarks/ holds outside_toplines.csv (one row per published forecast; rows marked private = y are never
  // shown) and race files, in the forecast.csv layout, for the sources whose race-level numbers are public. Update
  // them by copying new files over the old ones.
  // (a function, not a variable, because the page starts loading these before this part of the file runs)
  function benchSources() {
    return [
      { key: "electit", name: "ElectIt", file: "forecast_electit.csv" },
      { key: "poly", name: "Polymarket", file: "forecast_polymarket.csv" }
    ];
  }
  var TYPE = { polling: "Polling model", market: "Prediction markets", academic: "Academic model", ratings: "Ratings" };
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var tops = null, bench = {}, bq = "", boff = "all", bmode = "p", bsort = { k: "close", d: 1 };

  function loadBench() {
    return Promise.all([getCSV("data/benchmarks/outside_toplines.csv").then(function (t) { tops = t; }).catch(function () { tops = null; })]
      .concat(benchSources().map(function (b) {
        return getCSV("data/benchmarks/" + b.file).then(function (rows) {
          var m = {};
          rows.forEach(function (r) { m[r.race_id] = { share: FC.num(r.pred_dem_share), p: FC.num(r.p_dem_win) }; });
          bench[b.key] = m;
        }).catch(function () {});
      })));
  }
  function day(iso) { var m = /^(\d{4})-(\d\d)-(\d\d)/.exec(iso || ""); return m ? MONTHS[Number(m[2]) - 1] + " " + Number(m[3]) : esc(iso || ""); }
  function ok01(v) { return v != null && !isNaN(v); }
  function pnorm(z) {
    var t = 1 / (1 + 0.2316419 * Math.abs(z)), d = 0.3989422804 * Math.exp(-z * z / 2);
    var p = d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
    return z > 0 ? 1 - p : p;
  }
  // a forecaster's chance D wins one race: their own p_dem_win, or else the site's default uncertainty around their share
  function pOf(r) {
    if (ok01(r.p)) return r.p;
    if (!ok01(r.share)) return null;
    var e = FC.DEFAULT_ERR[r.office] || FC.DEFAULT_ERR.house;
    return pnorm((r.share - 0.5) * 100 / Math.sqrt(e.nat * e.nat + e.dist * e.dist));
  }

  function benchTops(ok) {
    var box = $("bench-tops"), notes = [];
    if (!tops) { box.innerHTML = "<tbody><tr><td>The published forecasts could not be loaded.</td></tr></tbody>"; $("bench-notes").innerHTML = ""; return; }
    var na = "<span class='muted'>n/a</span>";
    var P = function (v) { var x = FC.num(v); return ok01(x) ? pct(x) : na; };
    var N = function (v) { var x = FC.num(v); return ok01(x) ? String(Math.round(x)) : na; };
    var row = function (cls, src, type, hs, ss, ph, ps, when) {
      return "<tr" + (cls ? " class='" + cls + "'" : "") + "><td class='src'>" + src + "</td><td class='type'>" + type + "</td><td class='r num'>" + hs + "</td><td class='r num'>" + ss +
        "</td><td class='r num'>" + ph + "</td><td class='r num'>" + ps + "</td><td class='r num'>" + when + "</td></tr>";
    };
    var html = "<thead><tr><th>Forecast</th><th>Type</th><th class='r'>House seats (D)</th><th class='r'>Senate seats (D)</th><th class='r'>D House majority</th><th class='r'>D Senate control</th><th class='r'>Captured</th></tr></thead><tbody>";
    html += "<tr class='grp'><td colspan='7'>Published forecasts</td></tr>";
    tops.filter(function (r) { return r.forecaster && !/^y/i.test(r.private || ""); }).forEach(function (r) {
      var name = /^https:\/\//.test(r.url || "") ? "<a href='" + esc(r.url) + "'>" + esc(r.forecaster) + "</a>" : esc(r.forecaster);
      if (r.notes) { notes.push(r.notes); name += "<sup class='fn'><a href='#bn" + notes.length + "' id='bnr" + notes.length + "'>" + notes.length + "</a></sup>"; }
      html += row("", name, esc(TYPE[r.type] || r.type || ""), N(r.house_seats), N(r.senate_seats), P(r.p_house), P(r.p_senate), day(r.captured));
    });
    var refs = refRows();
    if (refs.length) {
      html += "<tr class='grp'><td colspan='7'>Course models</td></tr>";
      refs.forEach(function (e) {
        html += row("", "<a href='" + esc(e.url) + "'>" + esc(e.name) + "</a>", "Class model", Math.round(e.H.med), Math.round(e.Sn.med), pct(e.H.pmaj), pct(e.Sn.pmaj), day(e.asof));
      });
    }
    var avg = avgSet(ok), left = ok.length - avg.length;
    if (avg.length) {
      html += row("avgrow", "Contest entries (average of " + avg.length + ")", "For comparison",
        Math.round(quant(avg.map(function (e) { return e.H.med; }), 0.5)), Math.round(quant(avg.map(function (e) { return e.Sn.med; }), 0.5)),
        pct(mean(avg, function (e) { return e.H.pmaj; })), pct(mean(avg, function (e) { return e.Sn.pmaj; })), closed ? "Nov 1" : "so far");
    }
    box.innerHTML = html + "</tbody>";
    $("bench-notes").innerHTML = notes.map(function (n, i) { return "<li id='bn" + (i + 1) + "'>" + esc(n) + "</li>"; }).join("") +
      "<li class='plain' style='list-style:none;margin-left:-22px'>Seats are medians, or the published projection where a source gives one number. Class model seats and chances come from its simulations." +
      (left ? " The contest-entry averages here and below leave out " + left + " listed entr" + (left === 1 ? "y" : "ies") + " flagged under the competition's outlier rule." : "") + "</li>";
  }

  // entries that count toward the "Contest entries (average)" rows: everyone listed except flagged outliers
  function avgSet(ok) { return ok.filter(function (e) { return !e.outlier; }); }

  function benchRaces(ok) {
    var cols = [], avg = avgSet(ok);
    if (avg.length) {
      var acc = {};
      avg.forEach(function (e) { e.A.races.forEach(function (r) {
        var a = acc[r.race_id] || (acc[r.race_id] = { p: 0, np: 0, s: 0, ns: 0 }), p = pOf(r);
        if (ok01(p)) { a.p += p; a.np++; }
        if (ok01(r.share)) { a.s += r.share; a.ns++; }
      }); });
      cols.push({ key: "avg", name: "Contest entries (avg.)", get: function (id) { var a = acc[id]; return a ? { p: a.np ? a.p / a.np : null, share: a.ns ? a.s / a.ns : null } : null; } });
    }
    if (cls && !cls.error) { // the class model only; the class model + polls stays in the toplines table
      var cm = {}; cls.A.races.forEach(function (r) { cm[r.race_id] = { p: pOf(r), share: r.share }; });
      cols.push({ key: "cls", name: "Class model", get: function (id) { return cm[id] || null; } });
    }
    benchSources().forEach(function (b) { if (bench[b.key]) cols.push({ key: b.key, name: b.name, get: function (id) { return bench[b.key][id] || null; } }); });

    var rows = races.filter(function (r) { return FC.num(r.fixed_prediction) == null; }).map(function (r) {
      var v = {}, n = 0, d = 0;
      cols.forEach(function (c) {
        var x = c.get(r.race_id) || {};
        v[c.key] = { p: ok01(x.p) ? x.p : null, m: ok01(x.share) ? (2 * x.share - 1) * 100 : null };
        if (v[c.key].p != null) { d += Math.abs(v[c.key].p - 0.5); n++; }
      });
      var hay = (raceName(r) + " " + (STATE_NAMES[r.state] || "") + " " + r.race_id + " " + (r.dem_candidate || "") + " " + (r.rep_candidate || "")).toLowerCase();
      return { r: r, v: v, close: n ? d / n : 1, hay: hay };
    });
    var total = rows.length;
    if (boff !== "all") rows = rows.filter(function (o) { return o.r.office === boff; });
    if (bq) rows = rows.filter(function (o) { return o.hay.indexOf(bq) >= 0; });
    var key = bmode === "p" ? "p" : "m";
    var val = function (o) {
      if (bsort.k === "close") return o.close;
      if (bsort.k === "race") return o.r.race_id;
      var x = o.v[bsort.k]; return x && x[key] != null ? x[key] : null;
    };
    rows.sort(function (a, b) {
      var x = val(a), y = val(b);
      if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1;
      return (x < y ? -1 : x > y ? 1 : 0) * bsort.d;
    });
    var arrow = function (k) { return bsort.k === k ? (bsort.d > 0 ? " ▲" : " ▼") : ""; };
    var head = "<thead><tr><th class='sort' data-k='race'>Race" + arrow("race") + "</th><th>D side</th><th>R side</th>" + cols.map(function (c) {
      return "<th class='r sort' data-k='" + c.key + "'>" + esc(c.name) + arrow(c.key) + "</th>"; }).join("") + "</tr></thead>";
    var cell = function (x) {
      if (!x || x[key] == null) return "<td class='r na'>&ndash;</td>";
      if (key === "m") return "<td class='r num'>" + marginText(x.m) + "</td>";
      var p = x.p; return "<td class='r num'>" + (p > 0 && p < 0.005 ? "&lt;1%" : p < 1 && p > 0.995 ? "&gt;99%" : pct(p)) + "</td>";
    };
    var body = rows.map(function (o) {
      return "<tr><td>" + esc(raceName(o.r)) + "</td><td class='cand'>" + esc(o.r.dem_candidate || "") + "</td><td class='cand'>" + esc(o.r.rep_candidate || "") + "</td>" +
        cols.map(function (c) { return cell(o.v[c.key]); }).join("") + "</tr>";
    }).join("");
    $("bench-races").innerHTML = head + "<tbody>" + (body || "<tr><td colspan='" + (3 + cols.length) + "'>No races match.</td></tr>") + "</tbody>";
    $("bench-count").textContent = "Showing " + rows.length + " of " + total + " contested races." + (bmode === "m" ? " Margins are in points (Democratic share minus Republican share); Polymarket has prices only." : "");
    $("bench-races").querySelectorAll("th.sort").forEach(function (th) {
      th.addEventListener("click", function () {
        var k = th.dataset.k;
        if (k === bsort.k) bsort.d = -bsort.d; else { bsort.k = k; bsort.d = k === "race" ? 1 : -1; }
        benchRaces(okEntries());
      });
    });
  }
  function okEntries() { return entries.filter(function (e) { return !e.error; }); }
  function benchmarks(ok) { benchTops(ok); benchRaces(ok); }

  $("bsearch").addEventListener("input", function (e) { bq = e.target.value.trim().toLowerCase(); benchRaces(okEntries()); });
  [["boff", function (v) { boff = v; }], ["bmode", function (v) { bmode = v; }]].forEach(function (g) {
    $(g[0]).querySelectorAll("button").forEach(function (btn) {
      btn.addEventListener("click", function () {
        $(g[0]).querySelectorAll("button").forEach(function (b) { b.classList.toggle("on", b === btn); });
        g[1](btn.dataset.v); benchRaces(okEntries());
      });
    });
  });

  // races where the students split most evenly
  function disagreements(ok) {
    var box = $("split");
    if (ok.length < 2) { box.innerHTML = "<p class='note'>This table needs at least two listed forecasts.</p>"; return; }
    var byId = {};
    ok.forEach(function (e) { e.A.races.forEach(function (r) {
      if (FC.isFixed(r) || r.share == null) return;
      var o = byId[r.race_id] || (byId[r.race_id] = { r: r, d: 0, n: 0, m: 0 });
      o.n++; o.m += (2 * r.share - 1) * 100; if (r.share > 0.5) o.d++;
    }); });
    var clsM = {};
    if (cls && !cls.error) cls.A.races.forEach(function (r) { clsM[r.race_id] = (2 * r.share - 1) * 100; });
    var list = Object.keys(byId).map(function (k) { return byId[k]; }).filter(function (o) { return o.d > 0 && o.d < o.n; })
      .sort(function (a, b) { return Math.abs(a.d / a.n - 0.5) - Math.abs(b.d / b.n - 0.5) || Math.abs(a.m / a.n) - Math.abs(b.m / b.n); }).slice(0, 20);
    if (!list.length) { box.innerHTML = "<p class='note'>Every listed forecaster favors the same party in every race.</p>"; return; }
    box.innerHTML = "<div class='table-wrap'><table><thead><tr><th>Race</th><th>D side</th><th>R side</th><th class='r'>Forecasters favoring D</th><th class='r'>Average margin</th><th class='r'>Class model</th></tr></thead><tbody>" +
      list.map(function (o) {
        return "<tr><td>" + esc(raceName(o.r)) + "</td><td class='cand'>" + esc(o.r.dem_candidate || "") + "</td><td class='cand'>" + esc(o.r.rep_candidate || "") + "</td>" +
          "<td class='r num'>" + o.d + " of " + o.n + "</td><td class='r num'>" + marginText(o.m / o.n) + "</td><td class='r num'>" + (o.r.race_id in clsM ? marginText(clsM[o.r.race_id]) : "") + "</td></tr>";
      }).join("") + "</tbody></table></div>";
  }
})();
