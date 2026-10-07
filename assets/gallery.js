/* Class gallery: reads each opted-in student site's forecast.csv and seat_sims.csv live and compares them.
   gallery.csv columns: forecaster_name, url, data_url (optional).
     url       the student's site address (https://...github.io/repo/)
     data_url  optional: where to read the files instead (for example a saved snapshot folder in this repo,
               like snapshots/swing-voter/). Leave blank to read the live site. */
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

  var races, notup, entries = [], cls = null, frozen = null;

  function getJSON(path) {
    return fetch(path + "?v=" + Date.now(), { cache: "no-store" }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); });
  }

  Promise.all([getCSV("data/races_2026.csv"), getCSV("data/senate_seats_not_up_2026.csv"), getCSV("gallery.csv"),
               getJSON("freeze.json").catch(function () { return null; })])
    .then(function (res) {
      races = res[0]; notup = res[1]; frozen = res[3];
      if (frozen) {
        $("frozen").innerHTML = "<strong>Frozen at the deadline.</strong> Forecasts as each site showed them at 11:59 pm Eastern on Sunday, November 1.";
        $("frozen").hidden = false;
        $("live-note").textContent = "";
      }
      var list = res[2].filter(function (r) { return r.forecaster_name && /^https:\/\//.test(r.url || ""); });
      $("count").textContent = list.length ? list.length + " forecast" + (list.length === 1 ? "" : "s") + " listed." : "No forecasts listed yet.";
      // the class model first (this repo's own files), then each student, one at a time so the page stays responsive
      var jobs = [{ name: "Class model", url: "class-model.html", data: "./", isClass: true }].concat(list.map(function (r) {
        var job = { name: r.forecaster_name, url: slash(r.url), data: slash(r.data_url || r.url) };
        if (frozen && !r.data_url) { // after the freeze, read the saved copy, never the live site
          var f = frozen.entries[slash(r.url)];
          if (f && f.status === "frozen") job.data = f.folder;
          else job.error = f ? f.status : "not listed when the gallery was frozen";
        }
        return job;
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
          var e = { name: job.name, url: job.url, isClass: !!job.isClass };
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
            }
          }
          if (e.isClass) cls = e; else entries.push(e);
          render(); done();
        }, 0);
      });
    });
  }

  // ---------------------------------------------------------------- render
  var sortKey = "hp", sortDir = -1;
  function render() {
    var ok = entries.filter(function (e) { return !e.error; });
    summary(ok);
    $("chart-house").innerHTML = ""; $("chart-senate").innerHTML = "";
    var rows = (cls && !cls.error ? [cls] : []).concat(ok);
    if (rows.length) {
      $("chart-house").appendChild(strip(rows, "H", HOUSE_MAJ, "Democratic House seats"));
      $("chart-senate").appendChild(strip(rows, "Sn", SENATE_MAJ, "Democratic Senate seats"));
    }
    table(rows);
    disagreements(ok);
    var bad = entries.filter(function (e) { return e.error; });
    $("errors").hidden = !bad.length;
    $("errors").innerHTML = bad.length ? "<strong>" + (frozen ? "Not included:" : "Not shown yet:") + "</strong> " + bad.map(function (e) {
      return "<a href='" + esc(e.url) + "'>" + esc(e.name) + "</a> (" + esc(e.error) + ")"; }).join("; ") : "";
  }

  function mean(a, f) { return a.reduce(function (s, x) { return s + f(x); }, 0) / a.length; }
  function summary(ok) {
    var html = "";
    if (cls && !cls.error) html += cardHTML("Class model", cls.H.pmaj, cls.Sn.pmaj, Math.round(cls.H.med), Math.round(cls.Sn.med), "The model PLSC 2219 built together in class.");
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
    rows = rows.slice().sort(function (a, b) { return (b.isClass - a.isClass) || (b[key].med - a[key].med); });
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
        "<text class='name" + (e.isClass ? " cls" : "") + "' x='" + (L - 10) + "' y='" + (y + 4) + "' text-anchor='end'>" + esc(e.name.length > 16 ? e.name.slice(0, 15) + "…" : e.name) + "</text>" +
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
    var cols = [
      ["name", "Forecaster", function (e) { return e.name.toLowerCase(); }],
      ["hs", "House: projected D seats", function (e) { return e.hD; }],
      ["hm", "House: median (80% range)", function (e) { return e.H.med; }],
      ["hp", "House: D majority", function (e) { return e.H.pmaj; }],
      ["ss", "Senate: projected D seats", function (e) { return e.sD; }],
      ["sm", "Senate: median (80% range)", function (e) { return e.Sn.med; }],
      ["sp", "Senate: D control", function (e) { return e.Sn.pmaj; }],
      ["un", "Uncertainty", function (e) { return e.own ? 1 : 0; }],
      ["as", "As of", function (e) { return e.asof || ""; }]
    ];
    var f = cols.filter(function (c) { return c[0] === sortKey; })[0][2];
    var body = rows.filter(function (e) { return !e.isClass; }).sort(function (a, b) { var x = f(a), y = f(b); return (x < y ? -1 : x > y ? 1 : 0) * sortDir; });
    if (cls && !cls.error) body.unshift(cls);
    var head = "<thead><tr>" + cols.map(function (c, i) {
      return "<th class='" + (i ? "r " : "") + "sort' data-k='" + c[0] + "' aria-sort='" + (c[0] === sortKey ? (sortDir > 0 ? "ascending" : "descending") : "none") + "'>" +
        c[1] + (c[0] === sortKey ? (sortDir > 0 ? " ▲" : " ▼") : "") + "</th>"; }).join("") + "</tr></thead>";
    var tb = body.map(function (e) {
      return "<tr" + (e.isClass ? " class='clsrow'" : "") + "><td>" + (e.isClass ? "<strong>Class model</strong>" : "<a href='" + esc(e.url) + "'>" + esc(e.name) + "</a>") +
        (e.flag ? " <span class='badge' title='The site shows a warning about this forecast file'>check file</span>" : "") + "</td>" +
        "<td class='r num'>" + e.hD + "</td><td class='r num'>" + Math.round(e.H.med) + " (" + Math.round(e.H.lo) + "–" + Math.round(e.H.hi) + ")</td><td class='r num'>" + pct(e.H.pmaj) + "</td>" +
        "<td class='r num'>" + e.sD + "</td><td class='r num'>" + Math.round(e.Sn.med) + " (" + Math.round(e.Sn.lo) + "–" + Math.round(e.Sn.hi) + ")</td><td class='r num'>" + pct(e.Sn.pmaj) + "</td>" +
        "<td class='r'>" + (e.own ? "simulated" : "default") + "</td><td class='r num'>" + esc(e.asof || "") + "</td></tr>";
    }).join("");
    $("table").innerHTML = head + "<tbody>" + tb + "</tbody>";
    $("table").querySelectorAll("th.sort").forEach(function (th) {
      th.addEventListener("click", function () {
        var k = th.dataset.k; if (k === sortKey) sortDir = -sortDir; else { sortKey = k; sortDir = k === "name" ? 1 : -1; }
        table(rows);
      });
    });
  }

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
