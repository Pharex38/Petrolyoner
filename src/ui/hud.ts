import type { DemandLevel, FuelInfo, FuelType } from '../game/fuel';
import { AMOUNT_OPTIONS, FUELS, findFuel } from '../game/fuel';
import { formatDuration, formatMoney } from '../game/format';
import type { ManagementEvent } from '../game/management';
import { MARKET_ITEMS } from '../game/market';
import {
  MARKET_BUILD_COST,
  type BuildMarketResult,
  type Car,
  type DemandTrend,
  type OfflineReport,
  type RestockResult,
  type Station,
} from '../game/station';
import { findSlot } from '../game/slots';
import { isTrafficSide, type TrafficSide } from '../game/traffic';
import type { World } from '../scene/world';
import { ManagementPanel } from './management-panel';

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (element === null) throw new Error(`Arayüz elemanı bulunamadı: #${id}`);
  return element as T;
}

/** Sabrın bu oranın altına düşmesi etiketi kırmızıya çevirir. */
const URGENT_RATIO = 0.35;
/** Basılı tutma mini oyununda sayacın saniyedeki artışı. */
const FILL_RATE_PER_SECOND = 150;
/** En yüksek siparişin de ilerleme çubuğunun sonunda biraz nefesi olsun. */
const FILL_GAUGE_MAX = Math.max(...AMOUNT_OPTIONS) + 45;
/** Parmak bırakma anındaki küçük motor/touch farklarını affeden hedef aralığı. */
const TARGET_TOLERANCE = 22;

/** Tam isabette panel çabuk kapansın, döngü hızlı kalsın. */
const FILL_SUCCESS_FEEDBACK_MS = 620;
/** Fazla dolumda uzun bir cümle var; okunacak kadar kalmalı. */
const FILL_OVERFILL_FEEDBACK_MS = 2200;
/** Hata mesajları da tek bakışta okunabilsin. */
const FILL_ERROR_FEEDBACK_MS = 1150;

/**
 * Üst barın altındaki mutlak konumlu panellerin ofsetleri bu yüksekliğe göre
 * yazılmıştı. Bar bundan uzunsa farkı --hud-stack-shift ile telafi ediyoruz.
 */
const TOPBAR_BASELINE_HEIGHT = 70;
/** Haber kutusu üst bara yapışmasın. */
const TOPBAR_CLEARANCE = 10;

/** Talep çubuğunun sonunu temsil eden katsayı; 1.0 "normal" çentiğine denk gelir. */
const DEMAND_GAUGE_MAX = 1.6;

const DEMAND_ARROWS: Record<DemandTrend, string> = {
  up: '▲',
  down: '▼',
  flat: '•',
};

const DEMAND_TREND_TEXT: Record<DemandTrend, string> = {
  up: 'artıyor',
  down: 'azalıyor',
  flat: 'sabit',
};

/**
 * Üst bar bilerek "Müşteri akışı" diyor: Fiyatlar panelindeki "Talep ..."
 * etiketi yalnızca o yakıtın fiyat cazibesini ölçer, buradaki değer ise
 * protesto/rakip/küresel olay etkileri dahil gerçek müşteri akışıdır.
 * İkisi aynı kelimeyi kullanırsa çelişkili görünürler.
 */
const DEMAND_LEVEL_TEXT: Record<DemandLevel, string> = {
  'cok-yuksek': 'çok yüksek',
  yuksek: 'yüksek',
  normal: 'normal',
  dusuk: 'düşük',
  'cok-dusuk': 'çok düşük',
};

interface CarLabelEntry {
  readonly element: HTMLElement;
  readonly bar: HTMLElement;
}

/**
 * DOM tabanlı arayüz. Three.js sahnesinin üstünde duruyor.
 *
 * Metinler her karede yeniden yazılmasın diye son değer saklanıyor —
 * textContent'e her frame yazmak mobilde gereksiz layout maliyeti çıkarıyor.
 */
export class Hud {
  onServe: ((slotIndex: number, fuel: FuelType, amount: number) => void) | null = null;
  onUnlock: ((slotIndex: number) => void) | null = null;
  onRestock: ((fuel: FuelType) => RestockResult) | null = null;
  onBuildMarket: (() => BuildMarketResult) | null = null;
  onTrafficSide: ((side: TrafficSide) => void) | null = null;

