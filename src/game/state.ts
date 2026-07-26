export const SAVE_VERSION = 2;

export interface PlayerData {
  saveVersion: number;
  money: number;
  totalEarned: number;
  servedCars: number;
  /** Sabrı taşan veya yanlış yakıt verilen araçlar. */
  missedCars: number;
  /** Açılmış pompaların indeksleri. */
  unlockedSlots: number[];
  /** Oyunun son kapandığı an (saniye). Gece vardiyası kazancı bundan hesaplanır. */
  lastSeenUnixSeconds: number;
}

export function nowUnixSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

export function createNewGame(): PlayerData {
  return {
    saveVersion: SAVE_VERSION,
    money: 0,
    totalEarned: 0,
    servedCars: 0,
    missedCars: 0,
    // İlk pompa bedava açık gelir.
    unlockedSlots: [0],
    lastSeenUnixSeconds: nowUnixSeconds(),
  };
}
