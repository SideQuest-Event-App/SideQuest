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
  const draft = { 1: {}, 2: {}, final: { why: "" } };

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

  // ---------- Consent and a short intro ----------
  function introScreen(joining) {
    app.innerHTML = `
      <div class="row sb"><span class="tag pri">Sidekick study</span><span class="orb" aria-hidden="true"></span></div>
      <div class="lead-in">
        <h1>${joining ? "Join your crew's study" : "Help us test Sidekick"}</h1>
        <p class="muted">About 15 minutes on your phone. You'll look around the app, plan two nights out with Sidekick, an AI that joins your planning call, and answer a few quick taps of questions.</p>
        <p class="muted">You'll hear two Sidekick voices, called Voice 1 and Voice 2.</p>
      </div>
      <div class="facts">
        <section class="fact"><h2>What we record</h2><ul>
          <li>Which steps you finish</li>
          <li>How long planning takes and how many questions Sidekick asks</li>
          <li>Whether your crew locks a plan</li>
          <li>Your taps on our short questions</li></ul></section>
        <section class="fact"><h2>What we don't</h2><ul>
          <li>Your name, your voice or anything anyone says. Captions are deleted when each call ends.</li>
          <li>Your budget and places you'd avoid. They're never shown with your name and never in our results.</li></ul></section>
      </div>
      <label class="agree"><input type="checkbox" id="agree"><span>I agree to take part. I can stop at any time.</span></label>
      <button class="btn pri" id="start" disabled>${joining ? "Join the study" : "Start the study"}</button>
      ${joining ? "" : '<p class="small">Testing with friends? One person starts, then shares the study link from the checklist.</p>'}`;
    const agree = document.getElementById("agree");
    const start = document.getElementById("start");
    agree.onchange = () => { start.disabled = !agree.checked; };
    start.onclick = async () => {
      start.disabled = true;
      try {
        const out = joining ? await api(`/api/sk/study/${encodeURIComponent(sid)}/join`, { consent: true }) : await api("/api/sk/study/sessions", { consent: true });
        sid = out.sid;
        tid = out.tid;
        store.set(`study:${sid}:tid`, tid);
        store.set("study:last", sid);
        history.replaceState(null, "", `/study?s=${encodeURIComponent(sid)}`);
        view = out.view;
        open = null;
        acct = null;
        render();
      } catch (err) {
        start.disabled = false;
        toast(err.message);
      }
    };
  }

  // ---------- Your account (after consent) ----------
  // A quick app account, or sign in, so the events testers add and the plans they make are their own and stay.
  // Skipping uses the shared demo account. The study keeps only which kind it was and the account's internal id.
  // The app reads the signed-in account from localStorage "sq2.user" (the same origin), so the checklist's
  // links open the app as this account.
  const appUser = {
    get() { try { const v = localStorage.getItem("sq2.user"); return v && /^[\w-]{4,40}$/.test(v) ? v : null; } catch { return null; } },
    set(v) { try { localStorage.setItem("sq2.user", v); sessionStorage.removeItem("sq2.demo"); } catch {} },
  };
  const VIBES = [["Live music", ["Live music", "Jazz", "Indie gigs"]], ["Food & drink", ["Food & drink"]], ["Art", ["Art & making", "Photography"]], ["Comedy", ["Comedy"]], ["Dance nights", ["Dance", "Electronic"]], ["Markets", ["Markets", "Records & vinyl"]], ["Film", ["Film nights"]], ["Games", ["Games & social"]], ["Outdoors", ["Outdoors"]]];
  // acct: what the account step shows. { how: "create" | "signin" | "code", mine: { id, name } | null, ... }
  let acct = null;
  const act = async (type, args, user = null) => (await api("/api/act", { user, type, args })).result;
  async function stateOf(id) {
    try { return (await api(`/api/state?user=${encodeURIComponent(id)}&host=`)).user || null; } catch { return null; }
  }
  async function accountScreen() {
    if (!acct) {
      acct = { how: "create", mine: null, name: "", email: "", vibes: [], code: "", demoCode: null, error: null, busy: false };
      const id = appUser.get();
      const u = id && (await stateOf(id));
      if (u && !u.demo) acct.mine = { id, name: u.name || "your account" };
    }
    const a = acct;
    const err = a.error ? `<p class="field-err" role="alert">${esc(a.error)}</p>` : "";
    let body;
    if (a.how === "signin") {
      body = `<h1>Sign in</h1>
        <p class="muted">Enter the email on your Sidequest account. We'll send you a 6-digit code.</p>
        <form class="stack" id="acctSignin">
          <label class="f">Email<input class="in" id="a-email" type="email" inputmode="email" autocomplete="email" value="${esc(a.email)}" required></label>
          ${err}<button class="btn pri" type="submit" ${a.busy ? "disabled" : ""}>Send code</button></form>
        <button class="linkish" type="button" data-acct="create">New here? Create an account</button>`;
    } else if (a.how === "code") {
      body = `<h1>Check your email</h1>
        <p class="muted">We sent a 6-digit code to ${esc(a.email)}.</p>
        ${a.demoCode ? `<p class="note">No email service is set up here, so here's your code: <b>${esc(a.demoCode)}</b></p>` : ""}
        <form class="stack" id="acctCode">
          <label class="f">6-digit code<input class="in" id="a-code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" value="${esc(a.code)}" required></label>
          ${err}<button class="btn pri" type="submit" ${a.busy ? "disabled" : ""}>Sign in</button></form>
        <button class="linkish" type="button" data-acct="signin">Use a different email</button>`;
    } else {
      body = `<h1>Create your account (1 min)</h1>
        <p class="muted">So the events you add and the plans you make are yours, and they stay after the study.</p>
        ${a.mine ? `<button class="btn pri" type="button" id="useMine">Continue as ${esc(a.mine.name)}</button><p class="small">Or make a new account:</p>` : ""}
        <form class="stack" id="acctCreate">
          <label class="f">First name<input class="in" id="a-name" maxlength="30" autocomplete="given-name" value="${esc(a.name)}" required></label>
          <label class="f">Email<input class="in" id="a-email" type="email" inputmode="email" autocomplete="email" value="${esc(a.email)}" required><span class="hint">Your sign-in codes go here.</span></label>
          <div class="likert" role="group" aria-label="Pick two or more things you're into"><p>Pick two or more things you're into</p>
            <div class="chips">${VIBES.map(([label]) => `<button type="button" class="chip" data-vibe="${esc(label)}" aria-pressed="${a.vibes.includes(label)}">${esc(label)}</button>`).join("")}</div></div>
          ${err}<button class="btn ${a.mine ? "out" : "pri"}" type="submit" ${a.busy ? "disabled" : ""}>Create account</button></form>
        <button class="linkish" type="button" data-acct="signin">Already have an account? Sign in</button>`;
    }
    app.innerHTML = `
      <div class="row sb"><span class="tag pri">Sidekick study</span><span class="small">Step 2 · your account</span></div>
      <div class="lead-in acct">${body}</div>
      <p class="fine">Your study answers stay anonymous. They're linked to your account only by a random id, never your name or email.</p>
      <div class="skip">
        <button class="btn out" type="button" id="skipAccount">Skip and use the demo account</button>
        <p class="small">The demo account is shared: anything you make there is visible to everyone using it, and is reset.</p>
      </div>`;
  }
  async function useAccount(kind, user) {
    view = await post("account", { kind, user });
    acct = null;
    open = null;
    render();
  }
  async function accountSubmit(form) {
    const a = acct;
    const val = (id) => (document.getElementById(id) ? document.getElementById(id).value.trim() : "");
    a.error = null;
    a.busy = true;
    try {
      if (form.id === "acctCreate") {
        Object.assign(a, { name: val("a-name"), email: val("a-email") });
        if (!a.name) throw new Error("Add your first name.");
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a.email)) throw new Error("Check the email. It should look like name@example.com.");
        if (a.vibes.length < 2) throw new Error("Pick two or more things you're into.");
        const r = await act("signup", { name: a.name, email: a.email, username: "" });
        const vibes = [...new Set(a.vibes.flatMap((l) => (VIBES.find((v) => v[0] === l) || [l, [l]])[1]))];
        await act("setProfile", { vibes, registered: true }, r.userId);
        appUser.set(r.userId);
        await useAccount("own", r.userId);
        toast("Account made. You're signed in to the app as you.");
        return;
      }
      if (form.id === "acctSignin") {
        a.email = val("a-email");
        const r = await act("requestCode", { email: a.email });
        Object.assign(a, { how: "code", code: "", demoCode: r.demoCode || null });
      } else if (form.id === "acctCode") {
        a.code = val("a-code");
        const r = await act("verifyCode", { email: a.email, code: a.code });
        if (!r.userId) throw new Error("That email is on a host account. Create an attendee account instead.");
        const u = await stateOf(r.userId);
        if (u && u.demo) throw new Error("That's the shared demo account. Tap Skip below to use it.");
        if (u && !u.registered) await act("setProfile", { registered: true }, r.userId);
        appUser.set(r.userId);
        await useAccount("own", r.userId);
        toast("Signed in. The app opens as you.");
        return;
      }
    } catch (err) {
      a.error = err.message;
    }
    a.busy = false;
    accountScreen();
  }

  // ---------- The checklist ----------
  const TITLES = {
    consent: "Agree and get started",
    discover: "Look around Discover",
    plan: "Open Plan",
    share: "Share the call link",
    call1: "Call with Voice 1",
    form: "Try “Just answer, no call”",
    call2: "Short call with Voice 2",
    survey: "Compare the two voices",
  };
  const callLink = (n, room) => `/sk/${encodeURIComponent(room)}?study=${encodeURIComponent(sid)}&v=${n}`;
  const planLink = () => `/sk?study=${encodeURIComponent(sid)}`;
  // Into the app: as the tester's own account, or the shared demo if they skipped
  const appLink = () => (view.you.account === "own" ? `/?study=${encodeURIComponent(sid)}` : `/?demo=1&study=${encodeURIComponent(sid)}`);

  function sub(step) {
    const v = view;
    if (v.you.steps[step]) return "Done";
    if (step === "call1" || step === "call2") {
      const c = v.calls[step === "call1" ? 1 : 2];
      if (c.status === "live") return "On a call now";
      if (c.status !== "none") return "4 quick questions left";
    }
    if (step === "form" && !done1()) return "After the Voice 1 call";
    if (step === "call2" && !done1()) return "After the Voice 1 call";
    if (step === "survey" && !(v.you.surveys[1] && v.you.surveys[2])) return "After both calls";
    return "To do";
  }
  const done1 = () => view.calls[1].status !== "none" && view.calls[1].status !== "live";
  const firstOpen = () => view.steps.find((s) => !view.you.steps[s]) || "survey";

  function likert(n) {
    const items = [["natural", "Sidekick felt natural to talk with."], ["decide", "It helped us decide."], ["trust", "I trust the picks it suggested."], ["again", "I'd use it again to plan a night."]];
    const d = draft[n];
    return `<form class="stack" data-survey="${n}"><p class="small">Voice ${n} · 1 = disagree, 5 = agree</p>${items.map(([k, label]) => `
      <div class="likert" role="group" aria-label="${esc(label)}"><p>${esc(label)}</p>
        <div class="rate">${[1, 2, 3, 4, 5].map((x) => `<button type="button" data-q="${k}" data-n="${x}" aria-pressed="${d[k] === x}" aria-label="${x}">${x}</button>`).join("")}</div>
        <div class="ends" aria-hidden="true"><span>Disagree</span><span>Agree</span></div></div>`).join("")}
      <button class="btn pri" type="submit" ${items.every(([k]) => d[k]) ? "" : "disabled"}>Send</button></form>`;
  }
  function finalSurvey() {
    const d = draft.final;
    return `<form class="stack" data-final>
      <div class="likert" role="group" aria-label="Which voice would you keep?"><p>Which voice would you keep?</p>
        <div class="keep">${[1, 2].map((x) => `<button type="button" data-keep="${x}" aria-pressed="${d.keep === x}">Voice ${x}</button>`).join("")}</div></div>
      <label class="f">Why? (optional)<textarea class="in" id="why" maxlength="300" rows="3" placeholder="It sounded…">${esc(d.why)}</textarea></label>
      <div class="likert" role="group" aria-label="Overall, how easy or hard was planning with Sidekick?"><p>Overall, how easy or hard was planning with Sidekick?</p>
        <div class="rate seven">${[1, 2, 3, 4, 5, 6, 7].map((x) => `<button type="button" data-seq="${x}" aria-pressed="${d.seq === x}" aria-label="${x}">${x}</button>`).join("")}</div>
        <div class="ends" aria-hidden="true"><span>Very hard</span><span>Very easy</span></div></div>
      <button class="btn pri" type="submit" ${d.keep && d.seq ? "" : "disabled"}>Send</button></form>`;
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

  function panel(step) {
    const v = view;
    switch (step) {
      case "consent":
        return `<p class="muted">You agreed to take part. We record the steps you finish, timings, whether a plan gets locked, and your answers to our questions. Never names, voices, captions or your private answers.</p>`;
      case "discover":
        return `<p class="muted">Open the app (${view.you.account === "own" ? "you're signed in as you, so what you add stays yours" : "you're in the shared demo account"}). Then try:</p>
          <ul><li>the map's pins and cards</li><li>pulling the sheet up for the list</li><li>a search, with a filter</li><li>opening one sidequest</li></ul>
          <p class="small">The bar at the top of the app brings you back here.</p>
          <div class="btns"><a class="btn out" href="${esc(appLink())}">Open Discover</a>${mark("discover")}</div>`;
      case "plan":
        return `<p class="muted">Plan is where Sidekick lives. Open it, add your name and a crew name, pick a night or two, and tap <b>Start the call</b>.</p>
          <div class="btns">${v.calls[1].status === "none" ? (v.you.creator ? `<a class="btn pri" href="${planLink()}">Open Plan</a>` : '<p class="note">Whoever started the study opens Plan and starts the call.</p>') : v.calls[1].status === "live" ? `<a class="btn pri" href="${callLink(1, v.calls[1].room)}">${v.calls[1].mine ? "Back to" : "Join"} the call</a>` : ""}${mark("plan")}</div>`;
      case "share":
        return `<p class="muted">On the call screen, the invite card has Copy, Share and app buttons (WhatsApp, Messages and more). Send the link to a friend, or to yourself to see the preview card.</p>
          <div class="btns">${v.calls[1].status === "live" && v.calls[1].mine ? `<a class="btn out" href="${callLink(1, v.calls[1].room)}">Back to the call</a>` : ""}${mark("share")}</div>`;
      case "call1":
        return callPanel(1);
      case "form":
        return `<p class="muted">Friends who can't talk can still answer by form. Tap below, choose <b>Answer without calling</b>, fill it in and send. Practice friends run the rest of that call.</p>
          ${done1() ? '<div class="btns"><button class="btn pri" id="tryForm">Try the form</button>' + mark("form") + "</div>" : '<p class="note">Do the Voice 1 call first, so the first voice you hear is your crew\'s.</p>'}`;
      case "call2":
        return callPanel(2);
      case "survey":
        if (v.you.final) return `<p class="muted">All done. Thank you for testing Sidekick!</p>`;
        if (!(v.you.surveys[1] && v.you.surveys[2])) return `<p class="note">Do both calls and their quick questions first.</p>`;
        return finalSurvey();
    }
    return "";
  }
  const mark = (step) => (view.you.steps[step] ? `<button class="btn out" data-undo="${step}">Mark as not done</button>` : `<button class="btn out" data-mark="${step}">Mark done</button>`);

  function render() {
    if (!view) return;
    if (!view.you.account) return accountScreen(); // right after consent: the account step
    const doneN = view.steps.filter((s) => view.you.steps[s]).length;
    const next = firstOpen();
    if (!open) open = location.hash.replace("#", "") in TITLES ? location.hash.replace("#", "") : next;
    const share = `${location.origin}/study?s=${encodeURIComponent(sid)}`;
    app.innerHTML = `
      <div class="row sb"><span class="tag pri">Sidekick study</span><span class="small">${doneN} of ${view.steps.length} done</span></div>
      <div class="prog"><h1>${view.you.final ? "Thank you!" : "Your checklist"}</h1>
        <span class="meter" role="progressbar" aria-label="Study progress" aria-valuemin="0" aria-valuemax="${view.steps.length}" aria-valuenow="${doneN}"><i style="width:${Math.round((doneN / view.steps.length) * 100)}%"></i></span>
        <p class="small">${view.you.final ? "Every step is done. You can close this page." : "Go in order, or tap any step to jump to it."}</p></div>
      <ol class="steps">${view.steps.map((s, i) => {
        const isDone = view.you.steps[s];
        const isOpen = open === s;
        return `<li class="step ${isDone ? "done" : ""} ${s === next && !isDone ? "now" : ""}" id="step-${s}">
          <button class="step-h" data-step="${s}" aria-expanded="${isOpen}" aria-controls="panel-${s}">
            <span class="num">${isDone ? ICON.check : i + 1}</span>
            <span class="step-t"><b>${esc(TITLES[s])}</b><span class="small">${esc(sub(s))}</span></span>${ICON.chev}</button>
          ${isOpen ? `<div class="panel" id="panel-${s}">${panel(s)}</div>` : ""}</li>`;
      }).join("")}</ol>
      <div class="foot">
        <p class="small">Testing with friends? Send them this link so they can follow along and answer too.</p>
        <div class="row"><input class="in" readonly value="${esc(share)}" aria-label="Study link" style="font-size:13px"><button class="btn sm out" id="copyStudy">Copy</button></div>
        <button class="linkish" id="restart" type="button">Start over as a new crew</button>
      </div>`;
  }

  // ---------- Taps ----------
  app.addEventListener("click", async (e) => {
    const t = e.target;
    if (acct) {
      const v = t.closest("[data-vibe]");
      if (v) { const l = v.dataset.vibe; acct.vibes = acct.vibes.includes(l) ? acct.vibes.filter((x) => x !== l) : [...acct.vibes, l]; v.setAttribute("aria-pressed", String(acct.vibes.includes(l))); return; }
      const to = t.closest("[data-acct]");
      if (to) { const keep = document.getElementById("a-email"); if (keep) acct.email = keep.value.trim(); acct.how = to.dataset.acct; acct.error = null; accountScreen(); return; }
      if (t.closest("#useMine") || t.closest("#skipAccount")) {
        const b = t.closest("button");
        b.disabled = true;
        try {
          if (b.id === "useMine") await useAccount("own", acct.mine.id);
          else await useAccount("demo");
        } catch (err) { b.disabled = false; toast(err.message); }
        return;
      }
    }
    const head = t.closest("[data-step]");
    if (head) {
      open = open === head.dataset.step ? "" : head.dataset.step;
      history.replaceState(null, "", `/study?s=${encodeURIComponent(sid)}${open ? `#${open}` : ""}`);
      render();
      const el = document.getElementById(`step-${head.dataset.step}`);
      if (el && open) el.scrollIntoView({ block: "nearest" });
      return;
    }
    const m = t.closest("[data-mark],[data-undo]");
    if (m) {
      try {
        view = await post("step", { step: m.dataset.mark || m.dataset.undo, done: Boolean(m.dataset.mark) });
        if (m.dataset.mark) open = firstOpen();
        render();
      } catch (err) { toast(err.message); }
      return;
    }
    const rate = t.closest(".rate button");
    if (rate) {
      const form = rate.closest("form");
      if (form.dataset.survey) draft[form.dataset.survey][rate.dataset.q] = Number(rate.dataset.n);
      else draft.final.seq = Number(rate.dataset.seq);
      render();
      return;
    }
    const keep = t.closest("[data-keep]");
    if (keep) { draft.final.keep = Number(keep.dataset.keep); render(); return; }
    if (t.closest("#tryForm")) {
      t.disabled = true;
      try {
        const out = await post("form");
        location.href = `/sk/${encodeURIComponent(out.room)}?study=${encodeURIComponent(sid)}&v=form`;
      } catch (err) { t.disabled = false; toast(err.message); }
      return;
    }
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
      acct = null;
      history.replaceState(null, "", "/study");
      introScreen(false);
    }
  });
  app.addEventListener("input", (e) => { if (e.target.id === "why") draft.final.why = e.target.value; });
  app.addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.target;
    if (/^acct/.test(form.id)) return accountSubmit(form);
    const btn = form.querySelector("[type=submit]");
    btn.disabled = true;
    try {
      if (form.dataset.survey) view = await post("survey", { n: Number(form.dataset.survey), ...draft[form.dataset.survey] });
      else view = await post("final", { keep: draft.final.keep, seq: draft.final.seq, why: draft.final.why });
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
        const typing = document.activeElement && document.activeElement.id === "why";
        const onAccount = acct && !next.you.account; // the account step keeps what's typed
        view = next;
        if (!typing && !onAccount) render();
      }
    } catch (err) {
      if (err.status === 403) { store.set(`study:${sid}:tid`, null); tid = null; acct = null; introScreen(true); }
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
  if (!sid) introScreen(false);
  else if (!tid) introScreen(true);
  else refresh().then(() => { if (!view && tid) introScreen(false); });
})();
