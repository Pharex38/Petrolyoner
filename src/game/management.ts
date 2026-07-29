import type { PlayerData } from './state';

export type ManagementEventTone = 'info' | 'good' | 'warning' | 'bad';
export type WorkerRole = 'muhendis' | 'jeolog' | 'vardiya';
export type WorkerTrait = 'sarhos' | 'dahi' | 'sendikaci';
export type SpyOperation = 'intel' | 'sabotage';

export interface ManagementEvent {
  readonly id: number;
  readonly title: string;
  readonly detail: string;
  readonly tone: ManagementEventTone;
}

export interface WorkerState {
  readonly id: string;
  readonly name: string;
  readonly role: WorkerRole;
  readonly trait: WorkerTrait;
  readonly hireCost: number;
  readonly salary: number;
  hired: boolean;
}

export interface RivalState {
  readonly id: string;
  readonly name: string;
  cash: number;
  reserves: number;
  workerMorale: number;
  security: number;
  intelLevel: number;
  sabotagedSeconds: number;
}

export type GlobalEventId =
  | 'war'
  | 'recession'
  | 'tech'
  | 'embargo'
  | 'discovery';

export interface GlobalEventState {
  readonly id: GlobalEventId;
  readonly label: string;
  readonly detail: string;
  readonly priceMultiplier: number;
  readonly demandMultiplier: number;
  remainingSeconds: number;
}

export interface ManagementState {
  reputation: number;
  publicSupport: number;
  carbonIndex: number;
  spillRisk: number;
  safetyLevel: number;
  wageLevel: number;
  conditionsLevel: number;
  workerSatisfaction: number;
  unionPressure: number;
  strikeSeconds: number;
  protestSeconds: number;
  greenwashCooldown: number;
  spyCooldown: number;
  rivalPressureSeconds: number;
  payrollSeconds: number;
  nextStaffIncidentSeconds: number;
  nextRivalActionSeconds: number;
  nextRegulationSeconds: number;
  nextGlobalEventSeconds: number;
  economyPhase: number;
  oilPrice: number;
  provenReserves: number;
  storedCrude: number;
  storageCapacity: number;
  storageLevel: number;
  blackMarketUnlocked: boolean;
  blackMarketHeat: number;
  environmentalTaxesPaid: number;
  legalFinesPaid: number;
  totalBlackMarketSales: number;
  workers: WorkerState[];
  rivals: RivalState[];
  activeGlobalEvent: GlobalEventState | null;
  eventLog: ManagementEvent[];
  nextEventId: number;
}

export interface ManagementActionResult {
  readonly ok: boolean;
  readonly message: string;
}

const GAME_DAY_SECONDS = 180;
const BASE_OIL_PRICE = 70;
const PRODUCTION_PER_WORKER_PER_SECOND = 0.085;
const CRUDE_BATCH = 100;
const BLACK_MARKET_UNLOCK_COST = 25_000;
const REGULATION_CHECK_MIN_SECONDS = 42;
const REGULATION_CHECK_MAX_SECONDS = 58;
const REGULATION_RECOVERY_MIN_SECONDS = 72;
const REGULATION_RECOVERY_MAX_SECONDS = 96;

const WORKER_TEMPLATES: readonly WorkerState[] = [
  {
    id: 'engin',
    name: 'Engin Usta',
    role: 'muhendis',
    trait: 'sarhos',
    hireCost: 8_000,
    salary: 1_200,
    hired: false,
  },
  {
    id: 'selin',
    name: 'Dr. Selin',
    role: 'jeolog',
    trait: 'dahi',
    hireCost: 14_000,
    salary: 1_800,
    hired: false,
  },
  {
    id: 'murat',
    name: 'Murat Şef',
    role: 'vardiya',
    trait: 'sendikaci',
    hireCost: 9_500,
    salary: 1_400,
    hired: false,
  },
];

const RIVAL_TEMPLATES: readonly RivalState[] = [
  {
    id: 'kuzey',
    name: 'Kuzey Enerji',
    cash: 85_000,
    reserves: 7_400,
    workerMorale: 68,
    security: 2,
    intelLevel: 0,
    sabotagedSeconds: 0,
  },
  {
    id: 'mavi',
    name: 'MaviPet',
    cash: 120_000,
    reserves: 10_200,
    workerMorale: 76,
    security: 3,
    intelLevel: 0,
    sabotagedSeconds: 0,
  },
  {
    id: 'bozkir',
    name: 'Bozkır Petrol',
    cash: 64_000,
    reserves: 5_800,
    workerMorale: 57,
    security: 1,
    intelLevel: 0,
    sabotagedSeconds: 0,
  },
];

