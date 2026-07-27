import type { FuelType } from './fuel';
import {
  FUEL_CAPACITY_LITERS,
  FUEL_PRICE_STEP,
  FUELS,
  RESTOCK_BATCH_LITERS,
  AMOUNT_OPTIONS,
  clampFuelPrice,
  findFuel,
  fuelDemandFactor,
  fuelDemandLabel,
  fuelPriceBounds,
  litersForAmount,
  randomAmount,
  randomFuel,
} from './fuel';
import {
  MARKET_ITEMS,
  clampMarketPrice,
  findMarketItem,
  marketDemandLabel,
  marketPurchaseChance,
  type MarketItemId,
  type MarketSale,
} from './market';
import {
  ManagementSystem,
  type ManagementEvent,
} from './management';
import { loadGame, saveGame } from './save';
import { SLOTS, findSlot } from './slots';
import type { PlayerData } from './state';
import { createNewGame, nowUnixSeconds } from './state';

/** Trafikten istasyondaki pompaya ulaşma süresi. */
const ARRIVE_SECONDS = 2.4;
/** Pompadan tekrar ana yola katılma süresi. */
const LEAVE_SECONDS = 2.2;
/**
 * Oyuncu tutarı basılı tutma konsolunda zaten doldurduğu için burada yalnızca
 * pompa hortumunun kısa bitiriş animasyonu oynar.
 */
const FILL_SECONDS = 1.15;
/** Müşterinin bekleyebileceği süre. Bitince kızıp gider. */
const PATIENCE_SECONDS = 24;
/** Trafikten yeni bir müşterinin ayrılabilmesi için gereken en kısa süre. */
const TRAFFIC_CUSTOMER_COOLDOWN_SECONDS = 5.5;

/** Gece vardiyası: kapalıyken pompa başına saniyelik kazanç. */
const OFFLINE_PER_PUMP_PER_SECOND = 2;
const MAX_OFFLINE_HOURS = 4;
const OFFLINE_REPORT_THRESHOLD_SECONDS = 60;

const AUTOSAVE_SECONDS = 15;
export const MARKET_BUILD_COST = 15_000;

export type CarPhase = 'arriving' | 'waiting' | 'filling' | 'leaving';

export interface Car {
  readonly id: number;
  readonly slotIndex: number;
  readonly fuel: FuelType;
  readonly amount: number;
  /** Araç giriş yaptığı anda geçerli olan litre fiyatı. */
  readonly unitPrice: number;
  readonly color: number;
  phase: CarPhase;
  /** arriving/leaving evrelerinde 0→1 yol ilerlemesi. */
  progress: number;
  patience: number;
  fillProgress: number;
  /** Yanlış yakıt verildi ya da sabrı taştı. */
  angry: boolean;
  /** Yolda yakıtı bitip çekiciyle getirilen müşteri. */
  readonly rescued: boolean;
  /** Çekici üzerindeyken normal istasyon rotası bu aracı ilerletmez. */
  deliveryPending: boolean;
  /** Pompadan gerçekten çıkan yakıt; sipariş tutarından fazlası işletme zararıdır. */
  dispensedLiters: number;
  /** Müşterinin ödemediği, fazla verilmiş yakıt miktarı. */
  wastedLiters: number;
}

export type ServeResult =
  | 'ok'
  | 'wrong'
  | 'out-of-stock'
  | 'restocking'
  | 'unavailable';
export type RestockResult = 'ok' | 'full' | 'money' | 'pending' | 'busy';
export type BuildMarketResult = 'ok' | 'built' | 'money';

export interface RestockQuote {
  readonly liters: number;
  readonly cost: number;
}

export interface OfflineReport {
  earnings: number;
  elapsedSeconds: number;
}

/**
 * İstasyonun tüm durumu ve kuralları. Three.js'ten tamamen bağımsız —
 * görsel katman değişse bile bu dosya aynı kalır.
 */
export class Station {
  readonly data: PlayerData;
  readonly management: ManagementSystem;

  /** Pompa başına en fazla bir araba. Anahtar = pompa indeksi. */
  readonly cars = new Map<number, Car>();

