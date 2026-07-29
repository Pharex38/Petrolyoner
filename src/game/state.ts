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
import { DAY_START_PHASE, type DayOpening } from './clock';
import { DEFAULT_TRAFFIC_SIDE, type TrafficSide } from './traffic';

export const SAVE_VERSION = 11;
export const STATION_NAME_MAX_LENGTH = 28;

export interface PlayerData {
  saveVersion: number;
  money: number;
  /** Oyuncunun ilk açılışta verdiği, arayüzde görünen istasyon adı. */
  stationName: string;
  /** Kasa kilidini açan acil ikmalin, sonraki yakıt satışlarından tahsil edilecek borcu. */
  emergencyFuelCreditDebt: number;
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
  /** Kaçıncı gün oynanıyor; 1'den başlar, gece yarısı artar. */
  day: number;
  /** Günün neresindeyiz: 0 = 00:00, 0.5 = 12:00. */
  dayPhase: number;
  /** Gün başındaki sayaçlar; kapanış özeti bunlarla fark alınarak çıkar. */
  dayOpening: DayOpening;
}

export function nowUnixSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

/** Boşlukları sadeleştirip hem kayıt hem arayüz için güvenli adı döndürür. */
export function normalizeStationName(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\s+/g, ' ').slice(0, STATION_NAME_MAX_LENGTH);
}

export function createNewGame(): PlayerData {
  return {
    saveVersion: SAVE_VERSION,
    money: 0,
    stationName: '',
    emergencyFuelCreditDebt: 0,
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
    day: 1,
    dayPhase: DAY_START_PHASE,
    dayOpening: {
      money: 0,
      totalEarned: 0,
      servedCars: 0,
      missedCars: 0,
      marketSales: 0,
    },
  };
}
