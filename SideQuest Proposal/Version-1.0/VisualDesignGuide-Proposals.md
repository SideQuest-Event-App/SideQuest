# Sidequest — Visual Design Guide (Figma)

> **Figma file:** [Sidequest — App Screens](https://www.figma.com/design/7EVuAdMhiXva0GgXMH7897)

This document explains the Figma design pages and how they guide the **visual style** of the Sidequest app.

_Last updated: September 2026 · Status: exploring directions, no final style chosen yet_

---

## Table of Contents

1. [Purpose](#1-purpose)
2. [Wireframe vs. Figma](#2-wireframe-vs-figma)
3. [File Structure](#3-file-structure)
4. [Style Directions](#4-style-directions)
5. [Design Tokens (Variables)](#5-design-tokens-variables)
6. [Text and Effect Styles](#6-text-and-effect-styles)
7. [How to Use the File](#7-how-to-use-the-file)
8. [Open Decisions](#8-open-decisions)

---

## 1. Purpose

The Figma file is the team's reference for **how Sidequest looks and feels**: colour, typography, shape, texture, and mood. It is used to:

- Compare visual directions side by side on the same screens before committing to one.
- Give everyone a shared source of truth for colours, fonts, spacing, and corner radii.
- Hand off consistent tokens to development, so the coded app matches the designs.

It is **not** the source of truth for features, flows, or screen logic. Those live in [`product-spec.md`](./product-spec.md) and the clickable [wireframe](../wireframe/).

---

## 2. Wireframe vs. Figma

| | Wireframe (`/wireframe`) | Figma file |
|---|---|---|
| **Answers** | What does the app do? | What does the app look like? |
| **Fidelity** | Low: black and white, placeholders | High: colour, type, imagery, effects |
| **Covers** | All 38 screens and every user flow | 8 key screens per style direction |
| **Interactive** | Yes, fully clickable | Static screens (prototype links can be added) |
| **Use it to** | Demo features and user journeys | Choose and refine the visual style |

When the two disagree, the **wireframe and spec win on content and behaviour**, and **Figma wins on visual style**.

---

## 3. File Structure

| Page | What's on it |
|---|---|
| **APP DESIGN STYLES** | Section divider for the style direction pages below |
| **Dark neon nightlight** | The original direction (dark mode, with a Light mode built in) |
| **Risograph** | Gig-poster / zine direction |
| **Glass — Sunset aurora** | Glassmorphism direction |
| **Ink — Violet hour** | Editorial dark direction with the Sixer AI guide (own set of 9 screens, see below) |

Each style page contains the **same 8 screens**, so directions can be compared like for like:

| # | Screen | Shows |
|---|---|---|
| 01 | Landing | Brand, slogan, "Request a quest" and "Host a quest" CTAs |
| 02 | Onboarding | "What kind of quests are you after?" vibe picker |
| 03 | Discover | For You feed, featured quest, match scores |
| 04 | Quest Detail | Poster, match explanation, party, host, Accept quest bar |
| 05 | Crew Blend | Blended party taste and group vote |
| 06 | Quest Requests | Request builder and trending requests |
| 07 | Event Day Mode | Venue map, entrance, transit, host updates |
| 08 | Host Dashboard | Stats, demand heatmap, request to claim |

All screens are 390 × 844 (iPhone 14/15 size) and built with auto layout.

---

## 4. Style Directions

### Dark neon nightlight

**Mood:** club at midnight. Sleek, high contrast, glowing.
**Inspired by:** DICE (dark minimalism), Radiate and Fever (gradient party energy), Spotify (match percentages).

- Near-black base with electric lime as the main accent, backed by violet and hot pink
- Syne ExtraBold headlines, DM Sans body text
- Rounded pill buttons and chips, large-radius cards
- Lime glow under primary buttons
- Smooth violet / pink / lime gradient posters
- Includes a **Light** mode (warm off-white base, same accents)

### Risograph

**Mood:** a flyer stapled to a telephone pole. Printed, tactile, indie, local.
**Inspired by:** risograph gig posters and DIY zines.

- Cream paper background with subtle grain
- Riso inks: fluorescent pink, riso blue, and bright red, with ink-black outlines
- Poster art made of overlapping flat shapes set to Multiply, so overlaps mix like real riso layers
- Big Shoulders Display (condensed poster type) headlines, IBM Plex Mono (typewriter) body text
- Squared-off corners and hard offset ink shadows instead of glows
- Paper "sticker" labels on posters for readable captions

### Glass — Sunset aurora

**Mood:** golden hour on a rooftop. Warm, dreamy, premium.
**Inspired by:** glassmorphism UI with aurora gradients.

- Deep plum base with blurred coral, magenta, and amber aurora blobs behind each screen
- Frosted glass cards, chips, and tab bar (background blur, translucent fill, thin light border)
- Golden yellow primary buttons with a warm coral glow
- Soft coral and lilac for match scores, badges, and labels
- Same fonts as Dark neon (Syne and DM Sans), with softer, larger corner radii
- Sunset gradient posters with frosted caption panels

**Accessibility note:** glass surfaces can fail contrast when a bright blob sits behind text. The glass tint was darkened for this reason. Always check text contrast over the brightest part of the background.

### Ink — Violet hour

**Mood:** the blue-violet hour just after sunset. Calm, editorial, quietly premium.
**Inspired by:** editorial dark UI and AI assistant products, with oversized "ghost" type in the background.

- Near-black ink base (`#0E0D12`) with layered charcoal surfaces (`#14121F`, `#1E1D23`, `#2B2A30`)
- One accent only: periwinkle (`#8B7AFF`), used for highlights, map pins, match scores, and active states
- Cream (`#F2EFE8`) for primary text and pill buttons, with muted grey (`#9996A3`) for secondary text
- Bricolage Grotesque ExtraBold headlines, Figtree body text, and DM Mono for small uppercase "eyebrow" labels and data
- Oversized, low-contrast ghost words behind posters and the landing screen (e.g. "SUNDAY", "KENSINGTON")
- Grainy violet glows: a soft periwinkle glow around key elements, blurred violet blobs, and a light noise texture on posters
- Pill buttons and chips, large-radius cards (22 to 34), and frosted (background-blurred) panels over imagery
- **Sixer**, a glowing violet orb, is the app's only character. It acts as the AI guide ("Ask Sixer") and explains picks ("Why Sixer picked this")

**Screens:** this page uses its own set of 9 screens rather than the shared 8. It adds a **Near You** map, an **Ask Sixer** chat, a **Host Demand Map**, and a **Host Insights** recap ("How it went"), and leaves out Onboarding and Event Day Mode.

**Not yet tokenized:** unlike the other directions, Ink is not a mode in the variable collections and doesn't use the shared text or effect styles. Its colours, fonts, and effects are set directly on each layer. To compare it like for like, add an **Ink** mode to the Color, Typography, and Spacing & Radius collections and bind the screens to it.

**Accessibility note:** grey secondary text and the ghost type sit close to the background in value. Check contrast on small grey text, and keep ghost type decorative only.

---

## 5. Design Tokens (Variables)

Every screen is bound to Figma **variables**, organised into three collections. Each style direction is a **mode** of these collections, so changing a token value updates every screen that uses that mode.

### Colour — `Sidequest / Color`

| Token | Dark | Light | Riso | Glass |
|---|---|---|---|---|
| `bg/base` | `#0B0A10` | `#F6F4EE` | `#F3ECDC` | `#1A0B14` |
| `bg/surface` | `#17151F` | `#FFFFFF` | `#FBF6EA` | `#1A0B14` @ 38% |
| `bg/elevated` | `#23202E` | `#ECE8F5` | `#E8DEC8` | `#FFFFFF` @ 14% |
| `border/subtle` | `#2E2A3B` | `#DDD8E8` | `#2A2622` | `#FFFFFF` @ 22% |
| `text/primary` | `#F5F3FA` | `#141218` | `#221F1C` | `#FFF4EE` |
| `text/secondary` | `#A7A2B8` | `#5E5870` | `#5E564D` | `#F2C9BD` |
| `text/on-accent` | `#0B0A10` | `#0B0A10` | `#221F1C` | `#2A0F12` |
| `accent/primary` | `#D4FF3A` | `#C2F000` | `#FF48B0` | `#FFD166` |
| `accent/secondary` | `#8B6CFF` | `#6A4BF0` | `#0078BF` | `#E3A3FF` |
| `accent/hot` | `#FF4FA3` | `#E83A8C` | `#F15060` | `#FFA38A` |
| `accent/secondary-soft` | `#8B6CFF` @ 18% | `#6A4BF0` @ 14% | `#0078BF` @ 16% | `#C13CFF` @ 22% |

**How the tokens are used:**
- `accent/primary`: primary buttons, active chips and tabs
- `accent/secondary`: Crew Blend, host badges, secondary highlights
- `accent/hot`: match scores, live badges, demand heatmap
- `text/on-accent`: text sitting on an accent-filled button or badge

### Typography — `Sidequest / Typography`

| Token | Default (Dark, Light) | Riso | Glass |
|---|---|---|---|
| `font/display` | Syne | Big Shoulders Display | Syne |
| `font/body` | DM Sans | IBM Plex Mono | DM Sans |
| `weight/display` | ExtraBold | Black | ExtraBold |
| `weight/title` | Bold | ExtraBold | Bold |
| `weight/body-regular` | Regular | Regular | Regular |
| `weight/body-medium` | Medium | Medium | Medium |
| `weight/body-bold` | Bold | Bold | Bold |
| `size/display-xl` | 44 | 64 | 44 |
| `size/display-l` | 32 | 46 | 32 |
| `size/title` | 22 | 28 | 22 |
| `size/body-l` | 17 | 15 | 17 |
| `size/body` | 15 | 14 | 15 |
| `size/body-s` | 13 | 12 | 13 |
| `size/caption` | 11 | 11 | 11 |

### Spacing and radius — `Sidequest / Spacing & Radius`

| Token | Default | Riso | Glass |
|---|---|---|---|
| `space/xs` | 4 | 4 | 4 |
| `space/sm` | 8 | 8 | 8 |
| `space/md` | 12 | 12 | 12 |
| `space/lg` | 16 | 16 | 16 |
| `space/xl` | 24 | 24 | 24 |
| `space/2xl` | 32 | 32 | 32 |
| `radius/sm` | 8 | 2 | 10 |
| `radius/md` | 14 | 3 | 18 |
| `radius/lg` | 22 | 4 | 28 |
| `radius/pill` | 999 | 4 | 999 |

Every variable also has a web code syntax set (for example `var(--sq-accent-primary)`), so developers can map Figma tokens directly to CSS custom properties.

---

## 6. Text and Effect Styles

### Text styles

Text styles are bound to the typography variables above, so they change automatically with each mode.

| Style | Font role | Size token | Notes |
|---|---|---|---|
| `Display/XL` | Display | `size/display-xl` | Brand name, hero moments |
| `Display/L` | Display | `size/display-l` | Screen headings |
| `Title` | Display | `size/title` | Card and section titles |
| `Body/Large` | Body medium | `size/body-l` | Slogans, key supporting text |
| `Body/Regular` | Body regular | `size/body` | Default body copy |
| `Body/Bold` | Body bold | `size/body` | Buttons, emphasis |
| `Body/Small` | Body regular | `size/body-s` | Metadata, chips |
| `Label` | Body bold | `size/caption` | Uppercase, 8% letter spacing; badges and tab labels |

### Effect styles

| Style | Used in | What it does |
|---|---|---|
| `Glow/Accent` | Dark neon | Lime glow under primary buttons |
| `Shadow/Riso Offset` | Risograph | Hard 4px ink offset shadow |
| `Glow/Sunset` | Glass | Warm coral glow under primary buttons |
| `Glass/Card blur` | Glass | 30px background blur for frosted surfaces |

**Not tokenized:** poster gradients, riso overprint shapes, and aurora blobs are hard-coded art that stands in for real event imagery. Edit them directly on each page.

---

## 7. How to Use the File

**Open the variables panel:** click an empty spot on the canvas, then open **Local variables** in the right sidebar.

**Change a colour or font everywhere:** edit the value in the variables panel for the mode you want. For example, changing `accent/primary` in the **Riso** mode recolours every Risograph button, chip, and active tab, without touching the other directions.

**Preview a screen in another style:** select a screen frame, then in the right sidebar under **Layer**, switch the mode for each collection (Color, Typography, Spacing & Radius). Screen-specific art (posters, blobs) won't change, but everything bound to tokens will.

**Try a new direction:** duplicate one of the style pages, add a new mode to each collection, fill in the values, and set the new screens to that mode. Note that Figma limits how many modes a collection can have depending on the plan.

**Swap a font:** change `font/display` or `font/body` in the Typography collection. If the new font uses different style names, update the `weight/…` tokens to match, or the text will fail to load.

**Keep it consistent:**
- Bind new colours, spacing, and radii to existing variables rather than typing hex values or pixel numbers.
- Use the text styles instead of setting fonts manually.
- Add new screens to every style page you're still comparing, so directions stay comparable.

---

## 8. Open Decisions

Items for team discussion. These are not final.

- [ ] **Pick a primary style direction:** Dark neon, Risograph, Glass, Ink, or a hybrid.
- [ ] **Light mode:** decide whether the chosen direction needs a light mode at launch.
- [ ] **Accessibility check:** run contrast checks on the chosen direction, especially text over gradients, blobs, and glass.
- [ ] **Components:** convert repeated elements (buttons, chips, cards, tab bar) into Figma components before the team designs in parallel.
- [ ] **Real imagery:** replace placeholder poster art with event photography treated to match the chosen style.
- [ ] **Remaining screens:** design the rest of the screens from the wireframe (38 total) in the chosen style.
