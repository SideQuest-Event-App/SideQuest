/* Sketch 2 — the map (Figma: Map, Map pin, Map home, Map legend). A real street map (MapLibre with OpenStreetMap data from
   OpenFreeMap), drawn in the design's map colours with only land, parks, water and streets: no shops, transit or place names.
   The only things on it are ours: Sidequest pins, the Home marker and the design's neighbourhood labels. */
(function () {
  const SQ = window.SQ;
  const { esc, icon } = SQ;

  // Neighbourhood labels (and the areas onboarding can pick); origin is the trip-time start nearest each,
  // and km is roughly how far the area reaches from its centre (drawn as a circle on the areas map)
  const HOODS = [
    ["Ossington", 43.6487, -79.4202, "union", 0.6], ["Kensington", 43.6547, -79.4005, "union", 0.4], ["Queen West", 43.6468, -79.4135, "union", 0.8],
    ["The Annex", 43.6703, -79.4072, "union", 0.9], ["Roncesvalles", 43.6488, -79.4486, "kipling", 0.8], ["Liberty Village", 43.6383, -79.4206, "union", 0.5],
    ["Little Italy", 43.6551, -79.4141, "union", 0.6], ["Chinatown", 43.6531, -79.3977, "union", 0.5], ["Leslieville", 43.6629, -79.3329, "kennedy", 1.0],
    ["Distillery", 43.6503, -79.3596, "union", 0.3], ["Junction", 43.6655, -79.4655, "kipling", 0.8], ["Yorkville", 43.6709, -79.3933, "union", 0.5],
    ["Church St", 43.6656, -79.3807, "union", 0.6], ["Danforth", 43.6787, -79.3497, "kennedy", 1.2], ["Parkdale", 43.6397, -79.4363, "kipling", 0.9],
    ["Dundas West", 43.6512, -79.4316, "union", 0.7], ["St Lawrence", 43.6487, -79.3716, "union", 0.5], ["Harbourfront", 43.6389, -79.3817, "union", 0.9],
  ];
  SQ.HOODS = HOODS;
  const hood = (name) => HOODS.find((h) => h[0] === name);

  // Event pins are violet with a star (and a ring in their match colour); place pins are teal dots. Both are 44px buttons.
  const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.2l2.6 5.5 6 .8-4.4 4.2 1.1 6-5.3-2.9-5.3 2.9 1.1-6L3.4 9.5l6-.8z" fill="currentColor"/></svg>';
  const kindPin = (p, at) => `<button class="map-pin2 ${p.kind === "place" ? "pl" : `ev ${p.tier || "low"}`}${p.selected ? " on" : ""}" data-kind="${p.kind === "place" ? "place" : "event"}" ${at(p.lat, p.lng)} ${p.act ? `data-act="${esc(p.act)}" data-arg="${esc(p.arg)}"` : ""} aria-label="${esc(`${p.kind === "place" ? "Place" : "Event"}: ${p.label || ""}`)}"${p.selected ? ' aria-pressed="true"' : ""}><i>${p.kind === "place" ? "" : STAR}</i></button>`;

  // A pin: { lat, lng, tier: strong|close|low, selected, act, arg, label }. home: a neighbourhood name, or [lat, lng].
  // labels: neighbourhood names to label (true: all of them). Labels sit up and left of their spot, as the design draws them.
  // view: { lat, lng, zoom } at the centre; kept in SQ.u.maps[id] so re-renders and back keep the view.
  // The marks are rendered hidden here; initMaps puts them on the map.
  // circles: [{ lat, lng, km, on }] drawn under the pins, to show how big an area is
  // pins may carry kind: "event" (a violet pin with a star) or "place" (a teal dot); without one they're the match-coloured dots.
  // you: [lat, lng] marks where the person is (already rounded to about 1 km).
  SQ.mapView = (id, { pins = [], home = null, you = null, labels = true, circles = [], view = { lat: 43.6419, lng: -79.3996, zoom: 12.4 }, cls = "", style = "" } = {}) => {
    const maps = (SQ.u.maps = SQ.u.maps || {});
    if (!maps[id]) maps[id] = { ...view };
    const homeLL = typeof home === "string" ? hood(home) && hood(home).slice(1, 3) : home;
    const at = (lat, lng) => `data-lat="${lat}" data-lng="${lng}"`;
    return `<div class="map ${cls}" data-map="${esc(id)}" style="${style}" data-circles="${esc(JSON.stringify(circles))}">
      <div class="map-marks" hidden>
        ${labels ? HOODS.filter((h) => labels === true || labels.includes(h[0])).map(([n, la, ln]) => `<span class="map-label" ${at(la, ln)}>${esc(n)}</span>`).join("") : ""}
        ${homeLL ? `<span class="map-home" ${at(homeLL[0], homeLL[1])}><i>${icon("home2")}</i>Home</span>` : ""}
        ${you ? `<span class="map-you" ${at(you[0], you[1])} aria-hidden="true"><i></i></span>` : ""}
        ${pins.filter((p) => p.lat != null).map((p) => p.kind ? kindPin(p, at) : `<button class="map-pin ${p.tier || "strong"}${p.selected ? " on" : ""}" ${at(p.lat, p.lng)} ${p.act ? `data-act="${esc(p.act)}" data-arg="${esc(p.arg)}"` : ""} aria-label="${esc(p.label || "Pin")}"><i></i></button>`).join("")}
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

  // Only land, parks, water and streets, in the design's colours (the map tokens in styles.css)
  const STYLE = () => {
    const css = getComputedStyle(document.documentElement);
    const c = (n) => css.getPropertyValue(n).trim();
    const width = (lo, hi) => ["interpolate", ["exponential", 1.6], ["zoom"], 11, lo, 17, hi];
    const roads = (id, classes, w) => ({ id, type: "line", source: "osm", "source-layer": "transportation", filter: ["in", ["get", "class"], ["literal", classes]],
      layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": c("--map-street"), "line-width": w } });
    return {
      version: 8,
      sources: { osm: { type: "vector", url: "https://tiles.openfreemap.org/planet", attribution: "© OpenFreeMap © OpenStreetMap" } },
      layers: [
        { id: "land", type: "background", paint: { "background-color": c("--map-land") } },
        { id: "park", type: "fill", source: "osm", "source-layer": "park", paint: { "fill-color": c("--map-park") } },
        { id: "green", type: "fill", source: "osm", "source-layer": "landcover", filter: ["in", ["get", "class"], ["literal", ["grass", "wood"]]], paint: { "fill-color": c("--map-park") } },
        { id: "water", type: "fill", source: "osm", "source-layer": "water", paint: { "fill-color": c("--map-water") } },
        roads("streets", ["minor", "service", "tertiary"], width(0.5, 8)),
        roads("main-streets", ["motorway", "trunk", "primary", "secondary"], width(1.5, 18)),
      ],
    };
  };

  // A circle of km around a spot, as a GeoJSON polygon
  const ring = ({ lat, lng, km, on }) => {
    const dLat = km / 110.574, dLng = km / (111.32 * Math.cos((lat * Math.PI) / 180));
    const pts = Array.from({ length: 49 }, (_, i) => [lng + dLng * Math.cos((i / 48) * 2 * Math.PI), lat + dLat * Math.sin((i / 48) * 2 * Math.PI)]);
    return { type: "Feature", properties: { on }, geometry: { type: "Polygon", coordinates: [pts] } };
  };
  function drawCircles(map, circles) {
    const data = { type: "FeatureCollection", features: circles.map(ring) };
    const src = map.getSource("circles");
    if (src) return src.setData(data);
    const css = getComputedStyle(document.documentElement);
    const color = ["case", ["get", "on"], css.getPropertyValue("--match-strong").trim(), css.getPropertyValue("--match-low").trim()];
    map.addSource("circles", { type: "geojson", data });
    map.addLayer({ id: "circle-fill", type: "fill", source: "circles", paint: { "fill-color": color, "fill-opacity": ["case", ["get", "on"], 0.18, 0.08] } });
    map.addLayer({ id: "circle-line", type: "line", source: "circles", paint: { "line-color": color, "line-width": 1.5, "line-opacity": 0.7 } });
  }

  const live = {}; // map id -> { el, map, marks: [Marker] }
  function placeMarks(m, marks) {
    for (const k of m.marks) k.remove();
    // Every mark's top-left sits on its spot; the CSS margins centre pins and lift labels, as before
    m.marks = marks.map((n) => new maplibregl.Marker({ element: n, anchor: "top-left" }).setLngLat([+n.dataset.lng, +n.dataset.lat]).addTo(m.map));
  }

  // ---------- The light map ----------
  // Pins and labels on a plain land-coloured canvas, placed with the same projection MapLibre uses (Web Mercator,
  // 512px tiles), so they sit where they will once the street map arrives. Drag to pan; the zoom buttons work.
  const world = (lat, lng, zoom) => {
    const size = 512 * 2 ** zoom, s = Math.sin((Math.max(-85, Math.min(85, lat)) * Math.PI) / 180);
    return [((lng + 180) / 360) * size, (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * size];
  };
  function liteMap(ph, id, marks) {
    ph.classList.add("map-lite");
    const layer = document.createElement("div");
    layer.className = "map-lite-layer";
    for (const n of marks) layer.appendChild(n);
    ph.appendChild(layer);
    const m = { lite: true, el: ph, marks };
    m.place = () => {
      const v = SQ.u.maps[id];
      const [cx, cy] = world(v.lat, v.lng, v.zoom);
      const w = ph.clientWidth / 2, h = ph.clientHeight / 2;
      for (const n of marks) {
        const [x, y] = world(+n.dataset.lat, +n.dataset.lng, v.zoom);
        n.style.transform = `translate(${Math.round(w + x - cx)}px, ${Math.round(h + y - cy)}px)`;
      }
    };
    // Drag the map (not a pin) to pan
    const down = (e) => {
      if (e.button || e.target.closest("button, a")) return;
      const v = SQ.u.maps[id];
      const [x0, y0] = world(v.lat, v.lng, v.zoom), px = e.clientX, py = e.clientY, size = 512 * 2 ** v.zoom;
      const move = (ev) => {
        const x = x0 - (ev.clientX - px), y = y0 - (ev.clientY - py);
        v.lng = (x / size) * 360 - 180;
        v.lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / size))) * 180) / Math.PI;
        m.place();
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", () => window.removeEventListener("pointermove", move), { once: true });
    };
    ph.addEventListener("pointerdown", down);
    const ro = window.ResizeObserver ? new ResizeObserver(() => m.place()) : null;
    if (ro) ro.observe(ph);
    m.stop = () => ro && ro.disconnect();
    m.place();
    return m;
  }

  // Where a map is looking now, and moving it (the launch map re-centres on "Use my location")
  SQ.mapCenter = (id) => {
    const m = live[id];
    if (m && !m.lite) return { lat: m.map.getCenter().lat, lng: m.map.getCenter().lng, zoom: m.map.getZoom() };
    return SQ.u.maps && SQ.u.maps[id] ? { ...SQ.u.maps[id] } : null;
  };
  SQ.mapJump = (id, view) => {
    const maps = (SQ.u.maps = SQ.u.maps || {});
    maps[id] = { ...(maps[id] || {}), ...view };
    const m = live[id];
    if (!m) return;
    if (m.lite) m.place();
    else m.map.jumpTo({ center: [maps[id].lng, maps[id].lat], zoom: maps[id].zoom });
  };
  // MapLibre loads in the background (so it never holds up the first screen); once it's here, maps upgrade
  SQ.mapsReady = () => {
    if (SQ.d && SQ.render) SQ.render();
  };

  // After every render: put each map in place. A map that was on the last render keeps its canvas (no flash, no reload).
  SQ.initMaps = (root) => {
    for (const ph of root.querySelectorAll(".map[data-map]")) {
      const id = ph.dataset.map;
      const box = ph.querySelector(".map-marks");
      const marks = [...box.children];
      box.remove();
      let m = live[id];
      // Until MapLibre has loaded (it loads in the background), or when it can't load at all, a light map stands in
      if (!window.maplibregl) {
        if (m && !m.lite) m.map.remove();
        live[id] = liteMap(ph, id, marks);
        continue;
      }
      if (m && m.lite) {
        m.stop();
        m = null;
      }
      if (m && !m.el.isConnected) {
        m.el.className = ph.className;
        m.el.style.cssText = ph.style.cssText;
        ph.replaceWith(m.el);
        const v = { ...SQ.u.maps[id] }; // resize() fires moveend, which would save the old centre over it
        m.map.resize();
        m.map.jumpTo({ center: [v.lng, v.lat], zoom: v.zoom });
      } else {
        if (m) m.map.remove();
        const v = SQ.u.maps[id];
        const map = new maplibregl.Map({ container: ph, style: STYLE(), center: [v.lng, v.lat], zoom: v.zoom, minZoom: 9, maxZoom: 18,
          dragRotate: false, pitchWithRotate: false, touchPitch: false, attributionControl: { compact: true } });
        map.touchZoomRotate.disableRotation();
        // The map credit (OpenStreetMap's licence asks for it) stays folded into a small "i" button instead of a banner
        const fold = () => ph.querySelectorAll(".maplibregl-compact-show").forEach((x) => x.classList.remove("maplibregl-compact-show"));
        fold();
        map.once("load", fold);
        map.on("moveend", () => Object.assign(SQ.u.maps[id], { lng: map.getCenter().lng, lat: map.getCenter().lat, zoom: map.getZoom() }));
        m = live[id] = { el: ph, map, marks: [], styled: false, circles: [] };
        // Circles can only go on once the style is in; whatever was asked for last is drawn then
        map.once("style.load", () => {
          m.styled = true;
          if (m.circles.length) drawCircles(map, m.circles);
        });
      }
      placeMarks(m, marks);
      m.circles = JSON.parse(ph.dataset.circles || "[]");
      if (m.styled && (m.circles.length || m.map.getSource("circles"))) drawCircles(m.map, m.circles);
    }
    // Maps no longer on screen let go of their WebGL context
    for (const id in live) if (!live[id].el.isConnected) {
      if (live[id].lite) live[id].stop();
      else live[id].map.remove();
      delete live[id];
    }
    for (const z of root.querySelectorAll(".map-zoom")) {
      const m = live[z.dataset.for];
      if (!m) continue;
      z.addEventListener("click", (e) => {
        const b = e.target.closest("[data-zoom]");
        if (!b) return;
        e.stopPropagation();
        const k = b.dataset.zoom;
        if (k === "locate") return; // the launch map's "Use my location" (an action, not a view change)
        if (m.lite) {
          const v = SQ.u.maps[z.dataset.for];
          if (k === "home") {
            const h = m.el.querySelector(".map-you, .map-home");
            if (h) Object.assign(v, { lat: +h.dataset.lat, lng: +h.dataset.lng });
          } else v.zoom = Math.max(9, Math.min(18, v.zoom + (k === "in" ? 1 : -1)));
          return m.place();
        }
        if (k === "in") m.map.zoomIn();
        else if (k === "out") m.map.zoomOut();
        else {
          const h = m.el.querySelector(".map-you, .map-home");
          const at = h ? [+h.dataset.lng, +h.dataset.lat] : m.map.getCenter();
          m.map.flyTo({ center: at, zoom: Math.max(m.map.getZoom(), 12.4) });
        }
      });
    }
  };
})();