const GLOBAL_EVENTS: readonly Omit<GlobalEventState, 'remainingSeconds'>[] = [
  {
    id: 'war',
    label: 'Küresel çatışma',
    detail: 'Sevkiyat riski büyüdü; petrol ve toptan yakıt pahalandı.',
    priceMultiplier: 1.62,
    demandMultiplier: 1.12,
  },
  {
    id: 'recession',
    label: 'Ekonomik resesyon',
    detail: 'Tüketim ve petrol fiyatı sert biçimde düştü.',
    priceMultiplier: 0.62,
    demandMultiplier: 0.68,
  },
  {
    id: 'tech',
    label: 'Temiz teknoloji atılımı',
    detail: 'Yeni batarya teknolojisi petrol talebini baskılıyor.',
    priceMultiplier: 0.52,
    demandMultiplier: 0.74,
  },
  {
    id: 'embargo',
    label: 'Ticaret ambargosu',
    detail: 'Yasal arz daraldı; fiyat yükselirken normal talep geriledi.',
    priceMultiplier: 1.44,
    demandMultiplier: 0.84,
  },
  {
    id: 'discovery',
    label: 'Yeni rezerv keşfi',
    detail: 'Küresel arz beklentisi fiyatı aşağı çekti.',
    priceMultiplier: 0.76,
    demandMultiplier: 1.04,
  },
];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function copyWorker(template: WorkerState, raw?: Partial<WorkerState>): WorkerState {
  return {
    ...template,
    hired: raw?.hired === true,
  };
}

function copyRival(template: RivalState, raw?: Partial<RivalState>): RivalState {
  return {
    ...template,
    cash: Math.max(0, finiteOr(raw?.cash, template.cash)),
    reserves: Math.max(0, finiteOr(raw?.reserves, template.reserves)),
    workerMorale: clamp(finiteOr(raw?.workerMorale, template.workerMorale), 0, 100),
    security: clamp(Math.round(finiteOr(raw?.security, template.security)), 0, 5),
    intelLevel: clamp(Math.round(finiteOr(raw?.intelLevel, 0)), 0, 3),
    sabotagedSeconds: Math.max(0, finiteOr(raw?.sabotagedSeconds, 0)),
  };
}

export function createInitialManagementState(): ManagementState {
  return {
    reputation: 55,
    publicSupport: 60,
    carbonIndex: 12,
    spillRisk: 8,
    safetyLevel: 1,
    wageLevel: 1,
    conditionsLevel: 1,
    workerSatisfaction: 62,
    unionPressure: 10,
    strikeSeconds: 0,
    protestSeconds: 0,
    greenwashCooldown: 0,
    spyCooldown: 0,
    rivalPressureSeconds: 0,
    payrollSeconds: GAME_DAY_SECONDS,
    nextStaffIncidentSeconds: 42,
    nextRivalActionSeconds: 38,
    nextRegulationSeconds: 28,
    nextGlobalEventSeconds: 36,
    economyPhase: 0,
    oilPrice: BASE_OIL_PRICE,
    provenReserves: 4_500,
    storedCrude: 0,
    storageCapacity: 300,
    storageLevel: 0,
    blackMarketUnlocked: false,
    blackMarketHeat: 0,
    environmentalTaxesPaid: 0,
    legalFinesPaid: 0,
    totalBlackMarketSales: 0,
    workers: WORKER_TEMPLATES.map((worker) => ({ ...worker })),
    rivals: RIVAL_TEMPLATES.map((rival) => ({ ...rival })),
    activeGlobalEvent: null,
    eventLog: [],
    nextEventId: 1,
  };
}

