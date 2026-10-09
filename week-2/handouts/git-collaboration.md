
Page
1
of 2
---
week: 2
audience: students
status: draft
---
# Git collaboration cheatsheet — one repo, five people
**The habit:** every time you sit down → **pull → work → commit → push**. **Always
pull first.**
**One driver per feature at a time** — say out loud who's driving.
## Three ways to run the loop — pick one
** Ask your AI agent (simplest).** In Claude Code / Codex, just say it:①
- *"Pull the latest changes."* → then work → *"Commit my changes with a message
saying what I did, and push."*
- The agent runs the git for you. You still follow the habit: pull first, push when
done.
** GitHub Desktop (visual).**②
- Open the repo → **Fetch origin / Pull** → work → write a summary → **Commit to
main** → **Push origin**.
** Terminal (if you know it).**③
```
git pull
# ...work...
git add -A
git commit -m "what I changed and why"
git push
```
## Commit messages
Say **what changed and why**, in one line a teammate can read: `add positioning to
system prompt`,
not `stuff` / `final2`. The log is your team's evidence trail — your logbook's best
friend.
## 🚨 Conflict rescue (when push is rejected or files "conflict")
1. **Stop. Don't force anything.** Never `--force`, never delete the repo to "start
clean."
2. **Pull first.** Most rejections just mean someone pushed before you — pulling
fixes it.
3. If git reports a **merge conflict**: the same lines were changed twice. Open the
file — both
versions are marked. Keep the right one (talk to the person who wrote the
other), delete the
markers, commit.
4. Using an AI agent? Say: *"I have a merge conflict — show me both versions and
help me resolve
it."* It's genuinely good at this.
5. Still stuck after 10 minutes → **raise a hand.** That's the rule.
## Don'ts
- Don't push without pulling. (The whole cheatsheet in one line.)
- Don't have two people edit the same file at the same time — git merges files, not
intentions.
- Don't commit secrets or API keys. Ever. (Week 12 has a whole checklist about
this.)
