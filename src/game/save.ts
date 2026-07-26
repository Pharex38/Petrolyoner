import type { PlayerData, WellSave } from './state';
import { SAVE_VERSION, createNewGame } from './state';

const STORAGE_KEY = 'petrolyoner.save';

/**
 * Kayıt localStorage'da tutuluyor. Tarayıcı kayıtları temizlenirse ilerleme
 * gider — bulut kaydı v0.4'te (hesap sistemiyle birlikte) gelecek.
 */
export function loadGame(): PlayerData | null {
  let raw: string | null;

  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    // Gizli sekme veya kısıtlı depolama.
    console.warn('[save] localStorage okunamadı, kayıtsız devam ediliyor.');
    return null;
  }

  if (raw === null) return null;

  try {
    const parsed = JSON.parse(raw) as unknown;
    const data = migrate(parsed);

    if (data === null) {
      console.error('[save] Kayıt bozuk, yedeklenip sıfırlanıyor.');
      backupCorrupt(raw);
      return null;
    }

    return data;
  } catch (error) {
    console.error('[save] Kayıt çözümlenemedi:', error);
    backupCorrupt(raw);
    return null;
  }
}

export function saveGame(data: PlayerData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    console.error('[save] Kayıt yazılamadı:', error);
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* yoksayılabilir */
  }
}

/**
 * Eski sürüm kayıtlarını güncel şemaya taşır ve gelen verinin şeklini doğrular.
 * Alan eklerken SAVE_VERSION'ı artır ve buraya bir adım ekle.
 */
function migrate(input: unknown): PlayerData | null {
  if (typeof input !== 'object' || input === null) return null;

  const raw = input as Partial<PlayerData>;
  if (typeof raw.money !== 'number' || !Array.isArray(raw.wells)) return null;

  const fallback = createNewGame();

  const wells = raw.wells
    .filter((well): well is WellSave =>
      typeof well === 'object' &&
      well !== null &&
      typeof (well as WellSave).wellId === 'string' &&
      Number.isFinite((well as WellSave).level))
    .map((well) => ({ wellId: well.wellId, level: Math.max(0, Math.floor(well.level)) }));

  return {
    saveVersion: SAVE_VERSION,
    money: Number.isFinite(raw.money) ? raw.money : 0,
    totalEarned: Number.isFinite(raw.totalEarned) ? (raw.totalEarned as number) : 0,
    prestigeCount: Number.isFinite(raw.prestigeCount) ? (raw.prestigeCount as number) : 0,
    prestigeMultiplier: Number.isFinite(raw.prestigeMultiplier) ? (raw.prestigeMultiplier as number) : 1,
    lastSeenUnixSeconds: Number.isFinite(raw.lastSeenUnixSeconds)
      ? (raw.lastSeenUnixSeconds as number)
      : fallback.lastSeenUnixSeconds,
    wells: wells.length > 0 ? wells : fallback.wells,
  };
}

/** Bozuk kaydı silmek yerine kenara alır — destek için kurtarılabilir. */
function backupCorrupt(raw: string): void {
  try {
    localStorage.setItem(`${STORAGE_KEY}.corrupt.${Date.now()}`, raw);
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* yoksayılabilir */
  }
}
