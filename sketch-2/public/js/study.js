// The Sidekick voice study hub (/study). One guided path, the same for every crew, with a checklist
// testers can move around in. Testers only ever see "Voice 1" and "Voice 2": which voice is which is
// decided on the server and never sent here. See reference/sidekick-ab-study-plan.md.
(() => {
  const app = document.getElementById("app");
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };
  const params = new URLSearchParams(location.search);
  let sid = params.get("s") || store.get("study:last");
  let tid = sid ? store.get(`study:${sid}:tid`) : null;
  let view = null;
  let open = null; // which step's panel is open
  const draft = { 1: {}, 2: {}, final: { why: "", change: "" } };

  let toastTimer;
  function toast(msg) {
    const t = document.getElementById("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 2800);
  }
  async function api(path, body) {
    const res = await fetch(path, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {});
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error || "Something went wrong. Try again in a moment."), { status: res.status, data });
    return data;
  }
  const post = (action, body = {}) => api(`/api/sk/study/${encodeURIComponent(sid)}/${action}`, { t: tid, ...body });
  const ICON = {
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    chev: '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>',
  };

  // ---------- Consent (design ST1): the approved text, then four required boxes and one optional ----------
  // Nothing is sent until Start: "Not now" leaves without creating any data. The boxes go to the server as
  // yes/no flags only. Start uses aria-disabled (it stays focusable): tapping it early shows the error and
  // moves focus to the first unticked box.
  const EMAIL = "asiatheperson@gmail.com";
  const DELETE_DATE = "December 31, 2026";
  const IQ = (p) => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
  const SI = {
    why: IQ('<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16v.5"/>'),
    todo: IQ('<path d="M9 4h6v3H9zM6 6h12v15H6z"/><path d="M9 12h6M9 16h4"/>'),
    invited: IQ('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),
    collect: IQ('<path d="M4 6h16M4 12h16M4 18h10"/>'),
    nope: IQ('<circle cx="12" cy="12" r="9"/><path d="M6 6l12 12"/>'),
    choices: IQ('<path d="M5 12l5 5 9-10"/>'),
    keep: IQ('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
    use: IQ('<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>'),
    mail: IQ('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>'),
    phone: IQ('<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>'),
    gta: IQ('<path d="M4 20V9l8-5 8 5v11M9 20v-6h6v6"/>'),
    back: IQ('<path d="M15 6l-6 6 6 6"/>'),
    ok: '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg>',
  };
  const bullets = (items) => `<ul class="cbl">${items.map((x) => `<li>${x}</li>`).join("")}</ul>`;
  const section = (icon, tone, title, body, extra = "") => `<section class="csec"${extra}><h2 class="sech"><span class="isq ${tone}">${SI[icon]}</span><span>${title}</span></h2>${body}</section>`;
  const REQUIRED = [["age", "I am 18 or older."], ["gta", "I live in the Greater Toronto Area."], ["phone", "I'm using, or have access to, a mobile phone for this test."], ["agree", "I've read the above and agree to take part."]];
  const SHORT = { age: "18+", gta: "GTA", phone: "Phone", agree: "I agree" };
  const SYNTH = 'My anonymous answers can be used to create made-up "synthetic" test users that help us test the app. No synthetic user will be a copy of me.';
  const consent = { age: false, gta: false, phone: false, agree: false, synthetic: false };
  let peekObserver = null;

  function introScreen(joining) {
    for (const k of Object.keys(consent)) consent[k] = false;
    document.body.classList.add("on-consent");
    app.innerHTML = `
      <header class="lights"><span class="tag pri">SideQuest study</span><h1 class="hero">Help us test <span class="nb">SideQuest</span></h1></header>
      <p class="intro">SideQuest is a student project for a university course. It helps groups of friends in Toronto find and plan nights out, with a planning assistant called Sidekick.</p>
      ${section("why", "iv", "Why we're doing this", bullets(["To learn whether SideQuest makes planning a night out with friends easier.", "To find out which of two Sidekick voices people prefer.", "To improve the app and finish our class project."]))}
      ${section("todo", "iv", `What you'll be asked to do <span class="sub">(about 20–25 minutes)</span>`, `
        <ol class="tl" aria-label="The four steps">${[["Questions", "2–3 min", "v"], ["Try the app", "5 short tasks", "v"], ["Call 1", "Sidekick", "t"], ["Call 2", "other voice", "t"]].map(([t, s, c], i) => `<li><i class="${c}" aria-hidden="true">${i + 1}</i><span class="tl-t">${t}</span><span class="tl-s">${s}</span></li>`).join("")}</ol>
        ${bullets(["Answer a few short questions about how you usually go out (2–3 minutes).", "Try SideQuest's main features with five short tasks (finding an event, the map, your profile, Squads).", "Try the app: look around, start a plan, and have a short planning call with Sidekick.", "Try a second, shorter call with a different Sidekick voice. This is an A/B test: you won't be told which voice is which.", "Answer a few quick questions about each call."])}`)}
      ${section("invited", "it", "Why you were invited", `<p class="c14">You can take part if you:</p>
        <ul class="elig">${[["<b>18+</b>", "are 18 or older;"], [SI.gta, "live in the Greater Toronto Area;"], [SI.phone, "have a mobile phone you can use for the test."]].map(([i, t]) => `<li><span class="isq it sm" aria-hidden="true">${i}</span><span>${t}</span></li>`).join("")}</ul>`)}
      <div class="cards">
        <section class="ccard"><h2 class="sech sm"><span class="isq iv sm">${SI.collect}</span><span>What we collect</span></h2>${bullets(["Your answers to the questions.", "What you do in the app during the test, such as what you tap, save, plan and pick.", "Your ratings of each call.", "Whether you finished each task, how long it took, and how easy it felt."])}</section>
        <section class="ccard teal"><h2 class="sech sm"><span class="isq it sm">${SI.nope}</span><span>What we don't collect</span></h2>${bullets(["We don't record or keep your voice or call transcripts.", "We don't save your location.", "Your answers are stored with a random code, not your name or email.", "You don't need an account. We set up a private study profile for you, with no name or email, and delete it with your answers."])}</section>
      </div>
      ${section("choices", "iv", "Your choices", bullets(["Taking part is completely voluntary.", "You can skip any question you don't want to answer.", "You can leave or end the session at any time, for any reason.", "If you leave or drop the session before finishing, everything you've shared in this session will be erased.", "If you finish and later want your answers removed sooner, you can submit a request and we'll make sure they aren't included in our study."]))}
      ${section("keep", "ia", "How long we keep it", bullets([`We will automatically delete all study data after <b>${DELETE_DATE}</b>.`, "This includes test accounts made for the study.", "You don't need to do anything."]))}
      ${section("use", "iv", "How we use it", bullets(["Results are only reported as group totals (for example, \"6 in 10 testers preferred Voice 1\").", "We never report one person's answers."]))}
      ${section("mail", "inn", "Questions?", `<p class="c14 contact">Contact Asia at <a href="mailto:${EMAIL}">${EMAIL}</a>.</p>`)}
      <section class="confirm" id="confirm" aria-labelledby="confirmT">
        <h2 id="confirmT" class="confirm-t">Please confirm</h2>
        <div class="boxes">${REQUIRED.map(([k, t]) => `<label class="cb"><input type="checkbox" id="c-${k}" data-consent="${k}"><span>${t} <span class="req">(required)</span></span></label>`).join("")}</div>
        <fieldset class="opt"><legend>Optional</legend><label class="cb"><input type="checkbox" id="c-synthetic" data-consent="synthetic"><span>${esc(SYNTH)} <span class="req">(optional)</span></span></label></fieldset>
        <p class="err" id="consentErr" role="alert" hidden></p>
        <div class="confirm-go">
          <button class="btn pri" type="button" id="start" data-start aria-disabled="true">Start the test</button>
          <a class="btn out" href="/?switch=1" id="notNow">Not now</a>
          <p class="small center">Ticked boxes are stored as yes/no only; where people live is not stored.</p>
        </div>
      </section>
      <div class="peek" id="peek" aria-hidden="true">
        <p class="peek-t"><b>Please confirm</b> · <span id="peekN">0 of 4 required ticked</span></p>
        <div class="peek-pills">${[...REQUIRED.map(([k]) => [k, SHORT[k]]), ["synthetic", "Synthetic data (optional)"]].map(([k, t]) => `<span class="pp" data-pp="${k}"><i></i>${t}</span>`).join("")}</div>
        <div class="peek-go"><button class="btn pri sm" type="button" data-start tabindex="-1" aria-disabled="true">Start the test</button><a class="btn out sm" href="/?switch=1" tabindex="-1">Not now</a></div>
      </div>`;
    app.dataset.joining = joining ? "1" : "";
    syncConsent();
    // Desktop: the compact confirm box stays at the bottom while you read, and steps aside at the real one
    if (peekObserver) peekObserver.disconnect();
    if ("IntersectionObserver" in window) {
      peekObserver = new IntersectionObserver(([e]) => document.getElementById("peek") && document.getElementById("peek").classList.toggle("away", e.isIntersecting), { threshold: 0.05 });
      peekObserver.observe(document.getElementById("confirm"));
    }
  }
  const ticked = () => REQUIRED.filter(([k]) => consent[k]).length;
  function syncConsent() {
    const n = ticked();
    for (const b of document.querySelectorAll("[data-start]")) b.setAttribute("aria-disabled", String(n < 4));
    const peekN = document.getElementById("peekN");
    if (peekN) peekN.textContent = `${n} of 4 required ticked`;
    for (const p of document.querySelectorAll("[data-pp]")) p.classList.toggle("on", consent[p.dataset.pp]);
    const err = document.getElementById("consentErr");
    if (err && n === 4) { err.hidden = true; err.textContent = ""; }
  }
  async function startStudy(btn) {
    if (ticked() < 4) {
      const err = document.getElementById("consentErr");
      err.textContent = "Please tick the four required boxes to start. The optional one is up to you.";
      err.hidden = false;
      const first = REQUIRED.find(([k]) => !consent[k]);
      const box = document.getElementById(`c-${first[0]}`);
      box.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      box.focus({ preventScroll: true });
      return;
    }
    if (btn.dataset.busy) return;
    btn.dataset.busy = "1";
    const joining = app.dataset.joining === "1";
    try {
      const body = { consent: { ...consent } };
      const out = joining ? await api(`/api/sk/study/${encodeURIComponent(sid)}/join`, body) : await api("/api/sk/study/sessions", body);
      sid = out.sid;
      tid = out.tid;
      store.set(`study:${sid}:tid`, tid);
      store.set("study:last", sid);
      history.replaceState(null, "", `/study?s=${encodeURIComponent(sid)}`);
      view = out.view;
      open = null;
      document.body.classList.remove("on-consent");
      if (peekObserver) peekObserver.disconnect();
      render();
      window.scrollTo(0, 0);
    } catch (err) {
      delete btn.dataset.busy;
      toast(err.message);
    }
  }
  app.addEventListener("change", (e) => {
    const k = e.target.dataset && e.target.dataset.consent;
    if (k) { consent[k] = e.target.checked; syncConsent(); }
  });

  // ---------- The End session bar (every study screen until the tester finishes) and its sheet ----------
  const endBar = (where) => `<div class="endbar"><span class="small">SideQuest study · ${esc(where)}</span><button class="end-btn" type="button" id="endSession">End session</button></div>`;
  // A sheet: traps focus, starts on the safe button, closes with Escape, gives focus back
  function sheet({ title, body, safe, danger, onDanger }) {
    const opener = document.activeElement;
    const wrap = document.createElement("div");
    wrap.className = "sheet-wrap study-sheet";
    wrap.innerHTML = `<div class="sheet-scrim" data-close></div>
      <div class="sheet-panel" role="dialog" aria-modal="true" aria-labelledby="sheetT" aria-describedby="sheetB">
        <span class="grab" aria-hidden="true"></span>
        <h2 id="sheetT" class="sheet-t">${title}</h2>
        <div id="sheetB" class="sheet-b">${body}</div>
        <div class="sheet-btns"><button class="btn out safe" type="button" data-close>${safe}</button><button class="btn danger" type="button" data-danger>${danger}</button></div>
      </div>`;
    document.body.appendChild(wrap);
    for (const el of [app, document.querySelector("body > p")]) if (el) el.setAttribute("inert", "");
    const close = () => {
      wrap.remove();
      for (const el of [app, document.querySelector("body > p")]) if (el) el.removeAttribute("inert");
      document.removeEventListener("keydown", onKey, true);
      if (opener && document.contains(opener)) opener.focus();
    };
    const onKey = (e) => {
      if (e.key === "Escape") { e.preventDefault(); close(); return; }
      if (e.key !== "Tab") return;
      const items = [...wrap.querySelectorAll("button:not([disabled])")];
      const i = items.indexOf(document.activeElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); items[items.length - 1].focus(); }
      else if (!e.shiftKey && i === items.length - 1) { e.preventDefault(); items[0].focus(); }
    };
    document.addEventListener("keydown", onKey, true);
    wrap.addEventListener("click", async (e) => {
      if (e.target.closest("[data-close]")) return close();
      const d = e.target.closest("[data-danger]");
      if (!d || d.disabled) return;
      d.disabled = true;
      try { await onDanger(); wrap.remove(); for (const el of [app, document.querySelector("body > p")]) if (el) el.removeAttribute("inert"); document.removeEventListener("keydown", onKey, true); }
      catch (err) { d.disabled = false; toast(err.message); }
    });
    wrap.querySelector(".safe").focus();
  }
  function forgetLocal() {
    appUser.giveBack(view && view.you && view.you.profile); // the study profile is deleted: sign out of it
    if (sid) store.set(`study:${sid}:tid`, null);
    store.set("study:last", null);
    sid = null; tid = null; view = null;
    history.replaceState(null, "", "/study");
  }
  function endSheet() {
    sheet({
      title: "End the session?",
      body: "<p>Everything you've shared in this session will be erased.</p>",
      safe: "Keep going",
      danger: "End and erase",
      onDanger: async () => {
        await post("end");
        forgetLocal();
        app.innerHTML = `<div class="bye"><span class="isq it big" aria-hidden="true">${SI.ok}</span><h1 tabindex="-1" id="byeT">Session ended</h1>
          <p class="muted">Everything you shared in this session has been erased. Thanks for your time.</p>
          <a class="btn out" href="/?switch=1">Back to the start</a></div>`;
        document.getElementById("byeT").focus();
      },
    });
  }

  // ---------- Thank you, Request removal, Request received ----------
  function thanksScreen() {
    app.innerHTML = `
      <header class="lights tall"><span class="isq ok-i big" aria-hidden="true">${SI.ok}</span><h1 class="hero">Thank you!</h1></header>
      ${bullets(["Your answers are saved with a random code.", `We'll automatically delete them after <b>${DELETE_DATE}</b>.`, "Want them gone sooner? Submit a request and we'll make sure they aren't included in our study."])}
      <button class="btn out" type="button" id="requestRemoval">Request removal</button>
      <p class="c13 contact">Questions? <a href="mailto:${EMAIL}">${EMAIL}</a></p>`;
  }
  function removalSheet() {
    sheet({
      title: "Request removal?",
      body: bullets(["Your answers will be taken out of our study results.", "They'll be deleted."]),
      safe: "Cancel",
      danger: "Send request",
      onDanger: async () => {
        const out = await post("remove");
        forgetLocal();
        store.set("study:removed", out.code);
        receivedScreen(out.code);
      },
    });
  }
  function receivedScreen(code) {
    app.innerHTML = `<div class="received">
      <span class="isq it big" aria-hidden="true">${SI.ok}</span>
      <h1 tabindex="-1" id="recvT">Request received</h1>
      ${bullets(["Your answers won't be included in our study.", `Your reference code is #${esc(code)}, in case you contact us.`])}
      <p class="code" id="refCode" aria-label="Reference code ${esc(code.split("").join(" "))}">#${esc(code)}</p>
      <p class="c13 center contact"><a href="mailto:${EMAIL}">${EMAIL}</a></p>
      <a class="btn out" href="/?switch=1" id="doneRemoved">Done</a></div>`;
    document.getElementById("recvT").focus();
  }

  // ---------- The questionnaire: 12 questions as grouped cards, 3 per screen, 4 parts ----------
  // Each card has Skip. Chips are toggle buttons, single answers are native radio groups, the two sliders
  // are native ranges with text values. A part is saved on Continue; anything left blank counts as skipped.
  const VIBE_OPTS = [["live-music", "Live music"], ["comedy", "Comedy"], ["markets", "Markets"], ["board-games", "Board games"], ["dance", "Dance"], ["art-shows", "Art shows"], ["food-pop-ups", "Food pop-ups"], ["theatre", "Theatre"], ["jazz", "Jazz"], ["zines", "Zines"]];
  const SPEND_OPTS = [["under-20", "Under $20"], ["20-40", "$20–40"], ["40-80", "$40–80"], ["80+", "$80+"], ["prefer-not", "Prefer not to say"]];
  const TRAVEL_OPTS = [["15", "15"], ["30", "30"], ["45", "45"], ["60+", "60+"]];
  const Q = {
    q1: { n: 1, text: "How often do you go out in a typical month?", type: "one", style: "seg", opts: [["0", "0"], ["1-2", "1–2"], ["3-4", "3–4"], ["5+", "5+"]] },
    q2: { n: 2, text: "Pick up to 5 kinds of nights you enjoy.", type: "many", max: 5, opts: VIBE_OPTS },
    q3: { n: 3, text: "What's your ideal night like?", type: "scale", lo: "Chill", hi: "Wild", words: ["Very chill", "Mostly chill", "In between", "Mostly wild", "Very wild"] },
    q4: { n: 4, text: "Do you prefer new places or old favourites?", type: "scale", lo: "Favourites", hi: "Something new", words: ["Always favourites", "Mostly favourites", "A mix of both", "Mostly something new", "Always something new"] },
    q5: { n: 5, text: "Which nights usually work for you?", type: "many", max: 7, opts: [["mon", "Mon", "Monday"], ["tue", "Tue", "Tuesday"], ["wed", "Wed", "Wednesday"], ["thu", "Thu", "Thursday"], ["fri", "Fri", "Friday"], ["sat", "Sat", "Saturday"], ["sun", "Sun", "Sunday"]] },
    q6: { n: 6, text: "What time do you like to start?", type: "one", style: "pills", opts: [["before-6", "Before 6"], ["6-8", "6–8 PM"], ["after-8", "After 8"], ["after-10", "After 10"]] },
    q7: { n: 7, text: "How far will you travel for a good night?", type: "one", style: "seg", opts: TRAVEL_OPTS, unit: "minutes" },
    q8: { n: 8, text: "What do you usually spend on a night out?", type: "one", style: "pills", opts: SPEND_OPTS },
    q9: { n: 9, text: "How many people do you usually go out with?", type: "one", style: "seg", opts: [["1", "Just me"], ["2", "2"], ["3-4", "3–4"], ["5+", "5+"]] },
    q10: { n: 10, text: "In your friend group, who usually makes the plan?", type: "one", style: "pills", opts: [["me", "Me"], ["someone-else", "Someone else"], ["we-vote", "We vote"], ["nobody", "Honestly, nobody"]] },
    q11: { n: 11, text: "What most often stops a plan from happening?", type: "one", style: "pills", opts: [["cost", "Cost"], ["timing", "Timing"], ["no-one-decides", "No one decides"], ["too-far", "Too far"], ["nothing-appeals", "Nothing appeals"], ["something-else", "Something else"]] },
    q12: { n: 12, text: "Think about your last night out. What kind was it, roughly what did it cost, and how far did you travel?", type: "parts", hint: "(pick from the lists above)",
      parts: [["kind", "What kind was it?", "pills", [...VIBE_OPTS, ["other", "Other"]]], ["cost", "Roughly what did it cost?", "pills", SPEND_OPTS], ["travel", "How far did you travel?", "seg", TRAVEL_OPTS, "minutes"]] },
  };
  const QPARTS = [["q1", "q2", "q3"], ["q4", "q5", "q6"], ["q7", "q8", "q9"], ["q10", "q11", "q12"]];
  const qa = { answers: {}, skipped: new Set(), part: 1 };

  function radios(name, label, opts, style, value, unit) {
    return `<div class="${style === "seg" ? "segc" : "pills"}" role="radiogroup" aria-labelledby="${label}" style="${style === "seg" ? `grid-template-columns:repeat(${opts.length},minmax(0,1fr))` : ""}">${opts.map(([v, t]) => `<label class="ro"><input type="radio" name="${name}" value="${esc(v)}" ${value === v ? "checked" : ""}><span>${esc(t)}</span></label>`).join("")}</div>${unit ? `<span class="small unit">${unit}</span>` : ""}`;
  }
  function qCard(id) {
    const q = Q[id];
    const skipped = qa.skipped.has(id);
    const v = qa.answers[id];
    let body = "";
    if (q.type === "one") body = radios(id, `${id}-t`, q.opts, q.style, v, q.unit);
    else if (q.type === "many") {
      const list = v || [];
      const full = list.length >= q.max;
      body = `<div class="chips qchips" role="group" aria-labelledby="${id}-t">${q.opts.map(([val, t, full_]) => `<button type="button" class="chip" data-chip="${id}" data-value="${esc(val)}" aria-pressed="${list.includes(val)}" ${full && !list.includes(val) ? 'aria-disabled="true"' : ""} ${full_ ? `aria-label="${full_}"` : ""}>${esc(t)}</button>`).join("")}</div>
        ${q.max < 7 ? `<span class="small count" id="${id}-n" aria-live="polite">${list.length} of ${q.max} picked</span>` : ""}`;
    } else if (q.type === "scale") {
      const touched = typeof v === "number";
      const val = touched ? v : 3;
      body = `<div class="slide"><input type="range" min="1" max="5" step="1" value="${val}" id="${id}-r" data-scale="${id}" aria-labelledby="${id}-t" aria-valuetext="${touched ? q.words[val - 1] : "Not answered yet"}">
        <div class="ends"><span>${q.lo}</span><span>${q.hi}</span></div>
        <p class="slide-v" id="${id}-v">${touched ? esc(q.words[val - 1]) : "Not answered yet. Move the slider to choose."}</p></div>`;
    } else if (q.type === "parts") {
      const o = v || {};
      body = `<p class="small hint12">${q.hint}</p>${q.parts.map(([k, label, style, opts, unit]) => `<p class="sublab" id="${id}-${k}-t">${label}</p>${radios(`${id}-${k}`, `${id}-${k}-t`, opts, style, o[k], unit)}`).join("")}`;
    }
    return `<section class="qc ${skipped ? "skipped" : ""}" id="card-${id}" aria-labelledby="${id}-t">
      <div class="qtop"><span class="qn" aria-hidden="true">Q${q.n}</span><button type="button" class="skipb" data-skip="${id}" aria-pressed="${skipped}" aria-describedby="${id}-t">${skipped ? "Skipped · Undo" : "Skip"}</button></div>
      <h2 class="qt" id="${id}-t"><span class="sr">Question ${q.n}. </span>${esc(q.text)}</h2>
      <div class="qbody" ${skipped ? "inert" : ""}>${body}</div></section>`;
  }
  function questionsScreen() {
    const part = qa.part;
    app.innerHTML = `${endBar("questions")}
      <div class="qhead">${part > 1 ? `<button class="icon-btn" type="button" id="qBack" aria-label="Back to part ${part - 1}">${SI.back}</button>` : '<span class="qspace"></span>'}
        <h1 class="stepl" tabindex="-1" id="qPartT">Part ${part} of 4 · About your nights out</h1><span class="qspace"></span></div>
      <div class="qprog" role="progressbar" aria-label="Questions" aria-valuemin="0" aria-valuemax="4" aria-valuenow="${part}">${[1, 2, 3, 4].map((i) => `<i class="${i <= part ? "on" : ""}"></i>`).join("")}</div>
      ${QPARTS[part - 1].map(qCard).join("")}
      <button class="btn pri" type="button" id="qNext">Continue</button>`;
  }
  // What a part sends: each answer, or "skipped"
  function partAnswers(part) {
    const out = {};
    for (const id of QPARTS[part - 1]) {
      const v = qa.answers[id];
      const empty = v == null || (Array.isArray(v) && !v.length) || (Q[id].type === "parts" && !Object.keys(v).length);
      out[id] = qa.skipped.has(id) || empty ? "skipped" : v;
    }
    return out;
  }
  async function nextPart(btn) {
    btn.disabled = true;
    try {
      view = await post("questionnaire", { part: qa.part, answers: partAnswers(qa.part) });
      if (qa.part < 4) {
        qa.part++;
        questionsScreen();
        window.scrollTo(0, 0);
        document.getElementById("qPartT").focus({ preventScroll: true });
      } else {
        open = null;
        render();
        window.scrollTo(0, 0);
        if (view.you.profile) toast("Thanks. Your private study profile is ready.");
      }
    } catch (err) { btn.disabled = false; toast(err.message); }
  }
  app.addEventListener("input", (e) => {
    const id = e.target.dataset && e.target.dataset.scale;
    if (!id) return;
    const n = Number(e.target.value);
    qa.answers[id] = n;
    e.target.setAttribute("aria-valuetext", Q[id].words[n - 1]);
    document.getElementById(`${id}-v`).textContent = Q[id].words[n - 1];
  });
  app.addEventListener("change", (e) => {
    const t = e.target;
    if (t.type !== "radio" || !/^q\d+/.test(t.name)) return;
    const [id, part] = t.name.split("-");
    if (part) qa.answers[id] = { ...(qa.answers[id] || {}), [part]: t.value };
    else qa.answers[id] = t.value;
  });

  // ---------- The private study profile ----------
  // Made on the server right after the questionnaire: an account with no name or email, two practice friends and a
  // squad. The app reads the signed-in account from localStorage "sq2.user" (the same origin), so the checklist signs
  // it in before each task; an account that was signed in before is put back when the study ends.
  const appUser = {
    get() { try { return localStorage.getItem("sq2.user"); } catch { return null; } },
    use(id) {
      try {
        const was = localStorage.getItem("sq2.user");
        if (was && was !== id && !store.get("study:prevUser")) store.set("study:prevUser", was);
        localStorage.setItem("sq2.user", id);
        sessionStorage.removeItem("sq2.demo");
      } catch {}
    },
    giveBack(id) {
      try {
        if (id && localStorage.getItem("sq2.user") === id) {
          const prev = store.get("study:prevUser");
          if (prev) localStorage.setItem("sq2.user", prev); else localStorage.removeItem("sq2.user");
        }
        localStorage.removeItem("study:prevUser");
        sessionStorage.removeItem("sq2.studyTask");
      } catch {}
    },
  };
  let profileTry = 0;
  async function profileScreen() {
    app.innerHTML = `${endBar("your study profile")}
      <div class="lead-in"><h1>Setting up your study profile…</h1><p class="muted">A private profile with no name or email, two practice friends and a squad.</p></div>`;
    try {
      view = await post("profile");
      render();
    } catch (err) {
      profileTry++;
      if (profileTry < 3) return void setTimeout(profileScreen, 1200);
      app.innerHTML = `${endBar("your study profile")}<div class="lead-in"><h1>Couldn't set up your profile</h1><p class="muted">${esc(err.message)}</p></div>
        <button class="btn pri" type="button" id="profileRetry">Try again</button>`;
    }
  }

  // ---------- The checklist: five tasks, then the two calls ----------
  const TASK_TEXT = {
    1: "Find an event this week you'd actually go to, and save it.",
    2: "Open the event you saved. Find out when it starts, what it costs and how far away it is.",
    3: "Find a place to eat near you that's open late.",
    4: "See what SideQuest thinks your taste is, and change one thing that's wrong.",
    5: "Open your squad, say hi in the chat, then make a new squad with one of your friends.",
  };
  const ROWS = ["task1", "task2", "task3", "task4", "task5", "call1", "call2"];
  const taskN = (step) => (/^task\d$/.test(step) ? Number(step.slice(4)) : null);
  const titleOf = (step) => (taskN(step) ? view.you.tasks[taskN(step)].title : step === "call1" ? "Plan with Sidekick · Voice 1" : "Short call · Voice 2");
  const callLink = (n, room) => `/sk/${encodeURIComponent(room)}?study=${encodeURIComponent(sid)}&v=${n}`;
  const planLink = () => `/sk?study=${encodeURIComponent(sid)}`;
  const mins = (s) => (s == null ? "" : s < 60 ? " · under a minute" : ` · ${Math.round(s / 60)} min`);

  function sub(step) {
    const v = view;
    const n = taskN(step);
    if (n) {
      const t = v.you.tasks[n];
      if (t.done) return t.outcome === "stuck" ? "Moved on" : t.outcome === "skipped" ? "Skipped" : `Done${mins(t.secs)}`;
      if (t.outcome) return "A quick question left";
      return "To do";
    }
    if (v.you.steps[step]) return "Done";
    const c = v.calls[step === "call1" ? 1 : 2];
    if (c.status === "live") return "On a call now";
    if (c.status !== "none") return "4 quick questions left";
    if (step === "call2") return "After Voice 1";
    return ROWS.slice(0, 5).every((r) => v.you.steps[r]) ? "To do" : "After the tasks";
  }
  const done1 = () => view.calls[1].status !== "none" && view.calls[1].status !== "live";
  const firstOpen = () => ROWS.find((s) => !view.you.steps[s]) || null;

  function likert(n) {
    const items = [["natural", "Sidekick felt natural to talk with."], ["decide", "It helped us decide."], ["trust", "I trust the picks it suggested."], ["again", "I'd use it again to plan a night."]];
    const d = draft[n];
    return `<form class="stack" data-survey="${n}"><p class="small">Voice ${n} · 1 = disagree, 5 = agree</p>${items.map(([k, label]) => `
      <div class="likert" role="group" aria-label="${esc(label)}"><p>${esc(label)}</p>
        <div class="rate">${[1, 2, 3, 4, 5].map((x) => `<button type="button" data-q="${k}" data-n="${x}" aria-pressed="${d[k] === x}" aria-label="${x}">${x}</button>`).join("")}</div>
        <div class="ends" aria-hidden="true"><span>Disagree</span><span>Agree</span></div></div>`).join("")}
      <button class="btn pri" type="submit" ${items.every(([k]) => d[k]) ? "" : "disabled"}>Send</button></form>`;
  }

  // ---------- The final questions (a screen of their own, after both calls) ----------
  const USE = [["discover", "Discover"], ["map", "Map"], ["squads", "Squads"], ["plan", "Plan with Sidekick"], ["profile", "Profile"]];
  function finalScreen() {
    const d = draft.final;
    app.innerHTML = `${endBar("last questions")}
      <h1 class="final-t">Last few questions</h1>
      <form class="stack" data-final>
      <div class="likert" role="group" aria-label="Which voice would you keep?"><p>Which voice would you keep?</p>
        <div class="keep">${[1, 2].map((x) => `<button type="button" data-keep="${x}" aria-pressed="${d.keep === x}">Voice ${x}</button>`).join("")}</div></div>
      <label class="f">Why? (optional)<textarea class="in" id="why" maxlength="300" rows="3" placeholder="It sounded…">${esc(d.why)}</textarea></label>
      <div class="likert" role="group" aria-label="Overall, how easy or hard was planning with Sidekick?"><p>Overall, how easy or hard was planning with Sidekick?</p>
        <div class="rate seven">${[1, 2, 3, 4, 5, 6, 7].map((x) => `<button type="button" data-seq="${x}" aria-pressed="${d.seq === x}" aria-label="${x}">${x}</button>`).join("")}</div>
        <div class="ends" aria-hidden="true"><span>Very hard</span><span>Very easy</span></div></div>
      <div class="likert" role="group" aria-label="Which part would you use most?"><p>Which part would you use most?</p>
        <div class="opts">${USE.map(([k, l]) => `<button type="button" data-use="${k}" aria-pressed="${d.use === k}">${esc(l)}</button>`).join("")}</div></div>
      <label class="f">One thing you'd change? (optional)<textarea class="in" id="change" maxlength="300" rows="3">${esc(d.change)}</textarea></label>
      <button class="btn pri" type="submit" ${d.keep && d.seq && d.use ? "" : "disabled"}>Send</button></form>`;
  }

  function callPanel(n) {
    const c = view.calls[n];
    const surveyed = view.you.surveys[n];
    if (surveyed) return `<p class="muted">Thanks. Voice ${n} is done.</p>`;
    if (c.status !== "none" && c.status !== "live") return `<p class="muted">How was Voice ${n}?</p>${likert(n)}`;
    const intro = n === 1
      ? `<ol><li>Testing alone? Tap <b>Add 2 practice friends</b> on the invite card.</li>
          <li>Vote: should Sidekick lead, or sit back while you fill in the plan?</li>
          <li>Answer Sidekick's questions. Say it or tap it. Turn your sound on to hear the voice.</li>
          <li>Add your budget on the private card. Only Sidekick sees it.</li>
          <li>Vote for one of the two picks, then lock the plan.</li></ol>`
      : `<p class="muted">A short second call with a different voice. It takes a question or two, then picks. Tap the round Sidekick button at the bottom any time to get picks.</p>`;
    let action;
    if (c.status === "live") action = c.mine ? `<a class="btn pri" href="${callLink(n, c.room)}">Back to the Voice ${n} call</a>` : `<a class="btn pri" href="${callLink(n, c.room)}">Join the Voice ${n} call</a>`;
    else if (n === 1) action = view.you.creator ? `<a class="btn pri" href="${planLink()}">Open Plan to start</a>` : `<p class="note">Whoever started the study starts this call. Once it's on, a Join button shows here.</p>`;
    else if (!done1()) action = `<p class="note">Do the Voice 1 call first.</p>`;
    else {
      const name = store.get("sk:name") || "";
      action = `${name ? "" : '<label class="f">Your name<input class="in" id="name2" maxlength="24" autocomplete="given-name"></label>'}<button class="btn pri" id="startCall2">Start the Voice 2 call</button>`;
    }
    return intro + action;
  }
  function taskPanel(n) {
    const t = view.you.tasks[n];
    const event = n === 2 && t.event ? `<p class="note">Your saved event: <b>${esc(t.event)}</b></p>` : "";
    if (t.done) return `<p class="muted">${esc(TASK_TEXT[n])}</p>${t.outcome === "skipped" ? `<div class="btns"><button class="btn out" type="button" data-task-start="${n}">Try it now</button></div>` : ""}`;
    return `<p class="task-say">${esc(TASK_TEXT[n])}</p>${event}
      <p class="small">The app opens as your study profile. A bar at the top shows the task, with <b>I'm done</b> and <b>I'm stuck</b>.</p>
      <div class="btns"><button class="btn pri" type="button" data-task-start="${n}">Start</button>
        <button class="linkish center" type="button" data-task-skip="${n}">Skip this task</button></div>`;
  }
  function panel(step) {
    const n = taskN(step);
    if (n) return taskPanel(n);
    return callPanel(step === "call1" ? 1 : 2);
  }

  function render() {
    if (!view) return;
    document.body.classList.remove("on-consent");
    if (!view.you.questionnaire.done) { // right after consent: the questionnaire, from the next part not yet saved
      if (!document.getElementById("qNext")) { qa.part = Math.min(4, view.you.questionnaire.parts + 1); questionsScreen(); }
      return;
    }
    if (!view.you.profile) return void profileScreen(); // then the private study profile (normally made already)
    if (view.you.final) return thanksScreen();
    if (view.you.surveys[1] && view.you.surveys[2]) return finalScreen();
    const doneN = ROWS.filter((s) => view.you.steps[s]).length;
    const next = firstOpen();
    if (open == null) open = next;
    const share = `${location.origin}/study?s=${encodeURIComponent(sid)}`;
    const fresh = !ROWS.some((s) => view.you.steps[s]) && !Object.values(view.you.tasks).some((t) => t.started || t.outcome);
    app.innerHTML = `${endBar("checklist")}
      <div class="prog"><span class="mono-k">Your study · ${doneN} of ${ROWS.length} done</span><h1 class="final-t">Try SideQuest</h1>
        <span class="meter" role="progressbar" aria-label="Study progress" aria-valuemin="0" aria-valuemax="${ROWS.length}" aria-valuenow="${doneN}"><i style="width:${Math.round((doneN / ROWS.length) * 100)}%"></i></span>
        <p class="small">Five short tasks in the app, then two calls with Sidekick. Go in order, or tap any row to open it.</p></div>
      ${fresh ? `<p class="note profile-note"><b>Your private study profile is ready.</b> No name or email. Your squad, Study crew, has two practice friends, Robin and Jules. It's deleted with your answers.</p>` : ""}
      <ol class="steps">${ROWS.map((s) => {
        const isDone = view.you.steps[s];
        const isOpen = open === s;
        const n = taskN(s);
        return `<li class="step ${isDone ? "done" : ""} ${s === next && !isDone ? "now" : ""} ${n ? "" : "callrow"}" id="step-${s}">
          <button class="step-h" data-step="${s}" aria-expanded="${isOpen}" aria-controls="panel-${s}">
            <span class="num ${n ? "" : "orbk"}">${isDone ? ICON.check : n || ""}</span>
            <span class="step-t"><b>${esc(titleOf(s))}</b><span class="small">${esc(sub(s))}</span></span>${ICON.chev}</button>
          ${isOpen ? `<div class="panel" id="panel-${s}">${panel(s)}</div>` : ""}</li>`;
      }).join("")}</ol>
      <div class="foot">
        <p class="small">Testing with friends? Send them this link so they can follow along and answer too.</p>
        <div class="row"><input class="in" readonly value="${esc(share)}" aria-label="Study link" style="font-size:13px"><button class="btn sm out" id="copyStudy">Copy</button></div>
        <button class="linkish" id="restart" type="button">Start over as a new crew</button>
      </div>`;
    afterTask();
  }

  // ---------- After a task: task 2's two questions, then "How easy was that?" ----------
  let taskSheetOpen = false;
  function afterTask() {
    if (taskSheetOpen) return;
    const n = [1, 2, 3, 4, 5].find((k) => view.you.tasks[k].needsQuiz || view.you.tasks[k].needsEase);
    if (!n) return;
    if (view.you.tasks[n].needsQuiz) quizSheet(n);
    else easeSheet(n);
  }
  // A sheet that must be answered: traps focus, makes the page behind it inert, gives focus back when it closes
  function taskSheet(html, onReady) {
    taskSheetOpen = true;
    const opener = document.activeElement;
    const wrap = document.createElement("div");
    wrap.className = "sheet-wrap study-sheet task-sheet";
    wrap.innerHTML = `<div class="sheet-scrim"></div><div class="sheet-panel" role="dialog" aria-modal="true" aria-labelledby="tsT">${html}</div>`;
    document.body.appendChild(wrap);
    for (const el of [app, document.querySelector("body > p")]) if (el) el.setAttribute("inert", "");
    const onKey = (e) => {
      if (e.key !== "Tab") return;
      const items = [...wrap.querySelectorAll("button:not([disabled]), textarea, input")];
      const i = items.indexOf(document.activeElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); items[items.length - 1].focus(); }
      else if (!e.shiftKey && i === items.length - 1) { e.preventDefault(); items[0].focus(); }
    };
    document.addEventListener("keydown", onKey, true);
    const close = () => {
      wrap.remove();
      for (const el of [app, document.querySelector("body > p")]) if (el) el.removeAttribute("inert");
      document.removeEventListener("keydown", onKey, true);
      taskSheetOpen = false;
      if (opener && document.contains(opener)) opener.focus();
    };
    onReady(wrap, close);
    const first = wrap.querySelector("button");
    if (first) first.focus();
  }
  const opt = (name, value, label, on) => `<button type="button" data-${name}="${esc(value)}" aria-pressed="${on}">${esc(label)}</button>`;
  async function quizSheet(n) {
    let qz;
    try { qz = await api(`/api/sk/study/${encodeURIComponent(sid)}/quiz?t=${encodeURIComponent(tid)}`); } catch (err) { toast(err.message); return; }
    if (taskSheetOpen) return;
    const pick = { time: null, cost: null };
    taskSheet(`<span class="grab" aria-hidden="true"></span>
      <span class="mono-k">Task ${n} · quick check</span>
      <h2 class="sheet-t" id="tsT">What time does it start?</h2>
      <div class="opts" role="group" aria-labelledby="tsT">${qz.time.map((x) => opt("qtime", x, x, false)).join("")}</div>
      <h2 class="sheet-t" id="tsC">Roughly what does it cost?</h2>
      <div class="opts" role="group" aria-labelledby="tsC">${qz.cost.map((x) => opt("qcost", x, x, false)).join("")}</div>
      <button class="btn pri" type="button" id="quizNext" disabled>Next</button>
      <p class="small center">About ${esc(qz.event.title)}. There's no score: it checks whether the page is clear.</p>`, (wrap, close) => {
      wrap.addEventListener("click", async (e) => {
        const b = e.target.closest("[data-qtime],[data-qcost]");
        if (b) {
          const k = b.dataset.qtime != null ? "time" : "cost";
          pick[k] = b.dataset[k === "time" ? "qtime" : "qcost"];
          for (const x of wrap.querySelectorAll(`[data-q${k}]`)) x.setAttribute("aria-pressed", String(x === b));
          wrap.querySelector("#quizNext").disabled = !(pick.time && pick.cost);
          return;
        }
        const go = e.target.closest("#quizNext");
        if (!go || go.disabled) return;
        go.disabled = true;
        try { view = await post("quiz", pick); close(); render(); }
        catch (err) { go.disabled = false; toast(err.message); }
      });
    });
  }
  function easeSheet(n) {
    const t = view.you.tasks[n];
    const last = [1, 2, 3, 4, 5].every((k) => k === n || view.you.tasks[k].done);
    let ease = null;
    taskSheet(`<span class="grab" aria-hidden="true"></span>
      <span class="mono-k ${t.outcome === "stuck" ? "" : "ok"}">${t.outcome === "stuck" ? `Task ${n} · moving on` : `${ICON.check} Task ${n} done`}</span>
      <h2 class="sheet-t" id="tsT">How easy was that?</h2>
      <div class="rate seven" role="group" aria-labelledby="tsT">${[1, 2, 3, 4, 5, 6, 7].map((x) => `<button type="button" data-ease="${x}" aria-pressed="false" aria-label="${x}">${x}</button>`).join("")}</div>
      <div class="ends" aria-hidden="true"><span>Very hard</span><span>Very easy</span></div>
      <label class="f">Anything get in the way? (optional)<textarea class="in" id="easeWhy" maxlength="300" rows="2"></textarea></label>
      <button class="btn pri" type="button" id="easeNext" disabled>${last ? "Back to the checklist" : "Next task"}</button>`, (wrap, close) => {
      wrap.addEventListener("click", async (e) => {
        const b = e.target.closest("[data-ease]");
        if (b) {
          ease = Number(b.dataset.ease);
          for (const x of wrap.querySelectorAll("[data-ease]")) x.setAttribute("aria-pressed", String(x === b));
          wrap.querySelector("#easeNext").disabled = false;
          return;
        }
        const go = e.target.closest("#easeNext");
        if (!go || go.disabled) return;
        go.disabled = true;
        try {
          view = await post("taskRate", { n, ease, comment: wrap.querySelector("#easeWhy").value });
          close();
          open = null;
          render();
          toast("Thanks, saved.");
        } catch (err) { go.disabled = false; toast(err.message); }
      });
    });
  }
  async function startTask(n, btn) {
    btn.disabled = true;
    try {
      view = await post("task", { n, start: true });
      appUser.use(view.you.profile);
      sessionStorage.setItem("sq2.studyTask", JSON.stringify({ sid, n, title: view.you.tasks[n].title, flags: {} }));
      location.href = `/?study=${encodeURIComponent(sid)}`;
    } catch (err) { btn.disabled = false; toast(err.message); }
  }

  // ---------- Taps ----------
  app.addEventListener("click", async (e) => {
    const t = e.target;
    const go = t.closest("[data-start]");
    if (go) { startStudy(go); return; }
    if (t.closest("#endSession")) { endSheet(); return; }
    if (t.closest("#requestRemoval")) { removalSheet(); return; }
    if (t.closest("#doneRemoved")) { store.set("study:removed", null); return; }
    const chip = t.closest("[data-chip]");
    if (chip) {
      const id = chip.dataset.chip;
      const list = qa.answers[id] || [];
      const v = chip.dataset.value;
      if (list.includes(v)) qa.answers[id] = list.filter((x) => x !== v);
      else if (list.length >= Q[id].max) { toast(`Pick up to ${Q[id].max}.`); return; }
      else qa.answers[id] = [...list, v];
      const now = qa.answers[id];
      const card = document.getElementById(`card-${id}`);
      for (const c of card.querySelectorAll("[data-chip]")) {
        const on = now.includes(c.dataset.value);
        c.setAttribute("aria-pressed", String(on));
        if (!on && now.length >= Q[id].max) c.setAttribute("aria-disabled", "true"); else c.removeAttribute("aria-disabled");
      }
      const count = document.getElementById(`${id}-n`);
      if (count) count.textContent = `${now.length} of ${Q[id].max} picked`;
      return;
    }
    const skip = t.closest("[data-skip]");
    if (skip) {
      const id = skip.dataset.skip;
      if (qa.skipped.has(id)) qa.skipped.delete(id); else qa.skipped.add(id);
      document.getElementById(`card-${id}`).outerHTML = qCard(id);
      document.querySelector(`[data-skip="${id}"]`).focus();
      return;
    }
    if (t.closest("#qNext")) { nextPart(t.closest("#qNext")); return; }
    if (t.closest("#qBack")) { qa.part = Math.max(1, qa.part - 1); questionsScreen(); document.getElementById("qPartT").focus(); return; }
    if (t.closest("#profileRetry")) { profileTry = 0; profileScreen(); return; }
    const ts = t.closest("[data-task-start]");
    if (ts) { startTask(Number(ts.dataset.taskStart), ts); return; }
    const sk = t.closest("[data-task-skip]");
    if (sk) {
      sk.disabled = true;
      try { view = await post("task", { n: Number(sk.dataset.taskSkip), outcome: "skipped" }); open = null; render(); }
      catch (err) { sk.disabled = false; toast(err.message); }
      return;
    }
    const use = t.closest("[data-use]");
    if (use) { draft.final.use = use.dataset.use; finalScreen(); return; }
    const head = t.closest("[data-step]");
    if (head) {
      open = open === head.dataset.step ? "" : head.dataset.step;
      history.replaceState(null, "", `/study?s=${encodeURIComponent(sid)}${open ? `#${open}` : ""}`);
      render();
      const el = document.getElementById(`step-${head.dataset.step}`);
      if (el && open) el.scrollIntoView({ block: "nearest" });
      return;
    }
    const rate = t.closest(".rate button");
    if (rate) {
      const form = rate.closest("form");
      if (form.dataset.survey) { draft[form.dataset.survey][rate.dataset.q] = Number(rate.dataset.n); render(); }
      else { draft.final.seq = Number(rate.dataset.seq); finalScreen(); }
      return;
    }
    const keep = t.closest("[data-keep]");
    if (keep) { draft.final.keep = Number(keep.dataset.keep); finalScreen(); return; }
    if (t.closest("#startCall2")) {
      const input = document.getElementById("name2");
      const name = (input ? input.value : store.get("sk:name") || "").trim();
      if (!name) return toast("Add your name first.");
      t.disabled = true;
      try {
        const out = await post("call", { n: 2, name, crew: store.get("sk:crew") || "The crew" });
        store.set("sk:name", name);
        if (out.person) store.set(`sk:${out.room}`, { person: out.person, mode: "voice" });
        location.href = callLink(2, out.room);
      } catch (err) { t.disabled = false; toast(err.message); }
      return;
    }
    if (t.closest("#copyStudy")) {
      const text = `${location.origin}/study?s=${encodeURIComponent(sid)}`;
      try { await navigator.clipboard.writeText(text); toast("Study link copied."); } catch { toast(text); }
      return;
    }
    if (t.closest("#restart")) {
      if (!confirm("Start a new study as a new crew? This checklist stays as it is.")) return;
      store.set("study:last", null);
      sid = null;
      tid = null;
      view = null;
      history.replaceState(null, "", "/study");
      introScreen(false);
    }
  });
  app.addEventListener("input", (e) => {
    if (e.target.id === "why") draft.final.why = e.target.value;
    if (e.target.id === "change") draft.final.change = e.target.value;
  });
  app.addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.target;
    const btn = form.querySelector("[type=submit]");
    btn.disabled = true;
    try {
      if (form.dataset.survey) view = await post("survey", { n: Number(form.dataset.survey), ...draft[form.dataset.survey] });
      else {
        view = await post("final", { keep: draft.final.keep, seq: draft.final.seq, why: draft.final.why, use: draft.final.use, change: draft.final.change });
        appUser.giveBack(view.you.profile); // done with the app as the study profile
        window.scrollTo(0, 0);
      }
      open = firstOpen();
      render();
      toast("Thanks, saved.");
    } catch (err) { btn.disabled = false; toast(err.message); }
  });

  // ---------- Staying current while a call runs on another phone ----------
  async function refresh() {
    if (!sid || !tid) return;
    try {
      const next = await api(`/api/sk/study/${encodeURIComponent(sid)}?t=${encodeURIComponent(tid)}`);
      if (JSON.stringify(next) !== JSON.stringify(view)) {
        const first = !view;
        const typing = document.activeElement && ["why", "change"].includes(document.activeElement.id);
        const onQuestions = !next.you.questionnaire.done; // the questionnaire keeps what's picked
        const onFinal = view && view.you.surveys[1] && view.you.surveys[2] && !view.you.final && next.you.surveys[1] && next.you.surveys[2] && !next.you.final; // so do the last questions
        view = next;
        if (first || (!typing && !onQuestions && !onFinal && !taskSheetOpen && next.you.profile)) render();
      }
    } catch (err) {
      if (err.status === 403) { store.set(`study:${sid}:tid`, null); tid = null; introScreen(true); }
      if (err.status === 404) { store.set("study:last", null); sid = null; tid = null; view = null; history.replaceState(null, "", "/study"); introScreen(false); toast("That study link has expired. Start a new one."); }
    }
  }
  setInterval(() => { if (document.visibilityState === "visible") refresh(); }, 4000);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") refresh(); });

  // ---------- Start ----------
  // Arriving from the app's "Testing" choice (its zoom into the city lights): the rows fade in, once
  try {
    if (sessionStorage.getItem("sq2.arrive") === "zoom") {
      sessionStorage.removeItem("sq2.arrive");
      document.documentElement.classList.add("arrive");
      setTimeout(() => document.documentElement.classList.remove("arrive"), 2000);
    }
  } catch {}
  const removed = store.get("study:removed");
  if (removed && !params.get("s")) receivedScreen(removed);
  else if (!sid) introScreen(false);
  else if (!tid) introScreen(true);
  else refresh().then(() => { if (!view && tid) introScreen(false); });
})();
