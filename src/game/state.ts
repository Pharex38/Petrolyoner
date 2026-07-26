import { WELLS } from './wells';

export const SAVE_VERSION = 1;

export interface WellSave {
  wellId: string;
  level: number;
}

export interface PlayerData {
  saveVersion: number;
  money: number;
  totalEarned: number;
  prestigeCount: number;
  prestigeMultiplier: number;
  /** Oyunun son kapandığı an (saniye). Offline kazanç bundan hesaplanır. */
  lastSeenUnixSeconds: number;
  wells: WellSave[];
}

export function nowUnixSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

export function createNewGame(): PlayerData {
  const data: PlayerData = {
    saveVersion: SAVE_VERSION,
    money: 0,
    totalEarned: 0,
    prestigeCount: 0,
    prestigeMultiplier: 1,
    lastSeenUnixSeconds: nowUnixSeconds(),
    wells: [],
  };

  // İlk kuyu bedava ve açık gelir; oyuncu ilk saniyeden gelir görsün.
  const first = WELLS[0];
  if (first) data.wells.push({ wellId: first.id, level: 1 });

  return data;
}
