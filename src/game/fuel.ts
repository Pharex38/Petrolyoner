/** Yakıt türleri ve müşterinin isteyebileceği tutarlar. Denge ayarı burada. */

export type FuelType = 'dizel' | 'benzin' | 'lpg';

export interface FuelInfo {
  readonly id: FuelType;
  readonly label: string;
  /** Pompa ve etiket rengi. Türkiye'deki tabanca renklerine yakın tutuldu. */
  readonly color: number;
  readonly cssColor: string;
}

export const FUELS: readonly FuelInfo[] = [
  { id: 'dizel', label: 'Dizel', color: 0x2f7d4f, cssColor: '#2f7d4f' },
  { id: 'benzin', label: 'Benzin', color: 0xcf4646, cssColor: '#cf4646' },
  { id: 'lpg', label: 'LPG', color: 0x3d76c9, cssColor: '#3d76c9' },
];

/**
 * Müşterinin isteyebileceği tutarlar. Oyuncunun seçtiği seçeneklerle birebir
 * aynı küme olmalı — yoksa eşleşmesi imkânsız sipariş üretilir.
 */
export const AMOUNT_OPTIONS: readonly number[] = [100, 200, 300, 500];

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
  return AMOUNT_OPTIONS[index] ?? 100;
}
