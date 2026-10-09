# KIMMY PROTOTYPE

Kim's wireframe prototypes for **The 6ix Sense**, the two-sided Toronto events app: attendees get events picked for them and their crew, and hosts see what people want before they book.

This folder holds two clickable, black-and-white, low-fidelity wireframes. Both are plain HTML, CSS and JavaScript with no install or build step.

## What's in this folder

```
KIMMY PROTOTYPE/
├── README.md                     This file
├── 6ix-sense-wireframe/          15 key screens, with notes beside each one
│   ├── index.html
│   ├── styles.css
│   ├── README.md
│   └── js/
│       ├── ui.js
│       ├── screens.js
│       └── app.js
└── the-6ix-sense-wireframe/      Full app, 43 screens, clickable end to end
    ├── index.html
    ├── README.md
    ├── css/
    │   ├── app.css
    │   ├── wireframe.css
    │   └── sitemap.css
    └── js/
        ├── app.js
        └── sitemap.js
```

| | `6ix-sense-wireframe` | `the-6ix-sense-wireframe` |
|---|---|---|
| **Use it to** | Review the 15 key screens one at a time | Walk through the whole app as an attendee or a host |
| **Screens** | 15, in 7 groups | 43, in 13 groups |
| **Sidebar** | Sitemap of the key screens (01-01 to 07-01) | Site map of every screen, plus **Reset prototype** |
| **Beside the phone** | Caption, "In the flow" note, Prev / Next | The current screen's name |
| **Remembers your choices** | No. Each screen is a fixed picture | Yes. Onboarding, saves and tickets are kept in the browser until you reset |
| **Covers** | Onboarding, discovery, Sixer, Crew Blend, Demand Signals, event day, 19+ check | All of that, plus host onboarding, tickets, group plan, plans, recap, 6ix Wrapped, profile and host tools |

Each folder has its own `README.md` with the full screen list and notes on editing the code.

## How to launch a wireframe

### Option 1: open the file

1. Download or clone this repo.
2. Open the wireframe's folder.
3. Double-click `index.html`. It opens in your browser.

### Option 2: run a local server

Use this if your browser blocks local files. From the repo root:

```bash
cd "KIMMY PROTOTYPE/6ix-sense-wireframe"        # or "KIMMY PROTOTYPE/the-6ix-sense-wireframe"
python3 -m http.server 8000
```

Then open <http://localhost:8000>. Press `Ctrl + C` in the terminal to stop the server.

The folder name has a space in it, so keep the quotes around the path.

## How to use them

**`6ix-sense-wireframe`**

- Click a screen name in the left sidebar to open it.
- Buttons inside the phone follow the attendee and host flows.
- Each screen has its own link, for example `index.html#weekly`, so you can send a teammate to one screen.

**`the-6ix-sense-wireframe`**

- Click any entry in the site map to jump to that screen.
- Tap around inside the phone as you would in the app. The site map highlights where you are.
- Click **Reset prototype** at the bottom of the site map to start again from onboarding.

## Notes

- People, hosts, venues and numbers are sample content. Toronto neighbourhoods are real.
- Grey crossed boxes are image placeholders.
- Sixer, the AI guide, is scripted in these wireframes. In the product it is an AI agent.
- `6ix-sense-wireframe` loads its fonts from Google Fonts, so it falls back to a system font when offline.
