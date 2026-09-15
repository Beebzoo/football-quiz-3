/* A static server for working on BALL 3 locally.
 *
 *     node _tools/serve.js [port]        default 8802
 *
 * file:// will not do: the app fetches its decks, and every one of those comes
 * back as a CORS failure off the filesystem, so each mode sits greyed out and
 * the pitch never loads. It has to be served.
 *
 * Nothing is allowed to sit in the browser cache. A service worker holding a
 * stale build while you are changing it is the single most confusing thing
 * that can happen in this repo: the code is right, the tests are green, and
 * the page keeps showing you yesterday.
 */
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const PORT = Number(process.argv[2] || 8802);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".csv": "text/csv; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".ico": "image/x-icon",
};

http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (p === "/") p = "/index.html";
  const file = path.join(ROOT, p);
  if (!path.resolve(file).startsWith(path.resolve(ROOT))) {
    res.writeHead(403).end("no");
    return;
  }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, { "Content-Type": "text/plain" }).end("404 " + p); return; }
    res.writeHead(200, {
      "Content-Type": TYPES[path.extname(file).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-store",
    }).end(buf);
  });
}).listen(PORT, "127.0.0.1", () => {
  console.log("BALL 3 serving at http://localhost:" + PORT + "/");
  console.log("root: " + ROOT);
});
