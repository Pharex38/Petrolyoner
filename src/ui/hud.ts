import type { FuelInfo, FuelType } from '../game/fuel';
import { AMOUNT_OPTIONS, FUELS, findFuel } from '../game/fuel';
import { formatDuration, formatMoney } from '../game/format';
import type { Car, OfflineReport, Station } from '../game/station';
import { findSlot } from '../game/slots';
import type { World } from '../scene/world';

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (element === null) throw new Error(`Arayüz elemanı bulunamadı: #${id}`);
  return element as T;
}

/** Sabrın bu oranın altına düşmesi etiketi kırmızıya çevirir. */
const URGENT_RATIO = 0.35;

/**
 * DOM tabanlı arayüz. Three.js sahnesinin üstünde duruyor.
 *
 * Metinler her karede yeniden yazılmasın diye son değer saklanıyor —
 * textContent'e her frame yazmak mobilde gereksiz layout maliyeti çıkarıyor.
 */
export class Hud {
  onServe: ((slotIndex: number, fuel: FuelType, amount: number) => void) | null = null;
  onUnlock: ((slotIndex: number) => void) | null = null;

  private readonly station: Station;

  private readonly moneyLabel = requireElement('money');
  private readonly statsLabel = requireElement('stats');
  private readonly floaterLayer = requireElement('floaters');
  private readonly carLabelLayer = requireElement('car-labels');

  private readonly serveSheet = requireElement('serve-sheet');
  private readonly orderLabel = requireElement('order');
  private readonly fuelChips = requireElement('fuel-chips');
  private readonly amountChips = requireElement('amount-chips');
  private readonly serveConfirm = requireElement<HTMLButtonElement>('serve-confirm');

  private readonly unlockSheet = requireElement('unlock-sheet');
  private readonly unlockTitle = requireElement('unlock-title');
  private readonly unlockText = requireElement('unlock-text');
  private readonly unlockConfirm = requireElement<HTMLButtonElement>('unlock-confirm');

  private readonly offlinePanel = requireElement('offline');
  private readonly offlineText = requireElement('offline-text');

  private readonly carLabels = new Map<number, HTMLElement>();
  private readonly lastText = new Map<HTMLElement, string>();

  private openSlot: number | null = null;
  private selectedFuel: FuelType | null = null;
  private selectedAmount: number | null = null;

  constructor(station: Station) {
    this.station = station;

    this.buildFuelChips();
    this.buildAmountChips();

    this.serveConfirm.addEventListener('click', () => {
      if (this.openSlot === null) return;
      if (this.selectedFuel === null || this.selectedAmount === null) return;

      this.onServe?.(this.openSlot, this.selectedFuel, this.selectedAmount);
      this.closeSheets();
    });

    requireElement('serve-cancel').addEventListener('click', () => {
      this.closeSheets();
    });

    this.unlockConfirm.addEventListener('click', () => {
      if (this.openSlot === null) return;

      this.onUnlock?.(this.openSlot);
      this.closeSheets();
    });

    requireElement('unlock-cancel').addEventListener('click', () => {
      this.closeSheets();
    });

    requireElement('offline-continue').addEventListener('click', () => {
      this.offlinePanel.hidden = true;
    });
  }

  // ---------- Paneller ----------

  openServeSheet(car: Car): void {
    this.closeSheets();

    this.openSlot = car.slotIndex;
    this.selectedFuel = null;
    this.selectedAmount = null;

    const fuel = findFuel(car.fuel);
    this.orderLabel.innerHTML =
      `<span class="fuel-dot" style="background:${fuel.cssColor}"></span>` +
      `${formatMoney(car.amount)} ${fuel.label}`;

    this.refreshChipStates();
    this.serveSheet.hidden = false;
  }

  openUnlockSheet(slotIndex: number): void {
    this.closeSheets();

    const slot = findSlot(slotIndex);
    if (slot === undefined) return;

    this.openSlot = slotIndex;

    const cost = slot.unlockCost;
    const affordable = this.station.canAfford(cost);

    this.unlockTitle.textContent = `${slotIndex + 1}. Pompa`;
    this.unlockText.textContent = affordable
      ? `Bu pompayı açarsan aynı anda bir araca daha bakabilirsin.`
      : `Açmak için ${formatMoney(cost)} gerekiyor. Şu an paran yetmiyor.`;

    this.unlockConfirm.textContent = `Aç   ${formatMoney(cost)}`;
    this.unlockConfirm.disabled = !affordable;
    this.unlockSheet.hidden = false;
  }

  closeSheets(): void {
    this.serveSheet.hidden = true;
    this.unlockSheet.hidden = true;
    this.openSlot = null;
  }

