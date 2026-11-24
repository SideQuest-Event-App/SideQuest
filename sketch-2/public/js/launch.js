/* Sketch 2 — the launch map (Discover, map first; designs LD2 option L2 and DX). The screen itself is drawn in
   screens-attendee.js (S.discover); this file runs what it needs between renders:
   - the bottom sheet's three stops (peek: cards, half: list over the map, full: list), by drag, by the grabber
     (Enter, or the arrow keys) and by the List and Map buttons, remembered per person in localStorage;
   - "Use my location": asked only after a tap, rounded to 2 decimals (about 1 km) before it goes anywhere, named
     with Sketch 1's place() helper on the server, and kept for this tab only;
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

  function state() {
    const L = U().lx;
    if (L && L.user === SQ.userId()) return L;
    let loc = null;
    try {
      loc = JSON.parse(session.get("sq2.loc") || "null");
      if (!loc || !Number.isFinite(loc.lat) || !Number.isFinite(loc.lng)) loc = null;
      else loc = { lat: round2(loc.lat), lng: round2(loc.lng), label: String(loc.label || "your area").slice(0, 40) };
    } catch {
      loc = null;
    }
    const saved = local.get(stopKey());
    return (U().lx = {
      user: SQ.userId(),
      stop: STOPS.includes(saved) ? saved : "peek",
      loc,
      locState: loc ? "on" : "unknown",
      places: L ? L.places : null, // one search per map session, even across accounts
      placesState: L ? L.placesState : "idle",
      show: { events: true, places: true },
      sel: null,
      peekH: 0,
    });
  }
  SQ.lx = { state, DOWNTOWN };

  // ---------- "Are you demoing SideQuest or testing it?" ----------
  // The first screen on a new device (after the loader, before the start page). The answer is kept on this device:
  // "demo" opens the demo account on the map; "test" opens the voice study at /study, whose checklist links back
  // into the demo app (/?demo=1&study=<id>). Shared links (/sk, /study?s=…, ?quest=) never see the question.
  const MODE_KEY = "sq2.mode";
  SQ.mode = {
    get: () => (["demo", "test"].includes(local.get(MODE_KEY)) ? local.get(MODE_KEY) : null),
    set: (v) => local.set(MODE_KEY, v),
  };
  SQ.studyId = () => {
    const s = session.get("sq2.study");
    return s && /^[\w-]{4,80}$/.test(s) ? s : null;
  };
  SQ.planHref = () => (SQ.studyId() ? `/sk?study=${encodeURIComponent(SQ.studyId())}` : "/sk");
  SQ.screens.mode = { role: "attendee", label: "Demoing or testing?", render: () => SQ.screen(`<div class="mode lights">
      <div class="mode-in">
        <span class="mode-wm">sidequest</span>
        <h1 class="mode-h">Are you demoing SideQuest or testing it?</h1>
        <div class="mode-picks">
          <button class="mode-pick pri" data-act="modeDemo"><span class="mode-t">Demoing</span><span class="mode-s">Go straight into the full app: the map, Plan with Sidekick, and sample friends.</span></button>
          <button class="mode-pick" data-act="modeTest"><span class="mode-t">Testing</span><span class="mode-s">Take part in the Sidekick voice study. A short checklist walks you through it.</span></button>
        </div>
        <p class="mode-note">We'll remember this on this device. You can switch from the start page or your profile.</p>
      </div>
    </div>`, { cls: "bleed" }) };

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
      L.loc = { lat, lng, label: label || "your area" };
      L.locState = "on";
      session.set("sq2.loc", JSON.stringify(L.loc));
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

  A.modeDemo = async () => {
    SQ.mode.set("demo");
    await SQ.act("demoLogin");
    return "discover";
  };
  A.modeTest = () => {
    SQ.mode.set("test");
    location.href = "/study";
    return new Promise(() => {}); // the page is leaving
  };
  // "Switch to demo / testing": forget the answer (and the account on this device) and ask again
  A.modeSwitch = async () => {
    SQ.mode.set(null);
    SQ.setIds({ user: null });
    U().history = [];
    await SQ.refresh();
    return "mode";
  };

  // ---------- Places: once per map session ----------
  async function ensurePlaces() {
    const L = state();
    if (L.placesState !== "idle") return;
    L.placesState = "loading";
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
    const card = L.sel && p.cards.querySelector(`[data-id="${CSS.escape(L.sel)}"]`);
    if (card) p.cards.scrollLeft = Math.max(0, card.offsetLeft - 16);
    if (SQ.d && SQ.d.user) ensurePlaces();
  };
})();
