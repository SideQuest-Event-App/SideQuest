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
  // Discover filters. date: "" (any day) | "Today" | "Tomorrow" | "Weekend" | "Custom" (from/to, YYYY-MM-DD);
  // tod: "Anytime" | "Daytime" | "Evening" | "Custom" (todFrom/todTo, HH:MM)
  SQ.emptyDf = () => ({ cats: [], date: "", from: "", to: "", tod: "Anytime", todFrom: "", todTo: "", price: "", dist: "", friends: false, amen: [] });
  SQ.d = null; // server state, from /api/state
  SQ.report = null; // host report, from /api/host-report
  SQ.u = {
    screen: "landing",
    history: [],
    df: SQ.emptyDf(),
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
    friendsPage: { q: "", found: null, searched: "" },
    maps: {}, // each map's centre and zoom, so re-renders keep the view
    search: { q: "", ran: "", loading: false, result: null, error: null, matches: [], shown: 5, more: false, loadingMore: false, sig: "" },
    reqDraft: null,
    rating: { stars: 0, tags: [] },
    partyMsg: "",
    eventMsg: "",
    editMembers: false,
    feedLoading: false,
    feedError: null,
    blendLoading: false,
    hostReg: { name: "", email: "", website: "", role: "", social: "", ticketLink: "", docKind: "Business registration", docFile: "", invite: "", inviteRole: "Door staff", team: [], claim: null },
    hostDraft: null,
    drafting: false,
    msg: { eventId: null, text: "", audience: "attendees", when: "now", sendAt: "" },
    published: null,
    poster: null, // "Add from a poster": { for: "host" | "attendee", loading, error, result, pick }
    spotDraft: null, // the attendee's event form, filled from their poster
    shot: null, // the event being added from a screenshot
    flag: null, // { eventId, field, note }: the "Flag incorrect info" form
  };

  // The last search's results, kept for this tab so a reload doesn't lose them (only for the account that ran it)
  SQ.saveSearch = () => {
    const { q, ran, result, matches, shown, more, sig, kind } = SQ.u.search;
    try {
      // Places aren't kept (Google's terms: in memory only), so a restored search shows its events until searched again
      sessionStorage.setItem("sq2.search", JSON.stringify({ user: ids.user, q, ran, result, matches, shown, more, sig, kind }));
    } catch {}
  };
  function restoreSearch() {
    try {
      const { user, ...saved } = JSON.parse(sessionStorage.getItem("sq2.search") || "null") || {};
      if (user && user === ids.user && saved.result) Object.assign(SQ.u.search, saved, { places: SQ.u.search.places || [] });
    } catch {}
  }

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
  // "In the demo, in this tab": set when this tab signs into the demo account, cleared by signing out or switching.
  // The demo account lives in the server's memory (on Render, a restart or a sleep forgets it), so while this is
  // set a missing account is signed in again quietly instead of dropping the person on the start page.
  SQ.demoSession = (on) => {
    try {
      if (on === undefined) return sessionStorage.getItem("sq2.demo") === "1";
      if (on) sessionStorage.setItem("sq2.demo", "1");
      else sessionStorage.removeItem("sq2.demo");
    } catch {}
    return !!on;
  };
  // Signed in with a real account (not the shared demo): the question is skipped, and nothing signs it into the demo
  SQ.realUser = () => !!(SQ.d && SQ.d.user && !SQ.d.user.demo);
  async function relogin() {
    const r = await request("/api/act", { user: null, host: ids.host, type: "demoLogin" });
    SQ.setIds({ user: r.result.userId });
    SQ.d = await withEvents(r.state);
  }
  SQ.refresh = async () => {
    const state = await request(`/api/state?user=${encodeURIComponent(ids.user || "")}&host=${encodeURIComponent(ids.host || "")}`);
    if (window.SQboot) window.SQboot.counts({ events: state.eventsCount }); // the loader's "1,240 events", while the listings download
    SQ.d = await withEvents(state);
    if (ids.user && !SQ.d.user) {
      SQ.setIds({ user: null }); // the database was reset, or the server restarted
      if (SQ.demoSession()) await relogin().catch(() => {});
    }
    if (SQ.realUser()) SQ.demoSession(false); // a real account is never swapped for the demo
    if (ids.host && !SQ.d.host) SQ.setIds({ host: null });
  };
  // Every change goes through here, and comes back with fresh state
  SQ.acts = 0; // how many changes have gone through (a waiting button shows "done" only if one did)
  SQ.act = async (type, args, retried) => {
    try {
      const r = await request("/api/act", { user: ids.user, host: ids.host, type, args });
      if (r.result.userId) SQ.setIds({ user: r.result.userId });
      if (r.result.hostId) SQ.setIds({ host: r.result.hostId });
      if (type === "demoLogin") SQ.demoSession(true);
      SQ.d = await withEvents(r.state);
      if (SQ.realUser()) SQ.demoSession(false);
      SQ.reportStale = true;
      SQ.acts++;
      return r.result;
    } catch (err) {
      // The server forgot the demo account mid-visit (a restart): sign in again quietly and try once more
      if (!retried && type !== "demoLogin" && SQ.demoSession() && /^Sign up first/.test(err.message)) {
        try {
          await relogin();
          return await SQ.act(type, args, true);
        } catch {}
      }
      toast(err.message);
      throw err;
    }
  };

  // ---------- AI: feed, Crew Blend, host report (loaded in the background) ----------
  async function loadFeed(force) {
    const u = SQ.d.user;
    if (!u || SQ.u.feedLoading) return;
    SQ.u.feedLoading = true;
    SQ.u.feedSince = Date.now();
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
    SQ.u.blendSince = Date.now();
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
  const ROOTS = ["discover", "squads", "questlog", "profile", "host-demand", "host-quests", "host-insights", "host-messages"];
  const OPEN = ["mode", "landing", "role", "login", "login-code", "signup", "host-type", "host-login"]; // screens that work signed out
  // Where you actually land: signed-out users can't open app screens
  function guard(id) {
    if (id === "discover-map") id = "discover"; // the old map view is Discover now
    if (id === "parties") id = "squads"; // Community is Squads now
    const scr = SQ.screens[id];
    if (!scr) return "landing";
    if (id === "friend" && !SQ.u.friendProfile) return "friends"; // a reload forgets whose profile it was
    if (OPEN.includes(id)) return id;
    if (scr.role === "host") return SQ.d.host ? id : "host-type";
    if (!SQ.d.user) return "landing";
    if (!SQ.d.user.registered && (ROOTS.includes(id) || id === "requests")) return "ob-vibes";
    if (SQ.d.user.demo && (ROOTS.includes(id) || id === "requests") && !["discover", "squads", "questlog", "profile"].includes(id)) return "discover"; // the demo account gets the same tabs: Discover, Squads, Sidequests and Profile
    return id;
  }
  // Analytics: which screens people reach, and from where (fire and forget)
  const QUEST_SCREENS = ["quest", "tickets", "rate", "eventday", "eventday-chat"];
  function trackScreen(screen, from) {
    const body = { user: ids.user, host: ids.host, sessionId, screen, from, eventId: QUEST_SCREENS.includes(screen) ? SQ.u.quest : null };
    fetch("/api/track", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), keepalive: true }).catch(() => {});
  }

  // How the next render moves: "fade" between tabs, "push" into a screen, "back" out of one (motion.js)
  let navKind = null;
  let quietAt = 0;
  SQ.go = (id) => {
    const target = guard(id);
    if (SQ.u.screen !== target) trackScreen(target, SQ.u.screen);
    if (ROOTS.includes(target)) SQ.u.history = [];
    // Search results sit on top of Discover: back always leads there, and the Discover tab returns to them
    else if (target === "search") {
      SQ.u.history = ["discover"];
      SQ.u.searchOpen = true;
    }
    else if (SQ.u.screen !== target) SQ.u.history.push(SQ.u.screen);
    navKind = SQ.u.screen === target ? null : ROOTS.includes(target) ? "fade" : "push";
    SQ.u.screen = target;
    // Tabs show what's cached at once and refresh it quietly (at most every 30 s)
    if (navKind === "fade" && ["squads", "questlog"].includes(target) && Date.now() - quietAt > 30000) {
      quietAt = Date.now();
      SQ.refresh().then(() => {
        const a = document.activeElement;
        if (SQ.u.screen === target && !(a && screenEl.contains(a) && a.dataset.bind)) render(false);
      }, () => {});
    }
    if (target === "notifications" && SQ.d.user && SQ.d.user.notifications.some((n) => !n.read)) SQ.act("readNotifications").then(render, () => {});
    try {
      sessionStorage.setItem("sq2.screen", target);
      sessionStorage.setItem("sq2.searchOpen", SQ.u.searchOpen ? "1" : "");
    } catch {}
    render(true);
  };
  SQ.back = () => {
    const prev = SQ.u.history.pop();
    navKind = "back";
    const from = SQ.u.screen;
    if (from === "search") SQ.u.searchOpen = false; // leaving the results with back closes the search
    SQ.u.screen = guard(prev || (SQ.screens[SQ.u.screen].role === "host" ? "host-demand" : "discover"));
    if (SQ.u.screen !== from) trackScreen(SQ.u.screen, from);
    else navKind = null;
    render(true);
  };
  // Straight onto a screen with no movement and a fresh history (the opening hands over to the map this way)
  SQ.enter = (id) => {
    const target = guard(id);
    trackScreen(target, SQ.u.screen);
    Object.assign(SQ.u, { screen: target, history: [], searchOpen: false });
    navKind = null;
    try {
      sessionStorage.setItem("sq2.screen", target);
      sessionStorage.setItem("sq2.searchOpen", "");
    } catch {}
    render(true);
  };

  // ---------- Rendering ----------
  function render(resetScroll) {
    if (!SQ.d) return;
    document.documentElement.dataset.demo = SQ.d.user && SQ.d.user.demo ? "1" : ""; // the demo account hides the sketch controls
    const scr = SQ.screens[SQ.u.screen];
    const oldScroll = screenEl.querySelector(".scroll");
    const top = oldScroll ? oldScroll.scrollTop : 0;
    // Keep focus and cursor in the input being typed in, if a background update re-renders
    const active = document.activeElement;
    const bind = active && screenEl.contains(active) && active.dataset.bind;
    const sel = bind && "selectionStart" in active ? [active.selectionStart, active.selectionEnd] : null;

    if (!SQ.u.reqDraft) SQ.u.reqDraft = SQ.defaultReqDraft();
    if (!SQ.u.hostDraft) SQ.u.hostDraft = SQ.emptyHostDraft();
    const kind = resetScroll ? navKind : null;
    navKind = null;
    const snap = kind ? SQ.navSnapshot(screenEl) : null;
    screenEl.innerHTML = scr.render();
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
    if (SQ.afterRender) SQ.afterRender(screenEl); // the launch map's sheet, location and places (launch.js)
    watchReveal(screenEl.querySelector("[data-reveal]"));
    renderSide();
    ensure();
    if (snap) SQ.navMotion(screenEl, snap, kind);
  }
  SQ.render = () => render(false);

  // Lists that grow as you scroll: an element with data-reveal="action" at the end of the list runs that action
  // once it scrolls into view (or is already in view, so a short list keeps filling the screen)
  let revealer = null;
  function watchReveal(el) {
    if (revealer) revealer.disconnect();
    revealer = null;
    if (!el) return;
    revealer = new IntersectionObserver(async (entries) => {
      if (!entries.some((x) => x.isIntersecting)) return;
      revealer.disconnect();
      await SQ.actions[el.dataset.reveal]();
      render(false);
    }, { root: screenEl.querySelector(".scroll"), rootMargin: "0px 0px 240px 0px" });
    revealer.observe(el);
  }

  // "Resend code in 0:42": count down, then re-render so the resend button appears
  setInterval(() => {
    for (const el of screenEl.querySelectorAll("[data-until]")) {
      const left = Math.ceil((Number(el.dataset.until) - Date.now()) / 1000);
      if (left <= 0) return render(false);
      el.textContent = el.textContent.replace(/\d+:\d\d/, `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`);
    }
  }, 1000);

  // Sideways rows (cards, mixes, filter chips) scroll with a mouse too: the wheel moves them sideways while they
  // can still move, and a mouse drag scrolls them (a drag doesn't count as a tap)
  const ROWS = ".hscroll, .scroll-x";
  screenEl.addEventListener("wheel", (e) => {
    const row = e.target.closest && e.target.closest(ROWS);
    if (!row || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    const max = row.scrollWidth - row.clientWidth;
    if (max <= 0 || (e.deltaY < 0 && row.scrollLeft <= 0) || (e.deltaY > 0 && row.scrollLeft >= max - 1)) return;
    e.preventDefault();
    row.scrollLeft += e.deltaY;
  }, { passive: false });
  let dragged = false;
  screenEl.addEventListener("pointerdown", (e) => {
    const row = e.pointerType === "mouse" && !e.button && e.target.closest(ROWS);
    if (!row) return;
    const x0 = e.clientX, left = row.scrollLeft;
    dragged = false;
    row.style.scrollSnapType = "none"; // snapping fights a drag; it comes back on release
    const move = (ev) => {
      if (Math.abs(ev.clientX - x0) > 5) dragged = true;
      if (dragged) row.scrollLeft = left - (ev.clientX - x0);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", () => {
      window.removeEventListener("pointermove", move);
      row.style.scrollSnapType = "";
    }, { once: true });
  });
  screenEl.addEventListener("click", (e) => {
    if (dragged) {
      dragged = false;
      e.stopPropagation();
      e.preventDefault();
    }
  }, true);

  // Sliders: drag the handle to the end (or tap, or press Enter) to go to data-slide, or run data-slide-act
  const slideDone = (slider) => slider.dataset.slideAct ? run(slider, slider.dataset.slideAct) : SQ.go(slider.dataset.slide);
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
      if (dx > max * 0.7 || dx < 4) slideDone(slider);
      else handle.style.transform = "";
    };
    slider.addEventListener("pointermove", move);
    slider.addEventListener("pointerup", up, { once: true });
  });
  screenEl.addEventListener("keydown", (e) => {
    const slider = e.target.closest && e.target.closest("[data-slide]");
    if (slider && (e.key === "Enter" || e.key === " ")) slideDone(slider);
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
  async function run(el, act) {
    if (el.hasAttribute("data-back")) return SQ.back();
    const name = act || el.getAttribute("data-act");
    if (name) {
      const fn = SQ.actions[name];
      if (!fn) return console.warn("Unknown action:", name);
      if (busy) return;
      busy = true;
      let next, ok = false;
      const pend = SQ.pendingButton(el), acts = SQ.acts; // "Joining…" in place, the button keeping its size
      try {
        next = await fn(el.getAttribute("data-arg"), el);
        ok = true;
      } catch (err) {
        console.error(err);
      }
      if (pend) await pend.done(ok && SQ.acts > acts);
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
    // Sliders show their value while sliding: the fill and the label named data-out="<same path>"
    if (e.target.type === "range") {
      const r = e.target;
      r.style.setProperty("--fill", `${((r.value - r.min) / (r.max - r.min)) * 100}%`);
      const out = screenEl.querySelector(`[data-out="${CSS.escape(path)}"]`);
      if (out && SQ[r.dataset.format]) out.textContent = SQ[r.dataset.format](Number(r.value));
    }
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
    // How old the event import is: a warning here (the admin side) when it's more than 8 days, as in the server log
    let age = document.getElementById("side-data");
    if (!age) {
      age = document.createElement("p");
      age.id = "side-data";
      age.className = "side-data";
      age.setAttribute("role", "status");
      pill.insertAdjacentElement("afterend", age);
    }
    const h = SQ.d.dataHealth || {};
    age.hidden = h.days == null;
    age.classList.toggle("stale", !!h.stale);
    age.textContent = h.days == null ? "" : h.stale ? `Event data is ${h.days} days old. The daily import may not be reaching this server.` : `Event data imported ${h.days === 0 ? "today" : `${h.days} day${h.days === 1 ? "" : "s"} ago`}.`;
    const role = SQ.screens[SQ.u.screen].role;
    document.querySelectorAll("#side-role button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.role === role)));
    const groups = { attendee: "Attendee app", host: "Host app" };
    jump.innerHTML = Object.entries(groups).map(([r, label]) => `<optgroup label="${label}">${Object.entries(SQ.screens).filter(([, s]) => s.role === r).map(([id, s]) => `<option value="${id}"${id === SQ.u.screen ? " selected" : ""}>${SQ.esc(s.label || id)}</option>`).join("")}</optgroup>`).join("");
    // Without an email service, the login code is shown here so the sketch can be tried (see README)
    const code = document.getElementById("side-code");
    const demo = SQ.u.login && SQ.u.login.demoCode;
    code.hidden = !demo;
    if (demo && !code.dataset.shown) {
      code.dataset.shown = "1";
      side.classList.add("open"); // so the code is in view without opening the panel first
      sideToggle.setAttribute("aria-expanded", "true");
    }
    if (!demo) delete code.dataset.shown;
    if (demo) code.innerHTML = `No email service is set up, so here's the code that would have been emailed to ${SQ.esc(SQ.u.login.email)}:<b>${SQ.esc(demo)}</b>`;
  }
  document.getElementById("side-role").addEventListener("click", (e) => {
    const b = e.target.closest("[data-role]");
    if (!b) return;
    if (b.dataset.role === "host") SQ.go(SQ.d.host ? "host-demand" : "host-type");
    else SQ.go(SQ.d.user ? (SQ.d.user.registered ? "discover" : "ob-vibes") : "landing");
  });
  jump.addEventListener("change", () => {
    const id = jump.value;
    const real = guard(id);
    if (real !== id) toast(SQ.screens[id].role === "host" ? "Register or sign in as a host first." : "Sign up first.");
    SQ.go(id);
  });
  document.getElementById("side-brand").innerHTML = SQ.logo();

  // ---------- Layout ----------
  // By window width: phone (the design as drawn), tablet (the same screens in a centred column), and desktop
  // (the tab bar becomes a sidebar and the column widens). See "App shell" in styles.css.
  const tablet = matchMedia("(min-width: 761px)");
  const desktop = matchMedia("(min-width: 1100px)");
  const side = document.getElementById("side");
  const sideToggle = document.getElementById("side-toggle");
  sideToggle.insertAdjacentHTML("afterbegin", SQ.icon("settings"));
  function applyLayout() {
    document.documentElement.dataset.layout = desktop.matches ? "desktop" : tablet.matches ? "tablet" : "phone";
    if (SQ.d) render(false);
  }
  applyLayout();
  tablet.addEventListener("change", applyLayout);
  desktop.addEventListener("change", applyLayout);
  // On a tablet or desktop the panel floats over the app, opened from its button
  sideToggle.addEventListener("click", () => {
    const open = !side.classList.contains("open");
    side.classList.toggle("open", open);
    sideToggle.setAttribute("aria-expanded", String(open));
  });
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
  // A fresh visit (a new tab or session) goes: city-lights loader -> then
  //  - signed in with a real (non-demo) account: straight onto the map, with the zoom's second half; no question;
  //  - otherwise: "Are you demoing SideQuest or testing it?", with "Sign in or create an account" under it.
  // The answer is kept for this tab only (sessionStorage), so a reload in the same tab doesn't ask again; a screen
  // saved by an earlier visit is ignored until the question has been answered here. Shared links skip the question:
  // ?quest=<id>, ?demo=1 and the study's ?study=<id> (the /sk and /study pages are pages of their own).
  // Nothing here ever replaces a real account's session with the demo account: ?demo=1 and the study's links sign
  // into the demo only when no real account is signed in.
  SQ.actions.bootRetry = () => location.reload();
  SQ.opening.enterLogin = async () => {
    SQ.demoSession(false);
    if (!SQ.realUser()) SQ.setIds({ user: null });
    await SQ.refresh();
    Object.assign(SQ.u.login, { error: null, code: "" });
    SQ.enter(SQ.realUser() ? "discover" : "login");
  };
  SQ.opening.enterDemo = async () => {
    await SQ.act("demoLogin"); // always, even over a stale session or another account
    SQ.u.search = { ...SQ.u.search, result: null, ran: "", error: null };
    SQ.enter("discover");
  };
  (async function start() {
    const params = new URLSearchParams(location.search);
    try { localStorage.removeItem("sq2.mode"); } catch {} // the old per-device answer: not used any more
    // Links into the app from the voice study (/?demo=1&study=<id>): the demo account, and a bar back to the checklist
    const study = params.get("study");
    if (study && /^[\w-]{4,80}$/.test(study)) {
      try {
        sessionStorage.setItem("sq2.study", study);
      } catch {}
    }
    // "Back to the start" from the study page: forget this tab's answer and the demo account, and ask again
    // (a real account stays signed in, and so goes straight to the app)
    const switching = !!params.get("switch");
    if (switching) {
      SQ.mode.set(null);
      SQ.demoSession(false);
      history.replaceState(null, "", location.pathname);
    }
    if (params.get("demo") || (params.get("study") && SQ.studyId())) SQ.mode.set(SQ.studyId() ? "test" : "demo");
    else if (params.get("quest") && !SQ.mode.get()) SQ.mode.set("demo");
    const sid = SQ.studyId();
    if (sid) {
      const bar = document.getElementById("study-bar");
      bar.href = `/study?s=${encodeURIComponent(sid)}#discover`;
      bar.hidden = false;
      document.getElementById("phone").classList.add("studying");
    }
    // A tester coming back to the start page in the same tab goes back to their study (the question isn't asked twice)
    if (SQ.mode.get() === "test" && !sid && !ids.user && !ids.host && !location.search) {
      location.replace("/study");
      return;
    }
    const failed = () => {
      screenEl.innerHTML = `<div class="screen"><main class="scroll"><div class="pad stack" style="padding-top:80px">${SQ.errorBlock("Couldn't reach Sidequest", "The server may be waking up. Give it a moment, then try again.", "bootRetry")}</div></main></div>`;
      if (window.SQboot) window.SQboot.done();
    };
    try {
      await SQ.refresh();
      if (switching && ids.user && !SQ.realUser()) {
        SQ.setIds({ user: null });
        await SQ.refresh();
      }
    } catch (err) {
      return failed();
    }
    restoreSearch();
    // A real account on a fresh visit: no question, straight into the app (with the zoom's second half, below)
    const arriving = !SQ.mode.get() && SQ.realUser();
    if (arriving) SQ.mode.set("app");
    // Not answered in this tab yet: the question, on the loader's lights (opening.js). Nothing saved is restored.
    if (!SQ.mode.get()) {
      SQ.u.screen = "mode";
      trackScreen("mode", null);
      render(true);
      SQ.opening.ask();
      return;
    }
    // ?demo=1 and the study's links sign into the demo when no real account is signed in (a tester who made their
    // own account comes in as it); so does a demo tab whose account the server forgot
    const studyLink = !!(params.get("study") && sid);
    if (!SQ.realUser() && (params.get("demo") || studyLink || (!SQ.d.user && (SQ.demoSession() || (params.get("quest") && SQ.mode.get() === "demo"))))) {
      try {
        await SQ.act("demoLogin");
      } catch {
        return failed();
      }
    }
    let last = null;
    try {
      last = sessionStorage.getItem("sq2.screen");
    } catch {}
    const u = SQ.d.user;
    if (last === "search" && SQ.u.search.result) SQ.u.history = ["discover"];
    // A reload elsewhere keeps the Discover tab pointing at the results if they were still open
    try {
      SQ.u.searchOpen = !!SQ.u.search.result && (last === "search" || sessionStorage.getItem("sq2.searchOpen") === "1");
    } catch {}
    const fallback = u ? (u.registered ? "discover" : "ob-vibes") : "landing";
    const skip = ["mode", "quest", "tickets", "rate", "eventday", "eventday-chat", ...(SQ.u.search.result ? [] : ["search"]), "host-request", "host-checkin", "host-recap", "host-published", "host-create", "host-create-dayinfo", "host-draft-test", "spot", "add-event", ...(u ? ["landing"] : [])];
    SQ.u.screen = guard(params.get("demo") || studyLink ? "discover" : last && SQ.screens[last] && !skip.includes(last) ? last : fallback);
    // A shared link to one sidequest (?quest=id) opens it
    const linked = Number(params.get("quest"));
    if (linked && SQ.ev(linked) && SQ.d.user) {
      SQ.u.quest = linked;
      SQ.u.history = [SQ.u.screen];
      SQ.u.screen = "quest";
    }
    if (params.get("demo") || params.get("study") || params.get("quest")) history.replaceState(null, "", location.pathname);
    trackScreen(SQ.u.screen, null);
    // Signed in, fresh visit, on the map: the loader stays as the stage while the map renders, then zooms into it
    const zoom = arriving && SQ.u.screen === "discover" && SQ.opening.hold();
    try {
      render(true);
    } finally {
      if (zoom) SQ.opening.arrive().catch(() => { const b = document.getElementById("boot"); if (b) b.remove(); });
      else if (window.SQboot) window.SQboot.done(); // the first screen is in: the loader fades away (never left up, even on an error)
    }
  })();
})();
