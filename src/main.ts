import './style.css';

import { SoundManager } from './audio/sound';
import { findFuel } from './game/fuel';
import { formatMoney } from './game/format';
import { Station } from './game/station';
import { World } from './scene/world';
import { Hud } from './ui/hud';

/** Sekme arkadayken biriken devasa dt'nin tek karede işlenmesini engeller. */
const MAX_FRAME_DELTA = 0.1;

const viewport = document.getElementById('viewport');
if (viewport === null) throw new Error('#viewport bulunamadı');

const station = new Station();
const world = new World(viewport);
const hud = new Hud(station);
const sound = new SoundManager();
world.setTrafficSide(station.trafficSide);
world.setMarketBuilt(station.marketBuilt);
world.setStorageLevel(station.management.state.storageLevel);

// Web Audio yalnızca kullanıcı hareketinden sonra başlayabilir.
window.addEventListener('pointerdown', () => sound.unlock(), { once: true });

// Müşteriler görünmez biçimde üretilmez: ana yoldan geçen gerçek bir NPC araç
// girişe ulaştığında istasyon, boş pompa varsa o aracı devralır.
world.onTrafficCarAtEntrance = (color) => station.acceptTrafficCar(color);
world.onFuelRescueAtEntrance = (color) => station.acceptFuelRescueCar(color);
world.onRescueCarDelivered = (car) => {
  station.completeRescueDelivery(car);
};
world.onFuelDeliveryComplete = (fuel) => {
  const liters = station.completeRestock(fuel);
  hud.showFuelDeliveryComplete(fuel, liters);
};
world.onTrafficHorn = () => sound.horn('traffic');
world.onBassMusic = (active) => sound.bass(active);
world.onEmergencySiren = (active) => sound.siren(active);
station.canAdvanceCar = (car, nextProgress, cars) =>
  world.canAdvanceStationCar(car, nextProgress, cars.values());

// --- Geri bildirim ---

station.onServed = (car) => {
  sound.cash();
  const screen = world.carScreenPosition(car);
  if (screen === null) return;

  // Pompacı komisyon kestiyse kasaya giren net tutar gösterilir.
  hud.spawnFloater(
    car.autoServed
      ? `+${formatMoney(car.payout)} · pompacı`
      : `+${formatMoney(car.payout)}`,
    screen.x,
    screen.y,
  );
  if (car.wastedLiters > 0.01) {
    const wastedCost = Math.round(car.wastedLiters * findFuel(car.fuel).wholesalePerLiter);
    hud.spawnFloater(
      `-${formatMoney(wastedCost)} fazla yakıt`,
      screen.x,
      screen.y + 24,
      true,
    );
  }
};

station.onArrived = () => {
  sound.horn('arrival');
};

station.onMarketSale = (car, sale) => {
  const screen = world.carScreenPosition(car);
  if (screen === null) return;
  hud.spawnFloater(
    `${sale.item.icon} +${formatMoney(sale.price)}`,
    screen.x,
    screen.y - 24,
  );
};

station.onManagementEvent = (event) => {
  hud.showManagementEvent(event);
};

station.onMissed = (car) => {
  const screen = world.carScreenPosition(car);
  if (screen !== null) hud.spawnFloater('Müşteri kaçtı', screen.x, screen.y, true);

  // Panel o araba için açıksa artık anlamsız — kapat.
  if (hud.openSlotIndex === car.slotIndex) hud.closeSheets();
};

// --- Giriş ---

const CAR_HOLD_DELAY_MS = 170;
const CAR_HOLD_MOVE_TOLERANCE = 12;

interface PendingCarHold {
  readonly pointerId: number;
  readonly slotIndex: number;
  readonly startX: number;
  readonly startY: number;
  timer: number;
  moved: boolean;
  directStarted: boolean;
}

let pendingCarHold: PendingCarHold | null = null;

function clearPendingCarHold(): PendingCarHold | null {
  const pending = pendingCarHold;
  if (pending === null) return null;
  clearTimeout(pending.timer);
  pendingCarHold = null;
  return pending;
}

