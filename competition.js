// ---------------------------------------------------------------------------
// COMPETITION SETTINGS. Edit the text between the quotation marks on github.com
// (open this file, click the pencil icon, then "Commit changes").
// The home page and the Instructions page both read these.
// ---------------------------------------------------------------------------

window.COMPETITION = {

  // Sign-up form for Yale students outside PLSC 2219 (Yale email, nickname).
  // Paste the Google Form's share link here. Until then, the buttons say the form opens soon.
  signup_form: "https://forms.gle/vSs1Y8s63YRp8aUL7",

  // Submission form (a Google Form with a file-upload question for forecast.csv,
  // plus an optional site address for the gallery). Paste its share link here.
  submit_form: "",

  // Sign-up deadline. Shown on both pages.
  signup_deadline: "Wed., Oct. 28",

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
  link("data-signup", "signup_form", "Sign-up form opens soon");
  link("data-submit", "submit_form", "Submission form opens soon");
})();
