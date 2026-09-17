BOSS LISTERS AI — Starter Kit
==============================
1. Open MASTER_PROMPT.txt
2. Copy ALL of it
3. Paste into Google AI Studio (aistudio.google.com) with Gemini 1.5 Pro
4. Also upload these as context files: src/types.ts, src/data.ts,
   src/lib/supabaseClient.ts, src/lib/inventoryApi.ts, .env.example
5. Gemini will output the full working codebase

After Gemini generates the files:
  cp .env.example .env   # fill in VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
  npm install
  npm run dev

Boss Listers shares its `products` table with the eBay sync service and
the public storefront — see inventory-sync/DEPLOY.md in the main repo
for how that Supabase project is set up.
