/** Market ürünleri ve fiyat-talep dengesi. */

export type MarketItemId = 'kahve' | 'atistirmalik' | 'su';

export interface MarketItem {
  readonly id: MarketItemId;
  readonly label: string;
  readonly icon: string;
  readonly basePrice: number;
  readonly minPrice: number;
  readonly maxPrice: number;
  readonly step: number;
  /** Yakıt alan bir müşterinin ürünü taban fiyatta alma ihtimali. */
  readonly basePurchaseChance: number;
}

export const MARKET_ITEMS: readonly MarketItem[] = [
  {
    id: 'kahve',
    label: 'Kahve',
    icon: '☕',
    basePrice: 45,
    minPrice: 20,
    maxPrice: 100,
    step: 5,
    basePurchaseChance: 0.34,
  },
  {
    id: 'atistirmalik',
    label: 'Atıştırmalık',
    icon: '▰',
    basePrice: 35,
    minPrice: 15,
    maxPrice: 80,
    step: 5,
    basePurchaseChance: 0.29,
  },
  {
    id: 'su',
    label: 'Su',
    icon: '●',
    basePrice: 25,
    minPrice: 10,
    maxPrice: 60,
    step: 5,
    basePurchaseChance: 0.41,
  },
];

export type MarketPrices = Record<MarketItemId, number>;

export interface MarketSale {
  readonly item: MarketItem;
  readonly price: number;
}

export function findMarketItem(id: MarketItemId): MarketItem {
  const item = MARKET_ITEMS.find((candidate) => candidate.id === id);
  if (item === undefined) throw new Error(`Bilinmeyen market ürünü: ${id}`);
  return item;
}

export function createInitialMarketPrices(): MarketPrices {
  return {
    kahve: findMarketItem('kahve').basePrice,
    atistirmalik: findMarketItem('atistirmalik').basePrice,
    su: findMarketItem('su').basePrice,
  };
}

export function clampMarketPrice(id: MarketItemId, price: number): number {
  const item = findMarketItem(id);
  const stepped = Math.round(price / item.step) * item.step;
  return Math.max(item.minPrice, Math.min(item.maxPrice, stepped));
}

export function marketPurchaseChance(id: MarketItemId, price: number): number {
  const item = findMarketItem(id);
  const relativeChange = (clampMarketPrice(id, price) - item.basePrice) / item.basePrice;
  const priceFactor = Math.max(0.22, Math.min(1.45, 1 - relativeChange * 1.45));
  return Math.max(0.05, Math.min(0.62, item.basePurchaseChance * priceFactor));
}

export function marketDemandLabel(id: MarketItemId, price: number): string {
  const item = findMarketItem(id);
  const chance = marketPurchaseChance(id, price);
  const ratio = chance / item.basePurchaseChance;
  if (ratio >= 1.22) return 'Satış ihtimali çok yüksek';
  if (ratio >= 1.06) return 'Satış ihtimali yüksek';
  if (ratio >= 0.78) return 'Satış ihtimali normal';
  if (ratio >= 0.5) return 'Satış ihtimali düşük';
  return 'Satış ihtimali çok düşük';
}
