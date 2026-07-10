// ═══════════════════════════════════════════════════════════
//  Supabase client — single shared instance for the whole app.
// ═══════════════════════════════════════════════════════════
import { createClient } from '@supabase/supabase-js';

const url     = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  console.error('[Supabase] Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — set these in your .env and in Cloudflare Pages env vars.');
}

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
  realtime: {
    params: { eventsPerSecond: 10 },
  },
});
