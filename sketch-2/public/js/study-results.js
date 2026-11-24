// Study results (/study/results): the summary from /api/sk/study/summary, plus the CSV downloads.
// Needs the study key. Shows numbers only: no names, transcripts or private answers exist in the data.
(() => {
  const out = document.getElementById("out");
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const fmt = (v) => (v == null ? "–" : String(v));
  const keyInput = document.getElementById("key");
  try { keyInput.value = sessionStorage.getItem("study:key") || ""; } catch {}

  function armTable(title, arms) {
    const rows = [["Calls", "calls"], ["Reached picks", "reached_picks"], ["Mean seconds to picks", "mean_secs_to_picks"], ["Mean questions asked", "mean_questions"], ["Picks accepted (share)", "accepted_rate"], ["Chose “lead” at check-in (share)", "lead_rate"], ["Felt natural (1–5)", "natural"], ["Helped us decide (1–5)", "decide"], ["Trust the picks (1–5)", "trust"], ["Would use again (1–5)", "again"]];
    return `<section class="fact"><h2>${esc(title)}</h2><div class="wrap"><table class="tbl"><thead><tr><th></th><th>A · ${esc(arms.A.persona)}</th><th>B · ${esc(arms.B.persona)}</th></tr></thead><tbody>
      ${rows.map(([label, k]) => `<tr><td>${esc(label)}</td><td>${esc(fmt(arms.A[k]))}</td><td>${esc(fmt(arms.B[k]))}</td></tr>`).join("")}</tbody></table></div></section>`;
  }

  async function load(key) {
    out.innerHTML = '<p class="muted">Loading…</p>';
    const res = await fetch(`/api/sk/study/summary?key=${encodeURIComponent(key)}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { out.innerHTML = `<p class="note">${esc(data.error || "Couldn't load the results.")}</p>`; return; }
    try { sessionStorage.setItem("study:key", key); } catch {}
    const p = data.preference;
    const o = data.order_check;
    const k = encodeURIComponent(key);
    out.innerHTML = `
      <section class="fact"><h2>Assignment</h2><p class="muted">${data.sessions} crews assigned: ${data.assigned.AB} AB (Concierge first), ${data.assigned.BA} BA (Friend first).</p></section>
      ${armTable("Call 1: the main comparison (first exposure only)", data.first_call)}
      <section class="fact"><h2>Which voice would you keep?</h2>
        <p class="muted">${p.testers} testers: ${p.keep_A} kept A (concierge), ${p.keep_B} kept B (friend). Exact binomial test against 50/50: p = ${fmt(p.p_value)}. Mean ease (SEQ, 1–7): ${fmt(p.mean_seq)}.</p></section>
      <section class="fact"><h2>Order check</h2>
        <p class="muted">${o.kept_first_heard} kept the voice they heard first, ${o.kept_second_heard} the second (p = ${fmt(o.p_value)}). Kept A: ${o.keep_A_when_AB} of ${o.testers_AB} when A came first, ${o.keep_A_when_BA} of ${o.testers_BA} when A came second.</p></section>
      ${armTable("Call 2 (short, after hearing the other voice; a check, not the main result)", data.second_call)}
      <section class="fact"><h2>Downloads</h2><div class="btns">
        <a class="btn out" href="/api/sk/study/export?key=${k}">Calls (CSV, one row per call)</a>
        <a class="btn out" href="/api/sk/study/export?key=${k}&table=preferences">Preferences (CSV, one row per tester)</a></div></section>`;
  }
  document.getElementById("keyForm").addEventListener("submit", (e) => { e.preventDefault(); if (keyInput.value) load(keyInput.value); });
  if (keyInput.value) load(keyInput.value);
})();
