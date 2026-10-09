/* The 6ix Sense wireframe: screens.
   One addScreen({...}) call per screen, in sitemap order.

   Each screen has:
     id        used in the URL hash (#weekly) and in data-go links
     code      sitemap code, matching the key-screens board (01-01 ... 07-01)
     group     sidebar section
     title     sidebar label
     caption   one-line description shown beside the phone
     flowNote  where the screen sits in the attendee / host flow diagrams
     tabs      'attendee', 'host', or null (which bottom tab bar to show)
     render    returns the screen's HTML

   Inside the HTML, any element with data-go="screen-id" navigates on click. */
(function () {
  const SIX = window.SIX;
  const { icon, backButton, onboardingProgress } = SIX.ui;
  const addScreen = (s) => SIX.screens.push(s);

  /* Scene picker tiles on 01-03. `picked` tiles are drawn selected. */
  const SCENES = [
    { name: 'Live Sets', picked: true },
    { name: 'Food Pop-ups', picked: true },
    { name: 'Art Nights', picked: true },
    { name: 'Markets', picked: true },
    { name: 'Comedy' },
    { name: 'Dance Nights' },
    { name: 'Wellness' },
    { name: 'Film' },
    { name: 'Trivia &amp; Games' },
    { name: 'Outdoors' },
  ];
  const sceneTile = (s) => `<div class="scene-tile${s.picked ? ' picked' : ''}">
    <div class="ph"></div>
    <span class="scene-name">${s.name}</span>
    <span class="chip scene-mark${s.picked ? ' on' : ''}">${s.picked ? '✓' : '+'}</span>
  </div>`;

  /* ----- 01-01 · Welcome ----- */
  addScreen({
    id: "welcome",
    code: "01-01",
    group: "Onboarding",
    title: "Welcome",
    caption: "Toronto day and night. No age gate up front.",
    flowNote: "Attendee signs up and creates an account. Sixer introduces itself: what it learns and how to change it.",
    tabs: null,
    render: () => `
      <div class="screen" style="padding-bottom: 22px">
        <div class="ph" style="position: absolute; left: 0; top: 0; width: 390px; height: 470px; border: none; border-bottom: 1px solid #8f8f8f"><span class="lbl">[Hero image · Toronto scenes, day and night]</span></div>
        ${onboardingProgress(1)}
        <div class="spacer"></div>
        <p class="mono">The 6ix Sense</p>
        <h1 style="font-size: 36px; font-weight: 700; line-height: 1.05; letter-spacing: -1px">Toronto, day and night, <span class="u">picked for you.</span></h1>
        <p class="bd" style="color: #333">Markets, workshops, live sets, food pop-ups and more. Solo, with friends or with family.</p>
        <button type="button" class="btn" style="justify-content: flex-start; padding: 6px; min-height: 56px; border-radius: 28px; margin-top: 8px" data-go="choose-side"><span class="ibtn" style="background: #111">${icon('arrow', 18, '#fff')}</span><span style="flex-grow: 1; text-align: center">Slide to explore »</span></button>
      </div>
    `,
  });

  /* ----- 01-02 · Choose your side ----- */
  addScreen({
    id: "choose-side",
    code: "01-02",
    group: "Onboarding",
    title: "Choose your side",
    caption: "Going out, or hosting events.",
    flowNote: "Splits into the attendee flow (going out) or the host flow (host signs up as a promoter, venue or community group).",
    tabs: null,
    render: () => `
      <div class="screen" style="padding-bottom: 22px; gap: 14px">
        ${onboardingProgress(2)}
        <h1 class="h1" style="font-size: 32px; margin-top: 18px">How are you using <span class="u">the 6ix?</span></h1>
        <div class="spacer"></div>
        <button type="button" class="box click" style="display: flex; flex-direction: column; gap: 8px; padding: 22px; min-height: 180px; background: #e4e4e4" data-go="pick-scenes">
          <span style="font-size: 22px; font-weight: 700">I'm going out</span>
          <span class="sm">Nights picked for you and your crew, every week.</span>
          <span style="flex-grow: 1"></span>
          <span class="ibtn" style="align-self: flex-end; background: #111">${icon('arrow', 18, '#fff')}</span>
        </button>
        <button type="button" class="box click" style="display: flex; flex-direction: column; gap: 8px; padding: 22px; min-height: 180px" data-go="demand-map">
          <span style="font-size: 22px; font-weight: 700">I host events</span>
          <span class="sm">See what Toronto wants before you book.</span>
          <span style="flex-grow: 1"></span>
          <span class="ibtn" style="align-self: flex-end; background: #111">${icon('arrow', 18, '#fff')}</span>
        </button>
        <p class="sm" style="text-align: center; margin-top: 8px">You can switch anytime from your profile.</p>
      </div>
    `,
  });

  /* ----- 01-03 · Pick your scenes ----- */
  addScreen({
    id: "pick-scenes",
    code: "01-03",
    group: "Onboarding",
    title: "Pick your scenes",
    caption: "Teaches Sixer your taste on day one.",
    flowNote: "Attendee picks scenes and adds past events, then sets home and areas of interest. Friends can connect (opt-in). Sixer builds a starter 6ix Weekly on day one.",
    tabs: null,
    render: () => `
      <div class="screen" style="padding-bottom: 22px">
        ${onboardingProgress(4)}
        <h1 class="h1" style="margin-top: 6px">What's your <span class="u">scene?</span></h1>
        <p class="sm">Pick at least two. Each one becomes a Scene Mix.</p>
        <div class="scene-grid">
          ${SCENES.map(sceneTile).join('')}
        </div>
        <div class="spacer"></div>
        <div class="row">
          ${backButton('choose-side')}
          <button type="button" class="btn solid" style="flex-grow: 1" data-go="weekly">Continue · 4 picked</button>
        </div>
      </div>
    `,
  });

  /* ----- 02-01 · 6ix Weekly ----- */
  addScreen({
    id: "weekly",
    code: "02-01",
    group: "Discovery",
    title: "6ix Weekly",
    caption: "Fresh picks every Monday, with fit scores.",
    flowNote: "Browse mixes: 6ix Weekly, Scene Mixes, Near You Radar. \"You asked, it’s happening\" alerts surface demand-booked events. Save an event to see the detail.",
    tabs: "attendee",
    render: () => `
      <div class="screen">
        <div class="between">
          <div>
            <p class="mono">Tuesday · Toronto</p>
            <h1 class="h1" style="margin-top: 4px">Your week, <span class="u">picked.</span></h1>
          </div>
          <span class="av">Y</span>
        </div>
        <button type="button" class="soft click row" style="padding: 8px 12px; min-height: 44px; border-radius: 22px; background: #fff" data-go="ask-sixer">
          <span class="av" style="width: 26px; height: 26px; font-size: 10px">S</span>
          <span class="sm" style="flex-grow: 1">Ask Sixer what to do today</span>
          <span>→</span>
        </button>
        <div class="chips"><span class="chip on">Anytime</span><span class="chip">Daytime</span><span class="chip">Evening</span></div>
        <button type="button" class="box click between" style="padding: 10px 12px; background: #f4f4f4" data-go="why-sixer-picked">
          <span style="display: flex; flex-direction: column; gap: 2px"><span class="mono" style="font-size: 10px">You asked, it's happening</span><span style="font-size: 14px; font-weight: 600">Sunday Vinyl Brunch · Sun</span></span><span>→</span>
        </button>
        <div class="between" style="margin-top: 4px">
          <div><p class="h2">6ix Weekly</p><p class="sm">Fresh every Monday</p></div>
          <span class="sm" style="text-decoration: underline">See all</span>
        </div>
        <div style="display: flex; gap: 10px; overflow: hidden">
          <button type="button" class="box click" style="width: 250px; flex-shrink: 0; padding: 0; overflow: hidden; display: flex; flex-direction: column; background: #fff" data-go="why-sixer-picked">
            <span class="ph" style="width: 247px; height: 200px; border: none; border-bottom: 1px solid #8f8f8f"><span class="lbl">[Event image]</span><span class="chip" style="position: absolute; left: 8px; top: 8px">3.1 km</span><span class="chip" style="position: absolute; right: 8px; top: 8px">♡</span></span>
            <span style="padding: 10px 12px; display: flex; flex-direction: column; gap: 2px"><span class="mono" style="font-size: 10px">98% your vibe</span><span style="font-size: 17px; font-weight: 700">Kensington After Dark</span><span class="sm">Sat · Kensington · Free</span></span>
          </button>
          <div class="soft" style="width: 110px; flex-shrink: 0; overflow: hidden; display: flex; flex-direction: column">
            <div class="ph" style="height: 200px; border: none; border-bottom: 1px solid #b5b5b5"></div>
            <div style="padding: 10px 8px"><p class="mono" style="font-size: 10px">98% yo…</p><p style="font-weight: 700">Open…</p></div>
          </div>
        </div>
        <button type="button" class="soft click between" style="padding: 10px 12px; min-height: 44px; border-style: dashed" data-go="id-go-if"><span class="sm">Don't see it? Tell hosts <b>"I'd go if…"</b></span><span>→</span></button>
      </div>
    `,
  });

  /* ----- 02-02 · Near You map ----- */
  addScreen({
    id: "near-you",
    code: "02-02",
    group: "Discovery",
    title: "Near You map",
    caption: "Only your scenes on the map, with distance.",
    flowNote: "Near You Radar: new events that match you, close to where you are. Tap a pin card to open the event.",
    tabs: "attendee",
    render: () => `
      <div class="screen" style="padding: 0">
        <div class="ph" style="position: absolute; left: 0; top: 0; width: 390px; height: 844px; border: none"><span class="lbl" style="position: absolute; left: 12px; top: 470px">[Map · Toronto]</span>
          <span class="mono" style="position: absolute; left: 70px; top: 150px; background: #ececec">The Annex</span>
          <span class="mono" style="position: absolute; left: 150px; top: 250px; background: #ececec">Kensington</span>
          <span class="mono" style="position: absolute; left: 60px; top: 300px; background: #ececec">Queen West</span>
          <span class="mono" style="position: absolute; left: 230px; top: 345px; background: #ececec">Downtown</span>
          <span class="mono" style="position: absolute; left: 160px; top: 420px; background: #ececec">Harbourfront</span>
          <span class="pin" style="left: 70px; top: 180px"></span><span class="pin" style="left: 76px; top: 210px"></span><span class="pin" style="left: 200px; top: 276px"></span><span class="pin" style="left: 120px; top: 320px"></span><span class="pin" style="left: 172px; top: 330px"></span><span class="pin" style="left: 270px; top: 375px"></span><span class="pin" style="left: 40px; top: 400px"></span><span class="pin" style="left: 22px; top: 250px"></span>
        </div>
        <div style="position: absolute; left: 14px; right: 14px; top: 20px; display: flex; flex-direction: column; gap: 8px">
          <label class="box row" style="padding: 0 14px; min-height: 46px; border-radius: 23px">${icon('search', 16, '#111')}<input type="search" placeholder="What are you up for?" aria-label="Search" style="border: none; outline: none; flex-grow: 1; font: 400 14px 'IBM Plex Sans', sans-serif; background: transparent"></label>
          <div class="chips"><span class="chip on">Your scenes</span><span class="chip">Live Sets</span><span class="chip">Food Pop-ups</span><span class="chip">Art Nights</span></div>
        </div>
        <div style="position: absolute; right: 14px; top: 140px; display: flex; flex-direction: column; gap: 6px">
          <button type="button" class="ibtn" aria-label="Zoom in">+</button><button type="button" class="ibtn" aria-label="Zoom out">−</button><button type="button" class="ibtn" aria-label="My location">${icon('locate', 16, '#111')}</button>
        </div>
        <button type="button" class="box click row" style="position: absolute; left: 14px; right: 14px; bottom: 96px; padding: 10px; gap: 12px" data-go="why-sixer-picked">
          <span class="ph" style="width: 96px; height: 96px; border-radius: 10px; flex-shrink: 0"><span class="lbl">[Img]</span></span>
          <span style="display: flex; flex-direction: column; gap: 3px"><span class="chip" style="align-self: flex-start; min-height: 22px">700 m</span><span style="font-size: 17px; font-weight: 700">Sunday Vinyl Brunch</span><span class="sm">Sun · Ossington</span><span class="mono" style="font-size: 10px">97% your vibe</span></span>
        </button>
      </div>
    `,
  });

  /* ----- 03-01 · Why Sixer picked this ----- */
  addScreen({
    id: "why-sixer-picked",
    code: "03-01",
    group: "Sixer, the AI guide",
    title: "Why Sixer picked this",
    caption: "Fit score and plain-language reasons.",
    flowNote: "Sixer explains the pick. Attendee checks date, venue, price and fit score. Going with friends? Yes → Crew Blend. Just me → buy ticket on the host’s own page.",
    tabs: null,
    render: () => `
      <div class="screen" style="padding-bottom: 22px; gap: 10px">
        <div class="ph" style="position: absolute; left: 0; top: 0; width: 390px; height: 230px; border: none; border-bottom: 1px solid #8f8f8f"><span class="lbl">[Event hero image]</span></div>
        <div class="between" style="position: relative">
          ${backButton('weekly')}
          <button type="button" class="ibtn" aria-label="Save">♡</button>
        </div>
        <div style="height: 130px"></div>
        <div class="chips"><span class="chip">700 m from home</span><span class="chip">All ages</span><span class="chip on">Booked from demand</span></div>
        <h1 class="h1" style="font-size: 30px">Sunday Vinyl Brunch</h1>
        <div class="between"><span class="sm">The Parlour Room, Ossington</span><span class="sm">★ 4 (106)</span></div>
        <div class="box row" style="padding: 12px; gap: 12px; align-items: flex-start">
          <span style="width: 52px; height: 52px; border-radius: 26px; border: 4px solid #111; display: flex; align-items: center; justify-content: center; font-weight: 700; flex-shrink: 0; box-sizing: border-box">97</span>
          <div><p style="font-size: 14px; font-weight: 700">Why Sixer picked this</p><p class="sm" style="margin-top: 2px">You asked for this with "I'd go if…" · You picked <b>Live Sets</b> · <b>Maya and Kai</b> are going</p></div>
        </div>
        <div style="display: flex; flex-direction: column; gap: 7px; padding: 2px 4px">
          <p class="bd">◷ &nbsp;Sunday · 11 AM – 1:30 PM</p>
          <p class="bd">$ &nbsp;<b>$22</b> · tickets on the host's own page</p>
          <p class="bd">☺ &nbsp;<b>All ages</b> · families and under-19s welcome</p>
          <div class="between"><p class="bd">⌂ &nbsp;Hosted by <b>Loop Collective</b></p><span class="chip">Follow</span></div>
        </div>
        <div class="spacer"></div>
        <div class="row">
          <button type="button" class="btn solid" style="flex-grow: 1" data-go="event-day">Get tickets ↗</button>
          <button type="button" class="ibtn" aria-label="Plan with my crew" data-go="crew-blend">${icon('crew', 18, '#111')}</button>
        </div>
      </div>
    `,
  });

  /* ----- 03-02 · Ask Sixer ----- */
  addScreen({
    id: "ask-sixer",
    code: "03-02",
    group: "Sixer, the AI guide",
    title: "Ask Sixer",
    caption: "Plans a day for you and your friends.",
    flowNote: "Chat with Sixer. It recommends picks with crew fit, distance, price and who’s going, then opens the chosen event.",
    tabs: null,
    render: () => `
      <div class="screen" style="padding-bottom: 22px">
        <div class="between" style="padding-bottom: 10px; border-bottom: 1px solid #b5b5b5">
          <div class="row"><span class="av">S</span><span class="h2">Sixer</span></div>
          <button type="button" class="ibtn" aria-label="Close" data-go="weekly">✕</button>
        </div>
        <div class="soft" style="align-self: flex-end; max-width: 260px; padding: 10px 12px; border-radius: 16px 16px 4px 16px; background: #e8e8e8; border-color: #e8e8e8; font-size: 13px">Plan Friday for me, Maya and Kai</div>
        <div class="bd" style="display: flex; flex-direction: column; gap: 8px; padding-right: 20px">
          <p>My pick: <span class="u">Sunday Vinyl Brunch</span> (90% for the crew; Sun, 700 m from home, $22, Maya + Kai going).</p>
          <p>Also good:<br>– <span class="u">Kensington After Dark</span>: Sat, 3.1 km from home, Free, Maya going<br>– <span class="u">Kamayan Night</span>: Fri, 2.9 km from home, $35</p>
          <p>Close this and I'll open <span class="u">Sunday Vinyl Brunch</span> for you.</p>
        </div>
        <div style="display: flex; gap: 8px">
          <button type="button" class="soft click" style="width: 190px; padding: 0; overflow: hidden; display: flex; flex-direction: column" data-go="why-sixer-picked"><span class="ph" style="width: 188px; height: 80px; border: none; border-bottom: 1px solid #b5b5b5"></span><span style="padding: 8px 10px; display: flex; flex-direction: column"><span class="mono" style="font-size: 10px">90% your vibe</span><span style="font-weight: 700; font-size: 13px">Sunday Vinyl Brunch</span><span class="sm">Sun · Ossington</span></span></button>
          <button type="button" class="soft click" style="width: 130px; padding: 0; overflow: hidden; display: flex; flex-direction: column" data-go="why-sixer-picked"><span class="ph" style="width: 128px; height: 80px; border: none; border-bottom: 1px solid #b5b5b5"></span><span style="padding: 8px 10px; display: flex; flex-direction: column"><span style="font-weight: 700; font-size: 13px">Kensington After Dark</span><span class="sm">Sat · Kensington</span></span></button>
        </div>
        <div class="spacer"></div>
        <div class="row">
          <label class="box row" style="flex-grow: 1; padding: 0 14px; min-height: 46px; border-radius: 23px"><input type="text" placeholder="Ask Sixer anything" aria-label="Ask Sixer" style="border: none; outline: none; flex-grow: 1; font: 400 14px 'IBM Plex Sans', sans-serif; background: transparent"></label>
          <button type="button" class="ibtn" aria-label="Send" style="background: #111">${icon('arrow', 18, '#fff')}</button>
        </div>
      </div>
    `,
  });

  /* ----- 04-01 · Crew Blend ----- */
  addScreen({
    id: "crew-blend",
    code: "04-01",
    group: "Crew Blend",
    title: "Crew Blend",
    caption: "Group score, each person’s fit, the compromise.",
    flowNote: "Sixer blends taste profiles and ranks events for the group. Friends see the group score, not each other’s full profile. Friends tap “I’m in”, and each becomes an attendance.",
    tabs: "attendee",
    render: () => `
      <div class="screen">
        <p class="mono">Taste for the whole group</p>
        <h1 class="h1">Crew Blend</h1>
        <div style="display: flex; gap: 10px">
          <div style="display: flex; flex-direction: column; align-items: center; gap: 3px"><span class="av" style="width: 50px; height: 50px; background: #111; color: #fff">Y</span><span class="sm">You</span></div>
          <div style="display: flex; flex-direction: column; align-items: center; gap: 3px"><span class="av" style="width: 50px; height: 50px; border-width: 3px">M</span><span class="sm">Maya</span></div>
          <div style="display: flex; flex-direction: column; align-items: center; gap: 3px"><span class="av" style="width: 50px; height: 50px; border-width: 3px">K</span><span class="sm">Kai</span></div>
          <div style="display: flex; flex-direction: column; align-items: center; gap: 3px"><span class="av" style="width: 50px; height: 50px; border-width: 3px">L</span><span class="sm">Leila</span></div>
          <div style="display: flex; flex-direction: column; align-items: center; gap: 3px"><span class="av" style="width: 50px; height: 50px; border: 1.5px dashed #888; color: #777">S</span><span class="sm" style="color: #777">Sam</span></div>
        </div>
        <p class="sm">Your crew is into <b>Live Sets, Food Pop-ups, Markets</b>.</p>
        <p class="h2" style="margin-top: 4px">Best for the crew</p>
        <div class="box" style="overflow: hidden; display: flex; flex-direction: column">
          <div class="ph" style="height: 100px; border: none; border-bottom: 1px solid #8f8f8f"><span class="lbl">[Event image]</span><span class="mono" style="position: absolute; left: 10px; top: 8px; background: #ececec">Sat · Kensington</span><span class="chip" style="position: absolute; right: 8px; top: 8px; min-height: 22px">Free</span><span style="position: absolute; left: 10px; bottom: 8px; font-weight: 700; font-size: 16px; background: #fff; padding: 0 4px">Kensington After Dark</span></div>
          <div style="padding: 12px; display: flex; flex-direction: column; gap: 6px">
            <div class="row" style="align-items: baseline"><span style="font-size: 32px; font-weight: 700">83%</span><span class="sm">for the crew · Leila lowest at 75%</span></div>
            <div class="row"><span class="sm" style="width: 44px">You</span><div class="bar" style="flex-grow: 1"><div style="width: 98%"></div></div><span class="sm" style="width: 30px; text-align: right">98%</span></div>
            <div class="row"><span class="sm" style="width: 44px">Maya</span><div class="bar" style="flex-grow: 1"><div style="width: 94%"></div></div><span class="sm" style="width: 30px; text-align: right">94%</span></div>
            <div class="row"><span class="sm" style="width: 44px">Kai</span><div class="bar" style="flex-grow: 1"><div style="width: 76%"></div></div><span class="sm" style="width: 30px; text-align: right">76%</span></div>
            <div class="row"><span class="sm" style="width: 44px">Leila</span><div class="bar" style="flex-grow: 1"><div style="width: 75%"></div></div><span class="sm" style="width: 30px; text-align: right">75%</span></div>
            <p class="sm"><b>Maya</b> is the biggest fan. <b>Leila</b> is lowest at 75%, but it's inside everyone's budget.</p>
            <button type="button" class="btn solid" style="margin-top: 2px">Start group plan</button>
          </div>
        </div>
      </div>
    `,
  });

  /* ----- 05-01 · “I’d go if…” ----- */
  addScreen({
    id: "id-go-if",
    code: "05-01",
    group: "Demand Signals",
    title: "“I’d go if…”",
    caption: "Attendees tell hosts what they want.",
    flowNote: "Attendee taps “I’d go if…”. Sixer aggregates signals (plus inferred taste demand) into the host demand map and drafts an idea brief.",
    tabs: null,
    render: () => `
      <div class="screen" style="padding-bottom: 22px; gap: 10px">
        <div class="row">${backButton('weekly')}<span class="h2">I'd go if…</span></div>
        <h1 class="h1" style="font-size: 24px; line-height: 1.25">I'd go to <span class="u">vinyl brunch</span>, <span class="u">sunday daytime</span>, near <span class="u">Ossington</span>, under <span class="u">$25</span>.</h1>
        <p class="mono" style="margin-top: 4px">What</p>
        <label class="soft row" style="padding: 0 14px; min-height: 44px; border-radius: 22px"><input type="text" value="vinyl brunch" aria-label="What" style="border: none; outline: none; flex-grow: 1; font: 400 14px 'IBM Plex Sans', sans-serif; background: transparent"></label>
        <p class="mono">Scene</p>
        <div class="chips"><span class="chip">Live Sets</span><span class="chip on">Food Pop-ups</span><span class="chip">Art Nights</span><span class="chip">Markets</span><span class="chip">Comedy</span><span class="chip">Dance Nights</span><span class="chip">Wellness</span><span class="chip">Film</span><span class="chip">Trivia &amp; Games</span><span class="chip">Outdoors</span></div>
        <p class="mono">When</p>
        <div class="chips"><span class="chip">Weeknight</span><span class="chip">Friday late</span><span class="chip">Saturday</span><span class="chip on">Sunday daytime</span></div>
        <p class="mono">Where</p>
        <div class="chips"><span class="chip">The Junction</span><span class="chip">High Park</span><span class="chip">Roncesvalles</span><span class="chip on">Ossington</span><span class="chip">Queen West</span><span class="chip">Kensington</span><span class="chip">Chinatown</span><span class="chip">The Annex</span><span class="chip">Downtown</span></div>
        <p class="mono">Budget</p>
        <div class="chips"><span class="chip">Free</span><span class="chip">Under $15</span><span class="chip on">Under $25</span><span class="chip">Any</span></div>
        <div class="spacer"></div>
        <button type="button" class="btn solid" data-go="demand-map">Send to hosts</button>
      </div>
    `,
  });

  /* ----- 05-02 · Host demand map ----- */
  addScreen({
    id: "demand-map",
    code: "05-02",
    group: "Demand Signals",
    title: "Host demand map",
    caption: "What Toronto wants, by neighbourhood.",
    flowNote: "Host reviews demand from matched, active people, e.g. “340 people near Ossington want a vinyl brunch”, then posts a draft to test it.",
    tabs: "host",
    render: () => `
      <div class="screen" style="gap: 10px">
        <p class="mono">Loop Collective · Host</p>
        <h1 class="h1">What Toronto wants</h1>
        <p class="sm">Live "I'd go if…" demand from matched, active people. Book what's wanted, then test it with a draft.</p>
        <div class="ph" style="height: 210px; border-radius: 12px"><span class="lbl" style="position: absolute; left: 8px; top: 8px">[Demand map]</span>
          <span class="bub" style="left: 118px; top: 70px; width: 70px; height: 70px">340</span>
          <span class="bub" style="left: 196px; top: 82px; width: 56px; height: 56px">268</span>
          <span class="bub" style="left: 160px; top: 128px; width: 50px; height: 50px">221</span>
          <span class="bub" style="left: 34px; top: 100px; width: 44px; height: 44px">164</span>
          <span class="bub" style="left: 290px; top: 110px; width: 40px; height: 40px">156</span>
          <span class="bub" style="left: 200px; top: 20px; width: 38px; height: 38px">132</span>
          <span class="bub" style="left: 100px; top: 150px; width: 44px; height: 44px">187</span>
        </div>
        <div class="between" style="margin-top: 2px"><p class="h2">Top requests</p><p class="sm">last 30 days</p></div>
        <div style="display: flex; flex-direction: column">
          <div class="row" style="padding: 8px 0; border-top: 1px solid #b5b5b5"><span style="font-size: 20px; font-weight: 700; width: 52px">340</span><div style="flex-grow: 1"><p style="font-size: 14px; font-weight: 600">Sunday vinyl brunch</p><p class="sm">Ossington · Sunday daytime · under $25</p></div><span class="chip on">Booked</span></div>
          <button type="button" class="click row" style="padding: 8px 0; border: none; border-top: 1px solid #b5b5b5; background: transparent" data-go="draft-test"><span style="font-size: 20px; font-weight: 700; width: 52px">268</span><span style="flex-grow: 1; display: flex; flex-direction: column"><span style="font-size: 14px; font-weight: 600">Late-night ramen pop-up</span><span class="sm">Kensington · Friday late · under $25</span></span><span>→</span></button>
          <div class="row" style="padding: 8px 0; border-top: 1px solid #b5b5b5"><span style="font-size: 20px; font-weight: 700; width: 52px">221</span><div style="flex-grow: 1"><p style="font-size: 14px; font-weight: 600">Weeknight queer dance party</p><p class="sm">[Area] · Weeknight · [budget]</p></div><span>→</span></div>
          <div class="row" style="padding: 8px 0; border-top: 1px solid #b5b5b5"><span style="font-size: 20px; font-weight: 700; width: 52px">187</span><div style="flex-grow: 1"><p style="font-size: 14px; font-weight: 600">Rooftop outdoor movie</p><p class="sm">Liberty Village · Saturday · under $20</p></div><span>→</span></div>
        </div>
      </div>
    `,
  });

  /* ----- 05-03 · Draft test ----- */
  addScreen({
    id: "draft-test",
    code: "05-03",
    group: "Demand Signals",
    title: "Draft test",
    caption: "Interest passes the threshold before booking.",
    flowNote: "Matched attendees save the draft. Past threshold? Yes → book venue, publish, optionally promote. No → Sixer suggests tweaks (price, day or area). Requesters hear first.",
    tabs: null,
    render: () => `
      <div class="screen" style="padding-bottom: 22px">
        <div class="row">${backButton('demand-map')}<span class="h2">Draft test</span></div>
        <h1 class="h1" style="font-size: 24px">Late-night ramen pop-up</h1>
        <p class="sm">Kensington · Friday late · $15 · All ages</p>
        <div class="between" style="margin-top: 8px"><span style="font-size: 15px; font-weight: 700">183 interested</span><span class="mono">threshold 150</span></div>
        <div class="bar" style="height: 10px"><div style="width: 100%; height: 10px"></div></div>
        <p class="sm">Interest passed the threshold. Go ahead and book.</p>
        <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 4px">
          <div class="soft row" style="padding: 12px; align-items: flex-start"><span class="av" style="width: 26px; height: 26px; font-size: 12px">1</span><div><p style="font-size: 14px; font-weight: 600">Venue and talent booked</p><p class="sm">Outside the app, on your own terms</p></div></div>
          <div class="soft row" style="padding: 12px; align-items: flex-start"><span class="av" style="width: 26px; height: 26px; font-size: 12px">2</span><div><p style="font-size: 14px; font-weight: 600">Publish with your ticket link</p><p class="sm">Tickets stay on your page</p></div></div>
          <div class="soft row" style="padding: 12px; align-items: flex-start"><span class="av" style="width: 26px; height: 26px; font-size: 12px">3</span><div><p style="font-size: 14px; font-weight: 600">Promote (optional)</p><p class="sm">Shown with a "Promoted" label. Never changes rank.</p></div></div>
          <div class="soft row" style="padding: 12px; align-items: flex-start"><span class="av" style="width: 26px; height: 26px; font-size: 12px">4</span><div><p style="font-size: 14px; font-weight: 600">Send "You asked, it's happening"</p><p class="sm">183 people who saved the draft hear first</p></div></div>
        </div>
        <div class="spacer"></div>
        <button type="button" class="btn solid" data-go="host-insights">Publish event</button>
      </div>
    `,
  });

  /* ----- 06-01 · Event day hub ----- */
  addScreen({
    id: "event-day",
    code: "06-01",
    group: "Event day & north star",
    title: "Event day hub",
    caption: "Getting there, entrances, live host updates.",
    flowNote: "Sixer sends a reminder the day before. On the day: TTC/GO route, entrances, live updates from the host, opt-in attendee chat.",
    tabs: null,
    render: () => `
      <div class="screen" style="padding-bottom: 22px; gap: 10px">
        <div class="ph" style="position: absolute; left: 0; top: 0; width: 390px; height: 200px; border: none; border-bottom: 1px solid #8f8f8f"><span class="lbl">[Event image · TONIGHT]</span></div>
        <div class="between" style="position: relative">${backButton('why-sixer-picked')}<span class="chip on">● Event day</span></div>
        <div style="height: 104px"></div>
        <h1 class="h1" style="font-size: 26px">Lo-fi Listening Session</h1>
        <p class="sm">Starts in 44 min · Blue Room</p>
        <div class="soft" style="padding: 12px; display: flex; flex-direction: column; gap: 4px">
          <div class="between"><p style="font-size: 14px; font-weight: 700">Getting there</p><span class="sm">250 m</span></div>
          <p class="sm">505 Dundas streetcar west, 3 stops, then 4 min walk. GO and rideshare options open in your maps app.</p>
        </div>
        <div class="soft" style="padding: 12px; display: flex; flex-direction: column; gap: 4px">
          <p style="font-size: 14px; font-weight: 700">Entrances</p>
          <p class="sm">· Laneway door (tickets)<br>· Front door (bar only)</p>
        </div>
        <div class="soft" style="padding: 12px; display: flex; flex-direction: column; gap: 6px">
          <p style="font-size: 14px; font-weight: 700">● Live updates</p>
          <div class="row" style="align-items: flex-start"><span class="mono" style="width: 58px; flex-shrink: 0">5:05 PM</span><p class="sm">Today's record: a 1977 jazz-funk classic. Bring questions for the Q&amp;A.</p></div>
          <div class="row" style="align-items: flex-start"><span class="mono" style="width: 58px; flex-shrink: 0">4:40 PM</span><p class="sm">Doors 30 minutes before start. Use the laneway door; the front is the bar.</p></div>
        </div>
        <div class="soft between" style="padding: 10px 12px"><span class="sm">Attendee chat (opt-in)</span><span>→</span></div>
        <div class="spacer"></div>
        <button type="button" class="btn solid" data-go="checked-in">${icon('qr', 16, '#fff')}Check in at the door</button>
      </div>
    `,
  });

  /* ----- 06-02 · Matched attendance ----- */
  addScreen({
    id: "checked-in",
    code: "06-02",
    group: "Event day & north star",
    title: "Matched attendance",
    caption: "Check-in counts toward the north star.",
    flowNote: "Scan the door QR or location match. Sixer logs a matched attendance, then a morning recap asks how it went and updates taste.",
    tabs: null,
    render: () => `
      <div class="screen" style="padding-bottom: 22px; align-items: center; text-align: center">
        <div style="align-self: flex-start">${backButton('event-day')}</div>
        <div style="height: 80px"></div>
        <span style="width: 110px; height: 110px; border-radius: 55px; background: #111; display: flex; align-items: center; justify-content: center">${icon('check', 52, '#fff')}</span>
        <h1 class="h1" style="margin-top: 12px">You're in.</h1>
        <p class="bd" style="color: #333; padding: 0 12px">Checked in at Blue Room. That's a matched attendance: Sixer picked it and you showed up. It counts toward your 6ix Wrapped.</p>
        <p class="sm" style="margin-top: 8px">Afterwards we'll ask how it went.</p>
        <button type="button" class="btn" style="width: 100%; margin-top: 12px" data-go="event-day">Back to the hub</button>
        <div class="spacer"></div>
        <p class="mono" style="font-size: 10px">Counts toward the north star: weekly matched attendances</p>
      </div>
    `,
  });

  /* ----- 06-03 · Host insights ----- */
  addScreen({
    id: "host-insights",
    code: "06-03",
    group: "Event day & north star",
    title: "Host insights",
    caption: "Matched guests, demand share, solo vs crew.",
    flowNote: "Sixer builds insights from check-ins. Host plans the next edition from the demand map.",
    tabs: "host",
    render: () => `
      <div class="screen" style="gap: 10px">
        <p class="mono">Last edition · Sunday Vinyl Brunch</p>
        <h1 class="h1">How it went</h1>
        <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px">
          <div class="box" style="padding: 12px; background: #111; color: #fff"><p style="font-size: 28px; font-weight: 700">164</p><p style="font-size: 11px; color: #ddd">matched guests of 212 check-ins</p></div>
          <div class="box" style="padding: 12px"><p style="font-size: 28px; font-weight: 700">71%</p><p class="sm" style="font-size: 11px">came from demand signals</p></div>
          <div class="box" style="padding: 12px"><p style="font-size: 28px; font-weight: 700">4.7★</p><p class="sm" style="font-size: 11px">average recap rating</p></div>
          <div class="box" style="padding: 12px"><p style="font-size: 28px; font-weight: 700">38%</p><p class="sm" style="font-size: 11px">came back within a month</p></div>
        </div>
        <p class="h2" style="margin-top: 4px">Solo vs crew</p>
        <div style="display: flex; gap: 4px"><div style="width: 38%; height: 10px; border: 1.5px solid #111; border-radius: 5px; box-sizing: border-box"></div><div style="width: 62%; height: 10px; background: #111; border-radius: 5px"></div></div>
        <div class="between"><span class="sm">Solo 38%</span><span class="sm">Crews 62% · average crew of 3.4</span></div>
        <p class="h2" style="margin-top: 4px">What guests asked for next</p>
        <div style="display: flex; flex-direction: column">
          <div class="row" style="padding: 6px 0; border-top: 1px solid #b5b5b5"><span style="font-weight: 700; width: 40px">118</span><span class="bd">Evening edition on Saturdays</span></div>
          <div class="row" style="padding: 6px 0; border-top: 1px solid #b5b5b5"><span style="font-weight: 700; width: 40px">86</span><span class="bd">Add a record swap table</span></div>
          <div class="row" style="padding: 6px 0; border-top: 1px solid #b5b5b5"><span style="font-weight: 700; width: 40px">64</span><span class="bd">Bigger room, 150+ capacity</span></div>
        </div>
        <button type="button" class="btn solid" data-go="demand-map">Plan next from the demand map</button>
      </div>
    `,
  });

  /* ----- 07-01 · 19+ check ----- */
  addScreen({
    id: "age-check",
    code: "07-01",
    group: "Age-friendly by default",
    title: "19+ check",
    caption: "Asked once, only for 19+ events.",
    flowNote: "Only appears when an event requires ID. Confirm once and it’s remembered; everything else stays open to all ages.",
    tabs: null,
    render: () => `
      <div class="screen" style="padding-bottom: 22px; align-items: center; text-align: center">
        <div style="align-self: flex-start">${backButton('weekly')}</div>
        <div style="height: 60px"></div>
        <span style="width: 110px; height: 110px; border-radius: 55px; border: 3px solid #111; display: flex; align-items: center; justify-content: center; font-size: 34px; font-weight: 700; box-sizing: border-box">19+</span>
        <h1 class="h1" style="margin-top: 12px">Rooftop Deep House is 19+</h1>
        <p class="bd" style="color: #333; padding: 0 10px">Level 22 Rooftop checks ID at the door. Confirm once and we won't ask again.</p>
        <button type="button" class="btn solid" style="width: 100%; margin-top: 14px" data-go="event-day">I'm 19 or older</button>
        <button type="button" class="btn" style="width: 100%" data-go="weekly">I'm under 19</button>
        <div class="spacer"></div>
        <p class="sm">We only ask for events that require it. Everything else on The 6ix Sense is open to all ages.</p>
      </div>
    `,
  });
})();
