---
week: 4
audience: students
status: draft
---

# System map + control boundaries — guide

**The map is a thinking tool.** Rough and honest beats pretty. Draw it in FigJam, or ask Claude to
generate it as an editable Artifact — then **correct it**. The corrections are the thinking.

## What goes on the map

- **Actors** — every human role that touches the system (user, admin, the person affected who never logs in)
- **Data** — what flows where, and what gets stored
- **AI components** — every place a model reads, writes, or decides
- **Feedback loops** — where the system's output changes its own future input
- **Harms** — who could be worse off, including people not in the room
- **Your boundary** — drawn consciously: what's inside your design, what you're choosing to ignore

## Then mark the control gates

For **each consequential action**, mark one:

| Gate | Meaning |
| :-- | :-- |
| **decides** | a human makes the call; the AI informs |
| **proposes** | the AI drafts; a human approves before anything happens |
| **executes** | the AI acts; a human has oversight + a real undo |

Test every gate two ways (from lecture): **requisite variety** — does the human have visibility,
range, time, and escalation? — and **tracking & tracing** — right reasons in, an informed human at
the end of the line? A gate that fails both is theatre. Mark it red; Week 10 audits it.

## Two worked examples (our reading assistant)

1. **"Summarize this reading" → output shown.** Gate: **executes with oversight** — but oversight is
   real only because the app shows the source passage and asks you to say the argument back. Without
   those, same gate, zero variety → theatre.
2. **"Save this summary into my notes" (via the notes connector).** Gate: **proposes** — the agent
   drafts, the human confirms before anything is written. Delete that confirm and a wrong claim
   propagates into everything built on those notes. That one click is the control boundary.
