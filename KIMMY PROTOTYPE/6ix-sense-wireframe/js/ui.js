/* The 6ix Sense wireframe: shared UI helpers.
   Loaded first. Creates the SIX namespace that screens.js and app.js use. */
window.SIX = { screens: [], ui: {} };

(function () {
  const SIX = window.SIX;

  /* Line icons, drawn on a 24 x 24 grid. Add a new icon by adding its paths here. */
  const ICON_PATHS = {
    back: '<path d="M15 18l-6-6 6-6"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
    locate: '<circle cx="12" cy="12" r="4"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>',
    qr: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3h-3zM20 14v7h-6"/>',
    home: '<path d="M4 11l8-7 8 7v9H4z"/>',
    map: '<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2zM9 4v14M15 6v14"/>',
    sixer: '<circle cx="12" cy="12" r="8"/><circle cx="9.5" cy="11" r="0.8"/><circle cx="14.5" cy="11" r="0.8"/>',
    crew: '<circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M15 14.5c3 0 6 2 6 5.5"/>',
    ticket: '<path d="M3 8a2 2 0 0 0 0 4v0a2 2 0 0 1 0 4v2h18v-2a2 2 0 0 1 0-4 2 2 0 0 0 0-4V6H3z"/>',
    bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9V16h7v-2.1A6 6 0 0 0 12 3z"/>',
    draft: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5"/>',
    chart: '<path d="M4 20h16M7 16v-5M12 16V6M17 16v-8"/>',
    profile: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/>',
  };

  /* icon('back')  or  icon('arrow', 18, '#fff') */
  const icon = (name, size = 18, color = 'currentColor') =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[name]}</svg>`;

  /* Round back button in a screen's top-left corner. `target` is a screen id. */
  const backButton = (target) =>
    `<button type="button" class="ibtn" aria-label="Back" data-go="${target}">${icon('back', 18, '#111')}</button>`;

  /* "4 of 8" pill at the top of the onboarding screens. */
  const ONBOARDING_STEPS = 8;
  const onboardingProgress = (step) => {
    const dots = Array.from({ length: ONBOARDING_STEPS }, (_, i) => `<i${i === step - 1 ? ' class="on"' : ''}></i>`).join('');
    return `<div class="soft between progress-pill"><span class="mono">${step} of ${ONBOARDING_STEPS}</span><span class="dots">${dots}</span></div>`;
  };

  /* Bottom tab bars. Each tab: [icon, label, screen id to open (or null), extra class]. */
  const TAB_BARS = {
    attendee: {
      label: 'Attendee tabs',
      tabs: [
        ['home', 'Home · 6ix Weekly', 'weekly'],
        ['map', 'Map · Near You', 'near-you'],
        ['sixer', 'Ask Sixer', 'ask-sixer', 'sixer'],
        ['crew', 'Crew Blend', 'crew-blend'],
        ['ticket', 'Tickets · Event day hub', 'event-day'],
      ],
    },
    host: {
      label: 'Host tabs',
      tabs: [
        ['bulb', 'Demand map', 'demand-map'],
        ['draft', 'Draft test', 'draft-test'],
        ['sixer', 'Sixer', null, 'sixer'],
        ['chart', 'Insights', 'host-insights'],
        ['profile', 'Host profile', null],
      ],
    },
  };

  /* tabBar('attendee', 'weekly') draws the attendee bar with the Home tab active. */
  const tabBar = (role, activeScreenId) => {
    const bar = TAB_BARS[role];
    if (!bar) return '';
    const buttons = bar.tabs.map(([iconName, label, target, extra = '']) => {
      const classes = ['tab', extra, target === activeScreenId ? 'on' : ''].filter(Boolean).join(' ');
      return `<button type="button" class="${classes}" aria-label="${label}"${target ? ` data-go="${target}"` : ''}>${icon(iconName, 20)}</button>`;
    }).join('');
    return `<nav class="tabs" aria-label="${bar.label}">${buttons}</nav>`;
  };

  SIX.ui = { icon, backButton, onboardingProgress, tabBar };
})();