  private readonly station: Station;
  private readonly managementPanel: ManagementPanel;
  private readonly reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  private readonly moneyLabel = requireElement('money');
  private readonly statsLabel = requireElement('stats');
  private readonly trafficSideChips = requireElement('traffic-side-chips');
  private readonly demandRow = requireElement('demand');
  private readonly demandArrow = requireElement('demand-arrow');
  private readonly demandLabel = requireElement('demand-label');
  private readonly demandFill = requireElement('demand-fill');

  private lastDemandLevel: DemandLevel | null = null;
  private lastDemandTrend: DemandTrend | null = null;
  private lastDemandWidth = -1;
  private readonly floaterLayer = requireElement('floaters');
  private readonly carLabelLayer = requireElement('car-labels');
  private readonly stockBars = requireElement('stock-bars');
  private readonly stockMessage = requireElement('stock-message');
  private readonly clockLabel = requireElement('game-clock');
  private readonly dayIcon = requireElement('day-icon');
  private readonly marketBuildButton = requireElement<HTMLButtonElement>('market-build');
  private readonly marketBuildLabel = requireElement('market-build-label');
  private readonly managementAlert = requireElement('management-alert');
  private readonly managementAlertTitle = requireElement('management-alert-title');
  private readonly managementAlertDetail = requireElement('management-alert-detail');

  private readonly serveSheet = requireElement('serve-sheet');
  private readonly orderLabel = requireElement('order');
  private readonly fuelNozzles = requireElement('fuel-nozzles');
  private readonly fillConsole = requireElement('fill-console');
  private readonly fillReadout = requireElement('fill-readout');
  private readonly fillLiquid = requireElement('fill-liquid');
  private readonly fillTarget = requireElement('fill-target');
  private readonly fillHint = requireElement('fill-hint');

  private readonly unlockSheet = requireElement('unlock-sheet');
  private readonly unlockTitle = requireElement('unlock-title');
  private readonly unlockText = requireElement('unlock-text');
  private readonly unlockConfirm = requireElement<HTMLButtonElement>('unlock-confirm');

  private readonly pricingSheet = requireElement('pricing-sheet');
  private readonly pricingNote = requireElement('pricing-note');
  private readonly fuelPriceList = requireElement('fuel-price-list');
  private readonly marketPriceList = requireElement('market-price-list');
  private readonly marketPricingSection = requireElement('market-pricing-section');

  private readonly offlinePanel = requireElement('offline');
  private readonly offlineText = requireElement('offline-text');

  private readonly carLabels = new Map<number, CarLabelEntry>();
  private readonly lastText = new Map<HTMLElement, string>();
  private readonly lastStock = new Map<FuelType, number>();
  private readonly lastRestocking = new Map<FuelType, boolean>();
  private readonly stockRows = new Map<
    FuelType,
    { button: HTMLButtonElement; fill: HTMLElement; value: HTMLElement }
  >();
  private readonly refreshPriceControls: Array<() => void> = [];

  private openSlot: number | null = null;
  private selectedFuel: FuelType | null = null;
  private fillAmount = 0;
  private fillAnimationFrame: number | null = null;
  private fillActive = false;
  private fillLastFrameTime = 0;
  private activeNozzle: HTMLButtonElement | null = null;
  private activePointerId: number | null = null;
  private targetPulsePlayed = false;
  private feedbackTimer: number | null = null;
  private stockFeedbackTimer: number | null = null;
  private managementAlertTimer: number | null = null;

  constructor(station: Station) {
    this.station = station;
    this.managementPanel = new ManagementPanel(station);

    this.trackTopbarHeight();
    this.buildStockBars();
    this.buildFuelNozzles();
    this.buildPriceControls();

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

    requireElement('pricing-close').addEventListener('click', () => {
      this.closeSheets();
    });
    requireElement('price-manage').addEventListener('click', () => {
      this.openPricingSheet();
    });
    requireElement('management-open').addEventListener('click', () => {
      this.openManagementSheet();
    });

    for (const chip of this.trafficSideChips.children) {
      const side = (chip as HTMLElement).dataset.trafficSide;
      if (!isTrafficSide(side)) continue;

      chip.addEventListener('click', () => {
        this.onTrafficSide?.(side);
        this.refreshTrafficSideChips();
      });
    }

    requireElement('offline-continue').addEventListener('click', () => {
      this.offlinePanel.hidden = true;
    });

    this.marketBuildButton.hidden = this.station.marketBuilt;
    this.marketBuildButton.addEventListener('click', () => {
      const result = this.onBuildMarket?.() ?? 'money';
      if (result !== 'ok') return;
      this.marketBuildButton.classList.add('building');
      this.marketBuildLabel.textContent = 'Market kuruluyor';
      navigator.vibrate?.([20, 35, 28]);
      window.setTimeout(() => {
        this.marketBuildButton.hidden = true;
        this.marketBuildButton.classList.remove('building');
      }, this.reduceMotion ? 0 : 820);
    });
  }

