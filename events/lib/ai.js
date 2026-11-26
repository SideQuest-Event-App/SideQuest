// The importer's AI: tagging listings (lib/tagger.js, run at the end of every `node run.js`), reading Instagram posts
// and posters (instagram.js). It is Claude Code only (`claude` on your PATH, signed in to your Claude plan): no API
// key is ever used here, so an import never bills the paid API. Without Claude Code, or with AI=off, there is no AI.
//   mode()                    "claude-code" or "keywords" (no AI)
//   askJSON(prompt, n, files) the AI's answer as JSON; files are images ([{ name, path }]) it may read

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile, execFileSync } = require("child_process");

// Is the `claude` command installed? (checked once)
let claudeCodeAvailable = false;
try {
  execFileSync("claude", ["--version"], { stdio: "ignore", timeout: 15000 });
  claudeCodeAvailable = true;
} catch {}

function mode() {
  if (process.env.AI === "off") return "keywords";
  return claudeCodeAvailable ? "claude-code" : "keywords";
}

// ---------- The two AI backends ----------
// files: images for it to look at ([{ name, path }]), copied into a fresh folder it may read (and nothing else)
function askClaudeCode(prompt, extraArgs = [], files = []) {
  let dir = null;
  const args = ["-p", prompt, "--output-format", "json", ...extraArgs];
  if (files.length) {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "sq-images-"));
    for (const f of files) fs.copyFileSync(f.path, path.join(dir, f.name));
    if (!extraArgs.includes("--allowedTools")) args.push("--allowedTools", "Read");
  }
  return new Promise((resolve, reject) => {
    const child = execFile(
      "claude",
      args,
      { cwd: dir || os.tmpdir(), timeout: files.length ? 300000 : 120000, maxBuffer: 10 * 1024 * 1024 },
      (err, stdout, stderr) => {
        let out = null;
        try {
          out = JSON.parse(stdout);
        } catch {}
        if (err || (out && out.is_error)) {
          if (err && err.code === "ENOENT") claudeCodeAvailable = false;
          const cleanStderr = (stderr || "").split("\n").filter((l) => l.trim() && !l.includes("no stdin data received")).join(" ");
          const reason = (out && out.result) || cleanStderr || (stdout || "").trim() || (err && err.killed ? "it took too long" : err && err.message) || "unknown error";
          console.error("Claude Code error details:", { code: err && err.code, stdout, stderr });
          return reject(new Error(`Claude Code failed: ${reason}`));
        }
        resolve(out && typeof out.result === "string" ? out.result : stdout);
      }
    );
    child.stdin.end(); // so Claude Code doesn't wait for piped input
  }).finally(() => dir && fs.rmSync(dir, { recursive: true, force: true }));
}

// Ask Claude Code and parse its JSON answer. Throws if there's no AI or it fails.
// files: optional images ([{ name, path }]) for it to read; the prompt refers to them by name.
async function askJSON(prompt, maxTokens = 2000, files = []) {
  const m = mode();
  if (m === "keywords") throw new Error("No AI available");
  return parseJSON(await askClaudeCode(prompt, [], files));
}
function parseJSON(text) {
  try {
    return JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
  } catch {
    throw new Error("The AI's answer wasn't in the expected format.");
  }
}

module.exports = { mode, askJSON };
