/* Sketch 2 — the launch map (Discover, map first; the redesign's maplist option B). The screen itself is drawn in
   screens-attendee.js (S.discover); this file runs what it needs between renders:
   - the sheet's three heights (peek: the pills over the map, half: the list over the map, full: the list), by drag
     and by the grabber (Enter, or the arrow keys), remembered per person in localStorage. No List / Map switch;
   - the person's live location, never stored: used at once when the browser already allows it, else only after a
     tap on "my location"; rounded to 2 decimals (about 1 km) before it goes anywhere, named with Sketch 1's place()
     helper on the server, and kept in this page's memory only (not even sessionStorage). Without it the map starts
     on the person's chosen area (Getting around), else downtown Toronto;
   - Going, Saved and Hosting pins, grouped when zoomed out (map.js);
   - places: one search per map session behind the server's usage caps, plus "Search this area" after a pan (events
     stay the GTA import; outside it the sheet says so). If there are none, the map shows events;
   - For you's vibe collections, ranked on the server (lib/search/foryou.js). */
(function () {
  const SQ = window.SQ;
  const U = () => SQ.u;
  const STOPS = ["peek", "half", "full"];
  const STOP_WORD = { peek: "cards", half: "list and map", full: "list" };
  const DOWNTOWN = { lat: 43.6532, lng: -79.3832, label: "Downtown Toronto" };
  const round2 = (n) => Math.round(n * 100) / 100;
  const box = (kind) => ({
    get(k) {
      try {
        return window[kind].getItem(k);
      } catch {
        return null;
      }
    },
    set(k, v) {
      try {
        if (v == null) window[kind].removeItem(k);
        else window[kind].setItem(k, v);
      } catch {}
    },
  });
  const local = box("localStorage"), session = box("sessionStorage");
  const stopKey = () => `sq2.sheet.${SQ.userId() || "guest"}`;

  let memLoc = null; // the shared location, rounded: this page's memory only
  session.set("sq2.loc", null); // an older version kept it for the tab; nothing is stored any more
  function state() {
    const L = U().lx;
    if (L && L.user === SQ.userId()) return L;
    const loc = memLoc;
    const saved = local.get(stopKey());
    return (U().lx = {
      user: SQ.userId(),
      stop: STOPS.includes(saved) ? saved : "half", // the list over the map: For you in view, with the map above it
      tab: "foryou", // the sheet's pills: For you, Events, Places (what the list and the map show)
      outside: false, // the places were searched outside the GTA, where there are no events
      at: null, // where the places were searched (the map's centre at the time), so a pan can offer "Search this area"
      loc,
      locState: loc ? "on" : "unknown",
      places: L ? L.places : null, // one search per map session, even across accounts
      placesState: L ? L.placesState : "idle",
      show: { yours: true },
      sel: null,
      peekH: 0,
    });
  }
  SQ.lx = { state, DOWNTOWN };
  // Without a shared location, the person's chosen area (Profile > Getting around), else downtown Toronto
  function homeArea() {
    const u = SQ.d && SQ.d.user;
    const name = u && (u.homeArea || (u.areas || [])[0]);
    const h = name && (SQ.HOODS || []).find((x) => x[0] === name);
    return h ? { lat: h[1], lng: h[2], label: h[0] } : DOWNTOWN;
  }
  SQ.lx.homeArea = homeArea;
  SQ.lx.whereLabel = () => {
    const L = state();
    return L.loc ? `You · ${L.loc.label}` : L.locState === "asking" ? "Finding you…" : homeArea().label;
  };
  SQ.lx.startView = () => {
    const L = state();
    const c = L.loc || homeArea();
    return { lat: c.lat, lng: c.lng, zoom: L.loc ? 13.6 : 12.4 };
  };
  // Live location by default, never stored: if the browser already lets this site use it, it's used at once (no
  // prompt). Otherwise nothing is asked until the person taps "my location" on the map.
  let autoTried = false;
  function autoLocate() {
    if (autoTried) return;
    autoTried = true;
    try {
      if (!navigator.permissions || !navigator.geolocation) return;
      navigator.permissions.query({ name: "geolocation" }).then((st) => {
        if (st.state === "granted" && state().locState === "unknown") A.lxLocate();
      }, () => {});
    } catch {}
  }

  // ---------- "Are you demoing SideQuest or testing it?" ----------
  // Asked on every fresh visit by someone who isn't signed in with a real account, after the loader (opening.js
  // draws it on the loader's lights and runs the zoom into the app). A real, non-demo account skips it and goes
  // straight to the map, with the zoom's second half. The answer is kept for this tab only, so a reload in the same
  // tab doesn't ask again: "demo" opens the shared demo account on the map; "test" opens the voice study at /study,
  // whose checklist links back into the app as the tester's own account (/?study=<id>) or, if they skipped making
  // one, the demo (/?demo=1&study=<id>); "app" is a real account (signed in, or "Sign in or create an account").
  // Shared links (/sk, /study?s=…, ?quest=, ?demo=1) never see the question.
  const MODE_KEY = "sq2.mode";
  SQ.mode = {
    get: () => (["demo", "test", "app"].includes(session.get(MODE_KEY)) ? session.get(MODE_KEY) : null),
    set: (v) => session.set(MODE_KEY, v),
  };
  SQ.studyId = () => {
    const s = session.get("sq2.study");
    return s && /^[\w-]{4,80}$/.test(s) ? s : null;
  };
  SQ.planHref = () => (SQ.studyId() ? `/sk?study=${encodeURIComponent(SQ.studyId())}` : "/sk");
  // The screen under the question: the same lights, so nothing flashes if the question's stage is still fading in
  SQ.screens.mode = { role: "attendee", label: "Demoing or testing?", render: () => {
    setTimeout(() => { if (U().screen === "mode" && !SQ.opening.active()) SQ.opening.ask(); });
    return SQ.screen('<div class="mode lights" aria-hidden="true"></div>', { cls: "bleed" });
  } };

  // ---------- Actions ----------
  const A = SQ.actions;
  // Ask for location only now, after a tap. Not awaited, so the rest of the app stays usable while the browser asks.
  A.lxLocate = () => {
    const L = state();
    if (!navigator.geolocation) {
      L.locState = "denied";
      SQ.toast(`Location isn't available in this browser, so the map shows ${homeArea().label}.`);
      return;
    }
    if (L.locState === "asking") return;
    L.locState = "asking";
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const lat = round2(pos.coords.latitude), lng = round2(pos.coords.longitude);
      let label = null;
      try {
        label = (await (await fetch(`/api/where?lat=${lat}&lng=${lng}`)).json()).label;
      } catch {}
      L.loc = memLoc = { lat, lng, label: label || "your area" };
      L.locState = "on";
      SQ.mapJump("discover", { lat, lng, zoom: 13.6 });
      hideArea();
      SQ.render();
    }, (err) => {
      L.locState = "denied";
      const area = homeArea().label;
      SQ.toast(err && err.code === 1 ? `Location is off, so the map shows ${area}. You can turn it on in your browser's settings.` : `Couldn't find you just now, so the map shows ${area}.`);
      SQ.render();
    }, { enableHighAccuracy: false, timeout: 15000, maximumAge: 10 * 60000 });
  };
  // A pin, or a poster in the list: its card comes forward in the sheet and its pin is marked. From the list, or from "See all": the sheet drops to a peek so the map shows it, with its card in the sheet
  A.lxPin = (id) => {
    const L = state();
    L.sel = L.sel === id ? null : id;
    if (!L.sel) return;
    const p = id[0] === "p" ? (L.places || []).find((x) => x.id === id) : null;
    const e = id[0] === "e" ? SQ.d.events.find((x) => `e${x.id}` === id) : null;
    const at = p ? p : e && e.venue && SQ.onMap(e.venue.lat, e.venue.lng) ? e.venue : null;
    if (at && L.stop !== "peek") SQ.mapJump("discover", { lat: at.lat, lng: at.lng });
    if (L.stop !== "peek") { L.stop = "peek"; local.set(stopKey(), "peek"); }
    if (U().screen !== "discover") return "discover";
  };

  // ---------- Your lists on the map: Going, Saved and Hosting pins, like Google Maps' saved lists ----------
  // (The "Your places" pill and panel are gone: the lists themselves live in Sidequests, Saved and Your events.)
  // Each upcoming event in one list only (Hosting beats Going beats Saved). An event whose coordinates aren't on land
  // in the GTA gets no pin.
  const LISTS = [["going", "Going", "★"], ["saved", "Saved", "♥"], ["hosting", "Hosting", "⚑"]];
  function yourPlaces() {
    const u = SQ.d && SQ.d.user;
    const out = { going: [], saved: [], hosting: [] };
    if (!u) return out;
    const ev = (id) => SQ.d.events.find((e) => e.id === Number(id) || e.id === id);
    const future = (e) => e && !(SQ.isPast && SQ.isPast(e));
    const taken = new Set();
    const add = (list, e) => { if (future(e) && !taken.has(e.id)) { taken.add(e.id); out[list].push(e); } };
    for (const h of u.hosting || []) add("hosting", ev(h && h.id != null ? h.id : h));
    for (const [id, l] of Object.entries(u.log || {})) if (l && l.status === "going") add("going", ev(id));
    for (const id of u.saved || []) add("saved", ev(id));
    for (const k of Object.keys(out)) out[k].sort((a, b) => String(a.startsAt).localeCompare(String(b.startsAt)));
    return out;
  }
  const onMapE = (e) => e && e.venue && SQ.onMap(e.venue.lat, e.venue.lng);
  // Pins for the map: { lat, lng, kind: "event", list, ... }
  function yourPins(sel) {
    const L = state();
    if (!L.show.yours) return [];
    const lists = yourPlaces();
    return LISTS.flatMap(([k]) => lists[k].filter(onMapE).map((e) => ({ lat: e.venue.lat, lng: e.venue.lng, kind: "event", list: k, selected: sel === `e${e.id}`, act: "lxPin", arg: `e${e.id}`, label: e.title })));
  }
  SQ.lx.yourPlaces = yourPlaces;
  SQ.lx.yourPins = yourPins;

  // "Switch to demo / testing": forget this tab's answer (and the account on this device) and ask again
  A.modeSwitch = async () => {
    SQ.mode.set(null);
    SQ.demoSession(false);
    SQ.setIds({ user: null });
    U().history = [];
    await SQ.refresh();
    return "mode";
  };

  // "Try again" when the matches couldn't be picked: clearing the error lets the next render ask again
  A.feedRetry = () => {
    U().feedError = null;
  };

  // ---------- Places: once per map session ----------
  async function ensurePlaces() {
    const L = state();
    if (L.placesState !== "idle") return;
    L.placesState = "loading";
    L.placesSince = Date.now();
    const at = L.loc || homeArea();
    L.at = { lat: at.lat, lng: at.lng };
    try {
      const r = await SQ.post("/api/places", { lat: round2(at.lat), lng: round2(at.lng), vibes: (SQ.d.user && SQ.d.user.vibes) || [] });
      L.places = Array.isArray(r.places) ? r.places.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng)) : [];
    } catch {
      L.places = []; // no places is fine: the map shows events
    }
    L.placesState = "done";
    if (window.SQboot && L.places.length) window.SQboot.counts({ places: L.places.length });
    if (U().screen === "discover") SQ.render();
  }

  // ---------- For you: vibe collections (the server ranks them with the person's taste: lib/search/foryou.js) ----------
  // Asked again when the places or the feed change. The place cards go to the server only to be ranked (never stored).
  async function ensureForYou() {
    const L = state();
    const u = SQ.d && SQ.d.user;
    if (!u || L.placesState === "loading") return;
    const key = [u.id, u.feedKey || "", (u.feed && u.feed.key) || "", (L.places || []).map((p) => p.id).join(","), (u.vibes || []).join(",")].join("|");
    const fy = U().fy;
    if (fy && (fy.key === key || fy.loading)) return;
    U().fy = { key, loading: true, collections: fy && fy.key && fy.key.split("|")[0] === u.id ? fy.collections : null };
    try {
      const r = await SQ.post("/api/foryou", { userId: u.id, places: (L.places || []).map((p) => ({ id: p.id, title: p.title, type: p.type, vibes: p.vibes })) });
      U().fy = { key, loading: false, collections: r.collections || [] };
    } catch {
      U().fy = { key, loading: false, collections: null, error: true }; // the sheet falls back to the sign-up vibes
    }
    if (["discover", "collection"].includes(U().screen)) SQ.render();
  }

  // ---------- Search this area ----------
  // Panning the map more than about 1.5 km from where the places were searched offers a new search there. Places load
  // for that area; events stay the GTA import, so outside it the sheet says only places show.
  const kmBetween = (a, b) => {
    const r = Math.PI / 180;
    return 6371 * Math.hypot((b.lng - a.lng) * r * Math.cos(((a.lat + b.lat) / 2) * r), (b.lat - a.lat) * r);
  };
  function areaBtn() { return document.querySelector("#screen .lx-area"); }
  function hideArea() { const b = areaBtn(); if (b) b.hidden = true; }
  function syncArea() {
    const L = state(), b = areaBtn();
    const c = SQ.mapCenter && SQ.mapCenter("discover");
    if (!b || !c || !L.at || L.placesState === "loading") return;
    b.hidden = !(kmBetween(L.at, c) > 1.5);
  }
  SQ.onMapMoved = (id) => { if (id === "discover" && U().screen === "discover") syncArea(); };
  const GTA = () => (SQ.GEO && SQ.GEO.GTA) || { south: 43.35, north: 44.15, west: -80.1, east: -78.8 };
  const inGTA = (c) => { const b = GTA(); return c.lat > b.south && c.lat < b.north && c.lng > b.west && c.lng < b.east; };
  A.lxArea = async () => {
    const L = state();
    const c = SQ.mapCenter("discover");
    if (!c) return;
    hideArea();
    L.placesState = "loading";
    L.placesSince = Date.now();
    L.at = { lat: c.lat, lng: c.lng };
    L.outside = !inGTA(c);
    L.sel = null;
    SQ.render();
    try {
      const r = await SQ.post("/api/places", { lat: round2(c.lat), lng: round2(c.lng), area: true, vibes: (SQ.d.user && SQ.d.user.vibes) || [] });
      L.places = Array.isArray(r.places) ? r.places.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng)) : [];
      if (r.reason === "area limit") SQ.toast("That's a lot of searching for one visit. Places will search again next time.");
    } catch {
      L.places = [];
    }
    L.placesState = "done";
  };

  // ---------- The sheet ----------
  let sheetEl = null;
  function parts() {
    const sheet = sheetEl && sheetEl.isConnected ? sheetEl : null;
    if (!sheet) return null;
    return { sheet, wrap: sheet.parentElement, head: sheet.querySelector(".lx-head"), list: sheet.querySelector(".lx-list") };
  }
  // How much of the sheet shows at each stop
  // peek: the grabber, the hint and the pills (the big title shows only above a peek); full: up to the search bar
  function heights(p) {
    const H = p.wrap.clientHeight;
    const ctrls = p.wrap.querySelector(".map-ctrls .search");
    const top = ctrls ? Math.round(ctrls.getBoundingClientRect().bottom - p.wrap.getBoundingClientRect().top + 10) : 72;
    const full = Math.max(200, H - top);
    const title = p.head.querySelector(".dx-big");
    const tH = title && title.offsetHeight ? title.offsetHeight + parseFloat(getComputedStyle(title).marginBottom || 0) + parseFloat(getComputedStyle(title).marginTop || 0) : 0;
    const peek = Math.min(full, Math.max(120, p.head.offsetHeight - tH + 10));
    return { full, peek, half: Math.min(full, Math.max(peek + 120, Math.round(H * 0.58))) };
  }
  function apply(p, stop, h0) {
    p.wrap.dataset.stop = stop; // the title shows or hides first, so the heights are measured as they'll be
    const h = h0 || heights(p);
    const vis = h[stop];
    p.sheet.style.height = `${h.full}px`;
    p.sheet.style.transform = `translateY(${h.full - vis}px)`;
    p.wrap.style.setProperty("--lx-vis", `${vis}px`);
    p.list.style.height = `${Math.max(0, vis - p.head.offsetHeight)}px`;
  }
  function label(p, stop) {
    p.wrap.dataset.stop = stop;
    p.sheet.querySelectorAll("[data-lx-stop]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.lxStop === stop)));
    p.sheet.querySelector(".lx-grab").setAttribute("aria-label", `Sheet showing ${STOP_WORD[stop]}. Press to ${stop === "full" ? "pull it back down" : "pull it up"}, or use the arrow keys`);
  }
  function setStop(stop, animate = true) {
    const L = state();
    L.stop = stop;
    local.set(stopKey(), stop);
    const p = parts();
    if (!p) return;
    p.sheet.dataset.stop = stop;
    if (!animate) p.sheet.classList.add("still");
    label(p, stop);
    apply(p, stop);
    if (!animate) requestAnimationFrame(() => p.sheet.classList.remove("still"));
  }
  SQ.lx.setStop = setStop;

  // Drag the sheet's top edge; let go and it settles on the nearest stop (a flick goes one stop that way)
  let drag = null, draggedAt = 0;
  function onDown(e) {
    const p = parts();
    if (!p || !e.target.closest(".lx-head") || e.target.closest(".dx-seg, .lx-selwrap") || (e.pointerType === "mouse" && e.button)) return;
    if (document.documentElement.dataset.layout === "desktop") return; // a side panel there, not a sheet
    const h = heights(p);
    drag = { p, h, y0: e.clientY, t0: performance.now(), vis0: h[state().stop], vis: h[state().stop], moved: false };
  }
  function onMove(e) {
    if (!drag) return;
    const dy = e.clientY - drag.y0;
    if (!drag.moved && Math.abs(dy) < 6) return;
    if (!drag.moved) {
      drag.moved = true;
      drag.p.sheet.classList.add("dragging");
      drag.p.wrap.dataset.stop = "half"; // show the list while dragging
    }
    drag.vis = Math.max(drag.h.peek, Math.min(drag.h.full, drag.vis0 - dy));
    drag.p.sheet.style.transform = `translateY(${drag.h.full - drag.vis}px)`;
    drag.p.list.style.height = `${Math.max(0, drag.vis - drag.p.head.offsetHeight)}px`;
    e.preventDefault();
  }
  function onUp(e) {
    if (!drag) return;
    const d = drag;
    drag = null;
    if (!d.moved) return;
    draggedAt = performance.now(); // the click that ends a drag isn't a tap
    d.p.sheet.classList.remove("dragging");
    const v = (d.vis0 - (e.clientY - d.y0) - d.vis0) / Math.max(1, performance.now() - d.t0); // px per ms, up is positive
    const order = STOPS.map((s) => [s, d.h[s]]);
    let next = order.reduce((a, b) => (Math.abs(b[1] - d.vis) < Math.abs(a[1] - d.vis) ? b : a))[0];
    // A flick goes on to the next height in its direction from where it was let go (a long fast drag can cross two)
    if (Math.abs(v) > 0.6) {
      const ahead = v > 0 ? order.filter(([, h]) => h > d.vis + 1) : order.filter(([, h]) => h < d.vis - 1).reverse();
      next = ahead.length ? ahead[0][0] : v > 0 ? "full" : "peek";
    }
    setStop(next);
  }

  const screenEl = document.getElementById("screen");
  screenEl.addEventListener("pointerdown", onDown);
  window.addEventListener("pointermove", onMove, { passive: false });
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onUp);
  screenEl.addEventListener("click", (e) => {
    const b = e.target.closest("[data-lx-stop], [data-lx-cycle]");
    if (!b || performance.now() - draggedAt < 300) return;
    const L = state();
    setStop(b.dataset.lxStop || STOPS[(STOPS.indexOf(L.stop) + 1) % 3]);
  });
  screenEl.addEventListener("keydown", (e) => {
    if (!e.target.closest || !e.target.closest("[data-lx-cycle]")) return;
    const i = STOPS.indexOf(state().stop);
    const to = { ArrowUp: i + 1, ArrowDown: i - 1, Home: 0, End: 2 }[e.key];
    if (to == null) return;
    e.preventDefault();
    setStop(STOPS[Math.max(0, Math.min(2, to))]);
  });
  window.addEventListener("resize", () => {
    const p = parts();
    if (p) apply(p, state().stop);
  });

  // After every render of Discover: size the sheet, bring the chosen card into view, and fetch places once
  SQ.afterRender = (root) => {
    sheetEl = root.querySelector("#lx-sheet");
    const p = parts();
    if (!p) return;
    const L = state();
    p.sheet.dataset.stop = L.stop;
    p.sheet.classList.add("still");
    label(p, L.stop);
    apply(p, L.stop);
    requestAnimationFrame(() => p.sheet.classList.remove("still"));
    // Streets first, then each pin fades in as it arrives (the opening flies them in itself)
    SQ.pinsArrive(root, SQ.opening.active());
    if (SQ.d && SQ.d.user) { autoLocate(); ensurePlaces(); ensureForYou(); }
    syncArea(root);
  };
})();
