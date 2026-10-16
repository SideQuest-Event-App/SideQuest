/* Sketch 2 — app shell: server calls, navigation, rendering, AI loading, and the desktop side panel. */
(function () {
  const SQ = window.SQ;
  const screenEl = document.getElementById("screen");
  const toastEl = document.getElementById("toast");

  // ---------- Per-viewer storage (may be unavailable; the app still works for this visit) ----------
  const store = {
    get(k) {
      try {
        return localStorage.getItem(k);
      } catch {
        return null;
      }
    },
    set(k, v) {
      try {
        if (v == null) localStorage.removeItem(k);
        else localStorage.setItem(k, v);
      } catch {}
    },
  };
  const ids = { user: store.get("sq2.user"), host: store.get("sq2.host") };
  SQ.userId = () => ids.user;
  SQ.hostId = () => ids.host;
  SQ.setIds = (next) => {
    for (const k of Object.keys(next)) {
      ids[k] = next[k] || null;
      store.set(`sq2.${k}`, ids[k]);
    }
  };

  // ---------- UI state (not saved on the server) ----------
  SQ.d = null; // server state, from /api/state
  SQ.report = null; // host report, from /api/host-report
  SQ.u = {
    screen: "landing",
    history: [],
    df: { tod: "Anytime", cats: [], price: "", dist: "", friends: false, after: "", amen: [] }, // Discover filters
    weekTab: "All",
    mix: null,
    mapSel: null,
    logTab: "Upcoming",
    demandArea: "All",
    quest: null,
    hostQuest: null,
    hostRequest: null,
    signup: { name: "", username: "", email: "", phone: "" },
    login: { email: "", code: "", error: null, resendAt: 0, demoCode: null },
    role: "attendee",
    vibeText: "",
    areaText: "",
    friendText: "",
    maps: {}, // each map's centre and zoom, so re-renders keep the view
    search: { q: "", ran: "", loading: false, result: null, error: null },
    reqDraft: null,
    rating: { stars: 0, tags: [] },
    partyMsg: "",
    eventMsg: "",
    editMembers: false,
    feedLoading: false,
    feedError: null,
    blendLoading: false,
    hostReg: { name: "", email: "", bio: "", social: "", biz: "", pastLinks: "", address: "", capacity: "", ticketLink: "", team: [{ email: "", role: "Editor" }] },
    hostDraft: null,
    drafting: false,
    msg: { eventId: null, text: "", audience: "attendees" },
    published: null,
    poster: null, // "Add from a poster": { for: "host" | "attendee", loading, error, result, pick }
    spotDraft: null, // the attendee's event form, filled from their poster
    shot: null, // the event being added from a screenshot
    flag: null, // { eventId, field, note }: the "Flag incorrect info" form
  };

  // A random id for this browser tab, so analytics can count visits (it isn't tied to who you are)
  const sessionId = (() => {
    try {
      let s = sessionStorage.getItem("sq2.session");
      if (!s) sessionStorage.setItem("sq2.session", (s = Math.random().toString(36).slice(2, 12)));
      return s;
    } catch {
      return null;
    }
  })();

  // ---------- Server ----------
  async function request(url, body) {
    let res;
    try {
      res = await fetch(url, body === undefined ? undefined : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, sessionId }) });
    } catch {
      throw new Error("Can't reach the server. Is `node server.js` running?");
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Something went wrong (${res.status}).`);
    return data;
  }
  SQ.post = (url, body) => request(url, body || {});
  // Events are thousands of listings: fetched on their own, and again only when the server's version moves
  let events = { version: null, list: [] };
  async function withEvents(state) {
    if (state.eventsVersion !== events.version) {
      const r = await request("/api/events");
      events = { version: r.version, list: r.events };
    }
    state.events = events.list;
    return state;
  }
  SQ.refresh = async () => {
    SQ.d = await withEvents(await request(`/api/state?user=${encodeURIComponent(ids.user || "")}&host=${encodeURIComponent(ids.host || "")}`));
    if (ids.user && !SQ.d.user) SQ.setIds({ user: null }); // the database was reset
    if (ids.host && !SQ.d.host) SQ.setIds({ host: null });
  };
  // Every change goes through here, and comes back with fresh state
  SQ.act = async (type, args) => {
    try {
      const r = await request("/api/act", { user: ids.user, host: ids.host, type, args });
      if (r.result.userId) SQ.setIds({ user: r.result.userId });
      if (r.result.hostId) SQ.setIds({ host: r.result.hostId });
      SQ.d = await withEvents(r.state);
      SQ.reportStale = true;
      return r.result;
    } catch (err) {
      toast(err.message);
      throw err;
    }
  };

  // ---------- AI: feed, Crew Blend, host report (loaded in the background) ----------
  async function loadFeed(force) {
    const u = SQ.d.user;
    if (!u || SQ.u.feedLoading) return;
    SQ.u.feedLoading = true;
    SQ.u.feedError = null;
    render();
    try {
      const feed = await SQ.post("/api/feed", { userId: ids.user, force });
      if (SQ.d.user && SQ.d.user.id === u.id) SQ.d.user.feed = feed;
    } catch (err) {
      SQ.u.feedError = err.message;
    }
    SQ.u.feedLoading = false;
    render();
  }
  SQ.loadBlend = async (force) => {
    const p = SQ.d.party;
    if (!p || SQ.u.blendLoading) return;
    SQ.u.blendLoading = true;
    render();
    try {
      SQ.d.party.blend = await SQ.post("/api/blend", { userId: ids.user, force });
    } catch (err) {
      toast(err.message);
      SQ.u.blendError = true;
    }
    SQ.u.blendLoading = false;
    render();
  };
  let reportLoading = false;
  async function loadReport() {
    if (reportLoading) return;
    reportLoading = true;
    SQ.reportStale = false;
    try {
      SQ.report = await request(`/api/host-report?host=${encodeURIComponent(ids.host || "")}`);
    } catch (err) {
      toast(err.message);
    }
    reportLoading = false;
    render();
  }
  // After each render: start whatever background work the current screen needs
  function ensure() {
    const scr = SQ.screens[SQ.u.screen];
    const u = SQ.d.user;
    if (scr.role === "host") {
      if (SQ.d.host && (SQ.reportStale || !SQ.report)) loadReport();
      return;
    }
    const wantsFeed = ["discover", "discover-map", "weekly", "mix", "filters", "profile", "ob-avatar", "quest", "search"].includes(SQ.u.screen);
    if (wantsFeed && u && u.vibes.length >= 2 && !SQ.u.feedError && (!u.feed || u.feed.key !== u.feedKey)) loadFeed();
    const p = SQ.d.party;
    if (SQ.u.screen === "party" && p && p.members.length && !SQ.u.blendError && (!p.blend || p.blend.key !== p.blendKey)) SQ.loadBlend();
  }

  // ---------- Navigation ----------
  const ROOTS = ["discover", "parties", "requests", "questlog", "profile", "host-dashboard", "host-quests", "host-demand", "host-audience", "host-messages"];
  const OPEN = ["landing", "role", "login", "login-code", "signup", "host-type", "host-login"]; // screens that work signed out
  // Where you actually land: signed-out users can't open app screens
  function guard(id) {
    const scr = SQ.screens[id];
    if (!scr) return "landing";
    if (OPEN.includes(id)) return id;
    if (scr.role === "host") return SQ.d.host ? id : "host-type";
    if (!SQ.d.user) return "landing";
    if (!SQ.d.user.registered && ROOTS.includes(id)) return "ob-vibes";
    return id;
  }
  // Analytics: which screens people reach, and from where (fire and forget)
  const QUEST_SCREENS = ["quest", "tickets", "rate", "eventday", "eventday-chat"];
  function trackScreen(screen, from) {
    const body = { user: ids.user, host: ids.host, sessionId, screen, from, eventId: QUEST_SCREENS.includes(screen) ? SQ.u.quest : null };
    fetch("/api/track", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), keepalive: true }).catch(() => {});
  }

  let direction = "";
  SQ.go = (id) => {
    const target = guard(id);
    if (SQ.u.screen !== target) trackScreen(target, SQ.u.screen);
    if (ROOTS.includes(target)) SQ.u.history = [];
    else if (SQ.u.screen !== target) SQ.u.history.push(SQ.u.screen);
    direction = SQ.u.screen === target ? "" : "enter";
    SQ.u.screen = target;
    if (target === "notifications" && SQ.d.user && SQ.d.user.notifications.some((n) => !n.read)) SQ.act("readNotifications").then(render, () => {});
    try {
      sessionStorage.setItem("sq2.screen", target);
    } catch {}
    render(true);
  };
  SQ.back = () => {
    const prev = SQ.u.history.pop();
    direction = "enter-back";
    const from = SQ.u.screen;
    SQ.u.screen = guard(prev || (SQ.screens[SQ.u.screen].role === "host" ? "host-dashboard" : "discover"));
    if (SQ.u.screen !== from) trackScreen(SQ.u.screen, from);
    render(true);
  };

  // ---------- Rendering ----------
  function render(resetScroll) {
    if (!SQ.d) return;
    const scr = SQ.screens[SQ.u.screen];
    const oldScroll = screenEl.querySelector(".scroll");
    const top = oldScroll ? oldScroll.scrollTop : 0;
    // Keep focus and cursor in the input being typed in, if a background update re-renders
    const active = document.activeElement;
    const bind = active && screenEl.contains(active) && active.dataset.bind;
    const sel = bind && "selectionStart" in active ? [active.selectionStart, active.selectionEnd] : null;

    if (!SQ.u.reqDraft) SQ.u.reqDraft = SQ.defaultReqDraft();
    if (!SQ.u.hostDraft) SQ.u.hostDraft = SQ.emptyHostDraft();
    screenEl.innerHTML = scr.render();
    const first = screenEl.firstElementChild;
    if (first && direction && resetScroll) first.classList.add(direction);
    direction = "";
    const scroll = screenEl.querySelector(".scroll");
    if (scroll && !resetScroll) scroll.scrollTop = top;
    if (bind) {
      const el = screenEl.querySelector(`[data-bind="${CSS.escape(bind)}"]`);
      if (el) {
        el.focus({ preventScroll: true });
        try {
          if (sel) el.setSelectionRange(sel[0], sel[1]);
        } catch {}
      }
    }
    if (resetScroll) screenEl.focus({ preventScroll: true });
    // Required fields left empty on submit stay red until filled in
    if (SQ.u.invalid && SQ.u.invalid.length) {
      SQ.u.invalid = SQ.missing(SQ.u.invalid);
      for (const p of SQ.u.invalid) screenEl.querySelectorAll(`[data-bind="${CSS.escape(p)}"], [data-req="${CSS.escape(p)}"]`).forEach((el) => el.classList.add("invalid"));
    }
    SQ.initMaps(screenEl);
    renderSide();
    ensure();
  }
  SQ.render = () => render(false);

  // "Resend code in 0:42": count down, then re-render so the resend button appears
  setInterval(() => {
    for (const el of screenEl.querySelectorAll("[data-until]")) {
      const left = Math.ceil((Number(el.dataset.until) - Date.now()) / 1000);
      if (left <= 0) return render(false);
      el.textContent = el.textContent.replace(/\d+:\d\d/, `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`);
    }
  }, 1000);

  // "Slide to explore": drag the handle to the end (or tap, or press Enter) to go on
  screenEl.addEventListener("pointerdown", (e) => {
    const slider = e.target.closest("[data-slide]");
    if (!slider) return;
    const handle = slider.querySelector(".handle");
    const max = slider.clientWidth - handle.offsetWidth - 12;
    const x0 = e.clientX;
    let dx = 0;
    slider.setPointerCapture(e.pointerId);
    const move = (ev) => {
      dx = Math.max(0, Math.min(max, ev.clientX - x0));
      handle.style.transform = `translateX(${dx}px)`;
    };
    const up = () => {
      slider.removeEventListener("pointermove", move);
      if (dx > max * 0.7 || dx < 4) SQ.go(slider.dataset.slide);
      else handle.style.transform = "";
    };
    slider.addEventListener("pointermove", move);
    slider.addEventListener("pointerup", up, { once: true });
  });
  screenEl.addEventListener("keydown", (e) => {
    const slider = e.target.closest && e.target.closest("[data-slide]");
    if (slider && (e.key === "Enter" || e.key === " ")) SQ.go(slider.dataset.slide);
  });

  let toastTimer;
  function toast(msg) {
    toastEl.innerHTML = `${SQ.icon("check", "md")}<span>${SQ.esc(msg)}</span>`;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), 3600);
  }
  SQ.toast = toast;


  // ---------- Events ----------
  let busy = false;
  async function run(el) {
    if (el.hasAttribute("data-back")) return SQ.back();
    const name = el.getAttribute("data-act");
    if (name) {
      const fn = SQ.actions[name];
      if (!fn) return console.warn("Unknown action:", name);
      if (busy) return;
      busy = true;
      let next;
      try {
        next = await fn(el.getAttribute("data-arg"), el);
      } catch (err) {
        console.error(err);
      }
      busy = false;
      const then = el.getAttribute("data-then");
      if (typeof next === "string" || then) SQ.go(typeof next === "string" ? next : then);
      else render(false);
      return;
    }
    const to = el.getAttribute("data-go");
    if (to) SQ.go(to);
  }
  screenEl.addEventListener("click", (e) => {
    const el = e.target.closest("[data-go],[data-act],[data-back]");
    if (!el || el.disabled || el.tagName === "FORM") return;
    e.preventDefault();
    run(el);
  });
  // File pickers: data-file="action" runs once a file is chosen (data-act would block the picker from opening)
  screenEl.addEventListener("change", async (e) => {
    const fn = e.target.type === "file" && SQ.actions[e.target.dataset.file];
    if (!fn) return;
    await fn(null, e.target);
    render(false);
  });
  // data-change="action": runs with the input's value once it's changed (on blur or Enter)
  screenEl.addEventListener("change", async (e) => {
    const fn = e.target.dataset && SQ.actions[e.target.dataset.change];
    if (!fn) return;
    await fn(e.target.value, e.target);
    render(false);
  });
  screenEl.addEventListener("submit", (e) => {
    e.preventDefault();
    run(e.target);
  });
  // File pickers (<input type="file" data-upload="action">) hand the chosen file to that action
  screenEl.addEventListener("change", async (e) => {
    const input = e.target;
    const name = input.dataset && input.dataset.upload;
    if (!name || !input.files || !input.files[0]) return;
    const fn = SQ.actions[name];
    if (!fn || busy) return;
    busy = true;
    let next;
    try {
      next = await fn(input.files[0]);
    } catch (err) {
      console.error(err);
    }
    busy = false;
    if (typeof next === "string") SQ.go(next);
    else render(false);
  });
  // A photo or screenshot, shrunk to at most 1600px on its long side and sent as JPEG (phone photos are huge)
  SQ.readImage = (file) => new Promise((resolve, reject) => {
    if (!/^image\//.test(file.type)) return reject(new Error("Pick a photo or screenshot."));
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.88));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That image couldn't be opened. Try a JPEG or PNG screenshot."));
    };
    img.src = url;
  });

  // Inputs write straight into UI state (data-bind="search.q", "hostReg.team.0.email", …)
  screenEl.addEventListener("input", (e) => {
    const path = e.target.dataset && e.target.dataset.bind;
    if (!path) return;
    const keys = path.split(".");
    let obj = SQ.u;
    for (const k of keys.slice(0, -1)) obj = obj[k];
    obj[keys[keys.length - 1]] = e.target.value;
    if (e.target.value.trim()) e.target.classList.remove("invalid");
    if (e.target.hasAttribute("data-live")) render(false);
    // Typing the listing's link fills in "Found on", unless they wrote their own
    if (path === "shot.draft.sourceUrl") {
      const d = SQ.u.shot.draft;
      let site = "";
      try {
        site = /^https?:\/\/[^/]+\.[^/]+/.test(d.sourceUrl) ? SQ.siteName(d.sourceUrl) : "";
      } catch {}
      if (!d.source || d.source === d.autoSource) {
        d.source = d.autoSource = site;
        const el = screenEl.querySelector('[data-bind="shot.draft.source"]');
        if (el) el.value = site;
      }
    }
  });

  // ---------- Desktop side panel ----------
  const pill = document.getElementById("ai-pill");
  const jump = document.getElementById("side-jump");
  function renderSide() {
    const mode = SQ.d.mode;
    pill.classList.toggle("off", mode === "keywords");
    pill.lastElementChild.textContent = mode === "api" ? `AI: Claude API (${SQ.d.model})` : mode === "claude-code" ? "AI: Claude Code" : "No AI: keyword matching";
    const role = SQ.screens[SQ.u.screen].role;
    document.querySelectorAll("#side-role button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.role === role)));
    const groups = { attendee: "Attendee app", host: "Host app" };
    jump.innerHTML = Object.entries(groups).map(([r, label]) => `<optgroup label="${label}">${Object.entries(SQ.screens).filter(([, s]) => s.role === r).map(([id, s]) => `<option value="${id}"${id === SQ.u.screen ? " selected" : ""}>${SQ.esc(s.label || id)}</option>`).join("")}</optgroup>`).join("");
    // Without an email service, the login code is shown here so the sketch can be tried (see README)
    const code = document.getElementById("side-code");
    const demo = SQ.u.login && SQ.u.login.demoCode;
    code.hidden = !demo;
    if (demo) code.innerHTML = `No email service is set up, so here's the code that would have been emailed to ${SQ.esc(SQ.u.login.email)}:<b>${SQ.esc(demo)}</b>`;
  }
  document.getElementById("side-role").addEventListener("click", (e) => {
    const b = e.target.closest("[data-role]");
    if (!b) return;
    if (b.dataset.role === "host") SQ.go(SQ.d.host ? "host-dashboard" : "host-type");
    else SQ.go(SQ.d.user ? (SQ.d.user.registered ? "discover" : "ob-vibes") : "landing");
  });
  jump.addEventListener("change", () => {
    const id = jump.value;
    const real = guard(id);
    if (real !== id) toast(SQ.screens[id].role === "host" ? "Register or sign in as a host first." : "Sign up first.");
    SQ.go(id);
  });
  document.getElementById("side-brand").innerHTML = SQ.logo();
  document.getElementById("side-reset").addEventListener("click", async () => {
    if (!confirm("Reset everything? This deletes all accounts, requests, ratings and logs, and restores the sample data.")) return;
    await SQ.act("reset");
    SQ.setIds({ user: null, host: null });
    Object.assign(SQ.u, { history: [], feedError: null, blendError: null, published: null });
    SQ.report = null;
    await SQ.refresh();
    SQ.go("landing");
    toast("Reset. Everything is back to the sample data.");
  });

  // ---------- Start ----------
  (async function start() {
    try {
      await SQ.refresh();
    } catch (err) {
      screenEl.innerHTML = `<div class="screen"><main class="scroll"><div class="pad stack" style="padding-top:80px">${SQ.empty("x", err.message)}</div></main></div>`;
      return;
    }
    let last = null;
    try {
      last = sessionStorage.getItem("sq2.screen");
    } catch {}
    const u = SQ.d.user;
    const fallback = u ? (u.registered ? "discover" : "ob-vibes") : "landing";
    SQ.u.screen = guard(last && SQ.screens[last] && !["quest", "tickets", "rate", "eventday", "eventday-chat", "search", "host-request", "host-checkin", "host-recap", "host-published", "host-create-dayinfo", "spot", "add-event"].includes(last) ? last : fallback);
    trackScreen(SQ.u.screen, null);
    render(true);
  })();
})();
