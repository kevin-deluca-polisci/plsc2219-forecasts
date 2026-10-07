// ---------------------------------------------------------------------------
// COMPETITION SETTINGS. Edit the text between the quotation marks on github.com
// (open this file, click the pencil icon, then "Commit changes").
// The home page and the Instructions page both read these.
// ---------------------------------------------------------------------------

window.COMPETITION = {

  // Sign-up form for Yale students outside PLSC 2219 (Yale email, nickname).
  // Paste the Google Form's share link here. Until then, the buttons say the form opens soon.
  signup_form: "",

  // Submission form (a Google Form with a file-upload question for forecast.csv,
  // plus an optional site address for the gallery). Paste its share link here.
  submit_form: "",

  // Kickoff event: date, time and place. Shown on both pages.
  kickoff: "Late October",
  kickoff_detail: "Date and place to be announced",

  // Election night watch party.
  watch_party: "Tue., Nov. 3, 7–9 pm",
  watch_party_detail: "Place to be announced",

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
  link("data-signup", "signup_form", "Sign-up form opens soon");
  link("data-submit", "submit_form", "Submission form opens soon");
})();
