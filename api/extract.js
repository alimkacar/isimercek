// Vercel sunucu fonksiyonu: POST /api/extract. Gemini anahtarı yalnız sunucudaki GEMINI_API_KEY ortam değişkenindedir.
import { handleExtract, extractStatus, createRateLimiter, originAllowed, clientIp } from '../lib/extract-core.mjs';

const limit = createRateLimiter();

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method === 'GET') { res.status(200).json(extractStatus()); return; }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    res.status(405).json({ ok: false, error: 'Yalnız POST isteği desteklenir.' });
    return;
  }
  if (!originAllowed(req.headers)) { res.status(403).json({ ok: false, error: 'Bu uç nokta yalnız IsıMercek arayüzünden kullanılabilir.' }); return; }
  const gate = limit(clientIp(req.headers, req.socket?.remoteAddress));
  if (!gate.ok) {
    res.setHeader('Retry-After', String(gate.retryAfter));
    res.status(429).json({ ok: false, error: 'Kısa sürede çok fazla çıkarım istendi. Birkaç dakika sonra tekrar deneyin.' });
    return;
  }
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { res.status(400).json({ ok: false, error: 'İstek gövdesi geçerli JSON değil.' }); return; }
  }
  const result = await handleExtract(body);
  res.status(result.status).json(result.body);
}
