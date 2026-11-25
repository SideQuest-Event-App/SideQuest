// Venue name or street address -> map coordinates, for events added from posters, links or by hand. The same
// Nominatim client as the import (sketch-1/lib/geocode.js: the generic "SideQuest-class-project" User-Agent, at most
// one request a second, every answer cached), with Sketch 2's own cache in data/geocode.json.

const path = require("path");
const g = require("../../sketch-1/lib/geocode").create({ cacheFile: process.env.GEOCODE_CACHE || path.join(__dirname, "..", "data", "geocode.json") });

module.exports = { geocode: g.geocode };
