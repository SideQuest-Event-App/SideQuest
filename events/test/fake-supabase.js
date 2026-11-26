// A small stand-in for Supabase on localhost, for tests: the parts of PostgREST (/rest/v1) and Storage
// (/storage/v1) that the importer and Sketch 2's server use, answering the way the real ones do:
//   - POST with Prefer: resolution=merge-duplicates and ?on_conflict=a,b upserts on those columns; without the
//     Prefer header a duplicate key is a 409 (code 23505), as in Postgres. Every object in one POST must have the
//     same keys (PostgREST's "All object keys must match", PGRST102).
//   - GET supports select=, eq., gte., in.(), or=(...), order=, limit=, offset=.
//   - DELETE supports the same filters.
//   - A table that doesn't exist answers 404 with code PGRST205, like PostgREST 12.
//   - Every request must carry the apikey header (401 otherwise).
// Records every request (method, path, query, headers, body) in .requests.

const http = require("http");
const zlib = require("zlib");

function createFakeSupabase({ key, tables = {}, primaryKeys = {} } = {}) {
  const db = {}; // table -> rows
  for (const [t, rows] of Object.entries(tables)) db[t] = rows.map((r) => ({ ...r }));
  const files = {}; // storage path -> Buffer
  const requests = [];
  const fail = {}; // path prefix -> { status, body } to answer with instead
  const state = { db, files, requests, fail, server: null, url: null };

  const send = (res, status, body, headers = {}) => {
    const buf = Buffer.isBuffer(body) ? body : Buffer.from(typeof body === "string" ? body : JSON.stringify(body));
    res.writeHead(status, { "content-type": Buffer.isBuffer(body) ? "application/octet-stream" : "application/json", ...headers });
    res.end(buf);
  };

  // PostgREST value parsing for one "col=op.value" filter
  const unquote = (v) => (v.startsWith('"') && v.endsWith('"') ? v.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\") : v);
  function parseIn(list) {
    const out = [];
    let cur = "";
    let q = false;
    let esc = false;
    for (const c of list) {
      if (esc) {
        cur += c;
        esc = false;
      } else if (c === "\\" && q) esc = true;
      else if (c === '"') q = !q;
      else if (c === "," && !q) {
        out.push(cur);
        cur = "";
      } else cur += c;
    }
    out.push(cur);
    return out;
  }
  function test(row, col, expr) {
    const i = expr.indexOf(".");
    const op = expr.slice(0, i);
    const val = expr.slice(i + 1);
    const v = row[col];
    if (op === "eq") return String(v) === unquote(val);
    if (op === "gte") return v != null && (typeof v === "number" ? v >= Number(val) : String(v) >= val);
    if (op === "gt") return v != null && (typeof v === "number" ? v > Number(val) : String(v) > val);
    if (op === "lte") return v != null && String(v) <= val;
    if (op === "in") return parseIn(val.replace(/^\(|\)$/g, "")).includes(String(v));
    if (op === "not" && val === "is.null") return v != null;
    if (op === "ilike") return String(v || "").toLowerCase() === val.toLowerCase();
    throw new Error(`fake PostgREST: unsupported operator ${op}`);
  }
  function matches(row, params) {
    for (const [k, v] of params) {
      if (["select", "order", "limit", "offset", "on_conflict"].includes(k)) continue;
      if (k === "or") {
        const parts = v.replace(/^\(|\)$/g, "").split(",");
        if (!parts.some((p) => {
          const [col, ...rest] = p.split(".");
          return test(row, col, rest.join("."));
        })) return false;
        continue;
      }
      if (!test(row, k, v)) return false;
    }
    return true;
  }

  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const url = new URL(req.url, "http://x");
      const body = Buffer.concat(chunks);
      const rec = { method: req.method, path: url.pathname, query: url.search, params: [...url.searchParams], headers: req.headers, body: null };
      try {
        rec.body = body.length && /json/.test(req.headers["content-type"] || "") ? JSON.parse(body.toString()) : body.length ? body : null;
      } catch {
        rec.body = body.toString();
      }
      requests.push(rec);
      if (key && req.headers.apikey !== key) return send(res, 401, { message: "Invalid API key" });
      for (const [prefix, answer] of Object.entries(fail)) if (url.pathname.startsWith(prefix)) return send(res, answer.status, answer.body || { message: "failing on purpose" });

      // ---------- Storage ----------
      if (url.pathname === "/storage/v1/bucket") return send(res, 200, { name: "imports" });
      const sm = url.pathname.match(/^\/storage\/v1\/object\/(.+)$/);
      if (sm) {
        if (req.method === "GET") return files[sm[1]] ? send(res, 200, files[sm[1]]) : send(res, 400, { statusCode: "404", error: "not_found", message: "Object not found" });
        files[sm[1]] = body;
        return send(res, 200, { Key: sm[1] });
      }

      // ---------- PostgREST ----------
      const tm = url.pathname.match(/^\/rest\/v1\/([a-z0-9_]+)$/);
      if (!tm) return send(res, 404, { message: "no route" });
      const table = tm[1];
      if (!db[table]) return send(res, 404, { code: "PGRST205", details: null, hint: null, message: `Could not find the table 'public.${table}' in the schema cache` });
      const params = [...url.searchParams];
      const get = (k) => url.searchParams.get(k);
      if (req.method === "GET") {
        let rows = db[table].filter((r) => matches(r, params));
        const order = get("order");
        if (order) {
          const keys = order.split(",").map((o) => o.split("."));
          rows.sort((a, b) => {
            for (const [col, dir] of keys) {
              const x = a[col] == null ? "" : a[col];
              const y = b[col] == null ? "" : b[col];
              if (x < y) return dir === "desc" ? 1 : -1;
              if (x > y) return dir === "desc" ? -1 : 1;
            }
            return 0;
          });
        }
        const offset = Number(get("offset") || 0);
        const limit = get("limit") ? Number(get("limit")) : rows.length;
        rows = rows.slice(offset, offset + limit);
        const select = get("select");
        if (select && select !== "*") rows = rows.map((r) => Object.fromEntries(select.split(",").map((c) => [c, r[c] === undefined ? null : r[c]])));
        return send(res, 200, rows);
      }
      if (req.method === "POST") {
        const items = Array.isArray(rec.body) ? rec.body : [rec.body];
        const keys0 = JSON.stringify(Object.keys(items[0] || {}).sort());
        if (items.some((it) => JSON.stringify(Object.keys(it).sort()) !== keys0)) return send(res, 400, { code: "PGRST102", message: "All object keys must match" });
        const prefer = req.headers.prefer || "";
        const conflict = (get("on_conflict") || primaryKeys[table] || "id").split(",");
        for (const it of items) {
          const at = db[table].findIndex((r) => conflict.every((c) => String(r[c]) === String(it[c])));
          if (at >= 0 && conflict.every((c) => it[c] !== undefined)) {
            if (!/resolution=merge-duplicates/.test(prefer)) return send(res, 409, { code: "23505", message: "duplicate key value violates unique constraint" });
            db[table][at] = { ...db[table][at], ...it };
          } else db[table].push(table === "event_imports" ? { id: db[table].length + 1, ...it } : { ...it });
        }
        return /return=representation/.test(prefer) ? send(res, 201, items) : send(res, 201, "");
      }
      if (req.method === "DELETE") {
        db[table] = db[table].filter((r) => !matches(r, params));
        return send(res, 204, "");
      }
      return send(res, 405, { message: "method" });
    });
  });

  state.server = server;
  state.start = () => new Promise((resolve) => server.listen(0, "127.0.0.1", () => {
    state.url = `http://127.0.0.1:${server.address().port}`;
    resolve(state.url);
  }));
  state.stop = () => new Promise((resolve) => server.close(() => resolve()));
  state.putFile = (name, value) => {
    files[name] = zlib.gzipSync(JSON.stringify(value));
  };
  state.reset = () => requests.splice(0);
  return state;
}

module.exports = { createFakeSupabase };