  /** Panelde açık olan pompa — araba giderse kapatmak için gerekiyor. */
  get openSlotIndex(): number | null {
    return this.openSlot;
  }

  get isServeSheetOpen(): boolean {
    return !this.serveSheet.hidden;
  }

  // ---------- Her kare ----------

  update(): void {
    const data = this.station.data;

    this.setText(this.moneyLabel, formatMoney(data.money));
    this.setText(
      this.statsLabel,
      `${data.servedCars} araç dolduruldu · ${data.missedCars} kaçtı · ` +
        `${this.station.unlockedCount}/6 pompa`,
    );
  }

  /** Arabaların üstündeki sipariş etiketlerini konumlandırır. */
  syncCarLabels(world: World): void {
    const alive = new Set<number>();

    for (const car of this.station.cars.values()) {
      // Gelen ve giden arabanın siparişini göstermeye gerek yok.
      if (car.phase !== 'waiting' && car.phase !== 'filling') continue;

      const screen = world.carScreenPosition(car);
      if (screen === null) continue;

      alive.add(car.id);

      let label = this.carLabels.get(car.id);
      if (label === undefined) {
        label = this.createCarLabel(car);
        this.carLabels.set(car.id, label);
        this.carLabelLayer.appendChild(label);
      }

      label.style.left = `${screen.x}px`;
      label.style.top = `${screen.y}px`;

      const bar = label.querySelector('i');
      if (car.phase === 'filling') {
        label.classList.add('filling');
        label.classList.remove('urgent');
        if (bar !== null) bar.style.width = `${car.fillProgress * 100}%`;
      } else {
        const ratio = this.station.patienceRatio(car);
        label.classList.toggle('urgent', ratio < URGENT_RATIO);
        if (bar !== null) bar.style.width = `${ratio * 100}%`;
      }
    }

    for (const [id, label] of [...this.carLabels]) {
      if (alive.has(id)) continue;

      label.remove();
      this.carLabels.delete(id);
    }
  }

  private createCarLabel(car: Car): HTMLElement {
    const fuel: FuelInfo = findFuel(car.fuel);

    const label = document.createElement('div');
    label.className = 'car-label';
    label.innerHTML =
      `<span class="fuel-dot" style="background:${fuel.cssColor}"></span>` +
      `${formatMoney(car.amount)} ${fuel.label}` +
      `<span class="patience"><i></i></span>`;

    return label;
  }

  // ---------- Çipler ----------

  private buildFuelChips(): void {
    for (const fuel of FUELS) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip';
      chip.dataset.fuel = fuel.id;
      chip.setAttribute('aria-pressed', 'false');
      chip.innerHTML =
        `<span class="fuel-dot" style="background:${fuel.cssColor}"></span>${fuel.label}`;

      chip.addEventListener('click', () => {
        this.selectedFuel = fuel.id;
        this.refreshChipStates();
      });

      this.fuelChips.appendChild(chip);
    }
  }

  private buildAmountChips(): void {
    for (const amount of AMOUNT_OPTIONS) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip';
      chip.dataset.amount = String(amount);
      chip.setAttribute('aria-pressed', 'false');
      chip.textContent = formatMoney(amount);

      chip.addEventListener('click', () => {
        this.selectedAmount = amount;
        this.refreshChipStates();
      });

      this.amountChips.appendChild(chip);
    }
  }

  private refreshChipStates(): void {
    for (const chip of this.fuelChips.children) {
      const isSelected = (chip as HTMLElement).dataset.fuel === this.selectedFuel;
      chip.setAttribute('aria-pressed', String(isSelected));
    }

    for (const chip of this.amountChips.children) {
      const value = Number((chip as HTMLElement).dataset.amount);
      chip.setAttribute('aria-pressed', String(value === this.selectedAmount));
    }

    this.serveConfirm.disabled = this.selectedFuel === null || this.selectedAmount === null;
  }

  // ---------- Diğer ----------

  showOffline(report: OfflineReport): void {
    this.offlineText.innerHTML =
      `İstasyon ${formatDuration(report.elapsedSeconds)} boyunca gece vardiyasında çalıştı ve ` +
      `<strong>${formatMoney(report.earnings)}</strong> kazandı.`;

    this.offlinePanel.hidden = false;
  }

  spawnFloater(text: string, x: number, y: number, bad = false): void {
    const element = document.createElement('div');
    element.className = bad ? 'floater bad' : 'floater';
    element.textContent = text;
    element.style.left = `${x}px`;
    element.style.top = `${y}px`;

    element.addEventListener('animationend', () => {
      element.remove();
    });

    this.floaterLayer.appendChild(element);
  }

  private setText(element: HTMLElement, value: string): void {
    if (this.lastText.get(element) === value) return;

    this.lastText.set(element, value);
    element.textContent = value;
  }
}
