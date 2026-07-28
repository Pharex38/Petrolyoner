import type { PlayerData } from './state';
import { SAVE_VERSION, createNewGame } from './state';
import {
  FUEL_CAPACITY_LITERS,
  FUELS,
  clampFuelPrice,
  type FuelPrices,
  type PendingFuelRestocks,
  type FuelStock,
} from './fuel';
import { normalizeManagementState } from './management';
import { DEFAULT_TRAFFIC_SIDE, isTrafficSide } from './traffic';
import {
  MARKET_ITEMS,
  clampMarketPrice,
  type MarketPrices,
} from './market';

const STORAGE_KEY = 'petrolyoner.save';

/**
 * Kayıt localStorage'da tutuluyor. Tarayıcı verileri temizlenirse ilerleme
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
    const data = migrate(JSON.parse(raw) as unknown);

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

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/**
 * Eski sürüm kayıtlarını güncel şemaya taşır ve gelen verinin şeklini doğrular.
 *
 * v1 petrol sahası sürümüydü (wells alanı vardı). İstasyon oyununa geçerken
 * kuyu seviyelerinin karşılığı yok; parayı koruyup pompaları sıfırlıyoruz.
 */
function migrate(input: unknown): PlayerData | null {
  if (typeof input !== 'object' || input === null) return null;

  const raw = input as Record<string, unknown>;
  if (typeof raw.money !== 'number') return null;

  const fallback = createNewGame();

  const unlocked = Array.isArray(raw.unlockedSlots)
    ? raw.unlockedSlots
        .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
        .map((value) => Math.max(0, Math.floor(value)))
    : [];

  // İlk pompa her zaman açık olmalı, yoksa oyun oynanamaz hale gelir.
  if (!unlocked.includes(0)) unlocked.push(0);

  const rawFuelStock =
    typeof raw.fuelStock === 'object' && raw.fuelStock !== null
      ? raw.fuelStock as Record<string, unknown>
      : {};
  const fuelStock = { ...fallback.fuelStock } as FuelStock;
  for (const fuel of FUELS) {
    fuelStock[fuel.id] = Math.max(
      0,
      Math.min(
        FUEL_CAPACITY_LITERS,
        numberOr(rawFuelStock[fuel.id], fallback.fuelStock[fuel.id]),
      ),
    );
  }

  const rawPendingRestocks =
    typeof raw.pendingFuelRestocks === 'object' && raw.pendingFuelRestocks !== null
      ? raw.pendingFuelRestocks as Record<string, unknown>
      : {};
  const pendingFuelRestocks: PendingFuelRestocks = {};
  for (const fuel of FUELS) {
    const liters = numberOr(rawPendingRestocks[fuel.id], 0);
    if (liters > 0) {
      pendingFuelRestocks[fuel.id] = Math.min(
        FUEL_CAPACITY_LITERS,
        liters,
      );
    }
  }

  const rawFuelPrices =
    typeof raw.fuelPrices === 'object' && raw.fuelPrices !== null
      ? raw.fuelPrices as Record<string, unknown>
      : {};
  const fuelPrices = { ...fallback.fuelPrices } as FuelPrices;
  for (const fuel of FUELS) {
    fuelPrices[fuel.id] = clampFuelPrice(
      fuel.id,
      numberOr(rawFuelPrices[fuel.id], fallback.fuelPrices[fuel.id]),
    );
  }

  const rawMarketPrices =
    typeof raw.marketPrices === 'object' && raw.marketPrices !== null
      ? raw.marketPrices as Record<string, unknown>
      : {};
  const marketPrices = { ...fallback.marketPrices } as MarketPrices;
  for (const item of MARKET_ITEMS) {
    marketPrices[item.id] = clampMarketPrice(
      item.id,
      numberOr(rawMarketPrices[item.id], fallback.marketPrices[item.id]),
    );
  }

  return {
    saveVersion: SAVE_VERSION,
    money: numberOr(raw.money, 0),
    totalEarned: numberOr(raw.totalEarned, 0),
    servedCars: numberOr(raw.servedCars, 0),
    missedCars: numberOr(raw.missedCars, 0),
    unlockedSlots: [...new Set(unlocked)].sort((a, b) => a - b),
    marketBuilt: raw.marketBuilt === true,
    fuelStock,
    fuelPrices,
    pendingFuelRestocks,
    marketPrices,
    marketSales: Math.max(0, Math.floor(numberOr(raw.marketSales, 0))),
    management: normalizeManagementState(raw.management),
    attendants: Math.max(0, Math.floor(numberOr(raw.attendants, 0))),
    trafficSide: isTrafficSide(raw.trafficSide) ? raw.trafficSide : DEFAULT_TRAFFIC_SIDE,
    lastSeenUnixSeconds: numberOr(raw.lastSeenUnixSeconds, fallback.lastSeenUnixSeconds),
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