  // ---------- Paneller ----------

  openServeSheet(car: Car): void {
    this.closeSheets();

    this.openSlot = car.slotIndex;
    this.selectedFuel = null;

    const fuel = findFuel(car.fuel);
    this.orderLabel.innerHTML =
      `<span class="fuel-dot" style="background:${fuel.cssColor}"></span>` +
      `${formatMoney(car.amount)} ${fuel.label}`;

    this.resetFillConsole();
    this.fillConsole.classList.remove('direct');
    this.fillTarget.style.left = `${(car.amount / FILL_GAUGE_MAX) * 100}%`;
    this.fillTarget.style.setProperty('--target-color', fuel.cssColor);
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

  /**
   * Üst bar yazı tipi ekran genişliğiyle büyüdüğü için yüksekliği sabit değil.
   * Altındaki panellerin kayma miktarını sabit sayı yerine ölçümden veriyoruz;
   * aksi halde geniş ekranda haber kutusu talep göstergesinin üstüne biniyor.
   */
  private trackTopbarHeight(): void {
    const topbar = document.querySelector('.topbar');
    if (!(topbar instanceof HTMLElement)) return;

    const apply = (): void => {
      const shift = Math.max(
        0,
        Math.round(topbar.offsetHeight - TOPBAR_BASELINE_HEIGHT + TOPBAR_CLEARANCE),
      );
      document.documentElement.style.setProperty('--hud-stack-shift', `${shift}px`);
    };

    apply();
    new ResizeObserver(apply).observe(topbar);
  }

  private refreshTrafficSideChips(): void {
    for (const chip of this.trafficSideChips.children) {
      const side = (chip as HTMLElement).dataset.trafficSide;
      chip.setAttribute('aria-pressed', String(side === this.station.trafficSide));
    }
  }

  openPricingSheet(): void {
    this.refreshTrafficSideChips();
    this.closeSheets();
    for (const refresh of this.refreshPriceControls) refresh();
    this.marketPricingSection.hidden = !this.station.marketBuilt;
    this.pricingNote.textContent = this.station.marketBuilt
      ? `Yüksek fiyat daha çok kazandırır ama talebi azaltır · ` +
        `${this.station.data.marketSales} market satışı`
      : 'Yakıt fiyatları müşteri trafiğini etkiler. Ürün fiyatları market kurulunca açılır.';
    this.pricingSheet.hidden = false;
  }

  openManagementSheet(): void {
    this.closeSheets();
    this.managementPanel.open();
  }

  closeSheets(): void {
    this.cancelFillInteraction();
    this.serveSheet.hidden = true;
    this.unlockSheet.hidden = true;
    this.pricingSheet.hidden = true;
    this.managementPanel.close();
    this.openSlot = null;
  }

  /** Panelde açık olan pompa — araba giderse kapatmak için gerekiyor. */
  get openSlotIndex(): number | null {
    return this.openSlot;
  }

  /**
   * Yönetim ve fiyat panelleri okuma/karar panelidir; açıkken oyun durur.
   * Servis paneli buna dahil değil — o zaten oyunun kendisi.
   */
  get isGamePaused(): boolean {
    return !this.pricingSheet.hidden || this.managementPanel.isOpen;
  }

  get isServeSheetOpen(): boolean {
    return !this.serveSheet.hidden;
  }

  /** Aktif dolum ve kısa başarı geri bildirimi boyunca müşterinin sabrını dondurur. */
  get activeServiceSlotIndex(): number | null {
    if (this.openSlot === null) return null;
    // Geri bildirim ekranda dururken sabır işlemesin; yoksa uzattığımız
    // "fazla doldurdun" mesajı sırasında müşteri kaçabiliyor.
    const showingFeedback =
      this.fillConsole.classList.contains('success') ||
      this.fillConsole.classList.contains('overfilled') ||
      this.fillConsole.classList.contains('error');

    return this.fillActive || showingFeedback ? this.openSlot : null;
  }

  /** Arabaya uzun basıldığında paneli doğru nozulla doğrudan doldurmaya başlatır. */
  beginDirectFill(car: Car): void {
    this.openServeSheet(car);
    this.fillConsole.classList.add('direct');
    this.startFillInteraction(null, car.fuel, null);
    if (this.fillActive) {
      this.fillHint.textContent = 'Araçtan hızlı dolum — hedefte bırak';
    }
  }

  endDirectFill(): void {
    this.finishFillInteraction();
  }

  cancelDirectFill(): void {
    if (!this.fillActive) return;
    this.failFillInteraction('Dolum kesildi, tekrar dene');
  }

  // ---------- Her kare ----------

  update(world: World): void {
    const data = this.station.data;
    this.managementPanel.update();

    this.setText(this.moneyLabel, formatMoney(data.money));
    this.setText(
      this.statsLabel,
      `${data.servedCars} araç dolduruldu · ${data.missedCars} kaçtı · ` +
        `${this.station.unlockedCount}/6 pompa`,
    );

    this.updateDemandIndicator();

    this.setText(this.clockLabel, world.clockLabel);
    this.setText(this.dayIcon, world.weatherIcon);
    if (!data.marketBuilt) {
      this.marketBuildButton.hidden = false;
      this.marketBuildButton.disabled = !this.station.canAfford(MARKET_BUILD_COST);
      this.setText(
        this.marketBuildLabel,
        `Market kur · ${formatMoney(MARKET_BUILD_COST)}`,
      );
      this.marketBuildButton.title = this.marketBuildButton.disabled
        ? `${formatMoney(MARKET_BUILD_COST)} biriktir`
        : 'Market binasını sahaya kur';
    }

    for (const fuel of FUELS) {
      const row = this.stockRows.get(fuel.id);
      if (row === undefined) continue;
      const stock = this.station.fuelStockOf(fuel.id);
      const restocking = this.station.isFuelRestocking(fuel.id);
      if (
        this.lastStock.get(fuel.id) === stock &&
        this.lastRestocking.get(fuel.id) === restocking
      ) {
        continue;
      }
      this.lastStock.set(fuel.id, stock);
      this.lastRestocking.set(fuel.id, restocking);
      const ratio = this.station.fuelRatio(fuel.id);
      row.fill.style.transform = `scaleX(${ratio})`;
      row.button.classList.toggle('low', ratio < 0.22);
      row.button.classList.toggle('empty', stock < 0.5);
      row.button.classList.toggle('restocking', restocking);
      this.setText(row.value, restocking ? 'Tanker' : `${Math.floor(stock)} L`);

      const quote = this.station.restockQuote(fuel.id);
      row.button.title = restocking
        ? `${fuel.label} ikmali sürüyor; dolum bitene kadar satış kapalı`
        : quote.liters < 0.5
          ? `${fuel.label} tankı dolu`
          : `${Math.round(quote.liters)} L ikmal: ${formatMoney(quote.cost)}`;
    }
  }

  /**
   * Müşteri talebini üst barda gösterir: kademe rengi, yön oku ve doluluk çubuğu.
   * Talep zaten acceptCustomer'ın attığı zarı belirliyordu; burada sadece
   * oyuncuya görünür hale geliyor.
   */
  private updateDemandIndicator(): void {
    const demand = this.station.customerDemand();
    const level = this.station.customerDemandLevel;
    const trend = this.station.demandTrend;

    if (level !== this.lastDemandLevel || trend !== this.lastDemandTrend) {
      const levelChanged = this.lastDemandLevel !== null && level !== this.lastDemandLevel;

      this.demandRow.className = `demand level-${level} trend-${trend}`;
      this.lastDemandLevel = level;
      this.lastDemandTrend = trend;

      this.setText(this.demandArrow, DEMAND_ARROWS[trend]);
      this.setText(this.demandLabel, `Müşteri akışı ${DEMAND_LEVEL_TEXT[level]}`);
      this.demandRow.title =
        `Müşteri akışı ${DEMAND_TREND_TEXT[trend]} — normalin %${Math.round(demand * 100)} kadarı. ` +
        'Litre fiyatları, protesto, rakip fiyat savaşı ve küresel olaylar bu değeri değiştirir.';

      if (levelChanged && !this.reduceMotion) this.flashDemandChange();
    }

    // Yüzdeyi ondalığa yuvarlayıp aynı değerde style yazmaktan kaçınıyoruz.
    const width = Math.round(Math.min(1, demand / DEMAND_GAUGE_MAX) * 1000) / 10;
    if (width !== this.lastDemandWidth) {
      this.lastDemandWidth = width;
      this.demandFill.style.width = `${width}%`;
    }
  }

  private flashDemandChange(): void {
    this.demandRow.classList.remove('demand-changed');
    // Reflow tetikle, yoksa aynı animasyon sınıfı yeniden eklenince başlamaz.
    void this.demandRow.offsetWidth;
    this.demandRow.classList.add('demand-changed');
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

      let entry = this.carLabels.get(car.id);
      if (entry === undefined) {
        entry = this.createCarLabel(car);
        this.carLabels.set(car.id, entry);
        this.carLabelLayer.appendChild(entry.element);
      }

      entry.element.style.left = `${screen.x}px`;
      entry.element.style.top = `${screen.y}px`;

      if (car.phase === 'filling') {
        entry.element.classList.add('filling');
        entry.element.classList.remove('urgent');
        entry.bar.style.width = `${car.fillProgress * 100}%`;
      } else {
        const ratio = this.station.patienceRatio(car);
        entry.element.classList.toggle('urgent', ratio < URGENT_RATIO);
        entry.bar.style.width = `${ratio * 100}%`;
      }
    }

    for (const [id, entry] of [...this.carLabels]) {
      if (alive.has(id)) continue;

      entry.element.remove();
      this.carLabels.delete(id);
    }
  }