world.renderer.domElement.addEventListener('pointerdown', (event) => {
  const previousHold = clearPendingCarHold();
  if (previousHold?.directStarted) hud.cancelDirectFill();

  // İkinci parmak indiyse kullanıcı yakınlaştırıyor demektir; dolum başlatma.
  if (world.isGesturing) return;

  const target = world.pickTarget(event.clientX, event.clientY);
  if (target === null) {
    hud.closeSheets();
    return;
  }

  if (target.kind === 'market') {
    hud.openPricingSheet();
    return;
  }

  if (!station.isUnlocked(target.slotIndex)) {
    hud.openUnlockSheet(target.slotIndex);
    return;
  }

  const car = station.carAt(target.slotIndex);
  if (car !== undefined && car.phase === 'waiting') {
    if (target.kind === 'car' && event.isPrimary) {
      world.renderer.domElement.setPointerCapture(event.pointerId);
      const pending: PendingCarHold = {
        pointerId: event.pointerId,
        slotIndex: target.slotIndex,
        startX: event.clientX,
        startY: event.clientY,
        timer: 0,
        moved: false,
        directStarted: false,
      };
      pending.timer = window.setTimeout(() => {
        if (pendingCarHold !== pending || pending.moved) return;
        const liveCar = station.carAt(pending.slotIndex);
        if (liveCar?.phase !== 'waiting') return;
        pending.directStarted = true;
        hud.beginDirectFill(liveCar);
        navigator.vibrate?.(14);
      }, CAR_HOLD_DELAY_MS);
      pendingCarHold = pending;
      return;
    }

    hud.openServeSheet(car);
    return;
  }

  // Boş pompaya dokunmak bir şey yapmaz; açık paneli kapatalım.
  hud.closeSheets();
});

world.renderer.domElement.addEventListener('pointermove', (event) => {
  const pending = pendingCarHold;
  if (pending === null || pending.pointerId !== event.pointerId) return;

  const distance = Math.hypot(event.clientX - pending.startX, event.clientY - pending.startY);
  if (distance <= CAR_HOLD_MOVE_TOLERANCE) return;

  // Parmak kaydı: bu bir dokunma değil, harita kaydırma. Başlamış dolumu da kes.
  if (pending.directStarted) {
    clearPendingCarHold();
    hud.cancelDirectFill();
    return;
  }

  pending.moved = true;
  clearTimeout(pending.timer);
});

world.renderer.domElement.addEventListener('pointerup', (event) => {
  const pending = pendingCarHold;
  if (pending === null || pending.pointerId !== event.pointerId) return;
  clearPendingCarHold();

  if (pending.directStarted) {
    hud.endDirectFill();
  } else if (!pending.moved) {
    const car = station.carAt(pending.slotIndex);
    if (car?.phase === 'waiting') hud.openServeSheet(car);
  }
});

world.renderer.domElement.addEventListener('pointercancel', (event) => {
  const pending = pendingCarHold;
  if (pending === null || pending.pointerId !== event.pointerId) return;
  clearPendingCarHold();
  if (pending.directStarted) hud.cancelDirectFill();
});

hud.onServe = (slotIndex, fuel, amount) => {
  const car = station.carAt(slotIndex);
  const result = station.serve(slotIndex, fuel, amount);

  if (car === undefined) return;

  const screen = world.carScreenPosition(car);
  if (screen === null) return;
  if (result === 'wrong') hud.spawnFloater('Yanlış servis!', screen.x, screen.y, true);
  if (result === 'out-of-stock') hud.spawnFloater('Depo boş!', screen.x, screen.y, true);
  if (result === 'restocking') {
    hud.spawnFloater('Tanker dolumu sürüyor!', screen.x, screen.y, true);
  }
};

hud.onUnlock = (slotIndex) => {
  station.tryUnlockSlot(slotIndex);
};

world.renderer.domElement.addEventListener('dblclick', () => {
  world.resetView();
});

hud.onTrafficSide = (side) => {
  if (!station.setTrafficSide(side)) return;
  world.setTrafficSide(side);
};

hud.onRestock = (fuel) => {
  if (world.isFuelDeliveryActive) return 'busy';
  const result = station.tryRestock(fuel);
  if (result === 'ok') world.startFuelDelivery(fuel);
  return result;
};
hud.onBuildMarket = () => {
  const result = station.tryBuildMarket();
  if (result === 'ok') world.setMarketBuilt(true, true);
  return result;
};

