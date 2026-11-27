// Sidekick planning call (front end). One page for three steps:
//   /sk          the Plan tab: an intro, then who / when / how, then the call or "Form sent" (section 0);
//                the one-page start screen (picks candidate nights) for the voice study and /sk?quick=1
//   /sk/:room    a friend joins: name, private card, then voice, text or form
//   (in the call) the plan board with the current question card, captions, picks, vote, lock, survey
// Voice uses the browser's own speech recognition (Chrome, Edge, Safari); everyone can type instead.
// Optional in-app audio (WebRTC, phone to phone, 2 to 6 people) lets friends who aren't together hear
// each other; the server only passes the connection messages along.
(() => {
  const app = document.getElementById("app");
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  let roomId = location.pathname.split("/")[2] || null;
  const IOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const MOBILE = IOS || /Android/i.test(navigator.userAgent);
  const params = new URLSearchParams(location.search);
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };
  // The voice study (/study): a study call starts through the study (which picks the voice), offers
  // practice friends, and sends people back to the study checklist at the end. Testers only see "Voice 1/2".
  const STUDY = params.get("study");
  const STUDY_V = params.get("v") || "1";
  const studyApi = (action, body) => api(`/api/sk/study/${encodeURIComponent(STUDY)}/${action}`, { t: store.get(`study:${STUDY}:tid`), ...body });
  const ICON = {
    mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>',
    down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>',
    chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.6A8 8 0 1 1 21 12z"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    micOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 11.5 5.4M19 11c0 .7-.1 1.4-.3 2M12 18v3M4 4l16 16"/></svg>',
    send: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    lock: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
    invite: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0M19 8v6M16 11h6"/></svg>',
    speaker: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/></svg>',
    pin: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>',
    ticket: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-2a2 2 0 0 0 0-4z"/><path d="M14 6v12" stroke-dasharray="2 2.5"/></svg>',
    mappin: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>',
  };
  const PRIVATE_OPTS = {
    budget: [["20", "Under $20"], ["30", "Under $30"], ["50", "Under $50"], ["any", "Doesn't matter"]],
    origin: [["union", "Union"], ["finch", "Finch"], ["kennedy", "Kennedy"], ["kipling", "Kipling"]],
    nos: [["West End", "West End"], ["Downtown", "Downtown"], ["East End", "East End"], ["North York", "North York"], ["Scarborough", "Scarborough"], ["Etobicoke", "Etobicoke"]],
    time: [["early", "Afternoon"], ["evening", "After 6"], ["late", "After 8"]],
    vibe: [["music", "Live music"], ["comedy", "Comedy"], ["games", "Games & social"], ["dance", "Dancing"], ["arts", "Art & film"]],
  };

  let toastTimer;
  function toast(msg) {
    const t = document.getElementById("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 2600);
  }
  // "Closes Thu 9 PM": a form's deadline, in this phone's time
  function closesLabel(ms) {
    const d = new Date(ms);
    return `${d.toLocaleDateString("en-CA", { weekday: "short" })} ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).replace(":00", "")}`;
  }
  async function api(path, body) {
    const res = await fetch(path, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {});
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error || "Something went wrong. Try again in a moment."), { status: res.status, data });
    return data;
  }

  // iPhones only play speech after a tap. The first tap (Start, Join, or anything) speaks a silent
  // empty line, which unlocks Sidekick's read-aloud for the rest of the call.
  let unlocked = false;
  function unlockAudio() {
    if (unlocked || !("speechSynthesis" in window)) return;
    unlocked = true;
    try { const u = new SpeechSynthesisUtterance(""); u.volume = 0; speechSynthesis.speak(u); } catch {}
    Tts.unlock(); // and the audio element that plays Sidekick's ElevenLabs voice
  }
  for (const ev of ["touchend", "click", "keydown"]) document.addEventListener(ev, unlockAudio, { capture: true, passive: true });

  function copyText(text, done) {
    const fallback = () => {
      const t = document.createElement("textarea");
      t.value = text;
      t.setAttribute("readonly", "");
      t.style.cssText = "position:fixed;opacity:0";
      document.body.appendChild(t);
      t.select();
      let ok = false;
      try { ok = document.execCommand("copy"); } catch {}
      t.remove();
      toast(ok ? done : text);
    };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(() => toast(done), fallback);
    else fallback();
  }
  const chip = (group, value, label, on, extra = "") => `<button type="button" class="chip" data-group="${group}" data-value="${esc(value)}" aria-pressed="${on}">${esc(label)}${extra}</button>`;
  // Chip groups: data-multi on the container makes them toggle; otherwise one at a time
  app.addEventListener("click", (e) => {
    const c = e.target.closest(".chips .chip");
    if (!c || c.classList.contains("other")) return;
    const g = c.closest(".chips");
    if (g.hasAttribute("data-multi")) c.setAttribute("aria-pressed", c.getAttribute("aria-pressed") !== "true");
    else g.querySelectorAll(".chip").forEach((x) => x.setAttribute("aria-pressed", x === c));
  });
  // "+ Something else…": the vibe chips are suggestions; this opens a text box whose words go into "want", the same
  // as saying it on the call ("Chinese skewers", "rooftop patio"). send: an Add button that sends it straight away
  // (the call's cards); without it the words go with the form.
  const other = { open: false, draft: "" };
  function otherHTML(send = false) {
    return `<button type="button" class="chip other" id="vibeOther" aria-expanded="${other.open}" aria-controls="vibeOtherBox">+ Something else…</button>
      <div class="vibe-other-wrap stack" id="vibeOtherBox" ${other.open ? "" : "hidden"} style="width:100%;gap:6px"><label class="small" for="vibeOtherIn">What are you in the mood for?</label>
      <div class="vibe-other"><input class="in" id="vibeOtherIn" maxlength="60" autocomplete="off" enterkeyhint="${send ? "send" : "done"}" placeholder="e.g. Chinese skewers" value="${esc(other.draft)}">${send ? '<button type="button" class="btn sm pri" id="vibeOtherAdd">Add</button>' : ""}</div></div>`;
  }
  document.addEventListener("click", (e) => {
    const b = e.target.closest("#vibeOther");
    if (!b) return;
    other.open = !other.open;
    b.setAttribute("aria-expanded", other.open);
    const box = document.getElementById("vibeOtherBox");
    if (box) box.hidden = !other.open;
    if (other.open) { const i = document.getElementById("vibeOtherIn"); if (i) i.focus(); }
  });
  document.addEventListener("input", (e) => { if (e.target.id === "vibeOtherIn") other.draft = e.target.value; });
  // Typing on the call (the keyboard is up): the stage folds away so the card and its text box stay in view
  const compact = () => { const box = document.querySelector("#body #vibeOtherBox"); document.body.classList.toggle("sk-compact", Boolean((box && !box.hidden) || (document.activeElement && document.activeElement.closest && document.activeElement.closest("#body input")))); };
  document.addEventListener("click", () => setTimeout(compact));
  document.addEventListener("focusin", compact);
  document.addEventListener("focusout", () => setTimeout(compact));
  const picked = (name) => [...app.querySelectorAll(`.chips[data-name="${name}"] .chip[aria-pressed=true]`)].map((c) => c.dataset.value);

  // ---------- Starting from: my location by default ----------
  // "Use my location" is preselected on the start screen and the join card. The browser is only asked
  // when the person taps Start, Join or Send; never on page load. Denied, timed out (8 s) or no
  // geolocation: Union is selected with a short note, no error. If location is already blocked for
  // this site (no prompt can show), Union is selected as the page opens. The phone rounds the point to
  // about 1 km before sending it; the crew only ever sees a neighbourhood.
  const HAS_GEO = "geolocation" in navigator;
  const GEO_WHY = "Sidekick uses it to find spots near you. Your friends only see your neighbourhood.";
  const GEO_NONE = "Location isn't available here, so you're starting from Union. Change it if another station is closer.";
  const GEO_OFF = "Couldn't get your location, so you're starting from Union. Change it if another station is closer.";
  const GEO_BLOCKED = "Location is off for this site, so you're starting from Union. Change it if another station is closer.";
  let geoState = null; // the browser's permission state, when it can tell us without asking
  function originPicker() {
    const here = HAS_GEO ? `<button type="button" class="chip" data-group="origin" data-value="here" aria-pressed="true">${ICON.pin}Use my location</button>` : "";
    return `<div class="stack" id="originBox"><p style="font-weight:600" id="originLabel">Starting from</p>
      <div class="chips" data-name="origin" role="group" aria-labelledby="originLabel">${here}${PRIVATE_OPTS.origin.map(([v, l]) => chip("origin", v, l, !HAS_GEO && v === "union")).join("")}</div>
      <p class="small geo-note${HAS_GEO ? "" : " fallback"}" id="originNote" role="status">${HAS_GEO ? GEO_WHY : GEO_NONE}</p></div>`;
  }
  function originFallback(text) {
    app.querySelectorAll('.chips[data-name="origin"] .chip').forEach((x) => x.setAttribute("aria-pressed", x.dataset.value === "union"));
    const note = document.getElementById("originNote");
    if (note) { note.textContent = text; note.classList.add("fallback"); }
    // Step 3 folds the stations under one line: open them, so the note and the choice show
    const w = document.getElementById("originWrap");
    if (w) { w.hidden = false; const c = document.getElementById("pfLocChange"); if (c) c.setAttribute("aria-expanded", "true"); }
    if (typeof locLine === "function") locLine();
  }
  // After the picker is on screen: reading the permission state never shows a prompt
  function initOrigin() {
    if (!HAS_GEO || !navigator.permissions || !navigator.permissions.query) return;
    navigator.permissions.query({ name: "geolocation" }).then((s) => {
      geoState = s.state;
      if (s.state === "denied" && picked("origin")[0] === "here") originFallback(GEO_BLOCKED);
    }).catch(() => {});
  }
  // The note under the chips follows the choice: why we ask (location) or nothing (a station)
  app.addEventListener("click", (e) => {
    const c = e.target.closest('.chips[data-name="origin"] .chip');
    const note = document.getElementById("originNote");
    if (!c || !note) return;
    note.textContent = c.dataset.value === "here" ? GEO_WHY : "";
    note.classList.remove("fallback");
  });
  function getLocation() {
    return new Promise((resolve) => {
      if (!HAS_GEO) return resolve(null);
      let done = false;
      const finish = (v) => { if (!done) { done = true; clearTimeout(timer); resolve(v); } };
      const timer = setTimeout(() => finish(null), 8000);
      const r2 = (n) => Math.round(n * 100) / 100;
      try {
        navigator.geolocation.getCurrentPosition((p) => finish({ lat: r2(p.coords.latitude), lng: r2(p.coords.longitude) }), () => finish(null), { timeout: 8000, maximumAge: 600000, enableHighAccuracy: false });
      } catch { finish(null); }
    });
  }
  // What to send for "Starting from": a station, or { lat, lng }. Null means the person said no at the
  // prompt (or it took too long): Union is now selected with a note, so they can check it and tap again.
  async function originAnswer(btn) {
    const v = picked("origin")[0];
    if (v !== "here") return v || null;
    if (geoState === "denied") { originFallback(GEO_BLOCKED); return "union"; } // blocked already: no prompt, nothing to wait for
    const label = btn.textContent;
    const note = document.getElementById("originNote");
    btn.disabled = true;
    btn.textContent = "Finding your neighbourhood…";
    if (note) note.textContent = GEO_WHY;
    const asked = Date.now();
    const at = await getLocation();
    btn.disabled = false;
    btn.textContent = label;
    if (at) return at;
    // Refused faster than anyone could answer a prompt: the browser said no on its own (settings or
    // policy), so there's nothing to check. Carry on from Union, quietly.
    if (Date.now() - asked < 400) { originFallback(GEO_BLOCKED); return "union"; }
    originFallback(GEO_OFF);
    return null;
  }

  // ---------- 1. Start a call ----------
  async function startScreen() {
    let nights = [];
    let voiceAgent = false; // ElevenLabs is set up and under its minute cap
    try { ({ nights, voiceAgent } = await api("/api/sk/nights")); } catch (err) { toast(err.message); }
    const autoAgent = Boolean(voiceAgent) && !STUDY;
    if (autoAgent) loadEL().catch(() => {}); // fetch the SDK now, so the Start tap doesn't wait for it
    const weekend = nights.filter((n) => n.events > 0 && /^(Fri|Sat)/.test(n.label));
    const defaults = (weekend.length ? weekend : nights.filter((n) => n.events > 0)).slice(0, 2).map((n) => n.date);
    app.innerHTML = `
      <div class="row sb"><span class="tag pri">Plan with Sidekick</span><span class="orb"></span></div>
      <h1>Start a planning call</h1>
      <p class="muted">Sidekick listens, keeps track of what everyone wants, and suggests two picks. Your crew decides.</p>
      <label class="f">Your name<input class="in" id="name" autocomplete="given-name" maxlength="24" value="${esc(store.get("sk:name") || "")}"></label>
      <label class="f">Crew name<input class="in" id="crew" maxlength="40" placeholder="Sat squad" value="${esc(store.get("sk:crew") || "")}"></label>
      <div class="stack"><p style="font-weight:600">Which nights could work?</p>
        <div class="chips" data-name="nights" data-multi>${nights.map((n) => chip("nights", n.date, n.label, defaults.includes(n.date), ` <small>${n.events}</small>`)).join("") || '<p class="small">No nights found.</p>'}</div>
        <p class="small">The number is how many events are listed that night.</p></div>
      ${originPicker()}
      <button class="btn pri" id="go">Start the call</button>`;
    initOrigin();
    document.getElementById("go").onclick = async (e) => {
      const name = document.getElementById("name").value.trim();
      const crew = document.getElementById("crew").value.trim() || "The crew";
      const chosen = picked("nights");
      if (!name) return toast("Add your name so your crew knows who's planning.");
      if (!chosen.length) return toast("Pick at least one night.");
      unlockAudio();
      if (autoAgent) primeAgentAudio(); // the microphone prompt comes from this tap
      const origin = await originAnswer(e.target);
      if (!origin) return; // no location: Union is now selected, with a note; the next tap starts
      e.target.disabled = true;
      try {
        const out = STUDY ? await studyApi("call", { n: 1, name, crew, nights: chosen }) : await api("/api/sk/rooms", { name, crew, nights: chosen, persona: params.get("persona") || undefined, user: userId() || undefined });
        if (out.join) { location.href = `/sk/${out.room}?study=${encodeURIComponent(STUDY)}&v=1`; return; } // someone in the crew already started it
        store.set("sk:name", name);
        store.set("sk:crew", crew);
        roomId = out.room;
        me = { person: out.person, mode: "voice" };
        store.set(`sk:${roomId}`, me);
        await api(`/api/sk/rooms/${roomId}/answer`, { p: me.person, slot: "origin", value: origin, source: "start" }).catch(() => {});
        // Stay on this page (no reload), so the tap that unlocked audio on iPhones still counts
        history.pushState(null, "", `/sk/${roomId}${STUDY ? `?study=${encodeURIComponent(STUDY)}&v=${out.n || 1}` : ""}`);
        connect();
        // Sidekick's natural voice starts on this same tap: no second button to find. Without it, the
        // captions mic starts instead, so the planner is never silently muted.
        if (autoAgent) startAgent({ auto: true });
        else startMic();
      } catch (err) {
        e.target.disabled = false;
        toast(err.message);
      }
    };
  }

  // ---------- 0. The Plan tab: the orb grows into the flow, one step at a time (design: approve.html, Plan) ----------
  // Tap Plan: the orb grows from the tab bar's orb to fill the screen (about 0.6 s), then 1 Who's coming? (a squad,
  // Sidequesters, or a link) -> 2 Which nights work? (a 3-week calendar: brighter nights mean more of the crew is free)
  // -> 3 How do you want to decide? (a call, or a quick form) -> the call, or "Form sent". No app tab bar from the first
  // step until the call ends; a labelled ✕ Exit top right (it asks first once something's been picked) and ‹ back
  // from step 2. Leaving plays the orb backwards. Signed out (or the demo account), the people are the sample friends
  // and squads. /sk?squad=<id> starts on step 2 with that squad picked. The voice study and /sk?quick=1 keep the
  // one-page start screen.
  const PF = {
    back: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>',
    squad: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3.5"/><path d="M3 20a6 6 0 0 1 12 0M16 4.5a3.5 3.5 0 0 1 0 7M21 20a6 6 0 0 0-4-5.6"/></svg>',
    person: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',
    link: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>',
    check: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg>',
    bigcheck: '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg>',
    form: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 7h14M5 12h14M5 17h9"/></svg>',
    share: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12M7 8l5-5 5 5M5 13v7h14v-7"/></svg>',
    search: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6"/><path d="M20 20l-4-4"/></svg>',
    home: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M4 11l8-7 8 7v9h-5v-6h-6v6H4z"/></svg>',
    ticket: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M4 8a2 2 0 0 0 2-2h12a2 2 0 0 0 2 2v8a2 2 0 0 0-2 2H6a2 2 0 0 0-2-2z"/></svg>',
  };
  const PF_COLOURS = ["c2", "c1", "c3", "c4", "c5", "c0"];
  const ss = {
    get(k) { try { return sessionStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { sessionStorage.setItem(k, v); } catch {} },
  };
  const flow = { step: null, data: null, path: null, squad: null, friends: [], search: "", nights: [], nightsSet: false, how: "call", room: null, voiceAgent: false, crew: "", pick: null, calls: [], deadline: null, noLearn: false, touched: false, reveal: false, tapFree: new Map(), freeTimer: null };
  const userId = () => { try { return localStorage.getItem("sq2.user") || null; } catch { return null; } };
  const wide = () => window.matchMedia("(min-width: 900px)").matches;
  const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  // Inside the minimized call's frame (the app opened over a live call): the parent page holds the call
  const inFrame = (() => { try { return window.parent !== window && Boolean(window.parent.document.getElementById("returnCall")); } catch { return false; } })();
  const pfOn = (on) => {
    if (on) callNav(false);
    document.body.classList.toggle("pf-mode", on);
    document.documentElement.style.setProperty("--dock-h", "0px");
  };

  // Photos: every crew gets one of the app's photos, the same one every time (by its name), in violet duotone
  const PHOTOS = ["cheers", "beer-garden", "string-lights", "lanterns", "jazz-band", "sax", "performer", "hall", "dragon-boat", "pinwheels"];
  const crewPhoto = (name) => {
    let h = 0;
    for (const c of String(name || "crew").toLowerCase()) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return `/assets/photos/${PHOTOS[h % PHOTOS.length]}.jpg`;
  };
  const photoHTML = (name, cls = "") => `<span class="duo ${cls}" style="background-image:url('${crewPhoto(name)}')" aria-hidden="true"></span>`;

  // ----- The orb transition -----
  // In: the orb sits where the tab bar's orb was, then grows to fill the screen (0.6 s), and the first step fades in
  // over it. Out: the step fades, the orb shrinks back into the tab bar, then the app opens. A View Transition where
  // the browser has one (the orb's transform animates between its two states), else a scaling circle (Web
  // Animations); transform and opacity only. Reduced motion (and computers, where there's no tab-bar orb): a fade.
  // window.__skOrb logs each run for the tests.
  window.__skOrb = window.__skOrb || [];
  const ORB_MS = 600;
  function orbEl() {
    let o = document.getElementById("pfOrbX");
    if (!o) {
      o = document.createElement("div");
      o.id = "pfOrbX";
      o.className = "pf-orbx";
      o.setAttribute("aria-hidden", "true");
      document.body.appendChild(o);
    }
    // Big enough to cover the farthest corner from the tab bar's orb (50 px wide, its centre 54 px from the bottom)
    const cx = innerWidth / 2, cy = innerHeight - 54;
    o.style.setProperty("--orb-s", String(Math.ceil((2 * Math.hypot(Math.max(cx, innerWidth - cx), Math.max(cy, innerHeight - cy))) / 50 * 1.04)));
    return o;
  }
  const orbMode = () => (reduced() || wide() ? "fade" : document.startViewTransition ? "vt" : "circle");
  const settle = (p, ms) => Promise.race([Promise.resolve(p).catch(() => {}), new Promise((r) => setTimeout(r, ms))]);
  async function orbGrow(dir) {
    const mode = orbMode();
    const o = orbEl();
    window.__skOrb.push({ dir, mode, at: Date.now() });
    o.dataset.mode = mode;
    o.style.opacity = "1";
    const big = dir === "in";
    if (mode === "fade") {
      o.classList.add("full");
      await settle(o.animate([{ opacity: big ? 0 : 1 }, { opacity: big ? 1 : 0 }], { duration: 200, easing: "linear", fill: "forwards" }).finished, 400);
      return mode;
    }
    if (!big) { o.classList.add("full"); await settle(o.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160, fill: "forwards" }).finished, 300); }
    if (mode === "vt") {
      try {
        const t = document.startViewTransition(() => o.classList.toggle("full", big));
        await settle(t.finished, ORB_MS + 400);
      } catch { o.classList.toggle("full", big); }
    } else {
      const s = o.style.getPropertyValue("--orb-s");
      const a = o.animate([{ transform: `scale(${big ? 1 : s})` }, { transform: `scale(${big ? s : 1})` }], { duration: ORB_MS, easing: "cubic-bezier(.65,0,.35,1)", fill: "forwards" });
      await settle(a.finished, ORB_MS + 300);
      o.classList.toggle("full", big);
      a.cancel();
    }
    return mode;
  }
  // The first step is in: the orb fades away under it
  function orbDone() {
    const o = document.getElementById("pfOrbX");
    if (!o) return;
    const a = o.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, easing: "linear", fill: "forwards" });
    settle(a.finished, 500).then(() => o.remove());
  }
  // Exit: back where they came from in the app (Discover when there's nowhere to go back to)
  async function exitPlan() {
    const card = app.querySelector(".pf");
    if (card && !reduced()) await settle(card.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 180, fill: "forwards" }).finished, 300);
    await orbGrow("out");
    if (document.referrer.startsWith(location.origin) && !/\/sk(\/|$|\?)/.test(new URL(document.referrer).pathname) && history.length > 1) history.back();
    else { ss.set("sq2.screen", "discover"); location.href = "/"; }
  }
  window.addEventListener("pageshow", (e) => { if (e.persisted) { const o = document.getElementById("pfOrbX"); if (o) o.remove(); const c = app.querySelector(".pf"); if (c) c.getAnimations().forEach((a) => a.cancel()); } });

  // The app's tabs: only on the Plan tab's "You're on a call" screen (in the minimized call's frame)
  function pfNav(live = false) {
    const tabs = [["discover", "Discover", PF.home], ["parties", "Squads", PF.squad.replace(/20/g, "24")], ["plan", "Plan", null], ["questlog", "Sidequests", PF.ticket], ["profile", "Profile", PF.person.replace(/20/g, "24")]];
    return `<nav class="pf-nav" aria-label="SideQuest"><span class="pf-brand" aria-hidden="true">sidequest</span>${tabs.map(([k, label, icon]) => k === "plan"
      ? `<a class="pf-tab on plan" href="/sk" aria-current="page"><span class="orb pf-tab-orb"></span><span>${label}</span>${live ? '<i class="pf-livedot" aria-label="On a call"></i>' : ""}</a>`
      : `<a class="pf-tab" href="/" data-screen="${k}">${icon}<span>${label}</span></a>`).join("")}</nav>`;
  }
  // The app's tabs under an ended call's screen are gone (its buttons say where they go). callNav stays for the voice
  // study's own layout, where it's never shown.
  function callNav(on) {
    let n = document.getElementById("callNav");
    on = Boolean(on) && !STUDY;
    document.body.classList.toggle("call-nav", on);
    if (!on) { if (n) n.remove(); return; }
    if (n) return;
    const w = document.createElement("div");
    w.innerHTML = pfNav();
    n = w.firstElementChild;
    n.id = "callNav";
    n.classList.add("callnav");
    document.body.appendChild(n);
  }
  document.addEventListener("click", (e) => {
    const a = e.target.closest(".pf-tab[data-screen]");
    if (a) ss.set("sq2.screen", a.dataset.screen);
  }, true);

  function pfShell(step, inner, cls = "") {
    pfOn(true);
    const reveal = flow.reveal;
    flow.reveal = false;
    app.innerHTML = `<div class="pf${reveal ? " pf-reveal" : ""}" data-step="${step}"><div class="pf-main"><section class="pf-card ${cls}" aria-labelledby="pfTitle">${inner}</section></div></div>`;
    const h = document.getElementById("pfTitle");
    if (h && pfFocus) { h.setAttribute("tabindex", "-1"); h.focus({ preventScroll: true }); }
    pfFocus = true;
    window.scrollTo(0, 0);
  }
  let pfFocus = false;
  // ‹ back (from step 2, and on step 1's own sub-screens), ✕ Exit always, then the three-part progress bar
  const stepHead = (n, backTo) => `<div class="pf-head">${backTo ? `<button class="icon-btn pf-back" data-pfback="${backTo}" aria-label="Back">${PF.back}</button>` : '<span class="pf-sp" aria-hidden="true"></span>'}<button class="pf-exit" id="pfExit" aria-haspopup="dialog">✕ Exit</button></div>
    <div class="pf-prog" role="progressbar" aria-label="Step ${n} of 3" aria-valuemin="1" aria-valuemax="3" aria-valuenow="${n}">${[1, 2, 3].map((i) => `<i class="${i <= n ? "on" : ""}"></i>`).join("")}</div>`;
  const pending = (btn, label) => { btn.disabled = true; btn.setAttribute("aria-busy", "true"); btn.dataset.label = btn.innerHTML; btn.classList.add("is-pending"); btn.innerHTML = `${esc(label)}<span class="pend-dots" aria-hidden="true"><i></i><i></i><i></i></span>`; };
  const unpend = (btn) => { btn.disabled = false; btn.removeAttribute("aria-busy"); btn.classList.remove("is-pending"); if (btn.dataset.label) btn.innerHTML = btn.dataset.label; };

  // Who's in: the people picked in step 1 (by key), with You first
  function pfPeople() {
    const d = flow.data;
    let keys = [];
    if (flow.path === "squad") keys = ((d.squads.find((s) => s.id === flow.squad) || {}).members || []);
    else if (flow.path === "friends") keys = flow.friends;
    const me = { key: "me", name: "You", full: d.me.name || "You", initial: d.me.initial, avail: d.mine, colour: "c0" };
    return [me, ...keys.map((k, i) => d.people[k] && { ...d.people[k], colour: PF_COLOURS[i % PF_COLOURS.length] }).filter(Boolean)];
  }
  const squadName = () => ((flow.data.squads.find((s) => s.id === flow.squad) || {}).name || "");
  const crewName = () => flow.crew || (flow.path === "squad" ? squadName() : flow.data && flow.data.me.name ? `${flow.data.me.name}'s plan` : "The crew");
  const pfNightOf = (date) => flow.data.nights.find((n) => n.date === date);
  const shortNight = (date) => { const n = pfNightOf(date); return n ? `${n.dow} ${n.day}` : date; };

  // A call that's still live in this tab (minimized, or this page opened again): the Plan tab goes back to it, and the
  // minimized call's frame says "You're on a call" (the bar above it has Return)
  const onCall = () => { try { return JSON.parse(ss.get("sk:onCall") || "null"); } catch { return null; } };
  async function liveCall() {
    const oc = onCall();
    if (!oc || !oc.rid) return null;
    try {
      const info = await api(`/api/sk/rooms/${encodeURIComponent(oc.rid)}/info`);
      if (info.status === "live") return { ...oc, crew: info.crew || oc.crew };
    } catch {}
    ss.set("sk:onCall", "");
    return null;
  }
  function pfOnCall(oc) {
    flow.step = "oncall";
    pfOn(true);
    app.innerHTML = `<div class="pf pf-tabs" data-step="oncall">${pfNav(true)}<div class="pf-main"><section class="pf-card pf-oncall" aria-labelledby="pfTitle">
      <h1 class="pf-big">Plan</h1>
      <div class="pf-livecard" id="pfLive">${photoHTML(oc.crew)}<span class="pf-livefade" aria-hidden="true"></span>
        <span class="pf-mono ok">● Live now</span><h2 id="pfTitle">You're on a call with ${esc(oc.crew)}</h2><p class="muted">Sidekick is still listening.</p></div>
      <p class="small">You can start a new plan once this call ends.</p></section></div></div>`;
  }

  // The orb grows while the plan loads; the first step fades in when both are done
  async function flowStart() {
    const live = await liveCall();
    if (live) {
      if (inFrame) return pfOnCall(live);
      return void location.replace(`/sk/${encodeURIComponent(live.rid)}`); // the Plan tab returns to the live call
    }
    const sq = params.get("squad");
    const free = store.get("sk:free");
    const persona = params.get("persona") || ss.get("sk:persona");
    const q = new URLSearchParams();
    if (userId()) q.set("user", userId());
    if (sq) q.set("squad", sq);
    if (persona) q.set("persona", persona);
    if (store.get("sk:name")) q.set("name", store.get("sk:name"));
    if (Array.isArray(free)) q.set("free", free.join(","));
    pfOn(true);
    app.innerHTML = '<span class="sr" role="status">Loading your plan…</span>';
    const grown = orbGrow("in");
    try {
      const pickId = params.get("pick");
      const [data, nights, pick, calls] = await Promise.all([
        api(`/api/sk/plan/setup?${q}`),
        api("/api/sk/nights").catch(() => ({})),
        pickId ? api(`/api/sk/pick?id=${encodeURIComponent(pickId)}`).catch(() => null) : null,
        userId() ? api(`/api/sk/calls?user=${encodeURIComponent(userId())}`).catch(() => ({})) : null,
      ]);
      flow.data = data;
      flow.voiceAgent = Boolean(nights.voiceAgent);
      flow.calls = (calls && calls.calls) || [];
      // "Plan it" from Saved (/sk?pick=<id>): that event's night is picked, and the event is a candidate pick
      if (pick && !pick.past) {
        flow.pick = pick;
        if (data.nights.some((n) => n.date === pick.date)) { flow.nights = [pick.date]; flow.nightsSet = true; }
      }
    } catch (err) {
      await grown;
      flow.reveal = true;
      pfShell("error", `<div class="pf-head"><span class="pf-sp" aria-hidden="true"></span><button class="pf-exit" id="pfExit">✕ Exit</button></div>
        <h1 class="pf-h" id="pfTitle">Couldn't load your plan</h1><p class="muted">Check your connection and try again.</p><div class="pf-foot"><button class="btn pri" onclick="location.reload()">Try again</button></div>`);
      orbDone();
      return;
    }
    ss.set("sk:persona", flow.data.persona);
    if (flow.data.squad) { flow.path = "squad"; flow.squad = flow.data.squad; }
    if (flow.voiceAgent) loadEL().catch(() => {});
    await grown;
    flow.reveal = true;
    if (flow.path === "squad" && sq) pfWhen(); else pfWho();
    orbDone();
  }

  // ----- Leave planning? (✕ Exit, once something's been picked) -----
  function exitSheet() {
    const s = document.createElement("div");
    s.id = "exitSheet";
    s.className = "sheet-wrap";
    s.innerHTML = `<div class="sheet-scrim" data-exitno></div><div class="sheet-panel end-sheet" role="dialog" aria-modal="true" aria-labelledby="exitT" tabindex="-1">
      <span class="grab" aria-hidden="true"></span><h2 id="exitT">Leave planning?</h2><p class="muted">Your choices so far won't be saved.</p>
      <button class="btn pri" id="exitYes">Leave</button><button class="btn quiet" id="exitNo" data-exitno>Keep planning</button></div>`;
    document.body.appendChild(s);
    document.getElementById("exitNo").focus();
  }
  function closeExitSheet() {
    const s = document.getElementById("exitSheet");
    if (s) s.remove();
    const b = document.getElementById("pfExit");
    if (b) b.focus();
  }
  document.addEventListener("click", (e) => {
    if (e.target.closest("#pfExit")) {
      if (flow.touched && flow.step !== "formsent") return void exitSheet();
      return void exitPlan();
    }
    if (e.target.closest("#exitYes")) { const s = document.getElementById("exitSheet"); if (s) s.remove(); return void exitPlan(); }
    if (e.target.closest("[data-exitno]")) return void closeExitSheet();
  });

  // ----- Step 1: who's coming? A squad (photo rows), people you choose, or "I'll decide later" (straight to the nights;
  // the call link is shared from the call's People sheet) -----
  function pfWho() {
    flow.step = "who";
    const d = flow.data;
    if (!flow.path) flow.path = d.squads.length ? "squad" : null;
    if (flow.path === "squad" && !flow.squad && d.squads.length) flow.squad = d.squads[0].id;
    const row = (s) => {
      const on = flow.path === "squad" && flow.squad === s.id;
      const mem = s.members.map((k) => d.people[k]).filter(Boolean);
      return `<button class="pf-crew${on ? " on" : ""}" role="radio" aria-checked="${on}" data-pfsquad="${esc(s.id)}">${photoHTML(s.name)}<span class="pf-crewfade" aria-hidden="true"></span>
        <span class="stk" aria-hidden="true">${mem.slice(0, 3).map((p, i) => `<span class="av ${PF_COLOURS[i % PF_COLOURS.length]}">${esc(p.initial)}</span>`).join("")}</span>
        <span class="pf-opt-t"><b>${esc(s.name)}</b><span class="small">${mem.length + 1} people</span></span><span class="pf-radio" aria-hidden="true"></span></button>`;
    };
    const picked = flow.path === "friends" && flow.friends.length ? flow.friends.map((k) => d.people[k] && d.people[k].name).filter(Boolean).join(", ") : "";
    const card = (key, icon, title, sub) => `<button class="pf-opt${flow.path === key ? " on" : ""}" role="radio" aria-checked="${flow.path === key}" data-pfpath="${key}"><span class="pf-ib" aria-hidden="true">${icon}</span><span class="pf-opt-t"><b>${title}</b><span class="small">${sub}</span></span></button>`;
    if (flow.path === "link") flow.path = "later"; // older builds had "Send a link" here
    const ready = flow.path === "squad" ? Boolean(flow.squad) : flow.path === "friends" ? flow.friends.length > 0 : Boolean(flow.path);
    const around = flow.pick ? `<div class="pf-pick" id="pfPick"><span class="small">Planning around your Saved</span><b>${esc(flow.pick.title)}</b><span class="small">${esc([flow.pick.night, flow.pick.where].filter(Boolean).join(" · "))}</span></div>` : "";
    pfShell("who", `${stepHead(1, null)}<h1 class="pf-h" id="pfTitle">Who's coming?</h1>${around}
      <div class="pf-opts" role="radiogroup" aria-label="Who's coming">
        ${d.squads.map(row).join("")}
        ${card("friends", PF.person, "Choose people", picked ? esc(picked) : "Pick Sidequesters one by one")}
        ${card("later", PF.link, "I'll decide later", "Pick nights now, share the link from the call")}
      </div>
      ${flow.calls.length ? `<p class="small pf-last" id="pfLast">Your last plan: ${esc(flow.calls[0].locked ? flow.calls[0].locked.title : `${flow.calls[0].crew}, no pick locked`)}</p>` : ""}
      <div class="pf-foot"><button class="btn pri" id="pfNext" ${ready ? "" : "disabled"}>Next: which nights</button></div>`);
  }

  function pfFriends() {
    flow.step = "friends";
    const d = flow.data;
    const s = flow.search.trim().toLowerCase();
    const list = d.friends.filter((k) => !s || d.people[k].full.toLowerCase().includes(s) || d.people[k].name.toLowerCase().includes(s));
    const picked = flow.friends.filter((k) => d.people[k]);
    const rows = list.map((k) => {
      const p = d.people[k];
      const on = picked.includes(k);
      return `<button class="pf-frow" role="checkbox" aria-checked="${on}" data-pffriend="${esc(k)}"><span class="av ${PF_COLOURS[d.friends.indexOf(k) % PF_COLOURS.length]}" aria-hidden="true">${esc(p.initial)}</span><span class="grow">${esc(p.full)}</span><span class="pf-box" aria-hidden="true">${on ? PF.check : ""}</span></button>`;
    }).join("");
    const empty = !d.friends.length
      ? `<div class="pf-empty"><p style="font-weight:600">No Sidequesters yet</p><p class="small">Add people in Profile, or decide later and share the call link from the call.</p><button class="btn out sm" data-pfpath="later">I'll decide later</button></div>`
      : !list.length ? `<p class="small">Nobody called "${esc(flow.search)}" in your Sidequesters.</p>` : "";
    pfShell("friends", `${stepHead(1, "who")}<h1 class="pf-h" id="pfTitle">Choose people</h1>
      ${d.friends.length ? `<label class="pf-search"><span class="sr">Search your Sidequesters</span>${PF.search}<input id="pfSearch" type="search" placeholder="Search your Sidequesters" value="${esc(flow.search)}" autocomplete="off"></label>` : ""}
      <div class="pf-chips" id="pfPicked" aria-label="Picked">${picked.map((k) => `<button class="chip" aria-pressed="true" data-pfunpick="${esc(k)}" aria-label="Remove ${esc(d.people[k].name)}">${esc(d.people[k].name)} ${ICON.x}</button>`).join("")}</div>
      <div class="pf-flist" id="pfFlist">${rows}</div>${empty}
      ${d.friends.length ? '<p class="small">Only people on SideQuest are listed, so everyone here can share free nights.</p>' : ""}
      <div class="pf-foot"><button class="btn pri" id="pfNext" ${picked.length ? "" : "disabled"}>Next: which nights${picked.length ? ` · ${picked.length}` : ""}</button></div>`);
  }

  // Makes the room (or updates the one made before Back): the crew, nights and setup
  async function ensureRoom(form, send = false) {
    const d = flow.data;
    const members = pfPeople().slice(1).map((p) => p.name);
    const body = { nights: flow.nights.length ? flow.nights : undefined, members, crew: crewName(), noLearn: flow.noLearn, pick: flow.pick ? flow.pick.id : undefined, deadline: form && flow.deadline ? flow.deadline : undefined };
    // People picked in the app hear about it in SideQuest once the plan or form is sent (held in their quiet hours)
    if (send) body.invite = pfPeople().slice(1).map((p) => p.key);
    // Reuse the room made for a form sent before Back, unless it's a form and this is a call
    const reuse = flow.room && (flow.room.form === Boolean(form) || (form && !flow.room.form && !flow.room.started));
    if (reuse) {
      await api(`/api/sk/rooms/${flow.room.room}/setup`, { p: flow.room.person, ...body, form: Boolean(form) });
      flow.room.form = flow.room.form || Boolean(form);
      return flow.room;
    }
    const name = d.me.name || (document.getElementById("pfName") || {}).value || store.get("sk:name") || "You";
    const out = await api("/api/sk/rooms", { ...body, name, persona: d.persona, form: Boolean(form), path: flow.path, user: userId() || undefined });
    flow.room = { room: out.room, person: out.person, form: Boolean(form) };
    return flow.room;
  }

  // ----- Step 2: which nights work? A calendar of the window (today and the next 20 days) -----
  // Each night's brightness steps through the violet tints by how many of the crew are free, with a dot in each
  // free friend's colour. Tapping a night picks it and marks it free for you too (saved to your account, or this
  // phone when signed out). Friends share free or not, never why.
  function nightInfo(n, people) {
    const st = people.map((p) => ({ p, s: (p.avail && p.avail.nights && p.avail.nights[n.date]) || "unset" }));
    const free = st.filter((x) => x.s === "free");
    const unset = st.filter((x) => x.s === "unset");
    const all = people.length >= 2 && free.length === people.length;
    return { st, free, unset, all };
  }
  const STATE_WORD = { free: "free", busy: "busy", unset: "not set" };
  function nightLabelFull(n, info, on) {
    const who = info.st.map((x) => `${x.p.key === "me" ? "you" : x.p.name}: ${STATE_WORD[x.s]}`).join(", ");
    return `${n.label}${on ? ", picked" : ""}. ${info.free.length} of ${info.st.length} free${info.all ? ", everyone free" : ""}. ${who}. Link guests: unknown. ${n.events} event${n.events === 1 ? "" : "s"} that night.`;
  }
  function defaultNights(people) {
    const list = flow.data.nights.map((n) => ({ n, i: nightInfo(n, people) }));
    // The first week with a night everyone's free: its busiest one (more to choose from)
    const all = list.filter((x) => x.i.all && x.n.events > 0);
    const week = all.length ? all.filter((x) => list.indexOf(x) - list.indexOf(all[0]) < 7 - ((["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(all[0].n.dow) + 7) % 7)) : [];
    const best = week.sort((a, b) => b.n.events - a.n.events)[0] || list.slice().sort((a, b) => b.i.free.length - a.i.free.length || b.n.events - a.n.events)[0];
    return best ? [best.n.date] : [];
  }
  // 0 = nobody else free, 3 = every friend free
  const freeLevel = (f, n) => (!f || !n ? 0 : f >= n ? 3 : f / n >= 0.5 ? 2 : 1);
  const addDaysISO = (iso, k) => { const x = new Date(`${iso}T12:00:00`); x.setDate(x.getDate() + k); return x; };
  const dayList = (dates) => { const s = dates.map(shortNight); return s.length > 1 ? `${s.slice(0, -1).join(", ")} & ${s[s.length - 1]}` : s[0] || ""; };
  function pfWhen() {
    flow.step = "when";
    const d = flow.data;
    const people = pfPeople();
    const friends = people.slice(1);
    if (!flow.nightsSet && !flow.nights.length) flow.nights = defaultNights(people);
    flow.nightsSet = true;
    const backTo = flow.path === "friends" ? "friends" : "who";
    const sel = flow.nights;
    const first = d.nights[0];
    const last = d.nights[d.nights.length - 1];
    const lead = (["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(first.dow) + 7) % 7;
    const past = Array.from({ length: lead }, (_, i) => `<span class="n past" aria-hidden="true">${addDaysISO(first.date, i - lead).getDate()}</span>`);
    const tail = (7 - ((lead + d.nights.length) % 7)) % 7;
    const after = Array.from({ length: tail }, (_, i) => `<span class="n out" aria-hidden="true">${addDaysISO(last.date, i + 1).getDate()}</span>`);
    const cells = d.nights.map((n) => {
      const i = nightInfo(n, people);
      const f = i.free.filter((x) => x.p.key !== "me");
      const on = sel.includes(n.date);
      return `<button class="n pf-night l${freeLevel(f.length, friends.length)}${on ? " sel" : ""}${n === first ? " today" : ""}" data-date="${n.date}" data-free="${f.length}" data-all="${i.all ? 1 : 0}" aria-pressed="${on}" aria-label="${esc(nightLabelFull(n, i, on))}"><span class="n-d">${n.day}</span><span class="fs" aria-hidden="true">${f.map((x) => `<i class="${x.p.colour}"></i>`).join("")}</span></button>`;
    });
    const crew = flow.path === "squad" ? squadName() : flow.path === "friends" ? "your crew" : "";
    const lede = flow.path === "later" ? "It's just you so far. Share the call link from People once you're on." : `Brighter nights mean more of ${esc(crew)} is free.`;
    let sum = '<span class="muted">Tap the nights that could work.</span>';
    if (sel.length) {
      const infos = sel.map((dt) => nightInfo(pfNightOf(dt), people));
      const counts = infos.map((x) => x.free.length);
      const lo = Math.min(...counts), hi = Math.max(...counts);
      const right = people.length < 2 ? "" : infos.every((x) => x.all) ? "all free" : `${lo === hi ? lo : `${lo}–${hi}`} of ${people.length} free`;
      const things = sel.reduce((n, dt) => n + ((pfNightOf(dt) || {}).events || 0), 0);
      sum = `<div class="pf-sumrow"><b>${esc(dayList(sel))}</b>${right ? `<span class="pf-mono${right === "all free" ? " ok" : ""}" id="pfFreeN">${right}</span>` : ""}</div><span class="muted small">${things} thing${things === 1 ? "" : "s"} on ${sel.length > 1 ? "those nights" : "that night"}</span>`;
    }
    const month = first.mon === last.mon ? first.mon : `${first.mon} – ${last.mon}`;
    pfShell("when", `${stepHead(2, backTo)}<h1 class="pf-h" id="pfTitle">Which nights work?</h1><p class="muted pf-lede">${lede}</p>
      <div class="pf-calwrap"><p class="pf-mono pf-month" aria-hidden="true">${esc(month)}</p>
      <div class="cal" role="group" aria-label="Nights in the next three weeks">${["M", "T", "W", "T", "F", "S", "S"].map((x) => `<span class="dw" aria-hidden="true">${x}</span>`).join("")}${[...past, ...cells, ...after].join("")}</div></div>
      <div class="pf-sumcard" id="pfSum" aria-live="polite">${sum}</div>
      <p class="small">Tapping a night marks you free too. Friends share free or not, never why.${d.signedIn ? "" : " Signed out, your nights stay on this phone."}</p>
      <div class="pf-foot"><button class="btn pri" id="pfNext" ${sel.length ? "" : "disabled"}>Next: how to decide</button></div>`, "when");
  }
  // A picked night is free for you too; un-picking it puts back what it was before the tap
  function markMine(date, on) {
    const d = flow.data;
    if ((d.goingNights || []).includes(date)) return; // you're already going out that night: it stays busy
    if (on) {
      if (d.mine.nights[date] === "free") return;
      flow.tapFree.set(date, d.mine.nights[date] || "unset");
      d.mine.nights[date] = "free";
    } else if (flow.tapFree.has(date)) {
      d.mine.nights[date] = flow.tapFree.get(date);
      flow.tapFree.delete(date);
    } else return;
    d.mine.set = true;
    clearTimeout(flow.freeTimer);
    flow.freeTimer = setTimeout(saveMine, 300);
  }
  async function saveMine() {
    const d = flow.data;
    const free = Object.keys(d.mine.nights).filter((k) => d.mine.nights[k] === "free");
    if (d.signedIn) await api("/api/sk/plan/free", { user: userId(), free }).catch((err) => toast(err.message));
    else store.set("sk:free", free);
  }

  // ----- Step 3: how do you want to decide? A call with Sidekick, or a quick form -----
  // Starting from: live location by default, one line ("📍 Starting near you · change"); change opens the stations
  function pfHow() {
    flow.step = "how";
    const d = flow.data;
    const opt = (key, icon, title, sub) => `<button class="pf-opt pf-how${flow.how === key ? " on" : ""}" role="radio" aria-checked="${flow.how === key}" data-pfhow="${key}">${icon}<span class="pf-opt-t"><b>${title}</b><span class="small">${sub}</span></span></button>`;
    const askName = !d.me.name ? `<label class="f">Your first name<input class="in" id="pfName" autocomplete="given-name" maxlength="24" value="${esc(store.get("sk:name") || "")}"></label>` : "";
    pfShell("how", `${stepHead(3, "when")}<h1 class="pf-h" id="pfTitle">How do you want to decide?</h1>
      <div class="pf-opts" role="radiogroup" aria-label="How to decide">
        ${opt("call", '<span class="orb pf-optorb"></span>', "Hop on a call with Sidekick", "About 5 min. Sidekick listens and suggests two picks.")}
        ${opt("form", `<span class="pf-ib" aria-hidden="true">${PF.form}</span>`, "Send a quick form", "Same questions by tap. Sidekick picks once everyone answers.")}
      </div>
      ${flow.how === "form" ? decideByHTML() : ""}
      ${askName}
      <p class="pf-loc"><span id="pfLocT">📍 ${HAS_GEO ? "Starting near you" : "Starting from Union"}</span><span aria-hidden="true">·</span><button class="pf-change" id="pfLocChange" aria-expanded="false" aria-controls="originWrap">change</button></p>
      <div id="originWrap" hidden>${originPicker()}</div>
      <div class="pf-foot"><button class="btn pri" id="pfStart">${flow.how === "form" ? "Send the form" : "Start the call"}</button></div>`, "how");
    initOrigin();
  }
  // The one line follows the choice: "Starting near you" or "Starting from Finch"
  function locLine() {
    const t = document.getElementById("pfLocT");
    if (!t) return;
    const v = picked("origin")[0];
    t.textContent = `📍 ${v === "here" || !v ? "Starting near you" : `Starting from ${(PRIVATE_OPTS.origin.find(([k]) => k === v) || [, "Union"])[1]}`}`;
  }

  // "Decide by" on the form path: the form closes then, and Sidekick picks with the answers it has
  function decideByOptions() {
    const out = [];
    const at9 = (d) => { const x = new Date(d); x.setHours(21, 0, 0, 0); return x; };
    const now = new Date();
    const first = flow.nights[0] ? new Date(flow.nights[0] + "T18:00:00") : new Date(now.getTime() + 3 * 86400000);
    const add = (d, label) => { if (d > now && d < first && !out.some((o) => o.at === d.getTime())) out.push({ at: d.getTime(), label }); };
    add(at9(now), "Tonight 9 PM");
    add(at9(now.getTime() + 86400000), "Tomorrow 9 PM");
    const eve = at9(first.getTime() - 86400000);
    add(eve, `${eve.toLocaleDateString("en-CA", { weekday: "short" })} 9 PM`);
    if (!out.length) out.push({ at: Math.max(now.getTime() + 3600000, first.getTime() - 3600000), label: "An hour before" });
    return out;
  }
  function decideByHTML() {
    const opts = decideByOptions();
    if (!opts.some((o) => o.at === flow.deadline)) flow.deadline = opts[opts.length - 1].at;
    return `<div class="stack pf-decide"><p style="font-weight:600" id="pfDecideL">Decide by</p>
      <div class="pf-chips" role="radiogroup" aria-labelledby="pfDecideL">${opts.map((o) => `<button class="chip" role="radio" data-pfdeadline="${o.at}" aria-checked="${o.at === flow.deadline}" aria-pressed="${o.at === flow.deadline}">${esc(o.label)}</button>`).join("")}</div>
      <p class="small">The form closes then and Sidekick picks with the answers it has.</p></div>`;
  }
  async function pfLaunch(btn) {
    const nameIn = document.getElementById("pfName");
    if (nameIn && !nameIn.value.trim()) { nameIn.focus(); return toast("Add your name so your crew knows who's planning."); }
    if (nameIn) store.set("sk:name", nameIn.value.trim());
    const form = flow.how === "form";
    const autoAgent = !form && flow.voiceAgent;
    unlockAudio();
    if (autoAgent) primeAgentAudio(); // the microphone prompt comes from this tap
    const origin = await originAnswer(btn);
    if (!origin) return; // no location: Union is now selected, with a note; the next tap starts
    pending(btn, form ? "Sending" : "Starting");
    try {
      const r = await ensureRoom(form, true);
      r.started = true;
      roomId = r.room;
      me = { person: r.person, mode: form ? "form" : "voice" };
      store.set(`sk:${roomId}`, me);
      store.set("sk:crew", crewName());
      await api(`/api/sk/rooms/${roomId}/answer`, { p: me.person, slot: "origin", value: origin, source: "start" }).catch(() => {});
      if (form) await api(`/api/sk/rooms/${roomId}/answer`, { p: me.person, slot: "night", value: flow.nights, source: "start" }).catch(() => {});
      // Stay on this page (no reload), so the tap that unlocked audio on iPhones still counts
      history.pushState(null, "", `/sk/${roomId}`);
      if (!form) pfOn(false);
      connect();
      if (autoAgent) startAgent({ auto: true });
      else if (!form) startMic(); // no natural voice: listen with the captions mic, never start muted
    } catch (err) {
      unpend(btn);
      toast(err.message);
    }
  }

  // ----- "Wait for everyone, or show me now?" (rooms.js askWait) -----
  // The question: two buttons in the call's card area and a countdown (no answer means wait). Then "Waiting on…"
  // with the pink Decide by, Share the link and Change the deadline, for a few seconds (longer while the planner
  // uses it), and the call ends on Form sent.
  let waitEdit = false;
  let waitHold = 0;
  let waitShown = false;
  let waitTimer = null;
  function waitingUp() {
    const w = view && view.wait;
    if (!w || w.state !== "wait" || !view.me || !view.me.planner) return false;
    const until = Math.max(w.until || 0, waitHold);
    clearTimeout(waitTimer);
    if (waitEdit) return true;
    if (Date.now() < until) { waitTimer = setTimeout(() => view && render(), until - Date.now() + 30); return true; }
    return false;
  }
  function leaveForForm() {
    if (micOn) stopMic();
    if (agent) stopAgent();
    Audio.stop();
    if (chatOpen) closeChat(false);
    if (sheetOpen) closeSheet(false);
    if (orbOpen) closeOrb(false);
    liveMark(false);
    document.body.classList.remove("sk-live");
    backdrop(false);
  }
  function waitAskHTML(w) {
    return `<section class="board confirm waitq" aria-labelledby="wqTitle"><div class="cf-b">
      <h2 class="wq-h" id="wqTitle">Show the picks now, or wait for ${esc(w.list)}?</h2>
      <div class="cf-acts wq-acts"><button class="btn pri" id="waitAll">Wait for everyone</button><button class="btn quiet" id="waitNow">Show me now</button></div>
      ${w.closeAt ? `<div class="cd"><div class="cd-bar"><i id="wqBar"></i></div><span class="small">No answer means wait</span></div>` : ""}</div></section>`;
  }
  let wqBar = { closeAt: 0 };
  function runWaitBar() {
    const bar = document.getElementById("wqBar");
    const closeAt = view.wait && view.wait.closeAt;
    if (!bar || !closeAt || (wqBar.closeAt === closeAt && wqBar.el === bar)) return;
    wqBar = { closeAt, el: bar };
    const left = Math.max(0, closeAt - Date.now());
    bar.style.transition = "none";
    bar.style.width = "100%";
    void bar.offsetWidth;
    bar.style.transition = `width ${left}ms linear`;
    bar.style.width = "0%";
  }
  function waitingHTML(w) {
    const opts = (w.options || []).map((at) => `<button class="chip" role="radio" data-waitdeadline="${at}" aria-checked="${at === w.deadline}" aria-pressed="${at === w.deadline}">${esc(closesLabel(at))}</button>`).join("");
    return `<section class="board confirm waiting" aria-labelledby="wtTitle"><div class="cf-b">
      <div class="wt-top"><h2 class="wq-h" id="wtTitle">Waiting on ${esc(w.list)}</h2>${w.deadline ? `<span class="tag hot" id="decideTag">Decide by ${esc(closesLabel(w.deadline))}</span>` : ""}</div>
      <p class="small">They get a quick form. Sidekick picks the top two once everyone's in, or by then.</p>
      ${waitEdit && opts ? `<div class="chips wt-opts" role="radiogroup" aria-label="Decide by">${opts}</div>` : ""}
      <div class="cf-acts wq-acts"><button class="btn pri" id="waitShare">Share the link</button><button class="btn quiet" id="waitDeadline" aria-expanded="${waitEdit}">Change the deadline</button></div></div></section>`;
  }
  async function shareFormLink() {
    const link = inviteLink();
    const text = `Add what you're up for and Sidekick picks our plan: ${link}`;
    if (navigator.share) { try { await navigator.share({ title: view.crew, text, url: link }); } catch {} return; }
    try { await navigator.clipboard.writeText(link); toast("Link copied. Paste it in your group chat."); } catch { toast(link); }
  }

  // ----- Then, the form path: who's answered, live -----
  function renderFormSent() {
    const ex = view.expected || [];
    const meRow = { name: "You", answered: true, me: true };
    const rows = [...ex.filter((x) => !x.link), meRow, ...ex.filter((x) => x.link)];
    const done = rows.filter((x) => x.answered).length;
    const waiting = rows.filter((x) => !x.answered);
    const first = view.nights[0] || "";
    const card = document.querySelector(".pf-card.formsent");
    flow.step = "formsent";
    const html = `${stepHead(3, "how").replace(/<div class="pf-prog"[\s\S]*$/, "")}
      <div class="pf-sent"><span class="pf-okc">${PF.bigcheck}</span><h1 class="pf-h" id="pfTitle" aria-live="polite">${done} of ${rows.length} answered</h1><p class="muted">${view.closed ? "The form has closed. Sidekick is picking with the answers it has." : "Sidekick picks when everyone's in."}</p><span class="row" style="gap:6px;flex-wrap:wrap;justify-content:center">${first ? `<span class="tag hot">For ${esc(first)}</span>` : ""}${view.deadline ? `<span class="tag hot" id="closesTag">${view.closed ? "Closed" : `Closes ${esc(closesLabel(view.deadline))}`}</span>` : ""}</span></div>
      <ul class="pf-ans" aria-label="Who's answered">${rows.map((x, i) => `<li><span class="av ${x.me ? "c0" : x.link && !x.answered ? "unk" : PF_COLOURS[i % PF_COLOURS.length]}" aria-hidden="true">${esc(x.me ? (view.me.name || "Y").charAt(0).toUpperCase() : x.name.charAt(0).toUpperCase())}</span><span class="grow">${esc(x.name)}${x.link ? ' <span class="small">(via link)</span>' : ""}</span><span class="tag ${x.answered ? "ok" : "pf-tn"}">${x.answered ? "Answered" : "Not yet"}</span></li>`).join("")}</ul>
      <div class="pf-acts2">${waiting.length ? `<button class="btn sm pf-v" id="pfNudge">Nudge ${esc(waiting.length === 1 ? waiting[0].name : `${waiting.length} people`)}</button>` : ""}<button class="btn out sm" id="pfPickNow" ${done >= 2 ? "" : "disabled"}>Pick now with ${done}</button></div>
      <div class="pf-box-card"><span class="small">Send the form link to the group</span>${shareHTML()}</div>
      ${view.wait && view.wait.state === "wait" ? '<a class="btn pri pf-see" id="seeQuest" href="/">See it in Sidequests</a>' : ""}`;
    if (!card) {
      pfFocus = false;
      pfShell("formsent", html, "formsent");
    } else card.innerHTML = html;
  }

  // Taps in the steps
  const pfRedraw = (fn, sel) => {
    const y = window.scrollY;
    pfFocus = false;
    fn();
    window.scrollTo(0, y);
    const again = sel && app.querySelector(sel);
    if (again) again.focus({ preventScroll: true });
  };
  app.addEventListener("click", async (e) => {
    const t = e.target;
    const back = t.closest("[data-pfback]");
    if (back) {
      const to = back.dataset.pfback;
      if (!flow.data) return void (location.href = "/sk");
      if (phase === "formsent" || (view && view.form && document.querySelector(".formsent"))) {
        leaveQuietly();
        view = null;
        roomId = null;
        history.pushState(null, "", "/sk");
      }
      return void ({ who: pfWho, friends: pfFriends, when: pfWhen, how: pfHow }[to] || pfWho)();
    }
    const path = t.closest("[data-pfpath]");
    if (path) {
      flow.path = path.dataset.pfpath;
      flow.touched = true;
      if (flow.path === "friends") return void pfFriends();
      if (flow.path === "later") return void pfWhen(); // no crew yet: straight to the nights
      return void pfWho();
    }
    const sq = t.closest("[data-pfsquad]");
    if (sq) { if (flow.squad !== sq.dataset.pfsquad || flow.path !== "squad") flow.touched = true; flow.squad = sq.dataset.pfsquad; flow.path = "squad"; return void pfRedraw(pfWho, `[data-pfsquad="${CSS.escape(flow.squad)}"]`); }
    const fr = t.closest("[data-pffriend]");
    if (fr) {
      const k = fr.dataset.pffriend;
      flow.touched = true;
      flow.friends = flow.friends.includes(k) ? flow.friends.filter((x) => x !== k) : [...flow.friends, k];
      return void pfRedraw(pfFriends, `[data-pffriend="${CSS.escape(k)}"]`);
    }
    const un = t.closest("[data-pfunpick]");
    if (un) { flow.friends = flow.friends.filter((x) => x !== un.dataset.pfunpick); pfFocus = false; return void pfFriends(); }
    if (t.closest("#pfNext")) {
      if (flow.step === "who") return void (flow.path === "friends" ? pfFriends() : pfWhen());
      if (flow.step === "friends") return void pfWhen();
      if (flow.step === "when") return void pfHow();
    }
    const night = t.closest(".pf-night");
    if (night) {
      const dt = night.dataset.date;
      flow.touched = true;
      if (flow.nights.includes(dt)) { flow.nights = flow.nights.filter((x) => x !== dt); markMine(dt, false); }
      else if (flow.nights.length >= 4) return void toast("Pick up to 4 nights.");
      else { flow.nights = [...flow.nights, dt].sort(); markMine(dt, true); }
      return void pfRedraw(pfWhen, `.pf-night[data-date="${dt}"]`);
    }
    const how = t.closest("[data-pfhow]");
    if (how) { if (flow.how !== how.dataset.pfhow) flow.touched = true; flow.how = how.dataset.pfhow; return void pfRedraw(pfHow, `[data-pfhow="${flow.how}"]`); }
    if (t.closest("#pfLocChange")) {
      const w = document.getElementById("originWrap");
      w.hidden = !w.hidden;
      t.closest("#pfLocChange").setAttribute("aria-expanded", String(!w.hidden));
      return;
    }
    if (t.closest('.chips[data-name="origin"] .chip')) return void locLine(); // after the chip's own toggle
    const dl = t.closest("[data-pfdeadline]");
    if (dl) {
      flow.deadline = Number(dl.dataset.pfdeadline);
      app.querySelectorAll("[data-pfdeadline]").forEach((b) => { const on = b === dl; b.setAttribute("aria-checked", on); b.setAttribute("aria-pressed", on); });
      return;
    }
    if (t.closest("#pfStart")) return void pfLaunch(t.closest("#pfStart"));
    if (t.closest("#pfPickNow")) { const b = t.closest("#pfPickNow"); pending(b, "Finding picks"); return void send("ask", {}); }
    if (t.closest("#pfNudge")) {
      const waiting = (view.expected || []).filter((x) => !x.answered).map((x) => x.name);
      const msg = `${waiting.length === 1 ? `${waiting[0]}, quick` : "Quick"} one: tap your answers for ${view.crew}'s plan, it takes a minute: ${inviteLink()}`;
      if (navigator.share) return void navigator.share({ text: msg }).catch(() => {});
      return void copyText(msg, "Nudge copied. Paste it in the group chat.");
    }
  });
  app.addEventListener("input", (e) => {
    if (e.target.id !== "pfSearch") return;
    flow.search = e.target.value;
    const pos = e.target.selectionStart;
    pfFocus = false;
    pfFriends();
    const s = document.getElementById("pfSearch");
    s.focus();
    s.setSelectionRange(pos, pos);
  });
  document.addEventListener("keydown", (e) => {
    const sheet = document.getElementById("exitSheet");
    if (!sheet) return;
    if (e.key === "Escape") { e.preventDefault(); closeExitSheet(); return; }
    if (e.key === "Tab") {
      const items = [...sheet.querySelectorAll("button:not([disabled])")];
      const [a, b] = [items[0], items[items.length - 1]];
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); b.focus(); } else if (!e.shiftKey && document.activeElement === b) { e.preventDefault(); a.focus(); }
    }
  });

  // ---------- 2. Join ----------
  // A friend opens the link (design: nav #12): the crew's photo, who invited them and who's on the call, a first-name
  // field, "Join by voice" or "Answer by tapping" (in the call with the mic off), and "No app or account needed". Private
  // questions (budget, places to avoid) are asked one to one on the call. A form opens its questions straight away.
  async function joinScreen() {
    if (STUDY) return joinScreenStudy();
    let info;
    try { info = await api(`/api/sk/rooms/${roomId}/info${userId() ? `?user=${encodeURIComponent(userId())}` : ""}`); } catch (err) {
      if (err.status === 404) return goneScreen(err.data);
      app.innerHTML = `<section class="done left"><h1 class="done-t">Can't reach the call</h1><p class="muted">Check your connection and try again.</p><div class="done-foot"><button class="btn pri" onclick="location.reload()">Try again</button><a class="done-link" href="/">Open SideQuest</a></div></section>`;
      return;
    }
    document.body.classList.add("sk-done");
    if (info.status !== "live") {
      app.innerHTML = `<section class="done left"><h1 class="done-t">This call has finished</h1><p class="muted">Ask whoever planned it for the plan.</p><div class="done-foot"><a class="btn pri" href="/sk">Start your own plan</a><a class="done-link" href="/">Open SideQuest</a></div></section>`;
      return;
    }
    if (info.closed) {
      app.innerHTML = `<section class="done left"><span class="pf-mono">Quick form · ${esc(info.crew)}</span><h1 class="done-t">This form has closed</h1><p class="muted">Sidekick picked with the answers it had. Ask whoever planned it for the plan.</p><div class="done-foot"><a class="done-link" href="/">Open SideQuest</a></div></section>`;
      return;
    }
    const names = info.people.slice(0, 3);
    const onCall = names.length ? `${names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0]}${info.people.length > 3 ? " and others" : ""} ${info.people.length === 1 ? "is" : "are"} ${info.form ? "in" : "on the call"}` : "";
    const avs = names.map((n, i) => `<span class="av live ${PF_COLOURS[(i + 1) % PF_COLOURS.length]}" aria-hidden="true">${esc(n.charAt(0).toUpperCase())}</span>`).join("");
    app.innerHTML = `<div class="done-hero join-hero" aria-hidden="true">${photoHTML(info.crew)}<span class="done-fade"></span></div>
      <section class="done join" aria-labelledby="joinT">
        <a class="join-home" href="/" aria-label="SideQuest home">sidequest</a>
        <span class="pf-mono">${esc(info.people[0] || "Your crew")} invited you</span>${info.deadline ? `<span class="tag hot" id="closesTag">Closes ${esc(closesLabel(info.deadline))}</span>` : ""}
        <h1 class="done-t" id="joinT">${esc(info.crew)} is<br><span class="grad">${info.form ? "deciding by form" : "planning a night"}</span></h1>
        ${onCall ? `<div class="row join-who"><span class="stk">${avs}</span><span class="muted">${esc(onCall)}</span></div>` : ""}
        <label class="f"><span class="sr">Your first name</span><input class="in" id="name" autocomplete="given-name" maxlength="24" placeholder="Your first name" value="${esc(store.get("sk:name") || "")}"></label>
        <div class="stack" id="formExtra" ${info.form ? "" : "hidden"}>
          <p style="font-weight:600">Which nights work?</p><div class="chips" data-name="night" data-multi>${info.nights.map((l, i) => chip("night", i, l, false)).join("")}</div>
          <p style="font-weight:600">What time?</p><div class="chips" data-name="time" data-multi>${PRIVATE_OPTS.time.map(([v, l]) => chip("time", v, l, false)).join("")}</div>
          <p style="font-weight:600">Feeling like</p><div class="chips" data-name="vibe" data-multi>${(info.vibes ? info.vibes.map((o) => [o.value, o.label]) : PRIVATE_OPTS.vibe).map(([v, l]) => chip("vibe", v, l, false)).join("")}${otherHTML()}</div>
          <div class="priv"><span class="lock">${ICON.lock}Only Sidekick sees these</span>
            <p style="font-weight:600">Your max for the night</p>
            <div class="chips" data-name="budget">${PRIVATE_OPTS.budget.map(([v, l]) => chip("budget", v, l, false)).join("")}</div>
            <p class="small">The group only ever sees one limit, never your answer.</p></div>
          ${info.form ? originPicker() : ""}
        </div>
        ${info.form ? "" : `<p class="pf-loc"><span id="pfLocT">📍 ${HAS_GEO ? "Starting near you" : "Starting from Union"}</span><span aria-hidden="true">·</span><button class="pf-change" id="pfLocChange" aria-expanded="false" aria-controls="originWrap">change</button></p><div id="originWrap" hidden>${originPicker()}</div>`}
        <div class="stack" id="joinBtns">
          ${info.form ? '<button class="btn pri" data-mode="form">Send my answers</button>' : '<button class="btn pri" data-mode="voice">Join by voice</button><button class="btn quiet" data-mode="text">Answer by tapping</button>'}
        </div>
        <p class="small center">No app or account needed.</p>
      </section>`;
    initOrigin();
    app.querySelector("#joinBtns").addEventListener("click", async (e) => {
      const b = e.target.closest("[data-mode]");
      if (!b) return;
      const name = document.getElementById("name").value.trim();
      if (!name) { document.getElementById("name").focus(); return toast("Add your first name first."); }
      const answers = {};
      if (b.dataset.mode === "form") {
        const one = (k) => picked(k)[0];
        if (one("budget")) answers.budget = one("budget");
        // the night chips carry an index; the server knows the dates
        const nightIdx = picked("night").map(Number);
        if (nightIdx.length) answers.nightIdx = nightIdx;
        if (picked("time").length) answers.time = picked("time");
        if (picked("vibe").length) answers.vibe = picked("vibe");
        const own = other.open ? other.draft.trim() : "";
        if (own) answers.want = [own]; // their own words, like saying it on the call
        if (!answers.vibe && !own && other.open) return toast("Type what you're in the mood for, or close Something else.");
      }
      unlockAudio();
      if (picked("origin")[0]) {
        const origin = await originAnswer(b);
        if (!origin) return; // no location: Union is now selected, with a note; the next tap joins
        answers.origin = origin;
      }
      b.disabled = true;
      try {
        const out = await api(`/api/sk/rooms/${roomId}/join`, { name, mode: b.dataset.mode, answers, user: userId() || undefined });
        store.set("sk:name", name);
        me = { person: out.person, mode: b.dataset.mode, boot: info.boot };
        store.set(`sk:${roomId}`, me);
        document.body.classList.remove("sk-done");
        connect();
        if (me.mode === "voice") startMic(); // a friend joining by voice is heard from the start (this tap allows the mic)
      } catch (err) {
        b.disabled = false;
        toast(err.message);
      }
    });
  }

  // The voice study keeps its own join card (the private questions, location, and "Answer without calling")
  async function joinScreenStudy() {
    let info;
    try { info = await api(`/api/sk/rooms/${roomId}/info${userId() ? `?user=${encodeURIComponent(userId())}` : ""}`); } catch (err) {
      if (err.status === 404) return goneScreen(err.data);
      app.innerHTML = `<h1>Can't reach the call</h1><p class="muted">Check your connection and try again.</p><button class="btn out" onclick="location.reload()">Try again</button>`;
      return;
    }
    if (info.status !== "live") {
      app.innerHTML = `<h1>This call has finished</h1><p class="muted">Ask whoever planned it for the plan.</p>`;
      return;
    }
    if (info.closed) {
      app.innerHTML = `<div class="row sb"><span class="tag pri">Quick form · ${esc(info.crew)}</span><span class="tag hot">Closed</span></div><h1>This form has closed</h1><p class="muted">Sidekick picked with the answers it had. Ask whoever planned it for the plan.</p>`;
      return;
    }
    const who = info.people.length ? `${info.people.slice(0, 3).join(", ")}${info.people.length > 3 ? " and others" : ""} ${info.people.length === 1 ? "is" : "are"} on` : "";
    app.innerHTML = `
      <div class="row sb"><span class="tag pri">${info.form ? "Quick form" : "Planning call"} · ${esc(info.crew)}</span>${info.deadline ? `<span class="tag hot" id="closesTag">Closes ${esc(closesLabel(info.deadline))}</span>` : '<span class="orb"></span>'}</div>
      <h1>${esc(info.people[0] || "Your crew")} is planning a night</h1>
      <p class="muted">${esc(who)}. Sidekick is on the call to keep track. Captions are live and the transcript is deleted when the call ends.</p>
      <label class="f">Your name<input class="in" id="name" autocomplete="given-name" maxlength="24" value="${esc(store.get("sk:name") || "")}"></label>
      <div class="priv">
        <span class="lock">${ICON.lock}Only Sidekick sees these</span>
        <p style="font-weight:600">Your max for the night</p>
        <div class="chips" data-name="budget">${PRIVATE_OPTS.budget.map(([v, l]) => chip("budget", v, l, false)).join("")}</div>
        <p style="font-weight:600">Anywhere you'd rather not go? <span class="small">(optional)</span></p>
        <div class="chips" data-name="nos" data-multi>${PRIVATE_OPTS.nos.map(([v, l]) => chip("nos", v, l, false)).join("")}</div>
        <p class="small">The group only ever sees "fits everyone's budget" or a group limit, never your answer.</p>
      </div>
      ${originPicker()}
      <div class="stack" id="formExtra" hidden>
        <p style="font-weight:600">Which nights work?</p><div class="chips" data-name="night" data-multi>${info.nights.map((l, i) => chip("night", i, l, false)).join("")}</div>
        <p style="font-weight:600">What time?</p><div class="chips" data-name="time" data-multi>${PRIVATE_OPTS.time.map(([v, l]) => chip("time", v, l, false)).join("")}</div>
        <p style="font-weight:600">Feeling like</p><div class="chips" data-name="vibe" data-multi>${(info.vibes ? info.vibes.map((o) => [o.value, o.label]) : PRIVATE_OPTS.vibe).map(([v, l]) => chip("vibe", v, l, false)).join("")}${otherHTML()}</div>
      </div>
      <div class="stack" id="joinBtns">
        <button class="btn pri" data-mode="voice">Join with voice</button>
        <button class="btn out" data-mode="text">Join by text</button>
        <button class="btn out" id="formMode">Answer without calling</button>
      </div>`;
    initOrigin();
    const extra = document.getElementById("formExtra");
    if (info.form) setTimeout(() => { const f = document.getElementById("formMode"); if (f && extra.hidden) f.click(); }); // a form: the questions open straight away
    document.getElementById("formMode").onclick = (e) => {
      if (extra.hidden) {
        extra.hidden = false;
        e.target.textContent = "Send my answers";
        e.target.className = "btn pri";
        app.querySelectorAll("[data-mode=voice],[data-mode=text]").forEach((b) => (b.hidden = true));
        extra.scrollIntoView({ behavior: "smooth" });
        e.stopPropagation(); // this first tap only opens the form; the next one sends it
        setTimeout(() => (e.target.dataset.mode = "form"));
      }
    };
    app.querySelector("#joinBtns").addEventListener("click", async (e) => {
      const b = e.target.closest("[data-mode]");
      if (!b) return;
      const name = document.getElementById("name").value.trim();
      if (!name) return toast("Add your name first.");
      const answers = {};
      const one = (k) => picked(k)[0];
      if (one("budget")) answers.budget = one("budget");
      if (picked("nos").length) answers.nos = picked("nos");
      if (b.dataset.mode === "form") {
        // the night chips carry an index; the server knows the dates
        const nightIdx = picked("night").map(Number);
        if (nightIdx.length) answers.nightIdx = nightIdx;
        if (picked("time").length) answers.time = picked("time");
        if (picked("vibe").length) answers.vibe = picked("vibe");
        const own = other.open ? other.draft.trim() : "";
        if (own) answers.want = [own]; // their own words, like saying it on the call
        if (!answers.vibe && !own && other.open) return toast("Type what you're in the mood for, or close Something else.");
      }
      unlockAudio();
      if (one("origin")) {
        const origin = await originAnswer(b);
        if (!origin) return; // no location: Union is now selected, with a note; the next tap joins
        answers.origin = origin;
      }
      b.disabled = true;
      try {
        const out = await api(`/api/sk/rooms/${roomId}/join`, { name, mode: b.dataset.mode, answers, user: userId() || undefined });
        store.set("sk:name", name);
        me = { person: out.person, mode: b.dataset.mode, boot: info.boot };
        store.set(`sk:${roomId}`, me);
        connect();
        if (me.mode === "voice") startMic(); // a friend joining by voice is heard from the start (this tap allows the mic)
      } catch (err) {
        b.disabled = false;
        toast(err.message);
      }
    });
  }

  // ---------- 3. The call ----------
  let me = roomId ? store.get(`sk:${roomId}`) : null;
  let lastMode = null;
  let view = null;
  let es = null;
  let phase = null;
  const colour = (id) => `c${Math.max(0, view.people.findIndex((p) => p.id === id)) % 6}`;
  const send = (action, body = {}) => api(`/api/sk/rooms/${roomId}/${action}`, { p: me.person, ...body }).catch((err) => toast(err.message));

  // ---------- Staying connected ----------
  // Phones lock and networks drop. The browser reconnects the live stream on its own; if it gives up
  // (or the stream goes silent), we reconnect with a growing wait. You stay in the call the whole time.
  // A small "Reconnecting…" pill shows only if it takes more than a moment.
  let lastBeat = 0;
  let retryTimer = null;
  let retries = 0;
  let checking = false;
  let connTimer = null;
  function setConn(ok) {
    const pill = document.getElementById("conn");
    clearTimeout(connTimer);
    if (ok) { pill.hidden = true; return; }
    connTimer = setTimeout(() => { if (phase) pill.hidden = false; }, 2000);
  }
  function connect() {
    clearTimeout(retryTimer);
    if (es) es.close();
    lastBeat = Date.now();
    const stream = new EventSource(`/api/sk/rooms/${roomId}/stream?p=${encodeURIComponent(me.person)}`);
    es = stream;
    stream.onmessage = (e) => {
      if (es !== stream) return;
      lastBeat = Date.now();
      retries = 0;
      setConn(true);
      view = JSON.parse(e.data);
      if (voiceRelevant() || (view.me && view.me.planner && !STUDY)) {
        loadVoiceSetup();
        // The opening line, fetched as soon as the call is up, so the first words don't wait on ElevenLabs
        const first = view.sidekick && view.sidekick.slice(-1)[0];
        if (first && !first.system && view.me.planner && aloud && !Tts.prefetched) { Tts.prefetched = true; Tts.prefetch(first.text, view.voice && view.voice.slot); }
      }
      if (view.boot && me.boot !== view.boot) { me.boot = view.boot; store.set(`sk:${roomId}`, me); }
      render();
      readAloud();
      relayToAgent();
      Audio.sync();
    };
    stream.addEventListener("ping", () => { lastBeat = Date.now(); });
    stream.addEventListener("signal", (e) => { lastBeat = Date.now(); try { Audio.onSignal(JSON.parse(e.data)); } catch (err) { console.error(err); } });
    stream.onerror = () => {
      if (es !== stream) return;
      setConn(false);
      stillThere();
      if (stream.readyState === EventSource.CLOSED) {
        clearTimeout(retryTimer);
        retryTimer = setTimeout(() => es === stream && connect(), Math.min(15000, 1000 * 2 ** retries++));
      }
    };
  }
  // Is the call still there, and are we still in it? Only a clear answer from the server ends the
  // call on screen; no answer at all just means we're offline, so we keep trying.
  async function stillThere() {
    if (checking || !me) return;
    checking = true;
    try {
      const info = await api(`/api/sk/rooms/${roomId}/info?p=${encodeURIComponent(me.person)}`);
      if (!info.member) { leaveQuietly(); store.set(`sk:${roomId}`, null); me = null; joinScreen(); }
    } catch (err) {
      if (err.status === 404) goneScreen(err.data);
    } finally {
      checking = false;
    }
  }
  function leaveQuietly() {
    liveMark(false);
    if (ss.get("sk:onCall")) ss.set("sk:onCall", "");
    clearTimeout(retryTimer);
    if (es) es.close();
    es = null;
    phase = null;
    setConn(true);
    if (micOn) stopMic();
    Audio.stop();
    Audio.autoTried = false;
    if (agent) stopAgent();
  }
  function goneScreen(data) {
    const saved = me || store.get(`sk:${roomId}`);
    const restarted = Boolean(data && data.boot && saved && saved.boot && data.boot !== saved.boot);
    leaveQuietly();
    if (saved) store.set(`sk:${roomId}`, null);
    me = null;
    backdrop(false);
    document.body.classList.remove("sk-live");
    document.body.classList.add("sk-done");
    app.innerHTML = `<section class="done left">${restarted
      ? `<h1 class="done-t">This call ended when the app restarted</h1><p class="muted">Calls live in the app's memory, so a restart ends them. Start a new one and share the new link with your crew.</p><div class="done-foot"><a class="btn pri" href="/sk">Start a new call</a><a class="done-link" href="/" data-screen-to="discover" id="backHome">Back to Discover</a></div>`
      : `<h1 class="done-t">This call isn't running anymore</h1><p class="muted">It may have ended, or the app restarted. The transcript was deleted. Ask whoever sent the link to start a new one, or start your own.</p><div class="done-foot"><a class="btn pri" href="/sk">Start a new call</a><a class="done-link" href="/" data-screen-to="discover" id="backHome">Back to Discover</a></div>`}</section>`;
  }
  // A connection can die without an error (a locked phone). The server sends a heartbeat every 15 s.
  setInterval(() => { if (es && phase && Date.now() - lastBeat > 40000) { setConn(false); connect(); } }, 5000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible" || !es || !me) return;
    if (Date.now() - lastBeat > 20000) connect();
    if (micOn) restartRec(0);
  });
  window.addEventListener("pagehide", () => {
    if (Audio.on && me && navigator.sendBeacon) navigator.sendBeacon(`/api/sk/rooms/${roomId}/audio`, JSON.stringify({ p: me.person, on: false }));
  });

  function render() {
    // The planner of a form ("Send everyone a quick form") sees who's answered until the picks are out
    const next = view.status === "ended" ? "ended" : view.locked ? "locked" : view.picks ? "picks" : view.form && view.me && view.me.planner && !waitingUp() ? "formsent" : "call";
    if (next === "formsent") {
      if (phase === "call") leaveForForm(); // "Wait for everyone": the call ends on Form sent
      if (phase !== "formsent") { phase = "formsent"; app.innerHTML = ""; }
      renderFormSent();
      if (sheetOpen) renderSheet();
      return;
    }
    if (phase === "formsent") pfOn(false);
    if (view.mode !== lastMode) {
      // Said or tapped: a short note confirms Sidekick's new role
      if (lastMode && ["lead", "sidelines"].includes(lastMode) && ["lead", "sidelines"].includes(view.mode) && !(view.wait && view.wait.state === "wait")) toast(view.mode === "lead" ? "Sidekick leads now." : "Sidekick is sitting back. Say \"Sidekick, take over\" to bring it back.");
      lastMode = view.mode;
      if (phase === next) renderDock();
    }
    if (next !== phase) {
      phase = next;
      landed = phase === "picks" && Boolean(lastThinking); // the steps give way to the cards
      app.innerHTML = `<div id="top"></div>${STUDY ? "" : '<div id="stage"></div>'}<div id="say"></div><div id="body" class="stack"></div><div id="ticks" class="stack"></div><p class="sr" id="thinkLive" aria-live="polite"></p><div class="dock" id="dock"></div>`;
      // A live call is full screen with the crew's photo behind it, and no app tab bar until it ends; the ended screen's
      // buttons say where they go. The voice study keeps its own layout.
      const live = phase === "call" || phase === "picks";
      callNav(false);
      // This tab is on a live call until it ends (the Plan tab returns to it meanwhile)
      ss.set("sk:onCall", phase === "ended" ? "" : JSON.stringify({ rid: roomId, crew: view.crew }));
      liveMark(live && !STUDY);
      document.body.classList.toggle("sk-live", live && !STUDY);
      document.body.classList.toggle("sk-done", !live && !STUDY);
      backdrop(live && !STUDY);
      if (!live && chatOpen) closeChat(false);
      if (!live && sheetOpen) closeSheet(false);
      watchDock();
      renderDock();
    }
    renderTop();
    renderStage();
    renderSay();
    const ob = document.querySelector("#orbBtn .orb");
    if (ob) ob.className = `orb ${orbState()}`;
    if (orbOpen) renderOrb();
    if (phase === "call") renderCall();
    if (phase === "picks") renderPicks();
    if (phase === "locked" || phase === "ended") renderDone();
    if (sheetOpen) renderSheet();
    if (chatOpen) renderChat();
    renderMin();
    // Right after the planner starts alone, the People sheet (with the invite link) opens once by itself
    if (phase === "call" && !STUDY && view.me.planner && view.people.length < 2 && !sheetOpen && !orbOpen && !minimized && !store.get(`sk:people:${roomId}`)) {
      store.set(`sk:people:${roomId}`, true);
      openSheet("peopleBtn");
    }
  }

  // The dock is fixed to the bottom; the page gets padding of the dock's height so nothing hides under it
  let dockObserver = null;
  function watchDock() {
    const dock = document.getElementById("dock");
    if (!dock) return;
    const setH = () => document.documentElement.style.setProperty("--dock-h", `${Math.ceil(dock.getBoundingClientRect().height)}px`);
    if (dockObserver) dockObserver.disconnect();
    if (window.ResizeObserver) { dockObserver = new ResizeObserver(setH); dockObserver.observe(dock); }
    setH();
  }

  const voting = () => view && view.card && view.card.slot === "mode";
  const inviteLink = () => `${location.origin}/sk/${roomId}`;

  function renderTop() {
    if (!view || !document.getElementById("top")) return;
    const people = view.people.map((p) => {
      const mine = p.id === view.me.id;
      const st = mine ? (Audio.on ? "connected" : null) : Audio.on && p.audio ? Audio.stateOf(p.id) || "new" : null;
      const dot = st === "connected" ? `<span class="adot ${p.muted ? "muted" : ""}" aria-hidden="true"></span>` : st ? '<span class="adot wait" aria-hidden="true"></span>' : "";
      const label = `${p.name}${p.mode !== "voice" ? ` (${p.mode})` : ""}${!p.online && p.mode !== "form" ? ", reconnecting" : ""}${st === "connected" ? ", in app audio" : st ? ", connecting audio" : ""}${p.muted ? ", muted" : ""}`;
      return `<span class="av ${colour(p.id)} ${p.talking ? "talk" : ""} ${p.mode === "form" || !p.online ? "away" : ""}" title="${esc(label)}" role="img" aria-label="${esc(label)}">${esc(p.initial)}${dot}</span>`;
    }).join("");
    const modeTag = view.me.mode === "voice" ? '<span class="tag hot">Live</span>' : `<span class="tag soc">${view.me.mode === "text" ? "Text · mic off" : "Answered by form"}</span>`;
    // Status, not buttons: in-app audio and Sidekick's natural voice (both switched in the orb sheet)
    const pill = `${Audio.on ? '<span class="schip soc" id="chipAudio"><i aria-hidden="true"></i>In-app audio</span>' : Audio.starting ? '<span class="schip soc wait" id="chipAudio"><i aria-hidden="true"></i>Connecting audio</span>' : ""}${agent ? '<span class="schip pri" id="chipVoice"><i aria-hidden="true"></i>Natural voice</span>' : ""}`;
    // The people picked in the Plan tab who haven't joined yet
    const waiting = (view.expected || []).filter((x) => !x.joined && !x.link).map((x) => x.name);
    const invited = waiting.length ? `<p class="small" id="invitedLine">${view.people.length} checked in · ${esc(waiting.length > 3 ? `${waiting.slice(0, 3).join(", ")} and ${waiting.length - 3} more` : waiting.join(", "))} invited</p>` : "";
    if (STUDY) { document.getElementById("top").innerHTML = `<div class="row sb"><div class="row avs">${people}</div><div class="row schips">${pill}${modeTag}</div></div>${invited}`; return; }
    // The top row: ⌄ minimizes, the voice status pill in the middle, LIVE on the right. The people are on the stage.
    const top = document.getElementById("top");
    if (phase === "locked" || phase === "ended") { if (top.innerHTML) { top.innerHTML = ""; top.dataset.html = ""; } return; }
    const tag = view.me.mode === "voice" ? '<span class="livetag">● LIVE</span>' : modeTag;
    const html = `<div class="ctop"><button class="icon-btn min-btn" id="minBtn" aria-label="Minimize call">${ICON.down}</button><span class="ctop-mid">${voicePillHTML()}</span>${tag}</div>${pill ? `<div class="row schips">${pill}</div>` : ""}${soundBarHTML()}`;
    if (top.dataset.html === html) return;
    const focused = document.activeElement && top.contains(document.activeElement) ? document.activeElement.id : null;
    top.innerHTML = html;
    top.dataset.html = html;
    if (focused) { const again = document.getElementById(focused); if (again) again.focus(); }
  }

  // While a call is live: sk:live = { room, crew } for the app (its Plan tab returns to the call, with a green dot)
  function liveMark(on) {
    try {
      // href and at as the app's SQ.liveCall() reads them (at is refreshed on every update, so a dead tab goes stale)
      if (on && roomId && view) localStorage.setItem("sk:live", JSON.stringify({ room: roomId, crew: view.crew, href: `/sk/${roomId}`, at: Date.now() }));
      else if (!on) { const v = JSON.parse(localStorage.getItem("sk:live") || "null"); if (!v || !roomId || v.room === roomId) localStorage.removeItem("sk:live"); }
    } catch {}
  }
  window.addEventListener("pagehide", () => { if (phase === "call" || phase === "picks") liveMark(false); });
  setInterval(() => { if (es && !STUDY && (phase === "call" || phase === "picks")) liveMark(true); }, 30000); // keep "at" fresh
  window.addEventListener("pageshow", () => { if (es && (phase === "call" || phase === "picks")) liveMark(true); });
  // The crew's photo behind the call: violet duotone, dimmed under a dark wash
  function backdrop(on) {
    let b = document.getElementById("kback");
    if (!on) { if (b) b.remove(); return; }
    if (!b) {
      b = document.createElement("div");
      b.id = "kback";
      b.setAttribute("aria-hidden", "true");
      b.innerHTML = '<span class="duo kphoto"></span><span class="kwash"></span>';
      document.body.insertBefore(b, document.body.firstChild);
    }
    const url = `url("${crewPhoto(view.crew)}")`;
    const ph = b.querySelector(".kphoto");
    if (ph.style.backgroundImage !== url) ph.style.backgroundImage = url;
  }
  // The stage: the orb with the crew around it, a ring on whoever's talking, and invited people as dashed circles.
  // Tapping it opens the People sheet. Smaller with just the orb on "I've got everything"; gone on the picks.
  const ORBIT = [-140, -40, 140, 40, 180, 0, -100, -80, 100, 80];
  function renderStage() {
    const el = document.getElementById("stage");
    if (!el || !view) return;
    if (phase !== "call") { if (!el.hidden) { el.hidden = true; el.innerHTML = ""; el.dataset.html = ""; } return; }
    el.hidden = false;
    const small = Boolean(view.confirm) || Boolean(view.wait && view.wait.state !== "now");
    el.classList.toggle("small", small);
    const waiting = (view.expected || []).filter((x) => !x.joined && !x.link).map((x) => x.name);
    const h = el.clientHeight || 180;
    const R = Math.max(54, Math.min(h / 2 - 22, 104));
    const at = (i) => { const a = (ORBIT[i % ORBIT.length] * Math.PI) / 180; return `left:calc(50% + ${Math.round(Math.cos(a) * R * 1.3)}px);top:calc(50% + ${Math.round(Math.sin(a) * R)}px)`; };
    const people = small ? "" : view.people.map((p, i) => {
      const mine = p.id === view.me.id;
      const st = mine ? (Audio.on ? "connected" : null) : Audio.on && p.audio ? Audio.stateOf(p.id) || "new" : null;
      const dot = st === "connected" ? `<span class="adot ${p.muted ? "muted" : ""}"></span>` : st ? '<span class="adot wait"></span>' : "";
      return `<span class="av orbit ${colour(p.id)}${p.talking ? " talk" : ""}${p.mode === "form" || !p.online ? " away" : ""}" style="${at(i)}" title="${esc(p.name)}">${esc(p.initial)}${dot}</span>`;
    }).join("");
    const shown = small ? [] : waiting.slice(0, waiting.length > 3 ? 2 : 3);
    const inv = shown.map((n, j) => `<span class="orbit inv" style="${at(view.people.length + j)}">${esc(String(n || "?").charAt(0).toUpperCase())}</span>`).join("")
      + (!small && waiting.length > shown.length ? `<span class="orbit inv plus-n" style="${at(view.people.length + shown.length)}">+${waiting.length - shown.length}</span>` : "");
    const label = `People: ${view.people.length} in the call${waiting.length ? `, ${waiting.length} invited` : ""}. Invite friends`;
    const html = `<button class="stage-btn" id="peopleBtn" aria-haspopup="dialog" aria-expanded="${sheetOpen}" aria-controls="sheet" aria-label="${esc(label)}"><span class="ring r1" aria-hidden="true"></span><span class="ring r2" aria-hidden="true"></span><span class="orb stage-orb ${orbState()}" aria-hidden="true"></span><span aria-hidden="true">${people}${inv}</span></button>`;
    if (el.dataset.html === html) return;
    const focused = document.activeElement && el.contains(document.activeElement);
    el.innerHTML = html;
    el.dataset.html = html;
    if (focused) document.getElementById("peopleBtn").focus();
  }

  function boardHead(extra = "") {
    return `<div class="bh"><span class="row"><span class="orb ${orbState()}"></span><h2 style="font-size:15px">${esc(view.crew)}'s plan</h2></span>${extra || progressHTML()}</div>`;
  }
  // Progress the way the conversation goes ("Night ✓ · Vibe · Picks"), not a slot checklist
  function progressHTML() {
    const row = (slot) => view.rows.find((r) => r.slot === slot) || {};
    const nightDone = (view.nights.length === 1 || row("night").state === "done") && row("time").state === "done";
    const stages = [["Night", nightDone], ["Vibe", row("vibe").state === "done"], ["Picks", Boolean(view.picks)]];
    const at = stages.findIndex(([, done]) => !done);
    const label = stages.map(([n, done], i) => `${n} ${done ? "done" : i === at ? "now" : "next"}`).join(", ");
    return `<span class="prog" role="img" aria-label="Progress: ${esc(label)}">${stages.map(([n, done], i) => `<span class="pg ${done ? "done" : i === at ? "now" : ""}">${esc(n)}${done ? " ✓" : ""}</span>`).join('<span class="pg-sep" aria-hidden="true">·</span>')}</span>`;
  }
  const listening = () => phase === "call" && view.mode === "lead" && view.status === "live";
  const thinking = () => phase === "call" && view.thinking && view.thinking.steps && view.thinking.steps.length ? view.thinking : null;
  const orbState = () => (thinking() ? "think" : listening() ? "live" : "");

  // "Finding your two picks": the board becomes a checklist that ticks off as the engine works.
  // A step that just changed gets a short opacity and position change (none with reduced motion).
  let lastThinking = null;
  let landed = false;
  const STEP_ICON = { done: '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>', now: '<i aria-hidden="true"></i>', next: "" };
  const STEP_SR = { done: "done", now: "in progress", next: "next" };
  function thinkingHTML(t) {
    const before = lastThinking && lastThinking.startedAt === t.startedAt ? lastThinking.steps : [];
    const steps = t.steps.map((s, i) => {
      const changed = before.length && (!before[i] || before[i].state !== s.state);
      return `<li class="step ${s.state} ${changed ? "tick" : ""}"><span class="si">${STEP_ICON[s.state] || ""}</span><span class="sl">${esc(s.label)}</span><span class="sr">, ${STEP_SR[s.state] || ""}</span></li>`;
    }).join("");
    return `<div class="board thinking" aria-busy="true">${boardHead('<span class="tag pri">Thinking</span>')}<div class="steps-wrap"><h2 class="steps-h">Finding your two picks</h2><ol class="steps">${steps}</ol></div></div>`;
  }
  function announceThinking(t) {
    const live = document.getElementById("thinkLive");
    if (!live) return;
    const now = t && t.steps.find((s) => s.state === "now");
    const text = now ? now.label : "";
    if (live.textContent !== text) live.textContent = text;
  }
  const avStack = (vs) => (vs.length ? `<span class="stk">${vs.map((v) => `<span class="av xs c${"ABCDEFGHIJKLMNOPQRSTUVWXYZ".indexOf(v) % 6}">${esc(v)}</span>`).join("")}</span>` : "");

  function cardHTML(card, label) {
    // The vibe: the same suggested chips as the form (wrapping pills), plus "+ Something else…" into want
    const opts = card.slot === "vibe" && !STUDY // the voice study keeps its answer rows
      ? `<div class="chips vibe-chips" role="group" aria-label="${esc(card.prompt)}">${card.options.map((o) => `<button class="chip" data-slot="vibe" data-answer="${esc(o.value)}" aria-pressed="${Boolean(o.mine)}">${esc(o.label)}${o.voters.length ? ` <span class="vn">${esc(o.voters.join(""))}</span>` : ""}</button>`).join("")}${otherHTML(true)}</div>`
      : card.options.map((o) => `<button class="ans" data-slot="${esc(card.slot)}" data-answer="${esc(o.value)}" aria-pressed="${Boolean(o.mine)}"><span class="grow">${esc(o.label)}</span>${avStack(o.voters)}</button>`).join("");
    const hint = label || `Sidekick is asking · ${view.me.mode === "voice" ? "say it or tap it" : "tap to answer"}${card.multi ? " · pick any that work" : ""}`;
    if (!STUDY) {
      // The full-screen call: Sidekick's caption says the question once; the card is just the answers, as chips
      const chips = card.slot === "vibe" ? opts : `<div class="chips" role="group" aria-label="${esc(card.prompt)}">${card.options.map((o) => `<button class="chip" data-slot="${esc(card.slot)}" data-answer="${esc(o.value)}" aria-pressed="${Boolean(o.mine)}">${esc(o.label)}${o.voters.length ? ` <span class="vn">${esc(o.voters.join(""))}</span>` : ""}</button>`).join("")}</div>`;
      return `<div class="q"><span class="sr">${esc(hint)}</span><h2 class="sr">${esc(card.prompt)}</h2>${chips}${card.note ? `<span class="small">${esc(card.note)}</span>` : ""}</div>`;
    }
    return `<div class="q"><span class="small">${esc(hint)}</span><h2>${esc(card.prompt)}</h2>${opts}${card.note ? `<span class="small">${esc(card.note)}</span>` : ""}</div>`;
  }

  // The invite and share options: inline while the planner is alone, in a sheet after that
  function shareHTML() {
    const link = inviteLink();
    const msg = `Help plan our next night! Sidekick's on the call: ${link}`;
    const enc = encodeURIComponent;
    const sms = `sms:${IOS ? "&" : "?"}body=${enc(msg)}`;
    const messenger = MOBILE ? `fb-messenger://share/?link=${enc(link)}` : "https://www.messenger.com/";
    // One Share link button (the phone's own share menu) plus Copy; the per-app buttons only where there's no share menu
    if (navigator.share) {
      return `<div class="row"><input class="in link-in" readonly value="${esc(link)}" aria-label="Call link"><button class="btn sm quiet" id="copy">Copy</button></div>
        <button class="btn pri" id="share" style="width:100%">Share link</button><p class="small center">Opens your phone's share menu: WhatsApp, Messages, Instagram…</p>`;
    }
    return `<div class="row"><input class="in link-in" readonly value="${esc(link)}" aria-label="Call link"><button class="btn sm quiet" id="copy">Copy</button></div>
      <div class="share">
        <a href="https://wa.me/?text=${enc(msg)}" target="_blank" rel="noopener">WhatsApp</a>
        <a href="${esc(sms)}">Messages</a>
        <a href="${esc(messenger)}" id="messenger" ${MOBILE ? "" : 'target="_blank" rel="noopener"'}>Messenger</a>
        <a href="https://t.me/share/url?url=${enc(link)}&text=${enc("Help plan our next night! Sidekick's on the call.")}" target="_blank" rel="noopener">Telegram</a>
        <button type="button" id="insta" class="wide">Instagram: copy link, then paste in your DM</button>
      </div>`;
  }
  function invitePanel() {
    const practice = STUDY ? `<button class="btn sm out" id="practice" style="width:100%">Add 2 practice friends</button><p class="small">Testing alone? Practice friends join, vote and tap answers like real friends. They're marked as practice and never counted as testers.</p>` : "";
    const names = view && (view.expected || []).filter((x) => !x.joined && !x.link).map((x) => x.name);
    const to = names && names.length ? `Send it to ${names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0]}. ` : "";
    return `<div class="priv invite"><p style="font-weight:600">Invite your crew</p><p class="small">${esc(to)}Anyone with the link can join from a browser. No app or account needed.</p>${shareHTML()}${practice}</div>`;
  }

  // The People sheet: who's in the call and who's invited, then the invite link and the share buttons. A dialog
  // like the orb sheet: focus kept inside, Escape closes it, focus goes back to what opened it.
  let sheetOpen = false;
  let sheetFrom = null;
  function openSheet(from) {
    sheetOpen = true;
    sheetFrom = from || (document.activeElement && document.activeElement.id) || null;
    renderSheet();
    const pb = document.getElementById("peopleBtn");
    if (pb) pb.setAttribute("aria-expanded", "true");
    const first = document.querySelector("#sheet .sheet-panel button, #sheet .sheet-panel a");
    (first || document.getElementById("sheet")).focus();
  }
  function closeSheet(restore = true) {
    sheetOpen = false;
    const s = document.getElementById("sheet");
    if (s) s.remove();
    const pb = document.getElementById("peopleBtn");
    if (pb) pb.setAttribute("aria-expanded", "false");
    if (!restore) return;
    const back = (sheetFrom && document.getElementById(sheetFrom)) || document.getElementById("peopleBtn") || document.getElementById("orbBtn");
    if (back) back.focus();
  }
  function peopleListHTML() {
    if (!view) return "";
    const inCall = view.people.map((p) => `<li class="pp"><span class="av ${colour(p.id)}" aria-hidden="true">${esc(p.initial)}</span><span class="pp-n">${esc(p.name)}${p.id === view.me.id ? " (you)" : ""}</span><span class="pp-s on">${p.mode === "form" ? "answered by form" : "in the call"}</span></li>`);
    const invited = (view.expected || []).filter((x) => !x.joined && !x.link).map((x) => `<li class="pp"><span class="av xs unk" aria-hidden="true">${esc(String(x.name || "?")[0])}</span><span class="pp-n">${esc(x.name)}</span><span class="pp-s">invited</span></li>`);
    return `<ul class="pp-list" aria-label="People">${[...inCall, ...invited].join("")}</ul>`;
  }
  function renderSheet() {
    let s = document.getElementById("sheet");
    if (!s) {
      s = document.createElement("div");
      s.id = "sheet";
      s.className = "sheet-wrap";
      s.innerHTML = `<div class="sheet-scrim" data-close></div><div class="sheet-panel people-sheet" role="dialog" aria-modal="true" aria-labelledby="sheetTitle" tabindex="-1">
        <div class="row sb"><h2 id="sheetTitle">People</h2><button class="icon-btn" data-close aria-label="Close">${ICON.x}</button></div>
        <div id="ppBody"></div><p class="small">Anyone with the link can join from a browser. No app or account needed.</p>${shareHTML()}</div>`;
      document.body.appendChild(s);
    }
    const body = document.getElementById("ppBody");
    const html = peopleListHTML();
    if (body.dataset.html !== html) { body.innerHTML = html; body.dataset.html = html; } // the list only; the link and buttons stay put under a finger
  }

  // The chat sheet: everything said and typed on the call, Sidekick included, and "Type a message…". It scrolls
  // inside itself; the main screen keeps only Sidekick's latest line. An unread dot sits on the bar's chat button.
  let chatOpen = false;
  let chatSeen = Number(store.get(`sk:chatSeen:${roomId}`)) || 0;
  const chatItems = () => (view && view.chat ? view.chat : []).filter((m) => m.sk || m.kind === "typed" || capsShown);
  const unread = () => chatItems().some((m) => m.at > chatSeen && m.pid !== (view && view.me.id));
  function openChat() {
    chatOpen = true;
    renderChat();
    const b = document.getElementById("chatBtn");
    if (b) b.setAttribute("aria-expanded", "true");
    const i = document.getElementById("chatLine");
    if (i) i.focus();
  }
  function closeChat(restore = true) {
    chatOpen = false;
    const s = document.getElementById("chatSheet");
    if (s) s.remove();
    const b = document.getElementById("chatBtn");
    if (b) { b.setAttribute("aria-expanded", "false"); if (restore) b.focus(); }
  }
  function renderChat() {
    if (!view) return;
    let s = document.getElementById("chatSheet");
    if (!s) {
      s = document.createElement("div");
      s.id = "chatSheet";
      s.className = "sheet-wrap";
      s.innerHTML = `<div class="sheet-scrim" data-chatclose></div><div class="sheet-panel chat-sheet" role="dialog" aria-modal="true" aria-labelledby="chatTitle" tabindex="-1">
        <div class="row sb"><h2 id="chatTitle">Chat</h2><button class="icon-btn" data-chatclose aria-label="Close">${ICON.x}</button></div>
        <div id="chatBody" class="chat-body"></div>
        <form class="compose" id="chatForm"><label class="sr" for="chatLine">Message the call</label><input class="in" id="chatLine" autocomplete="off" placeholder="Type a message…" maxlength="300"><button class="send" aria-label="Send">${ICON.send}</button></form></div>`;
      document.body.appendChild(s);
    }
    const body = document.getElementById("chatBody");
    const items = chatItems();
    const html = chatHTML(items, { chips: false }); // messages only: the answers are on the call's card
    if (body.dataset.html !== html) {
      body.innerHTML = html;
      body.dataset.html = html;
      const th = body.querySelector(".thread");
      if (th) th.scrollTop = th.scrollHeight;
    }
    const newest = Math.max(chatSeen, ...items.map((m) => m.at || 0));
    if (newest !== chatSeen) { chatSeen = newest; store.set(`sk:chatSeen:${roomId}`, chatSeen); }
    const dot = document.querySelector("#chatBtn .udot");
    if (dot) dot.remove();
  }

  // Minimize: back to the app without leaving the call. This page stays mounted (the mic, Sidekick and the voice
  // agent keep running) and the app opens over it in a frame, under a slim "On call · Return" bar.
  let minimized = false;
  function appHome() {
    let demo = false;
    try { demo = sessionStorage.getItem("sq2.demo") === "1"; } catch {}
    return userId() && !demo ? "/sk" : "/";
  }
  function minimize() {
    if (minimized) return;
    if (orbOpen) closeOrb(false);
    if (sheetOpen) closeSheet(false);
    if (chatOpen) closeChat(false);
    minimized = true;
    const home = appHome();
    if (home === "/") ss.set("sq2.screen", "discover");
    const w = document.createElement("div");
    w.id = "minWrap";
    w.className = "min-wrap";
    w.innerHTML = `<div class="oncall" role="region" aria-label="Ongoing call"><span class="orb sm live" aria-hidden="true"></span><span class="oc-t" id="onCallText"></span><button class="btn sm pri" id="returnCall">Return</button></div><iframe id="appFrame" title="SideQuest" src="${home}"></iframe>`;
    document.body.appendChild(w);
    document.documentElement.style.setProperty("--sq-top", `${Math.ceil(w.querySelector(".oncall").getBoundingClientRect().height)}px`);
    app.setAttribute("inert", "");
    app.setAttribute("aria-hidden", "true");
    renderMin();
    document.getElementById("returnCall").focus();
  }
  function restore() {
    if (!minimized) return;
    minimized = false;
    const w = document.getElementById("minWrap");
    if (w) w.remove();
    document.documentElement.style.removeProperty("--sq-top");
    app.removeAttribute("inert");
    app.removeAttribute("aria-hidden");
    const b = document.getElementById("minBtn");
    if (b) b.focus();
  }
  function renderMin() {
    if (!minimized) return;
    // The bar goes when the call ends: stay where they are in the app, as a normal page
    if (!view || view.status !== "live") {
      const f = document.getElementById("appFrame");
      let to = "/";
      try { to = f.contentWindow.location.pathname + f.contentWindow.location.search; } catch {}
      leaveQuietly();
      location.assign(to);
      return;
    }
    const t = document.getElementById("onCallText");
    const text = `On call · ${view.crew}`;
    if (t && t.textContent !== text) t.textContent = text;
  }
  document.addEventListener("click", (e) => {
    if (e.target.closest("#minBtn")) return void minimize();
    if (e.target.closest("#returnCall")) return void restore();
    if (e.target.closest("#peopleBtn")) return void openSheet("peopleBtn");
    if (e.target.closest("#chatBtn")) return void (chatOpen ? closeChat() : openChat());
    if (e.target.closest("[data-chatclose]")) return void closeChat();
  });
  document.addEventListener("keydown", (e) => {
    if (!chatOpen) return;
    if (e.key === "Escape") { e.preventDefault(); closeChat(); return; }
    if (e.key === "Tab") {
      const items = [...document.querySelectorAll("#chatSheet .sheet-panel button, #chatSheet .sheet-panel input")].filter((b) => b.offsetParent);
      if (!items.length) return;
      const [first, last] = [items[0], items[items.length - 1]];
      if (!document.getElementById("chatSheet").contains(document.activeElement)) { e.preventDefault(); first.focus(); }
      else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
  document.addEventListener("keydown", (e) => {
    if (!orbOpen || sheetOpen) return;
    if (e.key === "Escape") { e.preventDefault(); closeOrb(); return; }
    if (e.key === "Tab") {
      const items = [...document.querySelectorAll("#orbSheet .sheet-panel button:not([disabled])")].filter((b) => b.offsetParent && b.tabIndex !== -1);
      if (!items.length) return;
      const [first, last] = [items[0], items[items.length - 1]];
      if (!document.getElementById("orbSheet").contains(document.activeElement)) { e.preventDefault(); first.focus(); }
      else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
  document.addEventListener("keydown", (e) => {
    if (!sheetOpen) return;
    if (e.key === "Escape") { e.preventDefault(); closeSheet(); return; }
    if (e.key === "Tab") { // keep focus inside the sheet
      const items = [...document.querySelectorAll("#sheet .sheet-panel button, #sheet .sheet-panel a, #sheet .sheet-panel input")].filter((b) => b.offsetParent);
      if (!items.length) return;
      const [first, last] = [items[0], items[items.length - 1]];
      if (!document.getElementById("sheet").contains(document.activeElement)) { e.preventDefault(); first.focus(); }
      else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  function chipsRow(card) {
    return `<div class="chips" role="group" aria-label="${esc(card.prompt)}">${card.options.map((o) => `<button class="chip" data-slot="${esc(card.slot)}" data-answer="${esc(o.value)}" aria-pressed="${Boolean(o.mine)}">${esc(o.label)}${o.voters.length ? ` <span class="vn">${esc(o.voters.join(""))}</span>` : ""}</button>`).join("")}${card.slot === "vibe" ? otherHTML(true) : ""}</div>`;
  }

  let budgetOpen = false;
  let voteBar = { closeAt: 0 };
  function renderVote(card) {
    const why = { lead: "Sidekick asks one thing at a time", sidelines: "Sidekick stays quiet until picks" };
    const opts = card.options.map((o) => `<button class="vote-opt" data-slot="mode" data-answer="${esc(o.value)}" aria-pressed="${Boolean(o.mine)}"><span class="vt">${esc(o.label)}</span><span class="small">${esc(why[o.value] || "")}</span>${avStack(o.voters) || '<span class="stk empty"></span>'}</button>`).join("");
    return `<div class="vote"><span class="small">Quick vote · everyone</span><h2${STUDY ? "" : ' class="sr"'}>${esc(card.prompt)}</h2><div class="vote-row">${opts}</div>
      <div class="cd"><div class="cd-bar"><i id="cdBar"></i></div><span class="small">No answer in 3 seconds and Sidekick takes the lead</span></div></div>`;
  }
  function runCountdown() {
    const bar = document.getElementById("cdBar");
    if (!bar) return;
    const closeAt = view.modeCloseAt || Date.now() + 3000;
    if (voteBar.closeAt === closeAt && voteBar.el === bar) return;
    voteBar = { closeAt, el: bar };
    const left = Math.max(0, closeAt - Date.now());
    bar.style.transition = "none";
    bar.style.width = "100%";
    void bar.offsetWidth;
    bar.style.transition = `width ${left}ms linear`;
    bar.style.width = "0%";
  }

  function renderCall() {
    const body = document.getElementById("body");
    if (view.confirm) {
      body.innerHTML = confirmHTML(view.confirm);
      stageIn(body, "confirm");
      runConfirmBar();
      renderTicks();
      return;
    }
    const t = thinking();
    if (t) {
      body.innerHTML = thinkingHTML(t);
      stageIn(body, "thinking");
      lastThinking = t;
      announceThinking(t);
      renderTicks();
      return;
    }
    if (lastThinking) { lastThinking = null; announceThinking(null); }
    if (view.wait && (view.wait.state === "asked" || waitingUp())) {
      // The question needs an answer within seconds: an open sheet gives way to it, once
      if (view.wait.state === "asked" && !waitShown) { waitShown = true; if (sheetOpen) closeSheet(false); if (chatOpen) closeChat(false); if (orbOpen) closeOrb(false); }
      const html = view.wait.state === "asked" ? waitAskHTML(view.wait) : waitingHTML(view.wait);
      if (body.__cardHTML !== html || body.firstElementChild !== body.__cardNode) { body.innerHTML = html; body.__cardHTML = html; body.__cardNode = body.firstElementChild; }
      stageIn(body, view.wait.state === "asked" ? "wait" : "waiting");
      runWaitBar();
      renderTicks();
      return;
    }
    if (voting()) {
      body.innerHTML = renderVote(view.card);
      runCountdown();
      renderTicks();
      return;
    }
    const card0 = view.card && !view.card.form ? view.card : null;
    const form = view.card && view.card.form ? view.card : null;
    // Voice first: a question Sidekick just asked out loud waits about 5 s for a spoken answer before
    // its card shows. Straight away for people typing or answering by form, and for private cards.
    const waitCard = card0 && !card0.private && cardWaits(card0);
    const card = waitCard ? null : card0;
    const rows = view.rows.map((r) => {
      if (card && !card.private && card.slot === r.slot) return "";
      const value = r.state === "conflict" ? r.conflict.join(" vs. ") : r.value || (r.state === "asking" ? "Asking now" : "Not yet");
      if (form) {
        // Sitting back: the board is the form. Each row has its question's chips in place.
        const f = form.slots.find((c) => c.slot === r.slot);
        if (f) return `<div class="r fr ${r.state}"><div class="row sb"><span class="fl">${esc(r.label)}</span>${r.who ? `<span class="who">${esc(r.who)}</span>` : ""}</div>${chipsRow(f)}</div>`;
        if (r.slot === "budget") {
          const b = form.budget;
          if (!b || b.done) return `<div class="r fr priv-row"><div class="row sb"><span class="fl">${esc(r.label)}</span><span class="who">${esc(r.who || "")}</span></div><span class="small">${ICON.lock} Yours is in. Only Sidekick sees it.</span></div>`;
          return `<div class="r fr priv-row dashed"><button class="add-priv" id="budgetToggle" aria-expanded="${budgetOpen}"><span class="fl">${esc(r.label)}</span><span class="grow"></span><span class="lk">${budgetOpen ? "Only Sidekick sees this" : "Add yours privately ›"}</span></button>
            ${budgetOpen ? `<div class="chips">${b.options.map((o) => `<button class="chip" data-slot="budget" data-private="1" data-answer="${esc(o.value)}" aria-pressed="false">${esc(o.label)}</button>`).join("")}</div>` : ""}${r.who ? `<span class="who">${esc(r.who)}</span>` : ""}</div>`;
        }
      }
      const cls = r.slot === "budget" ? "priv-row" : "";
      return `<dl class="r ${r.state} ${cls}" style="margin:0"><dt>${esc(r.label)}</dt><dd>${esc(value)}</dd>${r.who ? `<span class="who">${esc(r.who)}</span>` : ""}</dl>`;
    }).join("");
    let priv = "";
    if (card && card.private) {
      priv = card.waiting
        ? `<div class="priv"><span class="lock">${ICON.lock}Only Sidekick sees this</span><p class="muted">Thanks. Waiting on the others.</p></div>`
        : `<div class="priv"><span class="lock">${ICON.lock}Just for you · nobody else sees this</span><h2>${esc(card.prompt)}</h2>${card.options.map((o) => `<button class="ans" data-answer="${esc(o.value)}" data-private="1"><span class="grow">${esc(o.label)}</span></button>`).join("")}<p class="small">The group only sees one limit, never whose it is.</p></div>`;
    }
    const invite = STUDY && view.me.planner && view.people.length < 2 ? invitePanel() : ""; // elsewhere it's in the People sheet
    const formNote = form ? `<p class="small">Fill it in together. Sidekick suggests two picks once everyone's in.</p>` : "";
    // The card fades in once, when it first shows (not on every update)
    const cardKey = card && `${card.slot}:${card.at}`;
    const fresh = cardKey && !shownCards.has(cardKey);
    if (fresh) shownCards.add(cardKey);
    const ask = card && !card.private ? cardHTML(card).replace('<div class="q">', `<div class="q${fresh && waitedCards.has(cardKey) ? " reveal" : ""}">`) : waitCard ? `<div class="q listen" aria-live="polite"><span class="small">Sidekick is asking · just say it</span><h2${STUDY ? "" : ' class="sr"'}>${esc(card0.prompt)}</h2><span class="small">Tap options show in a moment.</span></div>` : "";
    // The full board stays one tap away; sitting back, the board is the form and always open
    const open = form || boardOpen;
    const full = form ? rows : `<button class="plan-toggle" id="planToggle" aria-expanded="${open}" aria-controls="planRows">${open ? "Hide the full plan" : "See the full plan"}</button><div id="planRows" ${open ? "" : "hidden"}>${rows}</div>`;
    const around = view.candidate && view.me.planner ? `<p class="small cand-note">Planning around the event you saved. It goes in as a pick if it fits.</p>` : "";
    const typingOther = document.activeElement && document.activeElement.id === "vibeOtherIn";
    // The full-screen call: no board title (the stage shows who's here); progress sits with "See the full plan"
    const slim = !STUDY && !form;
    const fullRow = slim ? `<div class="bh slim">${progressHTML()}<button class="plan-toggle" id="planToggle" aria-expanded="${open}" aria-controls="planRows">${open ? "Hide the full plan" : "See the full plan"}</button></div><div id="planRows" ${open ? "" : "hidden"}>${rows}</div>` : full;
    const html = `${invite}<div class="board ${form ? "as-form" : ""}${slim ? " slim" : ""}">${slim ? "" : boardHead()}${heardHTML()}${ask}${fullRow}</div>${around}${formNote}${priv}`;
    // Nothing changed: leave the card alone, so a chip isn't redrawn under someone's finger (or a text box mid-word)
    if (body.__cardHTML === html && body.__cardNode && body.firstElementChild === body.__cardNode) { renderTicks(); return; }
    body.innerHTML = html;
    body.__cardHTML = html;
    body.__cardNode = body.firstElementChild;
    if (typingOther) { const i = document.getElementById("vibeOtherIn"); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }
    stageIn(body, "card");
    renderTicks();
  }

  // ---------- "I've got everything": Sidekick's line and the plan so far, before the steps and picks ----------
  // Public words only (the server builds the facts): no names, the budget only as the group's label.
  function confirmHTML(c) {
    // The dot stays with the fact before it, so a line never starts with one
    const recap = c.facts.map((x, i) => `${i ? (x.join ? esc(x.join) : '<span class="cf-sep">\u00a0· </span>') : ""}<span class="cf-f">${esc(x.text)}</span>`).join("");
    const facts = c.facts.map((x) => `<button class="chip cf-fact" data-reopen="${esc(x.slot)}"><span>${esc(x.text)}</span><span class="sr">: change this</span></button>`).join("");
    if (!STUDY) {
      // The full-screen call: the caption has Sidekick's line; the card is the facts as chips, the progress bar, and
      // Looks good / Change something. A fact joined to the one before ("Saturday" + "after 8") shares its chip.
      const groups = [];
      for (const x of c.facts) { if (x.join && groups.length) groups[groups.length - 1] += `${x.join}${x.text}`; else groups.push(x.text); }
      const chips = groups.map((g, i) => `${i ? '<span class="sr cf-sep">\u00a0· </span>' : ""}<span class="chip cf-f">${esc(g)}</span>`).join("");
      return `<section class="board confirm" aria-labelledby="cfTitle"><div class="cf-b"><h2 class="cf-line sr" id="cfTitle">${esc(c.line)}</h2>
        ${c.editing ? `<p class="small cf-help">Tap what you'd like to change. Its question comes back.</p><div class="chips cf-facts" role="group" aria-label="The plan so far">${facts}</div>` : `<p class="chips cf-recap" id="cfRecap">${chips}</p>`}
        ${c.editing || !c.until ? "" : `<div class="cd"><div class="cd-bar"><i id="cfBar"></i></div><span class="small">Finding your picks…</span></div>`}
        <div class="cf-acts"><button class="btn sm pri" id="cfOk">Looks good</button>${c.editing ? "" : '<button class="btn sm quiet" id="cfChange">Change something</button>'}</div></div></section>`;
    }
    return `<section class="board confirm" aria-labelledby="cfTitle">${boardHead('<span class="tag pri">Got it</span>')}
      <div class="cf-b"><h2 class="cf-line" id="cfTitle">${esc(c.line)}</h2>
        ${c.editing ? `<p class="small cf-help">Tap what you'd like to change. Its question comes back.</p><div class="chips cf-facts" role="group" aria-label="The plan so far">${facts}</div>` : `<p class="cf-recap" id="cfRecap">${recap}</p>`}
        ${c.editing || !c.until ? "" : `<div class="cd"><div class="cd-bar"><i id="cfBar"></i></div><span class="small">Finding your picks in a moment</span></div>`}
        <div class="cf-acts"><button class="btn sm pri" id="cfOk">Looks good</button>${c.editing ? "" : '<button class="btn sm out" id="cfChange">Change something</button>'}</div></div></section>`;
  }
  let cfBar = { until: 0 };
  function runConfirmBar() {
    const bar = document.getElementById("cfBar");
    if (!bar || !view.confirm.until) return;
    if (cfBar.until === view.confirm.until && cfBar.el === bar) return;
    cfBar = { until: view.confirm.until, el: bar };
    const left = Math.max(0, view.confirm.until - Date.now());
    bar.style.transition = "none";
    bar.style.width = `${Math.min(100, (left / 4000) * 100)}%`;
    void bar.offsetWidth;
    bar.style.transition = `width ${left}ms linear`;
    bar.style.width = "0%";
  }
  // The questions, the confirmation, the steps and the picks each come in with a short fade and lift
  // (opacity only with reduced motion). The order is kept for the tests: window.__skStages.
  let lastStage = null;
  window.__skStages = window.__skStages || [];
  function stageIn(el, name) {
    if (name === lastStage) return;
    lastStage = name;
    window.__skStages.push(name);
    const first = el.firstElementChild && (el.querySelector(".board") || el.firstElementChild);
    if (first) first.classList.add("stage-in");
  }

  // "What I heard": a fact that just landed from speech or typing shows briefly, with an undo
  const HEARD_MS = 6000;
  const heardShown = {};
  let heardTimer = null;
  function heardHTML() {
    const list = (view.heard || []).filter((h) => {
      if (!heardShown[h.id]) heardShown[h.id] = Date.now() - Math.min(h.age || 0, HEARD_MS);
      return Date.now() - heardShown[h.id] < HEARD_MS;
    });
    clearTimeout(heardTimer);
    if (list.length) heardTimer = setTimeout(() => view && phase === "call" && renderCall(), Math.max(200, HEARD_MS - (Date.now() - Math.min(...list.map((h) => heardShown[h.id]))) + 50));
    const live = list.map((h) => `${h.name}: ${h.label}`).join(", ");
    return `<div class="heard" ${list.length ? "" : "hidden"}><span class="sr" role="status">${live ? `Heard ${esc(live)}` : ""}</span>${list.map((h) => `<span class="hc${Date.now() - heardShown[h.id] < 300 ? " new" : ""}"><span class="hc-t"><b>${esc(h.name)}:</b> ${esc(h.label)}</span>${h.canUndo ? `<button class="hc-x" data-unhear="${esc(h.id)}" aria-label="Undo: ${esc(h.name)}, ${esc(h.label)}">${ICON.x}</button>` : ""}</span>`).join("")}</div>`;
  }
  // Voice first: how long a just-asked question waits for a spoken answer before its card shows
  const CARD_WAIT_MS = Number(params.get("cardwait") || window.SK_CARD_WAIT_MS || 5000);
  const cardSeen = {};
  let cardTimer = null;
  const shownCards = new Set();
  const waitedCards = new Set();
  function cardWaits(card) {
    if (!card.lead || view.me.mode !== "voice" || typing || capsOff) return false;
    const key = `${card.slot}:${card.at}`;
    waitedCards.add(key);
    if (!cardSeen[key]) cardSeen[key] = Date.now();
    const left = CARD_WAIT_MS - (Date.now() - cardSeen[key]);
    clearTimeout(cardTimer);
    if (left > 0) { cardTimer = setTimeout(() => view && phase === "call" && renderCall(), left + 20); return true; }
    return false;
  }
  // The full plan: folded by default in the full-screen call (the voice study keeps it open unless folded)
  let boardOpen = STUDY ? store.get("sk:boardOpen") !== false : store.get("sk:boardOpen") === true;

  function renderTicks() {
    const t = document.getElementById("ticks");
    if (!t || !view) return;
    if (phase !== "call") { t.innerHTML = ""; return; }
    if (!STUDY) { t.innerHTML = ""; renderChatDot(); return; } // captions and the chat are in the chat sheet
    if (chatMode()) { t.innerHTML = chatHTML(); const th = t.querySelector(".thread"); if (th) th.scrollTop = th.scrollHeight; return; }
    if (!capsShown) { t.innerHTML = ""; return; }
    t.innerHTML = view.captions.slice(-2).map((c) => `<div class="tick"><b>${esc(c.name)}${c.kind === "typed" ? " · typed" : ""}</b><span>${esc(c.text)}</span></div>`).join("") + (interim ? `<div class="tick me"><b>You</b><span>${esc(interim)}</span></div>` : "");
  }

  // Typing: the call reads like a group chat. Sidekick's replies are the shorter text versions, and its
  // latest question has quick replies under it (a tap answers and posts it in the thread).
  const chatMode = () => view && view.me && (view.me.mode === "text" || typing || capsOff);
  function chatHTML(list, { chips: withChips = true } = {}) {
    const items = list || view.chat || [];
    // Quick replies stay under Sidekick's latest question while that question is still open
    const lastSk = [...items].reverse().find((m) => m.sk);
    const open = view.card && !view.card.form && !view.card.private ? view.card.slot : null;
    const quick = lastSk && lastSk.quick && lastSk.quick.slot === open && !voting() && view.status === "live" ? lastSk.quick : null;
    const bubbles = items.map((m) => {
      const mine = m.pid === view.me.id;
      return `<li class="msg ${m.sk ? "sk" : mine ? "me" : "them"}"><span class="msg-who">${m.sk ? "Sidekick" : mine ? "You" : esc(m.who)}${!m.sk && m.kind === "spoken" ? " · said" : ""}</span><span class="msg-t">${esc(m.text)}</span></li>`;
    }).join("");
    const chips = quick && withChips ? `<div class="chips quick" role="group" aria-label="Quick replies">${quick.options.map((o) => `<button class="chip" data-quick="${esc(quick.slot)}" data-value="${esc(o.value)}">${esc(o.label)}</button>`).join("")}</div>` : "";
    return `<section class="chat" aria-label="Call chat"><ol class="thread" aria-live="polite">${bubbles || '<li class="msg sys"><span class="msg-t">Nothing yet. What everyone says and types shows here.</span></li>'}</ol>${chips}</section>`;
  }

  // The Wildcard: labelled, outside what the crew asked for, shown for a look (the vote stays between the two picks)
  function wildHTML(w) {
    if (!w) return "";
    const link = w.url ? `<a class="pk-link" href="${esc(w.url)}" target="_blank" rel="noopener">See tickets<span class="sr"> for ${esc(w.title)} (opens in a new tab)</span></a>` : "";
    return `<div class="wild-card"><div class="wild-in"><span class="row sb"><span class="tag pri kt wild">${ICON.ticket}${w.candidate ? "You saved this" : "Wildcard"}</span></span>
      <h2>${esc(w.title)}</h2><span class="pk-when">${esc(w.when)}</span>
      ${[w.price, w.where].filter(Boolean).map((m) => `<span class="pk-meta">${esc(m)}</span>`).join("")}
      <span class="small" style="color:var(--acc)">${esc(w.why)}</span></div>${link ? `<div class="pk-foot">${link}</div>` : ""}</div>`;
  }

  // The full-screen call's picks: Sidekick's short line in the caption, then each pick with four plain facts (when,
  // the name, who it's for in their words, price and the trip) and one "Vote for this" button. An event is a ticket;
  // a place has a rounded corner. Never a score or the matcher's words.
  function renderPicksCall() {
    const cards = view.picks.map((p) => {
      const voters = view.votes[p.id] || [];
      const mine = view.myVote === p.id;
      const ev = p.kind !== "place";
      const tag = ev ? `<span class="tag kt">${ICON.ticket}Event</span>` : `<span class="tag kt">${ICON.mappin}Place</span>`;
      const meta = [p.price, p.trip || p.where].filter(Boolean).join(" · ");
      const link = p.url ? `<a class="pk-link" href="${esc(p.url)}" target="_blank" rel="noopener">${ev ? "See tickets" : "Directions"}<span class="sr"> for ${esc(p.title)} (opens in a new tab)</span></a>` : "";
      return `<article class="pick-card ${ev ? "ev ticket" : "pl place"}${mine ? " mine" : ""}" aria-label="${esc(p.title)}">${photoHTML(p.title, "pk-ph")}<span class="pk-fade" aria-hidden="true"></span>
        <span class="pk-badge">${tag}<span class="pk-when">${esc(p.when)}</span></span>
        <h2 class="pk-t">${esc(p.title)}</h2>
        ${p.forLine ? `<span class="pk-for">${esc(p.forLine)}</span>` : ""}
        ${meta ? `<span class="pk-meta">${esc(meta)}</span>` : ""}
        <button class="pick vote-btn" data-vote="${p.id}" aria-pressed="${mine}">Vote for this${voters.length ? ` · ${voters.length}` : ""}<span class="sr">: ${esc(p.title)}</span></button>
        ${link || p.attribution ? `<span class="pk-foot">${link}${p.attribution ? `<span class="small">Place info from ${esc(p.attribution)}</span>` : ""}</span>` : ""}</article>`;
    }).join("");
    const lock = view.me.planner
      ? `<button class="btn pri" id="lock" ${Object.keys(view.votes).length ? "" : "disabled"}>Lock in the plan</button>`
      : `<p class="small center">${esc(view.people.find((p) => p.planner)?.name || "The planner")} locks it in once you've voted.</p>`;
    const land = landed ? " land" : "";
    if (landed) setTimeout(() => { landed = false; }, 400);
    lastThinking = null;
    announceThinking(null);
    stageIn({ firstElementChild: null }, "picks");
    const html = `<div class="picks${land}">${cards}</div>${wildHTML(view.wildcard)}<p class="small center">Venues can't pay to appear here.</p>${lock}`;
    const body = document.getElementById("body");
    const key = html.replace(land, "");
    if (body.__picksHTML === key && body.querySelector(".picks")) return;
    body.__picksHTML = key;
    const f = document.activeElement && body.contains(document.activeElement) && document.activeElement.dataset.vote;
    body.innerHTML = html;
    if (f) { const again = body.querySelector(`[data-vote="${f}"]`); if (again) again.focus(); }
    renderTicks();
  }
  function renderPicks() {
    if (!STUDY) return renderPicksCall();
    const crewSize = view.people.length;
    const summary = view.rows.filter((r) => r.value).map((r) => r.value).join(" · ");
    const picks = view.picks.map((p) => {
      const voters = view.votes[p.id] || [];
      const fits = Object.entries(p.fits || {}).filter(([, v]) => v).map(([n, v]) => `<span><b>${esc(n)}</b> ${esc(v)}</span>`).join("");
      // An event is a ticket for a set time; a place is somewhere to drop in while it's open
      const ev = p.kind !== "place";
      const tag = ev ? `<span class="tag pri kt">${ICON.ticket}Event</span>` : `<span class="tag soc kt">${ICON.mappin}Place</span>`;
      const meta = ev
        ? [p.price, p.where]
        : [[p.price, p.where].filter(Boolean).join(" · "), p.rating ? `Rated ${p.rating} on Google${p.ratingCount ? ` · ${p.ratingCount} reviews` : ""}` : null];
      const link = p.url ? `<a class="pk-link" href="${esc(p.url)}" target="_blank" rel="noopener">${ev ? "See tickets" : "Directions"}<span class="sr"> for ${esc(p.title)} (opens in a new tab)</span></a>` : "";
      return `<div class="pick-card ${ev ? "ev" : "pl"}"><button class="pick" data-vote="${p.id}" aria-pressed="${view.myVote === p.id}">
        <span class="row sb"><span class="row" style="gap:6px;flex-wrap:wrap">${tag}${p.candidate ? '<span class="tag soc">You saved this</span>' : ""}${p.closest ? '<span class="tag hot">Closest we found</span>' : ""}</span>${avStack(voters)}</span>
        <h2>${esc(p.title)}</h2>
        ${p.why ? `<span class="pk-why">${esc(p.why.replace(/^Closest we found · /, ""))}</span>` : ""}
        <span class="pk-when">${esc(p.when)}</span>
        ${meta.filter(Boolean).map((m) => `<span class="pk-meta">${esc(m)}</span>`).join("")}
        ${p.reason ? `<span class="small" style="color:var(--acc)">${esc(p.reason)}</span>` : ""}
        ${p.who ? `<span class="pk-who"><b>${p.crewMatch}% crew match</b> · ${esc(p.who)}</span>` : ""}
        ${fits ? `<span class="fits">${fits}</span>` : ""}
        ${p.stretch && p.stretch.length ? `<span class="small">Stretches: ${esc(p.stretch.join(", "))}</span>` : ""}
        <span class="meter"><i style="width:${Math.round((voters.length / crewSize) * 100)}%"></i></span>
      </button>${link || p.attribution ? `<div class="pk-foot">${link}${p.attribution ? `<span class="small">Place info from ${esc(p.attribution)}</span>` : ""}</div>` : ""}</div>`;
    }).join("");
    const mixed = new Set(view.picks.map((p) => (p.kind === "place" ? "place" : "event"))).size > 1;
    const lock = view.me.planner
      ? `<button class="btn pri" id="lock" ${Object.keys(view.votes).length ? "" : "disabled"}>Lock in the plan</button>`
      : `<p class="small center">${esc(view.people.find((p) => p.planner)?.name || "The planner")} locks it in once you've voted.</p>`;
    const land = landed ? " land" : "";
    if (landed) setTimeout(() => { landed = false; }, 400);
    lastThinking = null;
    announceThinking(null);
    stageIn({ firstElementChild: null }, "picks");
    document.getElementById("body").innerHTML = `<div class="board${land}">${boardHead('<span class="tag ok">All set</span>')}<p class="small" style="padding:0 14px 12px;color:var(--t2)">${esc(summary)}</p></div>
      <div class="q${land}" style="border-radius:22px;border:1px solid var(--pri-e)"><span class="small">${view.picks.some((p) => p.closest) ? "Nothing matched exactly, so the closest we found is marked. Tap one to vote." : mixed ? "A show to go to, or a spot to drop in. Tap one to vote." : "Two picks fit everyone · tap one to vote"}</span>${picks}</div>
      ${wildHTML(view.wildcard)}
      <p class="small">Picked for your crew's budget, distance and vibe. Venues can't pay to appear here.</p>
      ${lock}`;
    renderTicks();
  }

  // The way back into the app after a call: the Plan tab when signed in, Discover when signed out or in the demo
  // (the voice study has its own "Back to the checklist" instead)
  function backHome() {
    let demo = false;
    try { demo = sessionStorage.getItem("sq2.demo") === "1"; } catch {}
    return userId() && !demo ? { href: "/sk", screen: null } : { href: "/", screen: "discover" };
  }
  function backBtn() {
    if (STUDY) return "";
    const b = backHome();
    return `<a class="btn pri back-home" id="backHome" href="${b.href}"${b.screen ? ` data-screen-to="${b.screen}"` : ""}>Back to SideQuest</a>`;
  }
  document.addEventListener("click", (e) => {
    // "See it in Sidequests": the app opens the plan's ticket, with Sidequests behind it
    // Both go straight into the app: no start-up loader, and never the opening question (this tab is already in the app)
    const intoApp = () => { ss.set("sq2.quickboot", "1"); if (!ss.get("sq2.mode")) ss.set("sq2.mode", userId() ? "app" : "demo"); };
    if (e.target.closest("#seeQuest")) { intoApp(); ss.set("sq2.screen", "questlog"); return; }
    const a = e.target.closest("#backHome");
    if (!a) return;
    intoApp();
    if (a.dataset.screenTo) ss.set("sq2.screen", a.dataset.screenTo);
    if (a.getAttribute("href") === "/sk") { e.preventDefault(); location.assign("/sk"); }
  }, true);

  // "+ Something else…" on the call's vibe card: their words go in as "want" (Looking for), like saying it
  function sendOther() {
    const text = other.draft.trim();
    if (!text) { const i = document.getElementById("vibeOtherIn"); if (i) i.focus(); return toast("Type what you're in the mood for first."); }
    send("answer", { slot: "want", value: [text], source: "call_card" }).then((r) => { if (r) toast(`Added: ${text}`); });
    other.draft = "";
    other.open = false;
  }
  document.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.id === "vibeOtherIn" && document.getElementById("vibeOtherAdd")) { e.preventDefault(); sendOther(); } });

  // The call's end (design: Call ended): the result first ("Locked in" with the name, the night and who's going, or
  // "No pick this time"), add to calendar and share, the two survey questions, then "See it in Sidequests" (the
  // plan's ticket) and "Back to Discover". The transcript is gone, said in one small line.
  function renderDoneCall() {
    const L = view.locked;
    const body = document.getElementById("body");
    const enc = encodeURIComponent;
    const when = L ? (L.kind === "place" ? [nightOf(L).split(",")[0], L.when.replace(/ · drop in any time$/, "")] : [L.when.replace(" · starts ", " ")]).filter(Boolean).join(" · ") : "";
    const result = L
      ? `<span class="pf-mono ok">Locked in</span><h1 class="done-t" id="recapTitle">${esc(L.title)}</h1><p class="muted" id="doneMeta">${esc([when, String(L.where || "").split(",")[0], `${view.people.length} going`].filter(Boolean).join(" · "))}</p>
        ${L.url ? `<a class="small done-url" href="${esc(L.url)}" target="_blank" rel="noopener">${L.kind === "place" ? "Directions" : "See tickets"}<span class="sr"> (opens in a new tab)</span></a>` : ""}${L.attribution ? `<span class="small">Place info from ${esc(L.attribution)}</span>` : ""}
        <div class="recap-act"><button class="btn sm quiet" id="addCal">Add to calendar</button><button class="btn sm quiet" id="sharePlanBtn" aria-expanded="false" aria-controls="planShare">Share to chat</button></div>
        <div id="planShare" class="stack" hidden>
          <div class="row"><input class="in" readonly value="${esc(planText())}" aria-label="Plan to share" style="font-size:13px"><button class="btn sm out" id="copyPlan">Copy</button></div>
          ${navigator.share ? '<button class="btn sm pri" id="nativeSharePlan" style="width:100%">Share</button>' : `<div class="share"><a href="https://wa.me/?text=${enc(planText())}" target="_blank" rel="noopener">WhatsApp</a><a href="${esc(`sms:${IOS ? "&" : "?"}body=${enc(planText())}`)}">Messages</a></div>`}
        </div>`
      : `<span class="pf-mono">Call ended</span><h1 class="done-t" id="recapTitle">No pick this time</h1><p class="muted">${esc(view.crew)} can plan again any time.</p>`;
    const survey = view.surveyed
      ? `<div class="card done-card"><p>Thanks, that helps us improve Sidekick.</p></div>`
      : `<div class="card done-card" id="survey"><h2>Two quick questions</h2>
          <p class="muted" id="rq1">Did Sidekick feel like a friend on the call?</p>
          <div class="rate" data-q="friend" role="group" aria-labelledby="rq1">${[1, 2, 3, 4, 5].map((n) => `<button data-n="${n}" aria-pressed="false">${n}</button>`).join("")}</div>
          <p class="muted" id="rq2">Did your input count?</p>
          <div class="rate" data-q="heard" role="group" aria-labelledby="rq2">${[1, 2, 3, 4, 5].map((n) => `<button data-n="${n}" aria-pressed="false">${n}</button>`).join("")}</div>
          <p class="small">1 = not at all, 5 = completely</p>
          <button class="btn sm pri" id="sendSurvey" disabled>Send</button>
        </div>`;
    const see = L ? `<a class="btn pri" id="seeQuest" href="/?quest=${enc(L.id)}">See it in Sidequests</a>` : "";
    const last = (view.sidekick || []).filter((x) => !x.system).slice(-1)[0];
    const quote = last && L ? `<p class="done-say" id="doneSay"><span class="cap-l">Sidekick</span>${esc(last.text)}</p>` : "";
    const html = `<div class="done-hero" aria-hidden="true">${photoHTML(view.crew)}<span class="done-fade"></span></div>
      <section class="done${L ? " recap" : ""}" aria-labelledby="recapTitle">${result}${quote}${survey}
        <div class="done-foot">${see}<a class="${L ? "done-link" : "btn pri"}" id="backHome" href="/" data-screen-to="discover">Back to Discover</a>
        <p class="small center">The transcript has been deleted.</p></div></section>`;
    if (body.__doneHTML === html && body.querySelector(".done")) return;
    body.__doneHTML = html;
    // Keep the survey's taps and the open share box when the view updates
    const picks = [...body.querySelectorAll(".rate [aria-pressed=true]")].map((b) => [b.parentElement.dataset.q, b.dataset.n]);
    const box = document.getElementById("planShare");
    const shareOpen = Boolean(box && !box.hidden);
    body.innerHTML = html;
    for (const [q, n] of picks) { const b = body.querySelector(`.rate[data-q="${q}"] [data-n="${n}"]`); if (b) b.setAttribute("aria-pressed", "true"); }
    if (picks.length === 2 && document.getElementById("sendSurvey")) document.getElementById("sendSurvey").disabled = false;
    if (shareOpen && document.getElementById("planShare")) { document.getElementById("planShare").hidden = false; document.getElementById("sharePlanBtn").setAttribute("aria-expanded", "true"); }
    renderTicks();
  }
  function renderDone() {
    if (!STUDY) return renderDoneCall();
    const L = view.locked;
    const plan = L ? recapHTML(L) : `<h1>Call ended</h1><p class="muted">The transcript has been deleted.</p>`;
    const survey = view.surveyed
      ? `<div class="priv" style="border-style:solid;border-color:var(--bs)"><p>Thanks, that helps us improve Sidekick.</p></div>`
      : `<div class="priv" style="border-style:solid;border-color:var(--bs)" id="survey">
          <h2>Two quick questions</h2>
          <p class="muted">Did Sidekick feel like a friend on the call?</p>
          <div class="rate" data-q="friend">${[1, 2, 3, 4, 5].map((n) => `<button data-n="${n}" aria-pressed="false">${n}</button>`).join("")}</div>
          <p class="muted">Did your input count?</p>
          <div class="rate" data-q="heard">${[1, 2, 3, 4, 5].map((n) => `<button data-n="${n}" aria-pressed="false">${n}</button>`).join("")}</div>
          <p class="small">1 = not at all, 5 = completely</p>
          <button class="btn pri" id="sendSurvey" disabled>Send</button>
        </div>`;
    const studyNext = `<div class="priv" style="border-style:solid;border-color:var(--bs)"><h2>Voice ${esc(STUDY_V)} done</h2><p class="muted">Four quick taps about this call, back on the checklist.</p><a class="btn pri" href="/study?s=${encodeURIComponent(STUDY)}#call${esc(STUDY_V)}">Answer 4 quick questions</a></div>`;
    document.getElementById("body").innerHTML = plan + (STUDY ? studyNext : survey + backBtn()); // in the study, its own questions replace these
    callNav(true); // the app's tabs stay on the ended screen too
    renderTicks();
  }

  // ---------- The closing moment: a recap card, add to calendar, share to the group chat ----------
  const nightOf = (L) => (L.date ? new Date(L.date + "T12:00:00").toLocaleDateString("en-CA", { weekday: "long", month: "short", day: "numeric" }) : "");
  function planText() {
    const L = view.locked;
    if (!L) return "";
    return `${view.crew}'s plan: ${L.title}, ${nightOf(L) || L.when}${L.kind === "place" ? "" : ` · ${L.when.split("·").pop().trim()}`}${L.where ? ` · ${L.where}` : ""}.${L.url ? ` ${L.url}` : ""} Planned on SideQuest.`;
  }
  function recapHTML(L) {
    const who = view.people.map((p) => p.name).join(", ");
    const enc = encodeURIComponent;
    const msg = planText();
    const sms = `sms:${IOS ? "&" : "?"}body=${enc(msg)}`;
    return `<section class="board recap" aria-labelledby="recapTitle">${boardHead('<span class="tag ok">Locked</span>')}
      <div class="recap-b stack"><span class="small recap-k">${L.kind === "place" ? "Drop in" : "Tickets"} · ${esc(nightOf(L))}</span>
        <h1 id="recapTitle">${esc(L.title)}</h1>
        <p class="muted">${esc([L.when, L.price, L.where].filter(Boolean).join(" · "))}</p>
        <p class="small recap-who">Going: ${esc(who)}</p>
        ${L.url ? `<a class="small" style="color:var(--soc-x)" href="${esc(L.url)}" target="_blank" rel="noopener">${L.kind === "place" ? "Directions" : "See tickets"}<span class="sr"> (opens in a new tab)</span></a>` : ""}${L.attribution ? `<span class="small">Place info from ${esc(L.attribution)}</span>` : ""}
        <div class="recap-act"><button class="btn sm pri" id="addCal">Add to calendar</button><button class="btn sm out" id="sharePlanBtn" aria-expanded="false" aria-controls="planShare">Share to chat</button></div>
        <div id="planShare" class="stack" hidden>
          <div class="row"><input class="in" readonly value="${esc(msg)}" aria-label="Plan to share" style="font-size:13px"><button class="btn sm out" id="copyPlan">Copy</button></div>
          ${navigator.share ? '<button class="btn sm pri" id="nativeSharePlan" style="width:100%">Share to the group chat</button>' : ""}
          <div class="share"><a href="https://wa.me/?text=${enc(msg)}" target="_blank" rel="noopener">WhatsApp</a><a href="${esc(sms)}">Messages</a><a href="https://t.me/share/url?url=${enc(L.url || location.origin)}&text=${enc(msg)}" target="_blank" rel="noopener">Telegram</a><button type="button" id="copyPlan2" class="wide" data-copyplan>Copy for Instagram or Messenger</button></div>
        </div></div></section>`;
  }
  // An .ics file built here in the page: events at their start time (UTC), places at 7 PM that night
  function icsText() {
    const L = view.locked;
    const pad = (n) => String(n).padStart(2, "0");
    const utc = (d) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;
    const escI = (x) => String(x || "").replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\n/g, "\\n");
    let start, end;
    if (L.startsAt) { const d = new Date(L.startsAt); start = `DTSTART:${utc(d)}`; end = `DTEND:${utc(new Date(d.getTime() + 3 * 3600000))}`; }
    else { const day = String(L.date || "").replace(/-/g, ""); start = `DTSTART;TZID=America/Toronto:${day}T190000`; end = `DTEND;TZID=America/Toronto:${day}T220000`; }
    return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//SideQuest//Sidekick//EN", "CALSCALE:GREGORIAN", "BEGIN:VEVENT", `UID:${roomId}-${L.id}@sidequest`, `DTSTAMP:${utc(new Date())}`, start, end, `SUMMARY:${escI(L.title)}`, `LOCATION:${escI(L.where)}`, `DESCRIPTION:${escI(`${view.crew}'s plan, made with Sidekick. ${L.price || ""}${L.url ? ` ${L.url}` : ""}`)}`, ...(L.url ? [`URL:${L.url}`] : []), "END:VEVENT", "END:VCALENDAR"].join("\r\n") + "\r\n";
  }
  function downloadICS() {
    if (!view || !view.locked) return;
    const url = URL.createObjectURL(new Blob([icsText()], { type: "text/calendar" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${String(view.locked.title).replace(/[^\w]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "plan"}.ics`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast("Calendar file downloaded. Open it to add the plan.");
  }

  // Sidekick's latest line, as one speaker strip right under the people
  let sayTimer = null;
  // The full-screen call: Sidekick's line as large captions, each word brightening as it's said (paced at about a
  // word every 280 ms from when the line came in; all bright straight away with reduced motion or for an old line).
  // On the picks it's the short line ("Two good ones. Tap the one you want."), with the full one for screen readers.
  const WORD_MS = 280;
  const picksLine = () => (view.picks.some((p) => p.closest) ? "Nothing matched exactly, so here's the closest. Tap the one you want." : view.picks.length > 1 ? "Two good ones. Tap the one you want." : "Here's the one. Tap it to vote.");
  function renderCaption(el, last, sitting) {
    if (!last || phase === "locked" || phase === "ended") { if (el.innerHTML) { el.innerHTML = ""; el.dataset.key = ""; } return; }
    const short = phase === "picks" ? picksLine() : null;
    const key = `${last.at}|${last.text}|${sitting}|${short || ""}`;
    if (el.dataset.key === key) return;
    el.dataset.key = key;
    const text = short || last.text;
    const age = Date.now() - (last.at || 0);
    const speaking = !last.system && !sitting && age < 20000;
    const words = text.split(/\s+/).filter(Boolean);
    el.innerHTML = `<div class="cap${speaking ? " speaking" : ""}${last.system ? " sys" : ""}${sitting ? " sitting" : ""}"><span class="cap-l">${sitting ? "Sidekick is sitting back" : "Sidekick"}</span><p class="cap-t${text.length > 120 ? " long" : ""}">${words.map((w, i) => `<span class="w" style="--d:${i * WORD_MS - age}ms">${esc(w)}</span>`).join(" ")}</p>${short ? `<span class="sr">${esc(last.text)}</span>` : ""}</div>`;
  }
  function renderSay() {
    const el = document.getElementById("say");
    if (!el) return;
    const last = view.sidekick.slice(-1)[0];
    const sitting = view.mode === "sidelines" && phase === "call" && !(view.wait && view.wait.state === "wait"); // "Waiting on…" is Sidekick talking
    if (!STUDY) return renderCaption(el, last, sitting);
    if (!last || phase === "ended") { el.innerHTML = ""; return; }
    const fresh = !last.system && !sitting && Date.now() - last.at < 20000;
    clearTimeout(sayTimer);
    if (fresh) sayTimer = setTimeout(() => view && renderSay(), 20000 - (Date.now() - last.at) + 50);
    el.innerHTML = `<div class="say ${fresh ? "new" : ""} ${last.system ? "sys" : ""}"><span class="orb sm ${orbState()}"></span><div class="say-t"><span class="say-l">${sitting ? "Sidekick is sitting back" : "SIDEKICK"}</span><p>${esc(last.text)}</p></div></div>`;
  }

  // The bottom bar: mic, the Sidekick orb and leave. Nothing else by default; everything else is in the orb sheet.
  function renderDock() {
    const dock = document.getElementById("dock");
    if (!dock || !view) return;
    if (phase === "locked" || phase === "ended") {
      dock.innerHTML = view.me.planner && phase === "locked" ? `<button class="btn out" id="endCall">End the call</button>` : "";
      if (!dock.innerHTML) dock.hidden = true;
      if (orbOpen) closeOrb(false);
      return;
    }
    dock.hidden = false;
    const voice = view.me.mode === "voice";
    const capsNote = capsOff ? `<p class="small center">Captions pause on this phone during in-app audio. Type to Sidekick.</p>` : "";
    const showCompose = !voice || typing || capsOff;
    const hint = hintText();
    const micLive = agent ? !agentMuted : micOn;
    dock.innerHTML = `${capsNote}${hint ? `<p class="vhint" id="vhint" role="status"><span class="orb sm" aria-hidden="true"></span><span>${esc(hint)}</span></p>` : ""}
      <form class="compose" id="compose" ${showCompose ? "" : "hidden"}><label class="sr" for="line">Message the call</label><input class="in" id="line" autocomplete="off" placeholder="${voice ? "Type instead…" : "Type to the call…"}" maxlength="300"><button class="send" aria-label="Send">${ICON.send}</button></form>
      <div class="ctrls">
        ${voice ? `<button class="ctrl" id="mic" aria-pressed="${micLive}" aria-label="${micLive ? "Mute" : "Unmute"}">${micLive ? ICON.mic : ICON.micOff}</button>` : '<span class="ctrl-sp" aria-hidden="true"></span>'}
        ${STUDY ? "" : `<button class="ctrl" id="chatBtn" aria-haspopup="dialog" aria-expanded="${chatOpen}" aria-controls="chatSheet" aria-label="Chat${unread() ? ", new messages" : ""}">${ICON.chat}${unread() && !chatOpen ? '<span class="udot" aria-hidden="true"></span>' : ""}</button>`}
        <button class="ctrl orb-ctrl" id="orbBtn" aria-haspopup="dialog" aria-expanded="${orbOpen}" aria-controls="orbSheet" aria-label="Sidekick options"><span class="orb ${orbState()}"></span></button>
        <button class="ctrl end" id="leave" aria-label="${view.me.planner ? "End the call" : "Leave the call"}">${ICON.x}</button>
      </div>`;
    if (orbOpen) renderOrb();
  }

  // The unread dot on the chat button, without redrawing the bar
  function renderChatDot() {
    const b = document.getElementById("chatBtn");
    if (!b) return;
    const on = unread() && !chatOpen;
    const dot = b.querySelector(".udot");
    if (on && !dot) b.insertAdjacentHTML("beforeend", '<span class="udot" aria-hidden="true"></span>');
    if (!on && dot) dot.remove();
    b.setAttribute("aria-label", `Chat${on ? ", new messages" : ""}`);
  }

  // A one-time hint that Sidekick takes voice commands (once per phone)
  let hintShownAt = 0;
  function hintText() {
    if (!view || phase !== "call" || view.me.mode !== "voice" || !["lead", "sidelines"].includes(view.mode)) return "";
    if (view.wait && view.wait.state !== "now") return ""; // "wait for everyone?" and "Waiting on…" have the screen
    if (!hintShownAt) {
      if (store.get("sk:voiceHint")) return "";
      hintShownAt = Date.now();
      store.set("sk:voiceHint", true);
      setTimeout(() => { if (phase === "call") renderDock(); }, HINT_MS + 50);
    }
    if (Date.now() - hintShownAt > HINT_MS) return "";
    return view.mode === "sidelines" ? "Try saying “Sidekick, take over”" : "Try saying “Sidekick, sit back”";
  }
  const HINT_MS = 8000;

  // ---------- The orb sheet: everything that used to sit in the bar ----------
  // Sidekick leads or sits back, captions, type instead (study), invite friends, ask for picks now, and "Don't learn from this plan". A dialog with focus
  // kept inside, Escape to close, and focus back on the orb.
  let orbOpen = false;
  let capsShown = store.get("sk:captions") !== false;
  function openOrb() {
    orbOpen = true;
    renderOrb();
    const btn = document.getElementById("orbBtn");
    if (btn) btn.setAttribute("aria-expanded", "true");
    const first = document.querySelector("#orbSheet .sheet-panel [role=radio][aria-checked=true], #orbSheet .sheet-panel button:not([disabled])");
    (first || document.querySelector("#orbSheet .sheet-panel")).focus();
  }
  function closeOrb(restore = true) {
    orbOpen = false;
    const s = document.getElementById("orbSheet");
    if (s) s.remove();
    const btn = document.getElementById("orbBtn");
    if (btn) { btn.setAttribute("aria-expanded", "false"); if (restore) btn.focus(); }
  }
  const osw = (id, label, sub, on, extra = "") => `<button class="osw" id="${id}" role="switch" aria-checked="${Boolean(on)}" ${extra}><span class="osw-t"><b>${esc(label)}</b>${sub ? `<span class="small">${esc(sub)}</span>` : ""}</span><span class="osw-k" aria-hidden="true"></span></button>`;
  const oact = (id, label, icon, extra = "") => `<button class="oact" id="${id}" ${extra}>${icon}<span>${esc(label)}</span></button>`;
  function orbHTML() {
    const voice = view.me.mode === "voice";
    const vote = view.mode === "voting";
    const seg = view.mode && phase === "call"
      ? `<div class="seg ${vote ? "off" : ""}" role="radiogroup" aria-label="How Sidekick helps" ${vote ? 'aria-disabled="true" inert' : ""}>
          <button role="radio" data-setmode="lead" aria-checked="${view.mode === "lead"}" tabindex="${view.mode === "lead" || vote ? 0 : -1}">Sidekick leads</button>
          <button role="radio" data-setmode="sidelines" aria-checked="${view.mode === "sidelines"}" tabindex="${view.mode === "sidelines" ? 0 : -1}">Sidekick sits back</button></div>`
      : "";
    return `${seg}
      <div class="ogroup">${osw("capsBtn", "Captions", "Live words from the call", capsShown)}
        ${osw("learnBtn", "Don't learn from this plan", "This call won't change your taste", view.me.noLearn)}</div>
      <div class="ogroup acts">
        ${voice && STUDY ? oact("kb", typing ? "Hide the text box" : "Type instead", '<span class="oi" aria-hidden="true">Aa</span>') : ""}
        ${oact("inviteBtn", "Invite friends", ICON.invite, 'aria-haspopup="dialog"')}
        ${phase === "call" ? oact("ask", "Ask Sidekick for picks now", '<span class="orb sm" aria-hidden="true"></span>') : ""}
      </div>
      <p class="small">Or just say it: “Sidekick, sit back”, “Sidekick, take over”, “Sidekick, invite someone”, “Sidekick, mute me”.</p>`;
  }
  function renderOrb() {
    if (!view) return;
    let s = document.getElementById("orbSheet");
    if (!s) {
      s = document.createElement("div");
      s.id = "orbSheet";
      s.className = "sheet-wrap";
      s.innerHTML = `<div class="sheet-scrim" data-orbclose></div><div class="sheet-panel orb-sheet" role="dialog" aria-modal="true" aria-labelledby="orbTitle" tabindex="-1">
        <div class="row sb"><span class="row"><span class="orb"></span><h2 id="orbTitle">Sidekick</h2></span><button class="icon-btn" data-orbclose aria-label="Close">${ICON.x}</button></div><div id="orbBody" class="stack"></div></div>`;
      document.body.appendChild(s);
    }
    const body = document.getElementById("orbBody");
    const html = orbHTML();
    if (body.dataset.html === html) return; // nothing changed: don't redraw under someone's finger
    const a = document.activeElement;
    const key = a && body.contains(a) ? (a.id ? `#${a.id}` : a.dataset.setmode ? `[data-setmode="${a.dataset.setmode}"]` : null) : null;
    body.innerHTML = html;
    body.dataset.html = html;
    if (key) { const again = body.querySelector(key); if (again) again.focus(); }
  }

  // Voice commands that this phone handles itself (spoken or typed): "Sidekick, invite someone" and "Sidekick,
  // mute me". "Sidekick, sit back / take over" go to the server like any line (TAKE_OVER / STEP_BACK in rooms.js).
  const CMD_INVITE = /\bside ?kick\b[\s,.!]*(?:can you |could you |please )?(?:invite|add)\s+(?:someone|somebody|people|a friend|friends|more people|my friends?)\b/i;
  const CMD_MUTE = /\bside ?kick\b[\s,.!]*(?:can you |could you |please )?mute me\b/i;
  function localCommand(text) {
    if (CMD_INVITE.test(text)) {
      if (orbOpen) closeOrb(false);
      if (chatOpen) closeChat(false);
      openSheet();
      toast("Here's the invite link to share.");
      return true;
    }
    if (CMD_MUTE.test(text)) {
      if (agent) setAgentMuted(true);
      else if (micOn) stopMic();
      toast(view && view.me.mode === "voice" ? "Muted. Tap the mic to talk again." : "You're typing, so there's no mic to mute.");
      return true;
    }
    return false;
  }
  let agentMuted = false;
  function setAgentMuted(m) {
    agentMuted = m;
    try { if (agent && agent.setMicMuted) agent.setMicMuted(m); } catch {}
    Audio.setMuted(m); // the crew in in-app audio can't hear you either
    renderDock();
  }
  // The mic button mutes everything on this phone: in-app audio, captions, and (on the planner's phone) the agent's mic
  function toggleMute() {
    if (agent) return setAgentMuted(!agentMuted);
    if (micOn) stopMic(); else startMic();
  }

  // Taps (in the call, and in the invite sheet, which lives outside #app)
  function onTap(e) {
    const t = e.target;
    if (t.closest("#sheet [data-close]")) return void closeSheet();
    if (t.closest("#invitePill")) return void openSheet();
    if (t.closest("#orbBtn")) return void (orbOpen ? closeOrb() : openOrb());
    if (t.closest("[data-orbclose]")) return void closeOrb();
    if (t.closest("#inviteBtn")) { closeOrb(false); return void openSheet("orbBtn"); }
    if (t.closest("#capsBtn")) { capsShown = !capsShown; store.set("sk:captions", capsShown); renderTicks(); renderOrb(); toast(capsShown ? "Captions on." : "Captions off on this phone."); return; }
    if (t.closest("#learnBtn")) {
      const off = !view.me.noLearn;
      view.me.noLearn = off;
      renderOrb();
      send("learn", { off });
      return void toast(off ? "This plan won't change your taste." : "This plan counts toward your taste again.");
    }
    if (t.closest("#cfOk")) { t.closest("#cfOk").disabled = true; return void send("confirm", { how: "ok" }); }
    if (t.closest("#waitAll") || t.closest("#waitNow")) {
      const b = t.closest("#waitAll") || t.closest("#waitNow");
      document.querySelectorAll("#waitAll,#waitNow").forEach((x) => { x.disabled = true; });
      return void send("wait", { choice: b.id === "waitAll" ? "wait" : "now" });
    }
    if (t.closest("#waitShare")) { waitHold = Date.now() + 8000; return void shareFormLink(); }
    if (t.closest("#waitDeadline")) { waitEdit = !waitEdit; waitHold = Date.now() + 8000; return void render(); }
    const wd = t.closest("[data-waitdeadline]");
    if (wd) {
      const at = Number(wd.dataset.waitdeadline);
      waitEdit = false;
      waitHold = Date.now() + 4000;
      send("setup", { deadline: at }).then((r) => { if (r) toast(`Decide by ${closesLabel(at)}.`); });
      return void render();
    }
    if (t.closest("#cfChange")) return void send("confirm", { how: "change" });
    const ro = t.closest("[data-reopen]");
    if (ro) { ro.disabled = true; send("confirm", { how: "reopen", slot: ro.dataset.reopen }); return void toast("Okay, change it on the card."); }
    if (t.closest("#budgetToggle")) { budgetOpen = !budgetOpen; renderCall(); return; }
    if (t.closest("#planToggle")) { boardOpen = !boardOpen; store.set("sk:boardOpen", boardOpen); renderCall(); const b = document.getElementById("planToggle"); if (b) b.focus(); return; }
    const un = t.closest("[data-unhear]");
    if (un) { un.disabled = true; send("unhear", { id: un.dataset.unhear }); toast("Taken back. Say it again or tap the card."); return; }
    const qr = t.closest("[data-quick]");
    if (qr) { qr.disabled = true; send("line", { text: qr.textContent.trim(), kind: "typed", quick: { slot: qr.dataset.quick, value: qr.dataset.value } }); return; }
    if (t.closest("#addCal")) return void downloadICS();
    if (t.closest("#sharePlanBtn")) { const box = document.getElementById("planShare"); if (box) { box.hidden = !box.hidden; t.closest("#sharePlanBtn").setAttribute("aria-expanded", String(!box.hidden)); } return; }
    if (t.closest("#copyPlan") || t.closest("[data-copyplan]")) return void copyText(planText(), "Plan copied. Paste it in the group chat.");
    if (t.closest("#nativeSharePlan")) return void navigator.share({ title: `${view.crew}'s plan`, text: planText() }).catch(() => {});
    if (t.closest("#vibeOtherAdd")) return void sendOther();
    const ans = t.closest("[data-answer]");
    if (ans && view && view.card) {
      const card = view.card.form ? (ans.dataset.slot === "budget" ? view.card.budget : view.card.slots.find((c) => c.slot === ans.dataset.slot)) : view.card;
      if (!card) return;
      let value = ans.dataset.answer;
      if (card.multi && !ans.dataset.private) {
        const now = card.options.filter((o) => o.mine).map((o) => o.value);
        value = now.includes(value) ? now.filter((v) => v !== value) : [...now, value];
      }
      ans.setAttribute("aria-pressed", ans.getAttribute("aria-pressed") !== "true");
      if (card.slot === "budget") budgetOpen = false;
      send("answer", { slot: card.slot, value, source: "call_card" });
      return;
    }
    const vote = t.closest("[data-vote]");
    if (vote) return void send("vote", { eventId: Number(vote.dataset.vote) });
    if (t.closest("#lock")) return void send("lock", {});
    if (t.closest("#copy")) return void copyText(inviteLink(), "Link copied. Paste it in the group chat.");
    if (t.closest("#insta")) return void copyText(inviteLink(), "Link copied. Open Instagram and paste it in your DM.");
    if (t.closest("#messenger")) {
      // The Messenger app opens from its link on phones. If it isn't installed (or on a computer), copy the link instead.
      copyText(inviteLink(), "Link copied. Paste it in a Messenger chat.");
      return;
    }
    if (t.closest("#share")) return void navigator.share({ title: `${(view && view.crew) || (flow.data ? crewName() : "The crew")}: help plan our next night`, text: "Help plan our next night! Sidekick's on the call:", url: inviteLink() }).catch(() => {});
    if (t.closest("#ask")) { if (orbOpen) closeOrb(); return void send("ask", {}); }
    if (t.closest("#practice")) { t.closest("#practice").disabled = true; return void studyApi("practice", { room: roomId, p: me.person }).catch((err) => { toast(err.message); renderCall(); }); }
    const sm = t.closest("[data-setmode]");
    if (sm) {
      if (view.mode === "voting" || sm.dataset.setmode === view.mode) return;
      return void send("mode", { value: sm.dataset.setmode });
    }
    if (t.closest("#mic")) return void toggleMute();
    if (t.closest("#kb")) { typing = !typing; closeOrb(!typing); renderDock(); if (typing) document.getElementById("line").focus(); return; }
    if (t.closest("#leave") || t.closest("#endCall")) return void openEndSheet(t.closest("#leave, #endCall").id);
    const rate = t.closest(".rate button");
    if (rate) {
      rate.parentElement.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", b === rate));
      const ready = [...app.querySelectorAll(".rate")].every((r) => r.querySelector("[aria-pressed=true]"));
      document.getElementById("sendSurvey").disabled = !ready;
      return;
    }
    if (t.closest("#sendSurvey")) {
      const val = (q) => Number(app.querySelector(`.rate[data-q=${q}] [aria-pressed=true]`).dataset.n);
      send("survey", { friend: val("friend"), heard: val("heard") });
    }
  }
  app.addEventListener("click", onTap);
  document.addEventListener("click", (e) => { if (e.target.closest("#sheet") || e.target.closest("#orbSheet") || e.target.closest("#chatSheet")) onTap(e); });

  // ---------- The red ✕ asks first ----------
  // The planner: End for everyone, Just leave (they carry on; the next person can lock the plan), or Keep going.
  // A friend: Leave call or Keep going. A dialog: focus inside, Escape keeps going, focus back on the ✕.
  let endFrom = null;
  function openEndSheet(from) {
    if (!view) return;
    endFrom = from;
    if (orbOpen) closeOrb(false);
    if (sheetOpen) closeSheet(false);
    if (chatOpen) closeChat(false);
    const others = view.people.filter((p) => p.id !== view.me.id);
    const names = others.map((p) => p.name);
    const who = names.length > 2 ? `${names[0]} and the others` : names.join(" and ");
    const planner = view.me.planner;
    const s = document.createElement("div");
    s.id = "endSheet";
    s.className = "sheet-wrap";
    s.innerHTML = `<div class="sheet-scrim" data-endno></div><div class="sheet-panel end-sheet" role="dialog" aria-modal="true" aria-labelledby="endT" tabindex="-1"><span class="grab" aria-hidden="true"></span>
      ${planner
        ? `<h2 id="endT">End the call?</h2><p class="muted">${others.length ? `You started this plan. Ending it closes the call for ${esc(who)} too.` : "The transcript is deleted when it ends."}</p>
          <button class="btn danger" id="endAll">End for everyone</button>${others.length && phase !== "locked" ? '<button class="btn quiet" id="justLeave">Just leave (they carry on)</button>' : ""}`
        : `<h2 id="endT">Leave the call?</h2><p class="muted">You can rejoin with the same link while it's running.</p><button class="btn danger" id="leaveCall">Leave call</button>`}
      <button class="btn plain" id="keepGoing" data-endno>Keep going</button></div>`;
    document.body.appendChild(s);
    document.getElementById("keepGoing").focus();
  }
  function closeEndSheet(restore = true) {
    const s = document.getElementById("endSheet");
    if (s) s.remove();
    const b = restore && endFrom && document.getElementById(endFrom);
    if (b) b.focus();
  }
  // Left the call (a friend, or the planner who let the others carry on): rejoin with the same link, or back to the app
  function leftScreen() {
    liveMark(false);
    leaveQuietly();
    backdrop(false);
    document.body.classList.remove("sk-live");
    document.body.classList.add("sk-done");
    app.innerHTML = `<section class="done left" aria-labelledby="leftT"><span class="pf-mono">Call</span><h1 class="done-t" id="leftT">You left the call</h1><p class="muted">You can rejoin with the same link while it's running.</p>
      <div class="done-foot"><button class="btn pri" onclick="location.reload()">Rejoin</button><a class="done-link" id="backHome" href="/" data-screen-to="discover">Back to Discover</a></div></section>`;
  }
  document.addEventListener("click", (e) => {
    if (!e.target.closest("#endSheet")) return;
    if (e.target.closest("[data-endno]")) return void closeEndSheet();
    if (e.target.closest("#endAll")) { closeEndSheet(false); if (agent) stopAgent(); return void send("end", {}); }
    if (e.target.closest("#justLeave") || e.target.closest("#leaveCall")) {
      closeEndSheet(false);
      if (agent) stopAgent();
      send("leave", {});
      return void leftScreen();
    }
  });
  document.addEventListener("keydown", (e) => {
    const sheet = document.getElementById("endSheet");
    if (!sheet) return;
    if (e.key === "Escape") { e.preventDefault(); closeEndSheet(); return; }
    if (e.key === "Tab") {
      const items = [...sheet.querySelectorAll("button")];
      const [a, b] = [items[0], items[items.length - 1]];
      if (!sheet.contains(document.activeElement)) { e.preventDefault(); a.focus(); }
      else if (e.shiftKey && document.activeElement === a) { e.preventDefault(); b.focus(); } else if (!e.shiftKey && document.activeElement === b) { e.preventDefault(); a.focus(); }
    }
  });
  // Arrow keys move between the two segments of the mode switch
  document.addEventListener("keydown", (e) => {
    const r = e.target.closest && e.target.closest(".seg [role=radio]");
    if (!r || !["ArrowLeft", "ArrowRight"].includes(e.key)) return;
    e.preventDefault();
    const other = [...r.parentElement.children].find((x) => x !== r);
    other.focus();
    other.click();
  });
  document.addEventListener("submit", (e) => {
    if (e.target.id !== "compose" && e.target.id !== "chatForm") return;
    e.preventDefault();
    const input = document.getElementById(e.target.id === "chatForm" ? "chatLine" : "line");
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    if (localCommand(text)) return;
    send("line", { text, kind: "typed" });
  });

  // ---------- ElevenLabs voice agent (planner's phone only) ----------
  // When ElevenLabs is set up, the planner's phone starts Sidekick's natural voice on the same tap as
  // "Start the call", and the agent leads the talk turn by turn, like ElevenLabs' own agent page. It
  // uses client tools (below), which run here in the planner's browser and call our API as the planner:
  // the engine stays the source of truth for facts, privacy and picks, and the board updates live.
  // This phone passes the agent only what it can't hear: typed lines and lines from friends in in-app
  // audio (as messages), and joins, taps, form answers and picks on screen (as context, no reply).
  // If the session can't start, drops, or the minute cap is reached, the built-in voice takes over quietly.
  const EL_CLIENT = "https://cdn.jsdelivr.net/npm/@elevenlabs/client@1.38.0/+esm";
  let agent = null;
  let agentStarting = false;
  let agentStart = 0;
  let agentCapped = false; // the minute cap was hit: no natural voice for the rest of this call
  let agentDropped = false; // shown once: "switched to the built-in voice"
  // Every call starts the natural voice when it's available. Older builds remembered a "Natural voice" switch
  // here; once it was off, no later call reached ElevenLabs. That key is ignored and cleared.
  try { localStorage.removeItem("sk:agentVoice"); localStorage.removeItem("sk:aloud"); } catch {}
  let elModule = null;
  let primedMic = null;
  const relayed = new Set();
  // Load the SDK early (it also unlocks iPhone audio on the first tap), so Start doesn't wait for it
  const loadEL = () => (elModule = elModule || import(EL_CLIENT).catch((err) => { elModule = null; throw err; }));
  // Called synchronously inside the Start tap: the mic prompt comes from that gesture
  function primeAgentAudio() {
    try {
      if (!primedMic && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) primedMic = navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => null);
    } catch { primedMic = null; }
  }
  function releasePrimedMic() {
    const p = primedMic;
    primedMic = null;
    if (p) p.then((stream) => stream && stream.getTracks().forEach((t) => t.stop())).catch(() => {});
  }
  const toolCall = (name) => async (params) => api(`/api/sk/rooms/${roomId}/agent-tool/${name}`, { p: me.person, ...(params && typeof params === "object" ? params : {}) });
  const AGENT_TOOLS = ["get_plan_state", "get_next_move", "record_facts", "get_picks", "show_private_card", "accept_relax", "choose_wait"];
  async function startAgent({ auto = false } = {}) {
    if (agent || agentStarting || agentCapped || !me || STUDY) return;
    agentStarting = true;
    agentDropped = false;
    vset("agent", "connecting");
    if (phase) renderDock();
    let reserved = false;
    const hadMic = micOn;
    try {
      const sdk = loadEL();
      sdk.catch(() => {}); // a failed load is handled below (when it's awaited); not an unhandled rejection meanwhile
      const s = await api(`/api/sk/rooms/${roomId}/voice-agent`, { p: me.person });
      reserved = true;
      let Conversation;
      try { ({ Conversation } = await sdk); } catch { throw Object.assign(new Error("The voice code didn't load"), { vreason: "sdk" }); }
      if (micOn) stopMic();
      Audio.setMuted(agentMuted); // the agent has the mic now; in-app audio stays open unless you muted
      if ("speechSynthesis" in window) speechSynthesis.cancel();
      // Mark everything already on screen as passed on, so the agent only gets what happens next
      if (view) { view.captions.forEach((c) => relayed.add(`l:${c.id}`)); view.sidekick.forEach((x) => relayed.add(`s:${x.id}`)); (view.agentNotes || []).forEach((n) => relayed.add(`n:${n.id}`)); }
      const clientTools = Object.fromEntries(AGENT_TOOLS.map((t) => [t, toolCall(t)]));
      let session = null;
      const opts = {
        dynamicVariables: s.dynamicVariables,
        clientTools,
        onMessage: (m) => {
          const role = m.source || m.role;
          const text = String(m.message || m.text || "").trim();
          if (!text) return;
          if (role === "ai" || role === "agent") send("agent-said", { text });
          else if (role === "user") send("line", { text, kind: "spoken" });
        },
        // A failing tool is reported to the agent by the SDK; only a real session error switches voices
        onError: (message, context) => { if (!(context && context.clientToolName)) agentFallback(message); },
        onDisconnect: () => { if (agent && agent === session) agentFallback("disconnected"); },
      };
      // WebRTC first (what ElevenLabs' own page uses: echo cancellation and smoother audio), then websocket
      const tries = [];
      if (s.conversationToken) tries.push({ conversationToken: s.conversationToken, connectionType: "webrtc" });
      if (s.signedUrl) tries.push({ signedUrl: s.signedUrl, connectionType: "websocket" });
      let lastErr = new Error("No way to connect");
      for (const t of tries) {
        try {
          session = await Promise.race([Conversation.startSession({ ...opts, ...t }), new Promise((_, no) => setTimeout(() => no(Object.assign(new Error("timeout"), { vreason: "timeout" })), 15000))]);
          break;
        } catch (err) { lastErr = err; }
      }
      if (!session) throw Object.assign(lastErr, { vreason: lastErr.vreason || (lastErr.name === "NotAllowedError" || /permission|not allowed/i.test(lastErr.message || "") ? "mic" : "network") });
      agent = session;
      vset("agent", "live");
      agentMuted = false;
      agentStart = Date.now();
      releasePrimedMic();
      await api(`/api/sk/rooms/${roomId}/voice-agent/live`, { p: me.person });
      relayToAgent();
    } catch (err) {
      const a = agent;
      agent = null;
      releasePrimedMic();
      if (a) { try { await a.endSession(); } catch {} }
      if (err && err.data && err.data.capped) agentCapped = true;
      const why = (err && (err.vreason || (err.data && err.data.reason))) || "network";
      vset("agent", agentCapped || why === "limit" ? "capped" : /^(no-key|no-agent|off)$/.test(why) ? `not-set-up:${why}` : `failed:${why}`);
      if (reserved) api(`/api/sk/rooms/${roomId}/voice-agent/end`, { p: me.person, seconds: 0 }).catch(() => {});
      // Quietly carry on with the built-in voice. A tap on the switch gets a short note; the automatic start doesn't.
      if (!auto) toast(agentCapped ? "Sidekick's natural voice is resting for now. The built-in voice carries on." : "Couldn't start Sidekick's natural voice. The built-in voice carries on.");
      // The natural voice didn't start (on its own, at the start of the call, the mic was never on yet):
      // listen with the captions mic so nobody is left muted with nothing hearing them
      if ((hadMic || auto) && !micOn && me && me.mode === "voice" && phase !== "ended" && phase !== "locked") startMic();
    } finally {
      agentStarting = false;
      if (phase) renderDock();
    }
  }
  // The session dropped or errored: switch to the built-in voice once, with at most one short note
  function agentFallback() {
    if (!agent) return;
    stopAgent();
    vset("agent", "failed:disconnected");
    if (!agentDropped) { agentDropped = true; toast("Switched to Sidekick's built-in voice."); }
    if (me && me.mode === "voice" && !micOn && (phase === "call" || phase === "picks")) startMic();
  }
  async function stopAgent() {
    const a = agent;
    agent = null;
    const seconds = agentStart ? Math.round((Date.now() - agentStart) / 1000) : 0;
    agentStart = 0;
    send("voice-agent/end", { seconds });
    try { if (a) await a.endSession(); } catch {}
    if (phase === "call" || phase === "picks") renderDock();
  }
  function relayToAgent() {
    // The server still thinks this phone runs the agent (the page reloaded mid-call): hand back to the built-in voice
    if (view && view.agentOn && view.me.planner && !agent && !agentStarting && !relayToAgent.ended) { relayToAgent.ended = true; send("voice-agent/end", { seconds: 0 }); }
    if (view && !view.agentOn) relayToAgent.ended = false;
    // The server gave up on a silent live voice: close this phone's session and carry on with the built-in voice
    if (agent && view && view.agentSilent && view.agentSilent !== relayToAgent.silent) {
      relayToAgent.silent = view.agentSilent;
      agentFallback();
      vset("agent", "failed:silent");
      return;
    }
    if (!agent || !view) return;
    try {
      const remote = (pid) => { const p = view.people.find((x) => x.id === pid); return Boolean(p && p.audio && Audio.on); };
      for (const c of view.captions) {
        if (relayed.has(`l:${c.id}`)) continue;
        relayed.add(`l:${c.id}`);
        if (c.pid === view.me.id) continue; // the agent heard it itself
        // Typed lines, and friends talking through in-app audio, never reach the agent's mic: they get a reply.
        // Friends in the same room were heard by the mic already: context only, so it doesn't answer twice.
        if (c.kind === "typed" || remote(c.pid)) agent.sendUserMessage(`${c.name}${c.kind === "typed" ? " (typed)" : ""}: ${c.text}`);
        else agent.sendContextualUpdate(`${c.name} said: ${c.text}`);
      }
      for (const x of view.sidekick) {
        if (relayed.has(`s:${x.id}`)) continue;
        relayed.add(`s:${x.id}`);
        if (x.system) agent.sendContextualUpdate(`[app] ${x.text}`); // e.g. "Sam answered by form: Saturday"
      }
      for (const n of view.agentNotes || []) {
        if (relayed.has(`n:${n.id}`)) continue;
        relayed.add(`n:${n.id}`);
        agent.sendContextualUpdate(n.text);
      }
    } catch (err) {
      console.error(err);
    }
  }
  window.addEventListener("pagehide", () => {
    if (agent && me && navigator.sendBeacon) navigator.sendBeacon(`/api/sk/rooms/${roomId}/voice-agent/end`, JSON.stringify({ p: me.person, seconds: agentStart ? Math.round((Date.now() - agentStart) / 1000) : 0 }));
  });

  // ---------- Voice: captions from this phone's mic ----------
  // iPhone Safari stops recognition every few seconds (and after each pause), so while the mic is on
  // we keep starting a fresh recogniser. Anything heard but not yet final when it stops is sent too.
  let rec = null;
  let micOn = false;
  let typing = false;
  let interim = "";
  let paused = false;
  let recTimer = null;
  let recFails = 0;
  let capsOff = false; // this device can't caption while in-app audio is on (iPhones)
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  function startMic() {
    if (!SR && !Audio.on) {
      toast("Live captions need Chrome, Edge or Safari. You can type instead.");
      typing = true;
      renderDock();
      return;
    }
    micOn = true;
    recFails = 0;
    if (!capsOff) startRec();
    Audio.setMuted(false);
    renderDock();
  }
  function startRec() {
    if (!micOn || paused || capsOff || !SR) return;
    if (rec) { rec.onend = rec.onresult = rec.onerror = null; try { rec.abort(); } catch {} }
    const r = new SR(); // a fresh one each time: Safari doesn't reliably restart an old one
    rec = r;
    r.lang = "en-CA";
    r.continuous = true;
    r.interimResults = true;
    r.onstart = () => { recFails = 0; };
    r.onresult = (e) => {
      let partial = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const x = e.results[i];
        if (x.isFinal) { if (!localCommand(x[0].transcript)) send("line", { text: x[0].transcript, kind: "spoken" }); }
        else partial += x[0].transcript;
      }
      interim = partial;
      if (phase === "call") renderTicks();
    };
    r.onend = () => {
      if (rec !== r) return;
      if (interim.trim()) { send("line", { text: interim.trim(), kind: "spoken" }); interim = ""; }
      restartRec(recFails > 3 ? 2000 : 250);
    };
    r.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        micOn = false;
        toast("The microphone is blocked. You can type instead.");
        typing = true;
        renderDock();
      } else if (e.error === "audio-capture" && Audio.on) {
        captionsUnavailable(); // this phone can't share the mic between captions and in-app audio
      } else recFails++;
    };
    try { r.start(); } catch { restartRec(1000); }
  }
  function restartRec(ms) {
    clearTimeout(recTimer);
    if (micOn && !paused && !capsOff) recTimer = setTimeout(startRec, ms);
  }
  function stopRec() {
    clearTimeout(recTimer);
    if (rec) { const r = rec; rec = null; r.onend = r.onresult = r.onerror = null; try { r.stop(); } catch {} }
  }
  function stopMic() {
    micOn = false;
    interim = "";
    stopRec();
    Audio.setMuted(true);
    if (phase === "call" || phase === "picks") renderDock();
  }
  function captionsUnavailable() {
    if (capsOff) return;
    capsOff = true;
    stopRec();
    interim = "";
    typing = true;
    toast("On this phone, captions pause while in-app audio is on. Type to Sidekick instead.");
    renderDock();
  }

  // ---------- In-app audio: WebRTC mesh, 2 to 6 people ----------
  // Each pair of phones connects directly. For each pair, the person whose id sorts first makes the
  // offer, so two phones never offer at once. Messages go through our server's /signal route and come
  // back on the live stream as "signal" events.
  const Audio = {
    on: false,
    starting: false,
    muted: false,
    ducked: false,
    local: null,
    ice: [],
    peers: new Map(), // pid -> { pc, el, queue: [], tries }
    supported: Boolean(window.RTCPeerConnection && navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
    box() {
      let b = document.getElementById("skAudio");
      if (!b) { b = document.createElement("div"); b.id = "skAudio"; b.hidden = true; document.body.appendChild(b); }
      return b;
    },
    async start({ auto = false } = {}) {
      if (this.on || this.starting || !this.supported) return;
      this.starting = true;
      renderDock();
      try {
        this.local = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
        const out = await api(`/api/sk/rooms/${roomId}/audio`, { p: me.person, on: true, muted: !micOn });
        this.ice = out.iceServers || [];
        this.on = true;
        this.muted = !micOn;
        this.apply();
        if (IOS && SR) captionsUnavailable(); // iPhones can't run captions and a call on the mic together
        toast(IOS ? "In-app audio is on. Captions pause on iPhone, so type to Sidekick." : "In-app audio is on. Headphones stop echo.");
        this.sync();
      } catch (err) {
        if (this.local) this.local.getTracks().forEach((t) => t.stop());
        this.local = null;
        toast(err.name === "NotAllowedError" ? (auto ? "The microphone is blocked, so friends who aren't with you can't hear you." : "The microphone is blocked, so in-app audio can't start.") : err.message || "In-app audio couldn't start.");
      } finally {
        this.starting = false;
        renderDock();
        renderTop();
      }
    },
    // Talk in the app is automatic: once this phone is in voice and someone else on the call is in voice too,
    // in-app audio starts (once per call), then the mic is on as before. No switch.
    autoTried: false,
    auto() {
      if (this.autoTried || this.on || this.starting || !this.supported || STUDY) return;
      if (view.me.mode !== "voice" || (phase !== "call" && phase !== "picks")) return;
      if (!view.people.some((p) => p.id !== me.person && p.mode === "voice" && p.online)) return;
      this.autoTried = true;
      this.start({ auto: true }).then(() => {
        if (!this.on) return;
        if (agent) this.setMuted(agentMuted);
        else if (!micOn) startMic();
      });
    },
    stop() {
      if (!this.on && !this.local) return;
      for (const pid of [...this.peers.keys()]) { this.signal(pid, "bye", null); this.drop(pid); }
      if (this.local) this.local.getTracks().forEach((t) => t.stop());
      this.local = null;
      const wasOn = this.on;
      this.on = false;
      if (capsOff) { capsOff = false; if (micOn) startRec(); }
      if (wasOn && me) api(`/api/sk/rooms/${roomId}/audio`, { p: me.person, on: false }).catch(() => {});
      if (phase) { renderDock(); renderTop(); }
    },
    apply() { if (this.local) this.local.getAudioTracks().forEach((t) => (t.enabled = !this.muted && !this.ducked)); },
    setMuted(m) {
      if (!this.on) return;
      this.muted = m;
      this.apply();
      api(`/api/sk/rooms/${roomId}/audio`, { p: me.person, on: true, muted: m }).catch(() => {});
    },
    duck(d) { this.ducked = d; this.apply(); }, // quiet our mic while this phone reads Sidekick aloud
    signal(to, kind, data) { return api(`/api/sk/rooms/${roomId}/signal`, { p: me.person, to, kind, data }).catch(() => {}); },
    // Called on every update: connect to everyone with audio on, drop anyone who turned it off
    sync() {
      if (!view || !me) return;
      const mine = view.people.find((p) => p.id === me.person);
      if (!this.on && !this.starting && mine && mine.audio) api(`/api/sk/rooms/${roomId}/audio`, { p: me.person, on: false }).catch(() => {}); // a reload ended our audio
      this.auto();
      if (!this.on) return;
      const others = new Map(view.people.filter((p) => p.id !== me.person && p.audio).map((p) => [p.id, p]));
      for (const pid of [...this.peers.keys()]) if (!others.has(pid)) this.drop(pid);
      for (const pid of others.keys()) if (!this.peers.has(pid) && me.person < pid) this.call(pid);
    },
    peer(pid) {
      const pc = new RTCPeerConnection({ iceServers: this.ice });
      const el = document.createElement("audio");
      el.autoplay = true;
      el.setAttribute("playsinline", "");
      this.box().appendChild(el);
      const peer = { pc, el, queue: [], tries: (this.peers.get(pid) || {}).tries || 0 };
      this.local.getTracks().forEach((t) => pc.addTrack(t, this.local));
      pc.onicecandidate = (e) => { if (e.candidate) this.signal(pid, "ice", e.candidate.toJSON()); };
      pc.ontrack = (e) => {
        el.srcObject = e.streams[0] || new MediaStream([e.track]);
        el.play().catch(() => toast("Tap anywhere to hear your crew."));
      };
      pc.onconnectionstatechange = () => {
        if (this.peers.get(pid) !== peer) return;
        if (pc.connectionState === "connected") peer.tries = 0;
        if (pc.connectionState === "failed") {
          this.drop(pid, true);
          if (me.person < pid && peer.tries < 3) setTimeout(() => { if (this.on && !this.peers.has(pid)) { this.call(pid, peer.tries + 1); } }, 2000);
          else if (me.person < pid) toast("Couldn't connect audio with someone. Their network may need a relay server (see the README).");
        }
        renderTop();
      };
      this.peers.set(pid, peer);
      return peer;
    },
    drop(pid, keepTries) {
      const p = this.peers.get(pid);
      if (!p) return;
      this.peers.delete(pid);
      try { p.pc.close(); } catch {}
      p.el.remove();
      if (phase) renderTop();
    },
    async call(pid, tries = 0) {
      const peer = this.peer(pid);
      peer.tries = tries;
      const offer = await peer.pc.createOffer();
      await peer.pc.setLocalDescription(offer);
      this.signal(pid, "offer", { type: offer.type, sdp: offer.sdp });
    },
    async onSignal({ from, kind, data }) {
      if (kind === "bye") return void this.drop(from);
      if (!this.on) { if (kind === "offer") this.signal(from, "bye", null); return; }
      if (kind === "offer") {
        if (this.peers.has(from)) this.drop(from); // a fresh offer replaces any old connection
        const peer = this.peer(from);
        await peer.pc.setRemoteDescription(data);
        for (const c of peer.queue.splice(0)) await peer.pc.addIceCandidate(c).catch(() => {});
        const answer = await peer.pc.createAnswer();
        await peer.pc.setLocalDescription(answer);
        this.signal(from, "answer", { type: answer.type, sdp: answer.sdp });
        return;
      }
      const peer = this.peers.get(from);
      if (!peer) return;
      if (kind === "answer" && peer.pc.signalingState === "have-local-offer") {
        await peer.pc.setRemoteDescription(data);
        for (const c of peer.queue.splice(0)) await peer.pc.addIceCandidate(c).catch(() => {});
      }
      if (kind === "ice" && data) {
        if (peer.pc.remoteDescription) await peer.pc.addIceCandidate(data).catch(() => {});
        else peer.queue.push(data);
      }
    },
    stateOf(pid) { const p = this.peers.get(pid); return p ? p.pc.connectionState : null; },
    state() {
      const peers = {};
      for (const [pid, p] of this.peers) peers[pid] = p.pc.connectionState;
      return { on: this.on, muted: this.muted, captions: !capsOff, peers };
    },
  };
  window.__skAudioState = () => Audio.state();

  // ---------- Reading Sidekick aloud: the planner's phone only, and only in a pause ----------
  // Picks the most natural voice this device has (Edge "Online (Natural)", Apple "Premium"/"Enhanced",
  // Google), gives each persona its own voice, cleans text for speech, and stops when someone talks.
  const NOVELTY = /Albert|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Deranged|Good News|Hysterical|Jester|Junior|Kathy|Organ|Princess|Ralph|Superstar|Trinoids|Whisper|Wobble|Zarvox|Fred|eSpeak/i;
  const GOOD_NAMES = /\b(Ava|Emma|Andrew|Brian|Jenny|Aria|Guy|Michelle|Christopher|Eric|Steffan|Clara|Liam|Samantha|Zoe|Allison|Evan|Nathan|Joelle|Noelle|Tom|Susan|Serena|Daniel|Karen|Moira|Tessa)\b/;
  const Voice = {
    score(v) {
      if (!/^en(-|_|$)/i.test(v.lang) || NOVELTY.test(v.name)) return -1;
      let s = 10;
      if (/natural/i.test(v.name)) s += 60;
      if (/premium/i.test(v.name)) s += 50;
      if (/enhanced/i.test(v.name)) s += 40;
      if (/^Google/i.test(v.name)) s += 25;
      if (GOOD_NAMES.test(v.name)) s += 10;
      if (/en[-_](CA|US)/i.test(v.lang)) s += 5;
      if (/compact/i.test(v.name)) s -= 20;
      return s;
    },
    quality(v) {
      return /natural/i.test(v.name) ? "Natural" : /premium/i.test(v.name) ? "Premium" : /enhanced/i.test(v.name) ? "Enhanced" : /^Google/i.test(v.name) ? "Google" : "Standard";
    },
    list() {
      if (!("speechSynthesis" in window)) return [];
      return speechSynthesis.getVoices().map((v) => ({ v, s: Voice.score(v) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s || a.v.name.localeCompare(b.v.name)).map((x) => x.v);
    },
    // slot: "friend" or "concierge". A saved choice wins; otherwise the best voice, and the
    // facilitator takes the next best one so the two personas sound different.
    pick(slot) {
      const all = Voice.list();
      const saved = store.get(`sk:voice:${slot}`);
      const chosen = saved && all.find((v) => v.name === saved);
      if (chosen) return chosen;
      return slot === "concierge" ? all[1] || all[0] : all[0];
    },
    speakable(text) {
      const days = { Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday", Sat: "Saturday", Sun: "Sunday" };
      return String(text)
        .replace(/\([^)]*\)/g, "")
        .replace(/\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun),?\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+\d{1,2}\b/g, (m, d) => days[d])
        .replace(/\$(\d+)(\.00)?\b/g, "$1 dollars")
        .replace(/\bw\//gi, "with ")
        .replace(/\s@\s/g, " at ")
        .replace(/&/g, " and ")
        .replace(/^Free event\.\s*/i, "")
        .replace(/\s{2,}/g, " ")
        .trim();
    },
    // A reply split into sentences, so the first one starts speaking straight away (long utterances
    // start later on some phones, and some cut off after about 15 seconds). Short bits stay joined.
    sentences(text) {
      const parts = String(text).match(/[^.!?]+(?:[.!?]+["')\]]*|$)\s*/g) || [String(text)];
      const out = [];
      for (const p of parts.map((x) => x.trim()).filter(Boolean)) {
        if (out.length && (p.split(/\s+/).length < 3 || out[out.length - 1].split(/\s+/).length < 3)) out[out.length - 1] += ` ${p}`;
        else out.push(p);
      }
      return out.length ? out : [String(text)];
    },
    // Say a line now, sentence by sentence. Returns the first utterance, with all of them in .chunks
    // (used by the demo's voice picker too).
    say(text, { slot = "concierge", rate = 1, pitch = 1, voice } = {}) {
      const v = voice || Voice.pick(slot);
      const chunks = Voice.sentences(Voice.speakable(text)).map((part) => {
        const u = new SpeechSynthesisUtterance(part);
        if (v) { u.voice = v; u.lang = v.lang; } else u.lang = "en-CA";
        u.rate = rate;
        u.pitch = /natural|premium|enhanced/i.test((v && v.name) || "") ? 1 : pitch; // good voices sound worse when pitch-shifted
        return u;
      });
      speechSynthesis.cancel();
      for (const u of chunks) speechSynthesis.speak(u); // queued: the next starts as the last ends
      chunks[0].chunks = chunks;
      return chunks[0];
    },
  };
  window.SidekickVoice = Voice;
  if ("speechSynthesis" in window) { speechSynthesis.getVoices(); speechSynthesis.addEventListener?.("voiceschanged", () => {}); }

  const aloud = true; // Sidekick is always read aloud: the phone's volume and the mute button are enough
  let lastRead = null;
  function readAloud(tries = 0) {
    // Barge-in: if anyone else starts talking while Sidekick is speaking, stop at once
    if (view.people.some((p) => p.talking && p.id !== view.me.id)) { if (Tts.speaking()) Tts.stop(); if ("speechSynthesis" in window && speechSynthesis.speaking) speechSynthesis.cancel(); }
    // Who reads aloud: the planner's phone (unless the voice agent is speaking there), and, when the crew
    // is in in-app audio, every phone in it, so remote friends hear Sidekick too
    const plannerReads = view.me.planner && !agent && !agentStarting;
    const remoteReads = Audio.on && !view.me.planner;
    if (!aloud || !(plannerReads || remoteReads) || (view.form && phase === "formsent")) return;
    const last = view.sidekick.slice(-1)[0];
    if (!last || last.system || last.id === lastRead) return;
    if (lastRead === null && Date.now() - last.at > 15000) { lastRead = last.id; return; } // don't replay old lines after a reload
    // Never talk over anyone: wait while someone has spoken since this line was made, or this phone
    // is mid-sentence. The person who just asked Sidekick something isn't "talking over" its answer.
    const over = view.people.some((p) => p.talking && p.spokeAt > last.at) || Boolean(interim.trim());
    if (over && tries < 8) return void setTimeout(() => readAloud(tries + 1), 400);
    lastRead = last.id;
    let ended = false;
    const resume = () => { if (ended) return; ended = true; Audio.duck(false); if (paused) { paused = false; restartRec(150); } };
    const start = () => { Audio.duck(true); if (micOn) { paused = true; stopRec(); } }; // don't caption (or send) Sidekick's own voice
    speakLine(last.text, view.voice.slot, view.voice, { onstart: start, onend: resume });
    setTimeout(resume, 6000 + Voice.speakable(last.text).split(/\s+/).length * 600); // some phones never fire the end
  }

  // ---------- Sidekick's voice status: can anyone hear it, and if not, why ----------
  // Three ways Sidekick is heard, tried in order, each with a specific result:
  //   agent (the natural voice): connecting / live / failed:<reason> / capped / not-set-up:<no-key|no-agent|off> / off
  //   backup (ElevenLabs reads each line, POST /api/sk/tts): ok / not-set-up / limit / refused:<401|403|5xx> / timeout / error
  //   phone (speechSynthesis): ok / blocked / unavailable
  // plus playBlocked: the phone refused to play sound (NotAllowedError) until someone taps. A pill in the top row says
  // it in a few words, the "Sidekick's voice" sheet in plain words, and each failure is reported to the server log
  // (path, reason and a short platform like "iPhone Safari": nothing personal).
  const VS = { agent: null, backup: null, phone: null, playBlocked: false, setup: null, last: null, onAt: 0, reported: new Set(), asked: false };
  const voiceRelevant = () => Boolean(view && view.me && !STUDY && (view.me.planner || Audio.on) && (phase === "call" || phase === "picks"));
  function uaShort() {
    const u = navigator.userAgent;
    const dev = /iPhone/.test(u) ? "iPhone" : /iPad/.test(u) || (IOS && /Mac/.test(u)) ? "iPad" : /Android/.test(u) ? "Android" : /Mac/.test(u) ? "Mac" : /Windows/.test(u) ? "Windows" : /Linux/.test(u) ? "Linux" : "Other";
    const br = /Edg\//.test(u) ? "Edge" : /CriOS|Chrome\//.test(u) ? "Chrome" : /FxiOS|Firefox\//.test(u) ? "Firefox" : /Safari\//.test(u) ? "Safari" : "Browser";
    return `${dev} ${br}`;
  }
  const failed = (path, v) => (path === "agent" ? /^(failed|capped)/.test(v || "") || (/^not-set-up/.test(v || "") && Boolean(VS.setup && VS.setup.key)) : path === "backup" ? v && v !== "ok" : path === "phone" ? v === "blocked" || v === "unavailable" : Boolean(v));
  function voiceReport(path, reason) {
    const k = `${path}:${reason}`;
    if (VS.reported.has(k) || !me || !roomId) return;
    VS.reported.add(k);
    api(`/api/sk/rooms/${roomId}/voice-report`, { p: me.person, path, reason: String(reason), ua: uaShort() }).catch(() => {});
  }
  function vset(path, value) {
    if (VS[path] === value) return;
    VS[path] = value;
    if (path === "agent" && value === "live") VS.onAt = Date.now();
    if (failed(path, value)) voiceReport(path, path === "playBlocked" ? "NotAllowedError" : value);
    renderVoice();
  }
  let voiceTimer = null;
  function renderVoice() {
    if (phase !== "call" && phase !== "picks") return;
    renderTop();
    if (voiceOpen) renderVoiceSheet();
  }
  // What the server has: the key and agent (yes or no only) and what's left on the meters
  async function loadVoiceSetup() {
    if (VS.asked || !me) return;
    VS.asked = true;
    try {
      const st = await api(`/api/sk/rooms/${roomId}/voice-setup`, { p: me.person });
      VS.setup = st;
      if (!st.key) { if (!VS.agent) VS.agent = "not-set-up:no-key"; if (!VS.backup) VS.backup = "not-set-up"; }
      else {
        if (!VS.agent && (st.off || !st.agent)) VS.agent = `not-set-up:${st.off ? "off" : "no-agent"}`;
        if (!VS.backup && st.ttsOff) VS.backup = "not-set-up";
        if (!VS.backup && st.tts && st.tts.capped) VS.backup = "limit";
        if (!VS.agent && st.minutes && st.minutes.capped) VS.agent = "capped";
      }
      for (const k of ["agent", "backup"]) if (failed(k, VS[k])) voiceReport(k, VS[k]);
      renderVoice();
    } catch {}
  }
  // The pill: only when there's something to say (or for 3 s once the natural voice is on, then a green dot)
  function voicePill() {
    const a = VS.agent || "", b = VS.backup, ph = VS.phone;
    if (VS.playBlocked) return "nosound";
    if (a === "connecting") return "connecting";
    if (a === "live") return "on";
    const agentDown = /^(failed|capped)/.test(a) || (/^not-set-up/.test(a) && Boolean(VS.setup && VS.setup.key && VS.setup.agent));
    if (b === "ok") return agentDown ? "backup" : "on";
    if (b === "limit" && ph !== "blocked" && ph !== "unavailable") return "limit";
    if (ph === "blocked" || ph === "unavailable") return "nosound";
    if (ph === "ok") return "backup";
    return null;
  }
  const PILL = { connecting: ["Connecting voice…", "pri"], on: ["Voice on", "ok"], backup: ["Backup voice", "amb", "Why?"], limit: ["Voice limit reached", "amb", "Why?"], nosound: ["No sound", "hot", "Tap to fix"] };
  function voicePillHTML() {
    if (!voiceRelevant()) return "";
    const st = voicePill();
    if (!st) return "";
    const [label, tone, more] = PILL[st];
    const dot = st === "on" && VS.onAt && Date.now() - VS.onAt > 3000;
    if (st === "on" && VS.onAt && !dot) { clearTimeout(voiceTimer); voiceTimer = setTimeout(renderVoice, 3000 - (Date.now() - VS.onAt) + 30); }
    return `<button class="vpill ${tone} ${st}${dot ? " dot" : ""}" id="voicePill" aria-haspopup="dialog" aria-expanded="${voiceOpen}" aria-controls="voiceSheet" aria-label="${esc(`${label}. Sidekick's voice details`)}" data-vstate="${st}"><i aria-hidden="true"></i>${dot ? "" : `<span class="vp-t">${esc(label)}</span>${more ? `<span class="vp-m">${esc(more)}</span>` : ""}`}</button>`;
  }
  const soundBarHTML = () => (voiceRelevant() && VS.playBlocked ? `<button class="sound-bar" id="soundBar"><span aria-hidden="true">🔊</span><b>Tap to turn on sound</b><span class="small">${IOS ? "iPhone blocked it" : "The browser blocked it"}</span></button>` : "");

  // The "Sidekick's voice" sheet: the three ways, in plain words, the tips, and "Try sound again"
  let voiceOpen = false;
  const AGENT_WORDS = { "no-key": "Not set up", "no-agent": "Not set up", off: "Switched off", "upstream-401": "No permission for this key", "upstream-403": "No permission for this key", "upstream-429": "Daily limit reached", limit: "Daily limit reached", "upstream-5xx": "ElevenLabs is having trouble", network: "Couldn't connect", mic: "Microphone blocked", sdk: "Couldn't load the voice", timeout: "Took too long to connect", disconnected: "Dropped, switched to backup", silent: "Connected but didn't answer, switched to backup" };
  const AGENT_WHY = { "no-key": "The server has no ElevenLabs key.", "no-agent": "The server has no agent ID for this voice.", off: "Switched off on the server.", "upstream-401": "ElevenLabs refused the key (401).", "upstream-403": "ElevenLabs refused the key (403).", "upstream-429": "ElevenLabs says the limit is reached (429).", limit: "Today's allowance is used up.", mic: "The phone didn't allow the microphone.", sdk: "The voice code didn't load on this phone." };
  function voiceWords(path) {
    const v = VS[path];
    if (path === "agent") {
      if (!v) return ["Not tried", ""];
      if (v === "connecting") return ["Connecting…", ""];
      if (v === "live") return ["Working", ""];
      if (v === "off") return ["Turned off", ""];
      if (v === "capped") return ["Daily limit reached", AGENT_WHY.limit];
      const r = v.split(":")[1] || "";
      return [AGENT_WORDS[r] || "Couldn't connect", AGENT_WHY[r] || ""];
    }
    if (path === "backup") {
      return ({ ok: ["Working", ""], "not-set-up": ["Not set up", "The server has no ElevenLabs key."], limit: ["Daily limit reached", "Today's ElevenLabs allowance is used up."], "refused:401": ["No permission for this key", "ElevenLabs refused the key (401)."], "refused:403": ["No permission for this key", "ElevenLabs refused the key (403)."], "refused:5xx": ["ElevenLabs is having trouble", ""], timeout: ["Took too long", ""], error: ["Couldn't connect", ""] })[v] || ["Not tried", ""];
    }
    return ({ ok: ["Working", ""], blocked: [IOS ? "Blocked by iPhone" : "Blocked by the browser", ""], unavailable: ["Not available on this phone", ""] })[v] || ["Not needed", ""];
  }
  function voiceSheetHTML() {
    const row = (path, title, sub) => { const [w, why] = voiceWords(path); const good = w === "Working"; return `<li class="vrow"><span class="vr-t"><b>${esc(title)}</b><span class="small">${esc(sub)}</span></span><span class="vr-r ${good ? "good" : w === "Not tried" || w === "Not needed" ? "" : "bad"}" data-vpath="${path}">${esc(w)}${why ? `<span class="small">${esc(why)}</span>` : ""}</span></li>`; };
    const blocked = VS.playBlocked || VS.phone === "blocked";
    const notSet = /^not-set-up/.test(VS.agent || "") || VS.backup === "not-set-up";
    return `<ul class="vrows">${row("agent", "Natural voice", "Talks and listens live")}${row("backup", "Backup voice", "Reads each line in the ElevenLabs voice")}${row("phone", "Phone's voice", "Last resort")}</ul>
      ${VS.playBlocked ? `<p class="small vtip"><b>Sound is blocked on this phone.</b> One tap below plays the line again.</p>` : ""}
      ${blocked || IOS ? `<p class="small vtip">Turn off the silent switch and turn the volume up. Tap the button below to try again.</p>` : ""}
      ${notSet ? `<p class="small vtip">“Not set up” means the server is missing the ElevenLabs settings.</p>` : ""}
      <p class="small vtip">Still nothing? Sidekick's lines keep showing on screen, and the call works by tapping.</p>`;
  }
  function openVoiceSheet() {
    voiceOpen = true;
    renderVoiceSheet();
    const b = document.getElementById("voicePill");
    if (b) b.setAttribute("aria-expanded", "true");
    const f = document.querySelector("#voiceSheet .sheet-panel button");
    if (f) f.focus();
  }
  function closeVoiceSheet(restore = true) {
    voiceOpen = false;
    const s = document.getElementById("voiceSheet");
    if (s) s.remove();
    const b = document.getElementById("voicePill");
    if (b) { b.setAttribute("aria-expanded", "false"); if (restore) b.focus(); }
  }
  function renderVoiceSheet() {
    let s = document.getElementById("voiceSheet");
    if (!s) {
      s = document.createElement("div");
      s.id = "voiceSheet";
      s.className = "sheet-wrap";
      s.innerHTML = `<div class="sheet-scrim" data-vclose></div><div class="sheet-panel voice-sheet" role="dialog" aria-modal="true" aria-labelledby="voiceTitle" tabindex="-1">
        <div class="row sb"><h2 id="voiceTitle">Sidekick's voice</h2><button class="icon-btn" data-vclose aria-label="Close">${ICON.x}</button></div>
        <div id="voiceBody" class="stack" style="gap:10px"></div><button class="btn pri" id="voiceRetry">Try sound again</button></div>`;
      document.body.appendChild(s);
    }
    const body = document.getElementById("voiceBody");
    const html = voiceSheetHTML();
    if (body.dataset.html !== html) { body.innerHTML = html; body.dataset.html = html; }
  }
  // "Try sound again" (and the sound bar): runs inside the tap, so the phone lets sound play. Unlock again, retry the
  // natural voice where it should be on, and say the last line again.
  function retrySound({ agentToo = true } = {}) {
    unlocked = false;
    unlockAudio();
    Tts.off = false;
    VS.playBlocked = false;
    if (VS.phone === "blocked") VS.phone = null;
    if (VS.backup && VS.backup !== "ok" && VS.backup !== "not-set-up") VS.backup = null;
    VS.reported.clear();
    const agentAgain = agentToo && view && view.me.planner && view.voiceAgent && !agent && !agentStarting && !agentCapped && VS.setup && VS.setup.key && VS.setup.agent;
    if (agentAgain) startAgent({ auto: false });
    else if (VS.last) speakLine(VS.last.text, VS.last.persona, VS.last.builtIn);
    renderVoice();
  }
  document.addEventListener("click", (e) => {
    if (e.target.closest("#voicePill")) return void (voiceOpen ? closeVoiceSheet() : openVoiceSheet());
    if (e.target.closest("[data-vclose]")) return void closeVoiceSheet();
    if (e.target.closest("#voiceRetry")) { retrySound(); return; }
    if (e.target.closest("#soundBar")) { retrySound({ agentToo: false }); }
  });
  document.addEventListener("keydown", (e) => {
    if (!voiceOpen) return;
    if (e.key === "Escape") { e.preventDefault(); closeVoiceSheet(); return; }
    if (e.key === "Tab") {
      const items = [...document.querySelectorAll("#voiceSheet .sheet-panel button")].filter((b) => b.offsetParent);
      if (!items.length) return;
      const [first, last] = [items[0], items[items.length - 1]];
      if (!document.getElementById("voiceSheet").contains(document.activeElement)) { e.preventDefault(); first.focus(); }
      else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  // ---------- Sidekick's ElevenLabs voices (POST /api/sk/tts) ----------
  // Every spoken line plays in the persona's ElevenLabs voice (both study arms alike). Played through one audio
  // element that the first tap unlocks (iPhones). If the line can't come (no key, the cap, a failure, a slow
  // answer), the phone's own voice says it instead, quietly; after a cap or a missing key it stops asking.
  // A few milliseconds of silence (a WAV built here), played on the first tap to unlock the audio element
  const SILENT = (() => { const n = 160; const b = new Uint8Array(44 + n * 2); const v = new DataView(b.buffer); const w = (o, t) => [...t].forEach((c, i) => b[o + i] = c.charCodeAt(0)); w(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); w(8, "WAVEfmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, 8000, true); v.setUint32(28, 16000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, "data"); v.setUint32(40, n * 2, true); let s = ""; b.forEach((x) => (s += String.fromCharCode(x))); return `data:audio/wav;base64,${btoa(s)}`; })();
  const Tts = {
    el: null,
    off: false,
    urls: new Map(), // "persona|text" -> an object URL for audio already fetched on this phone
    audio() {
      if (!this.el) { this.el = new window.Audio(); this.el.setAttribute("playsinline", ""); this.el.preload = "auto"; }
      return this.el;
    },
    unlock() { try { const a = this.audio(); a.src = SILENT; a.muted = true; const p = a.play(); if (p) p.then(() => { a.pause(); a.muted = false; }, () => { a.muted = false; }); } catch {} },
    speaking() { return Boolean(this.el && !this.el.paused && !this.el.ended && this.el.src !== SILENT); },
    stop() { if (this.el) { this.el.onended = this.el.onerror = null; this.el.pause(); if (this.done) { const d = this.done; this.done = null; d(); } } },
    // Resolves true once the ElevenLabs audio started playing, false if the phone's voice should say it
    async play(text, persona, { onstart, onend } = {}) {
      if (this.off) return false;
      const line = Voice.speakable(text);
      const key = `${persona}|${line}`;
      try {
        let url = this.urls.get(key);
        if (!url) {
          url = await this.fetch(line, persona);
          if (!url) return false;
        }
        this.stop();
        if ("speechSynthesis" in window) speechSynthesis.cancel();
        const a = this.audio();
        a.muted = false;
        a.src = url;
        let finished = false;
        const finish = () => { if (finished) return; finished = true; this.done = null; if (onend) onend(); };
        this.done = finish;
        a.onended = finish;
        a.onerror = finish;
        try { await a.play(); } catch (err) {
          // The phone refused to play (iPhones until a tap): say so, and keep the line for "Tap to turn on sound"
          if (err && err.name === "NotAllowedError") { VS.playBlocked = true; voiceReport("play", "NotAllowedError"); vset("backup", "ok"); renderVoice(); }
          throw err;
        }
        window.__skTts = (window.__skTts || 0) + 1; // lines played in the ElevenLabs voice (for the tests)
        VS.playBlocked = false;
        vset("backup", "ok");
        if (onstart) onstart();
        return true;
      } catch {
        return false;
      }
    },
    // The line's audio as an object URL, or null with the reason recorded (8 s before giving up on ElevenLabs)
    async fetch(line, persona) {
      const key = `${persona}|${line}`;
      if (this.urls.has(key)) return this.urls.get(key);
      let r;
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 8000);
        r = await fetch("/api/sk/tts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: line, persona }), signal: ctrl.signal }).finally(() => clearTimeout(timer));
      } catch (err) {
        vset("backup", err && err.name === "AbortError" ? "timeout" : "error");
        return null;
      }
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        const reason = d.reason || (r.status === 429 ? "limit" : r.status === 503 ? "no-key" : "error");
        const st = reason === "no-key" || reason === "off" ? "not-set-up" : reason === "limit" || reason === "upstream-429" ? "limit" : /^upstream-(401|403|5xx)$/.test(reason) ? `refused:${reason.split("-")[1]}` : reason === "timeout" ? "timeout" : "error";
        if (["not-set-up", "limit", "refused:401", "refused:403"].includes(st)) this.off = true; // it won't work until something changes
        vset("backup", st);
        return null;
      }
      if (!/audio/.test(r.headers.get("content-type") || "")) { vset("backup", "error"); return null; }
      const url = URL.createObjectURL(await r.blob());
      this.urls.set(key, url);
      return url;
    },
    // Fetch a line ahead of time (Sidekick's opening line, as soon as the call is up), without playing it
    prefetch(text, persona) { if (!this.off && text) this.fetch(Voice.speakable(text), persona).catch(() => {}); },
  };
  // One line: the ElevenLabs voice, or the phone's own voice when that can't play
  function speakLine(text, persona, builtIn, { onstart, onend } = {}) {
    VS.last = { text, persona, builtIn }; // for "Try sound again" and "Tap to turn on sound"
    return Tts.play(text, persona, { onstart, onend }).then((ok) => {
      if (ok) return ok;
      if (!("speechSynthesis" in window)) { vset("phone", "unavailable"); if (onend) onend(); return ok; }
      try {
        const u = Voice.say(text, builtIn);
        const tail = u.chunks[u.chunks.length - 1];
        let started = false;
        u.onstart = () => { started = true; vset("phone", "ok"); if (onstart) onstart(); };
        for (const c of u.chunks) c.onerror = (e) => { if (e && /not-allowed/.test(e.error || "")) vset("phone", "blocked"); if (onend) onend(); };
        if (onend) tail.onend = onend;
        // Some phones neither speak nor say why: nothing started in 3 s means it was blocked
        setTimeout(() => { if (!started && !speechSynthesis.speaking && VS.phone !== "ok") vset("phone", "blocked"); }, 3000);
      } catch { vset("phone", "unavailable"); if (onend) onend(); }
      return false;
    });
  }

  // ---------- Start ----------
  if (STUDY) {
    const bar = document.createElement("nav");
    bar.setAttribute("aria-label", "Study");
    bar.style.cssText = "display:flex;justify-content:space-between;align-items:center;max-width:440px;margin:0 auto;padding:max(4px,env(safe-area-inset-top)) 16px 0;font-size:13px;font-weight:600;color:var(--t3)";
    bar.innerHTML = `<a href="/study?s=${encodeURIComponent(STUDY)}" style="color:var(--acc);text-decoration:none;min-height:44px;display:flex;align-items:center">&larr; Study checklist</a><span>Voice ${esc(STUDY_V)}</span>`;
    document.body.insertBefore(bar, app);
  }
  // The app over a minimized call asked for this same call (its Plan tab): open the call underneath instead
  let parentRoom = null;
  try { parentRoom = inFrame ? JSON.parse(window.parent.sessionStorage.getItem("sk:onCall") || "null") : null; } catch {}
  if (inFrame && roomId && parentRoom && parentRoom.rid === roomId) {
    app.innerHTML = "";
    try { window.parent.document.getElementById("returnCall").click(); } catch {}
  } else if (!roomId) (STUDY || params.get("quick") ? startScreen() : flowStart());
  else if (me && me.person) { if (me.mode === "form") pfOn(true); connect(); }
  else joinScreen();
})();
