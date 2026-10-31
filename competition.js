// ---------------------------------------------------------------------------
// COMPETITION SETTINGS. Edit the text between the quotation marks on github.com
// (open this file, click the pencil icon, then "Commit changes").
// The home page and the Instructions page both read these.
// ---------------------------------------------------------------------------

window.COMPETITION = {

  // Sign-up form for Yale students outside PLSC 2219 (Yale email, nickname).
  // Paste the Google Form's share link here. Until then, the buttons say the form opens soon.
  signup_form: "https://forms.gle/vSs1Y8s63YRp8aUL7",

  // Sign-up deadline. Shown on both pages. From signup_closes on, the Sign up
  // buttons grey out and read "Sign-ups closed".
  signup_deadline: "Wed., Oct. 28",
  signup_closes: "2026-10-29T00:00:00-04:00",

  // SUBMISSIONS ARE BY EMAIL. The "Submit your forecast" buttons open a new email
  // to this address with the subject and the text below filled in. Browsers
  // cannot attach files, so the text reminds entrants to attach forecast.csv.
  // From submit_closes on (just after the deadline, 11:59 pm Eastern on Sunday,
  // Nov. 1; clocks have gone back to EST by then) the buttons read "Submissions closed".
  submit_email: "kevin.deluca@yale.edu",
  submit_subject: "2026 Forecast Competition Submission",
  submit_body: [
    "Hi Prof. DeLuca,",
    "",
    "Here is my forecast for the 2026 Election Forecast Competition.",
    "",
    "Name:",
    "Forecaster nickname (shown in the gallery and the results):",
    "In PLSC 2219 (yes/no):",
    "Include my forecast in the gallery (yes/no):",
    "My forecast site address, if I have one (optional; the gallery links to it):",
    "One sentence about my model (optional):",
    "",
    "Attached:",
    "- forecast.csv (required)",
    "- seat_sims.csv (optional)",
    "",
    "(Attach your files before sending: this email does not attach them for you. The last forecast emailed before 11:59 pm Eastern on Sunday, Nov. 1 counts.)"
  ],
  submit_closes: "2026-11-02T00:00:00-05:00",

  // JUST FOR FUN (not competition entries): anyone can download the blank
  // downloads/forecast.csv, fill in any races, and email it with this subject.
  // From fun_closes on (6 pm Eastern on Election Day, before the first polls
  // close) the button reads "Closed".
  fun_subject: "2026 forecast, just for fun",
  fun_body: [
    "Hi Prof. DeLuca,",
    "",
    "Here are my 2026 predictions, just for fun (not a competition entry).",
    "",
    "Name or nickname:",
    "",
    "Attached: forecast.csv",
    "",
    "(Attach your file before sending: this email does not attach it for you.)"
  ],
  fun_closes: "2026-11-03T18:00:00-05:00",

  // The kickoff event and the election night watch party are not listed on the
  // site: their dates, times and places go only to people who sign up.

  // How people should get in touch.
  contact: "Prof. Kevin DeLuca"
};

// Fills in the pages. No need to edit below this line.
(function () {
  var C = window.COMPETITION || {};
  function each(sel, fn) { Array.prototype.forEach.call(document.querySelectorAll(sel), fn); }
  each("[data-c]", function (el) { var v = C[el.getAttribute("data-c")]; if (v) el.textContent = v; });
  function link(attr, key, soon) {
    each("a[" + attr + "]", function (a) {
      if (/^https:\/\//.test(C[key] || "")) { a.href = C[key]; a.target = "_blank"; a.rel = "noopener"; }
      else { a.removeAttribute("href"); a.setAttribute("aria-disabled", "true"); a.textContent = soon; a.classList.add("off"); }
    });
  }
  function closed(key) { var t = Date.parse(C[key] || ""); return !isNaN(t) && Date.now() >= t; }
  function off(a, text) { a.removeAttribute("href"); a.removeAttribute("target"); a.setAttribute("aria-disabled", "true"); a.textContent = text; a.classList.add("off"); }
  link("data-signup", "signup_form", "Sign-up form opens soon");
  if (closed("signup_closes")) each("a[data-signup]", function (a) { off(a, "Sign-ups closed"); });

  // Submission by email: a mailto link with the subject and body filled in, plus
  // the same address and text on the page for anyone whose email app doesn't open.
  var body = (C.submit_body || []).join("\n");
  each("a[data-submit]", function (a) {
    if (closed("submit_closes")) return off(a, "Submissions closed");
    if (!C.submit_email) return off(a, "Submissions open soon");
    a.href = "mailto:" + C.submit_email + "?subject=" + encodeURIComponent(C.submit_subject || "") + "&body=" + encodeURIComponent(body);
  });
  each("[data-submit-email]", function (el) { el.textContent = C.submit_email || ""; if (el.tagName === "A") el.href = "mailto:" + C.submit_email; });
  each("[data-submit-subject]", function (el) { el.textContent = C.submit_subject || ""; });
  each("[data-submit-body]", function (el) { el.textContent = body; });
  each("[data-submit-help]", function (el) { el.hidden = !C.submit_email || closed("submit_closes"); });

  // Just for fun: the same email address, its own subject and text.
  each("a[data-fun-submit]", function (a) {
    if (closed("fun_closes")) return off(a, "Closed");
    if (!C.submit_email) return off(a, "Opens soon");
    a.href = "mailto:" + C.submit_email + "?subject=" + encodeURIComponent(C.fun_subject || "") + "&body=" + encodeURIComponent((C.fun_body || []).join("\n"));
  });
  each("[data-fun-subject]", function (el) { el.textContent = C.fun_subject || ""; });
})();
