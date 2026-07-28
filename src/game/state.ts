import {
  createInitialFuelPrices,
  createInitialFuelStock,
  type FuelPrices,
  type PendingFuelRestocks,
  type FuelStock,
} from './fuel';
import {
  createInitialManagementState,
  type ManagementState,
} from './management';
import { createInitialMarketPrices, type MarketPrices } from './market';
import { DEFAULT_TRAFFIC_SIDE, type TrafficSide } from './traffic';

export const SAVE_VERSION = 8;

export interface PlayerData {
  saveVersion: number;
  money: number;
  totalEarned: number;
  servedCars: number;
  /** Sabrı taşan veya yanlış yakıt verilen araçlar. */
  missedCars: number;
  /** Açılmış pompaların indeksleri. */
  unlockedSlots: number[];
  /** Market başlangıçta yoktur; oyuncu kazancıyla sonradan inşa edilir. */
  marketBuilt: boolean;
  /** Yeraltı tanklarında kalan litre; her servis ve offline vardiya tüketir. */
  fuelStock: FuelStock;
  /** Oyuncunun ayarladığı litre satış fiyatları. */
  fuelPrices: FuelPrices;
  /** Ücreti ödenmiş fakat tanker boşaltmayı bitirmemiş yakıtlar. */
  pendingFuelRestocks: PendingFuelRestocks;
  /** Market raf fiyatları; market kurulmadan da kayıt şemasında hazır tutulur. */
  marketPrices: MarketPrices;
  /** Market kasasından geçen toplam ürün sayısı. */
  marketSales: number;
  /** Şirket yönetimi, personel, rakipler, hukuk ve ham petrol ekonomisi. */
  management: ManagementState;
  /** İşe alınmış pompacı sayısı; en küçük numaralı pompalardan başlayarak atanır. */
  attendants: number;
  /** Trafiğin sağdan mı soldan mı aktığı; istasyon kapılarının rolünü de belirler. */
  trafficSide: TrafficSide;
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
    marketBuilt: false,
    fuelStock: createInitialFuelStock(),
    fuelPrices: createInitialFuelPrices(),
    pendingFuelRestocks: {},
    marketPrices: createInitialMarketPrices(),
    marketSales: 0,
    management: createInitialManagementState(),
    attendants: 0,
    trafficSide: DEFAULT_TRAFFIC_SIDE,
    lastSeenUnixSeconds: nowUnixSeconds(),
  };
}
