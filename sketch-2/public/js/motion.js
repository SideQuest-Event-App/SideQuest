/* Sketch 2 — motion and loading, one set of rules for every screen (design AN2 "Loading and motion for every page").
   - Three durations: 150 ms (tabs, fades, button labels), 250 ms (screens sliding, sheets), 400 ms (the loader
     hand-off, picks arriving). Ease-out entering, ease-in leaving. The same tokens are on :root in styles.css.
   - Waits: nothing under 300 ms, skeletons after 300 ms, a message after 1 s, progress after 10 s (SQ.waiting).
   - Tabs crossfade (150 ms, no slide); pushed screens slide in from the right (250 ms); Back reverses it (SQ.navMotion).
   - Buttons that wait change their label in place and keep their size (SQ.pendingButton).
   - Errors: a plain sentence and "Try again" in place of the content (SQ.errorBlock).
   Only opacity, transform and filter move, with will-change on the moving layer while it moves. Reduced motion:
   crossfades only. Every animation can be finished at once, so a tap is never blocked by one. */
(function () {
  const SQ = window.SQ;
  const FAST = 150, BASE = 250, SLOW = 400;
  const OUT = "cubic-bezier(0.23, 1, 0.32, 1)", IN = "cubic-bezier(0.55, 0, 1, 0.45)", INOUT = "cubic-bezier(0.65, 0, 0.35, 1)";
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.dataset.motion === "reduce"; // or Settings > Display > Reduce motion

  // el.animate, with will-change on while it runs, and the end state kept. Returns the Animation (or null).
  function play(el, frames, opts) {
    if (!el || !el.animate) return null;
    const props = [...new Set(frames.flatMap((f) => Object.keys(f)).filter((k) => k !== "offset" && k !== "easing"))];
    el.style.willChange = props.map((p) => (p === "transform" || p === "opacity" || p === "filter" ? p : "")).filter(Boolean).join(", ");
    const a = el.animate(frames, { fill: "both", ...opts });
    const clear = () => { el.style.willChange = ""; };
    a.finished.then(clear, clear);
    return a;
  }
  SQ.motion = { FAST, BASE, SLOW, OUT, IN, INOUT, reduced, play };

  // ---------- Moving between screens ----------
  // A copy of the screen being left stays on top (or underneath, for a push) while it moves, then goes away.
  // The real screen is already the new one, so taps land on it straight away.
  let ghost = null, anims = [];
  function settle() {
    for (const a of anims) try { a.finish(); } catch {}
    anims = [];
    if (ghost) ghost.remove();
    ghost = null;
  }
  SQ.navSettle = settle;
  // Call before the screen is re-drawn: keeps a copy of what's showing now
  SQ.navSnapshot = (screenEl) => {
    settle();
    const old = screenEl.firstElementChild;
    if (!old) return null;
    const g = old.cloneNode(true);
    g.querySelectorAll("[id]").forEach((n) => n.removeAttribute("id"));
    g.querySelectorAll("canvas").forEach((c) => { c.style.visibility = "hidden"; }); // a copied map canvas is blank anyway
    const scroll = old.querySelector(".scroll");
    return { node: g, top: scroll ? scroll.scrollTop : 0 };
  };
  // kind: "fade" (tabs) | "push" (into an event, a party, a quest) | "back" (the push, reversed)
  SQ.navMotion = (screenEl, snap, kind) => {
    if (!snap || !kind) return;
    if (reduced()) kind = "fade";
    const g = (ghost = document.createElement("div"));
    g.className = `nav-ghost ${kind}`;
    g.setAttribute("aria-hidden", "true");
    g.inert = true;
    g.style.cssText = `top:${screenEl.offsetTop}px;left:${screenEl.offsetLeft}px;width:${screenEl.offsetWidth}px;height:${screenEl.offsetHeight}px`;
    g.appendChild(snap.node);
    screenEl.after(g);
    const s = snap.node.querySelector(".scroll");
    if (s) s.scrollTop = snap.top;
    const done = () => { if (ghost === g) settle(); };
    if (kind === "fade") anims = [play(g, [{ opacity: 1 }, { opacity: 0 }], { duration: FAST, easing: IN })];
    else if (kind === "back") anims = [play(g, [{ transform: "translateX(0)" }, { transform: "translateX(100%)" }], { duration: BASE, easing: IN })];
    else {
      const first = screenEl.firstElementChild;
      anims = [play(first, [{ transform: "translateX(100%)" }, { transform: "translateX(0)" }], { duration: BASE, easing: OUT, fill: "none" })]; // at rest it has no transform at all
    }
    anims = anims.filter(Boolean);
    if (!anims.length) return done();
    anims[0].finished.then(done, done);
  };

  // ---------- Waits ----------
  // Rendered in place of content that's on its way. since: when the wait began (Date.now()), so a re-render mid-wait
  // carries on from where it was instead of starting the clock again. Before 300 ms nothing shows (most answers are
  // back by then); then the skeleton (grey shapes in the real layout); a message at 1 s; progress at 10 s.
  SQ.waiting = (since, { skeleton = "", message = "", slow = "Still working. This can take up to a minute." } = {}) => {
    const t = Math.max(0, Date.now() - (since || Date.now()));
    const at = (ms) => `style="animation-delay:${ms - t}ms"`;
    return `<div class="wait" role="status" aria-live="polite">
      ${message ? `<p class="wait-msg" ${at(1000)}>${SQ.esc(message)}</p>` : ""}
      <div class="wait-sk" ${at(300)} aria-hidden="true">${skeleton}</div>
      <div class="wait-slow" ${at(10000)}><span>${SQ.esc(slow)}</span><span class="wait-bar"><i></i></span></div>
    </div>`;
  };
  const delay = (since, ms) => `animation-delay:${ms - Math.max(0, Date.now() - (since || Date.now()))}ms`;
  const line = (w, h = 12) => `<span class="sk" style="width:${w};height:${h}px"></span>`;
  SQ.sk = {
    line,
    // A list of rows shaped like the real ones: a square poster, a title and a meta line
    rows: (n = 5) => Array.from({ length: n }, (_, i) => `<div class="sk-row"><span class="sk sk-poster"></span><span class="sk-text">${line(`${72 - (i % 3) * 12}%`, 16)}${line(`${48 - (i % 2) * 10}%`)}</span></div>`).join(""),
    // Shown only once a wait passes 300 ms (since: when it began)
    after: (since, html, ms = 300) => `<div class="sk-after" style="${delay(since, ms)}" aria-hidden="true">${html}</div>`,
    // Cards for the map's sheet, each shown once the wait passes 300 ms
    cards: (n = 2, since) => Array.from({ length: n }, () => `<div class="sk-card sk-after" style="${delay(since, 300)}" aria-hidden="true">${line("38%", 20)}${line("80%", 16)}${line("56%")}${line("44%")}</div>`).join(""),
  };

  // ---------- When something fails ----------
  // A plain sentence and a way to try again, in place of the content. It never blames the person; whatever they
  // typed stays where it is (it lives in SQ.u, not in this block).
  SQ.errorBlock = (title, sentence, act, arg) => `<div class="err-block" role="alert">
      <p class="err-t">${SQ.esc(title)}</p>
      <p class="err-s">${SQ.esc(sentence)}</p>
      <button class="btn btn-outline m err-retry" data-act="${SQ.esc(act)}"${arg != null ? ` data-arg="${SQ.esc(arg)}"` : ""}>Try again</button>
    </div>`;

  // ---------- Buttons that wait ----------
  // <button data-pending="Joining" data-done="You're in">: while its action runs the label reads "Joining" with three
  // soft dots, then "✓ You're in" for a moment. The button's width is fixed first, so nothing around it moves.
  SQ.pendingButton = (el) => {
    const pend = el && el.dataset && el.dataset.pending;
    if (!pend) return null;
    const r = el.getBoundingClientRect();
    const was = { html: el.innerHTML, width: el.style.width, label: el.getAttribute("aria-label") };
    el.style.width = `${r.width}px`;
    el.classList.add("is-pending");
    el.setAttribute("aria-busy", "true");
    el.setAttribute("aria-label", `${pend}…`);
    el.innerHTML = `<span class="pend-l">${SQ.esc(pend)}</span><span class="pend-dots" aria-hidden="true"><i></i><i></i><i></i></span>`;
    return {
      async done(ok) {
        el.removeAttribute("aria-busy");
        if (ok && el.dataset.done && el.isConnected) {
          el.classList.remove("is-pending");
          el.classList.add("is-done");
          el.setAttribute("aria-label", el.dataset.done);
          el.innerHTML = `${SQ.icon("check")}<span>${SQ.esc(el.dataset.done)}</span>`;
          await new Promise((r) => setTimeout(r, 700));
          return;
        }
        el.classList.remove("is-pending");
        el.innerHTML = was.html;
        el.style.width = was.width;
        if (was.label == null) el.removeAttribute("aria-label");
        else el.setAttribute("aria-label", was.label);
      },
    };
  };

  // ---------- Pins arriving on the map ----------
  // The streets show first; each pin fades in the first time it appears (400 ms), not on every re-draw.
  const seen = new Set();
  SQ.pinsArrive = (root, skip) => {
    for (const p of root.querySelectorAll(".map-pin2")) {
      const k = p.dataset.arg || `${p.dataset.lat},${p.dataset.lng}`;
      if (seen.has(k)) continue;
      seen.add(k);
      if (!skip) play(p.querySelector("i"), [{ opacity: 0 }, { opacity: 1 }], { duration: SLOW, easing: OUT });
    }
  };
})();
