/* Home-page graphic: the class model's current forecast as tiles (no numbers).
   Reads data/races_2026.csv and the class model's forecast.csv, so it updates whenever forecast.csv does. */
(function () {
  "use strict";
  var SH = { "safe-d": "#0A4AAA", "likely-d": "#4F7FD0", "lean-d": "#A9C0EA", "toss": "#C9C4BA",
             "lean-r": "#F3AFAA", "likely-r": "#EE6A63", "safe-r": "#E8231F" };
  var LABELS = [["safe-d", "Safe D"], ["likely-d", "Likely D"], ["lean-d", "Lean D"], ["toss", "Toss-up"],
                ["lean-r", "Lean R"], ["likely-r", "Likely R"], ["safe-r", "Safe R"]];
  var TILE = { AK:[0,0], ME:[0,10], VT:[1,9], NH:[1,10],
    WA:[2,0], ID:[2,1], MT:[2,2], ND:[2,3], MN:[2,4], IL:[2,5], WI:[2,6], MI:[2,7], NY:[2,8], RI:[2,9], MA:[2,10],
    OR:[3,0], NV:[3,1], WY:[3,2], SD:[3,3], IA:[3,4], IN:[3,5], OH:[3,6], PA:[3,7], NJ:[3,8], CT:[3,9],
    CA:[4,0], UT:[4,1], CO:[4,2], NE:[4,3], MO:[4,4], KY:[4,5], WV:[4,6], VA:[4,7], MD:[4,8], DE:[4,9],
    AZ:[5,1], NM:[5,2], KS:[5,3], AR:[5,4], TN:[5,5], NC:[5,6], SC:[5,7],
    OK:[6,3], LA:[6,4], MS:[6,5], AL:[6,6], GA:[6,7], HI:[7,0], TX:[7,3], FL:[7,8] };

  function rate(share, p) {
    if (p != null && !isNaN(p)) {
      var fav = Math.max(p, 1 - p), d = p >= 0.5;
      return fav < 0.6 ? "toss" : fav < 0.8 ? (d ? "lean-d" : "lean-r") : fav < 0.95 ? (d ? "likely-d" : "likely-r") : (d ? "safe-d" : "safe-r");
    }
    var m = (2 * share - 1) * 100, a = Math.abs(m);
    return a < 3 ? "toss" : a < 8 ? (m > 0 ? "lean-d" : "lean-r") : a < 15 ? (m > 0 ? "likely-d" : "likely-r") : (m > 0 ? "safe-d" : "safe-r");
  }

  function house(rs) {
    rs = rs.slice().sort(function (a, b) { return b.share - a.share; });
    var rows = 15, t = 19, g = 3.2, cols = Math.ceil(rs.length / rows);
    var W = cols * t + (cols - 1) * g, H = rows * t + (rows - 1) * g;
    var s = '<svg viewBox="-4 -34 ' + (W + 8) + ' ' + (H + 48) + '" role="img" aria-label="House forecast: 435 districts, most Democratic at left">';
    rs.forEach(function (r, i) {
      var c = Math.floor(i / rows), k = i % rows;
      s += '<rect x="' + (c * (t + g)).toFixed(1) + '" y="' + (k * (t + g)).toFixed(1) + '" width="' + t + '" height="' + t + '" rx="3.2" fill="' + SH[r.rating] + '"/>';
    });
    var mid = W / 2; // the 218th seat sits in the middle column
    s += '<line x1="' + mid.toFixed(1) + '" y1="-10" x2="' + mid.toFixed(1) + '" y2="' + (H + 8) + '" stroke="#1B1B1B" stroke-width="2.4" stroke-dasharray="5 4"/>';
    s += '<text x="' + mid.toFixed(1) + '" y="-16" text-anchor="middle" class="maj">218 TO WIN</text></svg>';
    return s;
  }

  function senate(rs) {
    var by = {}; rs.forEach(function (r) { if (!by[r.state]) by[r.state] = r; });
    var t = 40, g = 4, s = '<svg viewBox="0 0 ' + (11 * (t + g)) + ' ' + (8 * (t + g)) + '" role="img" aria-label="Senate forecast by state">';
    Object.keys(TILE).forEach(function (st) {
      var rc = TILE[st], x = rc[1] * (t + g), y = rc[0] * (t + g), r = by[st];
      s += r ? '<rect x="' + x + '" y="' + y + '" width="' + t + '" height="' + t + '" rx="5" fill="' + SH[r.rating] + '"/>'
             : '<rect x="' + (x + 1) + '" y="' + (y + 1) + '" width="' + (t - 2) + '" height="' + (t - 2) + '" rx="5" fill="none" stroke="#cfc8b8" stroke-width="1.5"/>';
      var dark = r && /safe|likely/.test(r.rating);
      s += '<text x="' + (x + t / 2) + '" y="' + (y + t / 2 + 5) + '" text-anchor="middle" class="ab' + (dark ? ' on' : '') + (r ? '' : ' off') + '">' + st + '</text>';
    });
    return s + '</svg>';
  }

  Promise.all([FC.getCSV("data/races_2026.csv"), FC.getCSV("forecast.csv")]).then(function (res) {
    var fc = {}; res[1].forEach(function (r) { fc[r.race_id] = r; });
    var asof = "", hs = [], ss = [];
    res[0].forEach(function (r) {
      var f = fc[r.race_id]; if (!f) return;
      var fixed = FC.num(r.fixed_prediction), share = fixed != null && !isNaN(fixed) ? fixed : Number(f.pred_dem_share);
      var p = fixed != null && !isNaN(fixed) ? fixed : FC.num(f.p_dem_win);
      if (f.asof) asof = f.asof;
      var o = { state: r.state, share: share, rating: rate(share, p) };
      (r.office === "house" ? hs : ss).push(o);
    });
    if (hs.length < 400) throw new Error("forecast incomplete");
    document.getElementById("hero-house").innerHTML = house(hs);
    document.getElementById("hero-senate").innerHTML = senate(ss);
    document.getElementById("hero-legend").innerHTML = LABELS.map(function (l) {
      return '<span><i style="background:' + SH[l[0]] + '"></i>' + l[1] + '</span>'; }).join("");
    if (asof) {
      var d = new Date(asof + "T12:00:00");
      document.getElementById("hero-asof").textContent = " as of " + d.toLocaleDateString("en-US", { month: "long", day: "numeric" });
    }
    document.getElementById("hero").hidden = false;
  }).catch(function () { /* leave the graphic hidden if the files can't be read */ });
})();
