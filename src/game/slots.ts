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

const LEFT_PUMP_X = -2.9;
const RIGHT_PUMP_X = 2.9;
const LEFT_CAR_X = -1.5;
const RIGHT_CAR_X = 1.5;

export const SLOTS: readonly SlotDefinition[] = [
  { index: 0, pumpX: LEFT_PUMP_X, carX: LEFT_CAR_X, z: 3.6, unlockCost: 0 },
  { index: 1, pumpX: RIGHT_PUMP_X, carX: RIGHT_CAR_X, z: 3.6, unlockCost: 2500 },
  { index: 2, pumpX: LEFT_PUMP_X, carX: LEFT_CAR_X, z: 0.2, unlockCost: 7000 },
  { index: 3, pumpX: RIGHT_PUMP_X, carX: RIGHT_CAR_X, z: 0.2, unlockCost: 18000 },
  { index: 4, pumpX: LEFT_PUMP_X, carX: LEFT_CAR_X, z: -3.2, unlockCost: 45000 },
  { index: 5, pumpX: RIGHT_PUMP_X, carX: RIGHT_CAR_X, z: -3.2, unlockCost: 110000 },
];

/** Arabaların istasyona girdiği ve çıktığı noktalar. */
export const ENTRY_Z = 10;
export const EXIT_Z = -10;
export const LANE_X = 0;

export function findSlot(index: number): SlotDefinition | undefined {
  return SLOTS[index];
}
