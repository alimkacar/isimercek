// Vercel sunucu fonksiyonu: POST /api/extract. Gemini anahtarı yalnız sunucudaki GEMINI_API_KEY ortam değişkenindedir.
import { handleExtract, extractStatus } from '../lib/extract-core.mjs';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method === 'GET') { res.status(200).json(extractStatus()); return; }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    res.status(405).json({ ok: false, error: 'Yalnız POST isteği desteklenir.' });
    return;
  }
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { res.status(400).json({ ok: false, error: 'İstek gövdesi geçerli JSON değil.' }); return; }
  }
  const result = await handleExtract(body);
  res.status(result.status).json(result.body);
}
