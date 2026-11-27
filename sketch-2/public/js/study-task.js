// The voice study's task bar (public/study.html starts a task; see lib/sidekick/study.js). While a task runs, this tab
// keeps sessionStorage["sq2.studyTask"] = { sid, n, title, flags } and every app screen shows a pinned bar:
// "Task N of 5 · <title>", with I'm stuck and I'm done. The bar sets --sq-top to its height, so every screen starts
// below it and nothing (back buttons included) sits under it. The app reports what happens (app.js: every change
// through SQ.act and every screen drawn; launch.js: the Discover sheet's height and a place's card) and the bar
// checks each task's goal:
//   1 Find something to do   open an event, then save it
//   2 Explore the event page (its two questions, on the checklist, are the check)
//   3 Use the map            the sheet down to the map's height, and a place's card opened
//   4 Check your profile     Your taste opened, and one thing in it changed
//   5 Try Squads             a message in a squad's chat, and a new squad made
// A goal met shows "Nice, done" and goes back to the checklist; I'm done records "self", I'm stuck "stuck".
// Only the outcome goes to the server (it times the task from Start): never what was searched, saved or written.
(function () {
  const SQ = window.SQ;
  const KEY = "sq2.studyTask";
  const TOTAL = 5;
  const read = () => {
    try {
      const v = JSON.parse(sessionStorage.getItem(KEY));
      return v && /^[\w-]{4,80}$/.test(v.sid || "") && v.n >= 1 && v.n <= TOTAL ? v : null;
    } catch {
      return null;
    }
  };
  const write = (v) => {
    try {
      if (v) sessionStorage.setItem(KEY, JSON.stringify(v));
      else sessionStorage.removeItem(KEY);
    } catch {}
  };
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const tidOf = (sid) => {
    try {
      return JSON.parse(localStorage.getItem(`study:${sid}:tid`));
    } catch {
      return null;
    }
  };

  let finishing = false;
  let doneShown = false;
  async function record(task, outcome, extra) {
    const res = await fetch(`/api/sk/study/${encodeURIComponent(task.sid)}/task`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ t: tidOf(task.sid), n: task.n, outcome, ...extra }),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Couldn't save that. Try again.");
  }
  const toChecklist = (task) => {
    write(null);
    location.href = `/study?s=${encodeURIComponent(task.sid)}#task${task.n}`;
  };
  async function finish(outcome, extra = {}) {
    const task = read();
    if (!task || finishing) return;
    finishing = true;
    try {
      await record(task, outcome, extra);
    } catch (err) {
      finishing = false;
      if (SQ.toast) SQ.toast(err.message);
      return;
    }
    if (outcome !== "auto") return toChecklist(task);
    doneShown = true;
    paint();
    setTimeout(() => toChecklist(task), 1300);
  }

  // ---------- Goals ----------
  const GOAL = {
    1: (f) => f.saved != null,
    3: (f) => f.mapped && f.place,
    4: (f) => f.taste && f.edit,
    5: (f) => f.chat && f.squad,
  };
  function update(change) {
    const task = read();
    if (!task || finishing) return;
    const f = (task.flags = task.flags || {});
    change(f, task);
    write(task);
    if (GOAL[task.n] && GOAL[task.n](f)) finish("auto", task.n === 1 ? { eventId: f.saved } : {});
  }
  const TASTE_EDIT = /^(taste(?!Undo|FreshUndo)[A-Z]\w*|setTaste|retuneDone)$/;

  SQ.studyTask = {
    current: read,
    // A change that went through (app.js)
    act(type, args, result) {
      update((f, task) => {
        if (task.n === 1 && type === "save" && result && result.saved && (SQ.u.screen === "quest" || (f.opened || []).includes(Number(args.eventId)))) f.saved = Number(args.eventId);
        if (task.n === 4 && f.taste && TASTE_EDIT.test(type)) f.edit = true;
        if (task.n === 5 && type === "partyChat") f.chat = true;
        if (task.n === 5 && type === "createSquad" && result && result.squadId) f.squad = true;
      });
    },
    // A screen drawn (app.js)
    screen(id) {
      update((f, task) => {
        if (task.n === 1 && id === "quest" && SQ.u.quest != null) f.opened = [...new Set([...(f.opened || []), Number(SQ.u.quest)])];
        if (task.n === 3 && id === "discover" && !f.looked) {
          f.looked = true; // already at the map's height when the task began counts as there
          if (SQ.lx && SQ.lx.state().stop === "peek") f.mapped = true;
        }
        if (task.n === 4 && (id === "taste" || id === "taste-edit")) f.taste = true;
      });
      paint();
    },
    // The Discover sheet moved by the tester, or a place's card opened (launch.js)
    signal(what, value) {
      update((f, task) => {
        if (task.n !== 3) return;
        if (what === "sheet") f.mapped = f.mapped || value === "peek";
        if (what === "place") f.place = true;
      });
    },
  };

  // ---------- The bar ----------
  function paint() {
    const task = read();
    const phone = document.getElementById("phone");
    const screenEl = document.getElementById("screen");
    if (!phone || !screenEl) return;
    let bar = document.getElementById("task-bar");
    if (!task && !doneShown) {
      if (bar) {
        bar.remove();
        document.documentElement.style.removeProperty("--sq-top");
        const sb = document.getElementById("study-bar");
        if (sb && SQ.studyId && SQ.studyId()) { sb.hidden = false; phone.classList.add("studying"); }
      }
      return;
    }
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "task-bar";
      bar.className = "task-bar";
      bar.setAttribute("role", "region");
      bar.setAttribute("aria-label", "Study task");
      phone.insertBefore(bar, screenEl);
      bar.addEventListener("click", (e) => {
        const b = e.target.closest("[data-task]");
        if (!b || b.disabled) return;
        b.disabled = true;
        finish(b.dataset.task === "stuck" ? "stuck" : "self").finally(() => { b.disabled = false; });
      });
    }
    // The task bar takes the study bar's place, and pushes every screen down by its height
    const sb = document.getElementById("study-bar");
    if (sb) sb.hidden = true;
    phone.classList.remove("studying");
    const html = doneShown
      ? `<div class="tk-t" role="status"><span class="tk-n ok">Task ${task ? task.n : ""} of ${TOTAL}</span><b class="tk-ok">Nice, done</b></div><span class="tk-go">Back to your checklist…</span>`
      : `<div class="tk-t"><span class="tk-n">Task ${task.n} of ${TOTAL}<span class="sr-only"> · </span></span><b>${esc(task.title)}</b></div>
        <button type="button" class="tk-b" data-task="stuck">I'm stuck</button>
        <button type="button" class="tk-b pri" data-task="done">I'm done</button>`;
    if (bar.dataset.html !== html) {
      bar.innerHTML = html;
      bar.dataset.html = html;
    }
    document.documentElement.style.setProperty("--sq-top", `${Math.ceil(bar.getBoundingClientRect().height)}px`);
  }
  window.addEventListener("resize", paint);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", paint);
  else paint();
})();
