#!/usr/bin/env node
// Runs the test files of sketch-2 and events/ (the importer) in parallel, each worker in its own copy of the folders,
// because many tests write data/db.json (and other files under data/) and put it back afterwards.
//
//   node sketch-2/test/run.js              every test file, 3 at a time
//   node sketch-2/test/run.js --quick      the fast ones only (no browser, under ~20 s each): run after every change
//   node sketch-2/test/run.js --changed    only the files mapped to what changed against origin/main (or --base <ref>)
//   node sketch-2/test/run.js --only call-ui.e2e,picks-eval
//   options: -j <n> workers (default: CPUs - 1, at most 3) · --base <git ref> · --keep (leave the copies and logs)
//
// Prints one line per file and the failing file's last lines; exits 1 if any file fails. Timings are kept in
// test/.timings.json (not committed) so the slowest files start first.

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn, execSync } = require("child_process");

const S2 = path.join(__dirname, "..");
const REPO = path.join(S2, "..");
const HELPERS = new Set(["fake-supabase"]); // modules other tests require, not tests
// Tests that measure real time (a 300 ms window, a 3 s line) run on their own after the rest, so a busy CPU can't fail them
const ALONE = new Set(["sketch-2/sidekick-thinking", "sketch-2/sidekick-tts", "sketch-2/launch.e2e"]);
const TIMINGS = path.join(__dirname, ".timings.json");
const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const opt = (f, d) => { const i = args.indexOf(f); return i >= 0 && args[i + 1] ? args[i + 1] : d; };

