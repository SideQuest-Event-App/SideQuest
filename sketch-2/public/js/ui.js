/* Sketch 1 — shared UI helpers: icons, posters, avatars, components, and lookups into app data. */
window.SQ = window.SQ || {};
(function () {
  const SQ = window.SQ;

  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const attr = (o = {}) => Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== false).map(([k, v]) => (v === true ? k : `${k}="${esc(v)}"`)).join(" ");

  // ---------- Icons: the Figma Icon/* set (24-unit, 1.75 stroke), drawn in currentColor ----------
  // Exported from the Figma file's components; names match the Figma layer names (Icon/chevR -> chevR).
  const P = {
    access: '<path d="M12 6.3C12.9941 6.3 13.8 5.49411 13.8 4.5C13.8 3.50588 12.9941 2.7 12 2.7C11.0059 2.7 10.2 3.50588 10.2 4.5C10.2 5.49411 11.0059 6.3 12 6.3Z" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 8.5L12 10M12 10L19 8.5M12 10V15M12 15L9 21M12 15L15 21" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>',
    alert: '<path d="M12 3L2 20H22L12 3Z" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 10V14M12 17V17.5" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>',
    arrow: '<path d="M5 12H19M13 18L19 12L13 6" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>',
    back: '<path d="M15 5L8 12L15 19" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>',
    bell: '<path d="M6 8C6 6.4087 6.63214 4.88258 7.75736 3.75736C8.88258 2.63214 10.4087 2 12 2C13.5913 2 15.1174 2.63214 16.2426 3.75736C17.3679 4.88258 18 6.4087 18 8C18 15 21 17 21 17H3C3 17 6 15 6 8Z" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/><path d="M10 21C10 21.5304 10.2107 22.0391 10.5858 22.4142C10.9609 22.7893 11.4696 23 12 23C12.5304 23 13.0391 22.7893 13.4142 22.4142C13.7893 22.0391 14 21.5304 14 21" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>',
    bookmark: '<path d="M6 3H18V21L12 16.5L6 21V3Z" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>',
    bookmarkFill: '<path d="M6 3H18V21L12 16.5L6 21V3Z" fill="currentColor"/>',
    bubble: '<path d="M4 5H20V16H9L4 20V5Z" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>',
    bulb: '<path d="M9 18H15M10 22H14" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 2C10.5218 2.01327 9.08564 2.49421 7.89753 3.37389C6.70942 4.25356 5.83031 5.48679 5.3862 6.89683C4.94209 8.30687 4.9558 9.82131 5.42535 11.2231C5.89489 12.6248 6.79618 13.842 8.00001 14.7V17H16V14.7C17.2038 13.842 18.1051 12.6248 18.5747 11.2231C19.0442 9.82131 19.0579 8.30687 18.6138 6.89683C18.1697 5.48679 17.2906 4.25356 16.1025 3.37389C14.9144 2.49421 13.4783 2.01327 12 2Z" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>',
    cal: '<path d="M19 5H5C3.89543 5 3 5.89543 3 7V19C3 20.1046 3.89543 21 5 21H19C20.1046 21 21 20.1046 21 19V7C21 5.89543 20.1046 5 19 5Z" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/><path d="M3 10H21M8 3V7M16 3V7" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>',
    camera: '<path d="M3 8C3 7.46957 3.21071 6.96086 3.58579 6.58579C3.96086 6.21071 4.46957 6 5 6H7L9 4H15L17 6H19C19.5304 6 20.0391 6.21071 20.4142 6.58579C20.7893 6.96086 21 7.46957 21 8V18C21 18.5304 20.7893 19.0391 20.4142 19.4142C20.0391 19.7893 19.5304 20 19 20H5C4.46957 20 3.96086 19.7893 3.58579 19.4142C3.21071 19.0391 3 18.5304 3 18V8Z" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 16.5C13.933 16.5 15.5 14.933 15.5 13C15.5 11.067 13.933 9.5 12 9.5C10.067 9.5 8.5 11.067 8.5 13C8.5 14.933 10.067 16.5 12 16.5Z" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>',
    card: '<path d="M19 6H5C3.89543 6 3 6.89543 3 8V17C3 18.1046 3.89543 19 5 19H19C20.1046 19 21 18.1046 21 17V8C21 6.89543 20.1046 6 19 6Z" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/><path d="M3 10H21M7 15H11" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>',
    cash: '<path d="M19 6H5C3.89543 6 3 6.89543 3 8V16C3 17.1046 3.89543 18 5 18H19C20.1046 18 21 17.1046 21 16V8C21 6.89543 20.1046 6 19 6Z" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 14.5C13.3807 14.5 14.5 13.3807 14.5 12C14.5 10.6193 13.3807 9.5 12 9.5C10.6193 9.5 9.5 10.6193 9.5 12C9.5 13.3807 10.6193 14.5 12 14.5Z" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20V13M22 20H2" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>',
    check: '<path d="M20 6L9 17L4 12" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>',
    chevR: '<path d="M9 5L16 12L9 19" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>',
    chevU: '<path d="M5 15L12 8L19 15" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>',
    clock: '<path d="M12 21C16.9706 21 21 16.9706 21 12C21 7.02944 16.9706 3 12 3C7.02944 3 3 7.02944 3 12C3 16.9706 7.02944 21 12 21Z" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 7V12L15 14" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>',
    crew: '<path d="M9 11.5C10.933 11.5 12.5 9.933 12.5 8C12.5 6.067 10.933 4.5 9 4.5C7.067 4.5 5.5 6.067 5.5 8C5.5 9.933 7.067 11.5 9 11.5Z" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/><path d="M2.5 20C2.5 18.2761 3.18482 16.6228 4.40381 15.4038C5.62279 14.1848 7.27609 13.5 9 13.5C10.7239 13.5 12.3772 14.1848 13.5962 15.4038C14.8152 16.6228 15.5 18.2761 15.5 20" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/><path d="M16 4.5C16.9283 4.5 17.8185 4.86875 18.4749 5.52513C19.1313 6.1815 19.5 7.07174 19.5 8C19.5 8.92826 19.1313 9.8185 18.4749 10.4749C17.8185 11.1313 16.9283 11.5 16 11.5" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/><path d="M21.5 20C21.5032 18.6232 21.0692 17.2809 20.2605 16.1666C19.4517 15.0523 18.31 14.2236 17 13.8" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>',
    door: '<path d="M4 21H20M6 21V4C6 3.73478 6.10536 3.48043 6.29289 3.29289C6.48043 3.10536 6.73478 3 7 3H17C17.2652 3 17.5196 3.10536 17.7071 3.29289C17.8946 3.48043 18 3.73478 18 4V21" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/><path d="M14.5 12.8C14.9418 12.8 15.3 12.4418 15.3 12C15.3 11.5582 14.9418 11.2 14.5 11.2C14.0581 11.2 13.7 11.5582 13.7 12C13.7 12.4418 14.0581 12.8 14.5 12.8Z" fill="currentColor"/>',
    edit: '<path d="M4 20H8L19 9L15 5L4 16V20Z" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/><path d="M14 6L18 10" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>',
    external: '<path d="M7 17L17 7M8 7H17V16" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>',
    eye: '<path d="M2 12C2 12 5.5 5 12 5C18.5 5 22 12 22 12C22 12 18.5 19 12 19C5.5 19 2 12 2 12Z" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 15C13.6569 15 15 13.6569 15 12C15 10.3431 13.6569 9 12 9C10.3431 9 9 10.3431 9 12C9 13.6569 10.3431 15 12 15Z" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>',
    globe: '<path d="M12 21C16.9706 21 21 16.9706 21 12C21 7.02944 16.9706 3 12 3C7.02944 3 3 7.02944 3 12C3 16.9706 7.02944 21 12 21Z" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/><path d="M3 12H21M12 3C14.1162 5.52153 15.2762 8.70813 15.2762 12C15.2762 15.2919 14.1162 18.4785 12 21C9.8838 18.4785 8.72381 15.2919 8.72381 12C8.72381 8.70813 9.8838 5.52153 12 3Z" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>',
    heart: '<path d="M20.8 5.60001C20.2889 5.08601 19.6812 4.67811 19.0119 4.39977C18.3426 4.12144 17.6249 3.97815 16.9 3.97815C16.1751 3.97815 15.4574 4.12144 14.7881 4.39977C14.1188 4.67811 13.5111 5.08601 13 5.60001L12 6.70001L11 5.60001C9.96565 4.56566 8.56278 3.98457 7.1 3.98457C5.63721 3.98457 4.23434 4.56566 3.2 5.60001C2.16565 6.63435 1.58456 8.03722 1.58456 9.50001C1.58456 10.9628 2.16565 12.3657 3.2 13.4L12 22L20.8 13.4C21.314 12.8889 21.7219 12.2812 22.0002 11.6119C22.2786 10.9426 22.4219 10.2249 22.4219 9.50001C22.4219 8.77513 22.2786 8.05741 22.0002 7.38811C21.7219 6.71881 21.314 6.11112 20.8 5.60001Z" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>',
    home2: '<path d="M3 11L12 4L21 11" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 10V20H19V10" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>',
    host: '<path d="M12 12C14.2091 12 16 10.2091 16 8C16 5.79086 14.2091 4 12 4C9.79086 4 8 5.79086 8 8C8 10.2091 9.79086 12 12 12Z" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 21C4 18.8783 4.84285 16.8434 6.34315 15.3431C7.84344 13.8429 9.87827 13 12 13C14.1217 13 16.1566 13.8429 17.6569 15.3431C19.1571 16.8434 20 18.8783 20 21" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>',
    id: '<path d="M19 5H5C3.89543 5 3 5.89543 3 7V17C3 18.1046 3.89543 19 5 19H19C20.1046 19 21 18.1046 21 17V7C21 5.89543 20.1046 5 19 5Z" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/><path d="M9 13.2C10.215 13.2 11.2 12.215 11.2 11C11.2 9.78498 10.215 8.8 9 8.8C7.78498 8.8 6.8 9.78498 6.8 11C6.8 12.215 7.78498 13.2 9 13.2Z" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 16C6 15.2044 6.31607 14.4413 6.87868 13.8787C7.44129 13.3161 8.20435 13 9 13C9.79565 13 10.5587 13.3161 11.1213 13.8787C11.6839 14.4413 12 15.2044 12 16M14 10H18M14 13H18" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>',
    image: '<path d="M19 3H5C3.89543 3 3 3.89543 3 5V19C3 20.1046 3.89543 21 5 21H19C20.1046 21 21 20.1046 21 19V5C21 3.89543 20.1046 3 19 3Z" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/><path d="M9 11C10.1046 11 11 10.1046 11 9C11 7.89543 10.1046 7 9 7C7.89543 7 7 7.89543 7 9C7 10.1046 7.89543 11 9 11Z" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/><path d="M21 15L16 10L5 21" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>',
    info: '<path d="M12 21C16.9706 21 21 16.9706 21 12C21 7.02944 16.9706 3 12 3C7.02944 3 3 7.02944 3 12C3 16.9706 7.02944 21 12 21Z" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 11V17M12 7.5V8" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>',
    link: '<path d="M10 14C10.3722 14.3779 10.8158 14.6781 11.3051 14.8829C11.7944 15.0878 12.3196 15.1933 12.85 15.1933C13.3804 15.1933 13.9056 15.0878 14.3949 14.8829C14.8842 14.6781 15.3278 14.3779 15.7 14L18.7 11C19.4559 10.2441 19.8805 9.21896 19.8805 8.15C19.8805 7.08104 19.4559 6.05587 18.7 5.3C17.9441 4.54413 16.919 4.11949 15.85 4.11949C14.781 4.11949 13.7559 4.54413 13 5.3L12 6.3" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/><path d="M14 10C13.6278 9.62206 13.1842 9.32192 12.6949 9.11706C12.2056 8.91219 11.6805 8.80669 11.15 8.80669C10.6196 8.80669 10.0944 8.91219 9.60515 9.11706C9.11586 9.32192 8.67221 9.62206 8.30002 10L5.30002 13C4.54415 13.7559 4.11951 14.781 4.11951 15.85C4.11951 16.919 4.54415 17.9441 5.30002 18.7C6.05588 19.4559 7.08106 19.8805 8.15001 19.8805C9.21897 19.8805 10.2441 19.4559 11 18.7L12 17.7" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>',
    list: '<path d="M8 6H21M8 12H21M8 18H21" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 7C4.55228 7 5 6.55228 5 6C5 5.44772 4.55228 5 4 5C3.44772 5 3 5.44772 3 6C3 6.55228 3.44772 7 4 7Z" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 13C4.55228 13 5 12.5523 5 12C5 11.4477 4.55228 11 4 11C3.44772 11 3 11.4477 3 12C3 12.5523 3.44772 13 4 13Z" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 19C4.55228 19 5 18.5523 5 18C5 17.4477 4.55228 17 4 17C3.44772 17 3 17.4477 3 18C3 18.5523 3.44772 19 4 19Z" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>',
    loc: '<path d="M12 15C13.6569 15 15 13.6569 15 12C15 10.3431 13.6569 9 12 9C10.3431 9 9 10.3431 9 12C9 13.6569 10.3431 15 12 15Z" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 2V5M12 19V22M2 12H5M19 12H22" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>',
    mail: '<path d="M19 5H5C3.89543 5 3 5.89543 3 7V17C3 18.1046 3.89543 19 5 19H19C20.1046 19 21 18.1046 21 17V7C21 5.89543 20.1046 5 19 5Z" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/><path d="M3 7L12 13L21 7" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>',
    map: '<path d="M9 4L3 6V20L9 18L15 20L21 18V4L15 6L9 4Z" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/><path d="M9 4V18M15 6V20" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>',
    megaphone: '<path d="M3 11V13C3 13.2652 3.10536 13.5196 3.29289 13.7071C3.48043 13.8946 3.73478 14 4 14H7L13 19V5L7 10H4C3.73478 10 3.48043 10.1054 3.29289 10.2929C3.10536 10.4804 3 10.7348 3 11Z" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/><path d="M17 8C17.621 8.46574 18.125 9.06966 18.4721 9.76393C18.8193 10.4582 19 11.2238 19 12C19 12.7762 18.8193 13.5418 18.4721 14.2361C18.125 14.9303 17.621 15.5343 17 16" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>',
    minus: '<path d="M5 12H19" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>',
    moon: '<path d="M21 12.8C20.8407 14.5011 20.2005 16.1217 19.1542 17.4723C18.1079 18.823 16.6988 19.848 15.0915 20.4274C13.4843 21.0068 11.7453 21.1168 10.0778 20.7445C8.41038 20.3721 6.88336 19.5329 5.67526 18.3247C4.46715 17.1166 3.62788 15.5896 3.25554 13.9222C2.8832 12.2547 2.99318 10.5157 3.57261 8.90848C4.15205 7.30122 5.177 5.89209 6.52768 4.84581C7.87835 3.79953 9.49893 3.15931 11.2 3C10.189 4.348 9.69817 6.01546 9.81762 7.69622C9.93706 9.37699 10.6588 10.9583 11.8503 12.1497C13.0417 13.3412 14.623 14.0629 16.3038 14.1824C17.9845 14.3018 19.652 13.811 21 12.8Z" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>',
    more: '<path d="M5.00005 13.2C5.66279 13.2 6.20005 12.6627 6.20005 12C6.20005 11.3373 5.66279 10.8 5.00005 10.8C4.33731 10.8 3.80005 11.3373 3.80005 12C3.80005 12.6627 4.33731 13.2 5.00005 13.2Z" fill="currentColor"/><path d="M12 13.2C12.6628 13.2 13.2 12.6627 13.2 12C13.2 11.3373 12.6628 10.8 12 10.8C11.3373 10.8 10.8 11.3373 10.8 12C10.8 12.6627 11.3373 13.2 12 13.2Z" fill="currentColor"/><path d="M19 13.2C19.6628 13.2 20.2001 12.6627 20.2001 12C20.2001 11.3373 19.6628 10.8 19 10.8C18.3373 10.8 17.8 11.3373 17.8 12C17.8 12.6627 18.3373 13.2 19 13.2Z" fill="currentColor"/>',
    music: '<path d="M9 18V5L21 3V16" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 21C7.65685 21 9 19.6569 9 18C9 16.3431 7.65685 15 6 15C4.34315 15 3 16.3431 3 18C3 19.6569 4.34315 21 6 21Z" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/><path d="M18 19C19.6569 19 21 17.6569 21 16C21 14.3431 19.6569 13 18 13C16.3431 13 15 14.3431 15 16C15 17.6569 16.3431 19 18 19Z" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>',
    near: '<path d="M3 11L21 3L13 21L11 13L3 11Z" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>',
    out: '<path d="M7 17L17 7M17 16V7H8" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>',
    phone: '<path d="M15 2.5H9C7.89543 2.5 7 3.39543 7 4.5V19.5C7 20.6046 7.89543 21.5 9 21.5H15C16.1046 21.5 17 20.6046 17 19.5V4.5C17 3.39543 16.1046 2.5 15 2.5Z" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/><path d="M11 18H13" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>',
    pin: '<path d="M12 22C12 22 19 15.8 19 10C19 8.14348 18.2625 6.36301 16.9497 5.05025C15.637 3.7375 13.8565 3 12 3C10.1435 3 8.36301 3.7375 7.05025 5.05025C5.7375 6.36301 5 8.14348 5 10C5 15.8 12 22 12 22Z" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 12.5C13.3807 12.5 14.5 11.3807 14.5 10C14.5 8.61929 13.3807 7.5 12 7.5C10.6193 7.5 9.5 8.61929 9.5 10C9.5 11.3807 10.6193 12.5 12 12.5Z" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>',
    pinned: '<path d="M9 3H15L14 9L17 12H7L10 9L9 3Z" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 12V21" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>',
    plus: '<path d="M12 5V19M5 12H19" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>',
    qr: '<path d="M9 3H4C3.44772 3 3 3.44772 3 4V9C3 9.55228 3.44772 10 4 10H9C9.55228 10 10 9.55228 10 9V4C10 3.44772 9.55228 3 9 3Z" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/><path d="M20 3H15C14.4477 3 14 3.44772 14 4V9C14 9.55228 14.4477 10 15 10H20C20.5523 10 21 9.55228 21 9V4C21 3.44772 20.5523 3 20 3Z" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/><path d="M9 14H4C3.44772 14 3 14.4477 3 15V20C3 20.5523 3.44772 21 4 21H9C9.55228 21 10 20.5523 10 20V15C10 14.4477 9.55228 14 9 14Z" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/><path d="M14 14H17V17M21 14V21H17M14 21V18" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>',
    search: '<path d="M11 18C14.866 18 18 14.866 18 11C18 7.13401 14.866 4 11 4C7.13401 4 4 7.13401 4 11C4 14.866 7.13401 18 11 18Z" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/><path d="M20 20L16 16" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>',
    send: '<path d="M5 12H19M13 18L19 12L13 6" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>',
    settings: '<path d="M12 15C13.6569 15 15 13.6569 15 12C15 10.3431 13.6569 9 12 9C10.3431 9 9 10.3431 9 12C9 13.6569 10.3431 15 12 15Z" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/><path d="M19.4 15C19.2737 15.2975 19.2349 15.6249 19.288 15.9437C19.3411 16.2625 19.4841 16.5595 19.7 16.8L19.8 16.9C20.0292 17.0719 20.2189 17.2911 20.356 17.5427C20.4932 17.7943 20.5747 18.0724 20.595 18.3582C20.6153 18.644 20.5739 18.9309 20.4737 19.1994C20.3735 19.4678 20.2168 19.7116 20.0142 19.9142C19.8116 20.1168 19.5678 20.2735 19.2994 20.3737C19.0309 20.4739 18.744 20.5153 18.4582 20.495C18.1724 20.4747 17.8943 20.3932 17.6427 20.256C17.3911 20.1189 17.1719 19.9292 17 19.7L16.9 19.6C16.6595 19.3841 16.3625 19.2411 16.0437 19.188C15.7249 19.1349 15.3975 19.1737 15.1 19.3C14.8094 19.4311 14.5616 19.6413 14.3848 19.9065C14.208 20.1718 14.1093 20.4814 14.1 20.8V21C14.1 21.5304 13.8893 22.0391 13.5142 22.4142C13.1391 22.7893 12.6304 23 12.1 23C11.5696 23 11.0609 22.7893 10.6858 22.4142C10.3107 22.0391 10.1 21.5304 10.1 21V20.9C10.0822 20.5701 9.96871 20.2526 9.77335 19.9862C9.578 19.7198 9.30927 19.5161 9 19.4C8.70249 19.2737 8.37514 19.2349 8.05634 19.288C7.73753 19.3411 7.44048 19.4841 7.2 19.7L7.1 19.8C6.92807 20.0292 6.7089 20.2189 6.45731 20.356C6.20572 20.4932 5.9276 20.5747 5.64178 20.595C5.35595 20.6153 5.0691 20.5739 4.80065 20.4737C4.53219 20.3735 4.2884 20.2168 4.08579 20.0142C3.88317 19.8116 3.72646 19.5678 3.62626 19.2994C3.52606 19.0309 3.48472 18.744 3.50503 18.4582C3.52534 18.1724 3.60684 17.8943 3.74399 17.6427C3.88115 17.3911 4.07076 17.1719 4.3 17L4.4 16.9C4.61594 16.6595 4.75885 16.3625 4.81199 16.0437C4.86512 15.7249 4.82627 15.3975 4.7 15.1C4.56888 14.8094 4.3587 14.5616 4.09347 14.3848C3.82824 14.208 3.51863 14.1093 3.2 14.1H3C2.46957 14.1 1.96086 13.8893 1.58579 13.5142C1.21071 13.1391 1 12.6304 1 12.1C1 11.5696 1.21071 11.0609 1.58579 10.6858C1.96086 10.3107 2.46957 10.1 3 10.1H3.1C3.42986 10.0822 3.7474 9.96871 4.01379 9.77335C4.28018 9.578 4.48389 9.30927 4.6 9C4.72627 8.70249 4.76512 8.37514 4.71199 8.05634C4.65885 7.73753 4.51594 7.44048 4.3 7.2L4.2 7.1C3.97076 6.92807 3.78115 6.7089 3.64399 6.45731C3.50684 6.20572 3.42534 5.9276 3.40503 5.64178C3.38472 5.35595 3.42606 5.0691 3.52626 4.80065C3.62646 4.53219 3.78317 4.2884 3.98579 4.08579C4.1884 3.88317 4.43219 3.72646 4.70065 3.62626C4.9691 3.52606 5.25595 3.48472 5.54178 3.50503C5.8276 3.52534 6.10572 3.60684 6.35731 3.74399C6.6089 3.88115 6.82807 4.07076 7 4.3L7.1 4.4C7.34048 4.61594 7.63753 4.75885 7.95634 4.81199C8.27514 4.86512 8.60249 4.82627 8.9 4.7H9C9.29055 4.56888 9.53839 4.3587 9.71521 4.09347C9.89203 3.82824 9.99071 3.51863 10 3.2V3C10 2.46957 10.2107 1.96086 10.5858 1.58579C10.9609 1.21071 11.4696 1 12 1C12.5304 1 13.0391 1.21071 13.4142 1.58579C13.7893 1.96086 14 2.46957 14 3V3.1C14.0093 3.41863 14.108 3.72824 14.2848 3.99347C14.4616 4.2587 14.7094 4.46888 15 4.6C15.2975 4.72627 15.6249 4.76512 15.9437 4.71199C16.2625 4.65885 16.5595 4.51594 16.8 4.3L16.9 4.2C17.0719 3.97076 17.2911 3.78115 17.5427 3.64399C17.7943 3.50684 18.0724 3.42534 18.3582 3.40503C18.644 3.38472 18.9309 3.42606 19.1994 3.52626C19.4678 3.62646 19.7116 3.78317 19.9142 3.98579C20.1168 4.1884 20.2735 4.43219 20.3737 4.70065C20.4739 4.9691 20.5153 5.25595 20.495 5.54178C20.4747 5.8276 20.3932 6.10572 20.256 6.35731C20.1189 6.6089 19.9292 6.82807 19.7 7L19.6 7.1C19.3841 7.34048 19.2411 7.63753 19.188 7.95634C19.1349 8.27514 19.1737 8.60249 19.3 8.9V9C19.4311 9.29055 19.6413 9.53839 19.9065 9.71521C20.1718 9.89203 20.4814 9.99071 20.8 10H21C21.5304 10 22.0391 10.2107 22.4142 10.5858C22.7893 10.9609 23 11.4696 23 12C23 12.5304 22.7893 13.0391 22.4142 13.4142C22.0391 13.7893 21.5304 14 21 14H20.9C20.5814 14.0093 20.2718 14.108 20.0065 14.2848C19.7413 14.4616 19.5311 14.7094 19.4 15Z" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>',
    share: '<path d="M12 3V15M17 8L12 3L7 8" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 13V19C5 19.5304 5.21071 20.0391 5.58579 20.4142C5.96086 20.7893 6.46957 21 7 21H17C17.5304 21 18.0391 20.7893 18.4142 20.4142C18.7893 20.0391 19 19.5304 19 19V13" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>',
    shield: '<path d="M12 3L4 6V12C4 17 7.5 20 12 21C16.5 20 20 17 20 12V6L12 3Z" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>',
    shieldCheck: '<path d="M12 3L4 6V12C4 17 7.5 20 12 21C16.5 20 20 17 20 12V6L12 3Z" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/><path d="M9 12L11 14L15 10" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>',
    sliders: '<path d="M4 7H14M18 7H20M4 17H8M12 17H20" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/><path d="M16 9C17.1046 9 18 8.10457 18 7C18 5.89543 17.1046 5 16 5C14.8954 5 14 5.89543 14 7C14 8.10457 14.8954 9 16 9Z" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/><path d="M10 19C11.1046 19 12 18.1046 12 17C12 15.8954 11.1046 15 10 15C8.89543 15 8 15.8954 8 17C8 18.1046 8.89543 19 10 19Z" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>',
    spark: '<path d="M12 3L13.9 8.1L19 10L13.9 11.9L12 17L10.1 11.9L5 10L10.1 8.1L12 3Z" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>',
    star: '<path d="M12 3L14.8 8.7L21 9.6L16.5 14L17.5 20.2L12 17.3L6.5 20.2L7.5 14L3 9.6L9.2 8.7L12 3Z" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>',
    starFill: '<path d="M12 3L14.8 8.7L21 9.6L16.5 14L17.5 20.2L12 17.3L6.5 20.2L7.5 14L3 9.6L9.2 8.7L12 3Z" fill="currentColor"/>',
    sun: '<path d="M12 16C14.2091 16 16 14.2091 16 12C16 9.79086 14.2091 8 12 8C9.79086 8 8 9.79086 8 12C8 14.2091 9.79086 16 12 16Z" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 2V4M12 20V22M4.9 4.9L6.3 6.3M17.7 17.7L19.1 19.1M2 12H4M20 12H22M4.9 19.1L6.3 17.7M17.7 6.3L19.1 4.9" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>',
    sunset: '<path d="M17 18C17 16.6739 16.4732 15.4021 15.5355 14.4645C14.5979 13.5268 13.3261 13 12 13C10.6739 13 9.40215 13.5268 8.46447 14.4645C7.52678 15.4021 7 16.6739 7 18" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 9V3M4.2 10.2L5.6 11.6M1 18H3M21 18H23M18.4 11.6L19.8 10.2M23 22H1" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>',
    swap: '<path d="M7 12L3 8L7 4M3 8H17M17 12L21 16L17 20M21 16H7" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>',
    tap: '<path d="M7 9C7 7.67392 7.52678 6.40215 8.46447 5.46447C9.40215 4.52678 10.6739 4 12 4C13.3261 4 14.5979 4.52678 15.5355 5.46447C16.4732 6.40215 17 7.67392 17 9M4 9C4 6.87827 4.84285 4.84344 6.34315 3.34315C7.84344 1.84285 9.87827 1 12 1C14.1217 1 16.1566 1.84285 17.6569 3.34315C19.1571 4.84344 20 6.87827 20 9" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/><path d="M13.5 11H10.5C9.67157 11 9 11.6716 9 12.5V19.5C9 20.3284 9.67157 21 10.5 21H13.5C14.3284 21 15 20.3284 15 19.5V12.5C15 11.6716 14.3284 11 13.5 11Z" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>',
    ticket: '<path d="M3 8C3.53043 8 4.03914 7.78929 4.41421 7.41421C4.78929 7.03914 5 6.53043 5 6H19C19 6.53043 19.2107 7.03914 19.5858 7.41421C19.9609 7.78929 20.4696 8 21 8V10C20.4696 10 19.9609 10.2107 19.5858 10.5858C19.2107 10.9609 19 11.4696 19 12C19 12.5304 19.2107 13.0391 19.5858 13.4142C19.9609 13.7893 20.4696 14 21 14V16C20.4696 16 19.9609 16.2107 19.5858 16.5858C19.2107 16.9609 19 17.4696 19 18H5C5 17.4696 4.78929 16.9609 4.41421 16.5858C4.03914 16.2107 3.53043 16 3 16V14C3.53043 14 4.03914 13.7893 4.41421 13.4142C4.78929 13.0391 5 12.5304 5 12C5 11.4696 4.78929 10.9609 4.41421 10.5858C4.03914 10.2107 3.53043 10 3 10V8Z" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/><path d="M14 6V18" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="2 2.5"/>',
    trophy: '<path d="M8 4H16V9C16 10.0609 15.5786 11.0783 14.8284 11.8284C14.0783 12.5786 13.0609 13 12 13C10.9391 13 9.92172 12.5786 9.17157 11.8284C8.42143 11.0783 8 10.0609 8 9V4Z" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/><path d="M8.00005 6H4.00005C3.73269 6.55981 3.64545 7.18875 3.75036 7.8002C3.85527 8.41165 4.14716 8.97554 4.58584 9.41421C5.02451 9.85289 5.5884 10.1448 6.19985 10.2497C6.8113 10.3546 7.44023 10.2674 8.00005 10M16 6H20C20.2674 6.55981 20.3546 7.18875 20.2497 7.8002C20.1448 8.41165 19.8529 8.97554 19.4143 9.41421C18.9756 9.85289 18.4117 10.1448 17.8002 10.2497C17.1888 10.3546 16.5599 10.2674 16 10M12 13V17M8.00005 21H16M9.00005 17H15" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>',
    upload: '<path d="M12 16V4M17 9L12 4L7 9" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 20H20" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>',
    userPlus: '<path d="M10 11.5C11.933 11.5 13.5 9.933 13.5 8C13.5 6.067 11.933 4.5 10 4.5C8.067 4.5 6.5 6.067 6.5 8C6.5 9.933 8.067 11.5 10 11.5Z" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/><path d="M3.5 20C3.5 16.4 6.4 13.5 10 13.5C11.6 13.5 13 14 14.1 14.9" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/><path d="M18.5 14V20M15.5 17H21.5" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>',
    user: '<path d="M12 12C14.2091 12 16 10.2091 16 8C16 5.79086 14.2091 4 12 4C9.79086 4 8 5.79086 8 8C8 10.2091 9.79086 12 12 12Z" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 21C4 18.8783 4.84285 16.8434 6.34315 15.3431C7.84344 13.8429 9.87827 13 12 13C14.1217 13 16.1566 13.8429 17.6569 15.3431C19.1571 16.8434 20 18.8783 20 21" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>',
    vote: '<path d="M4 13L8 17L20 5" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>',
    walk: '<path d="M13 5.8C13.9941 5.8 14.8 4.99411 14.8 4C14.8 3.00588 13.9941 2.2 13 2.2C12.0059 2.2 11.2 3.00588 11.2 4C11.2 4.99411 12.0059 5.8 13 5.8Z" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/><path d="M7 21L10 14M10 14L13 16V21M10 14L9 10L11 7L14 10L17 11" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>',
    wallet: '<path d="M19 6H5C3.89543 6 3 6.89543 3 8V18C3 19.1046 3.89543 20 5 20H19C20.1046 20 21 19.1046 21 18V8C21 6.89543 20.1046 6 19 6Z" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/><path d="M3 10H21M16 15H18" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 6V4H17V6" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>',
    x: '<path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>',
  };
  // Sketch 1's icon names, pointed at their Figma equivalents
  const ALIAS = {'compass': 'home2', 'users': 'crew', 'calendar': 'cal', 'chev': 'chevR', 'up': 'chevU', 'sparkle': 'spark', 'home': 'home2', 'chat': 'bubble', 'external': 'out', 'logout': 'out', 'pen': 'edit', 'scan': 'qr'};
  // Icons Sketch 1 used that the Figma set has no match for (vibes, wallet, maps): same stroke as the set
  const EXTRA = {
    train: '<rect x="6" y="3" width="12" height="14" rx="3"/><path d="M6 11h12M9 21l1.5-4M15 21l-1.5-4"/>',
    flame: '<path d="M12 21c-3.9 0-7-2.7-7-6.5 0-3 2-5.2 3.5-6.8.3 1.8 1.2 3 2.5 3.3C11 7.5 12.5 5 15 3c0 3 4 5.5 4 11 0 4-3.1 7-7 7z"/>',
    inbox: '<path d="M3 13h5l1.5 3h5L16 13h5"/><path d="M5.5 5h13L21 13v6H3v-6z"/>',
    grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
    thumbDown: '<path d="M10 15v4a2 2 0 0 0 2 2l3-7V4H7.5a2 2 0 0 0-2 1.6l-1.3 7A2 2 0 0 0 6.2 15z"/><path d="M15 4h3a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-3"/>',
    mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
    film: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4"/>',
    palette: '<path d="M12 3a9 9 0 1 0 0 18c1.5 0 2-1 2-2s-1-1.5-1-2.5 1-1.5 2-1.5h2a4 4 0 0 0 4-4c0-4.4-4-8-9-8z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="15" cy="7" r="1"/>',
    book: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5"/>',
    tree: '<path d="M12 21v-5"/><path d="M12 3 5 16h14z"/>',
    bike: '<circle cx="6" cy="16" r="4"/><circle cx="18" cy="16" r="4"/><path d="M6 16 10 8h5l3 8M9 8h3"/>',
    peak: '<path d="m3 20 6-11 4 6 3-4 5 9z"/>',
    dice: '<rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="9" cy="9" r=".8"/><circle cx="15" cy="15" r=".8"/><circle cx="15" cy="9" r=".8"/><circle cx="9" cy="15" r=".8"/>',
    code: '<path d="m8 8-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14"/>',
    disc: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.5"/>',
    wave: '<path d="M3 12h3l2-6 4 12 3-9 2 3h4"/>',
    smile: '<circle cx="12" cy="12" r="9"/><path d="M8.5 14a4 4 0 0 0 7 0M9 9.5h.01M15 9.5h.01"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
    coat: '<path d="M9 3 6 6 3 9l3 3v9h12v-9l3-3-3-3-3-3"/><path d="M9 3a3 3 0 0 0 6 0"/>',
  };
  const icon = (name, cls = "") => {
    const n = ALIAS[name] || name;
    const body = P[n] || (EXTRA[n] ? `<g stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${EXTRA[n]}</g>` : "");
    return `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" aria-hidden="true">${body}</svg>`;
  };
  // The Sidequest mark (route S + destination dot) and the Geist Light wordmark
  const LOGO_MARK = '<svg class="logo-mark" width="30" height="30" viewBox="0 0 30 30" fill="none" aria-hidden="true"><path d="M6.25 24.375H16.25C17.659 24.375 19.0102 23.8153 20.0065 22.819C21.0028 21.8227 21.5625 20.4715 21.5625 19.0625C21.5625 17.6535 21.0028 16.3023 20.0065 15.306C19.0102 14.3097 17.659 13.75 16.25 13.75H13.75C12.341 13.75 10.9898 13.1903 9.9935 12.194C8.99721 11.1977 8.4375 9.84646 8.4375 8.4375C8.4375 7.02854 8.99721 5.67728 9.9935 4.681C10.9898 3.68471 12.341 3.125 13.75 3.125H21.25" stroke="#A97AF2" stroke-width="2.625" stroke-linecap="round"/><path d="M23.75 5.875C25.2688 5.875 26.5 4.64378 26.5 3.125C26.5 1.60622 25.2688 0.375 23.75 0.375C22.2312 0.375 21 1.60622 21 3.125C21 4.64378 22.2312 5.875 23.75 5.875Z" fill="#F28DC8"/></svg>';
  const logo = () => `<span class="logo">${LOGO_MARK}<span>sidequest</span></span>`;
  // Sixer, the taste guide: the same mark, in ink on the Signature gradient
  const SIXER_MARK = '<svg viewBox="0 0 30 30" fill="none" aria-hidden="true"><path d="M6.25 24.375H16.25C17.659 24.375 19.0102 23.8153 20.0065 22.819C21.0028 21.8227 21.5625 20.4715 21.5625 19.0625C21.5625 17.6535 21.0028 16.3023 20.0065 15.306C19.0102 14.3097 17.659 13.75 16.25 13.75H13.75C12.341 13.75 10.9898 13.1903 9.9935 12.194C8.99721 11.1977 8.4375 9.84646 8.4375 8.4375C8.4375 7.02854 8.99721 5.67728 9.9935 4.681C10.9898 3.68471 12.341 3.125 13.75 3.125H21.25" stroke="currentColor" stroke-width="2.625" stroke-linecap="round"/><circle cx="23.75" cy="3.125" r="2.75" fill="currentColor"/></svg>';
  const sixer = (cls = "") => `<span class="sixer ${cls}">${SIXER_MARK}</span>`;
  const sixerMsg = (text) => `<div class="sixer-msg">${sixer()}<div class="bubble-s">${esc(text)}</div></div>`;
  // Match tier icons (14px, ink on the pill)
  const TIER = {
    strong: ['Strong match', '<path d="M11.6668 3.5L5.25016 9.91667L2.3335 7" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>'],
    close: ['Close match', '<path d="M6.99984 1.75L8.10817 4.725L11.0832 5.83333L8.10817 6.94167L6.99984 9.91667L5.8915 6.94167L2.9165 5.83333L5.8915 4.725L6.99984 1.75Z" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>'],
    low: ['Worth a look', '<path d="M1.1665 7.00001C1.1665 7.00001 3.20817 2.91667 6.99984 2.91667C10.7915 2.91667 12.8332 7.00001 12.8332 7.00001C12.8332 7.00001 10.7915 11.0833 6.99984 11.0833C3.20817 11.0833 1.1665 7.00001 1.1665 7.00001Z" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/><path d="M7 8.75C7.9665 8.75 8.75 7.9665 8.75 7C8.75 6.0335 7.9665 5.25 7 5.25C6.0335 5.25 5.25 6.0335 5.25 7C5.25 7.9665 6.0335 8.75 7 8.75Z" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>'],
  };
  // Strong is 75% and up, Close 50 to 74%, Worth a look below 50% (Figma: Match)
  const matchTier = (pct) => (pct >= 75 ? "strong" : pct >= 50 ? "close" : "low");
  const matchPill = (pct, cls = "") => {
    const t = matchTier(pct);
    return `<span class="match ${t} ${cls}"><svg class="ic xs" viewBox="0 0 14 14" fill="none" aria-hidden="true">${TIER[t][1]}</svg>${TIER[t][0]}</span>`;
  };

  // Each vibe gets an icon for posters and chips
  const VIBE_ICON = {
    "Live music": "music", Jazz: "music", "Indie gigs": "music", Comedy: "smile", Dance: "sparkle", Electronic: "wave", "Records & vinyl": "disc",
    "Film nights": "film", "Zines & print": "book", "Art & making": "palette", Photography: "camera", "Writing & poetry": "pen", "Tech & coding": "code",
    "Anime & cosplay": "star", Outdoors: "tree", "Run & ride": "bike", Climbing: "peak", "Games & social": "dice",
    "Food & drink": "heart", Markets: "pin", Wellness: "sun",
  };

  // ---------- Posters: the listing's own photo or poster (shown greyscale, per the design); "N/A" when it has none ----------
  const hash = (s) => [...String(s)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  // Listings without artwork get the design's photo for their vibe
  const VIBE_PHOTO = {
    "Live music": "sax", Jazz: "jazz-band", "Indie gigs": "sax", "Food & drink": "cheers", "Art & making": "bokeh-2", Photography: "bokeh-2", "Writing & poetry": "bokeh-2",
    Markets: "lanterns", "Zines & print": "lanterns", "Records & vinyl": "sax", Comedy: "bokeh-1", Dance: "performer", Electronic: "performer",
    Wellness: "blur", "Run & ride": "blur", Climbing: "blur", "Film nights": "hall", "Games & social": "bokeh-3", "Tech & coding": "bokeh-3", "Anime & cosplay": "bokeh-3", Outdoors: "dragon-boat",
  };
  const photoUrl = (name) => `assets/photos/${name}.jpg`;
  const ph = (name, cls = "", style = "") => `<div class="ph ${cls}" style="background-image:url('${photoUrl(name)}');${style}" aria-hidden="true"></div>`;
  const eventPhoto = (e) => e.image || photoUrl(VIBE_PHOTO[(e.vibes || [])[0]] || "string-lights");
  function poster(e, cls = "", { style = "" } = {}) {
    // The listing's own image, over the vibe's photo in case it doesn't load
    return `<div class="poster has-img ${cls}" style="background-image:url('${esc(eventPhoto(e))}'),url('${photoUrl(VIBE_PHOTO[(e.vibes || [])[0]] || "string-lights")}');${style}" role="img" aria-label="${esc(`Image for ${e.title}`)}"></div>`;
  }

  // ---------- Avatars ----------
  // People rotate through Lavender, Aqua and Pink (Figma: Avatar). Sizes: xs 20, s 28, (m) 40, l 64, xl 96
  const AV_TONES = ["", "aqua", "pink"];
  const AV_TONE = { Maya: "pink", Kai: "aqua", Leila: "", Sam: "aqua", Priya: "pink" }; // as the design draws them
  const avatar = (name, cls = "") => `<span class="av ${AV_TONE[name] ?? AV_TONES[hash(name) % AV_TONES.length]} ${cls}" title="${esc(name)}">${esc(String(name)[0] || "?").toUpperCase()}</span>`;
  const avatars = (names, max = 4, cls = "s") => names.length ? `<span class="avs">${names.slice(0, max).map((n) => avatar(n, cls)).join("")}${names.length > max ? `<span class="av more ${cls}">+${names.length - max}</span>` : ""}</span>` : "";

  // ---------- Components ----------
  // back: true goes to the previous screen; a screen id goes there instead
  // Figma: Top bar. Back / Close centre a short title; large: true is the Title bar (big left title, for top-level tabs).
  // back: true goes to the previous screen; a screen id goes there instead. close: true shows an X instead of a chevron.
  const bar = (title, { back = true, right = "", large = false, close = false } = {}) => large
    ? `<header class="bar large"><h1>${esc(title)}</h1><div class="actions">${right}</div></header>`
    : `<header class="bar"><div class="lead">${back ? `<button class="icon-btn" ${back === true ? "data-back" : `data-go="${esc(back)}"`} aria-label="${close ? "Close" : "Back"}">${icon(close ? "x" : "back")}</button>` : ""}</div><h1>${esc(title)}</h1><div class="actions">${right}</div></header>`;
  // kind: primary | secondary | social | hot | outline | ghost, plus a size: "outline m", "secondary s"
  const btn = (label, a = {}, kind = "primary", ic = "") => {
    const [k, ...size] = kind.split(" ");
    return `<button class="btn btn-${k} ${size.join(" ")}" ${attr(a)}>${ic ? icon(ic) : ""}${esc(label)}</button>`;
  };
  // Figma: Icon button. cls: "" (Surface, 44) | "s" | "outline" | "ghost" | "primary" | "glass", combinable ("glass s")
  const iconBtn = (ic, a = {}, cls = "") => `<button class="icon-btn ${cls}" ${attr(a)}>${icon(ic)}</button>`;
  // Figma: Tag. tone: neutral | signature | social | hot | success | warning | danger | unverified | photo | solid
  const tag = (label, tone = "", ic = "") => `<span class="tag ${tone}">${ic ? icon(ic) : ""}${esc(label)}</span>`;
  const chip = (label, on, a = {}, ic = "") => `<button class="chip${on ? " on" : ""}" aria-pressed="${on ? "true" : "false"}" ${attr(a)}>${ic ? icon(ic) : ""}${esc(label)}</button>`;
  // Figma: Text field. extra.icon puts a leading icon in the box; extra.help adds the helper line under it.
  const field = (label, bind, value = "", type = "text", placeholder = "", extra = {}) => {
    const { icon: ic, help, error, ...rest } = extra; // error: red edge, and the message replaces the helper line
    return `
    <label class="field">${label ? `<span>${esc(label)}</span>` : ""}<span class="field-box${error ? " invalid" : ""}">${ic ? icon(ic) : ""}<input type="${type}" data-bind="${bind}" value="${esc(value)}" placeholder="${esc(placeholder)}" ${attr(rest)}></span>${error || help ? `<span class="field-help${error ? " error" : ""}">${esc(error || help)}</span>` : ""}</label>`;
  };
  const textarea = (label, bind, value = "", placeholder = "", rows = 3) => `
    <label class="field"><span>${esc(label)}</span><textarea data-bind="${bind}" rows="${rows}" placeholder="${esc(placeholder)}">${esc(value)}</textarea></label>`;
  const progress = (n, total) => `<div class="progress" role="progressbar" aria-valuenow="${n}" aria-valuemin="0" aria-valuemax="${total}" aria-label="Step ${n} of ${total}">${Array.from({ length: total }, (_, i) => `<span class="${i < n ? "done" : ""}"></span>`).join("")}</div>`;
  const meter = (pct, cls = "") => `<span class="meter ${cls}"><span style="width:${Math.max(0, Math.min(100, Math.round(pct)))}%"></span></span>`;
  const empty = (ic, text, action = "") => `<div class="empty"><span class="ic-box">${icon(ic, "lg")}</span><p>${esc(text)}</p>${action}</div>`;
  const stars = (n) => `<span class="stars-inline" aria-label="${n} stars">${"★".repeat(n)}${"☆".repeat(5 - n)}</span>`;
  // Figma: Tab bar. Each tab is [screen id, label, icon]; a tab may carry data-act instead via a 4th item ({ act: "addEvent" })
  // In the desktop layout the tab bar is a sidebar, with the logo on top
  const tabs = (list, active, dots = {}) => `<nav class="tabs" aria-label="Sections"><span class="tabs-logo">${logo()}</span>${list.map(([id, label, ic, opts = {}]) => `
    <button class="tab${id === active ? " on" : ""}" ${opts.act ? `data-act="${opts.act}"` : `data-go="${id}"`} ${id === active ? 'aria-current="page"' : ""}>${icon(ic)}${esc(label)}${dots[id] ? `<span class="dot">${dots[id]}</span>` : ""}</button>`).join("")}</nav>`;
  const screen = (body, { title, back = true, close = false, right = "", tabbar = "", footer = "", large = false, cls = "" } = {}) => `
    <div class="screen ${title !== undefined ? "has-bar" : ""} ${cls}">
      ${title !== undefined ? bar(title, { back, close, right, large }) : ""}
      <main class="scroll">${body}</main>
      ${footer}${tabbar}
    </div>`;
  const thinking = (text) => `<div class="thinking" role="status"><span class="orb"></span><span>${esc(text)}</span></div>`;
  const aiLabel = (mode) => ({ api: "Claude API", "claude-code": "Claude Code", keywords: "Keyword match, not AI" }[mode] || "");
  const aiTag = (mode) => mode ? `<span class="ai-tag">${icon(mode === "keywords" ? "search" : "sparkle")}${esc(aiLabel(mode))}</span>` : "";

  // ---------- Lookups into app data ----------
  const D = () => SQ.d || {};
  const me = () => D().user;
  const ev = (id) => (D().events || []).find((e) => e.id === Number(id));
  const req = (id) => (D().requests || []).find((r) => r.id === Number(id));
  const now = () => new Date(D().now || Date.now());
  const TZ = "America/Toronto";
  const dayKey = (d) => d.toLocaleDateString("en-CA", { timeZone: TZ });

  function whenLabel(e, { short = false } = {}) {
    const start = new Date(e.startsAt);
    const diff = Math.round((new Date(dayKey(start)) - new Date(dayKey(now()))) / 86400000);
    const time = start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: TZ }).replace(":00", "");
    const day = diff === 0 ? (start.getHours() >= 17 ? "Tonight" : "Today") : diff === 1 ? "Tomorrow" : start.toLocaleDateString("en-US", short ? { weekday: "short", day: "numeric" } : { weekday: "short", month: "short", day: "numeric", timeZone: TZ });
    return `${day} · ${time}`;
  }
  const isToday = (e) => dayKey(new Date(e.startsAt)) === dayKey(now());
  function isWeekend(e) {
    const start = new Date(e.startsAt);
    const days = (start - now()) / 86400000;
    const dow = new Date(dayKey(start)).getUTCDay(); // 0 Sun .. 6 Sat
    return days > -0.2 && days < 7.5 && (dow === 5 || dow === 6 || dow === 0);
  }
  const priceLabel = (e) => (e.price == null ? "N/A" : e.price === 0 ? "Free" : `$${e.price}`);
  const trip = (e, origin) => (origin && e.travel && e.travel.from[origin] ? { ...e.travel.from[origin], stop: e.travel.stop } : null);
  const tripLabel = (t) => t ? `${t.minutes} min · ${t.transfers ? `${t.transfers} transfer${t.transfers > 1 ? "s" : ""}` : "no transfers"}` : "";
  const originShort = (o) => ((D().vocab || {}).ORIGINS || {})[o] || "";

  // The taste avatar's pick for an event (match score and reason), if it has scored it
  function pick(e) {
    const u = me();
    return u && u.feed && u.feed.picks ? u.feed.picks[e.id] || null : null;
  }
  const partyNames = () => ((D().party || {}).members || []);
  const partyGoing = (e) => (e.friends || []).filter((f) => partyNames().includes(f));
  // A quest is over 2 hours after it starts, when the host ends it, or when you skip ahead (demo)
  function isPast(e) {
    const l = me() && me().log[e.id];
    return e.over || e.ended || !!(l && l.over);
  }
  // Three states: past, happening now (started but not over), or upcoming (the default, no badge)
  const eventStatus = (e) => (isPast(e) ? "past" : Date.parse(e.startsAt) <= now().getTime() ? "now" : "upcoming");
  // Events attendees added from a screenshot carry "Unverified" until someone else checks the listing
  const verifyBadge = (e) => (e.verification && e.verification.status !== "verified" ? `<span class="badge">${e.verification.status === "reported" ? "Reported" : "Unverified"}</span>` : "");
  const statusBadge = (e) => verifyBadge(e) + (({ past: '<span class="badge">Past</span>', now: '<span class="badge live">Happening now</span>' })[eventStatus(e)] || "");
  // The date label with its status badge beside it
  const whenRow = (e) => `<span class="row start" style="gap:8px;flex-wrap:wrap"><span class="label" style="letter-spacing:.04em">${esc(whenLabel(e))}</span>${statusBadge(e)}</span>`;

  // ---------- Add from a poster: the upload, what was read, and "already on Sidequest" ----------
  const shortDay = (key) => (key ? new Date(`${key}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : "No date");
  function posterPanel(target, action) {
    const st = SQ.u.poster && SQ.u.poster.for === target ? SQ.u.poster : null;
    if (st && st.loading) return `<div class="card stack-sm">${thinking("Reading the poster…")}<span class="small muted">Usually 10 to 30 seconds.</span></div>`;
    const events = st && st.result ? st.result.events : [];
    const done = target === "host" ? "publish" : "add it";
    return `<div class="stack-sm">
      <label class="upload poster-upload">${icon("upload", "lg")}<span>${st && st.result ? "Use a different poster" : "Add from a poster or screenshot"}</span>
        <span class="caption muted">We read the date, time, venue and price off it</span>
        <input type="file" accept="image/*" data-upload="${action}"></label>
      ${st && st.error ? `<div class="notice">${icon("x")}<span>${esc(st.error)}</span></div>` : ""}
      ${events.length ? `<div class="notice">${icon("sparkle")}<span>Filled in from your poster. Check everything before you ${done}.</span></div>` : ""}
      ${events.length > 1 ? `<span class="label">This poster lists ${events.length} events. Which one?</span>
        <div class="chips scroll-x">${events.map((x, i) => chip(`${x.draft.title || "Untitled"} · ${shortDay(x.draft.date)}`, i === st.pick, { "data-act": "posterPick", "data-arg": i })).join("")}</div>` : ""}
    </div>`;
  }
  function posterDuplicate(target) {
    const st = SQ.u.poster && SQ.u.poster.for === target ? SQ.u.poster : null;
    const x = st && st.result && st.result.events[st.pick];
    const e = x && x.duplicateOf ? ev(x.duplicateOf) : null;
    if (!e) return "";
    const row = `<div class="row start" style="gap:12px">${poster(e, "thumb")}<span class="stack-xs grow">${whenRow(e)}<strong class="ellipsis">${esc(e.title)}</strong><span class="small muted ellipsis">${esc(e.venue ? e.venue.name : e.neighbourhood)}${e.source ? ` · from ${esc(e.source)}` : ""}</span></span></div>`;
    if (target === "host") return `<div class="card hot stack-sm">
      <span class="label">${icon("copy", "sm")} Already on Sidequest</span>
      ${row}
      <span class="small">Claim it instead of publishing a copy: it becomes your quest, and people going get your updates.</span>
      ${btn("Claim this listing", { "data-act": "claimListing", "data-arg": e.id }, "primary sm", "shield")}
      <span class="caption muted">Publishing anyway merges your details and poster into that listing.</span>
    </div>`;
    return `<div class="card hot stack-sm">
      <span class="label">${icon("copy", "sm")} Already on Sidequest</span>
      ${row}
      ${btn("Open it", { "data-act": "openQuest", "data-arg": e.id }, "secondary sm", "chev")}
      <span class="caption muted">Adding it anyway won't make a copy: it fills in anything your poster has that the listing doesn't.</span>
    </div>`;
  }

  Object.assign(SQ, { posterPanel, posterDuplicate });
  // 19+ listings say so in the title, tags or description
  const is19 = (e) => /19\+|\b(19|21)\s*\+|19 and over|ages? 19/i.test(`${e.title} ${(e.tags || []).join(" ")} ${e.description || ""}`);
  const avTone = (name) => AV_TONE[name] ?? AV_TONES[hash(name) % AV_TONES.length];
  Object.assign(SQ, { dayKey, avTone, is19, logo, matchTier, matchPill, iconBtn, tag, ph, photoUrl, eventPhoto, VIBE_PHOTO, SIXER_MARK, sixer, sixerMsg });
  Object.assign(SQ, { esc, attr, icon, VIBE_ICON, poster, avatar, avatars, bar, btn, chip, field, textarea, progress, meter, empty, stars, tabs, screen, thinking, aiLabel, aiTag, me, ev, req, now, whenLabel, isToday, isWeekend, priceLabel, trip, tripLabel, originShort, pick, partyNames, partyGoing, isPast, eventStatus, statusBadge, whenRow, hash });
})();
