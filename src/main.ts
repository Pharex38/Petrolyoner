import './style.css';

import { GameEngine } from './game/economy';
import { formatMoney } from './game/format';
import { WELLS } from './game/wells';
import { World } from './scene/world';
import { Hud } from './ui/hud';

/** Pompanın temel salınım hızı (rad/sn). Seviye arttıkça logaritmik hızlanır. */
const BASE_PUMP_SPEED = 1.6;

/** Sekme arkadayken biriken devasa dt'nin tek karede işlenmesini engeller. */
const MAX_FRAME_DELTA = 0.1;

const viewport = document.getElementById('viewport');
if (viewport === null) throw new Error('#viewport bulunamadı');

const engine = new GameEngine();
const world = new World(viewport);
const hud = new Hud(engine);

// --- Seçim ---

function select(wellId: string): void {
  const previous = hud.selected;
  if (previous !== null) world.rigs.get(previous)?.setSelected(false);

  hud.select(wellId);
  world.rigs.get(wellId)?.setSelected(true);
}

const firstWell = WELLS[0];
if (firstWell !== undefined) select(firstWell.id);

// --- Giriş ---

world.renderer.domElement.addEventListener('pointerdown', (event) => {
  const wellId = world.pick(event.clientX, event.clientY);
  if (wellId === null) return;

  select(wellId);

  // Dokunma ödülü: o kuyunun bir saniyelik üretimi. Erken oyunda oyuncuya
  // "elimle bir şey yapıyorum" hissi verir, geç oyunda kendiliğinden önemsizleşir.
  const bonus = engine.wellIncomePerSecond(wellId);
  if (bonus <= 0) return;

  engine.addMoney(bonus);

  const rig = world.rigs.get(wellId);
  if (rig === undefined) return;

  const anchor = rig.position.clone();
  anchor.y = 2.8;

  const screen = world.projectToScreen(anchor);
  hud.spawnFloater(`+${formatMoney(bonus)}`, screen.x, screen.y);
});

hud.onUpgrade = () => {
  const wellId = hud.selected;
  if (wellId === null) return;
  if (!engine.tryUpgrade(wellId)) return;

  engine.persist();
};

// --- Offline kazanç ---

const startupReport = engine.resume();
if (startupReport !== null) hud.showOffline(startupReport);

// --- Ana döngü ---

let lastFrameTime = performance.now();

function frame(now: number): void {
  const delta = Math.min((now - lastFrameTime) / 1000, MAX_FRAME_DELTA);
  lastFrameTime = now;

  engine.tick(delta);

  for (const definition of WELLS) {
    const rig = world.rigs.get(definition.id);
    if (rig === undefined) continue;

    const level = engine.levelOf(definition.id);
    rig.setLocked(level === 0);
    rig.update(delta, BASE_PUMP_SPEED * (1 + Math.log10(level + 1)));
  }

  world.render();
  hud.update();

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
    if (savingEnabled) engine.suspend();
    return;
  }

  lastFrameTime = performance.now();
  const report = engine.resume();
  if (report !== null) hud.showOffline(report);
});

window.addEventListener('pagehide', () => {
  if (savingEnabled) engine.suspend();
});

// --- Geliştirme kancası ---
// Sadece dev sunucusunda. Tarayıcı konsolundan denge denemesi yapmak için:
//   __petrolyoner.engine.addMoney(1e6)
//   __petrolyoner.engine.data.wells         → seviyeleri gör
//   __petrolyoner.offline(3)                → 3 saatlik offline ekranını dene
//   __petrolyoner.reset()                   → kaydı sil ve baştan başla
if (import.meta.env.DEV) {
  Object.defineProperty(window, '__petrolyoner', {
    value: {
      engine,
      world,
      hud,
      offline(hours: number) {
        engine.data.lastSeenUnixSeconds -= Math.round(hours * 3600);
        const report = engine.resume();
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