/** Eski veya kısmi kayıtları güncel yönetim şemasına güvenli biçimde taşır. */
export function normalizeManagementState(input: unknown): ManagementState {
  const fallback = createInitialManagementState();
  const raw =
    typeof input === 'object' && input !== null
      ? input as Record<string, unknown>
      : {};

  const rawWorkers = Array.isArray(raw.workers)
    ? raw.workers.filter(
        (worker): worker is Partial<WorkerState> & { id: string } =>
          typeof worker === 'object' &&
          worker !== null &&
          typeof (worker as { id?: unknown }).id === 'string',
      )
    : [];
  const workers = WORKER_TEMPLATES.map((template) =>
    copyWorker(template, rawWorkers.find((worker) => worker.id === template.id)),
  );

  const rawRivals = Array.isArray(raw.rivals)
    ? raw.rivals.filter(
        (rival): rival is Partial<RivalState> & { id: string } =>
          typeof rival === 'object' &&
          rival !== null &&
          typeof (rival as { id?: unknown }).id === 'string',
      )
    : [];
  const rivals = RIVAL_TEMPLATES.map((template) =>
    copyRival(template, rawRivals.find((rival) => rival.id === template.id)),
  );

  let activeGlobalEvent: GlobalEventState | null = null;
  if (typeof raw.activeGlobalEvent === 'object' && raw.activeGlobalEvent !== null) {
    const rawEvent = raw.activeGlobalEvent as Record<string, unknown>;
    const template = GLOBAL_EVENTS.find((event) => event.id === rawEvent.id);
    if (template !== undefined) {
      activeGlobalEvent = {
        ...template,
        remainingSeconds: Math.max(0, finiteOr(rawEvent.remainingSeconds, 0)),
      };
    }
  }

  const rawLog = Array.isArray(raw.eventLog) ? raw.eventLog : [];
  const eventLog: ManagementEvent[] = rawLog
    .filter(
      (entry): entry is ManagementEvent =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof (entry as { id?: unknown }).id === 'number' &&
        typeof (entry as { title?: unknown }).title === 'string' &&
        typeof (entry as { detail?: unknown }).detail === 'string' &&
        ['info', 'good', 'warning', 'bad'].includes(
          String((entry as { tone?: unknown }).tone),
        ),
    )
    .slice(0, 8);

  return {
    reputation: clamp(finiteOr(raw.reputation, fallback.reputation), 0, 100),
    publicSupport: clamp(finiteOr(raw.publicSupport, fallback.publicSupport), 0, 100),
    carbonIndex: clamp(finiteOr(raw.carbonIndex, fallback.carbonIndex), 0, 100),
    spillRisk: clamp(finiteOr(raw.spillRisk, fallback.spillRisk), 0, 100),
    safetyLevel: clamp(Math.round(finiteOr(raw.safetyLevel, 1)), 0, 5),
    wageLevel: clamp(Math.round(finiteOr(raw.wageLevel, 1)), 0, 5),
    conditionsLevel: clamp(Math.round(finiteOr(raw.conditionsLevel, 1)), 0, 5),
    workerSatisfaction: clamp(
      finiteOr(raw.workerSatisfaction, fallback.workerSatisfaction),
      0,
      100,
    ),
    unionPressure: clamp(finiteOr(raw.unionPressure, fallback.unionPressure), 0, 100),
    strikeSeconds: Math.max(0, finiteOr(raw.strikeSeconds, 0)),
    protestSeconds: Math.max(0, finiteOr(raw.protestSeconds, 0)),
    greenwashCooldown: Math.max(0, finiteOr(raw.greenwashCooldown, 0)),
    spyCooldown: Math.max(0, finiteOr(raw.spyCooldown, 0)),
    rivalPressureSeconds: Math.max(0, finiteOr(raw.rivalPressureSeconds, 0)),
    payrollSeconds: Math.max(1, finiteOr(raw.payrollSeconds, GAME_DAY_SECONDS)),
    nextStaffIncidentSeconds: Math.max(
      2,
      finiteOr(raw.nextStaffIncidentSeconds, fallback.nextStaffIncidentSeconds),
    ),
    nextRivalActionSeconds: Math.max(
      2,
      finiteOr(raw.nextRivalActionSeconds, fallback.nextRivalActionSeconds),
    ),
    nextRegulationSeconds: Math.max(
      2,
      finiteOr(raw.nextRegulationSeconds, fallback.nextRegulationSeconds),
    ),
    nextGlobalEventSeconds: Math.max(
      2,
      finiteOr(raw.nextGlobalEventSeconds, fallback.nextGlobalEventSeconds),
    ),
    economyPhase: finiteOr(raw.economyPhase, 0),
    oilPrice: clamp(finiteOr(raw.oilPrice, BASE_OIL_PRICE), 20, 180),
    provenReserves: Math.max(0, finiteOr(raw.provenReserves, fallback.provenReserves)),
    storedCrude: Math.max(
      0,
      Math.min(
        finiteOr(raw.storageCapacity, fallback.storageCapacity),
        finiteOr(raw.storedCrude, 0),
      ),
    ),
    storageCapacity: Math.max(
      fallback.storageCapacity,
      finiteOr(raw.storageCapacity, fallback.storageCapacity),
    ),
    storageLevel: clamp(Math.round(finiteOr(raw.storageLevel, 0)), 0, 8),
    blackMarketUnlocked: raw.blackMarketUnlocked === true,
    blackMarketHeat: clamp(finiteOr(raw.blackMarketHeat, 0), 0, 100),
    environmentalTaxesPaid: Math.max(0, finiteOr(raw.environmentalTaxesPaid, 0)),
    legalFinesPaid: Math.max(0, finiteOr(raw.legalFinesPaid, 0)),
    totalBlackMarketSales: Math.max(0, finiteOr(raw.totalBlackMarketSales, 0)),
    workers,
    rivals,
    activeGlobalEvent,
    eventLog,
    nextEventId: Math.max(1, Math.floor(finiteOr(raw.nextEventId, 1))),
  };
}

export class ManagementSystem {
  onEvent: ((event: ManagementEvent) => void) | null = null;
  onChanged: (() => void) | null = null;

  constructor(private readonly data: PlayerData) {}

  get state(): ManagementState {
    return this.data.management;
  }

  get isOnStrike(): boolean {
    return this.state.strikeSeconds > 0;
  }

  get isProtestActive(): boolean {
    return this.state.protestSeconds > 0;
  }

  get wholesaleMultiplier(): number {
    return clamp(this.state.oilPrice / BASE_OIL_PRICE, 0.45, 2.4);
  }

  get customerDemandMultiplier(): number {
    const eventDemand = this.state.activeGlobalEvent?.demandMultiplier ?? 1;
    const support = 0.72 + this.state.publicSupport / 250;
    const protest = this.isProtestActive ? 0.58 : 1;
    const priceWar = this.state.rivalPressureSeconds > 0 ? 0.78 : 1;
    return clamp(eventDemand * support * protest * priceWar, 0.22, 1.35);
  }

  get offlineMultiplier(): number {
    if (this.isOnStrike) return 0;
    const staffBonus = 0.78 + this.hiredWorkers.length * 0.08;
    return staffBonus * (this.isProtestActive ? 0.6 : 1);
  }

  get hiredWorkers(): readonly WorkerState[] {
    return this.state.workers.filter((worker) => worker.hired);
  }

  get payrollCost(): number {
    const wageMultiplier = 0.82 + this.state.wageLevel * 0.18;
    return Math.round(
      this.hiredWorkers.reduce((total, worker) => total + worker.salary, 0) *
        wageMultiplier,
    );
  }

