// DO Prospect Scout dashboard server (zero dependencies).
// Serves the static dashboard and proxies Jev evaluations so the
// TypeSafe API key stays server-side (set TYPESAFE_API_KEY in App Platform).
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = __dirname;
const MIME = { ".html": "text/html", ".json": "application/json", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon" };

async function jevProxy(req, res) {
  const key = process.env.TYPESAFE_API_KEY;
  if (!key) return send(res, 500, { error: "TYPESAFE_API_KEY is not configured on the server" });
  let body = "";
  req.on("data", c => { body += c; if (body.length > 262144) req.destroy(); });
  req.on("end", async () => {
    let parsed;
    try { parsed = JSON.parse(body); } catch { return send(res, 400, { error: "Invalid JSON body" }); }
    const { state, questions } = parsed || {};
    if (!state || !questions) return send(res, 400, { error: "Body must include state and questions" });
    const started = Date.now();
    try {
      const r = await fetch("https://api.typesafe.ai/v1/systemone", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ state, model: "jev-latest", questions }),
      });
      const j = await r.json();
      send(res, r.status, { ...j, elapsed_ms: Date.now() - started });
    } catch (e) {
      send(res, 502, { error: String(e) });
    }
  });
}

function send(res, status, obj) {
  const data = JSON.stringify(obj);
  res.writeHead(status, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) });
  res.end(data);
}

function serveStatic(req, res) {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p === "/") p = "/index.html";
  const file = path.join(ROOT, path.normalize(p));
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end("not found"); }
    res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-cache" });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/api/jev") return jevProxy(req, res);
  if (req.method === "GET" || req.method === "HEAD") return serveStatic(req, res);
  res.writeHead(405); res.end();
});

const port = process.env.PORT || 8080;
server.listen(port, () => console.log(`dashboard listening on ${port}`));
