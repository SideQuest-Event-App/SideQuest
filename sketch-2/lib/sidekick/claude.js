// A small Anthropic Messages API client for Sidekick: plain text replies and forced tool calls,
// with a timeout so a slow reply never holds up the call. Uses the same key and model as lib/ai.js.

const API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.SIDEKICK_MODEL || process.env.MODEL || "claude-haiku-4-5-20251001";

const available = () => Boolean(API_KEY);

async function call(body, timeoutMs = 8000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: ctrl.signal,
      headers: { "content-type": "application/json", "x-api-key": API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: MODEL, ...body }),
    });
    if (!res.ok) throw new Error(`Sidekick AI request failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// Plain text from a system prompt and one user message
async function say(system, user, maxTokens = 120) {
  const data = await call({ system, max_tokens: maxTokens, messages: [{ role: "user", content: user }] });
  return data.content.map((c) => c.text || "").join("").trim();
}

// Force one tool call and return its input
async function tool(system, user, def, maxTokens = 600) {
  const data = await call({ system, max_tokens: maxTokens, tools: [def], tool_choice: { type: "tool", name: def.name }, messages: [{ role: "user", content: user }] });
  const use = data.content.find((c) => c.type === "tool_use" && c.name === def.name);
  if (!use) throw new Error("Sidekick AI didn't call the tool");
  return use.input;
}

module.exports = { available, say, tool, MODEL };
