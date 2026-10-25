import http from 'node:http';
import { readFile, realpath } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleExtract, extractStatus, createRateLimiter, originAllowed, clientIp } from './lib/extract-core.mjs';

const publicDir = fileURLToPath(new URL('./public/', import.meta.url));
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };
const MAX_BODY_BYTES = 5 * 1024 * 1024;

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }).end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolveBody, reject) => {
    const chunks = []; let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) { reject(Object.assign(new Error('too_large'), { status: 413 })); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end', () => resolveBody(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

export function createAppServer({ env = process.env, fetchImpl = fetch, rateLimit = createRateLimiter() } = {}) {
  return http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    let path;
    try { path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
    catch { res.writeHead(400).end('Dosya bulunamadı.'); return; }
    if (path === '/api/extract') {
      if (req.method === 'GET') { sendJson(res, 200, extractStatus(env)); return; }
      if (req.method !== 'POST') { res.setHeader('Allow', 'GET, POST'); sendJson(res, 405, { ok: false, error: 'Yalnız POST isteği desteklenir.' }); return; }
      if (!originAllowed(req.headers)) { sendJson(res, 403, { ok: false, error: 'Bu uç nokta yalnız IsıMercek arayüzünden kullanılabilir.' }); return; }
      const gate = rateLimit(clientIp({}, req.socket.remoteAddress));
      if (!gate.ok) { res.setHeader('Retry-After', String(gate.retryAfter)); sendJson(res, 429, { ok: false, error: 'Kısa sürede çok fazla çıkarım istendi. Birkaç dakika sonra tekrar deneyin.' }); return; }
      let body;
      try { body = JSON.parse(await readBody(req)); }
      catch (error) { sendJson(res, error.status === 413 ? 413 : 400, { ok: false, error: error.status === 413 ? 'İstek en fazla 5 MB olabilir.' : 'İstek gövdesi geçerli JSON değil.' }); return; }
      const result = await handleExtract(body, { env, fetchImpl });
      sendJson(res, result.status, result.body);
      return;
    }
    if (!['GET', 'HEAD'].includes(req.method)) {
      res.writeHead(405, { Allow: 'GET, HEAD' }).end('Yalnız okuma isteği desteklenir.');
      return;
    }
    try {
      if (path.includes('\0') || path.split('/').some(part => part.startsWith('.'))) {
        res.writeHead(404).end('Bulunamadı.'); return;
      }
      const file = await realpath(resolve(publicDir, '.' + (path === '/' ? '/index.html' : path)));
      if (!file.startsWith(publicDir + sep) && !file.startsWith(publicDir.endsWith(sep) ? publicDir : publicDir + sep)) {
        res.writeHead(404).end('Bulunamadı.'); return;
      }
      const content = await readFile(file);
      res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream' });
      res.end(req.method === 'HEAD' ? undefined : content);
    } catch (error) {
      res.writeHead(error instanceof URIError ? 400 : 404).end('Dosya bulunamadı.');
    }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // İsteğe bağlı yerel anahtar: proje klasöründeki .env (git'e girmez) → GEMINI_API_KEY=...
  try { process.loadEnvFile?.(fileURLToPath(new URL('./.env', import.meta.url))); } catch { /* .env yoksa Gemini adımı kapalı kalır */ }
  const port = Number(process.env.PORT || 4310);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Geçersiz PORT.');
  const server = createAppServer();
  server.on('error', error => { console.error('Yerel sunucu başlatılamadı:', error.message); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => console.log(`IsıMercek hazır: http://127.0.0.1:${port}${process.env.GEMINI_API_KEY ? ' · Gemini adımı açık' : ' · Gemini anahtarı yok (belgeden doldurma kapalı)'}`));
}