  onServed: ((car: Car) => void) | null = null;
  onMissed: ((car: Car) => void) | null = null;
  onArrived: ((car: Car) => void) | null = null;
  onMarketSale: ((car: Car, sale: MarketSale) => void) | null = null;
  onManagementEvent: ((event: ManagementEvent) => void) | null = null;
  /**
   * Görsel dünya, bir sonraki rota konumunun trafik açısından güvenli olup
   * olmadığını ilerleme yazılmadan önce söyler.
   */
  canAdvanceCar:
    | ((car: Car, nextProgress: number, cars: ReadonlyMap<number, Car>) => boolean)
    | null = null;

  private nextCarId = 1;
  private trafficCustomerCooldown = TRAFFIC_CUSTOMER_COOLDOWN_SECONDS * 0.3;
  private autosaveTimer = 0;

  constructor() {
    this.data = loadGame() ?? createNewGame();
    this.management = new ManagementSystem(this.data);
    this.management.onEvent = (event) => this.onManagementEvent?.(event);
    this.management.onChanged = () => this.persist();
  }

  get money(): number {
    return this.data.money;
  }

  get unlockedCount(): number {
    return this.data.unlockedSlots.length;
  }

  get marketBuilt(): boolean {
    return this.data.marketBuilt;
  }

  isUnlocked(slotIndex: number): boolean {
    return this.data.unlockedSlots.includes(slotIndex);
  }

  carAt(slotIndex: number): Car | undefined {
    return this.cars.get(slotIndex);
  }

  unlockCostOf(slotIndex: number): number {
    return findSlot(slotIndex)?.unlockCost ?? Number.POSITIVE_INFINITY;
  }

  canAfford(cost: number): boolean {
    return this.data.money >= cost;
  }

  fuelStockOf(fuel: FuelType): number {
    return this.data.fuelStock[fuel];
  }

  fuelRatio(fuel: FuelType): number {
    return Math.max(0, Math.min(1, this.fuelStockOf(fuel) / FUEL_CAPACITY_LITERS));
  }

  fuelPriceOf(fuel: FuelType): number {
    return this.data.fuelPrices[fuel];
  }

  isFuelRestocking(fuel: FuelType): boolean {
    return (this.data.pendingFuelRestocks[fuel] ?? 0) > 0;
  }

  get pendingRestockFuels(): readonly FuelType[] {
    return FUELS
      .map((fuel) => fuel.id)
      .filter((fuel) => this.isFuelRestocking(fuel));
  }

  setFuelPrice(fuel: FuelType, price: number): number {
    const next = clampFuelPrice(fuel, price);
    this.data.fuelPrices[fuel] = next;
    this.persist();
    return next;
  }

  fuelPriceRange(fuel: FuelType): { min: number; max: number; step: number } {
    return { ...fuelPriceBounds(fuel), step: FUEL_PRICE_STEP };
  }

  fuelDemandLabel(fuel: FuelType): string {
    return fuelDemandLabel(fuel, this.fuelPriceOf(fuel));
  }

  marketPriceOf(item: MarketItemId): number {
    return this.data.marketPrices[item];
  }

  setMarketPrice(item: MarketItemId, price: number): number {
    const next = clampMarketPrice(item, price);
    this.data.marketPrices[item] = next;
    this.persist();
    return next;
  }

  marketDemandLabel(item: MarketItemId): string {
    return marketDemandLabel(item, this.marketPriceOf(item));
  }

  canFuel(fuel: FuelType, amount: number, unitPrice = this.fuelPriceOf(fuel)): boolean {
    return (
      !this.isFuelRestocking(fuel) &&
      this.fuelStockOf(fuel) >= litersForAmount(fuel, amount, unitPrice)
    );
  }

  restockQuote(fuel: FuelType): RestockQuote {
    const liters = Math.min(
      RESTOCK_BATCH_LITERS,
      Math.max(0, FUEL_CAPACITY_LITERS - this.fuelStockOf(fuel)),
    );
    return {
      liters,
      cost: Math.ceil(
        liters *
        findFuel(fuel).wholesalePerLiter *
        this.management.wholesaleMultiplier,
      ),
    };
  }