  get crudeBatch(): number {
    return CRUDE_BATCH;
  }

  get blackMarketUnlockCost(): number {
    return BLACK_MARKET_UNLOCK_COST;
  }

  get greenwashingCost(): number {
    return 5_000;
  }

  cleanupCost(): number {
    return Math.round(3_000 + this.state.spillRisk * 65);
  }

  spyOperationCost(operation: SpyOperation): number {
    return operation === 'intel' ? 4_000 : 7_000;
  }

  crudeTradeValue(multiplier = 1): number {
    return Math.round(this.state.oilPrice * CRUDE_BATCH * multiplier);
  }

  storageUpgradeCost(): number {
    return 12_000 * (this.state.storageLevel + 1);
  }

  policyUpgradeCost(kind: 'safety' | 'wage' | 'conditions'): number {
    const level =
      kind === 'safety'
        ? this.state.safetyLevel
        : kind === 'wage'
          ? this.state.wageLevel
          : this.state.conditionsLevel;
    return 3_500 + level * level * 2_100;
  }

  tick(deltaSeconds: number): void {
    if (!(deltaSeconds > 0)) return;
    const state = this.state;

    state.strikeSeconds = Math.max(0, state.strikeSeconds - deltaSeconds);
    state.protestSeconds = Math.max(0, state.protestSeconds - deltaSeconds);
    state.greenwashCooldown = Math.max(0, state.greenwashCooldown - deltaSeconds);
    state.spyCooldown = Math.max(0, state.spyCooldown - deltaSeconds);
    state.rivalPressureSeconds = Math.max(
      0,
      state.rivalPressureSeconds - deltaSeconds,
    );
    state.blackMarketHeat = Math.max(
      0,
      state.blackMarketHeat - deltaSeconds * 0.055,
    );
    state.carbonIndex = Math.max(
      0,
      state.carbonIndex - deltaSeconds * (0.025 + state.safetyLevel * 0.004),
    );
    state.spillRisk = Math.max(
      0,
      state.spillRisk - deltaSeconds * (0.035 + state.safetyLevel * 0.012),
    );

    this.updateWorkerRelations(deltaSeconds);
    this.updateProduction(deltaSeconds);
    this.updateEconomy(deltaSeconds);
    this.updateRivals(deltaSeconds);
    this.updateRegulation(deltaSeconds);
    this.updateStaffEvents(deltaSeconds);
    this.updatePayroll(deltaSeconds);
  }

  recordFuelSale(liters: number): void {
    if (!(liters > 0)) return;
    this.state.carbonIndex = clamp(
      this.state.carbonIndex + liters * 0.31,
      0,
      100,
    );
  }

  recordRestock(liters: number): void {
    if (!(liters > 0)) return;
    const state = this.state;
    state.carbonIndex = clamp(state.carbonIndex + liters * 0.018, 0, 100);
    state.spillRisk = clamp(
      state.spillRisk + Math.max(1.5, 5.5 - state.safetyLevel * 0.72),
      0,
      100,
    );

    const spillChance = Math.max(0.025, 0.14 - state.safetyLevel * 0.022);
    if (Math.random() < spillChance) {
      state.spillRisk = clamp(state.spillRisk + 24, 0, 100);
      state.publicSupport = clamp(state.publicSupport - 12, 0, 100);
      state.reputation = clamp(state.reputation - 8, 0, 100);
      this.emit(
        'Yakıt sızıntısı',
        'Tanker bağlantısındaki kaçak çevre riskini ve denetim ihtimalini artırdı.',
        'bad',
      );
    }
  }

  hireWorker(workerId: string): ManagementActionResult {
    const worker = this.state.workers.find((candidate) => candidate.id === workerId);
    if (worker === undefined) return this.fail('Personel bulunamadı.');
    if (worker.hired) return this.fail(`${worker.name} zaten ekipte.`);
    if (!this.spend(worker.hireCost)) return this.fail('İşe alım için para yetersiz.');

    worker.hired = true;
    this.state.workerSatisfaction = clamp(
      this.state.workerSatisfaction + 5,
      0,
      100,
    );
    this.emit(
      'Yeni personel',
      `${worker.name} ekibe katıldı; günlük maaşı ₺${worker.salary}.`,
      'good',
    );
    this.changed();
    return this.ok(`${worker.name} işe alındı.`);
  }

  upgradePolicy(
    kind: 'safety' | 'wage' | 'conditions',
  ): ManagementActionResult {
    const state = this.state;
    const current =
      kind === 'safety'
        ? state.safetyLevel
        : kind === 'wage'
          ? state.wageLevel
          : state.conditionsLevel;
    if (current >= 5) return this.fail('Bu politika zaten en yüksek seviyede.');
    const cost = this.policyUpgradeCost(kind);
    if (!this.spend(cost)) return this.fail('Politika yatırımı için para yetersiz.');

    if (kind === 'safety') {
      state.safetyLevel += 1;
      state.spillRisk = Math.max(0, state.spillRisk - 9);
    } else if (kind === 'wage') {
      state.wageLevel += 1;
    } else {
      state.conditionsLevel += 1;
    }
    state.workerSatisfaction = clamp(state.workerSatisfaction + 9, 0, 100);
    state.unionPressure = Math.max(0, state.unionPressure - 12);
    this.emit(
      'Çalışma politikası',
      kind === 'safety'
        ? 'Güvenlik ekipmanı yenilendi; kaza ve sızıntı riski azaldı.'
        : kind === 'wage'
          ? 'Maaş skalası yükseldi; sonraki bordro maliyeti de artacak.'
          : 'Vardiya koşulları iyileştirildi; memnuniyet yükseldi.',
      'good',
    );
    this.changed();
    return this.ok('Politika seviyesi yükseltildi.');
  }

