/* Sketch 2 — the launch map (Discover, map first; designs LD2 option L2 and DX). The screen itself is drawn in
   screens-attendee.js (S.discover); this file runs what it needs between renders:
   - the bottom sheet's three stops (peek: cards, half: list over the map, full: list), by drag, by the grabber
     (Enter, or the arrow keys) and by the List and Map buttons, remembered per person in localStorage;
   - "Use my location": asked only after a tap, rounded to 2 decimals (about 1 km) before it goes anywhere, named
     with Sketch 1's place() helper on the server, and kept in this page's memory only (never stored, not even in
     sessionStorage), so "you are here" shows only after the person shares it;
   - "Your places": the events you're going to, saved and hosting, as Google Maps shows saved lists: their own pins,
     grouped when zoomed out (map.js), and a panel with each list and its count;
   - places: one search per map session, behind the server's usage caps. If there are none, the map shows events. */
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
      stop: STOPS.includes(saved) ? saved : "peek",
      loc,
      locState: loc ? "on" : "unknown",
      places: L ? L.places : null, // one search per map session, even across accounts
      placesState: L ? L.placesState : "idle",
      show: { events: true, places: true, yours: true },
      yp: false, // the "Your places" panel is open
      sel: null,
      peekH: 0,
    });
  }
  SQ.lx = { state, DOWNTOWN };

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
      SQ.toast("Location isn't available in this browser, so the map shows downtown Toronto.");
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
      SQ.render();
    }, (err) => {
      L.locState = "denied";
      SQ.toast(err && err.code === 1 ? "Location is off, so the map shows downtown Toronto. You can turn it on in your browser's settings." : "Couldn't find you just now, so the map shows downtown Toronto.");
      SQ.render();
    }, { enableHighAccuracy: false, timeout: 15000, maximumAge: 10 * 60000 });
  };
  // The legend chips are the filters: ★ Events and ● Places
  A.lxShow = (kind) => {
    const L = state();
    L.show[kind] = !L.show[kind];
  };
  // A pin (or a place card): bring its card forward and mark it on the map
  A.lxPin = (id) => {
    const L = state();
    L.sel = L.sel === id ? null : id;
    if (L.sel && L.sel[0] === "p" && U().screen === "discover") {
      const p = (L.places || []).find((x) => x.id === id);
      if (p && L.stop !== "peek") SQ.mapJump("discover", { lat: p.lat, lng: p.lng });
    }
    if (L.sel && L.stop === "full") setStop("peek", false);
  };

  // ---------- Your places: Going, Saved and Hosting, like Google Maps' saved lists ----------
  // Each upcoming event in one list only (Hosting beats Going beats Saved). An event whose coordinates aren't on land
  // in the GTA stays in the panel, marked "Not on the map", and gets no pin.
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
  const total = (lists) => LISTS.reduce((t, [k]) => t + lists[k].length, 0);
  // The chip in the controls row that opens the panel
  function ypChip() {
    const L = state();
    const n = total(yourPlaces());
    return `<button class="lx-yp-chip${L.yp ? " on" : ""}" data-act="lxYours" aria-expanded="${L.yp}" aria-controls="lx-yp" aria-label="Your places: ${n} going, saved or hosting">${SQ.PIN_ICONS.HEART}<span>Your places</span><b>${n}</b></button>`;
  }
  const when = (e) => {
    try {
      return new Date(e.startsAt).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "America/Toronto" });
    } catch { return ""; }
  };
  function ypPanel() {
    const L = state();
    if (!L.yp) return "";
    const esc = SQ.esc;
    const lists = yourPlaces();
    const icon = { going: SQ.PIN_ICONS.STAR, saved: SQ.PIN_ICONS.HEART, hosting: SQ.PIN_ICONS.FLAG };
    const sec = ([k, label]) => {
      const list = lists[k];
      return `<section class="yp-sec" aria-labelledby="yp-h-${k}">
        <h3 class="yp-h" id="yp-h-${k}"><span class="yp-ico ${k}" aria-hidden="true">${icon[k]}</span>${label}<span class="yp-n">${list.length} ${list.length === 1 ? "place" : "places"}</span></h3>
        ${list.length ? `<ul class="yp-list">${list.map((e) => `<li><button class="yp-row" data-act="lxYoursGo" data-arg="e${e.id}"><span class="yp-t">${esc(e.title)}</span><span class="yp-s">${esc([when(e), e.neighbourhood].filter(Boolean).join(" · "))}${onMapE(e) ? "" : " · Not on the map"}</span></button></li>`).join("")}</ul>`
          : `<p class="yp-empty">${k === "saved" ? "Tap the bookmark on an event and it shows here." : k === "going" ? "Events you're going to show here." : "Sidequests you host show here."}</p>`}
      </section>`;
    };
    return `<section class="lx-yp" id="lx-yp" role="dialog" aria-modal="false" aria-labelledby="lx-yp-title" tabindex="-1">
      <div class="yp-head"><h2 class="yp-title" id="lx-yp-title">Your places</h2>
        <button class="yp-show" data-act="lxYoursShow" aria-pressed="${L.show.yours}">${L.show.yours ? "Shown on map" : "Hidden on map"}</button>
        <button class="icon-btn yp-close" data-act="lxYours" aria-label="Close your places">${SQ.icon ? SQ.icon("x") : "×"}</button></div>
      <div class="yp-legend" role="list" aria-label="Map key">
        ${LISTS.map(([k, label]) => `<span role="listitem" class="yp-key"><span class="yp-ico ${k}" aria-hidden="true">${icon[k]}</span>${label}</span>`).join("")}
        <span role="listitem" class="yp-key"><span class="yp-ico ev" aria-hidden="true">${SQ.PIN_ICONS.STAR}</span>Events</span>
        <span role="listitem" class="yp-key"><span class="yp-ico pl" aria-hidden="true"></span>Places</span>
      </div>
      <div class="yp-body">${LISTS.map(sec).join("")}</div>
    </section>`;
  }
  SQ.lx.yourPlaces = yourPlaces;
  SQ.lx.yourPins = yourPins;
  SQ.lx.ypChip = ypChip;
  SQ.lx.ypPanel = ypPanel;
  let ypReturn = false;
  A.lxYours = () => {
    const L = state();
    L.yp = !L.yp;
    ypReturn = !L.yp; // closing: focus goes back to the chip
    if (L.yp) setTimeout(() => { const p = document.getElementById("lx-yp"); if (p) p.focus(); });
  };
  A.lxYoursShow = () => {
    const L = state();
    L.show.yours = !L.show.yours;
  };
  // A row in the panel: close it, pick the pin and centre the map on it (if it has one)
  A.lxYoursGo = (id) => {
    const L = state();
    L.yp = false;
    L.sel = id;
    const e = SQ.d.events.find((x) => `e${x.id}` === id);
    if (onMapE(e)) SQ.mapJump("discover", { lat: e.venue.lat, lng: e.venue.lng, zoom: Math.max((SQ.mapCenter("discover") || {}).zoom || 13, 13.6) });
    if (L.stop === "full") setStop("peek", false);
  };
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const L = U() && U().lx;
    if (!L || !L.yp || U().screen !== "discover") return;
    L.yp = false;
    ypReturn = true;
    SQ.render();
  });

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
    const at = L.loc || DOWNTOWN;
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

  // ---------- The sheet ----------
  let sheetEl = null;
  function parts() {
    const sheet = sheetEl && sheetEl.isConnected ? sheetEl : null;
    if (!sheet) return null;
    return { sheet, wrap: sheet.parentElement, head: sheet.querySelector(".lx-head"), cards: sheet.querySelector(".lx-cards"), list: sheet.querySelector(".lx-list") };
  }
  // How much of the sheet shows at each stop
  function heights(p) {
    const L = state();
    const H = p.wrap.clientHeight;
    const ctrls = p.wrap.querySelector(".map-ctrls .search");
    const top = ctrls ? Math.round(ctrls.getBoundingClientRect().bottom - p.wrap.getBoundingClientRect().top + 10) : 72;
    const full = Math.max(200, H - top);
    if (p.sheet.dataset.stop === "peek" && p.cards.offsetHeight) L.peekH = p.head.offsetHeight + p.cards.offsetHeight + 14;
    const peek = Math.min(full, L.peekH || 300);
    return { full, peek, half: Math.min(full, Math.max(peek + 60, Math.round(H * 0.55))) };
  }
  function apply(p, stop, h = heights(p)) {
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
    if (!p || !e.target.closest(".lx-head") || e.target.closest(".lx-views") || (e.pointerType === "mouse" && e.button)) return;
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
    if (Math.abs(v) > 0.6) {
      const i = STOPS.indexOf(state().stop) + (v > 0 ? 1 : -1);
      next = STOPS[Math.max(0, Math.min(2, i))];
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
    if (ypReturn) { ypReturn = false; const c = root.querySelector(".lx-yp-chip"); if (c) c.focus(); }
    const card = L.sel && p.cards.querySelector(`[data-id="${CSS.escape(L.sel)}"]`);
    if (card) p.cards.scrollLeft = Math.max(0, card.offsetLeft - 16);
    if (SQ.d && SQ.d.user) ensurePlaces();
  };
})();