  tryRestock(fuel: FuelType): RestockResult {
    if (this.isFuelRestocking(fuel)) return 'pending';
    if (this.pendingRestockFuels.length > 0) return 'busy';
    const quote = this.restockQuote(fuel);
    if (quote.liters < 0.5) return 'full';
    if (!this.canAfford(quote.cost)) return 'money';

    this.data.money -= quote.cost;
    this.data.pendingFuelRestocks[fuel] = quote.liters;
    this.persist();
    return 'ok';
  }

  /** Tanker hortumu kapandıktan sonra siparişi gerçek yeraltı tankına aktarır. */
  completeRestock(fuel: FuelType): number {
    const liters = this.data.pendingFuelRestocks[fuel] ?? 0;
    if (!(liters > 0)) return 0;
    delete this.data.pendingFuelRestocks[fuel];
    this.data.fuelStock[fuel] = Math.min(
      FUEL_CAPACITY_LITERS,
      this.data.fuelStock[fuel] + liters,
    );
    this.management.recordRestock(liters);
    this.persist();
    return liters;
  }

  tryUnlockSlot(slotIndex: number): boolean {
    if (this.isUnlocked(slotIndex)) return false;

    const slot = findSlot(slotIndex);
    if (slot === undefined) return false;
    if (this.data.money < slot.unlockCost) return false;

    this.data.money -= slot.unlockCost;
    this.data.unlockedSlots.push(slotIndex);
    this.data.unlockedSlots.sort((a, b) => a - b);
    this.persist();

    return true;
  }

  tryBuildMarket(): BuildMarketResult {
    if (this.data.marketBuilt) return 'built';
    if (!this.canAfford(MARKET_BUILD_COST)) return 'money';

    this.data.money -= MARKET_BUILD_COST;
    this.data.marketBuilt = true;
    this.persist();
    return 'ok';
  }

  /**
   * Seçilen yakıt ve pompadan gerçekten geçen tutarla arabayı doldurmayı dener.
   * Fazla dolumda müşteri yalnızca siparişini öder; fazla litre stoktan düşer
   * ve işletme zararı olarak car.wastedLiters içinde kalır.
   */
  serve(slotIndex: number, fuel: FuelType, dispensedAmount: number): ServeResult {
    const car = this.cars.get(slotIndex);
    if (car === undefined || car.phase !== 'waiting') return 'unavailable';

    if (car.fuel !== fuel || dispensedAmount < car.amount) {
      this.sendAway(car, true);
      return 'wrong';
    }
    if (this.isFuelRestocking(car.fuel)) return 'restocking';
    const chargedLiters = litersForAmount(car.fuel, car.amount, car.unitPrice);
    const liters = litersForAmount(
      car.fuel,
      Math.max(car.amount, Math.round(dispensedAmount)),
      car.unitPrice,
    );
    if (this.data.fuelStock[car.fuel] < liters) return 'out-of-stock';

    this.data.fuelStock[car.fuel] = Math.max(0, this.data.fuelStock[car.fuel] - liters);
    car.dispensedLiters = liters;
    car.wastedLiters = Math.max(0, liters - chargedLiters);
    car.phase = 'filling';
    car.fillProgress = 0;
    return 'ok';
  }

  tick(deltaSeconds: number, activeServiceSlot: number | null = null): void {
    this.management.tick(deltaSeconds);
    this.trafficCustomerCooldown = Math.max(0, this.trafficCustomerCooldown - deltaSeconds);

    for (const car of [...this.cars.values()]) {
      this.updateCar(car, deltaSeconds, activeServiceSlot);
    }

    this.autosaveTimer += deltaSeconds;
    if (this.autosaveTimer >= AUTOSAVE_SECONDS) {
      this.autosaveTimer = 0;
      this.persist();
    }
  }

  /**
   * Ana yoldan ayrılmak isteyen bir NPC'yi oyun müşterisine çevirir.
   * Görsel katman bu çağrıdan sonra aynı araç mesh'ini pompaya taşır; yeni
   * bir araç yaratılmaz.
   */
  acceptTrafficCar(color: number): Car | null {
    return this.acceptCustomer(color, false);
  }

  /** Çekici teslimatı boş pompa varsa normal müşteri bekleme süresini atlayabilir. */
  acceptFuelRescueCar(color: number): Car | null {
    return this.acceptCustomer(color, true);
  }

