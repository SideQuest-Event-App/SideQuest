---
week: 4
audience: students
status: draft
---

# MCP in five minutes

**What it is.** MCP (Model Context Protocol) is how your agent reaches real systems — files, Figma,
email, your deploy. A "connector" (an MCP server) gives the model **tools it can call**.

**Why it matters this week.** The moment your agent can *act*, the control question stops being
philosophy: every connector is a **decides / proposes / executes** gate — one you chose, or one you
forgot to choose.

## Try it (10 min)

1. Open your agent's connector settings (Claude Desktop → Settings → Connectors; Codex has the same idea).
2. Connect **one** tool your project could actually use.
3. Ask: *"what can you do now?"* — then give it a small task and **watch the approval prompts**.
4. Read one prompt aloud and name its gate: is the human deciding, approving, or just overseeing?

## Before you connect anything — blast radius

Ask: *what is the worst this connector could do without me?*

- Read-only (search, fetch) → small radius
- Writes to your stuff (files, notes, repos) → medium — wrong things propagate
- Sends or publishes (email, posting, deploys) → large — it acts on the world **as you**

Match the gate to the radius: the larger the radius, the closer to **decides** it should sit.
Annotate every connector you add onto your system map — the map just changed.
