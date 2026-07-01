// ═══════════════════════════════════════════════════════════
//  Cloudflare Pages Function — server-side FCM push sender.
//
//  WHY THIS EXISTS:
//  The previous implementation ran entirely in the browser:
//    - It bundled a Firebase service account RSA private key into
//      the CLIENT JS via VITE_SA_PRIVATE_KEY (a serious secret leak
//      — anyone could extract it from DevTools).
//    - It called FCM's v1 send API (fcm.googleapis.com) directly
//      from the browser, which Google blocks via CORS — meaning
//      EVERY push send silently failed, explaining why
//      notifications never worked.
//
//  This function moves both the OAuth token exchange and the FCM
//  send call server-side, where CORS doesn't apply and the private
//  key is never exposed to any client.
//
//  Required env vars (set in Cloudflare Pages dashboard, NOT
//  prefixed with VITE_ — those are client-exposed):
//    SA_CLIENT_EMAIL   — Firebase service account client_email
//    SA_PRIVATE_KEY    — Firebase service account private_key (PEM)
//    FIREBASE_PROJECT_ID — e.g. family-friends-ee992
// ═══════════════════════════════════════════════════════════

let _tokenCache = { token: null, expiresAt: 0 };

async function getAccessToken(env) {
  if (_tokenCache.token && Date.now() < _tokenCache.expiresAt - 300_000) {
    return _tokenCache.token;
  }

  const clientEmail = env.SA_CLIENT_EMAIL;
  const privateKeyPem = env.SA_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (!clientEmail || !privateKeyPem) return null;

  const now = Math.floor(Date.now() / 1000);
  const header  = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: clientEmail,
    sub: clientEmail,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
  };

  const b64url = (obj) => btoa(JSON.stringify(obj))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  const signingInput = `${b64url(header)}.${b64url(payload)}`;

  const pemBody = privateKeyPem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s/g, '');
  const keyDer = Uint8Array.from(atob(pemBody), c => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8', keyDer.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign']
  );

  const sig = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5', cryptoKey, new TextEncoder().encode(signingInput)
  );
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  const jwt = `${signingInput}.${sigB64}`;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  const json = await tokenRes.json();
  if (!json.access_token) return null;

  _tokenCache = { token: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return json.access_token;
}

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); }
  catch { return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 }); }

  const { token, title, body: msgBody, data = {} } = body;
  if (!token || !title) {
    return new Response(JSON.stringify({ error: 'token and title are required' }), { status: 400 });
  }

  const accessToken = await getAccessToken(env);
  if (!accessToken) {
    return new Response(
      JSON.stringify({ error: 'Push not configured — SA_CLIENT_EMAIL/SA_PRIVATE_KEY missing on server' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const projectId = env.FIREBASE_PROJECT_ID || 'family-friends-ee992';
  const isCall = !!data.callType;
  const actions = isCall
    ? [{ action: 'open', title: 'Open app' }]
    : [{ action: 'reply', title: '↩ Reply' }, { action: 'dismiss', title: 'Dismiss' }];

  try {
    const fcmRes = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        message: {
          token,
          notification: { title, body: msgBody },
          data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
          webpush: {
            notification: {
              title, body: msgBody,
              icon: '/icon-192.png',
              tag: data.tag || 'ff-msg',
              renotify: true,
              requireInteraction: isCall,
              actions,
            },
            fcm_options: { link: '/' },
          },
        },
      }),
    });

    const fcmJson = await fcmRes.json();
    if (!fcmRes.ok) {
      return new Response(JSON.stringify({ error: fcmJson.error?.message || 'FCM send failed' }), {
        status: fcmRes.status, headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
}
