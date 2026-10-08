// Shared Supabase project (txmnzia-dbs), schema fire_planner. Both values are
// public by design (row-level security protects the data); never put the
// secret / service_role key here.
const SUPABASE_URL = 'https://srnrnfrugpumzsmfsgjt.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_6NRDcc1RO15_sEpqtOgd9g_oT7P8RZE';
const SCHEMA = 'fire_planner';

let client;
// Loaded lazily from the CDN; null when offline or the CDN fails, and the app
// carries on local-only exactly as without sync.
export async function db() {
  if (client !== undefined) return client;
  try {
    const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { db: { schema: SCHEMA } });
  } catch { client = null; }
  return client;
}
