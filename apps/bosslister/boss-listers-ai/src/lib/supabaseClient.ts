import { createClient } from "@supabase/supabase-js";

// Same Supabase project the eBay sync (inventory-sync/) and the website
// storefront read/write. Requires VITE_SUPABASE_URL and
// VITE_SUPABASE_ANON_KEY in .env (see .env.example) — get both from
// Supabase Dashboard -> Project Settings -> API.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY — copy .env.example to .env and fill them in.",
  );
}

// Writes to `products` require the signed-in user's JWT to carry
// app_metadata.role = "boss_lister" (enforced by RLS — see
// inventory-sync/supabase/migrations/0001_init_inventory.sql). Anonymous
// reads work with just the anon key.
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