  runGreenwashingCampaign(): ManagementActionResult {
    const state = this.state;
    const cost = this.greenwashingCost;
    if (state.greenwashCooldown > 0) {
      return this.fail('Kampanyanın etkisi sürüyor; yeniden kullanmak için bekle.');
    }
    if (!this.spend(cost)) return this.fail('Kampanya bütçesi yetersiz.');

    state.publicSupport = clamp(state.publicSupport + 22, 0, 100);
    state.reputation = clamp(state.reputation + 9, 0, 100);
    state.greenwashCooldown = 60;
    this.emit(
      'Yeşil imaj kampanyası',
      'Halk desteği arttı fakat karbon ve sızıntı değerleri değişmedi.',
      'warning',
    );
    this.changed();
    return this.ok('Kampanya yayına girdi; gerçek çevre yükü aynı kaldı.');
  }

  fundCleanup(): ManagementActionResult {
    const state = this.state;
    const cost = this.cleanupCost();
    if (!this.spend(cost)) return this.fail('Temizlik bütçesi yetersiz.');

    state.spillRisk = Math.max(0, state.spillRisk - 38);
    state.publicSupport = clamp(state.publicSupport + 10, 0, 100);
    state.reputation = clamp(state.reputation + 7, 0, 100);
    this.emit(
      'Çevre temizliği',
      'Kirlenmiş alan temizlendi; sızıntı riski ve halk tepkisi azaldı.',
      'good',
    );
    this.changed();
    return this.ok('Temizlik ekibi görevlendirildi.');
  }

  runSpyOperation(
    rivalId: string,
    operation: SpyOperation,
  ): ManagementActionResult {
    const state = this.state;
    const rival = state.rivals.find((candidate) => candidate.id === rivalId);
    if (rival === undefined) return this.fail('Rakip şirket bulunamadı.');
    if (state.spyCooldown > 0) return this.fail('Casus ağı yeniden hazırlanıyor.');

    const cost = this.spyOperationCost(operation);
    if (!this.spend(cost)) return this.fail('Operasyon bütçesi yetersiz.');

    state.spyCooldown = operation === 'intel' ? 28 : 42;
    const geologistBonus = this.hiredWorkers.some((worker) => worker.trait === 'dahi')
      ? 0.1
      : 0;
    const baseChance = operation === 'intel' ? 0.82 : 0.64;
    const successChance = clamp(
      baseChance + geologistBonus - rival.security * 0.09,
      0.18,
      0.9,
    );

    if (Math.random() <= successChance) {
      if (operation === 'intel') {
        rival.intelLevel = 3;
        this.emit(
          'Rezerv istihbaratı',
          `${rival.name} için ${Math.round(rival.reserves)} varil rezerv doğrulandı.`,
          'good',
        );
        this.changed();
        return this.ok('Casus rezerv kayıtlarını ele geçirdi.');
      }

      rival.sabotagedSeconds = 48;
      rival.workerMorale = clamp(rival.workerMorale - 28, 0, 100);
      state.reputation = clamp(state.reputation - 4, 0, 100);
      state.blackMarketHeat = clamp(state.blackMarketHeat + 8, 0, 100);
      this.emit(
        'Rakipte grev',
        `${rival.name} işçileri greve çıktı; üretim geçici olarak durdu.`,
        'warning',
      );
      this.changed();
      return this.ok('Sabotaj başarılı; rakip üretimi durdu.');
    }

    state.reputation = clamp(state.reputation - (operation === 'intel' ? 3 : 9), 0, 100);
    state.blackMarketHeat = clamp(state.blackMarketHeat + 14, 0, 100);
    rival.security = clamp(rival.security + 1, 0, 5);
    this.emit(
      'Casus yakalandı',
      `${rival.name} operasyonu fark etti; güvenliği ve hukuki risk yükseldi.`,
      'bad',
    );
    this.changed();
    return this.fail('Operasyon başarısız; casus ağı açığa çıktı.');
  }

  buildStorageTank(): ManagementActionResult {
    const state = this.state;
    if (state.storageLevel >= 8) return this.fail('Depolama sahası azami kapasitede.');
    const cost = this.storageUpgradeCost();
    if (!this.spend(cost)) return this.fail('Yeni tank için para yetersiz.');

    state.storageLevel += 1;
    state.storageCapacity += 1_500 + state.storageLevel * 250;
    state.spillRisk = clamp(state.spillRisk + 3, 0, 100);
    this.emit(
      'Yeni ham petrol tankı',
      `Toplam depolama kapasitesi ${Math.round(state.storageCapacity)} varile çıktı.`,
      'good',
    );
    this.changed();
    return this.ok('Depolama tankı kuruldu.');
  }

