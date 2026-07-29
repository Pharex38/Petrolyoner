import { formatDuration, formatMoney, formatNumber } from '../game/format';
import type {
  ManagementActionResult,
  ManagementEvent,
  WorkerState,
} from '../game/management';
import type { Station } from '../game/station';
import { isTrafficSide, trafficSideLabel, type TrafficSide } from '../game/traffic';

type ManagementTab = 'overview' | 'environment' | 'workers' | 'rivals' | 'economy';

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (element === null) throw new Error(`Arayüz elemanı bulunamadı: #${id}`);
  return element as T;
}

function percent(value: number): string {
  return `%${Math.round(value)}`;
}

export class ManagementPanel {
  private readonly sheet = requireElement('management-sheet');
  private readonly body = requireElement('management-body');
  private readonly feedback = requireElement('management-feedback');
  private readonly tabButtons = [
    ...document.querySelectorAll<HTMLButtonElement>('[data-management-tab]'),
  ];
  /** Trafik yönü sahneyi de yeniden kuruyor; asıl işi HUD'un sahibi yapar. */
  onTrafficSide: ((side: TrafficSide) => void) | null = null;

  private activeTab: ManagementTab = 'overview';
  private nextRenderAt = 0;
  private feedbackTimer: number | null = null;
  private lastContent = '';