  private createCarLabel(car: Car): CarLabelEntry {
    const fuel: FuelInfo = findFuel(car.fuel);
    const cue = car.rescued
      ? 'çekici getirdi · basılı tut'
      : 'arabaya basılı tut';

    const label = document.createElement('div');
    label.className = 'car-label';
    label.innerHTML =
      `<span class="fuel-dot" style="background:${fuel.cssColor}"></span>` +
      `${formatMoney(car.amount)} ${fuel.label}` +
      `<span class="hold-cue">${cue}</span>` +
      `<span class="patience"><i></i></span>`;

    const bar = label.querySelector<HTMLElement>('.patience > i');
    if (bar === null) throw new Error('Araç sabır çubuğu oluşturulamadı');
    return { element: label, bar };
  }

  // ---------- Yakıt doldurma mini oyunu ----------

  private buildStockBars(): void {
    for (const fuel of FUELS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'stock-row';
      button.style.setProperty('--fuel-color', fuel.cssColor);
      button.setAttribute('aria-label', `${fuel.label} tankına ikmal yap`);

      const label = document.createElement('span');
      label.className = 'stock-name';
      label.textContent = fuel.label;

      const track = document.createElement('span');
      track.className = 'stock-track';
      const fill = document.createElement('i');
      fill.className = 'stock-fill';
      track.appendChild(fill);

      const value = document.createElement('span');
      value.className = 'stock-value';
      value.textContent = `${Math.floor(this.station.fuelStockOf(fuel.id))} L`;
      button.append(label, track, value);

      button.addEventListener('click', () => {
        const quote = this.station.restockQuote(fuel.id);
        const result = this.onRestock?.(fuel.id) ?? 'money';
        if (result === 'ok') {
          this.showStockFeedback(
            fuel.id,
            `${fuel.label} tankeri yola çıktı`,
            false,
          );
          navigator.vibrate?.([18, 24, 24]);
          return;
        }
        const message =
          result === 'full'
            ? `${fuel.label} tankı dolu`
            : result === 'pending'
              ? 'Tanker depoyu dolduruyor'
              : result === 'busy'
                ? 'Önce mevcut tanker ayrılsın'
                : `${formatMoney(quote.cost)} gerekiyor`;
        this.showStockFeedback(
          fuel.id,
          message,
          true,
        );
      });

      this.stockRows.set(fuel.id, { button, fill, value });
      this.stockBars.appendChild(button);
    }
  }

