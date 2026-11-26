// Where a pin may go: inside the Greater Toronto Area and not in Lake Ontario. Used by the import (a venue whose
// coordinates fail this is re-geocoded, or dropped from the map, never moved to a guessed spot) and, through the same
// numbers in sketch-2/public/js/geo-bounds.js, by the map at display time. A test checks the two copies match.
//
// The lake is a simplified polygon of Lake Ontario's open water off the GTA shore ([lng, lat] pairs, west to east
// along the shore, then back across the lake). It passes south of the Toronto Islands and Leslie Street Spit, so
// pins there (real venues) stay; anything south of the shoreline from Hamilton to Oshawa is water.

const GTA = { south: 43.35, north: 44.15, west: -80.1, east: -78.8 };
const LAKE = [
  [-79.79, 43.3], [-79.7, 43.38], [-79.66, 43.42], [-79.6, 43.49], [-79.57, 43.53], [-79.545, 43.575], [-79.5, 43.597],
  [-79.475, 43.615], [-79.44, 43.624], [-79.415, 43.622], [-79.4, 43.612], [-79.38, 43.605], [-79.35, 43.613], [-79.33, 43.625],
  [-79.32, 43.645], [-79.3, 43.662], [-79.27, 43.67], [-79.24, 43.69], [-79.2, 43.725], [-79.15, 43.755], [-79.1, 43.78],
  [-79.05, 43.8], [-78.9, 43.84], [-78.8, 43.87], [-78.8, 43.2], [-79.79, 43.2],
];

// Ray casting: is the point inside the polygon?
function inPolygon(lat, lng, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const num = (v) => (v === null || v === undefined || v === "" ? NaN : Number(v));
const inLake = (lat, lng) => inPolygon(num(lat), num(lng), LAKE);
const inGTA = (lat, lng) => {
  const a = num(lat), b = num(lng);
  return Number.isFinite(a) && Number.isFinite(b) && a > GTA.south && a < GTA.north && b > GTA.west && b < GTA.east;
};
// A point a pin may sit on: real numbers, in the GTA, on land (0,0 and swapped lat/lng fail the GTA box)
const onMap = (lat, lng) => inGTA(lat, lng) && !inLake(lat, lng);

module.exports = { GTA, LAKE, inPolygon, inLake, inGTA, onMap };
