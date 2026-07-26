import type { GameEngine, OfflineReport } from '../game/economy';
import { formatDuration, formatMoney } from '../game/format';
import { findWell } from '../game/wells';

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (element === null) throw new Error(`Arayüz elemanı bulunamadı: #${id}`);
  return element as T;
}

/**
 * DOM tabanlı arayüz. Three.js sahnesinin üstünde duruyor.
 *
 * Metinler her karede yeniden yazılmasın diye son değer saklanıyor —
 * textContent'e her frame yazmak mobilde gereksiz layout maliyeti çıkarıyor.
 */
export class Hud {
  onUpgrade: (() => void) | null = null;

  private readonly engine: GameEngine;

  private readonly moneyLabel = requireElement('money');
  private readonly incomeLabel = requireElement('income');
  private readonly wellNameLabel = requireElement('well-name');
  private readonly wellStatsLabel = requireElement('well-stats');
  private readonly upgradeButton = requireElement<HTMLButtonElement>('upgrade');
  private readonly floaterLayer = requireElement('floaters');
  private readonly offlinePanel = requireElement('offline');
  private readonly offlineText = requireElement('offline-text');

  private selectedWellId: string | null = null;
  private lastText = new Map<HTMLElement, string>();

  constructor(engine: GameEngine) {
    this.engine = engine;

    this.upgradeButton.addEventListener('click', () => {
      this.onUpgrade?.();
    });

    requireElement('offline-continue').addEventListener('click', () => {
      this.offlinePanel.hidden = true;
    });
  }

  get selected(): string | null {
    return this.selectedWellId;
  }

  select(wellId: string | null): void {
    this.selectedWellId = wellId;
  }

  update(): void {
    this.setText(this.moneyLabel, formatMoney(this.engine.money));
    this.setText(this.incomeLabel, `${formatMoney(this.engine.incomePerSecond())} / sn`);
    this.refreshWellCard();
  }

  private refreshWellCard(): void {
    const wellId = this.selectedWellId;
    const definition = wellId === null ? undefined : findWell(wellId);

    if (wellId === null || definition === undefined) {
      this.setText(this.wellNameLabel, 'Kuyu seç');
      this.setText(this.wellStatsLabel, 'Sahadaki bir kuyuya dokun.');
      this.setText(this.upgradeButton, '—');
      this.upgradeButton.disabled = true;
      return;
    }

    const level = this.engine.levelOf(wellId);
    const cost = this.engine.upgradeCostOf(wellId);
    const affordable = this.engine.canAfford(cost);

    this.setText(this.wellNameLabel, definition.displayName);

    this.setText(
      this.wellStatsLabel,
      level > 0
        ? `Seviye ${level}  •  ${formatMoney(this.engine.wellIncomePerSecond(wellId))} / sn`
        : 'Kilitli  •  henüz üretim yok',
    );

    this.setText(
      this.upgradeButton,
      level > 0 ? `Yükselt   ${formatMoney(cost)}` : `Kuyuyu Aç   ${formatMoney(cost)}`,
    );

    this.upgradeButton.disabled = !affordable;
  }

  showOffline(report: OfflineReport): void {
    this.offlineText.innerHTML =
      `${formatDuration(report.elapsedSeconds)} boyunca saha çalıştı ve ` +
      `<strong>${formatMoney(report.earnings)}</strong> kazandın.`;

    this.offlinePanel.hidden = false;
  }

  /** Dokunma ödülünü kuyunun üstünde gösterir. */
  spawnFloater(text: string, x: number, y: number): void {
    const element = document.createElement('div');
    element.className = 'floater';
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
