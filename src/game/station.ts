import type { FuelType } from './fuel';
import { randomAmount, randomFuel } from './fuel';
import { loadGame, saveGame } from './save';
import { SLOTS, findSlot } from './slots';
import type { PlayerData } from './state';
import { createNewGame, nowUnixSeconds } from './state';

/** Araba giriş yolunu kat ederken geçen süre. */
const ARRIVE_SECONDS = 2.4;
/** Araba çıkarken geçen süre. */
const LEAVE_SECONDS = 2.2;
/** Yakıt doldurma süresi. */
const FILL_SECONDS = 2.6;
/** Müşterinin bekleyebileceği süre. Bitince kızıp gider. */
const PATIENCE_SECONDS = 24;
/** İki araba arasındaki süre. Boş pompa yoksa araba gelmez. */
const SPAWN_INTERVAL_SECONDS = 5.5;

/** Gece vardiyası: kapalıyken pompa başına saniyelik kazanç. */
const OFFLINE_PER_PUMP_PER_SECOND = 2;
const MAX_OFFLINE_HOURS = 4;
const OFFLINE_REPORT_THRESHOLD_SECONDS = 60;

const AUTOSAVE_SECONDS = 15;

const CAR_COLORS = [0xd94f4f, 0x3d76c9, 0xe8e6e1, 0x2f2f33, 0x4fae6d, 0xe0a53a, 0x8a5fc4];

export type CarPhase = 'arriving' | 'waiting' | 'filling' | 'leaving';

export interface Car {
  readonly id: number;
  readonly slotIndex: number;
  readonly fuel: FuelType;
  readonly amount: number;
  readonly color: number;
  phase: CarPhase;
  /** arriving/leaving evrelerinde 0→1 yol ilerlemesi. */
  progress: number;
  patience: number;
  fillProgress: number;
  /** Yanlış yakıt verildi ya da sabrı taştı. */
  angry: boolean;
}

export type ServeResult = 'ok' | 'wrong' | 'unavailable';

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

  /** Pompa başına en fazla bir araba. Anahtar = pompa indeksi. */
  readonly cars = new Map<number, Car>();

  onServed: ((car: Car) => void) | null = null;
  onMissed: ((car: Car) => void) | null = null;

  private nextCarId = 1;
  private spawnTimer = SPAWN_INTERVAL_SECONDS * 0.4;
  private autosaveTimer = 0;

  constructor() {
    this.data = loadGame() ?? createNewGame();
  }

  get money(): number {
    return this.data.money;
  }

  get unlockedCount(): number {
    return this.data.unlockedSlots.length;
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

  /**
   * Seçilen yakıt ve tutarla arabayı doldurmayı dener.
   * İkisi de siparişe uymazsa müşteri kızıp gider — para yok.
   */
  serve(slotIndex: number, fuel: FuelType, amount: number): ServeResult {
    const car = this.cars.get(slotIndex);
    if (car === undefined || car.phase !== 'waiting') return 'unavailable';

    if (car.fuel !== fuel || car.amount !== amount) {
      this.sendAway(car, true);
      return 'wrong';
    }

    car.phase = 'filling';
    car.fillProgress = 0;
    return 'ok';
  }

  tick(deltaSeconds: number): void {
    this.updateSpawning(deltaSeconds);

    for (const car of [...this.cars.values()]) {
      this.updateCar(car, deltaSeconds);
    }

    this.autosaveTimer += deltaSeconds;
    if (this.autosaveTimer >= AUTOSAVE_SECONDS) {
      this.autosaveTimer = 0;
      this.persist();
    }
  }

  private updateSpawning(deltaSeconds: number): void {
    this.spawnTimer -= deltaSeconds;
    if (this.spawnTimer > 0) return;

    this.spawnTimer = SPAWN_INTERVAL_SECONDS;

    const free = this.data.unlockedSlots.filter((index) => !this.cars.has(index));
    if (free.length === 0) return;

    const slotIndex = free[Math.floor(Math.random() * free.length)];
    if (slotIndex === undefined) return;

    this.cars.set(slotIndex, {
      id: this.nextCarId++,
      slotIndex,
      fuel: randomFuel(),
      amount: randomAmount(),
      color: CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)] ?? 0xd94f4f,
      phase: 'arriving',
      progress: 0,
      patience: PATIENCE_SECONDS,
      fillProgress: 0,
      angry: false,
    });
  }

  private updateCar(car: Car, deltaSeconds: number): void {
    switch (car.phase) {
      case 'arriving':
        car.progress += deltaSeconds / ARRIVE_SECONDS;
        if (car.progress >= 1) {
          car.progress = 1;
          car.phase = 'waiting';
        }
        return;

      case 'waiting':
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
          this.onServed?.(car);
          this.sendAway(car, false);
        }
        return;

      case 'leaving':
        car.progress += deltaSeconds / LEAVE_SECONDS;
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
    const earnings = capped * OFFLINE_PER_PUMP_PER_SECOND * this.unlockedCount;
    if (!(earnings > 0)) return null;

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
}
