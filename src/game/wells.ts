/**
 * Kuyu tanımları — oyunun tüm denge ayarı burada.
 * Her saha bir öncekinin ~15-20 katı maliyet ve üretim.
 *
 * id alanı kayıt dosyasına yazılır: yayına çıktıktan sonra ASLA değiştirme,
 * yoksa oyuncular ilerlemesini kaybeder.
 */

export interface WellDefinition {
  readonly id: string;
  readonly displayName: string;
  readonly baseCost: number;
  /** Her seviyede maliyetin çarpanı. 1.15 civarı idle oyunlarda standart. */
  readonly costGrowth: number;
  /** Seviye başına varil/saniye. */
  readonly barrelsPerSecondPerLevel: number;
  /** Sahadaki yeri (x, z) — kuş bakışı düzlemde. */
  readonly position: readonly [number, number];
}

/** Bir varilin satış fiyatı. */
export const BARREL_PRICE = 1;

export const WELLS: readonly WellDefinition[] = [
  {
    id: 'well_batman',
    displayName: 'Batman Kuyusu',
    baseCost: 12,
    costGrowth: 1.14,
    barrelsPerSecondPerLevel: 0.6,
    position: [-2.45, -4.4],
  },
  {
    id: 'well_adiyaman',
    displayName: 'Adıyaman Kuyusu',
    baseCost: 220,
    costGrowth: 1.15,
    barrelsPerSecondPerLevel: 5,
    position: [2.45, -4.4],
  },
  {
    id: 'well_trakya',
    displayName: 'Trakya Kuyusu',
    baseCost: 4200,
    costGrowth: 1.16,
    barrelsPerSecondPerLevel: 42,
    position: [-2.45, 2.4],
  },
  {
    id: 'well_deniz',
    displayName: 'Deniz Platformu',
    baseCost: 90000,
    costGrowth: 1.17,
    barrelsPerSecondPerLevel: 380,
    position: [2.45, 2.4],
  },
];

const BY_ID = new Map<string, WellDefinition>(WELLS.map((well) => [well.id, well]));

export function findWell(id: string): WellDefinition | undefined {
  return BY_ID.get(id);
}

/** Mevcut seviyeden bir sonrakine geçmenin maliyeti. */
export function upgradeCost(definition: WellDefinition, currentLevel: number): number {
  const level = Math.max(0, currentLevel);
  return definition.baseCost * Math.pow(definition.costGrowth, level);
}

/** Verilen seviyedeki varil/saniye. Seviye 0 = kilitli, üretim yok. */
export function production(definition: WellDefinition, level: number): number {
  return level <= 0 ? 0 : definition.barrelsPerSecondPerLevel * level;
}
