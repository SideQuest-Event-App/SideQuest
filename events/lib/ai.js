// The importer's AI: reading posters and Instagram posts (events/instagram.js) and tagging listings (events/tag.js).
// Both are run by hand, never by the scheduled import (AI=off there). It uses, in order: Claude Code (`claude` on your
// PATH, on your Claude plan, no API bill) or, only when TAG_WITH_API=1 / AI=api says so, the paid API key in .env.
//   mode()                    "claude-code", "api" or "keywords" (no AI)
//   askJSON(prompt, n, files) the AI's answer as JSON; files are images ([{ name, path }]) it may read

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile, execFileSync } = require("child_process");

const MODEL = process.env.MODEL || "claude-haiku-4-5-20251001";

// Is the `claude` command installed? (checked once)
let claudeCodeAvailable = false;
try {
  execFileSync("claude", ["--version"], { stdio: "ignore", timeout: 15000 });
  claudeCodeAvailable = true;
} catch {}

function mode() {
  if (process.env.AI === "off") return "keywords";
  if (process.env.AI === "api") return process.env.ANTHROPIC_API_KEY ? "api" : "keywords"; // only when asked for by name
  if (process.env.AI === "claude-code") return claudeCodeAvailable ? "claude-code" : "keywords"; // your plan only
  // Not set (the apps' "Add from a poster"): Claude Code if it's here, else the key if there is one
  return claudeCodeAvailable ? "claude-code" : process.env.ANTHROPIC_API_KEY ? "api" : "keywords";
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

const MEDIA_TYPES = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif" };
// Image files as content blocks, each labelled with its file name so the prompt can refer to it
const imageBlocks = (files) => files.flatMap((f) => [
  { type: "text", text: `Image file ${f.name}:` },
  { type: "image", source: { type: "base64", media_type: MEDIA_TYPES[path.extname(f.name).toLowerCase()] || "image/jpeg", data: fs.readFileSync(f.path).toString("base64") } },
]);

// content is the prompt text, or an array of content blocks (an image plus text); tools are server tools like web search
async function askAPI(content, maxTokens, tools) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, messages: [{ role: "user", content }], ...(tools ? { tools } : {}) }),
  });
  if (!res.ok) throw new Error(`AI request failed (${res.status}): ${await res.text()}`);
  const data = await res.json();
  return data.content.map((c) => c.text || "").join("");
}

// Ask whichever AI is available and parse its JSON answer. Throws if there's no AI or it fails.
// files: optional images ([{ name, path }]) for it to read; the prompt refers to them by name.
async function askJSON(prompt, maxTokens = 2000, files = []) {
  const m = mode();
  if (m === "keywords") throw new Error("No AI available");
  if (m === "api") return parseJSON(await askAPI(files.length ? [...imageBlocks(files), { type: "text", text: prompt }] : prompt, maxTokens));
  return parseJSON(await askClaudeCode(prompt, [], files));
}
function parseJSON(text) {
  try {
    return JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
  } catch {
    throw new Error("The AI's answer wasn't in the expected format.");
  }
}

module.exports = { mode, MODEL, askJSON };
