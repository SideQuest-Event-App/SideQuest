---
week: 5
audience: students
status: draft
---

# Deploy quickstart — a public URL before you leave

## Simplest path (already in Lovable / Bolt / Replit)

Your platform hosts for you: hit **Publish / Deploy**, copy the URL, open it on your phone. Done.

## Power lane (v0 / your own code)

1. Push the repo to GitHub (the Week-2 loop).
2. **Vercel** → New Project → import the repo → Deploy. Every push now redeploys.
3. Data? **Supabase** → new project → use its URL + anon key from your host's **environment
   variables** — never pasted into code.

## The rules

- **Keys go in env vars, not the repo.** If a key ever lands in a commit: rotate it.
- **Deploy early in the block** — campus wifi queues; 7:55 is too late.
- Test the URL **on a phone, logged out** — that's what another team will see.
- Stuck 10 minutes → raise a hand.
