import { loadGame, saveGame } from './save';
import type { PlayerData, WellSave } from './state';
import { createNewGame, nowUnixSeconds } from './state';
import type { WellDefinition } from './wells';
import { BARREL_PRICE, WELLS, findWell, production, upgradeCost } from './wells';

/** Offline kazancın hesaplanacağı en uzun süre. */
const MAX_OFFLINE_HOURS = 4;

/** Offline kazanç aktif gelirin bu oranı kadar olur — aktif oynamayı ödüllendirir. */
const OFFLINE_EFFICIENCY = 0.5;

const AUTOSAVE_SECONDS = 15;

/** Bu süreden kısa aralar için offline ekranı gösterilmez, sessizce eklenir. */
const OFFLINE_REPORT_THRESHOLD_SECONDS = 60;

export interface OfflineReport {
  earnings: number;
  elapsedSeconds: number;
}

/**
 * Oyunun tüm durumu ve kuralları. Three.js'ten tamamen bağımsız —
 * görsel katman değişse bile bu dosya aynı kalır.
 */
export class GameEngine {
  readonly data: PlayerData;

  private autosaveTimer = 0;

  constructor() {
    this.data = loadGame() ?? createNewGame();
  }

  get money(): number {
    return this.data.money;
  }

  /** Tüm kuyuların toplam saniyelik geliri (prestij çarpanı dahil). */
  incomePerSecond(): number {
    let barrels = 0;

    for (const save of this.data.wells) {
      const definition = findWell(save.wellId);
      if (definition === undefined) continue;
      barrels += production(definition, save.level);
    }

    return barrels * BARREL_PRICE * this.data.prestigeMultiplier;
  }

  /** Tek bir kuyunun saniyelik geliri. Dokunma ödülü ve arayüz için. */
  wellIncomePerSecond(wellId: string): number {
    const definition = findWell(wellId);
    if (definition === undefined) return 0;

    return production(definition, this.levelOf(wellId)) * BARREL_PRICE * this.data.prestigeMultiplier;
  }

  levelOf(wellId: string): number {
    return this.findSave(wellId)?.level ?? 0;
  }

  upgradeCostOf(wellId: string): number {
    const definition = findWell(wellId);
    if (definition === undefined) return Number.POSITIVE_INFINITY;

    return upgradeCost(definition, this.levelOf(wellId));
  }

  canAfford(cost: number): boolean {
    return this.data.money >= cost;
  }

  /** Parası yetiyorsa kuyuyu bir seviye yükseltir. */
  tryUpgrade(wellId: string): boolean {
    const definition = findWell(wellId);
    if (definition === undefined) return false;

    let save = this.findSave(wellId);
    if (save === undefined) {
      save = { wellId, level: 0 };
      this.data.wells.push(save);
    }

    const cost = upgradeCost(definition, save.level);
    if (this.data.money < cost) return false;

    this.data.money -= cost;
    save.level += 1;
    return true;
  }

  /** Dokunma ödülü, reklam ödülü gibi kesikli para eklemeleri için. */
  addMoney(amount: number): void {
    if (!(amount > 0)) return;

    this.data.money += amount;
    this.data.totalEarned += amount;
  }

  /** Her karede çağrılır. dt saniye cinsinden. */
  tick(deltaSeconds: number): void {
    const income = this.incomePerSecond();

    if (income > 0) {
      const earned = income * deltaSeconds;
      this.data.money += earned;
      this.data.totalEarned += earned;
    }

    this.autosaveTimer += deltaSeconds;
    if (this.autosaveTimer >= AUTOSAVE_SECONDS) {
      this.autosaveTimer = 0;
      this.persist();
    }
  }

  /**
   * Oyun kapalıyken / sekme arkadayken geçen süreyi kazanca çevirir.
   * Açılışta ve sekme geri öne geldiğinde çağrılır.
   *
   * Rapor edilecek kadar uzun bir ara değilse null döner ama para yine eklenir.
   */
  resume(): OfflineReport | null {
    const now = nowUnixSeconds();
    const elapsed = now - this.data.lastSeenUnixSeconds;
    this.data.lastSeenUnixSeconds = now;

    // Cihaz saati geri alınmışsa kazanç verme (basit istismar koruması).
    if (elapsed <= 0) return null;

    const capped = Math.min(elapsed, MAX_OFFLINE_HOURS * 3600);
    const earnings = this.incomePerSecond() * capped * OFFLINE_EFFICIENCY;
    if (!(earnings > 0)) return null;

    this.addMoney(earnings);

    if (elapsed < OFFLINE_REPORT_THRESHOLD_SECONDS) return null;
    return { earnings, elapsedSeconds: elapsed };
  }

  /** Sekme arkaya alınırken / kapanırken. */
  suspend(): void {
    this.persist();
  }

  persist(): void {
    this.data.lastSeenUnixSeconds = nowUnixSeconds();
    saveGame(this.data);
  }

  /** Arayüzün kuyuları sırayla listelemesi için. */
  get wells(): readonly WellDefinition[] {
    return WELLS;
  }

  private findSave(wellId: string): WellSave | undefined {
    return this.data.wells.find((well) => well.wellId === wellId);
  }
}