function allTests() {
  const out = [];
  for (const dir of ["sketch-2", "events"]) {
    const t = path.join(REPO, dir, "test");
    if (!fs.existsSync(t)) continue;
    for (const f of fs.readdirSync(t).sort()) {
      if (!f.endsWith(".js") || f === "run.js") continue;
      const name = f.replace(/\.js$/, "");
      if (HELPERS.has(name)) continue;
      out.push({ dir, name, file: `test/${f}`, browser: /require\(["']playwright["']\)/.test(fs.readFileSync(path.join(t, f), "utf8")) });
    }
  }
  return out;
}

let timings = {};
try { timings = JSON.parse(fs.readFileSync(TIMINGS, "utf8")); } catch {}
const keyOf = (t) => `${t.dir}/${t.name}`;

// What each part of the code is covered by. Anything not listed (server.js, lib/db.js...) runs everything.
const MAP = [
  [/^events\//, (t) => t.dir === "events" || /events-source|search/.test(t.name)],
  [/^sketch-1\//, () => false], // the first sketch, kept as it was; nothing runs it
  [/^sketch-2\/lib\/search\//, (t) => /search|picks-eval|sidekick-want|map-places|features/.test(t.name)],
  [/^sketch-2\/lib\/sidekick\/study\.js/, (t) => /study/.test(t.name)],
  [/^sketch-2\/lib\/sidekick\/(tts|usage)\.js/, (t) => /sidekick-tts|sidekick-voice|sidekick-integrations|voice-status/.test(t.name)],
  [/^sketch-2\/lib\/sidekick\//, (t) => /^sidekick-|picks-eval|plan-flow|call-ui|study|voice-status/.test(t.name)],
  [/^sketch-2\/lib\/tabs\//, (t) => /tabs|features|plan-flow/.test(t.name)],
  [/^sketch-2\/public\/(js\/sidekick\.js|sidekick\.(css|html))/, (t) => /call-ui|plan-flow|sidekick-.*e2e|sidekick-location|study|voice-status/.test(t.name)],
  [/^sketch-2\/public\/(js\/study.*|study\.(css|html))/, (t) => /study/.test(t.name)],
  [/^sketch-2\/public\//, (t) => /tabs|features|launch|map-places|search|call-ui/.test(t.name)],
  [/^sketch-2\/test\/(.+)\.js$/, null], // a changed test runs itself (handled below)
  [/^sketch-2\/(README|CLAUDE|claude|strategy)\.md$|\.md$/, () => false],
  [/^sketch-2\/(tools|reference)\//, (t) => /sidekick-voice/.test(t.name)],
];

function changedFiles(base) {
  const run = (c) => { try { return execSync(c, { cwd: REPO, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).split("\n").filter(Boolean); } catch { return null; } };
  const committed = run(`git diff --name-only ${base}...HEAD`);
  if (committed == null) return null;
  return [...new Set([...committed, ...(run("git diff --name-only HEAD") || []), ...(run("git ls-files --others --exclude-standard") || [])])];
}

function pick() {
  const tests = allTests();
  const only = opt("--only", null);
  if (only) { const want = new Set(only.split(",").map((s) => s.trim().replace(/\.js$/, ""))); return tests.filter((t) => want.has(t.name) || want.has(keyOf(t))); }
  if (flag("--quick")) return tests.filter((t) => !t.browser && (timings[keyOf(t)] == null || timings[keyOf(t)] < 20));
  if (flag("--changed")) {
    const base = opt("--base", "origin/main");
    const files = changedFiles(base);
    if (!files) { console.log(`Couldn't compare with ${base}: running everything.`); return tests; }
    const keep = new Set();
    for (const f of files) {
      const own = f.match(/^(sketch-2|events)\/test\/(.+)\.js$/);
      if (own) { tests.filter((t) => t.dir === own[1] && t.name === own[2]).forEach((t) => keep.add(t)); continue; }
      const hit = MAP.find(([re]) => re.test(f));
      if (!hit) { console.log(`${f} has no mapping: running everything.`); return tests; }
      if (hit[1]) tests.filter(hit[1]).forEach((t) => keep.add(t));
    }
    console.log(`${files.length} changed file(s) against ${base} → ${keep.size} test file(s).`);
    return tests.filter((t) => keep.has(t));
  }
  return tests;
}

function copyTree(dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const dir of ["events", "sketch-1", "sketch-2", ".github"]) {
    if (!fs.existsSync(path.join(REPO, dir))) continue;
    // Not the importer's page cache or Instagram downloads (about a gigabyte; tests use their own temp folders)
    fs.cpSync(path.join(REPO, dir), path.join(dest, dir), { recursive: true, filter: (src) => !/[\\/](node_modules|\.git|shots|\.cache|instagram-images)([\\/]|$)/.test(src) });
  }
}

function runOne(t, root, logDir) {
  return new Promise((resolve) => {
    const started = Date.now();
    const log = path.join(logDir, `${t.dir}-${t.name}.txt`);
    const out = fs.openSync(log, "w");
    const env = { ...process.env };
    if (!env.NODE_PATH && fs.existsSync("/opt/node-tools/node_modules")) env.NODE_PATH = "/opt/node-tools/node_modules";
    const child = spawn(process.execPath, [t.file], { cwd: path.join(root, t.dir), env, stdio: ["ignore", out, out] });
    const timer = setTimeout(() => child.kill("SIGKILL"), 15 * 60 * 1000);
    child.on("exit", (code, signal) => {
      clearTimeout(timer);
      fs.closeSync(out);
      const text = fs.readFileSync(log, "utf8");
      resolve({ t, code: signal ? 124 : code, secs: Math.round((Date.now() - started) / 1000), pass: (text.match(/^(PASS|\s*ok - )/gm) || []).length, fail: (text.match(/^FAIL/gm) || []).length, log, text });
    });
  });
}

(async () => {
  const list = pick().sort((a, b) => (timings[keyOf(b)] || 30) - (timings[keyOf(a)] || 30)); // slowest first
  if (!list.length) { console.log("Nothing to run."); return; }
  const jobs = Math.max(1, Math.min(Number(opt("-j", Math.min(3, Math.max(1, os.cpus().length - 1)))), list.length));
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "sq-tests-"));
  const logDir = path.join(base, "logs");
  fs.mkdirSync(logDir);
  console.log(`Running ${list.length} test file(s), ${jobs} at a time. Logs: ${logDir}`);
  const t0 = Date.now();
  const queue = list.filter((t) => !ALONE.has(keyOf(t)));
  const alone = list.filter((t) => ALONE.has(keyOf(t)));
  const results = [];
  const report = (r) => {
    const t = r.t;
    results.push(r);
    timings[keyOf(t)] = r.secs;
    const ok = r.code === 0 && r.fail === 0;
    console.log(`${ok ? "ok  " : "FAIL"}  ${keyOf(t).padEnd(36)} ${String(r.pass).padStart(3)} passed  ${String(r.secs).padStart(4)} s`);
    if (!ok) {
      // The failing checks themselves (with the lines under them), then the end of the output
      const lines = r.text.split("\n");
      const shown = [];
      lines.forEach((l, i) => { if (/^(FAIL|\s*not ok)/.test(l)) shown.push(...lines.slice(i, i + 8), ""); });
      console.log([...shown, ...lines.slice(-8)].map((l) => `      ${l}`).join("\n"));
    }
  };
  await Promise.all(Array.from({ length: jobs }, async (_, i) => {
    const root = path.join(base, `w${i}`);
    copyTree(root);
    while (queue.length) {
      const t = queue.shift();
      report(await runOne(t, root, logDir));
    }
  }));
  for (const t of alone) report(await runOne(t, path.join(base, "w0"), logDir)); // one at a time, nothing else running
  try { fs.writeFileSync(TIMINGS, JSON.stringify(timings, null, 1)); } catch {}
  const failed = results.filter((r) => r.code !== 0 || r.fail > 0);
  const mins = ((Date.now() - t0) / 60000).toFixed(1);
  console.log(`\n${results.length - failed.length}/${results.length} files passed in ${mins} min${failed.length ? `. Failed: ${failed.map((r) => keyOf(r.t)).join(", ")}` : ""}.`);
  if (!flag("--keep")) for (let i = 0; i < jobs; i++) fs.rmSync(path.join(base, `w${i}`), { recursive: true, force: true });
  process.exit(failed.length ? 1 : 0);
})();
