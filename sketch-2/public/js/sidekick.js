// Sidekick planning call (front end). One page for three steps:
//   /sk          the planner starts a call (picks candidate nights)
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
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
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
    if (!c) return;
    const g = c.closest(".chips");
    if (g.hasAttribute("data-multi")) c.setAttribute("aria-pressed", c.getAttribute("aria-pressed") !== "true");
    else g.querySelectorAll(".chip").forEach((x) => x.setAttribute("aria-pressed", x === c));
  });
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
        const out = STUDY ? await studyApi("call", { n: 1, name, crew, nights: chosen }) : await api("/api/sk/rooms", { name, crew, nights: chosen, persona: params.get("persona") || undefined });
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

  // ---------- 2. Join ----------
  async function joinScreen() {
    let info;
    try { info = await api(`/api/sk/rooms/${roomId}/info`); } catch (err) {
      if (err.status === 404) return goneScreen(err.data);
      app.innerHTML = `<h1>Can't reach the call</h1><p class="muted">Check your connection and try again.</p><button class="btn out" onclick="location.reload()">Try again</button>`;
      return;
    }
    if (info.status !== "live") {
      app.innerHTML = `<h1>This call has finished</h1><p class="muted">Ask whoever planned it for the plan.</p>`;
      return;
    }
    const who = info.people.length ? `${info.people.slice(0, 3).join(", ")}${info.people.length > 3 ? " and others" : ""} ${info.people.length === 1 ? "is" : "are"} on` : "";
    app.innerHTML = `
      <div class="row sb"><span class="tag pri">Planning call · ${esc(info.crew)}</span><span class="orb"></span></div>
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
        <p style="font-weight:600">Feeling like</p><div class="chips" data-name="vibe" data-multi>${PRIVATE_OPTS.vibe.map(([v, l]) => chip("vibe", v, l, false)).join("")}</div>
      </div>
      <div class="stack" id="joinBtns">
        <button class="btn pri" data-mode="voice">Join with voice</button>
        <button class="btn out" data-mode="text">Join by text</button>
        <button class="btn out" id="formMode">Answer without calling</button>
      </div>`;
    initOrigin();
    const extra = document.getElementById("formExtra");
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
      }
      unlockAudio();
      if (one("origin")) {
        const origin = await originAnswer(b);
        if (!origin) return; // no location: Union is now selected, with a note; the next tap joins
        answers.origin = origin;
      }
      b.disabled = true;
      try {
        const out = await api(`/api/sk/rooms/${roomId}/join`, { name, mode: b.dataset.mode, answers });
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
    const next = view.locked ? "locked" : view.status === "ended" ? "ended" : view.picks ? "picks" : "call";
    if (view.mode !== lastMode) { lastMode = view.mode; if (phase === next) renderDock(); }
    if (next !== phase) {
      phase = next;
      landed = phase === "picks" && Boolean(lastThinking); // the steps give way to the cards
      app.innerHTML = `<div id="top"></div><div id="say"></div><div id="body" class="stack"></div><div id="ticks" class="stack"></div><p class="sr" id="thinkLive" aria-live="polite"></p><div class="dock" id="dock"></div>`;
      watchDock();
      renderDock();
    }
    renderTop();
    renderSay();
    if (phase === "call") renderCall();
    if (phase === "picks") renderPicks();
    if (phase === "locked" || phase === "ended") renderDone();
    if (sheetOpen) renderSheet();
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
    const pill = view.me.planner && (view.people.length >= 2 || voting()) && (phase === "call" || phase === "picks")
      ? `<button class="pill-hit" id="invitePill" aria-haspopup="dialog" aria-label="Invite people"><span class="pill">${ICON.invite}Invite</span></button>` : "";
    document.getElementById("top").innerHTML = `<div class="row sb"><div class="row avs">${people}</div><div class="row" style="gap:4px">${pill}${modeTag}</div></div>`;
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
    const opts = card.options.map((o) => `<button class="ans" data-slot="${esc(card.slot)}" data-answer="${esc(o.value)}" aria-pressed="${Boolean(o.mine)}"><span class="grow">${esc(o.label)}</span>${avStack(o.voters)}</button>`).join("");
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
    return `<div class="priv invite"><p style="font-weight:600">Invite your crew</p><p class="small">Anyone with the link can join from a browser. No app or account needed.</p>${shareHTML()}${practice}</div>`;
  }

  let sheetOpen = false;
  function openSheet() {
    sheetOpen = true;
    renderSheet();
    const first = document.querySelector("#sheet .sheet-panel button, #sheet .sheet-panel a");
    (first || document.getElementById("sheet")).focus();
  }
  function closeSheet() {
    sheetOpen = false;
    const s = document.getElementById("sheet");
    if (s) s.remove();
    const pill = document.getElementById("invitePill");
    if (pill) pill.focus();
  }
  function renderSheet() {
    let s = document.getElementById("sheet");
    const fresh = !s;
    if (fresh) {
      s = document.createElement("div");
      s.id = "sheet";
      s.className = "sheet-wrap";
      document.body.appendChild(s);
    }
    if (!fresh) return; // the link doesn't change; don't steal focus by redrawing
    s.innerHTML = `<div class="sheet-scrim" data-close></div><div class="sheet-panel" role="dialog" aria-modal="true" aria-labelledby="sheetTitle" tabindex="-1">
      <div class="row sb"><h2 id="sheetTitle">Invite to the call</h2><button class="icon-btn" data-close aria-label="Close">${ICON.x}</button></div>
      <p class="small">Anyone with the link can join from a browser. No app or account needed.</p>${shareHTML()}</div>`;
  }
  document.addEventListener("keydown", (e) => {
    if (!sheetOpen) return;
    if (e.key === "Escape") { e.preventDefault(); closeSheet(); return; }
    if (e.key === "Tab") { // keep focus inside the sheet
      const items = [...document.querySelectorAll("#sheet .sheet-panel button, #sheet .sheet-panel a, #sheet .sheet-panel input")];
      if (!items.length) return;
      const [first, last] = [items[0], items[items.length - 1]];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  function chipsRow(card) {
    return `<div class="chips" role="group" aria-label="${esc(card.prompt)}">${card.options.map((o) => `<button class="chip" data-slot="${esc(card.slot)}" data-answer="${esc(o.value)}" aria-pressed="${Boolean(o.mine)}">${esc(o.label)}${o.voters.length ? ` <span class="vn">${esc(o.voters.join(""))}</span>` : ""}</button>`).join("")}</div>`;
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
    const t = thinking();
    if (t) {
      body.innerHTML = thinkingHTML(t);
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
    const invite = view.me.planner && view.people.length < 2 ? invitePanel() : "";
    const formNote = form ? `<p class="small">Fill it in together. Sidekick suggests two picks once everyone's in.</p>` : "";
    // The card fades in once, when it first shows (not on every update)
    const cardKey = card && `${card.slot}:${card.at}`;
    const fresh = cardKey && !shownCards.has(cardKey);
    if (fresh) shownCards.add(cardKey);
    const ask = card && !card.private ? cardHTML(card).replace('<div class="q">', `<div class="q${fresh && waitedCards.has(cardKey) ? " reveal" : ""}">`) : waitCard ? `<div class="q listen" aria-live="polite"><span class="small">Sidekick is asking · just say it</span><h2>${esc(card0.prompt)}</h2><span class="small">Tap options show in a moment.</span></div>` : "";
    // The full board stays one tap away; sitting back, the board is the form and always open
    const open = form || boardOpen;
    const full = form ? rows : `<button class="plan-toggle" id="planToggle" aria-expanded="${open}" aria-controls="planRows">${open ? "Hide the full plan" : "See the full plan"}</button><div id="planRows" ${open ? "" : "hidden"}>${rows}</div>`;
    body.innerHTML = `${invite}<div class="board ${form ? "as-form" : ""}">${boardHead()}${heardHTML()}${ask}${full}</div>${formNote}${priv}`;
    renderTicks();
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
  let boardOpen = store.get("sk:boardOpen") !== false; // open unless this phone folded it

  function renderTicks() {
    const t = document.getElementById("ticks");
    if (!t || !view) return;
    if (phase !== "call") { t.innerHTML = ""; return; }
    if (chatMode()) { t.innerHTML = chatHTML(); const th = t.querySelector(".thread"); if (th) th.scrollTop = th.scrollHeight; return; }
    t.innerHTML = view.captions.slice(-2).map((c) => `<div class="tick"><b>${esc(c.name)}${c.kind === "typed" ? " · typed" : ""}</b><span>${esc(c.text)}</span></div>`).join("") + (interim ? `<div class="tick me"><b>You</b><span>${esc(interim)}</span></div>` : "");
  }

  // Typing: the call reads like a group chat. Sidekick's replies are the shorter text versions, and its
  // latest question has quick replies under it (a tap answers and posts it in the thread).
  const chatMode = () => view && view.me && (view.me.mode === "text" || typing || capsOff);
  function chatHTML() {
    const items = view.chat || [];
    // Quick replies stay under Sidekick's latest question while that question is still open
    const lastSk = [...items].reverse().find((m) => m.sk);
    const open = view.card && !view.card.form && !view.card.private ? view.card.slot : null;
    const quick = lastSk && lastSk.quick && lastSk.quick.slot === open && !voting() && view.status === "live" ? lastSk.quick : null;
    const bubbles = items.map((m) => {
      const mine = m.pid === view.me.id;
      return `<li class="msg ${m.sk ? "sk" : mine ? "me" : "them"}"><span class="msg-who">${m.sk ? "Sidekick" : mine ? "You" : esc(m.who)}${!m.sk && m.kind === "spoken" ? " · said" : ""}</span><span class="msg-t">${esc(m.text)}</span></li>`;
    }).join("");
    const chips = quick ? `<div class="chips quick" role="group" aria-label="Quick replies">${quick.options.map((o) => `<button class="chip" data-quick="${esc(quick.slot)}" data-value="${esc(o.value)}">${esc(o.label)}</button>`).join("")}</div>` : "";
    return `<section class="chat" aria-label="Call chat"><ol class="thread" aria-live="polite">${bubbles || '<li class="msg sys"><span class="msg-t">Type to the call. Sidekick replies here.</span></li>'}</ol>${chips}</section>`;
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
        <span class="row sb">${tag}${avStack(voters)}</span>
        <h2>${esc(p.title)}</h2>
        <span class="pk-when">${esc(p.when)}</span>
        ${meta.filter(Boolean).map((m) => `<span class="pk-meta">${esc(m)}</span>`).join("")}
        ${p.reason ? `<span class="small" style="color:var(--acc)">${esc(p.reason)}</span>` : ""}
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
    document.getElementById("body").innerHTML = `<div class="board${land}">${boardHead('<span class="tag ok">All set</span>')}<p class="small" style="padding:0 14px 12px;color:var(--t2)">${esc(summary)}</p></div>
      <div class="q${land}" style="border-radius:22px;border:1px solid var(--pri-e)"><span class="small">${mixed ? "A show to go to, or a spot to drop in. Tap one to vote." : "Two picks fit everyone · tap one to vote"}</span>${picks}</div>
      <p class="small">Picked for your crew's budget, distance and vibe. Venues can't pay to appear here.</p>
      ${lock}`;
    renderTicks();
  }

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
    document.getElementById("body").innerHTML = plan + (STUDY ? studyNext : survey); // in the study, its own questions replace these
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

  function renderDock() {
    const dock = document.getElementById("dock");
    if (!dock || !view) return;
    if (phase === "locked" || phase === "ended") {
      dock.innerHTML = view.me.planner && phase === "locked" ? `<button class="btn out" id="endCall">End the call</button>` : "";
      if (!dock.innerHTML) dock.hidden = true;
      return;
    }
    dock.hidden = false;
    const voice = view.me.mode === "voice";
    // The voice switch: natural voice (ElevenLabs agent) or the built-in voice. Study calls keep the built-in one in both arms.
    const agentBtn = view.voiceAgent && !STUDY && !agentCapped
      ? `<button class="btn out sm wide-btn" id="agent" aria-pressed="${Boolean(agent)}">${agent ? "Natural voice on · Use the built-in voice" : agentStarting ? "Connecting Sidekick's natural voice…" : "Built-in voice · Use Sidekick's natural voice"}</button>`
      : "";
    const vote = view.mode === "voting";
    const seg = view.mode && phase === "call"
      ? `<div class="seg ${vote ? "off" : ""}" role="radiogroup" aria-label="How Sidekick helps" ${vote ? 'aria-disabled="true" inert' : ""}>
          <button role="radio" data-setmode="lead" aria-checked="${view.mode === "lead"}" tabindex="${view.mode === "lead" || vote ? 0 : -1}">Sidekick leads</button>
          <button role="radio" data-setmode="sidelines" aria-checked="${view.mode === "sidelines"}" tabindex="${view.mode === "sidelines" ? 0 : -1}">Sidekick sits back</button></div>`
      : "";
    const audioBtn = voice && Audio.supported
      ? `<button class="btn out sm wide-btn" id="audioBtn" aria-pressed="${Audio.on}">${Audio.on ? "In-app audio on · Leave audio" : Audio.starting ? "Connecting audio…" : "Talk in the app"}</button>`
      : "";
    const capsNote = capsOff ? `<p class="small center">Captions pause on this phone during in-app audio. Type to Sidekick.</p>` : "";
    const showCompose = !voice || typing || capsOff;
    dock.innerHTML = `${seg}${agentBtn}${audioBtn}${capsNote}
      <form class="compose" id="compose" ${showCompose ? "" : "hidden"}><label class="sr" for="line">Message the call</label><input class="in" id="line" autocomplete="off" placeholder="${voice ? "Type instead…" : "Type to the call…"}" maxlength="300"><button class="send" aria-label="Send">${ICON.send}</button></form>
      <div class="ctrls">
        ${voice && !agent ? `<button class="ctrl" id="mic" aria-pressed="${micOn}" aria-label="${micOn ? "Mute" : "Unmute"}">${ICON.mic}</button>` : ""}
        <button class="ctrl" id="ask" aria-label="Ask Sidekick for picks"><span class="orb"></span></button>
        ${(view.me.planner && !agent) || Audio.on ? `<button class="ctrl" id="aloud" aria-pressed="${aloud}" aria-label="Read Sidekick aloud">${ICON.speaker}</button>` : ""}
        ${voice ? `<button class="ctrl" id="kb" aria-label="Type instead"><span style="font:600 13px var(--m)">Aa</span></button>` : ""}
        <button class="ctrl end" id="leave" aria-label="${view.me.planner ? "End the call" : "Leave the call"}">${ICON.x}</button>
      </div>`;
  }

  // Taps (in the call, and in the invite sheet, which lives outside #app)
  function onTap(e) {
    const t = e.target;
    if (t.closest("#sheet [data-close]")) return void closeSheet();
    if (t.closest("#invitePill")) return void openSheet();
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
    if (t.closest("#share")) return void navigator.share({ title: `${view.crew}: help plan our next night`, text: "Help plan our next night! Sidekick's on the call:", url: inviteLink() }).catch(() => {});
    if (t.closest("#ask")) return void send("ask", {});
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
    if (t.closest("#mic")) return void (micOn ? stopMic() : startMic());
    if (t.closest("#kb")) { typing = !typing; renderDock(); if (typing) document.getElementById("line").focus(); return; }
    if (t.closest("#aloud")) { aloud = !aloud; store.set("sk:aloud", aloud); renderDock(); if (!aloud) speechSynthesis.cancel(); return; }
    if (t.closest("#leave") || t.closest("#endCall")) {
      if (agent) stopAgent();
      if (view.me.planner) {
        if (confirm("End the call for everyone? The transcript will be deleted.")) send("end", {});
      } else {
        leaveQuietly();
        app.innerHTML = `<h1>You left the call</h1><p class="muted">You can rejoin with the same link while it's running.</p><button class="btn out" onclick="location.reload()">Rejoin</button>`;
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
  document.addEventListener("click", (e) => { if (e.target.closest("#sheet")) onTap(e); });
  // Arrow keys move between the two segments of the mode switch
  app.addEventListener("keydown", (e) => {
    const r = e.target.closest(".seg [role=radio]");
    if (!r || !["ArrowLeft", "ArrowRight"].includes(e.key)) return;
    e.preventDefault();
    const other = [...r.parentElement.children].find((x) => x !== r);
    other.focus();
    other.click();
  });
  app.addEventListener("submit", (e) => {
    if (e.target.id !== "compose") return;
    e.preventDefault();
    const input = document.getElementById("line");
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
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
        if (x.isFinal) send("line", { text: x[0].transcript, kind: "spoken" });
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
    if (!("speechSynthesis" in window)) return;
    // Barge-in: if anyone else starts talking while Sidekick is speaking, stop at once
    if (speechSynthesis.speaking && view.people.some((p) => p.talking && p.id !== view.me.id)) speechSynthesis.cancel();
    // Who reads aloud: the planner's phone (unless the voice agent is speaking there), and, when the crew
    // is in in-app audio, every phone in it, so remote friends hear Sidekick too
    const plannerReads = view.me.planner && !agent && !agentStarting;
    const remoteReads = Audio.on && !view.me.planner;
    if (!aloud || !(plannerReads || remoteReads)) return;
    const last = view.sidekick.slice(-1)[0];
    if (!last || last.system || last.id === lastRead) return;
    if (lastRead === null && Date.now() - last.at > 15000) { lastRead = last.id; return; } // don't replay old lines after a reload
    // Never talk over anyone: wait while someone has spoken since this line was made, or this phone
    // is mid-sentence. The person who just asked Sidekick something isn't "talking over" its answer.
    const over = view.people.some((p) => p.talking && p.spokeAt > last.at) || Boolean(interim.trim());
    if (over && tries < 8) return void setTimeout(() => readAloud(tries + 1), 400);
    lastRead = last.id;
    const u = Voice.say(last.text, view.voice);
    const tail = u.chunks[u.chunks.length - 1];
    let ended = false;
    const resume = () => { if (ended) return; ended = true; Audio.duck(false); if (paused) { paused = false; restartRec(150); } };
    u.onstart = () => { Audio.duck(true); if (micOn) { paused = true; stopRec(); } }; // don't caption (or send) Sidekick's own voice
    tail.onend = resume;
    for (const c of u.chunks) c.onerror = resume;
    setTimeout(resume, 2000 + Voice.speakable(last.text).split(/\s+/).length * 600); // some phones never fire onend
  }

  // ---------- Start ----------
  if (STUDY) {
    const bar = document.createElement("nav");
    bar.setAttribute("aria-label", "Study");
    bar.style.cssText = "display:flex;justify-content:space-between;align-items:center;max-width:440px;margin:0 auto;padding:max(4px,env(safe-area-inset-top)) 16px 0;font-size:13px;font-weight:600;color:var(--t3)";
    bar.innerHTML = `<a href="/study?s=${encodeURIComponent(STUDY)}" style="color:var(--acc);text-decoration:none;min-height:44px;display:flex;align-items:center">&larr; Study checklist</a><span>${STUDY_V === "form" ? "Practice" : `Voice ${esc(STUDY_V)}`}</span>`;
    document.body.insertBefore(bar, app);
  }
  if (!roomId) startScreen();
  else if (me && me.person) connect();
  else joinScreen();
})();
