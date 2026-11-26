// Coordinates for venues we already know, by name: from the last import's events (any source) plus the venues listed
// in the venue-calendar configs. Sources that give an address but no coordinates (TOREVENT, Yohomo) use this first, so
// only venues never seen before go to OpenStreetMap (lib/locate.js).

const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/^the\s+/, "").replace(/[^a-z0-9]+/g, " ").trim();

function venueIndex(previous = [], extra = []) {
  const byName = new Map();
  const add = (name, v) => {
    const k = norm(name);
    if (!k || k === "n a" || !v || !Number.isFinite(Number(v.lat)) || !Number.isFinite(Number(v.lng)) || v.noPin) return;
    if (!byName.has(k)) byName.set(k, { lat: Number(v.lat), lng: Number(v.lng), address: v.address && v.address !== "N/A" ? v.address : null });
  };
  for (const v of extra) add(v.name, v);
  for (const e of previous) if (e && e.venue) add(e.venue.name, e.venue);
  return {
    // A venue by name ("The Black Eagle" and "Black Eagle" are one)
    find: (name) => byName.get(norm(name)) || null,
    size: () => byName.size,
  };
}

module.exports = { venueIndex, norm };
