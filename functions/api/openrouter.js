// ── Cloudflare Pages Function — OpenRouter Proxy ─────────────
export async function onRequestPost({ request, env }) {
  const apiKey = env.OPENROUTER_API_KEY;
  if (!apiKey) return new Response(JSON.stringify({ error: 'OPENROUTER_API_KEY not configured' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  try {
    const body = await request.json();
    const upstream = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': env.APP_URL || 'https://familyfriends.app',
        'X-Title': 'Family and Friends UnifyAI',
      },
      body: JSON.stringify(body),
    });
    const data = await upstream.json();
    return new Response(JSON.stringify(data), { status: upstream.status, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
