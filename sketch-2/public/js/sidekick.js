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
    const autoAgent = Boolean(voiceAgent) && !STUDY && agentPref;
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
        // Sidekick's natural voice starts on this same tap: no second button to find
        if (autoAgent) startAgent({ auto: true });
      } catch (err) {
        e.target.disabled = false;
        toast(err.message);
      }
    };
  }

  // ---------- 0. The Plan tab: Sidekick first, one step at a time (design TB2-Plan) ----------
  // Intro (the orb and a greeting in the persona's voice) -> 1 Who's coming? (a squad, SideQuest friends, or a
  // link) -> 2 When? (who's free each night for three weeks) -> 3 How? (a call, or a quick form) -> the call, or
  // "Form sent". A progress bar and Back on every step; Back keeps what was picked. Signed out (or the demo
  // account), the people are the sample friends and squads. /sk?squad=<id> starts with that squad picked.
  // The one-page start screen is still there for the voice study (/sk?study=) and at /sk?quick=1.
  const PF = {
    back: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>',
    squad: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3.5"/><path d="M3 20a6 6 0 0 1 12 0M16 4.5a3.5 3.5 0 0 1 0 7M21 20a6 6 0 0 0-4-5.6"/></svg>',
    person: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',
    link: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>',
    check: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg>',
    bigcheck: '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg>',
    form: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h3"/></svg>',
    cal: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/></svg>',
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
  const flow = { step: "intro", data: null, path: null, squad: null, friends: [], search: "", nights: [], how: "call", room: null, voiceAgent: false, crew: "", pick: null, calls: [], deadline: null, noLearn: false };
  const userId = () => { try { return localStorage.getItem("sq2.user") || null; } catch { return null; } };
  const wide = () => window.matchMedia("(min-width: 900px)").matches;
  const pfOn = (on) => {
    if (on) callNav(false);
    document.body.classList.toggle("pf-mode", on);
    document.documentElement.style.setProperty("--dock-h", on ? (wide() ? "0px" : "76px") : "0px");
  };

  // The app's tabs (a bar on phones, a side list on computers). Each opens that tab in the app.
  function pfNav() {
    const tabs = [["discover", "Discover", PF.home], ["parties", "Squads", PF.squad.replace(/20/g, "24")], ["plan", "Plan", null], ["questlog", "Sidequests", PF.ticket], ["profile", "Profile", PF.person.replace(/20/g, "24")]];
    return `<nav class="pf-nav" aria-label="SideQuest"><span class="pf-brand" aria-hidden="true">sidequest</span>${tabs.map(([k, label, icon]) => k === "plan"
      ? `<a class="pf-tab on plan" href="/sk" aria-current="page"><span class="orb pf-tab-orb"></span><span>${label}</span></a>`
      : `<a class="pf-tab" href="/" data-screen="${k}">${icon}<span>${label}</span></a>`).join("")}</nav>`;
  }
  // The same tabs on the call screen, so people can get back to the app (a bar on phones, a side list on
  // computers). Outside #app, so the call's redraws never touch it. Not in the voice study.
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
    app.innerHTML = `<div class="pf" data-step="${step}">${pfNav()}<div class="pf-main"><section class="pf-card ${cls}" aria-labelledby="pfTitle">${inner}</section></div></div>`;
    const h = document.getElementById("pfTitle");
    if (h && pfFocus) { h.setAttribute("tabindex", "-1"); h.focus({ preventScroll: true }); }
    pfFocus = true;
    window.scrollTo(0, 0);
  }
  let pfFocus = false;
  const stepHead = (n, label, backTo) => `<div class="pf-head"><button class="icon-btn pf-back" data-pfback="${backTo}" aria-label="Back">${PF.back}</button><span class="pf-stepl">Step ${n} of 3 · ${label}</span><span class="pf-sp"></span></div>
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
  const whoLabel = () => (flow.path === "squad" ? squadName() : flow.path === "friends" ? (flow.friends.length === 1 ? flow.data.people[flow.friends[0]].name : `${flow.friends.length} friends`) : "Link");
  const crewName = () => flow.crew || (flow.path === "squad" ? squadName() : flow.data && flow.data.me.name ? `${flow.data.me.name}'s crew` : "The crew");
  const pfNightOf = (date) => flow.data.nights.find((n) => n.date === date);
  const shortNight = (date) => { const n = pfNightOf(date); return n ? `${n.dow} ${n.day}` : date; };

  // A call that's still live in this tab (minimized, or this page opened again): the Plan tab says so, with Return,
  // and doesn't offer to start a second call
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
    pfShell("oncall", `<div class="pf-intro pf-oncall">
      <div class="pf-top"><span class="tag pri">Sidekick</span></div>
      <div class="pf-hero"><span class="orb pf-orb live" aria-hidden="true"></span>
        <div class="pf-words"><h1 class="pf-hello" id="pfTitle">You're on a call with ${esc(oc.crew)}</h1>
          <p class="pf-line oc-note">Sidekick is still listening. Head back to finish the plan; you can start a new one once this call ends.</p>
          <div class="pf-acts"><button class="btn pri" id="pfReturn">Return to the call</button></div></div></div></div>`);
  }
  document.addEventListener("click", (e) => {
    if (!e.target.closest("#pfReturn")) return;
    const oc = onCall();
    // Inside the minimized call's frame: reopen the call underneath; otherwise go to it
    try { const r = window.parent !== window && window.parent.document.getElementById("returnCall"); if (r) return void r.click(); } catch {}
    if (oc && oc.rid) location.assign(`/sk/${oc.rid}`);
  });

  async function flowStart() {
    const live = await liveCall();
    if (live) { pfOn(true); return pfOnCall(live); }
    const sq = params.get("squad");
    const free = store.get("sk:free");
    let persona = params.get("persona") || ss.get("sk:persona");
    const q = new URLSearchParams();
    if (userId()) q.set("user", userId());
    if (sq) q.set("squad", sq);
    if (persona) q.set("persona", persona);
    if (store.get("sk:name")) q.set("name", store.get("sk:name"));
    if (Array.isArray(free)) q.set("free", free.join(","));
    // The loading system: nothing for 300 ms, then a skeleton in the intro's shape
    pfOn(true);
    app.innerHTML = `<div class="pf" data-step="loading">${pfNav()}<div class="pf-main"><section class="pf-card pf-wait" aria-busy="true"><span class="sr" role="status">Loading your plan…</span>
      <div class="pf-hero"><span class="sk-orb"></span><span class="sk-line" style="width:55%"></span><span class="sk-line" style="width:80%"></span><span class="sk-line" style="width:65%"></span></div>
      <span class="sk-btn"></span></section></div></div>`;
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
        if (data.nights.some((n) => n.date === pick.date)) flow.nights = [pick.date];
      }
    } catch (err) {
      app.querySelector(".pf-card").outerHTML = `<section class="pf-card"><h1 id="pfTitle">Couldn't load your plan</h1><p class="muted">Check your connection and try again.</p><button class="btn out" onclick="location.reload()">Try again</button></section>`;
      return;
    }
    ss.set("sk:persona", flow.data.persona);
    if (flow.data.squad) { flow.path = "squad"; flow.squad = flow.data.squad; }
    if (flow.voiceAgent && agentPref) loadEL().catch(() => {});
    pfIntro();
  }

  // ----- Intro: the orb, a greeting with your first name, one question. Not now is always there. -----
  function pfIntro() {
    flow.step = "intro";
    const d = flow.data;
    const seen = ss.get("sk:introSeen") === "1"; // like Spotify's DJ: the line plays once per visit
    const parts = d.intro.match(/^(.*?[.!?])\s+(.*)$/) || [null, d.intro, ""];
    const hello = parts[1];
    const line = seen ? "" : parts[2];
    pfShell("intro", `<div class="pf-intro">
      <div class="pf-top"><span class="tag pri">Sidekick</span><button class="pf-voice" id="pfVoice" aria-label="Voice: ${esc(d.voiceLabel)}. Change the voice">Voice: ${esc(d.voiceLabel)} · <u>change</u></button></div>
      <div class="pf-hero">
        <button class="pf-orb-btn" id="pfOrb" aria-label="Hear Sidekick say it"><span class="orb pf-orb ${seen ? "" : "intro"}" id="pfOrbI"></span></button>
        <div class="pf-words">
          <h1 class="pf-hello" id="pfTitle">${esc(hello)}</h1>
          ${line ? `<p class="pf-line" id="pfLine">${esc(line)}</p>` : ""}
          ${flow.pick ? `<div class="pf-pick" id="pfPick"><span class="small">From your Saved</span><b>${esc(flow.pick.title)}</b><span class="small">${esc([flow.pick.night, flow.pick.where].filter(Boolean).join(" · "))}</span></div>` : ""}
          <p class="pf-q">${flow.pick ? "Plan a night around it?" : "Ready to start a plan?"}</p>
          <div class="pf-acts"><button class="btn pri" id="pfGo">${flow.pick ? "Plan around this event" : "Let's plan"}</button><button class="btn out" id="pfNot">Not now</button></div>
          ${flow.calls.length ? `<p class="small pf-last" id="pfLast">Your last plan: ${esc(flow.calls[0].locked ? flow.calls[0].locked.title : `${flow.calls[0].crew}, no pick locked`)}</p>` : ""}
        </div>
      </div></div>`, "intro");
    ss.set("sk:introSeen", "1");
    if (!seen) pfSpeak(d.intro, false);
  }
  // Spoken when the voice is on and the browser allows it (after a tap); otherwise it's the text and the orb
  // In the persona's ElevenLabs voice; the phone's own voice only if that can't play
  function pfSpeak(text, asked) {
    const orb = document.getElementById("pfOrbI");
    if (!asked && (!aloud || !(navigator.userActivation && navigator.userActivation.hasBeenActive))) return;
    const persona = flow.data.persona === "friend" ? "friend" : "concierge";
    const live = (on) => orb && orb.classList.toggle("live", on);
    speakLine(text, persona, persona === "friend" ? { slot: "friend", rate: 1.02, pitch: 1.04 } : { slot: "concierge", rate: 0.95, pitch: 1 }, { onstart: () => live(true), onend: () => live(false) });
    setTimeout(() => live(false), 1500 + text.split(/\s+/).length * 500);
  }

  // ----- Step 1: who's coming? A squad, friends on SideQuest, or a link you send yourself -----
  function pfWho() {
    flow.step = "who";
    const d = flow.data;
    if (!flow.path) flow.path = d.squads.length ? "squad" : null;
    if (flow.path === "squad" && !flow.squad && d.squads.length) flow.squad = d.squads[0].id;
    const opt = (key, icon, title, sub, extra = "") => {
      const on = flow.path === key;
      return `<div class="pf-opt ${on ? "on" : ""}"><button class="pf-opt-b" role="radio" aria-checked="${on}" data-pfpath="${key}">${icon}<span class="pf-opt-t"><b>${title}</b><span class="small">${sub}</span></span><span class="pf-radio" aria-hidden="true"></span></button>${on ? extra : ""}</div>`;
    };
    const chips = d.squads.length ? `<div class="pf-chips" role="radiogroup" aria-label="Squads">${d.squads.map((s) => `<button class="chip" role="radio" data-pfsquad="${esc(s.id)}" aria-checked="${s.id === flow.squad}" aria-pressed="${s.id === flow.squad}">${esc(s.name)}</button>`).join("")}</div>` : "";
    const ready = flow.path === "squad" ? Boolean(flow.squad) : Boolean(flow.path);
    pfShell("who", `${stepHead(1, "Who", "intro")}<h1 id="pfTitle">Who's coming?</h1>
      <div class="pf-opts" role="radiogroup" aria-label="Who's coming">
        ${d.squads.length ? opt("squad", `<span class="pf-thumb v">${PF.squad}</span>`, "A squad", "Everyone in it, already set up", chips) : ""}
        ${opt("friends", `<span class="pf-thumb t">${PF.person}</span>`, "Pick friends on SideQuest", flow.path === "friends" && flow.friends.length ? esc(flow.friends.map((k) => d.people[k] && d.people[k].name).filter(Boolean).join(", ")) : "Choose people one by one")}
        ${opt("link", `<span class="pf-thumb n">${PF.link}</span>`, "I'll send them a link myself", "For anyone, in or out of the app")}
      </div>
      <div class="pf-foot"><button class="btn pri" id="pfNext" ${ready ? "" : "disabled"}>Next: when?</button></div>`);
  }

  function pfFriends() {
    flow.step = "friends";
    const d = flow.data;
    const s = flow.search.trim().toLowerCase();
    const list = d.friends.filter((k) => !s || d.people[k].full.toLowerCase().includes(s) || d.people[k].name.toLowerCase().includes(s));
    const picked = flow.friends.filter((k) => d.people[k]);
    const rows = list.map((k, i) => {
      const p = d.people[k];
      const on = picked.includes(k);
      return `<button class="pf-frow" role="checkbox" aria-checked="${on}" data-pffriend="${esc(k)}"><span class="av ${PF_COLOURS[d.friends.indexOf(k) % PF_COLOURS.length]}" aria-hidden="true">${esc(p.initial)}</span><span class="grow">${esc(p.full)}</span><span class="pf-box" aria-hidden="true">${on ? PF.check : ""}</span></button>`;
    }).join("");
    const empty = !d.friends.length
      ? `<div class="pf-empty"><p style="font-weight:600">No SideQuest friends yet</p><p class="small">Add friends in Squads, or send a link to anyone instead.</p><button class="btn out sm" data-pfpath="link">Send a link instead</button></div>`
      : !list.length ? `<p class="small">Nobody called "${esc(flow.search)}" in your SideQuest friends.</p>` : "";
    pfShell("friends", `${stepHead(1, "Who", "who")}<h1 id="pfTitle">Pick friends</h1>
      ${d.friends.length ? `<label class="pf-search"><span class="sr">Search your SideQuest friends</span>${PF.search}<input id="pfSearch" type="search" placeholder="Search your SideQuest friends" value="${esc(flow.search)}" autocomplete="off"></label>` : ""}
      <div class="pf-chips" id="pfPicked" aria-label="Picked">${picked.map((k) => `<button class="chip" aria-pressed="true" data-pfunpick="${esc(k)}" aria-label="Remove ${esc(d.people[k].name)}">${esc(d.people[k].name)} ${ICON.x}</button>`).join("")}</div>
      <div class="pf-flist" id="pfFlist">${rows}</div>${empty}
      ${d.friends.length ? '<p class="small">Only friends in SideQuest are listed, so everyone here can share free nights.</p>' : ""}
      <div class="pf-foot"><button class="btn pri" id="pfNext" ${picked.length ? "" : "disabled"}>Next: when?${picked.length ? ` · ${picked.length} friend${picked.length === 1 ? "" : "s"}` : ""}</button></div>`);
  }

  // The link path makes the room now, so the link is real; the next steps change its nights
  async function ensureRoom(form, send = false) {
    const d = flow.data;
    const members = pfPeople().slice(1).map((p) => p.name);
    const body = { nights: flow.nights.length ? flow.nights : undefined, members, crew: crewName(), noLearn: flow.noLearn, pick: flow.pick ? flow.pick.id : undefined, deadline: form && flow.deadline ? flow.deadline : undefined };
    // Friends picked in the app hear about it in SideQuest once the plan or form is sent (held in their quiet hours)
    if (send) body.invite = pfPeople().slice(1).map((p) => p.key);
    // Reuse the room made for the link (or for a form sent before Back), unless it's a form and this is a call
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
  async function pfLink() {
    flow.step = "link";
    pfShell("link", `${stepHead(1, "Who", "who")}<h1 id="pfTitle">Send your own link</h1>
      <p class="muted">Paste it in your group chat. Anyone who opens it can join, no account needed.</p>
      <div class="pf-box-card" id="pfShare"><span class="small">Your plan link</span><div class="pf-wait"><span class="sk-line" style="width:70%;height:48px"></span><span class="sk-line" style="height:44px"></span></div></div>
      <div class="pf-note"><span class="orb"></span><p class="small">People who join this way show as <b>unknown</b> on the calendar until they answer.</p></div>
      <div class="pf-foot"><button class="btn pri" id="pfNext">Next: when?</button></div>`);
    try {
      const r = await ensureRoom(false);
      roomId = r.room;
      const box = document.getElementById("pfShare");
      if (box && flow.step === "link") box.innerHTML = `<span class="small">Your plan link</span>${shareHTML()}`;
    } catch (err) {
      toast(err.message);
    }
  }

  // ----- Step 2: when? Who's free each night for the next three weeks -----
  function nightInfo(n, people) {
    const st = people.map((p) => ({ p, s: (p.avail && p.avail.nights && p.avail.nights[n.date]) || "unset" }));
    const free = st.filter((x) => x.s === "free");
    const unset = st.filter((x) => x.s === "unset");
    const all = people.length >= 2 && free.length === people.length;
    return { st, free, unset, all };
  }
  const STATE_WORD = { free: "free", busy: "busy", unset: "not set" };
  function nightLabelFull(n, info) {
    const who = info.st.map((x) => `${x.p.key === "me" ? "you" : x.p.name}: ${STATE_WORD[x.s]}`).join(", ");
    return `${n.label}. ${info.free.length} of ${info.st.length} free${info.all ? ", everyone free" : ""}. ${who}. Link guests: unknown. ${n.events} event${n.events === 1 ? "" : "s"} that night.`;
  }
  function defaultNights(people) {
    const list = flow.data.nights.map((n) => ({ n, i: nightInfo(n, people) }));
    // The first week with a night everyone's free: its busiest one (more to choose from)
    const all = list.filter((x) => x.i.all && x.n.events > 0);
    const week = all.length ? all.filter((x) => list.indexOf(x) - list.indexOf(all[0]) < 7 - ((["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(all[0].n.dow) + 7) % 7)) : [];
    const best = week.sort((a, b) => b.n.events - a.n.events)[0] || list.slice().sort((a, b) => b.i.free.length - a.i.free.length || b.n.events - a.n.events)[0];
    return best ? [best.n.date] : [];
  }
  function pfWhen() {
    flow.step = "when";
    const d = flow.data;
    const people = pfPeople();
    if (!flow.nights.length) flow.nights = defaultNights(people);
    const backTo = flow.path === "friends" ? "friends" : flow.path === "link" ? "link" : "who";
    const dot = (p) => `<span class="av xs ${p.colour}" aria-hidden="true">${esc(p.initial)}</span>`;
    const unk = '<span class="av xs unk" aria-hidden="true">?</span>';
    const sel = flow.nights;
    const next = sel.length ? `Next: how to decide · ${shortNight(sel[0])}${sel.length > 1 ? ` +${sel.length - 1}` : ""}` : "Pick a night";
    const legend = `<div class="pf-legend" aria-hidden="true">${people.map((p) => `<span class="row" style="gap:4px"><i class="pf-dot ${p.colour}"></i>${esc(p.key === "me" ? "You" : p.name)}${p.avail && !p.avail.set ? " (not set)" : ""}</span>`).join("")}<span class="row" style="gap:4px"><i class="pf-dot unkd"></i>Link guests ?</span></div>`;
    const summary = `<div class="pf-sum">${flow.path === "link" ? '<span class="tag soc">Link</span>' : `<span class="tag pri">${esc(whoLabel())}</span>`}<span class="small">+ anyone via link, <b>?</b> unknown</span></div>`;
    const markBtn = `<button class="btn out sm pf-mark" id="pfMark">${PF.cal}Mark your free nights</button>`;
    let body;
    if (wide()) {
      // A calendar: Monday to Sunday, the window's weeks, dots for who's free, the everyone-free nights lit
      const first = d.nights[0];
      const lead = (["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(first.dow) + 7) % 7;
      const cells = [...Array(lead).fill(null), ...d.nights];
      while (cells.length % 7) cells.push(null);
      const focus = pfNightOf(sel[0]) || d.nights[0];
      const fi = nightInfo(focus, people);
      body = `<div class="pf-cal-wrap"><div class="pf-cal" role="group" aria-label="Nights in the next three weeks">${["M", "T", "W", "T", "F", "S", "S"].map((x) => `<span class="pf-cal-h" aria-hidden="true">${x}</span>`).join("")}
        ${cells.map((n) => {
          if (!n) return '<span class="pf-cell blank" aria-hidden="true"></span>';
          const i = nightInfo(n, people);
          return `<button class="pf-cell pf-night ${i.all ? "all" : ""}" data-date="${n.date}" data-all="${i.all ? 1 : 0}" aria-pressed="${sel.includes(n.date)}" aria-label="${esc(nightLabelFull(n, i))}"><span class="pf-cd">${n.day === 1 || n === d.nights[0] ? `${n.mon} ` : ""}${n.day}</span><span class="pf-dots">${i.free.map((x) => `<i class="pf-dot ${x.p.colour}"></i>`).join("")}${i.unset.map(() => '<i class="pf-dot unset"></i>').join("")}<i class="pf-dot unkd"></i></span><span class="pf-ev">${n.events} event${n.events === 1 ? "" : "s"}</span></button>`;
        }).join("")}</div>
        <aside class="pf-side" aria-live="polite"><b>${esc(focus.label)}</b>${fi.all ? '<span class="tag soc" style="align-self:flex-start">Everyone free</span>' : ""}
          <p class="small" style="color:var(--t2)">${fi.free.length} of ${fi.st.length} free · ${focus.events} events that night.</p>
          <ul class="pf-who">${fi.st.map((x) => `<li><span class="av xs ${x.p.colour}" aria-hidden="true">${esc(x.p.initial)}</span>${esc(x.p.key === "me" ? "You" : x.p.name)}<span class="pf-st ${x.s}">${STATE_WORD[x.s]}</span></li>`).join("")}<li><span class="av xs unk" aria-hidden="true">?</span>Link guests<span class="pf-st unset">unknown</span></li></ul>
          ${sel.length > 1 ? `<p class="small">Also picked: ${esc(sel.slice(1).map(shortNight).join(", "))}</p>` : ""}
          ${markBtn}
          <button class="btn pri" id="pfNext" ${sel.length ? "" : "disabled"}>${esc(next)}</button></aside></div>`;
      pfShell("when", `${stepHead(2, "When", backTo)}<div class="pf-whenh"><h1 id="pfTitle">When?</h1>${legend}</div>${summary}${body}<p class="small">Tap one night or more (up to 4). Friends share free or not, never why.</p>`, "wide");
      return;
    }
    // Phones: the nights as a list, a week at a time
    const weekOf = (n) => Math.floor((d.nights.indexOf(n) + ((["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(d.nights[0].dow) + 7) % 7)) / 7);
    const groups = [];
    for (const n of d.nights) { const w = weekOf(n); (groups[w] = groups[w] || []).push(n); }
    body = groups.map((g, w) => `<div class="pf-week"><p class="pf-weekh">${w === 0 ? "This week" : w === 1 ? "Next week" : `Week of ${g[0].mon} ${g[0].day}`}</p>
      ${g.map((n) => {
        const i = nightInfo(n, people);
        return `<button class="pf-night pf-row ${i.all ? "all" : ""}" data-date="${n.date}" data-all="${i.all ? 1 : 0}" aria-pressed="${sel.includes(n.date)}" aria-label="${esc(nightLabelFull(n, i))}">
          <span class="pf-date"><span class="small">${n.dow}</span><b>${n.day}</b></span>
          <span class="pf-nmid"><span class="row" style="gap:6px"><span class="stk">${i.free.map((x) => dot(x.p)).join("")}${i.unset.map((x) => `<span class="av xs ${x.p.colour} unset" aria-hidden="true">${esc(x.p.initial)}</span>`).join("")}${unk}</span><span class="pf-cnt">${i.free.length} of ${i.st.length} free${i.unset.length ? ` · ${i.unset.length} not set` : ""}</span></span><span class="small">${n.events} event${n.events === 1 ? "" : "s"} that night</span></span>
          ${i.all ? '<span class="tag soc">Everyone free</span>' : ""}</button>`;
      }).join("")}</div>`).join("");
    pfShell("when", `${stepHead(2, "When", backTo)}<h1 id="pfTitle">When?</h1>${summary}<div class="pf-tools">${markBtn}</div>${legend}<div class="pf-nights">${body}</div>
      <p class="small">Tap one night or more (up to 4). Friends share free or not, never why.</p>
      <div class="pf-foot"><button class="btn pri" id="pfNext" ${sel.length ? "" : "disabled"}>${esc(next)}</button></div>`);
  }

  // Mark your free nights: a sheet with the window's nights. Busy (already going) nights can't be marked free.
  function pfMarkSheet() {
    const d = flow.data;
    const nights = d.mine.nights;
    const free = new Set(Object.keys(nights).filter((k) => nights[k] === "free"));
    const going = new Set(d.signedIn ? (d.goingNights || []) : []);
    const s = document.createElement("div");
    s.id = "pfSheet";
    s.className = "sheet-wrap";
    s.innerHTML = `<div class="sheet-scrim" data-pfclose></div><div class="sheet-panel pf-sheet" role="dialog" aria-modal="true" aria-labelledby="pfSheetT" tabindex="-1">
      <div class="row sb"><h2 id="pfSheetT">Mark your free nights</h2><button class="icon-btn" data-pfclose aria-label="Close">${ICON.x}</button></div>
      <p class="small" style="color:var(--t2)">Tap the nights you're free. Friends only see free or busy, never why.${d.signedIn ? "" : " Sign in to keep them on your account; for now they stay on this phone."}</p>
      <div class="pf-markgrid" role="group" aria-label="Your free nights">${d.nights.map((n) => `<button class="chip pf-mchip" data-pffree="${n.date}" aria-pressed="${free.has(n.date)}" ${going.has(n.date) ? "disabled" : ""}><span>${n.dow}</span> ${n.mon} ${n.day}</button>`).join("")}</div>
      <div class="row"><button class="btn out" data-pfclose style="flex:1">Cancel</button><button class="btn pri" id="pfSaveFree" style="flex:1">Save free nights</button></div></div>`;
    document.body.appendChild(s);
    s.querySelector(".sheet-panel").focus();
  }
  async function pfSaveFree(btn) {
    const d = flow.data;
    const free = [...document.querySelectorAll("#pfSheet [data-pffree][aria-pressed=true]")].map((b) => b.dataset.pffree);
    pending(btn, "Saving");
    try {
      if (d.signedIn) {
        const out = await api("/api/sk/plan/free", { user: userId(), free });
        d.mine = out.mine;
      } else {
        store.set("sk:free", free);
        d.mine = { set: true, nights: Object.fromEntries(d.nights.map((n) => [n.date, free.includes(n.date) ? "free" : "busy"])) };
      }
      pfCloseSheet();
      toast(d.signedIn ? "Saved. Friends now see your free nights." : "Saved on this phone.");
      pfWhen();
    } catch (err) {
      unpend(btn);
      toast(err.message);
    }
  }
  function pfCloseSheet() {
    const s = document.getElementById("pfSheet");
    if (s) s.remove();
    const m = document.getElementById("pfMark");
    if (m) m.focus();
  }

  // ----- Step 3: how do you want to decide? A call with Sidekick, or a quick form -----
  function pfHow() {
    flow.step = "how";
    const d = flow.data;
    const opt = (key, icon, title, sub) => `<div class="pf-opt ${flow.how === key ? "on" : ""}"><button class="pf-opt-b" role="radio" aria-checked="${flow.how === key}" data-pfhow="${key}">${icon}<span class="pf-opt-t"><b>${title}</b><span class="small">${sub}</span></span><span class="pf-radio" aria-hidden="true"></span></button></div>`;
    const chips = `<div class="pf-sum">${flow.path === "link" ? '<span class="tag soc">Link</span>' : `<span class="tag pri">${esc(whoLabel())}</span>`}${flow.nights.map((x) => `<span class="tag pf-tn">${esc(shortNight(x))}</span>`).join("")}${flow.pick ? `<span class="tag soc pf-around">Around: ${esc(flow.pick.title.length > 28 ? `${flow.pick.title.slice(0, 27)}…` : flow.pick.title)}</span>` : ""}</div>`;
    const askName = !d.me.name ? `<label class="f">Your name<input class="in" id="pfName" autocomplete="given-name" maxlength="24" value="${esc(store.get("sk:name") || "")}"></label>` : "";
    pfShell("how", `${stepHead(3, "How", "when")}<h1 id="pfTitle">How do you want to decide?</h1>${chips}
      <div class="pf-opts" role="radiogroup" aria-label="How to decide">
        ${opt("call", '<span class="orb pf-optorb"></span>', "Hop on a call with Sidekick", "About 5 minutes. Sidekick listens, keeps track and suggests two picks.")}
        ${opt("form", `<span class="pf-thumb t">${PF.form}</span>`, "Send everyone a quick form", "The same questions by tap. Sidekick picks once everyone answers.")}
      </div>
      ${flow.how === "form" ? decideByHTML() : ""}
      <p class="small">Private questions (like budget) are asked one to one. The group only sees one limit, never whose.</p>
      <button class="pf-switch" id="pfLearn" role="switch" aria-checked="${flow.noLearn}"><span class="pf-opt-t"><b>Don't learn from this plan</b><span class="small">Picks, votes and the final plan won't change your taste.</span></span><span class="osw-k" aria-hidden="true"></span></button>
      ${askName}${originPicker()}
      <div class="pf-foot"><button class="btn pri" id="pfStart">${flow.how === "form" ? "Send the form" : "Start the call"}</button></div>`);
    initOrigin();
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
    const d = flow.data;
    const nameIn = document.getElementById("pfName");
    if (nameIn && !nameIn.value.trim()) { nameIn.focus(); return toast("Add your name so your crew knows who's planning."); }
    if (nameIn) store.set("sk:name", nameIn.value.trim());
    const form = flow.how === "form";
    const autoAgent = !form && flow.voiceAgent && agentPref;
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
    } catch (err) {
      unpend(btn);
      toast(err.message);
    }
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
    const html = `<div class="pf-head"><button class="icon-btn pf-back" data-pfback="how" aria-label="Back">${PF.back}</button><b class="pf-title2">Form sent</b><button class="icon-btn" id="invitePill" aria-label="Share the form link">${PF.share}</button></div>
      <div class="pf-sent"><span class="pf-okc">${PF.bigcheck}</span><h1 id="pfTitle" aria-live="polite">${done} of ${rows.length} answered</h1><p class="muted">${view.closed ? "The form has closed. Sidekick is picking with the answers it has." : "Sidekick picks when everyone's in."}</p><span class="row" style="gap:6px;flex-wrap:wrap;justify-content:center">${first ? `<span class="tag hot">For ${esc(first)}</span>` : ""}${view.deadline ? `<span class="tag hot" id="closesTag">${view.closed ? "Closed" : `Closes ${esc(closesLabel(view.deadline))}`}</span>` : ""}</span></div>
      <ul class="pf-ans" aria-label="Who's answered">${rows.map((x, i) => `<li><span class="av ${x.me ? "c0" : x.link && !x.answered ? "unk" : PF_COLOURS[i % PF_COLOURS.length]}" aria-hidden="true">${esc(x.me ? (view.me.name || "Y").charAt(0).toUpperCase() : x.name.charAt(0).toUpperCase())}</span><span class="grow">${esc(x.name)}${x.link ? ' <span class="small">(via link)</span>' : ""}</span><span class="tag ${x.answered ? "ok" : "pf-tn"}">${x.answered ? "Answered" : "Not yet"}</span></li>`).join("")}</ul>
      <div class="pf-acts2">${waiting.length ? `<button class="btn sm pf-v" id="pfNudge">Nudge ${esc(waiting.length === 1 ? waiting[0].name : `${waiting.length} people`)}</button>` : ""}<button class="btn out sm" id="pfPickNow" ${done >= 2 ? "" : "disabled"}>Pick now with ${done}</button></div>
      <div class="pf-box-card"><span class="small">Send the form link to the group</span>${shareHTML()}</div>`;
    if (!card) {
      pfFocus = false;
      pfShell("formsent", html, "formsent");
    } else card.innerHTML = html;
  }

  // Taps in the steps
  app.addEventListener("click", async (e) => {
    const t = e.target;
    if (t.closest("#pfGo")) { unlockAudio(); return void (flow.path === "squad" && flow.squad && params.get("squad") ? pfWhen() : pfWho()); }
    if (t.closest("#pfNot")) { if (document.referrer.startsWith(location.origin) && history.length > 1) history.back(); else location.href = "/"; return; }
    if (t.closest("#pfOrb")) return void pfSpeak(flow.data.intro, true);
    if (t.closest("#pfVoice")) {
      const next = flow.data.persona === "friend" ? "concierge" : "friend";
      ss.set("sk:persona", next);
      const q = new URLSearchParams({ persona: next, name: flow.data.me.name || "" });
      if (userId()) q.set("user", userId());
      const out = await api(`/api/sk/plan/setup?${q}`).catch(() => null);
      if (out) Object.assign(flow.data, { persona: out.persona, voiceLabel: out.voiceLabel, intro: out.intro });
      ss.set("sk:introSeen", "");
      return void pfIntro();
    }
    const back = t.closest("[data-pfback]");
    if (back) {
      const to = back.dataset.pfback;
      if (flow.step === undefined || !flow.data) return void (location.href = "/sk");
      if (phase === "formsent" || (view && view.form && document.querySelector(".formsent"))) {
        leaveQuietly();
        view = null;
        roomId = null;
        history.pushState(null, "", "/sk");
      }
      return void ({ intro: pfIntro, who: pfWho, friends: pfFriends, link: pfLink, when: pfWhen, how: pfHow }[to] || pfIntro)();
    }
    const path = t.closest("[data-pfpath]");
    if (path) {
      flow.path = path.dataset.pfpath;
      if (flow.path === "friends") return void pfFriends();
      if (flow.path === "link") return void pfLink();
      return void pfWho();
    }
    const sq = t.closest("[data-pfsquad]");
    if (sq) { flow.squad = sq.dataset.pfsquad; flow.path = "squad"; return void pfWho(); }
    const fr = t.closest("[data-pffriend]");
    if (fr) {
      const k = fr.dataset.pffriend;
      flow.friends = flow.friends.includes(k) ? flow.friends.filter((x) => x !== k) : [...flow.friends, k];
      pfFocus = false;
      pfFriends();
      const again = app.querySelector(`[data-pffriend="${CSS.escape(k)}"]`);
      if (again) again.focus();
      return;
    }
    const un = t.closest("[data-pfunpick]");
    if (un) { flow.friends = flow.friends.filter((x) => x !== un.dataset.pfunpick); pfFocus = false; return void pfFriends(); }
    if (t.closest("#pfNext")) {
      if (flow.step === "who") return void (flow.path === "friends" ? pfFriends() : flow.path === "link" ? pfLink() : pfWhen());
      if (flow.step === "friends" || flow.step === "link") return void pfWhen();
      if (flow.step === "when") return void pfHow();
    }
    const night = t.closest(".pf-night");
    if (night) {
      const dt = night.dataset.date;
      if (flow.nights.includes(dt)) flow.nights = flow.nights.filter((x) => x !== dt);
      else if (flow.nights.length >= 4) return void toast("Pick up to 4 nights.");
      else flow.nights = [...flow.nights, dt].sort();
      const y = window.scrollY;
      pfFocus = false;
      pfWhen();
      window.scrollTo(0, y);
      const again = app.querySelector(`.pf-night[data-date="${dt}"]`);
      if (again) again.focus({ preventScroll: true });
      return;
    }
    if (t.closest("#pfMark")) return void pfMarkSheet();
    const how = t.closest("[data-pfhow]");
    if (how) {
      flow.how = how.dataset.pfhow;
      const y = window.scrollY;
      pfFocus = false;
      pfHow();
      window.scrollTo(0, y);
      const again = app.querySelector(`[data-pfhow="${flow.how}"]`);
      if (again) again.focus({ preventScroll: true });
      return;
    }
    const dl = t.closest("[data-pfdeadline]");
    if (dl) {
      flow.deadline = Number(dl.dataset.pfdeadline);
      app.querySelectorAll("[data-pfdeadline]").forEach((b) => { const on = b === dl; b.setAttribute("aria-checked", on); b.setAttribute("aria-pressed", on); });
      return;
    }
    if (t.closest("#pfLearn")) { flow.noLearn = !flow.noLearn; t.closest("#pfLearn").setAttribute("aria-checked", flow.noLearn); return; }
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
  document.addEventListener("click", (e) => {
    if (!e.target.closest("#pfSheet")) return;
    if (e.target.closest("[data-pfclose]")) return void pfCloseSheet();
    const c = e.target.closest("[data-pffree]");
    if (c) return void c.setAttribute("aria-pressed", c.getAttribute("aria-pressed") !== "true");
    const sv = e.target.closest("#pfSaveFree");
    if (sv) pfSaveFree(sv);
  });
  document.addEventListener("keydown", (e) => {
    const sheet = document.getElementById("pfSheet");
    if (sheet) {
      if (e.key === "Escape") { e.preventDefault(); pfCloseSheet(); return; }
      if (e.key === "Tab") {
        const items = [...sheet.querySelectorAll("button:not([disabled])")];
        const [a, b] = [items[0], items[items.length - 1]];
        if (e.shiftKey && document.activeElement === a) { e.preventDefault(); b.focus(); } else if (!e.shiftKey && document.activeElement === b) { e.preventDefault(); a.focus(); }
      }
      return;
    }
    // The intro on a computer: Enter means Let's plan, Escape means Not now
    if (flow.step === "intro" && document.getElementById("pfGo") && !e.target.closest("button,input,a")) {
      if (e.key === "Enter") { e.preventDefault(); document.getElementById("pfGo").click(); }
      if (e.key === "Escape") { e.preventDefault(); document.getElementById("pfNot").click(); }
    }
  });
  window.matchMedia("(min-width: 900px)").addEventListener("change", () => { if (flow.step === "when" && document.querySelector('.pf[data-step="when"]')) { pfFocus = false; pfWhen(); } else pfOn(document.body.classList.contains("pf-mode")); });

  // ---------- 2. Join ----------
  async function joinScreen() {
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
    if (ss.get("sk:onCall")) ss.set("sk:onCall", "");
    clearTimeout(retryTimer);
    if (es) es.close();
    es = null;
    phase = null;
    setConn(true);
    if (micOn) stopMic();
    Audio.stop();
    if (agent) stopAgent();
  }
  function goneScreen(data) {
    const saved = me || store.get(`sk:${roomId}`);
    const restarted = Boolean(data && data.boot && saved && saved.boot && data.boot !== saved.boot);
    leaveQuietly();
    if (saved) store.set(`sk:${roomId}`, null);
    me = null;
    app.innerHTML = restarted
      ? `<h1>This call ended when the app restarted</h1><p class="muted">Calls live in the app's memory, so a restart ends them. Start a new one and share the new link with your crew.</p><a class="btn pri" href="/sk">Start a new call</a>`
      : `<h1>This call isn't running anymore</h1><p class="muted">It may have ended, or the app restarted. The transcript was deleted. Ask whoever sent the link to start a new one, or start your own.</p><a class="btn out" href="/sk">Start a new call</a>`;
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
    const next = view.locked ? "locked" : view.status === "ended" ? "ended" : view.picks ? "picks" : view.form && view.me && view.me.planner ? "formsent" : "call";
    if (next === "formsent") {
      if (phase !== "formsent") { phase = "formsent"; app.innerHTML = ""; }
      renderFormSent();
      if (sheetOpen) renderSheet();
      return;
    }
    if (phase === "formsent") pfOn(false);
    if (view.mode !== lastMode) {
      // Said or tapped: a short note confirms Sidekick's new role
      if (lastMode && ["lead", "sidelines"].includes(lastMode) && ["lead", "sidelines"].includes(view.mode)) toast(view.mode === "lead" ? "Sidekick leads now." : "Sidekick is sitting back. Say \"Sidekick, take over\" to bring it back.");
      lastMode = view.mode;
      if (phase === next) renderDock();
    }
    if (next !== phase) {
      phase = next;
      landed = phase === "picks" && Boolean(lastThinking); // the steps give way to the cards
      app.innerHTML = `<div id="top"></div><div id="say"></div><div id="body" class="stack"></div><div id="ticks" class="stack"></div><p class="sr" id="thinkLive" aria-live="polite"></p><div class="dock" id="dock"></div>`;
      // A live call is full screen (the app's tabs come back when it ends); the voice study keeps its own layout
      const live = phase === "call" || phase === "picks";
      callNav(!live);
      // This tab is on a live call until it ends (the Plan tab shows "You're on a call" meanwhile)
      ss.set("sk:onCall", phase === "ended" ? "" : JSON.stringify({ rid: roomId, crew: view.crew }));
      document.body.classList.toggle("sk-live", live && !STUDY);
      if (!live && chatOpen) closeChat(false);
      if (!live && sheetOpen) closeSheet(false);
      watchDock();
      renderDock();
    }
    renderTop();
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
    // ⌄ minimizes; the people row (with "+N" for invited people who haven't joined) opens the People sheet
    const plus = waiting.length ? `<span class="plus-n" aria-hidden="true">+${waiting.length}</span>` : "";
    const rowLabel = `People: ${view.people.length} in the call${waiting.length ? `, ${waiting.length} invited` : ""}. Invite friends`;
    const html = `<div class="ctop"><button class="icon-btn min-btn" id="minBtn" aria-label="Minimize call">${ICON.down}</button>
      <button class="people-row" id="peopleBtn" aria-haspopup="dialog" aria-expanded="${sheetOpen}" aria-controls="sheet" aria-label="${esc(rowLabel)}"><span class="row avs" aria-hidden="true">${people.replace(/ role="img" aria-label="[^"]*"/g, "")}</span>${plus}</button>
      <div class="row schips">${pill}${modeTag}</div></div>`;
    const top = document.getElementById("top");
    if (top.dataset.html === html) return;
    const focused = document.activeElement && top.contains(document.activeElement) ? document.activeElement.id : null;
    top.innerHTML = html;
    top.dataset.html = html;
    if (focused) { const again = document.getElementById(focused); if (again) again.focus(); }
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
    const opts = card.slot === "vibe"
      ? `<div class="chips vibe-chips" role="group" aria-label="${esc(card.prompt)}">${card.options.map((o) => `<button class="chip" data-slot="vibe" data-answer="${esc(o.value)}" aria-pressed="${Boolean(o.mine)}">${esc(o.label)}${o.voters.length ? ` <span class="vn">${esc(o.voters.join(""))}</span>` : ""}</button>`).join("")}${otherHTML(true)}</div>`
      : card.options.map((o) => `<button class="ans" data-slot="${esc(card.slot)}" data-answer="${esc(o.value)}" aria-pressed="${Boolean(o.mine)}"><span class="grow">${esc(o.label)}</span>${avStack(o.voters)}</button>`).join("");
    const hint = label || `Sidekick is asking · ${view.me.mode === "voice" ? "say it or tap it" : "tap to answer"}${card.multi ? " · pick any that work" : ""}`;
    return `<div class="q"><span class="small">${esc(hint)}</span><h2>${esc(card.prompt)}</h2>${opts}${card.note ? `<span class="small">${esc(card.note)}</span>` : ""}</div>`;
  }

  // The invite and share options: inline while the planner is alone, in a sheet after that
  function shareHTML() {
    const link = inviteLink();
    const msg = `Help plan our next night! Sidekick's on the call: ${link}`;
    const enc = encodeURIComponent;
    const sms = `sms:${IOS ? "&" : "?"}body=${enc(msg)}`;
    const messenger = MOBILE ? `fb-messenger://share/?link=${enc(link)}` : "https://www.messenger.com/";
    return `<div class="row"><input class="in" readonly value="${esc(link)}" aria-label="Call link" style="font:500 13px var(--m)"><button class="btn sm out" id="copy">Copy</button></div>
      ${navigator.share ? '<button class="btn sm pri" id="share" style="width:100%">Share to the group chat</button>' : ""}
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
    const html = chatHTML(items);
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
    return `<div class="vote"><span class="small">Quick vote · everyone</span><h2>${esc(card.prompt)}</h2><div class="vote-row">${opts}</div>
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
    const ask = card && !card.private ? cardHTML(card).replace('<div class="q">', `<div class="q${fresh && waitedCards.has(cardKey) ? " reveal" : ""}">`) : waitCard ? `<div class="q listen" aria-live="polite"><span class="small">Sidekick is asking · just say it</span><h2>${esc(card0.prompt)}</h2><span class="small">Tap options show in a moment.</span></div>` : "";
    // The full board stays one tap away; sitting back, the board is the form and always open
    const open = form || boardOpen;
    const full = form ? rows : `<button class="plan-toggle" id="planToggle" aria-expanded="${open}" aria-controls="planRows">${open ? "Hide the full plan" : "See the full plan"}</button><div id="planRows" ${open ? "" : "hidden"}>${rows}</div>`;
    const around = view.candidate && view.me.planner ? `<p class="small cand-note">Planning around the event you saved. It goes in as a pick if it fits.</p>` : "";
    const typingOther = document.activeElement && document.activeElement.id === "vibeOtherIn";
    const html = `${invite}<div class="board ${form ? "as-form" : ""}">${boardHead()}${heardHTML()}${ask}${full}</div>${around}${formNote}${priv}`;
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
  function chatHTML(list) {
    const items = list || view.chat || [];
    // Quick replies stay under Sidekick's latest question while that question is still open
    const lastSk = [...items].reverse().find((m) => m.sk);
    const open = view.card && !view.card.form && !view.card.private ? view.card.slot : null;
    const quick = lastSk && lastSk.quick && lastSk.quick.slot === open && !voting() && view.status === "live" ? lastSk.quick : null;
    const bubbles = items.map((m) => {
      const mine = m.pid === view.me.id;
      return `<li class="msg ${m.sk ? "sk" : mine ? "me" : "them"}"><span class="msg-who">${m.sk ? "Sidekick" : mine ? "You" : esc(m.who)}${!m.sk && m.kind === "spoken" ? " · said" : ""}</span><span class="msg-t">${esc(m.text)}</span></li>`;
    }).join("");
    const chips = quick ? `<div class="chips quick" role="group" aria-label="Quick replies">${quick.options.map((o) => `<button class="chip" data-quick="${esc(quick.slot)}" data-value="${esc(o.value)}">${esc(o.label)}</button>`).join("")}</div>` : "";
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

  function renderPicks() {
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
    const a = e.target.closest("#backHome");
    if (!a) return;
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

  function renderDone() {
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
    const studyNext = STUDY_V === "form"
      ? `<div class="priv" style="border-style:solid;border-color:var(--bs)"><h2>Practice done</h2><p class="muted">Head back to the checklist for the next step.</p><a class="btn pri" href="/study?s=${encodeURIComponent(STUDY)}">Back to the checklist</a></div>`
      : `<div class="priv" style="border-style:solid;border-color:var(--bs)"><h2>Voice ${esc(STUDY_V)} done</h2><p class="muted">Four quick taps about this call, back on the checklist.</p><a class="btn pri" href="/study?s=${encodeURIComponent(STUDY)}#call${esc(STUDY_V)}">Answer 4 quick questions</a></div>`;
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
  function renderSay() {
    const el = document.getElementById("say");
    if (!el) return;
    const last = view.sidekick.slice(-1)[0];
    const sitting = view.mode === "sidelines" && phase === "call";
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
  // Sidekick leads or sits back, talk in the app (and mute), captions, natural or built-in voice, read aloud,
  // type instead, invite friends, ask for picks now, and "Don't learn from this plan". A dialog with focus
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
    const audio = voice && Audio.supported
      ? osw("audioBtn", "Talk in the app", Audio.on ? "Connected. Friends who aren't with you can hear you." : Audio.starting ? "Connecting audio…" : "For friends who aren't in the same room", Audio.on, Audio.starting ? "disabled" : "") + (Audio.on ? osw("muteBtn", "Mute me", micOn ? "Your crew can hear you" : "Your crew can't hear you", !micOn) : "")
      : "";
    const natural = view.voiceAgent && !STUDY && !agentCapped
      ? osw("agent", "Natural voice", agent ? "On. Turn off for the built-in voice." : agentStarting ? "Connecting Sidekick's natural voice…" : "Off. The built-in voice is reading.", Boolean(agent), agentStarting ? "disabled" : "")
      : "";
    const readAloud = (view.me.planner && !agent) || Audio.on ? osw("aloud", "Read Sidekick aloud", "On this phone", aloud) : "";
    return `${seg}
      <div class="ogroup">${audio}${osw("capsBtn", "Captions", "Live words from the call", capsShown)}${natural}${readAloud}
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
    renderDock();
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
    if (t.closest("#muteBtn")) return void (micOn ? stopMic() : startMic());
    if (t.closest("#learnBtn")) {
      const off = !view.me.noLearn;
      view.me.noLearn = off;
      renderOrb();
      send("learn", { off });
      return void toast(off ? "This plan won't change your taste." : "This plan counts toward your taste again.");
    }
    if (t.closest("#cfOk")) { t.closest("#cfOk").disabled = true; return void send("confirm", { how: "ok" }); }
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
    if (t.closest("#agent")) {
      if (agentStarting) return;
      agentPref = !agent;
      store.set("sk:agentVoice", agentPref);
      if (agent) { stopAgent(); if (view.me.mode === "voice" && !micOn) startMic(); } else startAgent();
      return;
    }
    if (t.closest("#audioBtn")) return void (Audio.on ? Audio.stop() : Audio.start().then(() => { if (Audio.on && !micOn) startMic(); }));
    const sm = t.closest("[data-setmode]");
    if (sm) {
      if (view.mode === "voting" || sm.dataset.setmode === view.mode) return;
      return void send("mode", { value: sm.dataset.setmode });
    }
    if (t.closest("#mic")) return void (agent ? setAgentMuted(!agentMuted) : micOn ? stopMic() : startMic());
    if (t.closest("#kb")) { typing = !typing; closeOrb(!typing); renderDock(); if (typing) document.getElementById("line").focus(); return; }
    if (t.closest("#aloud")) { aloud = !aloud; store.set("sk:aloud", aloud); renderDock(); if (!aloud) { Tts.stop(); if ("speechSynthesis" in window) speechSynthesis.cancel(); } return; }
    if (t.closest("#leave") || t.closest("#endCall")) {
      if (agent) stopAgent();
      if (view.me.planner) {
        if (confirm("End the call for everyone? The transcript will be deleted.")) send("end", {});
      } else {
        leaveQuietly();
        app.innerHTML = `<h1>You left the call</h1><p class="muted">You can rejoin with the same link while it's running.</p>${backBtn()}<button class="btn out" onclick="location.reload()">Rejoin</button>`;
        callNav(true);
      }
      return;
    }
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
  let agentPref = store.get("sk:agentVoice") !== false; // the "Use the built-in voice" switch, remembered
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
  const AGENT_TOOLS = ["get_plan_state", "get_next_move", "record_facts", "get_picks", "show_private_card", "accept_relax"];
  async function startAgent({ auto = false } = {}) {
    if (agent || agentStarting || agentCapped || !me || STUDY) return;
    agentStarting = true;
    agentDropped = false;
    if (phase) renderDock();
    let reserved = false;
    const hadMic = micOn;
    try {
      const sdk = loadEL();
      sdk.catch(() => {}); // a failed load is handled below (when it's awaited); not an unhandled rejection meanwhile
      const s = await api(`/api/sk/rooms/${roomId}/voice-agent`, { p: me.person });
      reserved = true;
      const { Conversation } = await sdk;
      if (micOn) stopMic();
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
        try { session = await Conversation.startSession({ ...opts, ...t }); break; } catch (err) { lastErr = err; }
      }
      if (!session) throw lastErr;
      agent = session;
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
      if (reserved) api(`/api/sk/rooms/${roomId}/voice-agent/end`, { p: me.person, seconds: 0 }).catch(() => {});
      // Quietly carry on with the built-in voice. A tap on the switch gets a short note; the automatic start doesn't.
      if (!auto) toast(agentCapped ? "Sidekick's natural voice is resting for now. The built-in voice carries on." : "Couldn't start Sidekick's natural voice. The built-in voice carries on.");
      if (hadMic && !micOn && (phase === "call" || phase === "picks")) startMic();
    } finally {
      agentStarting = false;
      if (phase) renderDock();
    }
  }
  // The session dropped or errored: switch to the built-in voice once, with at most one short note
  function agentFallback() {
    if (!agent) return;
    stopAgent();
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
    async start() {
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
        toast(err.name === "NotAllowedError" ? "The microphone is blocked, so in-app audio can't start." : err.message || "In-app audio couldn't start.");
      } finally {
        this.starting = false;
        renderDock();
        renderTop();
      }
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

  let aloud = store.get("sk:aloud") !== false;
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
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), 4000);
          const r = await fetch("/api/sk/tts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: line, persona }), signal: ctrl.signal }).finally(() => clearTimeout(timer));
          if (!r.ok) { if (r.status === 429 || r.status === 503) this.off = true; return false; }
          if (!/audio/.test(r.headers.get("content-type") || "")) return false;
          url = URL.createObjectURL(await r.blob());
          this.urls.set(key, url);
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
        await a.play();
        window.__skTts = (window.__skTts || 0) + 1; // lines played in the ElevenLabs voice (for the tests)
        if (onstart) onstart();
        return true;
      } catch {
        return false;
      }
    },
  };
  // One line: the ElevenLabs voice, or the phone's own voice when that can't play
  function speakLine(text, persona, builtIn, { onstart, onend } = {}) {
    return Tts.play(text, persona, { onstart, onend }).then((ok) => {
      if (ok || !("speechSynthesis" in window)) { if (!ok && onend) onend(); return ok; }
      try {
        const u = Voice.say(text, builtIn);
        const tail = u.chunks[u.chunks.length - 1];
        if (onstart) u.onstart = onstart;
        if (onend) { tail.onend = onend; for (const c of u.chunks) c.onerror = onend; }
      } catch { if (onend) onend(); }
      return false;
    });
  }

  // ---------- Start ----------
  if (STUDY) {
    const bar = document.createElement("nav");
    bar.setAttribute("aria-label", "Study");
    bar.style.cssText = "display:flex;justify-content:space-between;align-items:center;max-width:440px;margin:0 auto;padding:max(4px,env(safe-area-inset-top)) 16px 0;font-size:13px;font-weight:600;color:var(--t3)";
    bar.innerHTML = `<a href="/study?s=${encodeURIComponent(STUDY)}" style="color:var(--acc);text-decoration:none;min-height:44px;display:flex;align-items:center">&larr; Study checklist</a><span>${STUDY_V === "form" ? "Practice" : `Voice ${esc(STUDY_V)}`}</span>`;
    document.body.insertBefore(bar, app);
  }
  if (!roomId) (STUDY || params.get("quick") ? startScreen() : flowStart());
  else if (me && me.person) { if (me.mode === "form") pfOn(true); connect(); }
  else joinScreen();
})();
