export type PlatformName = "ebay" | "poshmark" | "mercari" | "depop" | "grailed" | "etsy" | "shopify" | "tiktok";

export type ProductCondition =
  | "New With Tags (NWT)"
  | "New Without Tags (NWOT)"
  | "Like New / Excellent Used Condition (EUC)"
  | "Good Used Condition (GUC)"
  | "Fair Condition";

export interface SyncRecord {
  listed: boolean;
  listedPrice?: number;
  listedUrl?: string;
  syncedAt?: string;
  syncStatus: "idle" | "loading" | "success" | "error";
  syncLog?: string;
}

export interface ResellerProduct {
  id: string;
  title: string;
  brand: string;
  size: string;
  condition: ProductCondition;
  buyCost: number;
  suggestedPrice: number;
  sku: string;
  upc?: string;
  imageUrl: string;
  description: string;
  platforms: Record<PlatformName, SyncRecord>;
  createdAt: string;
  /** Present once this SKU exists in the shared Supabase `products` table. */
  status?: ProductStatus;
  /** "ebay" once the eBay sync (inventory-sync/) has claimed this SKU; "manual" until then. */
  source?: ProductSource;
}

/**
 * Row shape of the shared `public.products` table (Supabase), the single
 * source of truth also read by the website storefront and written by the
 * eBay sync Edge Function. Mirrors inventory-sync/supabase/migrations/0001_init_inventory.sql —
 * keep both in sync when the schema changes. Boss Listers' richer
 * ResellerProduct model maps to/from this via src/lib/inventoryApi.ts.
 */
export type ProductStatus = "active" | "ended" | "draft" | "out_of_stock";
export type ProductSource = "ebay" | "manual";

export interface ProductRow {
  id?: string;
  sku: string;
  title: string;
  description: string | null;
  price: number;
  quantity: number;
  image_url: string | null;
  condition: string | null;
  status: ProductStatus;
  source: ProductSource;
  ebay_listing_id: string | null;
  ebay_category_id: string | null;
  last_ebay_price: number | null;
  last_ebay_quantity: number | null;
  synced_at: string | null;
  created_at?: string;
  updated_at?: string;
}
