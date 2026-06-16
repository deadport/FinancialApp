import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabasePublishableKey = (
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY
) as string | undefined;

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error('Supabase env vars missing. Copy .env.example to .env.local.');
}

export const supabase = createClient(supabaseUrl, supabasePublishableKey);