  private buildFuelNozzles(): void {
    for (const fuel of FUELS) {
      const nozzle = document.createElement('button');
      nozzle.type = 'button';
      nozzle.className = 'nozzle';
      nozzle.dataset.fuel = fuel.id;
      nozzle.setAttribute('aria-pressed', 'false');
      nozzle.setAttribute('aria-label', `${fuel.label} nozulu; doldurmak için basılı tut`);
      nozzle.style.setProperty('--fuel-color', fuel.cssColor);
      nozzle.innerHTML =
        `<span class="nozzle-hardware" aria-hidden="true">` +
          `<i class="nozzle-tip"></i><i class="nozzle-handle"></i>` +
        `</span><span class="nozzle-name">${fuel.label}</span>`;

      nozzle.addEventListener('pointerdown', (event) => {
        if (!event.isPrimary || this.fillActive) return;
        event.preventDefault();
        nozzle.setPointerCapture(event.pointerId);
        this.startFillInteraction(nozzle, fuel.id, event.pointerId);
      });

      nozzle.addEventListener('pointerup', (event) => {
        if (event.pointerId !== this.activePointerId) return;
        this.finishFillInteraction();
      });

      nozzle.addEventListener('pointercancel', (event) => {
        if (event.pointerId !== this.activePointerId) return;
        this.failFillInteraction('Nozul kaydı, tekrar dene');
      });

      nozzle.addEventListener('keydown', (event) => {
        if (event.repeat || (event.key !== ' ' && event.key !== 'Enter')) return;
        event.preventDefault();
        this.startFillInteraction(nozzle, fuel.id, null);
      });

      nozzle.addEventListener('keyup', (event) => {
        if (event.key !== ' ' && event.key !== 'Enter') return;
        event.preventDefault();
        this.finishFillInteraction();
      });

      this.fuelNozzles.appendChild(nozzle);
    }
  }

