// ── Cloudflare Pages Function — LiveKit Token Generator ───────
// Generates temporary participant tokens server-side.
// Clients NEVER receive LiveKit API keys — only short-lived JWTs.
//
// Required env vars (set in Cloudflare Pages dashboard):
//   LIVEKIT_API_KEY     — from LiveKit Cloud project settings
//   LIVEKIT_API_SECRET  — from LiveKit Cloud project settings
//   LIVEKIT_URL         — e.g. wss://your-project.livekit.cloud

export async function onRequestPost({ request, env }) {
  const apiKey    = env.LIVEKIT_API_KEY;
  const apiSecret = env.LIVEKIT_API_SECRET;

  if (!apiKey || !apiSecret) {
    return new Response(
      JSON.stringify({ error: 'LiveKit not configured — set LIVEKIT_API_KEY and LIVEKIT_API_SECRET' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }

  let body;
  try { body = await request.json(); }
  catch { return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 }); }

  const { roomName, participantIdentity, participantName, grants = {} } = body;
  if (!roomName || !participantIdentity) {
    return new Response(
      JSON.stringify({ error: 'roomName and participantIdentity are required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const token = await buildAccessToken({
      apiKey,
      apiSecret,
      roomName,
      participantIdentity,
      participantName: participantName || participantIdentity,
      grants: {
        roomJoin: true,
        room: roomName,
        canPublish: true,
        canSubscribe: true,
        canPublishData: true,
        ...grants,
      },
      ttl: 3600, // 1 hour
    });

    return new Response(
      JSON.stringify({ token, url: env.LIVEKIT_URL }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// ── JWT builder using SubtleCrypto (no Node.js runtime needed) ──
async function buildAccessToken({ apiKey, apiSecret, roomName, participantIdentity, participantName, grants, ttl }) {
  const now = Math.floor(Date.now() / 1000);

  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    iss: apiKey,
    sub: participantIdentity,
    name: participantName,
    jti: `${participantIdentity}-${now}`,
    nbf: now,
    exp: now + ttl,
    video: grants,
  };

  const b64url = (obj) => btoa(JSON.stringify(obj))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

  const signingInput = `${b64url(header)}.${b64url(payload)}`;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(apiSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signingInput));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

  return `${signingInput}.${sigB64}`;
}
