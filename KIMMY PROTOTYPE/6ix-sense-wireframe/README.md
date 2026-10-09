# The 6ix Sense — Wireframe Prototype

A clickable, black-and-white, low-fidelity wireframe of The 6ix Sense: 15 key screens with a sitemap sidebar, so the team can review layout and flow without visual design getting in the way.

No build step, no dependencies. Plain HTML, CSS, and JavaScript.

## Run it locally

**Option 1: open the file.** Double-click `index.html`, or drag it into any browser.

**Option 2: run a local server:**

```bash
# from this folder
python3 -m http.server 8000
# then open http://localhost:8000
```

## Add it to the repo

```bash
cp -r 6ix-sense-wireframe your-repo/6ix-sense-wireframe
cd your-repo
git add 6ix-sense-wireframe
git commit -m "Add 6ix Sense lo-fi wireframe prototype"
git push
```

Because it is static, GitHub Pages can serve it as is: **Settings → Pages → Deploy from a branch**, then pick the branch and folder.

## How to use it

| Area | What it does |
|---|---|
| **Left: sitemap** | One button per screen, labelled with its code and name. Click to open that screen. |
| **Middle: phone** | The screen itself. Buttons inside the phone follow the attendee and host flows. |
| **Right: notes** | The screen's caption, where it sits in the flow, and Prev / Next. |

Each screen has its own link, for example `index.html#weekly`, so you can point a teammate at one screen. The browser's back button works too.

## Screens

| Code | Screen | Link id | Group |
|---|---|---|---|
| 01-01 | Welcome | `welcome` | Onboarding |
| 01-02 | Choose your side | `choose-side` | Onboarding |
| 01-03 | Pick your scenes | `pick-scenes` | Onboarding |
| 02-01 | 6ix Weekly | `weekly` | Discovery |
| 02-02 | Near You map | `near-you` | Discovery |
| 03-01 | Why Sixer picked this | `why-sixer-picked` | Sixer, the AI guide |
| 03-02 | Ask Sixer | `ask-sixer` | Sixer, the AI guide |
| 04-01 | Crew Blend | `crew-blend` | Crew Blend |
| 05-01 | "I'd go if…" | `id-go-if` | Demand Signals |
| 05-02 | Host demand map | `demand-map` | Demand Signals |
| 05-03 | Draft test | `draft-test` | Demand Signals |
| 06-01 | Event day hub | `event-day` | Event day & north star |
| 06-02 | Matched attendance | `checked-in` | Event day & north star |
| 06-03 | Host insights | `host-insights` | Event day & north star |
| 07-01 | 19+ check | `age-check` | Age-friendly by default |

## Project structure

```
6ix-sense-wireframe/
├── index.html        Page shell: sitemap sidebar, phone frame, notes panel
├── styles.css        Black-and-white wireframe styles
└── js/
    ├── ui.js         Shared helpers: icons, back button, onboarding progress, tab bars
    ├── screens.js    Every screen: its sitemap info, notes, and HTML
    └── app.js        Navigation (URL hash) and rendering
```

Scripts load as plain `<script>` tags (not ES modules) so the prototype works when opened straight from the file system.

## Editing it

**Change a screen's copy or layout:** find its `addScreen({...})` block in `js/screens.js` (they are in sitemap order, each under a `/* ----- 02-01 · 6ix Weekly ----- */` comment) and edit the HTML in `render`.

**Add a screen:** add another block to `js/screens.js`. It appears in the sidebar automatically, in the position you put it.

```js
addScreen({
  id: 'morning-recap',            // used in the URL (#morning-recap) and in data-go links
  code: '06-04',
  group: 'Event day & north star',
  title: 'Morning recap',
  caption: 'Rates the night, adds photos, tags people.',
  flowNote: 'Shown the morning after check-in. Ratings update taste.',
  tabs: 'attendee',               // 'attendee', 'host', or null
  render: () => `
    <div class="screen">
      ${backButton('event-day')}
      <h1 class="h1">How was last night?</h1>
      <div class="ph" style="height: 160px"><span class="lbl">[Photo]</span></div>
      <button type="button" class="btn solid" data-go="weekly">Save the night</button>
    </div>
  `,
});
```

**Link one screen to another:** put `data-go="screen-id"` on any button or card.

**Image placeholders:** `<div class="ph" style="height: 120px"><span class="lbl">[Label]</span></div>` draws the grey crossed box.

**Building blocks in `styles.css`:** `.btn` / `.btn.solid` (buttons), `.ibtn` (round icon button), `.chip` / `.chip.on`, `.box` and `.soft` (cards), `.ph` (image placeholder), `.bar` (progress or score bar), `.av` (avatar), `.row` and `.between` (horizontal layout), `.h1`, `.h2`, `.bd`, `.sm`, `.mono` (text sizes). One-off sizes and spacing are written inline on the element.

## Notes on content

- Names, events, and numbers are sample content from the proposal and the key-screens board.
- Text in square brackets, such as `[Area]` or `[Event image]`, marks a placeholder.
- The wireframe has no shared state: choices on one screen do not carry to the next.