  buyCrude(): ManagementActionResult {
    const state = this.state;
    const availableSpace = state.storageCapacity - state.storedCrude;
    if (availableSpace < CRUDE_BATCH) return this.fail('Ham petrol tanklarında yer yok.');
    const cost = Math.round(state.oilPrice * CRUDE_BATCH);
    if (!this.spend(cost)) return this.fail('Ham petrol alımı için para yetersiz.');

    state.storedCrude += CRUDE_BATCH;
    state.carbonIndex = clamp(state.carbonIndex + 1.8, 0, 100);
    this.changed();
    return this.ok(`${CRUDE_BATCH} varil düşük fiyatlı stok alındı.`);
  }

  sellCrude(): ManagementActionResult {
    const state = this.state;
    if (state.storedCrude < CRUDE_BATCH) return this.fail('Satılacak ham petrol yok.');
    const revenue = Math.round(state.oilPrice * CRUDE_BATCH);
    state.storedCrude -= CRUDE_BATCH;
    this.earn(revenue);
    this.changed();
    return this.ok(`${CRUDE_BATCH} varil yasal piyasada satıldı: ₺${revenue}.`);
  }

  unlockBlackMarket(): ManagementActionResult {
    const state = this.state;
    if (state.blackMarketUnlocked) return this.fail('Kara borsa ağı zaten açık.');
    if (!this.spend(BLACK_MARKET_UNLOCK_COST)) {
      return this.fail('Gizli ağı kurmak için para yetersiz.');
    }
    state.blackMarketUnlocked = true;
    state.blackMarketHeat = 12;
    state.reputation = clamp(state.reputation - 5, 0, 100);
    this.emit(
      'Kara borsa ağı',
      'Yüksek kârlı gizli satışlar açıldı; yakalanma riski her işlemde büyür.',
      'warning',
    );
    this.changed();
    return this.ok('Gizli ticaret ağı kuruldu.');
  }

  sellOnBlackMarket(): ManagementActionResult {
    const state = this.state;
    if (!state.blackMarketUnlocked) return this.fail('Önce kara borsa ağını kur.');
    if (state.storedCrude < CRUDE_BATCH) return this.fail('Gizli satış için stok yetersiz.');

    state.storedCrude -= CRUDE_BATCH;
    const revenue = Math.round(state.oilPrice * CRUDE_BATCH * 1.65);
    const caughtChance = clamp(0.1 + state.blackMarketHeat / 170, 0.1, 0.72);
    state.blackMarketHeat = clamp(state.blackMarketHeat + 17, 0, 100);
    state.totalBlackMarketSales += revenue;

    if (Math.random() < caughtChance) {
      const fine = Math.round(revenue * 1.4 + 4_000);
      this.data.money = Math.max(0, this.data.money - fine);
      state.legalFinesPaid += fine;
      state.reputation = clamp(state.reputation - 18, 0, 100);
      state.publicSupport = clamp(state.publicSupport - 20, 0, 100);
      state.protestSeconds = Math.max(state.protestSeconds, 35);
      this.emit(
        'Kaçak satış yakalandı',
        `Gelire el kondu ve ₺${fine} ceza kesildi; protestocular kapıda.`,
        'bad',
      );
      this.changed();
      return this.fail('Gizli sevkiyat yakalandı.');
    }

    this.earn(revenue);
    state.reputation = clamp(state.reputation - 2, 0, 100);
    this.emit(
      'Gizli sevkiyat',
      `${CRUDE_BATCH} varil iz bırakmadan satıldı; ₺${revenue} kasaya girdi.`,
      'warning',
    );
    this.changed();
    return this.ok(`Kara borsa satışı: ₺${revenue}.`);
  }

  private updateWorkerRelations(deltaSeconds: number): void {
    const state = this.state;
    const foremanBonus = this.hiredWorkers.some((worker) => worker.trait === 'sendikaci')
      ? 8
      : 0;
    const target =
      28 +
      state.wageLevel * 10 +
      state.safetyLevel * 7 +
      state.conditionsLevel * 8 +
      foremanBonus;
    const approach = Math.min(1, deltaSeconds * 0.035);
    state.workerSatisfaction += (clamp(target, 0, 100) - state.workerSatisfaction) * approach;

    if (state.workerSatisfaction < 45) {
      state.unionPressure = clamp(
        state.unionPressure + deltaSeconds * (0.28 + (45 - state.workerSatisfaction) * 0.018),
        0,
        100,
      );
    } else {
      const reduction = foremanBonus > 0 ? 0.23 : 0.1;
      state.unionPressure = Math.max(0, state.unionPressure - deltaSeconds * reduction);
    }

    if (
      state.strikeSeconds <= 0 &&
      state.unionPressure >= 100 &&
      this.hiredWorkers.length > 0
    ) {
      state.strikeSeconds = 45;
      state.unionPressure = 48;
      state.workerSatisfaction = Math.max(18, state.workerSatisfaction - 12);
      this.emit(
        'Sendika grevi',
        'Maaş, güvenlik ve koşul talepleri karşılanmadı; üretim tamamen durdu.',
        'bad',
      );
    }
  }

