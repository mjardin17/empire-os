import { supabase } from "./supabaseClient";
import type { PlatformName, ProductRow, ResellerProduct, SyncRecord } from "../types";

const PLATFORM_NAMES: PlatformName[] = [
  "ebay", "poshmark", "mercari", "depop", "grailed", "etsy", "shopify", "tiktok",
];

function emptyPlatforms(): Record<PlatformName, SyncRecord> {
  return PLATFORM_NAMES.reduce((acc, name) => {
    acc[name] = { listed: false, syncStatus: "idle" };
    return acc;
  }, {} as Record<PlatformName, SyncRecord>);
}

/** Maps a shared `products` row into Boss Listers' richer local model. */
export function fromProductRow(row: ProductRow): ResellerProduct {
  const platforms = emptyPlatforms();
  if (row.source === "ebay") {
    platforms.ebay = {
      listed: row.status === "active",
      listedPrice: row.last_ebay_price ?? undefined,
      listedUrl: row.ebay_listing_id
        ? `https://www.ebay.com/itm/${row.ebay_listing_id}`
        : undefined,
      syncedAt: row.synced_at ?? undefined,
      syncStatus: "success",
    };
  }

  return {
    id: row.id ?? row.sku,
    title: row.title,
    brand: "",
    size: "",
    condition: "Good Used Condition (GUC)",
    buyCost: 0,
    suggestedPrice: row.price,
    sku: row.sku,
    imageUrl: row.image_url ?? "",
    description: row.description ?? "",
    platforms,
    createdAt: row.created_at ?? new Date().toISOString(),
    status: row.status,
    source: row.source,
  };
}

/**
 * Maps a Boss Listers product into the shared `products` row. Only ever
 * writes `source: "manual"` — items already synced from eBay
 * (`source: "ebay"`) are owned by inventory-sync/ and get overwritten on
 * the next 15-min poll, so editing price/quantity here has no lasting
 * effect until Boss Listers actually pushes the change through eBay's
 * Inventory API (not implemented; today Boss Listers only reads eBay's
 * state, it doesn't publish listings to it).
 */
export function toProductRow(product: ResellerProduct): ProductRow {
  return {
    sku: product.sku,
    title: product.title,
    description: product.description || null,
    price: product.suggestedPrice,
    quantity: 1,
    image_url: product.imageUrl || null,
    condition: product.condition,
    status: product.status ?? "draft",
    source: "manual",
    ebay_listing_id: null,
    ebay_category_id: null,
    last_ebay_price: null,
    last_ebay_quantity: null,
    synced_at: null,
  };
}

export async function listProducts(): Promise<ResellerProduct[]> {
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data as ProductRow[]).map(fromProductRow);
}

/** Requires a signed-in user with app_metadata.role === "boss_lister" (RLS-enforced). */
export async function upsertManualProduct(product: ResellerProduct): Promise<void> {
  const { error } = await supabase
    .from("products")
    .upsert(toProductRow(product), { onConflict: "sku" });
  if (error) throw error;
}

export async function deleteProduct(sku: string): Promise<void> {
  const { error } = await supabase.from("products").delete().eq("sku", sku);
  if (error) throw error;
}

/** Subscribes to live product changes (new eBay syncs, price/qty updates, deletes). */
export function subscribeToProducts(onChange: () => void): () => void {
  const channel = supabase
    .channel("boss-listers-products")
    .on("postgres_changes", { event: "*", schema: "public", table: "products" }, onChange)
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
