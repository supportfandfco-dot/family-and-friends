// ── Cloudflare Pages Function — Gemini Proxy ─────────────────
// Env var: GEMINI_API_KEY (set in Cloudflare Pages → Settings → Variables)

export async function onRequestPost({ request, env }) {
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'GEMINI_API_KEY not configured' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    // gemini-2.0-flash was shut down by Google on June 1, 2026 — that's why
    // media intelligence stopped working, not an integration bug. Using
    // gemini-3.5-flash (released May 2026, no shutdown announced yet) rather
    // than the direct-replacement gemini-2.5-flash, since that one already
    // has an announced Oct 16, 2026 shutdown — this avoids a second
    // migration a few months from now.
    const { prompt, system, model = 'gemini-3.5-flash', max_tokens = 512, imageBase64, imageMimeType } = await request.json();

    const parts = [];
    if (imageBase64) {
      parts.push({ inlineData: { mimeType: imageMimeType || 'image/jpeg', data: imageBase64 } });
    }
    parts.push({ text: prompt });

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
      return new Response(JSON.stringify({ error: data?.error?.message || `Gemini error ${upstream.status}` }), {
        status: upstream.status, headers: { 'Content-Type': 'application/json' },
      });
    }

    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
    return new Response(JSON.stringify({ text }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
}
