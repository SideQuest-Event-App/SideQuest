// Sidekick planning call (front end). One page for three steps:
//   /sk          the planner starts a call (picks candidate nights)
//   /sk/:room    a friend joins: name, private card, then voice, text or form
//   (in the call) the plan board with the current question card, captions, picks, vote, lock, survey
// Voice uses the browser's own speech recognition (Chrome, Edge, Safari); everyone can type instead.
(() => {
  const app = document.getElementById("app");
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const roomId = location.pathname.split("/")[2] || null;
  const params = new URLSearchParams(location.search);
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };
  const ICON = {
    mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    send: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    lock: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
    speaker: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/></svg>',
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
    if (!res.ok) throw new Error(data.error || "Something went wrong. Try again in a moment.");
    return data;
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

  // ---------- 1. Start a call ----------
  async function startScreen() {
    let nights = [];
    try { ({ nights } = await api("/api/sk/nights")); } catch (err) { toast(err.message); }
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
      <button class="btn pri" id="go">Start the call</button>`;
    document.getElementById("go").onclick = async (e) => {
      const name = document.getElementById("name").value.trim();
      const crew = document.getElementById("crew").value.trim() || "The crew";
      const chosen = picked("nights");
      if (!name) return toast("Add your name so your crew knows who's planning.");
      if (!chosen.length) return toast("Pick at least one night.");
      e.target.disabled = true;
      try {
        const out = await api("/api/sk/rooms", { name, crew, nights: chosen, persona: params.get("persona") || undefined });
        store.set("sk:name", name);
        store.set("sk:crew", crew);
        store.set(`sk:${out.room}`, { person: out.person });
        location.href = `/sk/${out.room}`;
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
      app.innerHTML = `<h1>This call isn't available</h1><p class="muted">${esc(err.message)}</p><a class="btn out" href="/sk">Start a new plan</a>`;
      return;
    }
    if (info.status !== "live") {
      app.innerHTML = `<h1>This call has finished</h1><p class="muted">Ask whoever planned it for the plan.</p>`;
      return;
    }
    const who = info.people.length ? `${info.people.slice(0, 3).join(", ")}${info.people.length > 3 ? " and others" : ""} ${info.people.length === 1 ? "is" : "are"} on` : "";
    app.innerHTML = `
      <div class="row sb"><span class="tag pri">Planning call · ${esc(info.crew)}</span><span class="orb live"></span></div>
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
      <div class="stack"><p style="font-weight:600">Starting from</p>
        <div class="chips" data-name="origin">${PRIVATE_OPTS.origin.map(([v, l]) => chip("origin", v, l, false)).join("")}</div></div>
      <div class="stack" id="formExtra" hidden>
        <p style="font-weight:600">Which nights work?</p><div class="chips" data-name="night" data-multi>${info.nights.map((l, i) => chip("night", i, l, false)).join("")}</div>
        <p style="font-weight:600">What time?</p><div class="chips" data-name="time" data-multi>${PRIVATE_OPTS.time.map(([v, l]) => chip("time", v, l, false)).join("")}</div>
        <p style="font-weight:600">Feeling like</p><div class="chips" data-name="vibe" data-multi>${PRIVATE_OPTS.vibe.map(([v, l]) => chip("vibe", v, l, false)).join("")}</div>
      </div>
      <div class="stack" id="joinBtns">
        <button class="btn pri" data-mode="voice">Join with voice</button>
        <button class="btn out" data-mode="text">Join by text</button>
        <button class="btn out" id="formMode">Just answer, no call</button>
      </div>`;
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
      if (one("origin")) answers.origin = one("origin");
      if (picked("nos").length) answers.nos = picked("nos");
      if (b.dataset.mode === "form") {
        // the night chips carry an index; the server knows the dates
        const nightIdx = picked("night").map(Number);
        if (nightIdx.length) answers.nightIdx = nightIdx;
        if (picked("time").length) answers.time = picked("time");
        if (picked("vibe").length) answers.vibe = picked("vibe");
      }
      b.disabled = true;
      try {
        const out = await api(`/api/sk/rooms/${roomId}/join`, { name, mode: b.dataset.mode, answers });
        store.set("sk:name", name);
        me = { person: out.person, mode: b.dataset.mode };
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
  let view = null;
  let es = null;
  let phase = null;
  const colour = (id) => `c${Math.max(0, view.people.findIndex((p) => p.id === id)) % 6}`;
  const send = (action, body = {}) => api(`/api/sk/rooms/${roomId}/${action}`, { p: me.person, ...body }).catch((err) => toast(err.message));

  function connect() {
    if (es) es.close();
    es = new EventSource(`/api/sk/rooms/${roomId}/stream?p=${encodeURIComponent(me.person)}`);
    let warned = false;
    es.onmessage = (e) => {
      view = JSON.parse(e.data);
      warned = false;
      render();
      readAloud();
    };
    es.onerror = async () => {
      if (warned) return;
      warned = true;
      // Is the call still there, and are we still in it (the server may have restarted)?
      try {
        const info = await api(`/api/sk/rooms/${roomId}/info?p=${encodeURIComponent(me.person)}`);
        if (!info.member) { es.close(); store.set(`sk:${roomId}`, null); me = null; phase = null; joinScreen(); return; }
        toast("Reconnecting…");
      } catch {
        es.close();
        phase = null;
        app.innerHTML = `<h1>This call has ended</h1><p class="muted">The transcript was deleted when it ended.</p><a class="btn out" href="/sk">Start a new plan</a>`;
      }
    };
  }

  function render() {
    const next = view.locked ? "locked" : view.status === "ended" ? "ended" : view.picks ? "picks" : "call";
    if (next !== phase) {
      phase = next;
      app.innerHTML = `<div id="top"></div><div id="body" class="stack"></div><div id="say" class="stack"></div><div id="ticks" class="stack"></div><div class="dock" id="dock"></div>`;
      renderDock();
    }
    renderTop();
    if (phase === "call") renderCall();
    if (phase === "picks") renderPicks();
    if (phase === "locked" || phase === "ended") renderDone();
    renderSay();
  }

  function renderTop() {
    const people = view.people.map((p) => `<span class="av ${colour(p.id)} ${p.talking ? "talk" : ""} ${p.mode === "form" ? "away" : ""}" title="${esc(p.name)}${p.mode !== "voice" ? ` (${p.mode})` : ""}">${esc(p.initial)}</span>`).join("");
    const modeTag = view.me.mode === "voice" ? '<span class="tag hot">Live</span>' : `<span class="tag soc">${view.me.mode === "text" ? "Text · mic off" : "Answered by form"}</span>`;
    document.getElementById("top").innerHTML = `<div class="row sb"><div class="row" style="gap:6px">${people}</div>${modeTag}</div>`;
  }

  function boardHead(extra = "") {
    const dots = [0, 1, 2, 3, 4].map((i) => `<span class="dot ${i < view.known ? "done" : ""}"></span>`).join("");
    return `<div class="bh"><span class="row"><span class="orb ${phase === "call" ? "live" : ""}"></span><h2 style="font-size:15px">${esc(view.crew)}'s plan</h2></span>${extra || `<span class="dots" role="img" aria-label="${view.known} of 5 known">${dots}</span>`}</div>`;
  }

  function cardHTML(card) {
    const opts = card.options.map((o) => `<button class="ans" data-answer="${esc(o.value)}" aria-pressed="${Boolean(o.mine)}"><span class="grow">${esc(o.label)}</span>${o.voters.length ? `<span class="stk">${o.voters.map((v) => `<span class="av xs c${"ABCDEFGHIJKLMNOPQRSTUVWXYZ".indexOf(v) % 6}">${esc(v)}</span>`).join("")}</span>` : ""}</button>`).join("");
    return `<div class="q"><span class="small">Sidekick is asking · ${view.me.mode === "voice" ? "say it or tap it" : "tap to answer"}${card.multi ? " · pick any that work" : ""}</span><h2>${esc(card.prompt)}</h2>${opts}</div>`;
  }

  function renderCall() {
    const card = view.card;
    const rows = view.rows.map((r) => {
      if (card && !card.private && card.slot === r.slot) return cardHTML(card);
      const cls = r.slot === "budget" ? "priv-row" : "";
      const value = r.state === "conflict" ? r.conflict.join(" vs. ") : r.value || (r.state === "asking" ? "Asking now" : "Not yet");
      return `<dl class="r ${r.state} ${cls}" style="margin:0"><dt>${esc(r.label)}</dt><dd>${esc(value)}</dd>${r.who ? `<span class="who">${esc(r.who)}</span>` : ""}</dl>`;
    }).join("");
    let priv = "";
    if (card && card.private) {
      priv = card.waiting
        ? `<div class="priv"><span class="lock">${ICON.lock}Only Sidekick sees this</span><p class="muted">Thanks. Waiting on the others.</p></div>`
        : `<div class="priv"><span class="lock">${ICON.lock}Just for you · nobody else sees this</span><h2>${esc(card.prompt)}</h2>${card.options.map((o) => `<button class="ans" data-answer="${esc(o.value)}" data-private="1"><span class="grow">${esc(o.label)}</span></button>`).join("")}<p class="small">The group only sees one limit, never whose it is.</p></div>`;
    }
    const link = `${location.origin}/sk/${roomId}`;
    const invite = view.me.planner && view.people.length < 4
      ? `<div class="priv" style="border-style:solid;border-color:var(--soc-t)"><p style="font-weight:600">${view.people.length < 2 ? "Invite your crew" : "Anyone else coming?"}</p><p class="small">Anyone with the link can join from a browser. No app or account needed.</p><div class="row"><input class="in" readonly value="${esc(link)}" aria-label="Call link" style="font:500 13px var(--m)"><button class="btn sm out" id="copy">Copy</button></div>${navigator.share ? '<button class="btn sm out" id="share" style="width:100%">Share to the group chat</button>' : ""}</div>`
      : "";
    document.getElementById("body").innerHTML = `${view.people.length < 2 ? invite : ""}<div class="board">${boardHead()}${rows}</div>${priv}${view.people.length >= 2 ? invite : ""}`;
    document.getElementById("ticks").innerHTML = view.captions.slice(-2).map((c) => `<div class="tick"><b>${esc(c.name)}${c.kind === "typed" ? " · typed" : ""}</b><span>${esc(c.text)}</span></div>`).join("") + (interim ? `<div class="tick me"><b>You</b><span>${esc(interim)}</span></div>` : "");
  }

  function renderPicks() {
    const crewSize = view.people.length;
    const summary = view.rows.filter((r) => r.value).map((r) => r.value).join(" · ");
    const picks = view.picks.map((p) => {
      const voters = view.votes[p.id] || [];
      const fits = Object.entries(p.fits || {}).filter(([, v]) => v).map(([n, v]) => `<span><b>${esc(n)}</b> ${esc(v)}</span>`).join("");
      return `<button class="pick" data-vote="${p.id}" aria-pressed="${view.myVote === p.id}">
        <span class="row sb"><h2>${esc(p.title)}</h2>${voters.length ? `<span class="stk">${voters.map((v) => `<span class="av xs c${"ABCDEFGHIJKLMNOPQRSTUVWXYZ".indexOf(v) % 6}">${esc(v)}</span>`).join("")}</span>` : ""}</span>
        <span class="small" style="color:var(--t2)">${esc([p.when, p.price, p.where].filter(Boolean).join(" · "))}</span>
        ${p.reason ? `<span class="small" style="color:var(--acc)">${esc(p.reason)}</span>` : ""}
        ${fits ? `<span class="fits">${fits}</span>` : ""}
        ${p.stretch && p.stretch.length ? `<span class="small">Stretches: ${esc(p.stretch.join(", "))}</span>` : ""}
        <span class="meter"><i style="width:${Math.round((voters.length / crewSize) * 100)}%"></i></span>
      </button>`;
    }).join("");
    const lock = view.me.planner
      ? `<button class="btn pri" id="lock" ${Object.keys(view.votes).length ? "" : "disabled"}>Lock in the plan</button>`
      : `<p class="small center">${esc(view.people.find((p) => p.planner)?.name || "The planner")} locks it in once you've voted.</p>`;
    document.getElementById("body").innerHTML = `<div class="board">${boardHead('<span class="tag ok">All set</span>')}<p class="small" style="padding:0 14px 12px;color:var(--t2)">${esc(summary)}</p></div>
      <div class="q" style="border-radius:22px;border:1px solid var(--pri-e)"><span class="small">Two picks fit everyone · tap one to vote</span>${picks}</div>
      <p class="small">Picked for your crew's budget, distance and vibe. Venues can't pay to appear here.</p>${lock}`;
    document.getElementById("ticks").innerHTML = "";
  }

  function renderDone() {
    const L = view.locked;
    const plan = L
      ? `<div class="board">${boardHead('<span class="tag ok">Locked</span>')}<div style="padding:0 14px 14px" class="stack"><h1>${esc(L.title)}</h1><p class="muted">${esc([L.when, L.price, L.where].filter(Boolean).join(" · "))}</p>${L.url ? `<a class="small" style="color:var(--soc-x)" href="${esc(L.url)}" target="_blank" rel="noopener">See the listing</a>` : ""}</div></div>`
      : `<h1>Call ended</h1><p class="muted">The transcript has been deleted.</p>`;
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
    document.getElementById("body").innerHTML = plan + survey;
    document.getElementById("ticks").innerHTML = "";
  }

  function renderSay() {
    const last = view.sidekick.slice(-1)[0];
    document.getElementById("say").innerHTML = last && phase !== "locked" && phase !== "ended"
      ? `<div class="say ${last.system ? "sys" : ""}"><span class="orb" style="margin-top:4px"></span><p>${esc(last.text)}</p></div>`
      : "";
  }

  function renderDock() {
    const dock = document.getElementById("dock");
    if (phase === "locked" || phase === "ended") {
      dock.innerHTML = view.me.planner && phase === "locked" ? `<button class="btn out" id="endCall">End the call</button>` : "";
      return;
    }
    const voice = view.me.mode === "voice";
    dock.innerHTML = `
      <form class="compose" id="compose" ${voice && !typing ? "hidden" : ""}><label class="sr" for="line">Message the call</label><input class="in" id="line" autocomplete="off" placeholder="${voice ? "Type instead…" : "Type to the call…"}" maxlength="300"><button class="send" aria-label="Send">${ICON.send}</button></form>
      <div class="ctrls">
        ${voice ? `<button class="ctrl" id="mic" aria-pressed="${micOn}" aria-label="${micOn ? "Mute" : "Unmute"}">${ICON.mic}</button>` : ""}
        <button class="ctrl" id="ask" aria-label="Ask Sidekick for picks"><span class="orb"></span></button>
        ${view.me.planner ? `<button class="ctrl" id="aloud" aria-pressed="${aloud}" aria-label="Read Sidekick aloud">${ICON.speaker}</button>` : ""}
        ${voice ? `<button class="ctrl" id="kb" aria-label="Type instead"><span style="font:600 13px var(--m)">Aa</span></button>` : ""}
        <button class="ctrl end" id="leave" aria-label="${view.me.planner ? "End the call" : "Leave the call"}">${ICON.x}</button>
      </div>`;
  }

  // Taps
  app.addEventListener("click", (e) => {
    const t = e.target;
    const ans = t.closest("[data-answer]");
    if (ans && view && view.card) {
      const card = view.card;
      let value = ans.dataset.answer;
      if (card.multi && !ans.dataset.private) {
        const now = card.options.filter((o) => o.mine).map((o) => o.value);
        value = now.includes(value) ? now.filter((v) => v !== value) : [...now, value];
      }
      ans.setAttribute("aria-pressed", ans.getAttribute("aria-pressed") !== "true");
      send("answer", { slot: card.slot, value, source: "call_card" });
      return;
    }
    const vote = t.closest("[data-vote]");
    if (vote) return void send("vote", { eventId: Number(vote.dataset.vote) });
    if (t.closest("#lock")) return void send("lock", {});
    if (t.closest("#copy")) {
      const link = `${location.origin}/sk/${roomId}`;
      (navigator.clipboard ? navigator.clipboard.writeText(link) : Promise.reject()).then(() => toast("Link copied. Paste it in the group chat."), () => toast(link));
      return;
    }
    if (t.closest("#share")) return void navigator.share({ title: `${view.crew}: help plan our next night`, text: "Sidekick's helping us plan. Hop on or answer in 30 seconds:", url: `${location.origin}/sk/${roomId}` }).catch(() => {});
    if (t.closest("#ask")) return void send("ask", {});
    if (t.closest("#mic")) return void (micOn ? stopMic() : startMic());
    if (t.closest("#kb")) { typing = !typing; renderDock(); if (typing) document.getElementById("line").focus(); return; }
    if (t.closest("#aloud")) { aloud = !aloud; store.set("sk:aloud", aloud); renderDock(); if (!aloud) speechSynthesis.cancel(); return; }
    if (t.closest("#leave") || t.closest("#endCall")) {
      if (view.me.planner) {
        if (confirm("End the call for everyone? The transcript will be deleted.")) send("end", {});
      } else {
        stopMic();
        if (es) es.close();
        app.innerHTML = `<h1>You left the call</h1><p class="muted">You can rejoin with the same link while it's running.</p><button class="btn out" onclick="location.reload()">Rejoin</button>`;
        phase = null;
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

  // ---------- Voice: captions from this phone's mic ----------
  let rec = null;
  let micOn = false;
  let typing = false;
  let interim = "";
  let paused = false;
  function startMic() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      toast("Live captions need Chrome, Edge or Safari. You can type instead.");
      typing = true;
      renderDock();
      return;
    }
    rec = new SR();
    rec.lang = "en-CA";
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let partial = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) send("line", { text: r[0].transcript, kind: "spoken" });
        else partial += r[0].transcript;
      }
      interim = partial;
      if (phase === "call") renderCall();
    };
    rec.onend = () => { if (micOn && !paused) try { rec.start(); } catch {} };
    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        micOn = false;
        toast("The microphone is blocked. You can type instead.");
        typing = true;
        renderDock();
      }
    };
    try { rec.start(); micOn = true; } catch {}
    renderDock();
  }
  function stopMic() {
    micOn = false;
    interim = "";
    if (rec) try { rec.stop(); } catch {}
    if (phase === "call" || phase === "picks") renderDock();
  }

  // ---------- Reading Sidekick aloud: the planner's phone only, and only in a pause ----------
  let aloud = store.get("sk:aloud") !== false;
  let lastRead = null;
  function readAloud(tries = 0) {
    if (!view.me.planner || !aloud || !("speechSynthesis" in window)) return;
    const last = view.sidekick.slice(-1)[0];
    if (!last || last.system || last.id === lastRead) return;
    if (lastRead === null && Date.now() - last.at > 15000) { lastRead = last.id; return; } // don't replay old lines after a reload
    if (view.people.some((p) => p.talking) && tries < 6) return void setTimeout(() => readAloud(tries + 1), 1200);
    lastRead = last.id;
    const u = new SpeechSynthesisUtterance(last.text);
    u.lang = "en-CA";
    u.rate = view.voice.rate;
    u.pitch = view.voice.pitch;
    u.onstart = () => { if (micOn && rec) { paused = true; try { rec.stop(); } catch {} } }; // don't caption Sidekick's own voice
    u.onend = () => { if (paused) { paused = false; if (micOn) try { rec.start(); } catch {} } };
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  }

  // ---------- Start ----------
  if (!roomId) startScreen();
  else if (me && me.person) connect();
  else joinScreen();
})();
