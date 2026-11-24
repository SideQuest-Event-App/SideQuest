// Link previews for Sidekick invites. Messaging apps (iMessage, WhatsApp, Instagram DMs, Messenger,
// Slack, Discord, Telegram) read Open Graph / Twitter tags from the page's HTML and show a card.
// Only the crew name and the candidate nights go in, never anyone's name or answers.
// The card image is a fixed JPG made by tools/render-og.js from public/og/invite.html.

const OG = {
  image: "/og/invite.jpg", // 1200 x 630, shown by most apps
  square: "/og/invite-square.jpg", // 1200 x 1200, for apps that crop to a square
  alt: "SideQuest invite: Who's in? Help plan our next night. 30 seconds, no app needed.",
};

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// The address people used, so links in the preview are absolute. Render (and most hosts) end HTTPS at
// their proxy and pass the original scheme and host in x-forwarded-* headers.
function origin(req) {
  const first = (v) => String(v || "").split(",")[0].trim();
  const proto = first(req.headers["x-forwarded-proto"]) || (req.socket && req.socket.encrypted ? "https" : "http");
  const host = first(req.headers["x-forwarded-host"]) || req.headers.host || "localhost";
  const safeHost = /^[\w.-]+(:\d+)?$/.test(host) ? host : "localhost";
  return `${proto === "https" ? "https" : "http"}://${safeHost}`;
}

const orList = (xs) => (xs.length > 1 ? `${xs.slice(0, -1).join(", ")} or ${xs[xs.length - 1]}` : xs[0] || "");

function texts(roomId, info) {
  if (!roomId) return { title: "Plan a night with Sidekick", description: "Start a planning call. Sidekick keeps track of what everyone wants and suggests two picks. No app needed." };
  if (!info) return { title: "Help plan our next night", description: "Sidekick's helping plan a night out. Join the call or answer in 30 seconds. No app needed." };
  const nights = [...new Set(info.nights)];
  return {
    title: `${info.crew}: help plan our next night`,
    description: `Sidekick's planning ${nights.length ? orList(nights) : "a night out"}. Join the call or answer in 30 seconds. No app needed.`,
  };
}

function tags(req, roomId, info) {
  const o = origin(req);
  const { title, description } = texts(roomId, info);
  const url = `${o}/sk${roomId ? `/${encodeURIComponent(roomId)}` : ""}`;
  const meta = (attr, k, v) => `<meta ${attr}="${k}" content="${esc(v)}">`;
  return {
    title,
    html: [
      `<meta name="description" content="${esc(description)}">`,
      `<link rel="canonical" href="${esc(url)}">`,
      meta("property", "og:type", "website"),
      meta("property", "og:site_name", "SideQuest"),
      meta("property", "og:title", title),
      meta("property", "og:description", description),
      meta("property", "og:url", url),
      meta("property", "og:image", `${o}${OG.image}`),
      meta("property", "og:image:secure_url", `${o}${OG.image}`),
      meta("property", "og:image:type", "image/jpeg"),
      meta("property", "og:image:width", "1200"),
      meta("property", "og:image:height", "630"),
      meta("property", "og:image:alt", OG.alt),
      meta("property", "og:image", `${o}${OG.square}`),
      meta("property", "og:image:type", "image/jpeg"),
      meta("property", "og:image:width", "1200"),
      meta("property", "og:image:height", "1200"),
      meta("name", "twitter:card", "summary_large_image"),
      meta("name", "twitter:title", title),
      meta("name", "twitter:description", description),
      meta("name", "twitter:image", `${o}${OG.image}`),
      meta("name", "twitter:image:alt", OG.alt),
    ].join("\n"),
  };
}

// Fills the page template: the marker comment becomes the tags, and the <title> follows the crew
function page(template, req, roomId, previewOf) {
  const info = roomId ? previewOf(roomId) : null;
  const t = tags(req, roomId, info);
  return template
    .replace(/<!--og:[^>]*-->/, t.html)
    .replace(/<title>[^<]*<\/title>/, `<title>${esc(roomId ? `${t.title} · Sidekick` : "Sidekick · plan a night")}</title>`);
}

module.exports = { page, tags, origin, OG };
