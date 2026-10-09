# The 6ix Sense: clickable wireframe

A low-fidelity, clickable wireframe of **The 6ix Sense**, a two-sided Toronto events app. Attendees get events picked for them and their crew, day and night. Hosts see what people want before they book.

It has the same screens, data and flows as the high-fidelity prototype, drawn as a greyscale wireframe. A **site map** sidebar lets you jump to any of the 43 screens.

## View it

No install or build step. It's plain HTML, CSS and JavaScript.

- **On your computer:** open `index.html` in a browser.
- **On GitHub Pages:**
  1. Upload this folder to a repository.
  2. Go to **Settings → Pages** and set the source to **Deploy from a branch**.
  3. Pick your branch, and the folder that contains `index.html`.
  4. GitHub gives you a link to share.

## Using the site map

- The sidebar lists every screen, grouped by what that part of the product does. Click one to jump straight to it.
- The sidebar highlights the screen you're on, even when you get there by tapping around inside the app.
- **Reset prototype** at the bottom clears your progress and starts again from onboarding.
- On a phone, open the site map with the **Site map** tab on the left edge.

| # | Group | Screens |
|---|---|---|
| 01 | Onboarding · shared | Welcome, Choose your side |
| 02 | Onboarding · attendee | Meet Sixer, Pick your scenes, When you go out, Areas, Bring your crew, Building your 6ix Weekly |
| 03 | Onboarding · host | Host type, Verify, Host profile, Claim listings, Demand map ready |
| 04 | Discovery | Discover (6ix Weekly), Daytime filter, 6ix Weekly full list, Scene Mix, Near You map |
| 05 | Event & tickets | Event (all ages), Event (19+), Tickets on the host's page |
| 06 | Age check (19+ only) | 19+ check, All-ages alternatives |
| 07 | Crew Blend | Crew Blend, Group plan |
| 08 | Demand Signals | "I'd go if…" |
| 09 | Plans & event day | Your plans, Event day hub, Check-in scan, Matched attendance |
| 10 | Recap & Wrapped | Past plans, Recap, Saved record, 6ix Wrapped |
| 11 | Sixer (AI guide) | Ask Sixer |
| 12 | Profile & settings | Profile: what Sixer knows |
| 13 | Host tools | Demand map, Idea brief, Draft test, Your events, Event setup, Insights, Host profile |

## Folder structure

```
index.html          Page shell: site map sidebar + phone-sized app
css/app.css         Layout of every screen (shared with the prototype)
css/wireframe.css   Wireframe skin: greyscale, outlines, crossed image boxes, no motion
css/sitemap.css     Sidebar and page layout, including the phone drawer
js/app.js           The app: data, screens, flows, and window.SixSense (navigation API)
js/sitemap.js       Site map entries, jump-to-screen logic and highlighting
```

## Adding or changing a screen in the site map

Each entry in `js/sitemap.js` is one line: an id, a label, how to get there, and how to recognise it:

```js
['h-insights', 'Insights', H('insights'), (w) => w.mode === 'host' && w.tab === 'insights' && !w.page],
```

To get to a screen, entries use the navigation API from `js/app.js`:

| Call | What it does |
|---|---|
| `SixSense.base(mode, tab)` | Opens a tab with nothing stacked on top. `mode` is `attendee` or `host`. |
| `SixSense.push(view, params)` | Opens a page, e.g. `push('event', { id: 'vinyl' })`. |
| `SixSense.fire(action, attrs)` | Runs an in-app action, as if its button were tapped. |
| `SixSense.onboarding(flow, step)` | Opens an onboarding step. `flow` is `start`, `attendee` or `host`. |
| `SixSense.chat()` | Opens Sixer. |
| `SixSense.where()` | Reports what's on screen. The site map uses it to highlight the current entry. |

## Notes

- **The data is made up.** Toronto neighbourhoods are real. People, hosts, venues and numbers are invented for the demo.
- **Sixer is scripted here.** In this wireframe, the AI guide answers with simple built-in logic. In the product it's an AI agent.
- **Grey boxes are image placeholders.** A crossed box with an `IMG` label marks where photography goes.
- **Your choices are saved in your browser** (onboarding, saves, tickets) until you click **Reset prototype**.
