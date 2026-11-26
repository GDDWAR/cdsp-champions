// Servidor de TESTE local (opcional): imita o Netlify para rodar o sistema no seu computador.
//   ADMIN_PASSWORD=suasenha node server/dev-server.mjs   ->  http://localhost:8888
// Os dados ficam na pasta .dados-local (não é usada no Netlify).
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { handle } from "./api-core.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pub = path.join(root, "public");
const dataDir = process.env.DATA_DIR || path.join(root, ".dados-local");
fs.mkdirSync(dataDir, { recursive: true });

const file = (key) => path.join(dataDir, encodeURIComponent(key));
const etagOf = (buf) => crypto.createHash("md5").update(buf).digest("hex");
const store = {
  async getJSON(key) {
    if (!fs.existsSync(file(key))) return null;
    const buf = fs.readFileSync(file(key));
    return { data: JSON.parse(buf), etag: etagOf(buf) };
  },
  async setJSON(key, data, opts = {}) {
    const exists = fs.existsSync(file(key));
    if (opts.onlyIfNew && exists) return { modified: false };
    if (opts.onlyIfMatch && (!exists || etagOf(fs.readFileSync(file(key))) !== opts.onlyIfMatch)) return { modified: false };
    const buf = Buffer.from(JSON.stringify(data));
    fs.writeFileSync(file(key), buf);
    return { modified: true, etag: etagOf(buf) };
  },
  async getBytes(key) { return fs.existsSync(file(key)) ? fs.readFileSync(file(key)) : null; },
  async setBytes(key, buf) { fs.writeFileSync(file(key), buf); },
  async delete(key) { fs.rmSync(file(key), { force: true }); },
};

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".png": "image/png", ".ico": "image/x-icon", ".svg": "image/svg+xml", ".json": "application/json", ".webmanifest": "application/manifest+json" };

const port = +(process.env.PORT || 8888);
http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname.startsWith("/api/")) {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = chunks.length ? Buffer.concat(chunks) : undefined;
    const request = new Request(url, { method: req.method, headers: req.headers, body: ["GET", "HEAD"].includes(req.method) ? undefined : body });
    const r = await handle(request, store, process.env);
    const headers = {};
    r.headers.forEach((v, k) => (headers[k] = v));
    res.writeHead(r.status, headers);
    res.end(Buffer.from(await r.arrayBuffer()));
    return;
  }
  let p = path.join(pub, decodeURIComponent(url.pathname));
  if (!p.startsWith(pub)) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, "index.html");
  if (!fs.existsSync(p)) p = path.join(pub, "index.html");
  res.writeHead(200, { "content-type": MIME[path.extname(p)] || "application/octet-stream" });
  fs.createReadStream(p).pipe(res);
}).listen(port, () => console.log(`CDSP Champions (teste local) em http://localhost:${port}`));
