import { ResellerProduct, PlatformName } from "./types";

export function calculateProductProfit(price: number, buyCost: number, platform: PlatformName) {
  let platformFee = 0;
  if (platform === "ebay")          platformFee = price * 0.1325 + 0.30;
  else if (platform === "poshmark") platformFee = price < 15 ? 2.95 : price * 0.20;
  else if (platform === "mercari")  platformFee = price * 0.10 + (price * 0.029 + 0.50);
  else if (platform === "depop")    platformFee = price * 0.10 + (price * 0.033 + 0.45);
  else if (platform === "grailed")  platformFee = price * 0.09 + (price * 0.0349 + 0.49);
  else if (platform === "etsy")     platformFee = price * 0.065 + (price * 0.03 + 0.25);
  else if (platform === "shopify")  platformFee = price * 0.029 + 0.30;
  else if (platform === "tiktok")   platformFee = price * 0.08 + 0.30;

  const roundedFee    = Math.round(platformFee * 100) / 100;
  const netProfit     = price - buyCost - roundedFee;
  const marginPercent = price > 0 ? Math.round((netProfit / price) * 100) : 0;
  return { platformFee: roundedFee, netProfit: Math.round(netProfit * 100) / 100, marginPercent };
}