  private buildPriceControls(): void {
    for (const fuel of FUELS) {
      const range = this.station.fuelPriceRange(fuel.id);
      this.createPriceControl({
        parent: this.fuelPriceList,
        icon: '●',
        label: fuel.label,
        color: fuel.cssColor,
        min: range.min,
        max: range.max,
        step: range.step,
        getValue: () => this.station.fuelPriceOf(fuel.id),
        setValue: (value) => this.station.setFuelPrice(fuel.id, value),
        getDemand: () => this.station.fuelDemandLabel(fuel.id),
      });
    }

    for (const item of MARKET_ITEMS) {
      this.createPriceControl({
        parent: this.marketPriceList,
        icon: item.icon,
        label: item.label,
        min: item.minPrice,
        max: item.maxPrice,
        step: item.step,
        getValue: () => this.station.marketPriceOf(item.id),
        setValue: (value) => this.station.setMarketPrice(item.id, value),
        getDemand: () => this.station.marketDemandLabel(item.id),
      });
    }
  }

  private createPriceControl(options: {
    parent: HTMLElement;
    icon: string;
    label: string;
    color?: string;
    min: number;
    max: number;
    step: number;
    getValue: () => number;
    setValue: (value: number) => number;
    getDemand: () => string;
  }): void {
    const row = document.createElement('div');
    row.className = 'price-row';
    if (options.color !== undefined) row.style.setProperty('--price-color', options.color);

    const identity = document.createElement('div');
    identity.className = 'price-identity';
    identity.innerHTML =
      `<span class="price-icon" aria-hidden="true">${options.icon}</span>` +
      `<span><strong>${options.label}</strong><small></small></span>`;
    const demand = identity.querySelector<HTMLElement>('small');
    if (demand === null) throw new Error('Fiyat talep etiketi oluşturulamadı');

    const value = document.createElement('output');
    value.className = 'price-value';
    value.setAttribute('aria-live', 'polite');

    const stepper = document.createElement('div');
    stepper.className = 'price-stepper';
    const minus = document.createElement('button');
    minus.type = 'button';
    minus.className = 'price-step';
    minus.textContent = '−';
    minus.setAttribute('aria-label', `${options.label} fiyatını düşür`);
    const plus = document.createElement('button');
    plus.type = 'button';
    plus.className = 'price-step';
    plus.textContent = '+';
    plus.setAttribute('aria-label', `${options.label} fiyatını artır`);
    stepper.append(minus, plus);
    row.append(identity, value, stepper);
    options.parent.appendChild(row);

    const refresh = (): void => {
      const current = options.getValue();
      value.textContent = formatMoney(current);
      demand.textContent = options.getDemand();
      minus.disabled = current <= options.min;
      plus.disabled = current >= options.max;
    };

    const change = (direction: -1 | 1): void => {
      options.setValue(options.getValue() + options.step * direction);
      refresh();
      navigator.vibrate?.(10);
    };
    minus.addEventListener('click', () => change(-1));
    plus.addEventListener('click', () => change(1));
    this.refreshPriceControls.push(refresh);
    refresh();
  }

