// ── Vercel Serverless — Direct Gemini Proxy ──────────────────
// Handles text and vision (image) requests

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY not configured' });

  const {
    prompt,
    system,
    model = 'gemini-2.0-flash',
    max_tokens = 512,
    imageBase64,
    imageMimeType,
  } = req.body;

  // Build content parts — text only or vision
  const parts = [];
  if (imageBase64) {
    parts.push({ inlineData: { mimeType: imageMimeType || 'image/jpeg', data: imageBase64 } });
  }
  parts.push({ text: prompt });

  try {
    const upstream = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: system ? { parts: [{ text: system }] } : undefined,
          contents: [{ role: 'user', parts }],
          generationConfig: { maxOutputTokens: max_tokens },
        }),
      }
    );

    const data = await upstream.json();

    if (!upstream.ok) {
      return res.status(upstream.status).json({
        error: data?.error?.message || `Gemini error ${upstream.status}`
      });
    }

    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
    res.status(200).json({ text });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export const config = { api: { bodyParser: true } };
