/** Yakıt türleri ve müşterinin isteyebileceği tutarlar. Denge ayarı burada. */

export type FuelType = 'dizel' | 'benzin' | 'lpg';

export interface FuelInfo {
  readonly id: FuelType;
  readonly label: string;
  /** Pompa ve etiket rengi. Türkiye'deki tabanca renklerine yakın tutuldu. */
  readonly color: number;
  readonly cssColor: string;
  /** Sipariş tutarını litreye çevirmek için sadeleştirilmiş perakende fiyatı. */
  readonly pricePerLiter: number;
  /** Tanker ikmal maliyeti; oyun ekonomisi için perakendeden düşük. */
  readonly wholesalePerLiter: number;
}

export const FUELS: readonly FuelInfo[] = [
  {
    id: 'dizel',
    label: 'Mazot',
    color: 0x2f7d4f,
    cssColor: '#43a86d',
    pricePerLiter: 47,
    wholesalePerLiter: 31,
  },
  {
    id: 'benzin',
    label: 'Benzin',
    color: 0xcf4646,
    cssColor: '#e05252',
    pricePerLiter: 49,
    wholesalePerLiter: 33,
  },
  {
    id: 'lpg',
    label: 'LPG',
    color: 0x3d76c9,
    cssColor: '#4e8ee4',
    pricePerLiter: 27,
    wholesalePerLiter: 18,
  },
];

/** ₺50'den ₺500'e kadar tüm ₺50 katları sipariş olabilir. */
export const AMOUNT_OPTIONS: readonly number[] = Array.from(
  { length: 10 },
  (_, index) => (index + 1) * 50,
);

export const FUEL_CAPACITY_LITERS = 420;
export const INITIAL_FUEL_LITERS = 280;
export const RESTOCK_BATCH_LITERS = 140;
export const FUEL_PRICE_STEP = 1;

export type FuelStock = Record<FuelType, number>;
export type FuelPrices = Record<FuelType, number>;
/** Tanker gelene kadar depoya eklenmeyen, yoldaki ikmal litreleri. */
export type PendingFuelRestocks = Partial<Record<FuelType, number>>;

export function createInitialFuelStock(): FuelStock {
  return {
    dizel: INITIAL_FUEL_LITERS,
    benzin: INITIAL_FUEL_LITERS,
    lpg: INITIAL_FUEL_LITERS,
  };
}

export function createInitialFuelPrices(): FuelPrices {
  return {
    dizel: findFuel('dizel').pricePerLiter,
    benzin: findFuel('benzin').pricePerLiter,
    lpg: findFuel('lpg').pricePerLiter,
  };
}

export function findFuel(id: FuelType): FuelInfo {
  const fuel = FUELS.find((candidate) => candidate.id === id);
  if (fuel === undefined) throw new Error(`Bilinmeyen yakıt: ${id}`);
  return fuel;
}

export function randomFuel(): FuelType {
  const index = Math.floor(Math.random() * FUELS.length);
  return FUELS[index]?.id ?? 'dizel';
}

export function randomAmount(): number {
  const index = Math.floor(Math.random() * AMOUNT_OPTIONS.length);
  return AMOUNT_OPTIONS[index] ?? 50;
}

export function fuelPriceBounds(fuel: FuelType): { min: number; max: number } {
  const info = findFuel(fuel);
  return {
    // Tedarik maliyetinin altına inerek istemeden zarar yazılamasın.
    min: Math.ceil(info.wholesalePerLiter + 2),
    max: Math.ceil(info.pricePerLiter * 1.55),
  };
}

export function clampFuelPrice(fuel: FuelType, price: number): number {
  const bounds = fuelPriceBounds(fuel);
  return Math.max(bounds.min, Math.min(bounds.max, Math.round(price)));
}

/**
 * Fiyat yükseldikçe istasyona sapmayı düşüren talep katsayısı.
 * 1 = normal, 1'in üstü daha sık müşteri, altı daha seyrek müşteri.
 */
export function fuelDemandFactor(fuel: FuelType, price: number): number {
  const base = findFuel(fuel).pricePerLiter;
  const relativeChange = (clampFuelPrice(fuel, price) - base) / base;
  return Math.max(0.28, Math.min(1.28, 1 - relativeChange * 2.05));
}

export type DemandLevel = 'cok-dusuk' | 'dusuk' | 'normal' | 'yuksek' | 'cok-yuksek';

/** Talep katsayısını beş kademeye indirger. Eşikler tek yerde dursun. */
export function demandLevel(demand: number): DemandLevel {
  if (demand >= 1.16) return 'cok-yuksek';
  if (demand >= 1.02) return 'yuksek';
  if (demand >= 0.82) return 'normal';
  if (demand >= 0.55) return 'dusuk';
  return 'cok-dusuk';
}

const DEMAND_LABELS: Record<DemandLevel, string> = {
  'cok-yuksek': 'Talep çok yüksek',
  yuksek: 'Talep yüksek',
  normal: 'Talep normal',
  dusuk: 'Talep düşük',
  'cok-dusuk': 'Talep çok düşük',
};

export function demandLabel(demand: number): string {
  return DEMAND_LABELS[demandLevel(demand)];
}

export function fuelDemandLabel(fuel: FuelType, price: number): string {
  return demandLabel(fuelDemandFactor(fuel, price));
}

export function litersForAmount(
  fuel: FuelType,
  amount: number,
  pricePerLiter = findFuel(fuel).pricePerLiter,
): number {
  return amount / Math.max(1, pricePerLiter);
}
