// ═══════════════════════════════════════════════════════
//  LiveKit Token Client — fetches temporary JWT from
//  the server-side token endpoint. Never exposes secrets.
// ═══════════════════════════════════════════════════════
import { LIVEKIT_CONFIG } from './livekitConfig';

/**
 * Request a short-lived LiveKit access token from the server.
 * @param {string} roomName
 * @param {string} participantIdentity  — uid of the Firebase user
 * @param {string} participantName      — display name
 * @param {object} grants               — optional extra grants
 * @returns {{ token: string, url: string }}
 */
export async function fetchLiveKitToken(roomName, participantIdentity, participantName, grants = {}) {
  const resp = await fetch(LIVEKIT_CONFIG.tokenEndpoint, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roomName, participantIdentity, participantName, grants }),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.error || `Token request failed: ${resp.status}`);
  }

  const data = await resp.json();
  if (!data.token) throw new Error('Server returned no token');
  return { token: data.token, url: data.url || LIVEKIT_CONFIG.url };
}
