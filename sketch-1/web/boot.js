// Runs server.js inside the browser for the GitHub Pages build (see .github/workflows/deploy.yml).
// The app's "/api/..." requests are answered here instead of by `node server.js`, with data saved
// in this browser only, and keyword matching in place of the AI (an API key can't be kept secret on Pages).
const node = require("./node.js");

const ready = (async () => {
  const [events, requests] = await Promise.all(["seed/events.json", "seed/requests.json"].map((f) => fetch(f).then((r) => r.text())));
  Object.assign(node.files, { "events.json": events, "requests.json": requests });
  await node.loadSaved();
  require("../server.js"); // loads the database, then "listens"
  await node.listening;
})();

function serve(url, init = {}) {
  return new Promise((resolve) => {
    const req = {
      method: init.method || "GET",
      url,
      headers: {},
      on(ev, cb) {
        if (ev === "data" && init.body) queueMicrotask(() => cb(init.body));
        if (ev === "end") queueMicrotask(cb);
      },
      destroy() {},
    };
    let status = 200;
    const res = {
      writeHead: (s) => (status = s),
      end: (body) => resolve(new Response(status === 204 ? null : body, { status, headers: { "content-type": "application/json" } })),
    };
    node.handler(req, res);
  });
}

const realFetch = window.fetch.bind(window);
window.fetch = async (url, init) => {
  if (typeof url !== "string" || !url.startsWith("/api/")) return realFetch(url, init);
  await ready;
  return serve(url, init);
};