// --- Gece vardiyası ---

const startupReport = station.resume();
if (startupReport !== null) hud.showOffline(startupReport);
const pendingRestock = station.pendingRestockFuels[0];
if (pendingRestock !== undefined) world.startFuelDelivery(pendingRestock);

// --- Ana döngü ---

let lastFrameTime = performance.now();

/** Tek bir kare: oyun mantığını ilerlet, sahneyi ve arayüzü tazele. */
function step(delta: number): void {
  // Panel açıkken dünya donar ama sahne çizilmeye ve arayüz güncellenmeye
  // devam eder; böylece panel içindeki değerler canlı kalır.
  if (!hud.isGamePaused) {
    world.updateTraffic(delta);
    station.tick(delta, hud.activeServiceSlotIndex);
    world.setDayPhase(station.dayPhase);

    // Gece yarısını geçtiysek günü kapat; panel açılınca döngü kendiliğinden durur.
    const dayReport = station.takeDayReport();
    if (dayReport !== null) hud.showDaySummary(dayReport);
  }
  world.setProtestActive(station.management.isProtestActive);
  world.setStorageLevel(station.management.state.storageLevel);

  for (const slot of station.slots) {
    world.islands.get(slot.index)?.setUnlocked(station.isUnlocked(slot.index));
  }

  world.syncCars(station.cars.values());
  world.render();

  hud.update(world);
  hud.syncCarLabels(world);
}

function frame(now: number): void {
  const delta = Math.min((now - lastFrameTime) / 1000, MAX_FRAME_DELTA);
  lastFrameTime = now;

  step(delta);

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

// --- Yaşam döngüsü ---

window.addEventListener('resize', () => {
  world.resize();
});

// Sayfa kapanırken kaydetmeyi bilerek durdurmak için (bkz. dev reset()).
let savingEnabled = true;

// Mobilde sekme kapanışı güvenilir yakalanmaz; asıl güvenilir sinyal görünürlük.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (savingEnabled) station.suspend();
    return;
  }

  lastFrameTime = performance.now();
  const report = station.resume();
  if (report !== null) hud.showOffline(report);
});

window.addEventListener('pagehide', () => {
  if (savingEnabled) station.suspend();
});

// --- Geliştirme kancası ---
// Sadece dev sunucusunda. Tarayıcı konsolundan denge denemesi yapmak için:
//   __petrolyoner.station.addMoney(1e5)
//   __petrolyoner.station.data.unlockedSlots   → açık pompalar
//   __petrolyoner.offline(3)                   → 3 saatlik gece vardiyası ekranı
//   __petrolyoner.time(22)                     → geceyi anında göster
//   __petrolyoner.reset()                      → kaydı sil ve baştan başla
if (import.meta.env.DEV) {
  Object.defineProperty(window, '__petrolyoner', {
    value: {
      station,
      world,
      hud,
      /**
       * Zamanı elle ilerletir. Sekme arka plandayken requestAnimationFrame
       * durduğu için otomatik test ortamında oyunu bununla sürüyoruz.
       */
      step(seconds: number, slice = 1 / 60) {
        let remaining = seconds;
        while (remaining > 0) {
          step(Math.min(slice, remaining));
          remaining -= slice;
        }
        return { para: station.money, araba: station.cars.size };
      },
      offline(hours: number) {
        station.data.lastSeenUnixSeconds -= Math.round(hours * 3600);
        const report = station.resume();
        if (report !== null) hud.showOffline(report);
        return report;
      },
      time(hour: number) {
        station.setTimeOfDay(hour);
        world.setDayPhase(station.dayPhase);
        hud.update(world);
        return { gun: station.day, saat: station.clockLabel, gece: world.isNightTime };
      },
      view() {
        world.resetView();
        return 'görünüm sıfırlandı';
      },
      reset() {
        // Önce kaydı kapat: yoksa reload'un tetiklediği pagehide, sildiğimiz
        // kaydın üstüne canlı durumu yazıp sıfırlamayı boşa çıkarıyor.
        savingEnabled = false;
        localStorage.removeItem('petrolyoner.save');
        location.reload();
      },
    },
  });
}