  private updateProduction(deltaSeconds: number): void {
    const state = this.state;
    if (this.isOnStrike || this.hiredWorkers.length === 0) return;
    if (state.provenReserves <= 0 || state.storedCrude >= state.storageCapacity) return;

    const geniusBonus = this.hiredWorkers.some((worker) => worker.trait === 'dahi')
      ? 1.35
      : 1;
    const safetyEfficiency = 0.78 + state.safetyLevel * 0.055;
    const produced = Math.min(
      state.provenReserves,
      state.storageCapacity - state.storedCrude,
      this.hiredWorkers.length *
        PRODUCTION_PER_WORKER_PER_SECOND *
        geniusBonus *
        safetyEfficiency *
        deltaSeconds,
    );
    state.provenReserves -= produced;
    state.storedCrude += produced;
    state.carbonIndex = clamp(state.carbonIndex + produced * 0.016, 0, 100);
  }

  private updateEconomy(deltaSeconds: number): void {
    const state = this.state;
    state.economyPhase += deltaSeconds * 0.045;
    const eventMultiplier = state.activeGlobalEvent?.priceMultiplier ?? 1;
    const naturalPrice =
      BASE_OIL_PRICE +
      Math.sin(state.economyPhase) * 6 +
      Math.sin(state.economyPhase * 0.37) * 4;
    const target = naturalPrice * eventMultiplier;
    state.oilPrice += (target - state.oilPrice) * Math.min(1, deltaSeconds * 0.22);

    const event = state.activeGlobalEvent;
    if (event !== null) {
      event.remainingSeconds = Math.max(0, event.remainingSeconds - deltaSeconds);
      if (event.remainingSeconds <= 0) {
        this.emit(
          'Küresel piyasa dengelendi',
          `${event.label} sona erdi; petrol fiyatı normal banda dönüyor.`,
          'info',
        );
        state.activeGlobalEvent = null;
        state.nextGlobalEventSeconds = randomBetween(34, 58);
      }
      return;
    }

    state.nextGlobalEventSeconds -= deltaSeconds;
    if (state.nextGlobalEventSeconds > 0) return;
    const template =
      GLOBAL_EVENTS[Math.floor(Math.random() * GLOBAL_EVENTS.length)] ??
      GLOBAL_EVENTS[0];
    if (template === undefined) return;
    state.activeGlobalEvent = {
      ...template,
      remainingSeconds: randomBetween(32, 54),
    };
    this.emit(template.label, template.detail, 'warning');
  }

  private updateRivals(deltaSeconds: number): void {
    const state = this.state;
    for (const rival of state.rivals) {
      rival.sabotagedSeconds = Math.max(0, rival.sabotagedSeconds - deltaSeconds);
      if (rival.sabotagedSeconds > 0 || rival.reserves <= 0) continue;
      const production = Math.min(rival.reserves, deltaSeconds * (0.18 + rival.security * 0.025));
      rival.reserves -= production;
      rival.cash += production * state.oilPrice;
      rival.workerMorale += (68 - rival.workerMorale) * Math.min(1, deltaSeconds * 0.008);
    }

    state.nextRivalActionSeconds -= deltaSeconds;
    if (state.nextRivalActionSeconds > 0) return;
    state.nextRivalActionSeconds = randomBetween(38, 66);
    const rival = state.rivals[Math.floor(Math.random() * state.rivals.length)];
    if (rival === undefined) return;

    if (Math.random() < 0.5 || this.hiredWorkers.length === 0) {
      state.rivalPressureSeconds = 32;
      this.emit(
        'Rakip fiyat savaşı',
        `${rival.name} istasyon fiyatlarını kırdı; müşteri talebi geçici olarak düştü.`,
        'warning',
      );
      return;
    }

    state.unionPressure = clamp(state.unionPressure + 18, 0, 100);
    state.workerSatisfaction = clamp(state.workerSatisfaction - 6, 0, 100);
    this.emit(
      'Rakip işçi avı',
      `${rival.name} ekibine daha yüksek maaş teklif ediyor; sendika baskısı arttı.`,
      'warning',
    );
  }

  private updateRegulation(deltaSeconds: number): void {
    const state = this.state;
    state.nextRegulationSeconds -= deltaSeconds;
    if (state.nextRegulationSeconds > 0) return;
    // Kasa boşken yeni ceza uyarısı üretmek oyuncuya toparlanma alanı bırakmaz.
    // Borç sistemi olmadığı için sıfır bakiyede tahsil edilecek bir şey de yok.
    if (this.data.money <= 0) {
      state.nextRegulationSeconds = randomBetween(
        REGULATION_RECOVERY_MIN_SECONDS,
        REGULATION_RECOVERY_MAX_SECONDS,
      );
      return;
    }
    state.nextRegulationSeconds = randomBetween(
      REGULATION_CHECK_MIN_SECONDS,
      REGULATION_CHECK_MAX_SECONDS,
    );

    const carbonViolation = state.carbonIndex >= 82;
    const spillViolation = state.spillRisk >= 68;
    if (!carbonViolation && !spillViolation) {
      if (state.carbonIndex < 42) return;
      const tax = Math.round(350 + state.carbonIndex * 14);
      const paid = this.collectRegulationPayment(tax, 0.18);
      if (paid <= 0) {
        state.nextRegulationSeconds = randomBetween(
          REGULATION_RECOVERY_MIN_SECONDS,
          REGULATION_RECOVERY_MAX_SECONDS,
        );
        return;
      }
      state.environmentalTaxesPaid += paid;
      this.emit(
        'Karbon vergisi',
        `Orta düzey salım için ₺${paid} çevre vergisi tahsil edildi.`,
        'warning',
      );
      return;
    }

    const fine = Math.round(
      1_200 +
      state.carbonIndex * (carbonViolation ? 34 : 10) +
      state.spillRisk * (spillViolation ? 42 : 8),
    );
    const paid = this.collectRegulationPayment(fine, 0.32);
    if (paid <= 0) {
      state.nextRegulationSeconds = randomBetween(
        REGULATION_RECOVERY_MIN_SECONDS,
        REGULATION_RECOVERY_MAX_SECONDS,
      );
      return;
    }
    const severity = paid / Math.max(1, fine);
    state.legalFinesPaid += paid;
    state.publicSupport = clamp(
      state.publicSupport - Math.max(2, Math.round(7 * severity)),
      0,
      100,
    );
    state.reputation = clamp(
      state.reputation - Math.max(2, Math.round(5 * severity)),
      0,
      100,
    );
    state.protestSeconds = Math.max(state.protestSeconds, 18);
    state.carbonIndex = Math.max(0, state.carbonIndex - 10);
    state.spillRisk = Math.max(0, state.spillRisk - 8);
    this.emit(
      'Çevre cezası',
      `Yüksek ${spillViolation ? 'sızıntı riski' : 'karbon salımı'} nedeniyle ₺${paid} tahsil edildi.`,
      'bad',
    );
  }