  private acceptCustomer(color: number, rescued: boolean): Car | null {
    if (!rescued && this.trafficCustomerCooldown > 0) return null;

    const free = this.data.unlockedSlots.filter((index) => !this.cars.has(index));
    if (free.length === 0) return null;

    const slotIndex = free[Math.floor(Math.random() * free.length)];
    if (slotIndex === undefined) return null;

    const fuel = randomFuel();
    const unitPrice = this.fuelPriceOf(fuel);
    const demand =
      fuelDemandFactor(fuel, unitPrice) *
      this.management.customerDemandMultiplier;
    if (!rescued && Math.random() > Math.min(1, demand)) {
      // Fiyatı pahalı bulan sürücü yoldan devam eder; hemen arkasındaki her
      // araç için aynı karede tekrar denemeyi de engeller.
      this.trafficCustomerCooldown = 1.2 + Math.random() * 1.4;
      return null;
    }

    const basePrice = findFuel(fuel).pricePerLiter;
    const priceRatio = unitPrice / basePrice;
    const patienceFactor = rescued
      ? 1.18
      : Math.max(0.76, Math.min(1.16, 1.08 - (priceRatio - 1) * 0.62));

    const car: Car = {
      id: this.nextCarId++,
      slotIndex,
      fuel,
      amount: rescued
        ? AMOUNT_OPTIONS[Math.floor(Math.random() * 3)] ?? 50
        : randomAmount(),
      unitPrice,
      color,
      phase: 'arriving',
      progress: 0,
      patience: PATIENCE_SECONDS * patienceFactor,
      fillProgress: 0,
      angry: false,
      rescued,
      deliveryPending: rescued,
      dispensedLiters: 0,
      wastedLiters: 0,
    };

    this.cars.set(slotIndex, car);
    this.trafficCustomerCooldown =
      TRAFFIC_CUSTOMER_COOLDOWN_SECONDS / Math.max(0.72, demand);
    return car;
  }

  private updateCar(
    car: Car,
    deltaSeconds: number,
    activeServiceSlot: number | null,
  ): void {
    switch (car.phase) {
      case 'arriving':
        if (car.deliveryPending) return;
        {
          const nextProgress = Math.min(1, car.progress + deltaSeconds / ARRIVE_SECONDS);
          if (this.canAdvanceCar?.(car, nextProgress, this.cars) === false) return;
          car.progress = nextProgress;
        }
        if (car.progress >= 1) {
          car.progress = 1;
          car.phase = 'waiting';
          this.onArrived?.(car);
        }
        return;

      case 'waiting':
        // Oyuncu nozulun başındayken müşteri sabırsızlanıp dolumun ortasında kaçmaz.
        if (car.slotIndex === activeServiceSlot) return;
        car.patience -= deltaSeconds;
        if (car.patience <= 0) this.sendAway(car, true);
        return;

      case 'filling':
        car.fillProgress += deltaSeconds / FILL_SECONDS;
        if (car.fillProgress >= 1) {
          car.fillProgress = 1;
          this.data.money += car.amount;
          this.data.totalEarned += car.amount;
          this.data.servedCars += 1;
          this.management.recordFuelSale(car.dispensedLiters);
          this.onServed?.(car);
          this.tryMarketSale(car);
          this.sendAway(car, false);
        }
        return;

      case 'leaving':
        {
          const nextProgress = Math.min(1, car.progress + deltaSeconds / LEAVE_SECONDS);
          if (this.canAdvanceCar?.(car, nextProgress, this.cars) === false) return;
          car.progress = nextProgress;
        }
        if (car.progress >= 1) this.cars.delete(car.slotIndex);
        return;
    }
  }

  private sendAway(car: Car, angry: boolean): void {
    if (angry) {
      car.angry = true;
      this.data.missedCars += 1;
      this.onMissed?.(car);
    }

    car.phase = 'leaving';
    car.progress = 0;
  }

  /** Müşterinin sabrının ne kadarı kaldı (0..1) — kafasındaki çubuk için. */
  patienceRatio(car: Car): number {
    return Math.max(0, Math.min(1, car.patience / PATIENCE_SECONDS));
  }

