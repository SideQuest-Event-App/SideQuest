/* Sketch 2 — the map (Figma: Map, Map pin, Map home, Map legend), interactive: drag to pan, wheel or pinch to zoom,
   and the zoom / locate buttons. The streets are the design's own base map; pins sit at real coordinates.
   Map units are the Discover map's frame (390 × 694 at zoom 1); the base map art spans x -663…1017, y -402…1132. */
(function () {
  const SQ = window.SQ;
  const { esc, icon } = SQ;

  // Real coordinates -> map units, fitted so the Kensington and Queen West labels land where the design puts them
  const proj = (lat, lng) => [188 + (lng + 79.4005) * 7540, 216 - (lat - 43.6547) * 10250];
  // Neighbourhood labels (and the areas onboarding can pick); origin is the trip-time start nearest each
  const HOODS = [
    ["Ossington", 43.6487, -79.4202, "union"], ["Kensington", 43.6547, -79.4005, "union"], ["Queen West", 43.6468, -79.4135, "union"],
    ["The Annex", 43.6703, -79.4072, "union"], ["Roncesvalles", 43.6488, -79.4486, "kipling"], ["Liberty Village", 43.6383, -79.4206, "union"],
    ["Little Italy", 43.6551, -79.4141, "union"], ["Chinatown", 43.6531, -79.3977, "union"], ["Leslieville", 43.6629, -79.3329, "kennedy"],
    ["Distillery", 43.6503, -79.3596, "union"], ["Junction", 43.6655, -79.4655, "kipling"], ["Yorkville", 43.6709, -79.3933, "union"],
    ["Church St", 43.6656, -79.3807, "union"], ["Danforth", 43.6787, -79.3497, "kennedy"], ["Parkdale", 43.6397, -79.4363, "kipling"],
    ["Dundas West", 43.6512, -79.4316, "union"], ["St Lawrence", 43.6487, -79.3716, "union"], ["Harbourfront", 43.6389, -79.3817, "union"],
  ];
  SQ.HOODS = HOODS;
  const hood = (name) => HOODS.find((h) => h[0] === name);

  // The base map, as drawn in Figma (paths are in map units)
  const BASE = `<svg class="map-base" viewBox="-663 -402 1680 1534" width="1680" height="1534" aria-hidden="true" fill="none">
    <rect x="-663" y="-402" width="1680" height="1534" fill="var(--map-land)"/>
    <g fill="var(--map-park)"><path transform="translate(-371.2 169.5)" d="M0 13.2C73 -23.4 182.6 13.2 175.3 159.3 146.1 239.6 36.5 239.6 7.3 159.3Z"/><path transform="translate(147.5 -69.6)" d="M0 3.8C51.1 -10.8 87.7 18.5 80.4 55 51.1 76.9 7.3 69.6 0 3.8Z"/><path transform="translate(578.5 210.6)" d="M0 8.6C43.8 -13.3 95 8.6 87.7 52.4 51.1 74.3 7.3 67 0 8.6Z"/></g>
    <g stroke="var(--map-street)" stroke-linecap="round" stroke-width="5.11"><path d="M-517.3 91.3 943.8 65.7M-517.3 273.9 943.8 299.5M-60.7 -146.1-53.4 547.9M322.8 -219.2 330.2 584.4M-298.1 -73.1-283.5 547.8"/></g>
    <g stroke="var(--map-street)" stroke-linecap="round" stroke-width="10.96"><path d="M-517.3 0 943.8 -29.2M-444.2 168C-78.9 219.2 213.3 233.8 688.1 299.5M-517.3 365.3 943.8 387.2M-371.2 445.6 870.7 460.2M30.6 -109.6 37.9 547.9M227.9 -146.1 249.8 584.4M395.9 -401.8 403.2 591.7M132.9 -182.6 147.5 591.7M-444.2 547.9C-78.9 526 395.9 533.3 907.3 496.8M-159.3 -109.6-152 547.9M-517.3 182.6-79 197.2M505.5 -182.6 520.1 547.9"/></g>
    <path fill="var(--map-water)" d="M-663.4 613.6C-371.2 547.9-115.5 591.7 103.7 613.6 322.8 635.6 432.4 628.3 578.5 547.9 724.6 467.5 797.7 511.4 1016.8 533.3V1132.3H-663.4Z"/>
    <path fill="var(--map-land)" d="M231.5 701.3C304.6 672.1 414.2 672.1 487.2 701.3 443.4 737.8 297.3 745.1 231.5 701.3Z"/>
  </svg>`;

  // A pin: { lat, lng, tier: strong|close|low, selected, act, arg, label }. home: a neighbourhood name, or [lat, lng].
  // labels: neighbourhood names to label (true: all of them). Labels sit up and left of their spot, as the design draws them.
  // view: { x, y, z } map point at the centre and zoom; kept in SQ.u.maps[id] so re-renders and back keep the view.
  SQ.mapView = (id, { pins = [], home = null, labels = true, view = { x: 195, y: 347, z: 1 }, cls = "", style = "" } = {}) => {
    const maps = (SQ.u.maps = SQ.u.maps || {});
    const v = maps[id] || (maps[id] = { ...view });
    const homeLL = typeof home === "string" ? hood(home) && hood(home).slice(1, 3) : home;
    const at = ([x, y], extra = "") => `data-mx="${x.toFixed(1)}" data-my="${y.toFixed(1)}" ${extra}`;
    return `<div class="map ${cls}" data-map="${esc(id)}" style="${style}">
      <div class="map-layer">${BASE}</div>
      <div class="map-marks">
        ${labels ? HOODS.filter((h) => labels === true || labels.includes(h[0])).map(([n, la, ln]) => `<span class="map-label" ${at(proj(la, ln))}>${esc(n)}</span>`).join("") : ""}
        ${homeLL ? `<span class="map-home" ${at(proj(homeLL[0], homeLL[1]))}><i>${icon("home2")}</i>Home</span>` : ""}
        ${pins.filter((p) => p.lat != null).map((p) => `<button class="map-pin ${p.tier || "strong"}${p.selected ? " on" : ""}" ${at(proj(p.lat, p.lng))} ${p.act ? `data-act="${esc(p.act)}" data-arg="${esc(p.arg)}"` : ""} aria-label="${esc(p.label || "Pin")}"><i></i></button>`).join("")}
      </div>
    </div>`;
  };
  // The zoom / locate buttons (Figma: Zoom), for maps that show them; they act on the map named
  SQ.mapZoom = (id) => `<div class="map-zoom" data-for="${esc(id)}">
    <button class="icon-btn s" data-zoom="in" aria-label="Zoom in">${icon("plus")}</button>
    <button class="icon-btn s" data-zoom="out" aria-label="Zoom out">${icon("minus")}</button>
    <button class="icon-btn s" data-zoom="home" aria-label="Back to home">${icon("loc")}</button>
  </div>`;
  SQ.mapLegend = () => `<div class="map-legend"><span><i class="strong"></i>Strong</span><span><i class="close"></i>Close</span><span><i class="low"></i>Worth a look</span></div>`;
  SQ.projMap = proj;

  const Z = [0.45, 3];
  const clampView = (v) => {
    v.z = Math.max(Z[0], Math.min(Z[1], v.z));
    v.x = Math.max(-663, Math.min(1017, v.x));
    v.y = Math.max(-402, Math.min(1132, v.y));
    return v;
  };
  // Place the art and every mark for the current view. Marks stay their own size; only positions scale.
  function paint(el) {
    const v = SQ.u.maps[el.dataset.map];
    const w = el.clientWidth, h = el.clientHeight;
    // The design draws its maps at the Discover map's zoom; smaller maps (onboarding, demand) scale with their width
    const s = v.z * (w / 390);
    const ox = w / 2 - v.x * s, oy = h / 2 - v.y * s;
    el.querySelector(".map-layer").style.transform = `translate(${ox - 663 * s}px, ${oy - 402 * s}px) scale(${s})`;
    for (const m of el.querySelectorAll("[data-mx]")) {
      m.style.transform = `translate(${ox + m.dataset.mx * s}px, ${oy + m.dataset.my * s}px)`;
    }
  }
  function zoomAt(el, factor, cx, cy) {
    const v = SQ.u.maps[el.dataset.map];
    const w = el.clientWidth, h = el.clientHeight, s = v.z * (w / 390);
    // keep the map point under (cx, cy) fixed
    const mx = v.x + (cx - w / 2) / s, my = v.y + (cy - h / 2) / s;
    v.z *= factor;
    clampView(v);
    const s2 = v.z * (w / 390);
    v.x = mx - (cx - w / 2) / s2;
    v.y = my - (cy - h / 2) / s2;
    clampView(v);
    paint(el);
  }

  // After every render: paint each map and wire up drag, wheel and pinch
  SQ.initMaps = (root) => {
    for (const el of root.querySelectorAll(".map[data-map]")) {
      paint(el);
      const pts = new Map();
      let moved = 0, start = null;
      el.addEventListener("pointerdown", (e) => {
        if (e.button) return;
        pts.set(e.pointerId, [e.clientX, e.clientY]);
        moved = 0;
        start = pts.size === 2 ? [...pts.values()] : null;
        el.setPointerCapture(e.pointerId);
        el.classList.add("dragging");
      });
      el.addEventListener("pointermove", (e) => {
        const prev = pts.get(e.pointerId);
        if (!prev) return;
        const v = SQ.u.maps[el.dataset.map];
        const s = v.z * (el.clientWidth / 390);
        if (pts.size === 1) {
          const dx = e.clientX - prev[0], dy = e.clientY - prev[1];
          moved += Math.abs(dx) + Math.abs(dy);
          v.x -= dx / s;
          v.y -= dy / s;
          clampView(v);
          paint(el);
        }
        pts.set(e.pointerId, [e.clientX, e.clientY]);
        if (pts.size === 2 && start) {
          const [a, b] = [...pts.values()];
          const d0 = Math.hypot(start[0][0] - start[1][0], start[0][1] - start[1][1]);
          const d1 = Math.hypot(a[0] - b[0], a[1] - b[1]);
          const r = el.getBoundingClientRect();
          zoomAt(el, d1 / d0, (a[0] + b[0]) / 2 - r.left, (a[1] + b[1]) / 2 - r.top);
          start = [a, b];
          moved = 99;
        }
      });
      const end = (e) => {
        pts.delete(e.pointerId);
        start = null;
        if (!pts.size) el.classList.remove("dragging");
      };
      el.addEventListener("pointerup", end);
      el.addEventListener("pointercancel", end);
      // A drag isn't a tap: don't let it open the pin it ended on
      el.addEventListener("click", (e) => {
        if (moved > 6) {
          e.stopPropagation();
          e.preventDefault();
        }
      }, true);
      el.addEventListener("wheel", (e) => {
        e.preventDefault();
        const r = el.getBoundingClientRect();
        zoomAt(el, Math.exp(-e.deltaY / 400), e.clientX - r.left, e.clientY - r.top);
      }, { passive: false });
      el.addEventListener("dblclick", (e) => {
        const r = el.getBoundingClientRect();
        zoomAt(el, 1.6, e.clientX - r.left, e.clientY - r.top);
      });
    }
    for (const z of root.querySelectorAll(".map-zoom")) {
      const el = root.querySelector(`.map[data-map="${CSS.escape(z.dataset.for)}"]`);
      if (!el) continue;
      z.addEventListener("click", (e) => {
        const b = e.target.closest("[data-zoom]");
        if (!b) return;
        e.stopPropagation();
        const k = b.dataset.zoom;
        if (k === "home") {
          const h = el.querySelector(".map-home");
          const v = SQ.u.maps[el.dataset.map];
          if (h) Object.assign(v, { x: +h.dataset.mx, y: +h.dataset.my });
          v.z = Math.max(v.z, 1);
          paint(el);
        } else zoomAt(el, k === "in" ? 1.5 : 1 / 1.5, el.clientWidth / 2, el.clientHeight / 2);
      });
    }
  };
})();
