import type { TrafficSide } from './traffic';

/**
 * Pompa yerleşimi. Dikey ekran için tasarlandı: arabalar alttan girip ortadaki
 * şeritten yukarı ilerler, sonra yana kayıp pompanın yanına yanaşır.
 *
 * Sol/sağ ikili sıralar halinde 6 pompa. İlk pompa bedava açık gelir.
 */

export interface SlotDefinition {
  readonly index: number;
  /** Pompa adasının x konumu. */
  readonly pumpX: number;
  /** Arabanın park ettiği x konumu — pompa ile şerit arasında. */
  readonly carX: number;
  readonly z: number;
  readonly unlockCost: number;
}

/*
 * Orta koridor ile park cepleri arasında bir araç genişliğinden fazla açıklık
 * bırakıyoruz. Böylece arkadaki pompaya giden araç, öndeki müşterinin gövdesini
 * kesmeden merkez koridorda ilerleyebiliyor.
 */
const LEFT_PUMP_X = -4.45;
const RIGHT_PUMP_X = 4.45;
const LEFT_CAR_X = -2.75;
const RIGHT_CAR_X = 2.75;

export const SLOTS: readonly SlotDefinition[] = [
  { index: 0, pumpX: LEFT_PUMP_X, carX: LEFT_CAR_X, z: 4.4, unlockCost: 0 },
  { index: 1, pumpX: RIGHT_PUMP_X, carX: RIGHT_CAR_X, z: 4.4, unlockCost: 2500 },
  { index: 2, pumpX: LEFT_PUMP_X, carX: LEFT_CAR_X, z: 0, unlockCost: 7000 },
  { index: 3, pumpX: RIGHT_PUMP_X, carX: RIGHT_CAR_X, z: 0, unlockCost: 18000 },
  { index: 4, pumpX: LEFT_PUMP_X, carX: LEFT_CAR_X, z: -4.4, unlockCost: 45000 },
  { index: 5, pumpX: RIGHT_PUMP_X, carX: RIGHT_CAR_X, z: -4.4, unlockCost: 110000 },
];

/** Müşteri araçlarının ana yoldan istasyon şeridine döndüğü kavşak. */
export const ENTRY_Z = 11.5;
/** Servisi biten araçların ayrı bir kapıdan ana yola katıldığı kavşak. */
export const EXIT_Z = -9.2;
/**
 * Sonradan kurulabilen market ve şantiyesi, sol pompa sırasının arkasında,
 * arsanın sol kenarı boyunca uzanır. Uzun ekseni z'ye paralel olduğu için
 * vitrin pompalara bakar; ne kazı alanı ne de bina sürüş çizgilerini keser.
 */
export const MARKET_X = -7.6;
export const MARKET_Z = 0;
/** Binayı ve şantiyeyi çeyrek tur çevirir: vitrin +x'e, yani pompalara bakar. */
export const MARKET_ROTATION_Y = Math.PI / 2;
export const LANE_X = 0;

export function findSlot(index: number): SlotDefinition | undefined {
  return SLOTS[index];
}

/**
 * Araçların sahaya girdiği kapı. Sağdan trafikte alttaki (ENTRY_Z), soldan
 * trafikte üstteki (EXIT_Z) kapı giriş olur.
 */
export function stationEntryZ(side: TrafficSide): number {
  return side === 'sag' ? ENTRY_Z : EXIT_Z;
}

/** Araçların sahadan çıktığı kapı — girişin karşıtı. */
export function stationExitZ(side: TrafficSide): number {
  return side === 'sag' ? EXIT_Z : ENTRY_Z;
}
