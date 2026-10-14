// Browser stand-ins for the Node built-ins server.js uses, so GitHub Pages can run it (see boot.js).
// Files are kept in memory by name; data/db.json is also saved to IndexedDB so it survives reloads.
export const files = {};
const name = (p) => String(p).split("/").pop();

// IndexedDB: one key-value store
const idb = (mode, fn) =>
  new Promise((resolve, reject) => {
    const open = indexedDB.open("sidequest", 1);
    open.onupgradeneeded = () => open.result.createObjectStore("files");
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const req = fn(open.result.transaction("files", mode).objectStore("files"));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    };
  });
export const loadSaved = () => idb("readonly", (s) => s.get("db.json")).then((v) => v && (files["db.json"] = v), () => {});

// fs
export const existsSync = (p) => name(p) in files;
export function readFileSync(p) {
  if (!(name(p) in files)) throw new Error(`ENOENT: ${p}`);
  return files[name(p)];
}
export const writeFileSync = (p, s) => void (files[name(p)] = String(s));
export function renameSync(from, to) {
  files[name(to)] = files[name(from)];
  delete files[name(from)];
  if (name(to) === "db.json") idb("readwrite", (s) => s.put(files["db.json"], "db.json")).catch((e) => console.error("Save failed:", e));
}
export const mkdirSync = () => {};
export const appendFileSync = () => {}; // analytics stay in the browser
export const rmSync = () => {};
export const statSync = () => ({ isDirectory: () => false, mtimeMs: 0 });

// path
export const join = (...parts) => parts.join("/").replace(/\/+/g, "/");
export const normalize = (p) => p;
export const dirname = (p) => String(p).split("/").slice(0, -1).join("/");
export const basename = name;
export const extname = (p) => (name(p).match(/\.[^.]*$/) || [""])[0];

// crypto: ids and cache keys only, so any stable hash will do
export const randomBytes = (n) => ({ toString: () => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => b.toString(16).padStart(2, "0")).join("") });
export function createHash() {
  let s = "";
  const h = {
    update: (x) => ((s += x), h),
    digest: () => {
      let out = "";
      for (let seed = 1; out.length < 32; seed++) {
        let a = 0x811c9dc5 ^ seed;
        for (let i = 0; i < s.length; i++) a = Math.imul(a ^ s.charCodeAt(i), 0x01000193);
        out += (a >>> 0).toString(16).padStart(8, "0");
      }
      return out;
    },
  };
  return h;
}

// http: keep the request handler so boot.js can call it directly
export let handler = null;
let listened;
export const listening = new Promise((r) => (listened = r));
export const createServer = (fn) => ((handler = fn), { listen: (port, cb) => (cb && cb(), listened()) });

// zlib, os, child_process
export const gzipSync = (s) => s;
export const tmpdir = () => "/tmp";
export const execFile = () => {
  throw new Error("Not available in the browser");
};
export const execFileSync = execFile;