  private startFillInteraction(
    nozzle: HTMLButtonElement | null,
    fuel: FuelType,
    pointerId: number | null,
  ): void {
    if (this.openSlot === null || this.fillActive) return;
    const car = this.station.carAt(this.openSlot);
    if (car?.phase !== 'waiting') return;
    if (!this.station.canFuel(car.fuel, car.amount, car.unitPrice)) {
      const restocking = this.station.isFuelRestocking(car.fuel);
      this.showStockFeedback(
        car.fuel,
        restocking
          ? `${findFuel(car.fuel).label} tankerle dolduruluyor`
          : `${findFuel(car.fuel).label} tankı boş`,
        true,
      );
      this.failFillInteraction(
        restocking
          ? 'Tanker dolumu bitene kadar bu yakıt verilemez'
          : 'Depoda bu siparişe yetecek yakıt yok',
      );
      return;
    }

    this.clearFeedbackTimer();
    if (this.fillConsole.classList.contains('error')) {
      this.fillAmount = 0;
      this.renderFillAmount();
    }
    this.selectedFuel = fuel;
    // Sayaç sıvısı verilen yakıtın rengini alsın: hem nozula basarken hem
    // araca uzun basarak yapılan hızlı dolumda aynı yoldan geçiyoruz.
    this.fillConsole.style.setProperty('--fill-color', findFuel(fuel).cssColor);
    this.fillActive = true;
    this.activeNozzle = nozzle;
    this.activePointerId = pointerId;
    this.fillLastFrameTime = performance.now();
    this.targetPulsePlayed = false;
    nozzle?.classList.add('holding');
    nozzle?.setAttribute('aria-pressed', 'true');
    this.fillConsole.classList.remove('error', 'success', 'overfilled');
    this.fillConsole.classList.add('filling');
    this.fillHint.textContent = 'Basılı tut… yeşil hedefte bırak';

    this.fillAnimationFrame = requestAnimationFrame((now) => this.advanceFill(now));
  }

  private advanceFill(now: number): void {
    if (!this.fillActive || this.openSlot === null) return;

    const deltaSeconds = Math.min((now - this.fillLastFrameTime) / 1000, 0.1);
    this.fillLastFrameTime = now;
    this.fillAmount = Math.min(FILL_GAUGE_MAX, this.fillAmount + deltaSeconds * FILL_RATE_PER_SECOND);
    this.renderFillAmount();

    const target = this.station.carAt(this.openSlot)?.amount;
    const onTarget = target !== undefined && Math.abs(this.fillAmount - target) <= TARGET_TOLERANCE;
    this.fillConsole.classList.toggle('on-target', onTarget);

    if (onTarget && !this.targetPulsePlayed) {
      this.targetPulsePlayed = true;
      navigator.vibrate?.(18);
    }

    if (this.fillAmount >= FILL_GAUGE_MAX) {
      // Sayaç sonuna kadar tutulursa yakıt çöpe gitmez: müşteri siparişi kadar
      // öder, kalan fiziksel yakıt ise stoktan zarar olarak düşer.
      this.finishFillInteraction();
      return;
    }

    this.fillAnimationFrame = requestAnimationFrame((frameTime) => this.advanceFill(frameTime));
  }

  private finishFillInteraction(): void {
    if (!this.fillActive || this.openSlot === null || this.selectedFuel === null) return;

    const car = this.station.carAt(this.openSlot);
    if (car === undefined || car.phase !== 'waiting') {
      this.closeSheets();
      return;
    }

    const correctFuel = this.selectedFuel === car.fuel;
    const tooEarly = this.fillAmount < car.amount - TARGET_TOLERANCE;
    const overfilled = this.fillAmount > car.amount + TARGET_TOLERANCE;
    if (!correctFuel) {
      this.failFillInteraction('Yanlış nozul — renge dikkat et');
      return;
    }
    if (tooEarly) {
      this.failFillInteraction('Erken bıraktın');
      return;
    }

    const slotIndex = this.openSlot;
    const fuel = this.selectedFuel;
    const dispensedAmount = overfilled
      ? Math.round(this.fillAmount)
      : car.amount;
    this.stopFillAnimation();
    this.fillConsole.classList.remove('filling', 'on-target');
    this.fillConsole.classList.add(overfilled ? 'overfilled' : 'success');
    this.fillAmount = dispensedAmount;
    this.renderFillAmount();
    this.fillHint.textContent = overfilled
      ? `Fazla ${formatMoney(dispensedAmount - car.amount)} verdin · müşteri sadece siparişini öder`
      : 'Tam isabet!';
    navigator.vibrate?.(overfilled ? [34, 18, 34] : [22, 32, 36]);

    this.feedbackTimer = window.setTimeout(() => {
      this.feedbackTimer = null;
      this.onServe?.(slotIndex, fuel, dispensedAmount);
      this.closeSheets();
    }, overfilled ? FILL_OVERFILL_FEEDBACK_MS : FILL_SUCCESS_FEEDBACK_MS);
  }