  /** Çekici aracı doğrudan ayrılmış pompa cebine indirdiğinde beklemeyi başlatır. */
  completeRescueDelivery(car: Car): boolean {
    const live = this.cars.get(car.slotIndex);
    if (live !== car || !car.rescued || car.phase !== 'arriving') return false;
    car.deliveryPending = false;
    car.progress = 1;
    car.phase = 'waiting';
    this.onArrived?.(car);
    return true;
  }

  private tryMarketSale(car: Car): void {
    if (!this.data.marketBuilt || this.management.isOnStrike) return;
    const item = MARKET_ITEMS[Math.floor(Math.random() * MARKET_ITEMS.length)];
    if (item === undefined) return;
    const price = this.marketPriceOf(item.id);
    if (Math.random() > marketPurchaseChance(item.id, price)) return;

    this.data.money += price;
    this.data.totalEarned += price;
    this.data.marketSales += 1;
    this.onMarketSale?.(car, { item: findMarketItem(item.id), price });
  }

  // ---------- Gece vardiyası ----------

  /**
   * Oyun kapalıyken geçen süreyi kazanca çevirir. İstasyon aktif oynanan bir
   * oyun; buradaki kazanç bilerek düşük tutuldu, dönüşü ödüllendirmek için var.
   */
  resume(): OfflineReport | null {
    const now = nowUnixSeconds();
    const elapsed = now - this.data.lastSeenUnixSeconds;
    this.data.lastSeenUnixSeconds = now;

    // Cihaz saati geri alınmışsa kazanç verme (basit istismar koruması).
    if (elapsed <= 0) return null;

    const capped = Math.min(elapsed, MAX_OFFLINE_HOURS * 3600);
    const averageDemand =
      FUELS.reduce(
        (total, fuel) =>
          total + fuelDemandFactor(fuel.id, this.fuelPriceOf(fuel.id)),
        0,
      ) / FUELS.length;
    const averageBasePrice =
      FUELS.reduce((total, fuel) => total + fuel.pricePerLiter, 0) / FUELS.length;
    const averagePrice =
      FUELS.reduce((total, fuel) => total + this.fuelPriceOf(fuel.id), 0) / FUELS.length;
    const theoreticalEarnings =
      capped *
      OFFLINE_PER_PUMP_PER_SECOND *
      this.unlockedCount *
      averageDemand *
      this.management.offlineMultiplier *
      (averagePrice / averageBasePrice);
    const requiredLiters = theoreticalEarnings / averagePrice;
    const availableLiters = FUELS.reduce(
      (total, fuel) =>
        total +
        (this.isFuelRestocking(fuel.id) ? 0 : this.data.fuelStock[fuel.id]),
      0,
    );
    const consumedLiters = Math.min(requiredLiters, availableLiters);
    const earnings = requiredLiters > 0
      ? theoreticalEarnings * (consumedLiters / requiredLiters)
      : 0;
    if (!(earnings > 0)) return null;

    this.consumeMixedFuel(consumedLiters);
    this.data.money += earnings;
    this.data.totalEarned += earnings;

    if (elapsed < OFFLINE_REPORT_THRESHOLD_SECONDS) return null;
    return { earnings, elapsedSeconds: elapsed };
  }

  suspend(): void {
    this.persist();
  }

  persist(): void {
    this.data.lastSeenUnixSeconds = nowUnixSeconds();
    saveGame(this.data);
  }

  addMoney(amount: number): void {
    if (!(amount > 0)) return;
    this.data.money += amount;
    this.data.totalEarned += amount;
  }

  get slots(): readonly typeof SLOTS[number][] {
    return SLOTS;
  }

  /** Offline vardiyada satışların üç tanktan dengeli geldiğini varsayar. */
  private consumeMixedFuel(liters: number): void {
    let remaining = liters;

    while (remaining > 0.001) {
      const available = FUELS.filter(
        (fuel) =>
          !this.isFuelRestocking(fuel.id) &&
          this.data.fuelStock[fuel.id] > 0.001,
      );
      if (available.length === 0) return;

      const share = remaining / available.length;
      let consumedThisPass = 0;
      for (const fuel of available) {
        const consumed = Math.min(share, this.data.fuelStock[fuel.id]);
        this.data.fuelStock[fuel.id] -= consumed;
        remaining -= consumed;
        consumedThisPass += consumed;
      }
      if (consumedThisPass <= 0.001) return;
    }
  }
}