  /** Denetim tahsilatı kasayı sıfırlamaz; oyuncu hizmet vererek toparlanabilir. */
  private collectRegulationPayment(due: number, maximumCashShare: number): number {
    const cash = Math.max(0, this.data.money);
    const affordable = Math.floor(cash * clamp(maximumCashShare, 0, 1));
    const paid = Math.min(Math.max(0, Math.round(due)), affordable);
    this.data.money = Math.max(0, cash - paid);
    return paid;
  }

  private updateStaffEvents(deltaSeconds: number): void {
    const state = this.state;
    state.nextStaffIncidentSeconds -= deltaSeconds;
    if (state.nextStaffIncidentSeconds > 0 || this.hiredWorkers.length === 0) return;
    state.nextStaffIncidentSeconds = randomBetween(34, 62);

    const drunkEngineer = this.hiredWorkers.find((worker) => worker.trait === 'sarhos');
    if (drunkEngineer !== undefined && Math.random() < 0.52) {
      const damage = Math.round(2_500 + randomBetween(0, 3_500));
      this.data.money = Math.max(0, this.data.money - damage);
      state.spillRisk = clamp(state.spillRisk + 19, 0, 100);
      state.workerSatisfaction = clamp(state.workerSatisfaction - 9, 0, 100);
      this.emit(
        'Mühendis kazası',
        `${drunkEngineer.name} vardiyaya alkollü geldi; ₺${damage} hasar ve sızıntı riski oluştu.`,
        'bad',
      );
      return;
    }

    const genius = this.hiredWorkers.find((worker) => worker.trait === 'dahi');
    if (genius !== undefined && Math.random() < 0.72) {
      const discovery = Math.round(randomBetween(650, 1_250));
      state.provenReserves += discovery;
      this.emit(
        'Gizli rezerv bulundu',
        `${genius.name} jeolojik verilerde ${discovery} varillik yeni saha belirledi.`,
        'good',
      );
    }
  }

  private updatePayroll(deltaSeconds: number): void {
    const state = this.state;
    if (this.hiredWorkers.length === 0) {
      state.payrollSeconds = GAME_DAY_SECONDS;
      return;
    }
    state.payrollSeconds -= deltaSeconds;
    if (state.payrollSeconds > 0) return;
    state.payrollSeconds += GAME_DAY_SECONDS;

    const cost = this.payrollCost;
    if (this.data.money >= cost) {
      this.data.money -= cost;
      state.workerSatisfaction = clamp(state.workerSatisfaction + 4, 0, 100);
      this.emit('Maaş günü', `₺${cost} bordro zamanında ödendi.`, 'info');
      return;
    }

    const paid = Math.max(0, this.data.money);
    this.data.money = 0;
    state.workerSatisfaction = clamp(state.workerSatisfaction - 22, 0, 100);
    state.unionPressure = clamp(state.unionPressure + 32, 0, 100);
    this.emit(
      'Eksik maaş',
      `₺${cost} bordronun yalnızca ₺${Math.round(paid)} kadarı ödenebildi.`,
      'bad',
    );
  }

  private spend(cost: number): boolean {
    if (!(cost >= 0) || this.data.money < cost) return false;
    this.data.money -= cost;
    return true;
  }

  private earn(amount: number): void {
    if (!(amount > 0)) return;
    this.data.money += amount;
    this.data.totalEarned += amount;
  }

  private emit(
    title: string,
    detail: string,
    tone: ManagementEventTone,
  ): void {
    const event: ManagementEvent = {
      id: this.state.nextEventId,
      title,
      detail,
      tone,
    };
    this.state.nextEventId += 1;
    this.state.eventLog.unshift(event);
    this.state.eventLog.length = Math.min(8, this.state.eventLog.length);
    this.onEvent?.(event);
  }

  private changed(): void {
    this.onChanged?.();
  }

  private ok(message: string): ManagementActionResult {
    return { ok: true, message };
  }

  private fail(message: string): ManagementActionResult {
    return { ok: false, message };
  }
}
