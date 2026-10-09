# Sidequest — Wireframe Demo

A clickable, black-and-white wireframe of the Sidequest app. It walks through every attendee and host feature as guided user flows, so the team can demo how the product works without any visual design getting in the way.

No build step, no dependencies. Plain HTML, CSS, and JavaScript.

## Run it locally

**Option 1: open the file.** Double-click `index.html`, or drag it into Chrome, Safari, Firefox, or Edge.

**Option 2: run a local server** (useful for sharing on your network or if your browser blocks local files):

```bash
# from this folder
python3 -m http.server 8000
# then open http://localhost:8000
```

or

```bash
npx serve .
```

## Add it to the repo

Suggested location: `/wireframe` at the root of the project repo.

```
your-repo/
├── docs/
│   └── product-spec.md      ← feature IDs (A1, H8, …) match this file
└── wireframe/               ← this folder
```

```bash
cp -r sidequest-wireframe your-repo/wireframe
cd your-repo
git add wireframe
git commit -m "Add clickable wireframe demo"
git push
```

### Host it on GitHub Pages (optional)

Because it's static, GitHub Pages can serve it as is: **Settings → Pages → Deploy from a branch**, pick your branch and the `/wireframe` folder (or move it to `/docs`). The demo will be live at `https://<username>.github.io/<repo>/`.

## How to use the demo

The screen has three columns:

| Column | What it does |
|---|---|
| **Left: flows** | One button per user flow. Click one to start its guided walkthrough. |
| **Middle: phone** | The app itself. Buttons inside the phone work, and tapping the right one advances the flow. |
| **Right: notes** | What the current step shows, which features it covers (by spec ID), Previous and Next controls, the full step list, and a "Jump to any screen" menu. |

### Flows

| Group | Flow | Steps |
|---|---|---|
| Attendee | Attendee registration | Landing, sign up, vibes, past events, party, location, taste avatar, feed |
| Attendee | Discover and accept a quest | Feed, quest detail, tickets, Quest Log |
| Attendee | Find quests on the map | Feed, map, all filters (distance, who's going, interest, when, price), filtered map, quest detail |
| Attendee | Parties and Crew Blend | Parties, Crew Blend and group vote, locked in |
| Attendee | Quest Requests | Trending, request a quest, posted, notifications |
| Attendee | Event day and after | Quest Log, event day mode, attendee chat, rating, collected stories |
| Host | Host registration | Host type, account, profile, verification, ticketing, team, review, dashboard |
| Host | Create and publish a quest | Dashboard, details, event day info, published, attendee view |
| Host | Demand Insights and claiming | Heatmap and requests, request detail and claim, quest from request |
| Host | Event day, audience, and recap | Live updates, check-in, recap, audience |
| Full loop | Demand Signal loop | Attendee requests → host claims and publishes → attendee is notified, goes, and rates → host recap |

There's also **Explore freely** (attendee app or host app without a script) and **Reset demo**.

### Shared demo state

Both sides of the app share one in-memory state, so actions carry across flows. For example, a request posted as an attendee shows up in the host's Demand Insights, and a host's live update appears in the attendee's event day mode. Refreshing the page or clicking **Reset demo** starts over.

Buttons labelled **Demo: …** (like "Demo: approve this host" or "Demo: skip to after the event") exist only to fast-forward time for the walkthrough.

## Project structure

```
wireframe/
├── index.html        Page shell: flow list, phone frame, notes panel
├── styles.css        Black-and-white wireframe styles
└── js/
    ├── data.js       Mock data and the initial demo state
    ├── screens.js    Every screen, as a function that returns HTML
    ├── actions.js    What buttons do (state changes and navigation)
    ├── flows.js      Guided flows, step notes, and the feature ID list
    └── app.js        Navigation, flow stepping, and rendering
```

Scripts load as plain `<script>` tags (not ES modules) so the demo works when opened straight from the file system.

## Extending it

**Add a screen:** in `js/screens.js`, add an entry to `S`:

```js
S['my-screen'] = { role: 'attendee', render: (s) => screen(`
  <div class="pad stack">
    <h2>Hello</h2>
    ${btn('Go somewhere', { 'data-go': 'discover' })}
  </div>`, { title: 'My screen' }) };
```

**Make a button do something:** give it `data-act="myAction"` (and optionally `data-arg`), then add the action in `js/actions.js`. Return a screen ID to navigate, or nothing to re-render in place:

```js
A.myAction = (s, arg, ctx) => {
  ctx.toast('Done');
  return 'questlog';
};
```

**Add or edit a flow:** in `js/flows.js`, add steps with `step(screenId, title, note, featureIds)`. A flow's `setup` function prepares the demo state it needs (for example, making sure a host account exists).

Keep feature IDs in sync with `docs/product-spec.md` so the notes panel and the spec stay aligned.
