import './style.css';

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

// Müşteriler görünmez biçimde üretilmez: ana yoldan geçen gerçek bir NPC araç
// girişe ulaştığında istasyon, boş pompa varsa o aracı devralır.
world.onTrafficCarAtEntrance = (color) => station.acceptTrafficCar(color);

// --- Geri bildirim ---

station.onServed = (car) => {
  const screen = world.carScreenPosition(car);
  if (screen === null) return;

  hud.spawnFloater(`+${formatMoney(car.amount)}`, screen.x, screen.y);
};

station.onMissed = (car) => {
  const screen = world.carScreenPosition(car);
  if (screen !== null) hud.spawnFloater('Müşteri kaçtı', screen.x, screen.y, true);

  // Panel o araba için açıksa artık anlamsız — kapat.
  if (hud.openSlotIndex === car.slotIndex) hud.closeSheets();
};

// --- Giriş ---

world.renderer.domElement.addEventListener('pointerdown', (event) => {
  const slotIndex = world.pick(event.clientX, event.clientY);
  if (slotIndex === null) {
    hud.closeSheets();
    return;
  }

  if (!station.isUnlocked(slotIndex)) {
    hud.openUnlockSheet(slotIndex);
    return;
  }

  const car = station.carAt(slotIndex);
  if (car !== undefined && car.phase === 'waiting') {
    hud.openServeSheet(car);
    return;
  }

  // Boş pompaya dokunmak bir şey yapmaz; açık paneli kapatalım.
  hud.closeSheets();
});

hud.onServe = (slotIndex, fuel, amount) => {
  const car = station.carAt(slotIndex);
  const result = station.serve(slotIndex, fuel, amount);

  if (result !== 'wrong' || car === undefined) return;

  const screen = world.carScreenPosition(car);
  if (screen !== null) hud.spawnFloater('Yanlış yakıt!', screen.x, screen.y, true);
};

hud.onUnlock = (slotIndex) => {
  station.tryUnlockSlot(slotIndex);
};

// --- Gece vardiyası ---

const startupReport = station.resume();
if (startupReport !== null) hud.showOffline(startupReport);

// --- Ana döngü ---

let lastFrameTime = performance.now();

/** Tek bir kare: oyun mantığını ilerlet, sahneyi ve arayüzü tazele. */
function step(delta: number): void {
  station.tick(delta);
  world.updateTraffic(delta);

  for (const slot of station.slots) {
    world.islands.get(slot.index)?.setUnlocked(station.isUnlocked(slot.index));
  }

  world.syncCars(station.cars.values());
  world.render();

  hud.update();
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