  private failFillInteraction(message: string): void {
    this.stopFillAnimation();
    this.fillConsole.classList.remove('filling', 'on-target');
    this.fillConsole.classList.add('error');
    this.fillHint.textContent = message;
    navigator.vibrate?.(28);

    this.clearFeedbackTimer();
    this.feedbackTimer = window.setTimeout(() => {
      this.feedbackTimer = null;
      this.resetFillConsole();
    }, FILL_ERROR_FEEDBACK_MS);
  }

  private stopFillAnimation(): void {
    if (this.fillAnimationFrame !== null) cancelAnimationFrame(this.fillAnimationFrame);
    this.fillAnimationFrame = null;
    this.activeNozzle?.classList.remove('holding');
    this.activeNozzle?.setAttribute('aria-pressed', 'false');
    this.activeNozzle = null;
    this.activePointerId = null;
    this.fillActive = false;
  }

  private cancelFillInteraction(): void {
    this.stopFillAnimation();
    this.clearFeedbackTimer();
    this.selectedFuel = null;
  }

  private resetFillConsole(): void {
    this.stopFillAnimation();
    this.fillAmount = 0;
    this.selectedFuel = null;
    this.targetPulsePlayed = false;
    this.fillConsole.classList.remove('filling', 'on-target', 'error', 'success', 'overfilled');
    this.fillConsole.classList.remove('direct');
    this.fillConsole.style.removeProperty('--fill-color');
    this.fillHint.textContent = 'Doğru nozula basılı tut, hedefte bırak';
    this.renderFillAmount();
  }

  private renderFillAmount(): void {
    const progress = Math.max(0, Math.min(1, this.fillAmount / FILL_GAUGE_MAX));
    this.fillLiquid.style.width = `${progress * 100}%`;
    this.fillReadout.textContent = formatMoney(Math.round(this.fillAmount));
  }

  private clearFeedbackTimer(): void {
    if (this.feedbackTimer === null) return;
    clearTimeout(this.feedbackTimer);
    this.feedbackTimer = null;
  }

  private showStockFeedback(fuel: FuelType, message: string, bad: boolean): void {
    const row = this.stockRows.get(fuel);
    if (row === undefined) return;

    if (this.stockFeedbackTimer !== null) clearTimeout(this.stockFeedbackTimer);
    row.button.classList.remove('pulse-good', 'pulse-bad');
    // Sınıfın art arda eklenmesinde animasyonu yeniden başlat.
    void row.button.offsetWidth;
    row.button.classList.add(bad ? 'pulse-bad' : 'pulse-good');
    this.stockMessage.textContent = message;
    this.stockFeedbackTimer = window.setTimeout(() => {
      row.button.classList.remove('pulse-good', 'pulse-bad');
      this.stockMessage.textContent = 'İkmal için bara dokun';
      this.stockFeedbackTimer = null;
    }, 1600);
  }

  // ---------- Diğer ----------

  showFuelDeliveryComplete(fuelType: FuelType, liters: number): void {
    const fuel = findFuel(fuelType);
    this.showStockFeedback(
      fuelType,
      liters > 0
        ? `${fuel.label} +${Math.round(liters)} L · ikmal tamam`
        : `${fuel.label} ikmali tamam`,
      false,
    );
    navigator.vibrate?.([16, 22, 28]);
  }

  showManagementEvent(event: ManagementEvent): void {
    this.managementPanel.showEvent(event);
    if (this.managementAlertTimer !== null) clearTimeout(this.managementAlertTimer);

    this.managementAlert.className = `management-alert ${event.tone}`;
    this.managementAlertTitle.textContent = event.title;
    this.managementAlertDetail.textContent = event.detail;
    this.managementAlert.hidden = false;

    this.managementAlertTimer = window.setTimeout(() => {
      this.managementAlert.hidden = true;
      this.managementAlertTimer = null;
    }, event.tone === 'bad' ? 6_000 : 4_500);
  }

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