  constructor(private readonly station: Station) {
    requireElement('management-close').addEventListener('click', () => this.close());

    for (const button of this.tabButtons) {
      button.addEventListener('click', () => {
        const tab = button.dataset.managementTab;
        if (!this.isTab(tab)) return;
        this.activeTab = tab;
        this.body.scrollTop = 0;
        this.lastContent = '';
        this.render();
      });
    }

    this.body.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const button = target.closest<HTMLButtonElement>('[data-management-action]');
      if (button === null || button.disabled) return;
      this.performAction(
        button.dataset.managementAction ?? '',
        button.dataset.target ?? '',
      );
    });
  }

  get isOpen(): boolean {
    return !this.sheet.hidden;
  }

  open(): void {
    this.activeTab = 'overview';
    this.feedback.textContent = 'Kararların talep, risk ve üretimi doğrudan etkiler.';
    this.feedback.className = 'management-feedback';
    this.body.scrollTop = 0;
    this.lastContent = '';
    this.sheet.hidden = false;
    this.render();
  }

  close(): void {
    this.sheet.hidden = true;
  }

  update(): void {
    if (!this.isOpen) return;
    const now = performance.now();
    if (now < this.nextRenderAt) return;
    this.nextRenderAt = now + 300;
    this.render();
  }

  showEvent(event: ManagementEvent): void {
    if (!this.isOpen) return;
    this.setFeedback(`${event.title}: ${event.detail}`, event.tone === 'good');
  }

  private render(): void {
    for (const button of this.tabButtons) {
      const selected = button.dataset.managementTab === this.activeTab;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-selected', String(selected));
    }

    let content = '';
    if (this.activeTab === 'overview') content = this.renderOverview();
    if (this.activeTab === 'environment') content = this.renderEnvironment();
    if (this.activeTab === 'workers') content = this.renderWorkers();
    if (this.activeTab === 'rivals') content = this.renderRivals();
    if (this.activeTab === 'economy') content = this.renderEconomy();
    if (content === this.lastContent) return;

    const scrollTop = this.body.scrollTop;
    this.lastContent = content;
    this.body.innerHTML = content;
    this.body.scrollTop = scrollTop;
  }

  private renderOverview(): string {
    const management = this.station.management;
    const state = management.state;
    const event = state.activeGlobalEvent;
    const productionStatus = management.isOnStrike
      ? `Grev · ${formatDuration(state.strikeSeconds)}`
      : management.hiredWorkers.length === 0
        ? 'Personel bekliyor'
        : state.storedCrude >= state.storageCapacity
          ? 'Tanklar dolu'
          : 'Üretim açık';

    return (
      `<div class="management-hero">` +
        `<span><small>Petrol endeksi</small><strong>${formatMoney(state.oilPrice)}<i>/varil</i></strong></span>` +
        `<span class="${event === null ? '' : 'warning'}">` +
          `<small>Küresel durum</small>` +
          `<strong>${event?.label ?? 'Dengeli piyasa'}</strong>` +
          `<em>${event === null ? 'Yeni olay bekleniyor' : formatDuration(event.remainingSeconds)}</em>` +
        `</span>` +
      `</div>` +
      `<div class="management-metrics">` +
        this.metric('İtibar', percent(state.reputation), state.reputation, 'good') +
        this.metric('Halk desteği', percent(state.publicSupport), state.publicSupport, 'good') +
        this.metric('Karbon', percent(state.carbonIndex), state.carbonIndex, 'bad') +
        this.metric('Sızıntı riski', percent(state.spillRisk), state.spillRisk, 'bad') +
        this.metric('İşçi memnuniyeti', percent(state.workerSatisfaction), state.workerSatisfaction, 'good') +
        this.metric('Sendika baskısı', percent(state.unionPressure), state.unionPressure, 'bad') +
      `</div>` +
      `<div class="management-status-row">` +
        `<span><small>Üretim</small><strong>${productionStatus}</strong></span>` +
        `<span><small>Ham petrol</small><strong>${Math.floor(state.storedCrude)} / ${Math.floor(state.storageCapacity)} varil</strong></span>` +
      `</div>` +
      `<section class="management-section">` +
        `<h3>İstasyon ayarları</h3>` +
        this.renderTrafficSideCard() +
      `</section>` +
      `<section class="management-section">` +
        `<h3>Son olaylar</h3>` +
        this.renderEventLog() +
      `</section>`
    );
  }

  /** Şeritlerin yönü; giriş ve çıkış kapıları da bununla rol değiştirir. */
  private renderTrafficSideCard(): string {
    const active = this.station.trafficSide;
    const sides: readonly TrafficSide[] = ['sag', 'sol'];

    return (
      `<article class="setting-card">` +
        `<div class="setting-copy">` +
          `<strong>Trafik yönü</strong>` +
          `<small>Şeritler ${trafficSideLabel(active).toLocaleLowerCase('tr')} akıyor · ` +
            `giriş ve çıkış kapıları yer değiştirir</small>` +
        `</div>` +
        `<div class="chips">` +
          sides
            .map(
              (side) =>
                `<button type="button" class="chip" data-management-action="traffic-side" ` +
                `data-target="${side}" aria-pressed="${side === active}">` +
                `${trafficSideLabel(side)}</button>`,
            )
            .join('') +
        `</div>` +
      `</article>`
    );
  }

  private renderEnvironment(): string {
    const management = this.station.management;
    const state = management.state;
    const cleanupCost = management.cleanupCost();
    const safetyCost = management.policyUpgradeCost('safety');

    return (
      `<div class="management-metrics compact">` +
        this.metric('Karbon', percent(state.carbonIndex), state.carbonIndex, 'bad') +
        this.metric('Sızıntı', percent(state.spillRisk), state.spillRisk, 'bad') +
        this.metric('Halk desteği', percent(state.publicSupport), state.publicSupport, 'good') +
        this.metric('İtibar', percent(state.reputation), state.reputation, 'good') +
      `</div>` +
      (state.protestSeconds > 0
        ? `<div class="management-callout bad"><strong>Protesto sürüyor</strong>` +
          `<span>${formatDuration(state.protestSeconds)} boyunca müşteri talebi düşer.</span></div>`
        : '') +
      `<section class="management-section">` +
        `<h3>Çevre politikası</h3>` +
        this.actionCard(
          'Gerçek temizlik',
          'Sızıntı riskini düşürür, halk desteğini ve itibarı kalıcı artırır.',
          'cleanup',
          `Temizle · ${formatMoney(cleanupCost)}`,
          !this.station.canAfford(cleanupCost),
          'leaf',
        ) +
        this.actionCard(
          'Yeşil imaj kampanyası',
          'Desteği hızla artırır; karbon ve sızıntı değerlerini düşürmez.',
          'greenwash',
          state.greenwashCooldown > 0
            ? `Bekle · ${formatDuration(state.greenwashCooldown)}`
            : `Kampanya · ${formatMoney(management.greenwashingCost)}`,
          state.greenwashCooldown > 0 ||
            !this.station.canAfford(management.greenwashingCost),
          'warning',
        ) +
        this.actionCard(
          `Güvenlik seviyesi ${state.safetyLevel}/5`,
          'Tanker sızıntısı, iş kazası ve çevre cezası ihtimalini azaltır.',
          'upgrade-safety',
          state.safetyLevel >= 5
            ? 'En yüksek seviye'
            : `Yükselt · ${formatMoney(safetyCost)}`,
          state.safetyLevel >= 5 || !this.station.canAfford(safetyCost),
          'shield',
        ) +
      `</section>` +
      `<div class="management-footnote">Çevre vergisi: <strong>${formatMoney(state.environmentalTaxesPaid)}</strong>` +
        ` · Hukuk/ihlal cezası: <strong>${formatMoney(state.legalFinesPaid)}</strong></div>`
    );
  }

  private renderWorkers(): string {
    const management = this.station.management;
    const state = management.state;
    const wageCost = management.policyUpgradeCost('wage');
    const conditionCost = management.policyUpgradeCost('conditions');

    return (
      `<div class="management-status-row">` +
        `<span><small>Memnuniyet</small><strong>${percent(state.workerSatisfaction)}</strong></span>` +
        `<span><small>Sendika baskısı</small><strong>${percent(state.unionPressure)}</strong></span>` +
        `<span><small>Sonraki bordro</small><strong>${formatDuration(state.payrollSeconds)}</strong></span>` +
      `</div>` +
      (management.isOnStrike
        ? `<div class="management-callout bad"><strong>Üretim tamamen durdu</strong>` +
          `<span>Grev bitimine ${formatDuration(state.strikeSeconds)} kaldı.</span></div>`
        : '') +
      `<section class="management-section">` +
        `<h3>Nitelikli personel</h3>` +
        state.workers.map((worker) => this.renderWorker(worker)).join('') +
        this.renderAttendantCard() +
      `</section>` +
      `<section class="management-section">` +
        `<h3>Çalışma koşulları</h3>` +
        this.actionCard(
          `Maaş seviyesi ${state.wageLevel}/5`,
          `Günlük bordro ${formatMoney(management.payrollCost)}; yüksek maaş grev riskini azaltır.`,
          'upgrade-wage',
          state.wageLevel >= 5 ? 'En yüksek seviye' : `Yükselt · ${formatMoney(wageCost)}`,
          state.wageLevel >= 5 || !this.station.canAfford(wageCost),
          'wage',
        ) +
        this.actionCard(
          `Koşullar ${state.conditionsLevel}/5`,
          'Dinlenme alanı, vardiya düzeni ve ekipman kalitesini iyileştirir.',
          'upgrade-conditions',
          state.conditionsLevel >= 5
            ? 'En yüksek seviye'
            : `Yükselt · ${formatMoney(conditionCost)}`,
          state.conditionsLevel >= 5 || !this.station.canAfford(conditionCost),
          'conditions',
        ) +
      `</section>`
    );
  }

  private renderRivals(): string {
    const management = this.station.management;
    const state = management.state;
    return (
      (state.rivalPressureSeconds > 0
        ? `<div class="management-callout warning"><strong>Fiyat savaşı</strong>` +
          `<span>${formatDuration(state.rivalPressureSeconds)} boyunca müşteri talebi baskılanıyor.</span></div>`
        : '') +
      `<section class="management-section rivals">` +
        `<h3>AI rakip şirketler</h3>` +
        state.rivals.map((rival) => {
          const reserveText = rival.intelLevel >= 3
            ? `${Math.round(rival.reserves)} varil`
            : 'Casuslukla öğren';
          const inactive = rival.sabotagedSeconds > 0;
          return (
            `<article class="rival-card${inactive ? ' sabotaged' : ''}">` +
              `<header><span><strong>${rival.name}</strong>` +
                `<small>${inactive ? `Grev · ${formatDuration(rival.sabotagedSeconds)}` : 'Üretimde'}</small>` +
              `</span><b>Güvenlik ${rival.security}/5</b></header>` +
              `<dl>` +
                `<div><dt>Rezerv</dt><dd>${reserveText}</dd></div>` +
                `<div><dt>Kasa</dt><dd>${rival.intelLevel >= 3 ? formatMoney(rival.cash) : '—'}</dd></div>` +
                `<div><dt>İşçi morali</dt><dd>${percent(rival.workerMorale)}</dd></div>` +
              `</dl>` +
              `<div class="management-actions">` +
                this.button(
                  'spy-intel',
                  `Rezerv casusu · ${formatMoney(management.spyOperationCost('intel'))}`,
                  state.spyCooldown > 0 ||
                    !this.station.canAfford(management.spyOperationCost('intel')),
                  rival.id,
                  true,
                ) +
                this.button(
                  'spy-sabotage',
                  `Grevi kışkırt · ${formatMoney(management.spyOperationCost('sabotage'))}`,
                  state.spyCooldown > 0 ||
                    inactive ||
                    !this.station.canAfford(management.spyOperationCost('sabotage')),
                  rival.id,
                  false,
                ) +
              `</div>` +
            `</article>`
          );
        }).join('') +
      `</section>` +
      `<div class="management-footnote">` +
        (state.spyCooldown > 0
          ? `Casus ağı ${formatDuration(state.spyCooldown)} sonra hazır.`
          : 'Operasyon başarı ihtimali rakibin güvenlik seviyesine bağlıdır.') +
      `</div>`
    );
  }

  private renderEconomy(): string {
    const management = this.station.management;
    const state = management.state;
    const event = state.activeGlobalEvent;
    const storageRatio = state.storageCapacity > 0
      ? state.storedCrude / state.storageCapacity
      : 0;
    const batch = management.crudeBatch;
    const buyValue = management.crudeTradeValue();
    const blackValue = management.crudeTradeValue(1.65);
    const storageCost = management.storageUpgradeCost();

    return (
      `<div class="economy-price">` +
        `<small>Canlı petrol fiyatı</small>` +
        `<strong>${formatMoney(state.oilPrice)}<i>/varil</i></strong>` +
        `<span>${event?.label ?? 'Normal piyasa'}${event === null ? '' : ` · ${formatDuration(event.remainingSeconds)}`}</span>` +
      `</div>` +
      `<div class="storage-card">` +
        `<header><span><small>Ham petrol deposu</small>` +
          `<strong>${Math.floor(state.storedCrude)} / ${Math.floor(state.storageCapacity)} varil</strong></span>` +
          `<b>Seviye ${state.storageLevel}/8</b></header>` +
        `<div class="management-progress"><i style="transform:scaleX(${Math.min(1, storageRatio)})"></i></div>` +
        `<small>Kanıtlanmış rezerv: ${formatNumber(state.provenReserves)} varil</small>` +
      `</div>` +
      `<div class="management-actions economy-actions">` +
        this.button(
          'buy-crude',
          `${batch} varil al · ${formatMoney(buyValue)}`,
          state.storageCapacity - state.storedCrude < batch ||
            !this.station.canAfford(buyValue),
          '',
          true,
        ) +
        this.button(
          'sell-crude',
          `${batch} varil sat · ${formatMoney(buyValue)}`,
          state.storedCrude < batch,
        ) +
      `</div>` +
      `<section class="management-section">` +
        `<h3>Depolama yatırımı</h3>` +
        this.actionCard(
          'Devasa tank sahası',
          'Düşük fiyat döneminde daha fazla petrol stoklayıp kriz yükselişinde satmanı sağlar.',
          'build-storage',
          state.storageLevel >= 8
            ? 'Azami kapasite'
            : `Yeni tank · ${formatMoney(storageCost)}`,
          state.storageLevel >= 8 || !this.station.canAfford(storageCost),
          'storage',
        ) +
      `</section>` +
      `<section class="management-section black-market">` +
        `<h3>Kara borsa <span>Riskli ve yasadışı</span></h3>` +
        (state.blackMarketUnlocked
          ? `<div class="black-market-status"><span>Takip riski <strong>${percent(state.blackMarketHeat)}</strong></span>` +
            `<span>Toplam kaçak ciro <strong>${formatMoney(state.totalBlackMarketSales)}</strong></span></div>` +
            this.button(
              'black-sale',
              `${batch} varil gizlice sat · ${formatMoney(blackValue)}`,
              state.storedCrude < batch,
              '',
              false,
            )
          : this.actionCard(
              'Gizli ticaret ağı kur',
              'Yasal fiyatın üzerinde satış açar; yakalanırsan gelire el konur, ceza ve protesto başlar.',
              'unlock-black-market',
              `Ağı kur · ${formatMoney(management.blackMarketUnlockCost)}`,
              !this.station.canAfford(management.blackMarketUnlockCost),
              'black',
            )) +
      `</section>`
    );
  }

  private renderWorker(worker: WorkerState): string {
    const role =
      worker.role === 'muhendis'
        ? 'Mühendis'
        : worker.role === 'jeolog'
          ? 'Jeolog'
          : 'Vardiya şefi';
    const trait =
      worker.trait === 'sarhos'
        ? 'Sarhoş · kaza riski'
        : worker.trait === 'dahi'
          ? 'Dahi · gizli rezerv'
          : 'Sendikacı · baskıyı azaltır';
    return (
      `<article class="worker-card${worker.trait === 'sarhos' ? ' risky' : ''}">` +
        `<span><strong>${worker.name}</strong><small>${role} · ${trait}</small></span>` +
        (worker.hired
          ? `<b>İşe alındı<br><small>${formatMoney(worker.salary)}/gün</small></b>`
          : this.button(
              'hire',
              `İşe al · ${formatMoney(worker.hireCost)}`,
              !this.station.canAfford(worker.hireCost),
              worker.id,
              true,
            )) +
      `</article>`
    );
  }

  /**
   * Pompacı, şirket personeliyle aynı listede duruyor çünkü oyuncu için hepsi
   * "işe alınan kişi". Farkı: maaş yerine servis başına komisyon alır ve
   * istasyon katmanında yaşar (station.attendants), yönetim state'inde değil.
   */
  private renderAttendantCard(): string {
    const hired = this.station.attendantCount;
    const pumps = this.station.unlockedCount;
    const commission = Math.round(this.station.attendantCommission * 100);
    const cost = this.station.attendantCost();

    // Diğer kartlarda bu satır "Rol · Özellik" biçiminde; başlığı tekrar etme.
    const detail = hired === 0
      ? `Pompa görevlisi · aracı kendi doldurur · %${commission} komisyon`
      : `Pompa görevlisi · ${hired}/${pumps} pompa otomatik · %${commission} komisyon`;

    return (
      `<article class="worker-card">` +
        `<span><strong>Pompacı${hired > 0 ? ` ×${hired}` : ''}</strong>` +
        `<small>${detail}</small></span>` +
        (this.station.canHireAttendant
          ? this.button(
              'hire-attendant',
              `İşe al · ${formatMoney(cost)}`,
              !this.station.canAfford(cost),
              '',
              true,
            )
          : `<b>Tam kadro<br><small>${hired}/${pumps} pompa</small></b>`) +
      `</article>`
    );
  }

  private renderEventLog(): string {
    const events = this.station.management.state.eventLog;
    if (events.length === 0) {
      return `<p class="management-empty">Henüz yönetim olayı yok.</p>`;
    }
    return (
      `<div class="management-event-log">` +
        events.map((event) =>
          `<article class="${event.tone}"><i></i><span><strong>${event.title}</strong>` +
          `<small>${event.detail}</small></span></article>`,
        ).join('') +
      `</div>`
    );
  }

  private metric(
    label: string,
    value: string,
    progress: number,
    direction: 'good' | 'bad',
  ): string {
    const bad =
      direction === 'good'
        ? progress < 42
        : progress > 62;
    return (
      `<article class="${bad ? 'bad' : ''}"><span><small>${label}</small><strong>${value}</strong></span>` +
      `<div><i style="transform:scaleX(${Math.max(0, Math.min(1, progress / 100))})"></i></div></article>`
    );
  }

  private actionCard(
    title: string,
    detail: string,
    action: string,
    label: string,
    disabled: boolean,
    icon: string,
  ): string {
    return (
      `<article class="management-action-card">` +
        `<span class="management-card-icon ${icon}" aria-hidden="true"></span>` +
        `<div><strong>${title}</strong><small>${detail}</small></div>` +
        this.button(action, label, disabled) +
      `</article>`
    );
  }

  private button(
    action: string,
    label: string,
    disabled: boolean,
    target = '',
    secondary = false,
  ): string {
    return (
      `<button class="management-action${secondary ? ' secondary' : ''}" type="button" ` +
      `data-management-action="${action}" data-target="${target}"` +
      `${disabled ? ' disabled' : ''}>${label}</button>`
    );
  }

  private performAction(action: string, target: string): void {
    const management = this.station.management;
    let result: ManagementActionResult | null = null;
    if (action === 'hire') result = management.hireWorker(target);
    if (action === 'hire-attendant') {
      // Pompacı istasyon katmanında; şirket personelinden ayrı tutuluyor.
      result = this.station.tryHireAttendant()
        ? { ok: true, message: `${this.station.attendantCount}. pompacı işe alındı.` }
        : { ok: false, message: 'Pompacı tutulamadı — para ya da boş pompa yok.' };
    }
    if (action === 'traffic-side' && isTrafficSide(target)) {
      if (target === this.station.trafficSide) return;
      this.onTrafficSide?.(target);
      result = { ok: true, message: `Trafik ${trafficSideLabel(target).toLocaleLowerCase('tr')} akacak.` };
    }
    if (action === 'upgrade-safety') result = management.upgradePolicy('safety');
    if (action === 'upgrade-wage') result = management.upgradePolicy('wage');
    if (action === 'upgrade-conditions') result = management.upgradePolicy('conditions');
    if (action === 'greenwash') result = management.runGreenwashingCampaign();
    if (action === 'cleanup') result = management.fundCleanup();
    if (action === 'spy-intel') result = management.runSpyOperation(target, 'intel');
    if (action === 'spy-sabotage') result = management.runSpyOperation(target, 'sabotage');
    if (action === 'build-storage') result = management.buildStorageTank();
    if (action === 'buy-crude') result = management.buyCrude();
    if (action === 'sell-crude') result = management.sellCrude();
    if (action === 'unlock-black-market') result = management.unlockBlackMarket();
    if (action === 'black-sale') result = management.sellOnBlackMarket();
    if (result === null) return;

    this.setFeedback(result.message, result.ok);
    navigator.vibrate?.(result.ok ? 12 : 28);
    this.render();
  }

  private setFeedback(message: string, good: boolean): void {
    if (this.feedbackTimer !== null) clearTimeout(this.feedbackTimer);
    this.feedback.textContent = message;
    this.feedback.className = good
      ? 'management-feedback good'
      : 'management-feedback bad';
    this.feedbackTimer = window.setTimeout(() => {
      this.feedbackTimer = null;
      this.feedback.textContent = 'Kararların talep, risk ve üretimi doğrudan etkiler.';
      this.feedback.className = 'management-feedback';
    }, 2600);
  }

  private isTab(value: string | undefined): value is ManagementTab {
    return (
      value === 'overview' ||
      value === 'environment' ||
      value === 'workers' ||
      value === 'rivals' ||
      value === 'economy'
    );
  }
}
