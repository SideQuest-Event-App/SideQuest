/* Sketch 2 — the opening: city-lights loader -> "Are you demoing SideQuest or testing it?" -> into the app.
   Designs FL1 (mobile), FL2 (desktop) and AN1 option C, "Zoom into the city".
   - The question is asked on every fresh visit (a new tab or session), on the loader's own lights: the headline
     fades up and out (150 ms), then the question rises 12 px into place (300 ms). The lights never reload.
   - Demoing: the card lifts a little, the question fades, the lights grow (2.2x) and sharpen while the map fades in
     underneath, and the map's real event and place pins fly from the glows into their spots. About 1.1 s, ease-in-out.
     It always signs into the demo account, even over a stale session.
   - Testing: the same zoom, then the study checklist at /study, whose rows fade in.
   - A tap or a key press during any of it jumps to the end. Reduced motion: crossfades only.
   The stage is the loader's own element (#boot); "Switch to demo / testing" brings a fresh one up over the app. */
(function () {
  const SQ = window.SQ;
  const M = () => SQ.motion;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let stage = null, running = [], skipping = false, phase = null; // phase: "rise" | "zoom" | null

  // Every animation of the current step goes through here, so a tap can finish them all at once
  function anim(el, frames, opts) {
    const a = M().play(el, frames, { ...opts, duration: skipping ? 0 : opts.duration, delay: skipping ? 0 : opts.delay || 0 });
    if (a) running.push(a);
    return a;
  }
  const ended = (list) => Promise.all(list.filter(Boolean).map((a) => a.finished.catch(() => {})));
  function finishAll() {
    skipping = true;
    for (const a of running) try { a.finish(); } catch {}
    running = [];
  }
  const wait = (ms) => (skipping ? Promise.resolve() : new Promise((r) => { const t = setTimeout(r, ms); waits.push([t, r]); }));
  let waits = [];
  function skip() {
    finishAll();
    for (const [t, r] of waits) { clearTimeout(t); r(); }
    waits = [];
  }

  const QUESTION = `<div class="b-q" role="region" aria-labelledby="mode-h">
      <span class="mode-wm">sidequest</span>
      <h1 class="mode-h" id="mode-h" tabindex="-1">Are you demoing SideQuest or testing it?</h1>
      <div class="mode-picks">
        <button type="button" class="mode-pick pri" data-pick="demo"><span class="mode-t">Demoing</span><span class="mode-s">Go straight into the full app: the map, Plan with Sidekick, and sample friends.</span></button>
        <button type="button" class="mode-pick" data-pick="test"><span class="mode-t">Testing</span><span class="mode-s">Take part in the Sidekick voice study. A short checklist walks you through it.</span></button>
      </div>
      <p class="mode-note">Asked once per visit.</p>
    </div>
    <p class="b-wait" role="status" aria-live="polite"></p>`;

  function makeStage() {
    const b = window.SQboot && window.SQboot.hold();
    if (b) return b;
    // A fresh stage over the app (after "Switch to demo / testing"): the same lights, faded in
    const s = document.createElement("div");
    s.id = "boot";
    s.innerHTML = '<div class="b-lights"></div>';
    document.body.appendChild(s);
    anim(s, [{ opacity: 0 }, { opacity: 1 }], { duration: M().FAST, easing: M().OUT });
    return s;
  }

  // ---------- The question ----------
  async function ask() {
    if (stage && stage.isConnected) return;
    skipping = false;
    running = [];
    stage = makeStage();
    stage.removeAttribute("role");
    stage.removeAttribute("aria-live");
    stage.removeAttribute("aria-label");
    stage.classList.remove("out");
    stage.classList.add("asking");
    stage.insertAdjacentHTML("beforeend", QUESTION);
    const q = stage.querySelector(".b-q"), head = stage.querySelector(".b-in");
    q.style.opacity = "0";
    stage.addEventListener("pointerdown", () => { if (phase) skip(); }, true);
    stage.addEventListener("keydown", (e) => { if (phase && e.key !== "Tab") skip(); }, true);
    stage.addEventListener("click", (e) => {
      const b = e.target.closest("[data-pick]");
      if (b) pick(b.dataset.pick);
      const r = e.target.closest("[data-retry]");
      if (r) pick(r.dataset.retry);
    });
    phase = "rise";
    const still = M().reduced();
    if (head) {
      await ended([anim(head, still ? [{ opacity: 1 }, { opacity: 0 }] : [{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateY(-8px)" }], { duration: M().FAST, easing: M().IN })]);
      head.remove();
    }
    q.style.opacity = "";
    q.querySelector(".mode-h").focus({ preventScroll: true });
    await ended([anim(q, still ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, transform: "translateY(12px)" }, { opacity: 1, transform: "none" }], { duration: 300, easing: M().OUT })]);
    if (phase === "rise") phase = null;
  }

  // ---------- A choice: zoom into the city ----------
  let picking = false;
  async function pick(kind) {
    if (picking || !stage) return;
    picking = true;
    skip();
    skipping = false;
    phase = "zoom";
    SQ.mode.set(kind);
    const still = M().reduced();
    const q = stage.querySelector(".b-q"), lights = stage.querySelector(".b-lights"), msg = stage.querySelector(".b-wait");
    const card = q && q.querySelector(`[data-pick="${kind}"]`);
    stage.querySelector(".err-block") && stage.querySelector(".err-block").remove();
    msg.textContent = "";
    if (q) q.style.pointerEvents = "none";
    if (card && !still) anim(card, [{ transform: "none" }, { transform: "translateY(-2px) scale(1.02)" }], { duration: M().FAST, easing: M().OUT });
    if (q) anim(q, [{ opacity: 1 }, { opacity: 0 }], { duration: still ? M().FAST : 200, delay: still ? 0 : 80, easing: M().IN });
    // The lights grow and sharpen: transform and filter only, on their own layer
    if (!still) anim(lights, [{ transform: "scale(1)", filter: "blur(4px) saturate(1)" }, { transform: "scale(2.2)", filter: "blur(0px) saturate(1.3)" }], { duration: 760, easing: M().INOUT });

    if (kind === "test") {
      try { sessionStorage.setItem("sq2.arrive", "zoom"); } catch {}
      const veil = document.createElement("div");
      veil.className = "b-veil";
      stage.appendChild(veil);
      anim(veil, [{ opacity: 0 }, { opacity: 1 }], { duration: still ? M().FAST : M().SLOW, delay: still ? M().FAST : 360, easing: M().INOUT });
      await wait(still ? 300 : 760);
      location.href = "/study";
      return;
    }

    // Demoing: sign in (always), and put the map underneath while the lights grow. A message only after 1 s.
    const slowMsg = setTimeout(() => { msg.textContent = "Opening the demo…"; msg.classList.add("on"); }, 1000);
    try {
      await Promise.all([SQ.opening.enterDemo(), wait(still ? M().FAST : 340)]);
    } catch (err) {
      clearTimeout(slowMsg);
      return failed(q, lights, msg);
    }
    clearTimeout(slowMsg);
    msg.classList.remove("on");
    // The hand-off: the stage fades to the map while each pin flies from the nearest glow into its spot
    const list = [anim(stage, [{ opacity: 1 }, { opacity: 0 }], { duration: still ? M().BASE : 480, delay: still ? 0 : 40, easing: M().INOUT })];
    if (!still) list.push(...flyPins(lights));
    await ended(list);
    finish();
  }

  // Where the three glows are now (they grow with the lights), in window pixels
  function glows(lights) {
    const r = stage.getBoundingClientRect();
    let s = 1;
    try { s = new DOMMatrixReadOnly(getComputedStyle(lights).transform).a || 1; } catch {}
    const clamp = (v) => Math.max(0.06, Math.min(0.94, v));
    return [[0.75, 0.3], [0.85, 0.65], [0.3, 0.75]].map(([x, y]) => [r.left + r.width * clamp(0.6 + (x - 0.6) * s), r.top + r.height * clamp(0.45 + (y - 0.45) * s)]);
  }
  function flyPins(lights) {
    const g = glows(lights);
    const out = [];
    for (const i of document.querySelectorAll("#screen .map-pin2 > i")) {
      const p = i.getBoundingClientRect();
      if (!p.width || p.bottom < 0 || p.top > innerHeight || p.right < 0 || p.left > innerWidth) continue;
      const cx = p.left + p.width / 2, cy = p.top + p.height / 2;
      const [gx, gy] = g.reduce((a, b) => (Math.hypot(b[0] - cx, b[1] - cy) < Math.hypot(a[0] - cx, a[1] - cy) ? b : a));
      out.push(anim(i, [{ opacity: 0, transform: `translate(${Math.round(gx - cx)}px, ${Math.round(gy - cy)}px) scale(2.4)` }, { opacity: 1, offset: 0.35 }, { opacity: 1, transform: "none" }], { duration: 740, easing: M().INOUT, fill: "backwards" }));
    }
    return out;
  }

  function failed(q, lights, msg) {
    for (const a of running) try { a.cancel(); } catch {}
    running = [];
    phase = null;
    picking = false;
    msg.textContent = "";
    if (q) { q.style.pointerEvents = ""; q.style.opacity = "0"; }
    stage.insertAdjacentHTML("beforeend", `<div class="err-block b-err" role="alert"><p class="err-t">Couldn't open the demo just now.</p><p class="err-s">Sidequest may still be waking up. Give it a moment.</p><button type="button" class="btn btn-outline m err-retry" data-retry="demo">Try again</button></div>`);
    stage.querySelector(".err-retry").focus({ preventScroll: true });
  }

  function finish() {
    running = [];
    phase = null;
    picking = false;
    if (stage) stage.remove();
    stage = null;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = "#13101b";
    const s = document.getElementById("screen");
    if (s) s.focus({ preventScroll: true });
  }

  SQ.opening = {
    ask,
    active: () => !!(stage && stage.isConnected),
    phase: () => phase,
    skip,
    // Into the demo account, on the map. Set by app.js (it owns sign-in and navigation).
    enterDemo: async () => { throw new Error("not ready"); },
  };
})();
