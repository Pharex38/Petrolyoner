import * as THREE from 'three';
import { findFuel, type FuelType } from '../game/fuel';
import type { Car } from '../game/station';
import type { SlotDefinition } from '../game/slots';
import {
  ENTRY_Z,
  EXIT_Z,
  LANE_X,
  stationEntryZ,
  stationExitZ,
  MARKET_ROTATION_Y,
  MARKET_X,
  MARKET_Z,
  SLOTS,
  findSlot,
} from '../game/slots';
import {
  DEFAULT_TRAFFIC_SIDE,
  stationFlowDirection,
  type TrafficSide,
} from '../game/traffic';
import { AmbientSystem } from './ambient';
import {
  PumpIsland,
  createCar,
  createFuelTanker,
  createStationBuilding,
  setCarBassPulse,
  setCarEmergencyLights,
  setCarHazards,
  setCarHeadlights,
  setCarLightBeamsEnabled,
  setCarRunningLights,
  setCarTurnSignal,
  setFuelTankerUnloading,
  setTowPlatformUnload,
  type VehicleStyle,
} from './models';

/**
 * Kuş bakışı istasyon: ortografik kamera sağ ön taraftan çapraz bakar.
 * Perspektif yerine ortografik seçildi — uzaktaki pompa yakındakiyle aynı
 * ölçekte görünür, oyuncu hepsini eşit kolaylıkta seçebilir.
 */

const GRASS_COLOR = 0x7db85f;
// Saha betonu asfaltla aynı aileden, bir tık açık: yol ile arsa yine ayrışıyor
// ama saha çimenin yanında parlamıyor.
const LOT_COLOR = 0x474d56;
const ROAD_COLOR = 0x2c3139;
const LINE_COLOR = 0xd9d5c8;
const ROAD_LINE_COLOR = 0xf0d27d;
const CURB_COLOR = 0xb9bbb4;
const SKY_COLOR = 0x9fc7dc;
const NIGHT_SKY_COLOR = 0x101a2d;

/** Sağdaki ana yolu da gösterecek, dikey ekrana göre ayarlanmış referans genişlik. */
const TARGET_WIDTH = 14.1;
/** Yakınlaştırma sınırları; 1 = varsayılan çerçeve. */
const MIN_ZOOM = 0.65;
const MAX_ZOOM = 3.2;
/** Kameranın bakış noktasının saha merkezinden uzaklaşabileceği sınır. */
const PAN_LIMIT_X = 13;
const PAN_LIMIT_Z = 17;
/** Bu eşiği aşan sürükleme dokunma değil kaydırma sayılır. */
const PAN_THRESHOLD_PX = 12;

/** Yatay ekranda derinlik sığsın diye referans yükseklik. */
const TARGET_HEIGHT = 17.5;

/** İstasyonun sağındaki, NPC'lerin kullandığı ana yol. */
/** İstasyon arsasının sınırları — yol tarafındaki kenar yolun kaldırımıyla hizalı.
 *  Sol kenar market binasını kapsamak zorunda: bina MARKET_X (-7.6) merkezli ve
 *  çeyrek tur çevrili, yani çatısının 2.7'lik derinliği x eksenine düşüyor ve
 *  x = -8.95'e kadar uzanıyor. Sağ kenar (6.05) yola bakıyor, o yüzden
 *  genişletme hep soldan yapılmalı. */
const LOT_WIDTH = 15.6;
const LOT_DEPTH = 30;
const LOT_CENTER_X = -1.75;
const LOT_CENTER_Z = 2.5;

const ROAD_X = 7.75;
const ROAD_WIDTH = 3.4;
const ROAD_LENGTH = 140;
const ROAD_CENTER_Z = -1;
const ROAD_EDGE_INSET = 4;
const TRAFFIC_MIN_Z = ROAD_CENTER_Z - ROAD_LENGTH / 2 + ROAD_EDGE_INSET;
const TRAFFIC_MAX_Z = ROAD_CENTER_Z + ROAD_LENGTH / 2 - ROAD_EDGE_INSET;
const INBOUND_TRAFFIC_X = ROAD_X - 0.72;
const OUTBOUND_TRAFFIC_X = ROAD_X + 0.72;
const TRAFFIC_CAR_SCALE = 0.9;
const VEHICLE_Y = 0.085;
/** Araç gövdeleri arasındaki en küçük mesafe; iç içe geçmeyi önler. */
const MIN_TRAFFIC_GAP = 3.25;
const CAT_CROSSING_ZS = [-9, -2, 6, 14] as const;
const CAT_START_X = ROAD_X - ROAD_WIDTH / 2 - 0.5;
const CAT_END_X = ROAD_X + ROAD_WIDTH / 2 + 0.5;
const CAT_LANE_REACTION_WIDTH = 1.2;
const CAT_STOP_BUFFER = 1.85;
const CAT_BRAKE_DISTANCE = 8;
const CAT_SPAWN_CLEARANCE = 8;
const CAT_PASS_CLEARANCE = 0.45;
const ROADWORK_STOP_BUFFER = 2.05;
const ROADWORK_BRAKE_DISTANCE = 8.5;
const ROADWORK_ARRIVAL_SECONDS = 3.8;
const ROADWORK_REPAIR_SECONDS = 15.5;
const ROADWORK_ZS = [-18, -3, 7, 20] as const;
const FOLLOWER_FLASH_HEADWAY = 9;
/** İstasyon rotasındaki araçları ana yol trafiğinin algıladığı yatay mesafe. */
const STATION_CAR_REACTION_WIDTH = 2.15;
/** Acil araçlar görünür yol kesitini baştan başa, orta koridordan geçer. */
const EMERGENCY_ROUTE_LIMIT = 28;
const EMERGENCY_YIELD_DISTANCE = 16;
const EMERGENCY_STOP_DISTANCE = 6.5;
const EMERGENCY_SHOULDER_INSET = 0.24;
const RESCUE_ROUTE_LIMIT = 30;

/**
 * Aktif trafik yönü. Modül düzeyinde tutuluyor çünkü rota kurucuları da
 * (stationRoute) sınıf dışında ve aynı yönü görmek zorunda.
 */
let activeTrafficSide: TrafficSide = DEFAULT_TRAFFIC_SIDE;

/** İstasyona komşu şeridin ve saha içi akışın yönü: sağdan -1, soldan +1. */
function flow(): -1 | 1 {
  return stationFlowDirection(activeTrafficSide);
}

/** Araçların sahaya girdiği kapı. */
function gateIn(): number {
  return stationEntryZ(activeTrafficSide);
}

/** Araçların sahadan çıktığı kapı. */
function gateOut(): number {
  return stationExitZ(activeTrafficSide);
}

/** prev→next hareketi, akış yönünde ilerlerken hedef z'yi geçti mi? */
function crossedAlongFlow(previousZ: number, nextZ: number, target: number): boolean {
  return flow() < 0
    ? previousZ >= target && nextZ <= target
    : previousZ <= target && nextZ >= target;
}

/** Akış yönünde iki noktadan daha ileride olanı. */
function furthestAlongFlow(a: number, b: number): number {
  return flow() < 0 ? Math.min(a, b) : Math.max(a, b);
}
/** Çekicinin giriş ağzında beklediği nokta; kapıdan akışın gerisinde kalır. */
function rescueEntryStopZ(): number {
  return ENTRY_Z - flow() * 2.4;
}
const RESCUE_TRUCK_UNLOAD_PROGRESS = 0.8;
const RESCUE_UNLOAD_SECONDS = 2.2;
const RESCUE_RELEASE_EXIT_PROGRESS = 0.42;
const FUEL_TANKER_ROUTE_LIMIT = 31;
/** Tankerin giriş ağzında beklediği nokta. */
function fuelTankerEntryStopZ(): number {
  return ENTRY_Z - flow() * 2.75;
}
const FUEL_TANKER_BAY_X = 4.75;
const FUEL_TANKER_BAY_Z = 15.2;
const FUEL_TANKER_UNLOAD_SECONDS = 6.2;
const FUEL_TANKER_ROUTE_RELEASE_PROGRESS = 0.82;
const FUEL_TANKER_HALF_WIDTH = 0.86;
const FUEL_TANKER_HALF_LENGTH = 2.15;
const ACTIVE_HEADLIGHT_RANGE_Z = 21;

type TrafficDirection = -1 | 1;

interface TrafficCar {
  readonly mesh: THREE.Group;
  readonly color: number;
  readonly baseSpeed: number;
  readonly style: VehicleStyle;
  direction: TrafficDirection;
  laneX: number;
  pace: number;
  targetPace: number;
  paceTimer: number;
  highBeamTimer: number;
  highBeamCooldown: number;
  event: TrafficEvent | null;
}

interface TrafficSeed {
  readonly laneX: number;
  readonly z: number;
  readonly direction: TrafficDirection;
  readonly speed: number;
  readonly color: number;
  readonly style: VehicleStyle;
}

type TrafficEventKind = 'bass' | 'overtake' | 'breakdown' | 'horn' | 'swerve' | 'rush';

interface TrafficEvent {
  readonly kind: TrafficEventKind;
  elapsed: number;
  readonly duration: number;
  readonly originX?: number;
  readonly targetX?: number;
  readonly effect?: THREE.Group;
  towTruck?: THREE.Group;
  towAttached?: boolean;
  towComplete?: boolean;
}

interface CatEvent {
  readonly mesh: THREE.Group;
  readonly z: number;
  elapsed: number;
  readonly duration: number;
}

type RoadworkPhase = 'arriving' | 'repairing' | 'departing';

interface RoadworkEvent {
  readonly site: THREE.Group;
  readonly truck: THREE.Group;
  readonly laneX: number;
  readonly z: number;
  readonly truckStart: THREE.Vector3;
  readonly truckPark: THREE.Vector3;
  readonly truckExit: THREE.Vector3;
  readonly queue: TrafficCar[];
  phase: RoadworkPhase;
  elapsed: number;
}

interface EmergencyVehicle {
  readonly mesh: THREE.Group;
  readonly direction: TrafficDirection;
  readonly speed: number;
  elapsed: number;
}

type RescueDeliveryPhase = 'road' | 'waiting' | 'entering' | 'unloading' | 'departing';

interface RescueDelivery {
  readonly truck: THREE.Group;
  readonly car: THREE.Group;
  readonly color: number;
  readonly speed: number;
  z: number;
  delivered: boolean;
  phase: RescueDeliveryPhase;
  progress: number;
  elapsed: number;
  customer: Car | null;
  exitRoute: THREE.CatmullRomCurve3 | null;
  unloadStart: CarTransform | null;
  customerReleased: boolean;
}

type FuelDeliveryPhase = 'road' | 'waiting' | 'entering' | 'unloading' | 'departing';

interface FuelDelivery {
  readonly truck: THREE.Group;
  readonly fuel: FuelType;
  readonly speed: number;
  phase: FuelDeliveryPhase;
  z: number;
  progress: number;
  elapsed: number;
  completed: boolean;
  entryRoute: THREE.CatmullRomCurve3 | null;
  exitRoute: THREE.CatmullRomCurve3 | null;
}

interface StationNightLight {
  readonly light: THREE.PointLight;
  readonly nightIntensity: number;
}

export type WorldPick =
  | {
      readonly slotIndex: number;
      readonly kind: 'car' | 'pump';
    }
  | {
      readonly slotIndex: null;
      readonly kind: 'market';
    };

const TRAFFIC_SEEDS: readonly TrafficSeed[] = [
  { laneX: INBOUND_TRAFFIC_X, z: 18, direction: -1, speed: 3.5, color: 0xdf5a4d, style: 'compact' },
  { laneX: INBOUND_TRAFFIC_X, z: 42, direction: -1, speed: 4.1, color: 0xe2a438, style: 'sport' },
  { laneX: INBOUND_TRAFFIC_X, z: -14, direction: -1, speed: 3.7, color: 0x4d92c7, style: 'executive' },
  { laneX: INBOUND_TRAFFIC_X, z: -43, direction: -1, speed: 3.4, color: 0x8161b5, style: 'classic' },
  { laneX: INBOUND_TRAFFIC_X, z: 64, direction: -1, speed: 3.95, color: 0xf0efe8, style: 'convertible' },
  { laneX: OUTBOUND_TRAFFIC_X, z: -27, direction: 1, speed: 3.8, color: 0x4d9764, style: 'classic' },
  { laneX: OUTBOUND_TRAFFIC_X, z: 4, direction: 1, speed: 2.85, color: 0x2f2f33, style: 'classic' },
  { laneX: OUTBOUND_TRAFFIC_X, z: -4, direction: 1, speed: 4.35, color: 0xdf5a4d, style: 'sport' },
  { laneX: OUTBOUND_TRAFFIC_X, z: 29, direction: 1, speed: 3.55, color: 0xdf5a4d, style: 'compact' },
  { laneX: OUTBOUND_TRAFFIC_X, z: 52, direction: 1, speed: 4.05, color: 0xf0efe8, style: 'sport' },
  { laneX: OUTBOUND_TRAFFIC_X, z: -49, direction: 1, speed: 3.65, color: 0xe2a438, style: 'convertible' },
];

function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

/** Hızlanıp yavaşlayan geçiş — araba hareketi mekanik görünmesin. */
function smooth(t: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  return clamped * clamped * (3 - 2 * clamped);
}

/** Açısal geçişin kısa yönden dönmesini sağlar; araçlar bir karede yön değiştirmez. */
function lerpAngle(from: number, to: number, t: number): number {
  const delta = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return from + delta * Math.max(0, Math.min(1, t));
}

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function randomItem<T>(items: readonly T[]): T | null {
  if (items.length === 0) return null;
  return items[Math.floor(Math.random() * items.length)] ?? null;
}

function vehicleStyleOf(mesh: THREE.Group): VehicleStyle {
  const style = mesh.userData.vehicleStyle;
  if (
    style === 'compact' ||
    style === 'executive' ||
    style === 'sport' ||
    style === 'classic' ||
    style === 'convertible' ||
    style === 'tow'
  ) {
    return style;
  }
  return 'compact';
}

function disposeEffect(root: THREE.Object3D): void {
  root.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    node.geometry.dispose();
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of materials) material.dispose();
  });
}

export class World {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.OrthographicCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly islands = new Map<number, PumpIsland>();

  /** Ana yoldaki bir araç girişe geldiğinde oyun motoru uygun müşteriyi döndürür. */
  onTrafficCarAtEntrance: ((color: number) => Car | null) | null = null;
  /** Web Audio katmanı World'den ayrı kalsın diye korna yalnızca olay olarak yayınlanır. */
  onTrafficHorn: (() => void) | null = null;
  /** Bass aracının müziği, olay başladığı ve bittiği karede ses katmanına bildirilir. */
  onBassMusic: ((active: boolean) => void) | null = null;
  /** Çekicinin getirdiği deposu boş araç için normal trafikten ayrı müşteri girişi. */
  onFuelRescueAtEntrance: ((color: number) => Car | null) | null = null;
  /** Çekici aracı doğrudan pompa cebine indirdiğinde oyun motoruna haber verir. */
  onRescueCarDelivered: ((car: Car) => void) | null = null;
  /** Tanker hortumu boşaltmayı bitirdiğinde stok oyun motorunda açılır. */
  onFuelDeliveryComplete: ((fuel: FuelType) => void) | null = null;
  /** Polis/ambulans sahneye girdiği ve çıktığı karede siren sesini eşitler. */
  onEmergencySiren: ((active: boolean) => void) | null = null;

  private readonly container: HTMLElement;
  private readonly daySkyColor = new THREE.Color(SKY_COLOR);
  private readonly nightSkyColor = new THREE.Color(NIGHT_SKY_COLOR);
  private readonly rainSkyColor = new THREE.Color(0x647582);
  private readonly hemisphereLight = new THREE.HemisphereLight(0xdce9f5, 0x5a5f66, 1.6);
  private readonly sunLight = new THREE.DirectionalLight(0xfff3dd, 2.1);
  private readonly stationNightLights: StationNightLight[] = [];
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly projectionScratch = new THREE.Vector3();
  private readonly pickables: THREE.Object3D[] = [];
  private readonly carMeshes = new Map<number, THREE.Group>();

  /** Kameranın baktığı nokta; kaydırma bunu XZ düzleminde oynatır. */
  private readonly cameraTarget = new THREE.Vector3(-0.45, 0, -0.8);
  /** Kameranın hedefe göre sabit konumu — izometrik açı hep korunur. */
  private readonly cameraOffset = new THREE.Vector3(14.45, 21, 15.8);
  private readonly homeTarget = new THREE.Vector3(-0.45, 0, -0.8);
  private zoomLevel = 1;
  private frustumWidth = TARGET_WIDTH;
  private frustumHeight = TARGET_HEIGHT;
  private readonly activePointers = new Map<number, { x: number; y: number }>();
  private pinchDistance = 0;
  private panPointerId: number | null = null;
  private panStart = { x: 0, y: 0 };
  private panning = false;
  private readonly groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly groundHit = new THREE.Vector3();
  private readonly aliveCarIds = new Set<number>();
  private readonly trafficCars: TrafficCar[] = [];
  private readonly isMobileDevice = window.matchMedia('(pointer: coarse)').matches;
  private readonly reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  private readonly ambient: AmbientSystem;
  private readonly protestGroup = createProtestGroup();
  private readonly storageTankSite = createStorageTankSite();
  private catEvent: CatEvent | null = null;
  private roadwork: RoadworkEvent | null = null;
  private emergencyVehicle: EmergencyVehicle | null = null;
  private rescueDelivery: RescueDelivery | null = null;
  private fuelDelivery: FuelDelivery | null = null;
  /** Çıkıştaki tankerin arkasından güvenle başlatılacak tek ikmal siparişi. */
  private queuedFuelDelivery: FuelType | null = null;
  private stationRouteOwnerId: number | null = null;
  private marketBuilding: THREE.Group | null = null;
  private marketConstructionSite: THREE.Group | null = null;
  private marketBuildProgress = 1;
  private visibleStorageLevel = -1;
  private marketNightLight: THREE.PointLight | null = null;
  private nextTrafficEventIn = randomBetween(4.5, 8.5);
  private nextEmergencyVehicleIn = randomBetween(24, 38);
  private nextRescueDeliveryIn = randomBetween(20, 32);
  private nextRoadworkIn = randomBetween(20, 34);
  private protestRequested = false;
  private protestTargetCount = 0;
  private protestChangeIn = randomBetween(4.5, 8);
  private protestWalkerIn = 0;
  private lightBudgetTimer = 0;
  private daylightVisualTimer = 0;
  private viewportWidth = 0;
  private viewportHeight = 0;
  private elapsedWorldTime = 0;
  /** 0=00:00, 0.5=12:00. Oyun sabah vardiyasında başlar. */
  private dayPhase = 8 / 24;
  private nightTime = false;

  constructor(container: HTMLElement) {
    this.container = container;

    this.scene.background = new THREE.Color(SKY_COLOR);

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 120);
    // Referanstaki izometrik hissi, istasyonun sağ önünden alıyoruz. Ana yol
    // bu yüzden ekranın sağında akıyor; pompalar ve müşteri arabaları açıkta kalıyor.
    this.applyCamera();

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    // Trafik varken mobil GPU'da gereksiz yüksek çözünürlüklü render yapma.
    this.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio, this.isMobileDevice ? 1.25 : 1.75),
    );
    this.renderer.shadowMap.enabled = true;
    // r185'te PCFSoftShadowMap kullanımdan kaldırıldı; PCF zaten yumuşatıyor.
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    container.appendChild(this.renderer.domElement);

    this.ambient = new AmbientSystem(
      ROAD_X,
      ROAD_WIDTH,
      this.isMobileDevice,
      this.reduceMotion,
    );
    this.scene.add(this.ambient.group);

    this.addLights();
    this.addGround();
    this.addIslands();
    this.addTraffic();
    this.protestGroup.position.set(-6.2, 0.08, 8.6);
    this.protestGroup.visible = false;
    this.scene.add(this.protestGroup);
    this.storageTankSite.position.set(-6.75, 0.07, -6.6);
    this.storageTankSite.visible = false;
    this.scene.add(this.storageTankSite);

    this.attachViewControls();
    this.resize();
  }

  private addLights(): void {
    this.scene.add(this.hemisphereLight);

    const sun = this.sunLight;
    sun.position.set(6, 14, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(this.isMobileDevice ? 512 : 1024, this.isMobileDevice ? 512 : 1024);

    // Gölge kamerası tüm istasyonu kapsamalı, yoksa kenarlarda gölge kesilir.
    const shadowCamera = sun.shadow.camera;
    shadowCamera.left = -10;
    shadowCamera.right = 10;
    shadowCamera.top = 12;
    shadowCamera.bottom = -12;
    shadowCamera.near = 1;
    shadowCamera.far = 42;
    shadowCamera.updateProjectionMatrix();

    this.scene.add(sun);

    // Pompa çevresindeki sıcak çalışma lambaları yalnızca geceleri güçlenir.
    for (const [x, z] of [[-2.3, 1.8], [2.3, 1.8]] as const) {
      const light = new THREE.PointLight(0xffd99a, 0, 9, 1.7);
      light.position.set(x, 3.1, z);
      light.castShadow = false;
      this.addStationNightLight(light, 18);
      this.scene.add(light);
    }

    const marketLight = new THREE.PointLight(0xffd99a, 0, 9, 1.7);
    // Vitrin +x'e baktığı için saçak ışığı da o tarafta durmalı.
    marketLight.position.set(MARKET_X + 1.4, 3.1, MARKET_Z);
    marketLight.castShadow = false;
    this.marketNightLight = marketLight;
    this.addStationNightLight(marketLight, 18);
    this.scene.add(marketLight);

    this.addStationPerimeterLights();
  }

  private addStationNightLight(
    light: THREE.PointLight,
    nightIntensity: number,
  ): void {
    this.stationNightLights.push({ light, nightIntensity });
  }

  /** Sahanın sınırlarını geceleri okunur yapan kısa, soğuk beyaz çevre lambaları. */
  private addStationPerimeterLights(): void {
    const poleMaterial = new THREE.MeshStandardMaterial({
      color: 0x4e5960,
      roughness: 0.48,
      metalness: 0.56,
    });
    const glassMaterial = new THREE.MeshStandardMaterial({
      color: 0xf7fbff,
      emissive: 0xf4f8ff,
      emissiveIntensity: 2.2,
      roughness: 0.2,
    });
    const baseGeometry = new THREE.CylinderGeometry(0.14, 0.17, 0.16, 10);
    const poleGeometry = new THREE.CylinderGeometry(0.045, 0.062, 2.65, 8);
    const capGeometry = new THREE.CylinderGeometry(0.16, 0.12, 0.1, 10);
    const lampGeometry = new THREE.SphereGeometry(0.13, 10, 7);
    const positions = [
      [-8.65, -10.8],
      [-8.65, 15.0],
      [-1.7, 16.05],
      [5.45, 15.0],
      [5.45, -10.8],
    ] as const;

    for (const [x, z] of positions) {
      const fixture = new THREE.Group();
      fixture.position.set(x, 0, z);

      const base = new THREE.Mesh(baseGeometry, poleMaterial);
      base.position.y = 0.08;
      fixture.add(base);

      const pole = new THREE.Mesh(poleGeometry, poleMaterial);
      pole.position.y = 1.44;
      fixture.add(pole);

      const cap = new THREE.Mesh(capGeometry, poleMaterial);
      cap.position.y = 2.8;
      fixture.add(cap);

      const lamp = new THREE.Mesh(lampGeometry, glassMaterial);
      lamp.position.y = 2.69;
      fixture.add(lamp);
      this.scene.add(fixture);

      const light = new THREE.PointLight(0xf3f8ff, 0, 8.5, 1.7);
      light.position.set(x, 2.65, z);
      light.castShadow = false;
      this.addStationNightLight(light, 13);
      this.scene.add(light);
    }
  }

  /**
   * Market yeni oyunda yoktur. Satın alınınca temelden yukarı doğru kısa,
   * kesintisiz bir inşa hareketiyle sahneye gelir.
   */
  /**
   * Trafik yönünü değiştirir: her iki şerit de ters yöne akmaya başlar ve
   * istasyonun giriş/çıkış kapıları rol değiştirir. Yol ve istasyon yerinde kalır.
   *
   * Sahadaki mevcut müşteriler eski rotalarını tamamlar; yeni gelenler yeni
   * yöne göre hareket eder. Aksi halde yarı yolda ışınlanmış görünürlerdi.
   */
  setTrafficSide(side: TrafficSide): void {
    if (activeTrafficSide === side) return;

    activeTrafficSide = side;

    // Rota önbelleği yön anahtarlı; yine de büyümesin diye temizliyoruz.
    stationRoutes.arriving.clear();
    stationRoutes.leaving.clear();

    for (const trafficCar of this.trafficCars) {
      // Şerit x'i sabit; sadece o şeridin taşıdığı yön tersine döner.
      const direction = -trafficCar.direction as TrafficDirection;
      trafficCar.direction = direction;
      trafficCar.mesh.rotation.y = direction === -1 ? 0 : Math.PI;
    }
  }

  get trafficSide(): TrafficSide {
    return activeTrafficSide;
  }

  setMarketBuilt(built: boolean, animate = false): void {
    if (!built) {
      if (this.marketConstructionSite !== null) {
        this.marketConstructionSite.visible = true;
      }
      if (this.marketBuilding !== null) {
        const pickableIndex = this.pickables.indexOf(this.marketBuilding);
        if (pickableIndex >= 0) this.pickables.splice(pickableIndex, 1);
        this.scene.remove(this.marketBuilding);
        disposeEffect(this.marketBuilding);
        this.marketBuilding = null;
      }
      this.marketBuildProgress = 0;
      if (this.marketNightLight !== null) this.marketNightLight.visible = false;
      return;
    }
    if (this.marketConstructionSite !== null) {
      this.marketConstructionSite.visible = false;
    }
    if (this.marketBuilding !== null) return;

    const building = createStationBuilding();
    const shouldAnimate = animate && !this.reduceMotion;
    this.marketBuildProgress = shouldAnimate ? 0 : 1;
    const scaleY = shouldAnimate ? 0.025 : 1;
    building.scale.set(1, scaleY, 1);
    building.userData.pickKind = 'market';
    this.marketBuilding = building;
    this.scene.add(building);
    this.pickables.push(building);
    if (this.marketNightLight !== null) this.marketNightLight.visible = true;
  }

  private updateMarketConstruction(deltaSeconds: number): void {
    const building = this.marketBuilding;
    if (building === null || this.marketBuildProgress >= 1) return;
    this.marketBuildProgress = Math.min(1, this.marketBuildProgress + deltaSeconds / 0.82);
    building.scale.y = lerp(0.025, 1, smooth(this.marketBuildProgress));
  }

  get isNightTime(): boolean {
    return this.nightTime;
  }

  get weatherIcon(): string {
    if (this.ambient.isRaining) return '☂';
    return this.nightTime ? '☾' : '☀';
  }

  /**
   * Tanker boşaltmayı bitirip istasyondan çıkışa geçtiğinde yeni sipariş kabul
   * edilir. Yeni tanker, eskisi yolu tamamen açınca görünür biçimde yola çıkar.
   */
  get canRequestFuelDelivery(): boolean {
    const delivery = this.fuelDelivery;
    return (
      delivery === null ||
      (delivery.phase === 'departing' && this.queuedFuelDelivery === null)
    );
  }

  /** Çevre/kaçakçılık tepkisini sahada görünür protestoculara çevirir. */
  setProtestActive(active: boolean): void {
    if (active === this.protestRequested) return;
    this.protestRequested = active;
    this.protestWalkerIn = 0;
    if (active) {
      this.protestTargetCount = 3 + Math.floor(Math.random() * 3);
      this.protestChangeIn = randomBetween(4.5, 8);
      this.protestGroup.visible = true;
      return;
    }
    this.protestTargetCount = 0;
  }

  /** Yönetimde kurulan devasa depoları sahada kalıcı tanklara dönüştürür. */
  setStorageLevel(level: number): void {
    const normalized = Math.max(0, Math.min(8, Math.floor(level)));
    if (normalized === this.visibleStorageLevel) return;
    this.visibleStorageLevel = normalized;
    this.storageTankSite.visible = normalized > 0;
    const visibleTanks = Math.ceil(normalized / 2);
    for (const [index, tank] of this.storageTankSite.children.entries()) {
      tank.visible = index < visibleTanks;
    }
  }

  /**
   * Oyun saatini sahneye taşır. Faz oyun katmanında ilerler (bkz. game/clock.ts);
   * sahne yalnızca ışığa, gökyüzüne ve farlara çevirir.
   */
  setDayPhase(phase: number): void {
    this.dayPhase = ((phase % 1) + 1) % 1;
  }

  private addGround(): void {
    const ground = new THREE.Mesh(
      // Mobil kameranın kenarlarında arazinin bitişi görünmesin.
      new THREE.PlaneGeometry(240, 240),
      new THREE.MeshStandardMaterial({ color: GRASS_COLOR, roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // İstasyon sınırlı bir arsa: market (-9.8), bina (-6.6), kapılar (-9.2 / 11.5)
    // ve tanker cebi (15.2) sığacak kadar. Sonsuz şerit yerine çevresi çimenle
    // biten bir mülk gibi okunsun diye kenarları kaldırımla kapatılıyor.
    const lot = new THREE.Mesh(
      new THREE.BoxGeometry(LOT_WIDTH, 0.06, LOT_DEPTH),
      new THREE.MeshStandardMaterial({ color: LOT_COLOR, roughness: 0.94 }),
    );
    lot.position.set(LOT_CENTER_X, 0.03, LOT_CENTER_Z);
    lot.receiveShadow = true;
    this.scene.add(lot);

    this.addLotBoundary();

    const lineMaterial = new THREE.MeshStandardMaterial({ color: LINE_COLOR, roughness: 0.9 });

    // Sürüş şeridinin kenar çizgileri.
    // Şerit yalnızca giriş ve çıkış kapıları arasında var.
    const laneLength = Math.abs(ENTRY_Z - EXIT_Z);
    const laneCenter = (ENTRY_Z + EXIT_Z) / 2;
    for (const lineX of [-1.18, 1.18]) {
      const line = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.02, laneLength), lineMaterial);
      line.position.set(lineX, 0.07, laneCenter);
      this.scene.add(line);
    }

    // Her pompanın park yeri için çizgiler.
    for (const slot of SLOTS) {
      for (const offset of [-1.65, 1.65]) {
        const line = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.02, 0.07), lineMaterial);
        line.position.set(slot.carX, 0.07, slot.z + offset);
        this.scene.add(line);
      }
    }

    // Düz beton plaka yerine, market kurulana kadar okunabilir bir şantiye.
    const constructionSite = createMarketConstructionSite();
    constructionSite.position.set(MARKET_X, 0, MARKET_Z);
    constructionSite.rotation.y = MARKET_ROTATION_Y;
    this.marketConstructionSite = constructionSite;
    this.scene.add(constructionSite);

    this.addFuelDepotManifold();
    this.addRoad();
  }

  /** Tankerin bağlandığı üç renkli yeraltı tank dolum ağzı. */
  private addFuelDepotManifold(): void {
    const group = new THREE.Group();
    group.position.set(5.42, 0, FUEL_TANKER_BAY_Z);

    const base = new THREE.Mesh(
      new THREE.BoxGeometry(0.78, 0.1, 2.2),
      new THREE.MeshStandardMaterial({ color: 0x85837c, roughness: 0.94 }),
    );
    base.position.y = 0.07;
    base.receiveShadow = true;
    group.add(base);

    for (const [index, fuel] of (['dizel', 'benzin', 'lpg'] as const).entries()) {
      const info = findFuel(fuel);
      const cap = new THREE.Mesh(
        new THREE.CylinderGeometry(0.17, 0.2, 0.13, 10),
        new THREE.MeshStandardMaterial({
          color: info.color,
          emissive: info.color,
          emissiveIntensity: 0.22,
          roughness: 0.58,
          metalness: 0.3,
        }),
      );
      cap.position.set(0, 0.19, (index - 1) * 0.62);
      cap.castShadow = true;
      group.add(cap);
    }

    const guard = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.62, 2.35),
      new THREE.MeshStandardMaterial({ color: 0xd2a13d, roughness: 0.7 }),
    );
    guard.position.set(0.46, 0.34, 0);
    guard.castShadow = true;
    group.add(guard);
    this.scene.add(group);
  }

  /** İstasyonun sağına iki şeritli, kesik çizgili ana yol ekler. */
  private addRoad(): void {
    const roadMaterial = new THREE.MeshStandardMaterial({ color: ROAD_COLOR, roughness: 0.92 });
    const curbMaterial = new THREE.MeshStandardMaterial({ color: CURB_COLOR, roughness: 0.95 });
    const roadLineMaterial = new THREE.MeshStandardMaterial({ color: ROAD_LINE_COLOR, roughness: 0.8 });

    const road = new THREE.Mesh(new THREE.BoxGeometry(ROAD_WIDTH, 0.08, ROAD_LENGTH), roadMaterial);
    road.position.set(ROAD_X, 0.04, ROAD_CENTER_Z);
    road.receiveShadow = true;
    this.scene.add(road);

    const addCurbSegment = (x: number, startZ: number, endZ: number): void => {
      const length = endZ - startZ;
      if (length <= 0) return;
      const curb = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, length), curbMaterial);
      curb.position.set(x, 0.06, (startZ + endZ) / 2);
      curb.receiveShadow = true;
      this.scene.add(curb);
    };

    // İstasyon tarafındaki kaldırım giriş ve çıkışta kesilir; üstüne kalın bir
    // beton parça bindirmek yerine yol ve saha aynı seviyede birleşir.
    const roadStartZ = ROAD_CENTER_Z - ROAD_LENGTH / 2;
    const roadEndZ = ROAD_CENTER_Z + ROAD_LENGTH / 2;
    const gateHalfWidth = 1.02;
    const stationCurbX = ROAD_X - ROAD_WIDTH / 2;
    addCurbSegment(stationCurbX, roadStartZ, EXIT_Z - gateHalfWidth);
    addCurbSegment(
      stationCurbX,
      EXIT_Z + gateHalfWidth,
      ENTRY_Z - gateHalfWidth,
    );
    addCurbSegment(stationCurbX, ENTRY_Z + gateHalfWidth, roadEndZ);
    addCurbSegment(ROAD_X + ROAD_WIDTH / 2, roadStartZ, roadEndZ);

    // Ortadaki kesik sarı çizgi: araçların çift yönlü aktığı ilk bakışta anlaşılır.
    for (let z = ROAD_CENTER_Z - ROAD_LENGTH / 2 + 1.4; z < ROAD_CENTER_Z + ROAD_LENGTH / 2; z += 3.2) {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.025, 1.3), roadLineMaterial);
      stripe.position.set(ROAD_X, 0.095, z);
      this.scene.add(stripe);
    }

    // Aynı boğazı paylaşmayan iki ayrı, zemine gömülü kapı işareti.
    const drivewayLineMaterial = new THREE.MeshStandardMaterial({ color: LINE_COLOR, roughness: 0.85 });
    for (const z of [ENTRY_Z, EXIT_Z]) {
      const gateLine = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.025, 0.08), drivewayLineMaterial);
      gateLine.position.set(
        ROAD_X - ROAD_WIDTH / 2 - 0.55,
        0.08,
        z + (z === ENTRY_Z ? -0.54 : 0.54),
      );
      this.scene.add(gateLine);
    }

    this.addRoadsideBushes();
  }

  /** Kedi olayının okunabilmesi için yol kenarında birkaç çalı ekler. */
  private addRoadsideBushes(): void {
    for (const z of [-18, -15, -2, 6, 14, 23]) {
      const leftBush = createBush();
      leftBush.position.set(CAT_START_X - 0.28, 0.1, z);
      this.scene.add(leftBush);

      if (z % 2 === 0) {
        const rightBush = createBush(0.82);
        rightBush.position.set(CAT_END_X + 0.18, 0.1, z + 3.4);
        this.scene.add(rightBush);
      }
    }
  }

  /** Ana yoldaki araç havuzunu başlatır. Bu araçlar müşteri olarak istasyona da girebilir. */
  private addTraffic(): void {
    for (const seed of TRAFFIC_SEEDS) {
      const mesh = createCar(seed.color, seed.style);
      this.scene.add(mesh);
      this.registerTrafficCar(
        mesh,
        // Soldan trafikte her iki şerit de ters yöne akar; şerit x'leri sabit kalır.
        (activeTrafficSide === 'sag' ? seed.direction : -seed.direction) as TrafficDirection,
        seed.laneX,
        seed.z,
        seed.speed,
        seed.color,
        seed.style,
      );
    }
  }

  /** Bir mesh'i ana yol şeritlerinden birine ekler. Sahneye zaten eklenmiş olmalıdır. */
  private registerTrafficCar(
    mesh: THREE.Group,
    direction: TrafficDirection,
    laneX: number,
    preferredZ: number,
    baseSpeed: number,
    color: number,
    style: VehicleStyle,
  ): TrafficCar {
    mesh.scale.setScalar(TRAFFIC_CAR_SCALE);
    mesh.position.set(
      laneX,
      VEHICLE_Y,
      this.findClearTrafficPosition(direction, laneX, preferredZ),
    );
    // createCar varsayılan olarak -z yönüne bakar.
    mesh.rotation.y = direction === -1 ? 0 : Math.PI;
    mesh.userData.trafficColor = color;
    mesh.userData.vehicleStyle = style;
    setCarRunningLights(mesh, this.nightTime);
    setCarLightBeamsEnabled(mesh, false);
    setCarTurnSignal(mesh, null, false);

    const trafficCar: TrafficCar = {
      mesh,
      color,
      baseSpeed,
      style,
      direction,
      laneX,
      pace: 1,
      targetPace: randomBetween(0.78, 1.15),
      paceTimer: randomBetween(1.2, 3.6),
      highBeamTimer: 0,
      highBeamCooldown: randomBetween(0.3, 1.1),
      event: null,
    };
    this.trafficCars.push(trafficCar);
    return trafficCar;
  }

  /** Aynı şeritteki araçlardan emniyet mesafesi bırakan bir başlangıç noktası bulur. */
  private findClearTrafficPosition(
    direction: TrafficDirection,
    laneX: number,
    preferredZ: number,
    ignored?: TrafficCar,
  ): number {
    let position = preferredZ;
    // Yeni katılan araç, akış yönünün tersine doğru biraz geriye alınır.
    const backwardStep = direction === -1 ? MIN_TRAFFIC_GAP : -MIN_TRAFFIC_GAP;

    for (let attempt = 0; attempt < 12; attempt += 1) {
      const clear = this.trafficCars.every(
        (trafficCar) =>
          trafficCar === ignored ||
          trafficCar.direction !== direction ||
          trafficCar.laneX !== laneX ||
          Math.abs(trafficCar.mesh.position.z - position) >= MIN_TRAFFIC_GAP,
      );
      if (clear) return position;
      position += backwardStep;
    }

    return position;
  }

  /** Tanker gibi uzun bir aracı mevcut özel araçların arkasında güvenle başlatır. */
  private findClearInboundLongVehiclePosition(preferredZ: number): number {
    let position = preferredZ;
    const minimumGap = MIN_TRAFFIC_GAP * 1.8;
    for (let attempt = 0; attempt < 18; attempt += 1) {
      const trafficClear = this.trafficCars.every(
        (trafficCar) =>
          trafficCar.direction !== -1 ||
          trafficCar.laneX !== INBOUND_TRAFFIC_X ||
          Math.abs(trafficCar.mesh.position.z - position) >= minimumGap,
      );
      const specialMeshes = [
        this.rescueDelivery?.truck,
        this.emergencyVehicle?.mesh,
      ].filter((mesh): mesh is THREE.Group => mesh !== undefined);
      const specialClear = specialMeshes.every(
        (mesh) =>
          Math.abs(mesh.position.x - INBOUND_TRAFFIC_X) > 1.25 ||
          Math.abs(mesh.position.z - position) >= minimumGap,
      );
      if (trafficClear && specialClear) return position;
      position += minimumGap;
    }
    return position;
  }

  /** Trafikteki mesh'i yeni oluşan müşteriyle eşleştirir; yeni mesh yaratılmaz. */
  private transferTrafficCarToCustomer(trafficCar: TrafficCar, customer: Car): void {
    const trafficIndex = this.trafficCars.indexOf(trafficCar);
    if (trafficIndex >= 0) this.trafficCars.splice(trafficIndex, 1);

    const mesh = trafficCar.mesh;
    mesh.position.z = gateIn();
    mesh.userData.slotIndex = customer.slotIndex;
    mesh.userData.pickKind = 'car';
    setCarTurnSignal(mesh, 'right', true);
    this.carMeshes.set(customer.id, mesh);
    this.pickables.push(mesh);
  }

  /** İstasyonu terk eden müşteri aracını giden şeride geri verir. */
  private returnCustomerToTraffic(mesh: THREE.Group): void {
    const pickableIndex = this.pickables.indexOf(mesh);
    if (pickableIndex >= 0) this.pickables.splice(pickableIndex, 1);

    const color = typeof mesh.userData.trafficColor === 'number' ? mesh.userData.trafficColor : 0xe8e6e1;
    delete mesh.userData.slotIndex;
    delete mesh.userData.pickKind;
    setCarTurnSignal(mesh, null, false);
    this.registerTrafficCar(
      mesh,
      // Çıkış kapısı karşı şeride açılır; o şerit akışın tersini taşır.
      -flow() as TrafficDirection,
      OUTBOUND_TRAFFIC_X,
      gateOut(),
      randomBetween(3.35, 4.25),
      color,
      vehicleStyleOf(mesh),
    );
  }

  private rescueBlocksStationRoutes(): boolean {
    const delivery = this.rescueDelivery;
    if (
      delivery === null ||
      delivery.phase === 'road' ||
      delivery.phase === 'waiting'
    ) {
      return false;
    }
    return delivery.phase !== 'departing' || delivery.progress < RESCUE_RELEASE_EXIT_PROGRESS;
  }

  private fuelDeliveryBlocksStationRoutes(): boolean {
    const delivery = this.fuelDelivery;
    if (delivery === null || delivery.phase === 'road') return false;
    return (
      delivery.phase !== 'departing' ||
      delivery.progress < FUEL_TANKER_ROUTE_RELEASE_PROGRESS
    );
  }

  /** Tanker, normal araçtan uzun olduğu için çarpışma hesabında kendi iziyle bakılır. */
  private fuelTankerTransform(transform: CarTransform): CarTransform {
    return {
      ...transform,
      halfWidth: FUEL_TANKER_HALF_WIDTH,
      halfLength: FUEL_TANKER_HALF_LENGTH,
    };
  }

  /** Tanker bir sonraki noktaya geçmeden tüm araç gövdelerine karşı güvenlik kontrolü yapar. */
  private canAdvanceFuelTanker(
    delivery: FuelDelivery,
    next: CarTransform,
  ): boolean {
    const proposed = this.fuelTankerTransform(next);
    const overlaps = (mesh: THREE.Group, margin: number): boolean =>
      vehicleBodiesOverlap(
        proposed,
        {
          x: mesh.position.x,
          z: mesh.position.z,
          rotation: mesh.rotation.y,
        },
        margin,
      );

    for (const car of this.carMeshes.values()) {
      if (car !== delivery.truck && overlaps(car, 0.42)) return false;
    }
    for (const trafficCar of this.trafficCars) {
      if (overlaps(trafficCar.mesh, 0.48)) return false;
      const towTruck = trafficCar.event?.towTruck;
      if (towTruck !== undefined && overlaps(towTruck, 0.5)) return false;
    }

    const rescue = this.rescueDelivery;
    if (rescue !== null) {
      if (overlaps(rescue.truck, 0.54)) return false;
      if (!rescue.delivered && overlaps(rescue.car, 0.42)) return false;
    }
    if (this.emergencyVehicle !== null && overlaps(this.emergencyVehicle.mesh, 0.52)) {
      return false;
    }
    return true;
  }

  private refreshStationRouteOwner(cars: readonly Car[]): void {
    if (this.stationRouteOwnerId === null) return;
    const owner = cars.find((car) => car.id === this.stationRouteOwnerId);
    if (
      owner !== undefined &&
      (owner.phase === 'arriving' || owner.phase === 'leaving')
    ) {
      return;
    }
    this.stationRouteOwnerId = null;
  }

  /**
   * İstasyon içindeki ortak koridora yalnızca bir hareketli araç rezervasyon
   * alabilir. Yol birleşiminde ayrıca gerçek araç gövdeleriyle çakışma aranır.
   */
  canAdvanceStationCar(
    car: Car,
    nextProgress: number,
    cars: Iterable<Car>,
  ): boolean {
    const carList = [...cars];
    this.refreshStationRouteOwner(carList);

    // Tanker giriş ağzında beklerken o anda yolda olan müşteri kendi cebine
    // ulaşabilsin; aksi halde tanker onu beklerken müşteri de tankeri bekleyip
    // kalıcı kilit oluşturuyordu. Yeni girişler yine aşağıdaki trafik kapısında
    // tutulur.
    const tankerBlocksMovingCars =
      this.fuelDeliveryBlocksStationRoutes() &&
      this.fuelDelivery?.phase !== 'waiting';
    if (this.rescueBlocksStationRoutes() || tankerBlocksMovingCars) {
      return false;
    }
    if (car.phase === 'leaving' && this.emergencyVehicle !== null) return false;

    if (this.stationRouteOwnerId === null) {
      const candidates = carList
        .filter(
          (candidate) =>
            !candidate.deliveryPending &&
            (
              candidate.phase === 'arriving' ||
              (candidate.phase === 'leaving' && this.emergencyVehicle === null)
            ),
        )
        .sort((a, b) => {
          if (a.phase !== b.phase) return a.phase === 'leaving' ? -1 : 1;
          if (a.progress !== b.progress) return b.progress - a.progress;
          return a.id - b.id;
        });
      this.stationRouteOwnerId = candidates[0]?.id ?? null;
    }
    if (this.stationRouteOwnerId !== car.id) return false;

    const slot = findSlot(car.slotIndex);
    if (slot === undefined) return false;
    const proposed = carTransformAt(car, slot, nextProgress);

    for (const other of carList) {
      if (other.id === car.id) continue;
      const otherSlot = findSlot(other.slotIndex);
      if (otherSlot === undefined) continue;
      const mesh = this.carMeshes.get(other.id);
      const occupied = mesh === undefined
        ? carTransform(other, otherSlot)
        : {
            x: mesh.position.x,
            z: mesh.position.z,
            rotation: mesh.rotation.y,
          };
      if (vehicleBodiesOverlap(proposed, occupied, 0.12)) return false;
    }

    // Ayrı çıkış kapısına yaklaşan araç, ana yoldaki gerçek boşluğu görmeden
    // ilerlemez. Böylece yola katılırken bir NPC'nin üzerine ışınlanmaz.
    if (car.phase === 'leaving' && nextProgress > 0.56) {
      for (const trafficCar of this.trafficCars) {
        const occupied = {
          x: trafficCar.mesh.position.x,
          z: trafficCar.mesh.position.z,
          rotation: trafficCar.mesh.rotation.y,
        };
        if (vehicleBodiesOverlap(proposed, occupied, 0.38)) return false;

        const towTruck = trafficCar.event?.towTruck;
        if (
          towTruck !== undefined &&
          vehicleBodiesOverlap(
            proposed,
            { x: towTruck.position.x, z: towTruck.position.z, rotation: towTruck.rotation.y },
            0.38,
          )
        ) {
          return false;
        }
      }

      const rescue = this.rescueDelivery;
      if (
        rescue !== null &&
        (
          vehicleBodiesOverlap(
            proposed,
            {
              x: rescue.truck.position.x,
              z: rescue.truck.position.z,
              rotation: rescue.truck.rotation.y,
            },
            0.45,
          ) ||
          (
            !rescue.delivered &&
            vehicleBodiesOverlap(
              proposed,
              {
                x: rescue.car.position.x,
                z: rescue.car.position.z,
                rotation: rescue.car.rotation.y,
              },
              0.32,
            )
          )
        )
      ) {
        return false;
      }

      const fuelTruck = this.fuelDelivery?.truck;
      if (
        fuelTruck !== undefined &&
        vehicleBodiesOverlap(
          proposed,
          this.fuelTankerTransform({
            x: fuelTruck.position.x,
            z: fuelTruck.position.z,
            rotation: fuelTruck.rotation.y,
          }),
          0.55,
        )
      ) {
        return false;
      }
    }

    return true;
  }

  /**
   * Arsanın yol dışındaki üç kenarına kaldırım çeker. Yol tarafındaki kenar
   * addRoad() içinde, giriş/çıkış kapıları için boşluk bırakılarak kuruluyor.
   */
  private addLotBoundary(): void {
    const material = new THREE.MeshStandardMaterial({ color: 0xb9b5aa, roughness: 0.92 });
    const height = 0.16;
    const thickness = 0.16;

    const left = LOT_CENTER_X - LOT_WIDTH / 2;
    const near = LOT_CENTER_Z + LOT_DEPTH / 2;
    const far = LOT_CENTER_Z - LOT_DEPTH / 2;

    const addEdge = (
      width: number,
      depth: number,
      x: number,
      z: number,
    ): void => {
      const edge = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
      edge.position.set(x, height / 2, z);
      edge.castShadow = true;
      edge.receiveShadow = true;
      this.scene.add(edge);
    };

    addEdge(thickness, LOT_DEPTH, left, LOT_CENTER_Z);
    addEdge(LOT_WIDTH, thickness, LOT_CENTER_X, near);
    addEdge(LOT_WIDTH, thickness, LOT_CENTER_X, far);
  }

  private addIslands(): void {
    for (const slot of SLOTS) {
      const island = new PumpIsland(slot.index, slot.pumpX, slot.z);
      island.group.userData.pickKind = 'pump';
      this.islands.set(slot.index, island);
      this.scene.add(island.group);
      this.pickables.push(island.group);
    }
  }

  /** Motordaki arabalarla sahnedeki mesh'leri eşitler. */
  syncCars(cars: Iterable<Car>): void {
    const carList = [...cars];
    this.refreshStationRouteOwner(carList);
    const alive = this.aliveCarIds;
    alive.clear();

    // Bir önceki karede dolan hortumu kapat; aktif dolum aşağıda yeniden açılır.
    for (const island of this.islands.values()) island.setFueling(null);

    for (const car of carList) {
      alive.add(car.id);

      let mesh = this.carMeshes.get(car.id);
      if (mesh === undefined) {
        // Normal akışta bu dal çalışmaz: müşteri mesh'i trafikten devralınır.
        // Geliştirme konsolundan elle araba eklenirse sahne yine çalışsın.
        mesh = createCar(car.color);
        mesh.scale.setScalar(TRAFFIC_CAR_SCALE);
        mesh.userData.trafficColor = car.color;
        mesh.userData.slotIndex = car.slotIndex;
        mesh.userData.pickKind = 'car';
        setCarRunningLights(mesh, this.nightTime);
        setCarLightBeamsEnabled(mesh, false);
        this.carMeshes.set(car.id, mesh);
        this.scene.add(mesh);
        this.pickables.push(mesh);
      }

      const slot = findSlot(car.slotIndex);
      if (slot === undefined) continue;

      if (car.deliveryPending) {
        const signalPulse = Math.floor(this.elapsedWorldTime * 2.4) % 2 === 0;
        setCarTurnSignal(mesh, 'right', signalPulse);
        continue;
      }

      const transform = carTransform(car, slot);
      mesh.position.set(transform.x, VEHICLE_Y, transform.z);
      mesh.rotation.y = transform.rotation;

      const signalPulse = Math.floor(this.elapsedWorldTime * 2.4) % 2 === 0;
      if (car.phase === 'arriving') {
        setCarTurnSignal(mesh, 'right', signalPulse);
      } else if (car.phase === 'leaving') {
        setCarTurnSignal(mesh, 'left', signalPulse);
      } else {
        setCarTurnSignal(mesh, null, false);
      }

      if (car.phase === 'filling') {
        this.islands.get(car.slotIndex)?.setFueling(car.fuel, car.fillProgress);
      }
    }

    for (const [id, mesh] of [...this.carMeshes]) {
      if (alive.has(id)) continue;

      this.carMeshes.delete(id);
      this.returnCustomerToTraffic(mesh);
    }
  }

  /**
   * NPC arabalarını ana yol boyunca akıtır. Her araç periyodik olarak hızlanır
   * veya yavaşlar; öndeki araca yaklaşınca takip mesafesini korur.
   */
  updateTraffic(deltaSeconds: number): void {
    this.ambient.update(deltaSeconds);
    this.updateDayNight(deltaSeconds);
    this.updateMarketConstruction(deltaSeconds);
    this.updateProtest(deltaSeconds);
    this.updateCatEvent(deltaSeconds);
    this.updateRoadwork(deltaSeconds);
    this.updateEmergencyVehicle(deltaSeconds);
    this.updateFuelDelivery(deltaSeconds);
    this.updateRescueDelivery(deltaSeconds);

    this.nextRescueDeliveryIn -= deltaSeconds;
    if (this.nextRescueDeliveryIn <= 0) {
      const rescueStarted = this.startRescueDelivery();
      this.nextRescueDeliveryIn = rescueStarted
        ? randomBetween(28, 44)
        : randomBetween(4, 7);
    }

    if (this.roadwork === null) {
      this.nextRoadworkIn -= deltaSeconds;
      if (this.nextRoadworkIn <= 0) {
        const started = this.startRoadwork();
        this.nextRoadworkIn = started
          ? randomBetween(56, 84)
          : randomBetween(8, 15);
      }
    }

    this.nextEmergencyVehicleIn -= deltaSeconds;
    if (this.nextEmergencyVehicleIn <= 0) {
      const emergencyStarted = this.startEmergencyVehicle();
      this.nextEmergencyVehicleIn = emergencyStarted
        ? randomBetween(38, 64)
        : randomBetween(8, 14);
    }

    this.nextTrafficEventIn -= deltaSeconds;
    if (this.nextTrafficEventIn <= 0) {
      this.startRandomTrafficEvent();
      this.nextTrafficEventIn = randomBetween(4.5, 8.5);
    }

    for (const trafficCar of [...this.trafficCars]) {
      this.updateTrafficPace(trafficCar, deltaSeconds);

      const previousX = trafficCar.mesh.position.x;
      const previousZ = trafficCar.mesh.position.z;
      const eventSpeed = this.updateTrafficEvent(trafficCar, deltaSeconds);
      if (trafficCar.event?.kind === 'breakdown' && trafficCar.event.towComplete === true) {
        this.completeBreakdownTow(trafficCar, trafficCar.event);
        continue;
      }
      const catStoppingDistance = this.catStoppingDistance(trafficCar);
      const catBrake = this.catBrakeMultiplier(catStoppingDistance);
      const roadworkStoppingDistance = this.roadworkStoppingDistance(trafficCar);
      const roadworkBrake = this.roadworkBrakeMultiplier(roadworkStoppingDistance);
      const emergencyBrake = this.emergencyYieldMultiplier(trafficCar, deltaSeconds);
      const desiredDistance =
        trafficCar.baseSpeed *
        trafficCar.pace *
        eventSpeed *
        catBrake *
        roadworkBrake *
        emergencyBrake *
        this.ambient.trafficSpeedMultiplier *
        deltaSeconds;
      const roadTrafficHeadway = trafficCar.event?.kind === 'overtake'
        ? TRAFFIC_MAX_Z - TRAFFIC_MIN_Z
        : this.trafficHeadway(trafficCar);
      const headway = Math.min(
        roadTrafficHeadway,
        this.stationCarHeadway(trafficCar),
      );
      const distance = Math.min(
        desiredDistance,
        Math.max(0, headway - MIN_TRAFFIC_GAP),
        catStoppingDistance ?? Number.POSITIVE_INFINITY,
        roadworkStoppingDistance ?? Number.POSITIVE_INFINITY,
      );
      const nextZ = previousZ + trafficCar.direction * distance;

      // İstasyona sadece giriş şeridinden, gerçek bir araç eriştiğinde müşteri gelir.
      if (
        this.emergencyVehicle === null &&
        this.stationRouteOwnerId === null &&
        !this.rescueBlocksStationRoutes() &&
        !this.fuelDeliveryBlocksStationRoutes() &&
        this.rescueDelivery?.phase !== 'waiting' &&
        trafficCar.event === null &&
        trafficCar.direction === flow() &&
        crossedAlongFlow(previousZ, nextZ, gateIn())
      ) {
        const customer = this.onTrafficCarAtEntrance?.(trafficCar.color) ?? null;
        if (customer !== null) {
          this.transferTrafficCarToCustomer(trafficCar, customer);
          continue;
        }
      }

      trafficCar.mesh.position.z = nextZ;
      this.syncBreakdownTowTruck(trafficCar);
      this.updateTrafficHeading(
        trafficCar,
        trafficCar.mesh.position.x - previousX,
        nextZ - previousZ,
        deltaSeconds,
      );
      this.updateFollowerHighBeam(
        trafficCar,
        desiredDistance,
        distance,
        headway,
        deltaSeconds,
      );

      if (trafficCar.direction === -1 && nextZ < TRAFFIC_MIN_Z) {
        this.recycleTrafficCar(trafficCar, 1, TRAFFIC_MIN_Z);
      }

      if (trafficCar.direction === 1 && nextZ > TRAFFIC_MAX_Z) {
        this.recycleTrafficCar(trafficCar, -1, TRAFFIC_MAX_Z);
      }
    }

    this.updateVehicleLightBudget(deltaSeconds);
  }

  /** Protestocular kapıda görünmek yerine tek tek yürüyerek toplanır ve dağılır. */
  private updateProtest(deltaSeconds: number): void {
    const people = this.protestGroup.children.filter(
      (child): child is THREE.Group => child instanceof THREE.Group,
    );
    if (people.length === 0) return;

    this.protestWalkerIn = Math.max(0, this.protestWalkerIn - deltaSeconds);
    if (this.protestRequested) {
      this.protestChangeIn -= deltaSeconds;
      if (this.protestChangeIn <= 0) {
        const direction = Math.random() < 0.5 ? -1 : 1;
        this.protestTargetCount = Math.max(
          2,
          Math.min(people.length, this.protestTargetCount + direction),
        );
        this.protestChangeIn = randomBetween(4.5, 8.5);
      }
    } else {
      this.protestTargetCount = 0;
    }

    const counted = people.filter((person) => {
      const state = person.userData.protestState;
      return state === 'entering' || state === 'holding';
    });
    if (this.protestWalkerIn <= 0 && counted.length < this.protestTargetCount) {
      const next = people.find((person) => person.userData.protestState === 'outside');
      if (next !== undefined) {
        this.startProtester(next);
        this.protestWalkerIn = 0.52;
      }
    } else if (this.protestWalkerIn <= 0 && counted.length > this.protestTargetCount) {
      const next = counted.find((person) => person.userData.protestState === 'holding') ?? counted[0];
      if (next !== undefined) {
        this.sendProtesterHome(next);
        this.protestWalkerIn = 0.44;
      }
    }

    let somebodyVisible = false;
    for (const person of people) {
      const state = person.userData.protestState;
      const offset = typeof person.userData.protestOffset === 'number'
        ? person.userData.protestOffset
        : 0;
      const homeX = typeof person.userData.protestHomeX === 'number'
        ? person.userData.protestHomeX
        : person.position.x;
      const homeZ = typeof person.userData.protestHomeZ === 'number'
        ? person.userData.protestHomeZ
        : person.position.z;
      const spawnX = typeof person.userData.protestSpawnX === 'number'
        ? person.userData.protestSpawnX
        : homeX - 5;
      const spawnZ = typeof person.userData.protestSpawnZ === 'number'
        ? person.userData.protestSpawnZ
        : homeZ - 2;

      if (state === 'entering') {
        const progress = Math.min(
          1,
          (typeof person.userData.protestProgress === 'number'
            ? person.userData.protestProgress
            : 0) + deltaSeconds / (this.reduceMotion ? 0.35 : 2.45),
        );
        person.userData.protestProgress = progress;
        person.position.x = lerp(spawnX, homeX, smooth(progress));
        person.position.z = lerp(spawnZ, homeZ, smooth(progress));
        if (progress >= 1) person.userData.protestState = 'holding';
      } else if (state === 'leaving') {
        const progress = Math.min(
          1,
          (typeof person.userData.protestProgress === 'number'
            ? person.userData.protestProgress
            : 0) + deltaSeconds / (this.reduceMotion ? 0.3 : 2.15),
        );
        person.userData.protestProgress = progress;
        const fromX = typeof person.userData.protestFromX === 'number'
          ? person.userData.protestFromX
          : homeX;
        const fromZ = typeof person.userData.protestFromZ === 'number'
          ? person.userData.protestFromZ
          : homeZ;
        person.position.x = lerp(fromX, spawnX, smooth(progress));
        person.position.z = lerp(fromZ, spawnZ, smooth(progress));
        if (progress >= 1) {
          person.userData.protestState = 'outside';
          person.visible = false;
          continue;
        }
      } else if (state === 'outside') {
        person.visible = false;
        continue;
      }

      person.visible = true;
      somebodyVisible = true;
      const walking = person.userData.protestState === 'entering' || person.userData.protestState === 'leaving';
      person.position.y = walking
        ? Math.abs(Math.sin(this.elapsedWorldTime * 7 + offset)) * 0.045
        : 0;
      person.rotation.z = walking
        ? Math.sin(this.elapsedWorldTime * 6.4 + offset) * 0.08
        : Math.sin(this.elapsedWorldTime * 2.7 + offset) * 0.035;
    }
    this.protestGroup.visible = somebodyVisible;
  }

  private startProtester(person: THREE.Group): void {
    const spawnX = typeof person.userData.protestSpawnX === 'number'
      ? person.userData.protestSpawnX
      : person.position.x - 5;
    const spawnZ = typeof person.userData.protestSpawnZ === 'number'
      ? person.userData.protestSpawnZ
      : person.position.z - 2;
    person.position.set(spawnX, 0, spawnZ);
    person.userData.protestState = 'entering';
    person.userData.protestProgress = 0;
    person.visible = true;
  }

  private sendProtesterHome(person: THREE.Group): void {
    person.userData.protestState = 'leaving';
    person.userData.protestProgress = 0;
    person.userData.protestFromX = person.position.x;
    person.userData.protestFromZ = person.position.z;
  }

  /** Hızlandırılmış dünya saati; ışıklar ve araç farları alacakaranlıkta devreye girer. */
  private updateDayNight(deltaSeconds: number): void {
    this.elapsedWorldTime += deltaSeconds;
    this.daylightVisualTimer -= deltaSeconds;
    if (deltaSeconds > 0 && this.daylightVisualTimer > 0) return;
    this.daylightVisualTimer = 0.08;

    // 06:00 doğum, 12:00 tepe, 18:00 batım. Alacakaranlıkta yumuşak geçiş.
    const solarHeight = Math.sin((this.dayPhase - 0.25) * Math.PI * 2);
    const daylight = smooth((solarHeight + 0.18) / 0.5);
    const wasNight = this.nightTime;
    this.nightTime = daylight < 0.3;

    if (this.scene.background instanceof THREE.Color) {
      this.scene.background
        .copy(this.nightSkyColor)
        .lerp(this.daySkyColor, daylight)
        .lerp(this.rainSkyColor, this.ambient.rainStrength * 0.56);
    }

    const rainDim = 1 - this.ambient.rainStrength * 0.26;
    this.hemisphereLight.intensity = lerp(0.28, 1.6, daylight) * rainDim;
    this.hemisphereLight.color.setHex(this.nightTime ? 0x7187ad : 0xdce9f5);
    this.hemisphereLight.groundColor.setHex(this.nightTime ? 0x172233 : 0x5a5f66);
    this.sunLight.intensity =
      lerp(0.04, 2.1, daylight) *
      (1 - this.ambient.rainStrength * 0.68);
    this.sunLight.color.setHex(daylight < 0.55 ? 0xffb86c : 0xfff3dd);
    this.sunLight.position.set(
      Math.cos(this.dayPhase * Math.PI * 2) * 11,
      Math.max(2.2, 15 * Math.max(0.08, solarHeight)),
      Math.sin(this.dayPhase * Math.PI * 2) * 9,
    );
    this.renderer.toneMappingExposure =
      lerp(0.72, 1.08, daylight) *
      (1 - this.ambient.rainStrength * 0.12);

    for (const entry of this.stationNightLights) {
      entry.light.intensity = lerp(entry.nightIntensity, 0, daylight);
    }
    this.ambient.setDaylight(daylight);

    if (wasNight !== this.nightTime) this.applyRunningLights();
  }

  private applyRunningLights(): void {
    for (const trafficCar of this.trafficCars) {
      setCarRunningLights(trafficCar.mesh, this.nightTime);
    }
    for (const car of this.carMeshes.values()) {
      setCarRunningLights(car, this.nightTime);
    }
    if (this.emergencyVehicle !== null) {
      setCarRunningLights(this.emergencyVehicle.mesh, this.nightTime);
    }
    if (this.rescueDelivery !== null) {
      setCarRunningLights(this.rescueDelivery.truck, this.nightTime);
      setCarRunningLights(this.rescueDelivery.car, this.nightTime);
    }
    if (this.fuelDelivery !== null) {
      setCarRunningLights(this.fuelDelivery.truck, this.nightTime);
    }
    for (const trafficCar of this.trafficCars) {
      const towTruck = trafficCar.event?.towTruck;
      if (towTruck !== undefined) setCarRunningLights(towTruck, this.nightTime);
    }
  }

  /**
   * Gerçek SpotLight'lar yalnızca kameraya yakın birkaç araçta açık kalır.
   * Far yüzeyleri bütün gece emissive görünür; pahalı yol aydınlatması bütçelenir.
   */
  private updateVehicleLightBudget(deltaSeconds: number): void {
    this.lightBudgetTimer -= deltaSeconds;
    if (this.lightBudgetTimer > 0) return;
    this.lightBudgetTimer = 0.12;

    const candidates: Array<{ mesh: THREE.Group; priority: number }> = [];
    const allMeshes = new Set<THREE.Group>();
    const addCandidate = (mesh: THREE.Group, priority: number): void => {
      allMeshes.add(mesh);
      if (Math.abs(mesh.position.z) <= ACTIVE_HEADLIGHT_RANGE_Z) {
        candidates.push({ mesh, priority: priority - Math.abs(mesh.position.z) });
      }
    };

    for (const trafficCar of this.trafficCars) {
      addCandidate(trafficCar.mesh, trafficCar.highBeamTimer > 0 ? 130 : 30);
      const towTruck = trafficCar.event?.towTruck;
      if (towTruck !== undefined) addCandidate(towTruck, 55);
    }
    for (const mesh of this.carMeshes.values()) addCandidate(mesh, 110);
    if (this.emergencyVehicle !== null) addCandidate(this.emergencyVehicle.mesh, 120);
    if (this.rescueDelivery !== null) {
      addCandidate(this.rescueDelivery.truck, 85);
      if (!this.rescueDelivery.delivered) addCandidate(this.rescueDelivery.car, 65);
    }
    if (this.fuelDelivery !== null) addCandidate(this.fuelDelivery.truck, 92);

    candidates.sort((a, b) => b.priority - a.priority);
    const vehicleBudget = this.isMobileDevice ? 4 : 6;
    const enabled = new Set(
      this.nightTime
        ? candidates.slice(0, vehicleBudget).map((candidate) => candidate.mesh)
        : [],
    );
    for (const mesh of allMeshes) {
      setCarLightBeamsEnabled(mesh, enabled.has(mesh));
    }
  }

  /**
   * Ücreti ödenen ikmali başlatır. Çıkıştaki tanker hâlâ yoldaysa sipariş
   * sıraya alınır; iki uzun araç aynı şeritte üst üste doğmaz.
   */
  startFuelDelivery(fuel: FuelType): 'started' | 'queued' | 'busy' {
    const current = this.fuelDelivery;
    if (current !== null) {
      if (current.phase !== 'departing' || this.queuedFuelDelivery !== null) {
        return 'busy';
      }
      this.queuedFuelDelivery = fuel;
      return 'queued';
    }

    this.launchFuelDelivery(fuel);
    return 'started';
  }

  private launchFuelDelivery(fuel: FuelType): void {
    const truck = createFuelTanker(fuel);
    truck.scale.setScalar(0.88);
    truck.position.set(
      INBOUND_TRAFFIC_X,
      VEHICLE_Y,
      this.findClearInboundLongVehiclePosition(FUEL_TANKER_ROUTE_LIMIT),
    );
    truck.rotation.y = 0;
    truck.userData.trafficColor = findFuel(fuel).color;
    setCarRunningLights(truck, this.nightTime);
    setCarLightBeamsEnabled(truck, false);
    setCarHazards(truck, false);
    setFuelTankerUnloading(truck, 0);
    this.scene.add(truck);

    this.fuelDelivery = {
      truck,
      fuel,
      speed: 2.85,
      phase: 'road',
      z: truck.position.z,
      progress: 0,
      elapsed: 0,
      completed: false,
      entryRoute: null,
      exitRoute: null,
    };
  }

  private updateFuelDelivery(deltaSeconds: number): void {
    const delivery = this.fuelDelivery;
    if (delivery === null) return;
    delivery.elapsed += deltaSeconds;
    const signalPulse = Math.floor(delivery.elapsed * 2.25) % 2 === 0;

    if (delivery.phase === 'road') {
      const previousZ = delivery.z;
      let headway = Number.POSITIVE_INFINITY;
      for (const trafficCar of this.trafficCars) {
        if (trafficCar.direction !== -1 || trafficCar.laneX !== INBOUND_TRAFFIC_X) {
          continue;
        }
        const ahead = delivery.z - trafficCar.mesh.position.z;
        if (ahead > 0) headway = Math.min(headway, ahead);
      }
      const rescue = this.rescueDelivery;
      if (
        rescue !== null &&
        (rescue.phase === 'road' || rescue.phase === 'waiting') &&
        Math.abs(rescue.truck.position.x - INBOUND_TRAFFIC_X) < 1
      ) {
        const rescueAhead = delivery.z - rescue.truck.position.z;
        if (rescueAhead > 0) headway = Math.min(headway, rescueAhead);
        const carriedCarAhead = delivery.z - rescue.car.position.z;
        if (carriedCarAhead > 0) headway = Math.min(headway, carriedCarAhead);
      }

      const entryRoute = delivery.entryRoute ?? this.createFuelDeliveryEntryRoute();
      delivery.entryRoute = entryRoute;
      const entryPathBlocked = !this.canAdvanceFuelTanker(
        delivery,
        sampleStationRoute(entryRoute, 0.035),
      );
      const entryBlocked =
        this.stationRouteOwnerId !== null ||
        this.rescueBlocksStationRoutes() ||
        this.emergencyVehicle !== null ||
        entryPathBlocked;
      let distance = Math.min(
        delivery.speed * deltaSeconds,
        Math.max(0, headway - MIN_TRAFFIC_GAP * 1.7),
      );
      if (entryBlocked) {
        distance = Math.min(
          distance,
          Math.max(0, flow() * (fuelTankerEntryStopZ() - delivery.z)),
        );
      }
      delivery.z += flow() * distance;
      delivery.truck.position.set(INBOUND_TRAFFIC_X, VEHICLE_Y, delivery.z);
      setCarTurnSignal(delivery.truck, 'right', signalPulse);

      if (!entryBlocked && crossedAlongFlow(previousZ, delivery.z, ENTRY_Z)) {
        delivery.phase = 'entering';
        delivery.progress = 0;
        delivery.elapsed = 0;
        delivery.entryRoute = entryRoute;
        return;
      }
      if (entryBlocked && flow() * (delivery.z - fuelTankerEntryStopZ()) >= -0.01) {
        delivery.phase = 'waiting';
        delivery.z = fuelTankerEntryStopZ();
        delivery.elapsed = 0;
        // Bekleme noktası giriş çizgisinden daha yukarıda olduğu için, bir
        // sonraki rota bu gerçek noktadan yeniden kurulacak.
        delivery.entryRoute = null;
      }
      return;
    }

    if (delivery.phase === 'waiting') {
      delivery.truck.position.set(
        INBOUND_TRAFFIC_X,
        VEHICLE_Y,
        fuelTankerEntryStopZ(),
      );
      setCarHazards(
        delivery.truck,
        Math.floor(delivery.elapsed * 2.2) % 2 === 0,
      );
      const entryRoute = delivery.entryRoute ?? this.createFuelDeliveryEntryRoute(
        fuelTankerEntryStopZ(),
      );
      delivery.entryRoute = entryRoute;
      if (
        this.stationRouteOwnerId !== null ||
        this.rescueBlocksStationRoutes() ||
        this.emergencyVehicle !== null ||
        !this.canAdvanceFuelTanker(delivery, sampleStationRoute(entryRoute, 0.035)) ||
        delivery.elapsed < 0.65
      ) {
        return;
      }
      setCarHazards(delivery.truck, false);
      delivery.phase = 'entering';
      delivery.progress = 0;
      delivery.elapsed = 0;
      delivery.entryRoute = entryRoute;
      return;
    }

    if (delivery.phase === 'entering') {
      const route = delivery.entryRoute;
      if (route === null) return;
      const nextProgress = Math.min(1, delivery.progress + deltaSeconds / 4.6);
      const transform = sampleStationRoute(route, nextProgress);
      if (!this.canAdvanceFuelTanker(delivery, transform)) {
        setCarHazards(delivery.truck, signalPulse);
        return;
      }
      delivery.progress = nextProgress;
      delivery.truck.position.set(transform.x, VEHICLE_Y, transform.z);
      delivery.truck.rotation.y = transform.rotation;
      setCarHazards(delivery.truck, false);
      setCarTurnSignal(delivery.truck, 'right', signalPulse);

      if (delivery.progress < 1) return;
      delivery.phase = 'unloading';
      delivery.progress = 0;
      delivery.elapsed = 0;
      setCarTurnSignal(delivery.truck, null, false);
      setCarHazards(delivery.truck, true);
      return;
    }

    if (delivery.phase === 'unloading') {
      const hoseIn = smooth(Math.min(1, delivery.elapsed / 0.85));
      const hoseOut = smooth(
        Math.min(
          1,
          Math.max(0, (FUEL_TANKER_UNLOAD_SECONDS - delivery.elapsed) / 0.85),
        ),
      );
      setFuelTankerUnloading(delivery.truck, Math.min(hoseIn, hoseOut));
      setCarHazards(
        delivery.truck,
        Math.floor(delivery.elapsed * 2.25) % 2 === 0,
      );
      if (delivery.elapsed < FUEL_TANKER_UNLOAD_SECONDS) return;

      setFuelTankerUnloading(delivery.truck, 0);
      if (!delivery.completed) {
        delivery.completed = true;
        this.onFuelDeliveryComplete?.(delivery.fuel);
      }
      delivery.phase = 'departing';
      delivery.progress = 0;
      delivery.elapsed = 0;
      delivery.exitRoute = this.createFuelDeliveryExitRoute(
        delivery.truck.position,
      );
      setCarHazards(delivery.truck, false);
      return;
    }

    const route = delivery.exitRoute;
    if (route === null) return;
    const nextProgress = Math.min(1, delivery.progress + deltaSeconds / 8.8);
    const transform = sampleStationRoute(route, nextProgress);
    if (!this.canAdvanceFuelTanker(delivery, transform)) {
      setCarHazards(delivery.truck, signalPulse);
      return;
    }
    delivery.progress = nextProgress;
    delivery.truck.position.set(transform.x, VEHICLE_Y, transform.z);
    delivery.truck.rotation.y = transform.rotation;
    setCarHazards(delivery.truck, false);
    setCarTurnSignal(delivery.truck, 'left', signalPulse);

    if (delivery.progress < 1) return;
    this.scene.remove(delivery.truck);
    disposeEffect(delivery.truck);
    this.fuelDelivery = null;

    const queuedFuel = this.queuedFuelDelivery;
    this.queuedFuelDelivery = null;
    if (queuedFuel !== null) this.launchFuelDelivery(queuedFuel);
  }

  private createFuelDeliveryEntryRoute(
    startZ = ENTRY_Z,
  ): THREE.CatmullRomCurve3 {
    const route = new THREE.CatmullRomCurve3(
      [
        new THREE.Vector3(INBOUND_TRAFFIC_X, 0, startZ),
        new THREE.Vector3(ROAD_X - ROAD_WIDTH / 2 + 0.08, 0, ENTRY_Z - 0.15),
        new THREE.Vector3(5.15, 0, ENTRY_Z + 0.7),
        new THREE.Vector3(FUEL_TANKER_BAY_X, 0, 13.35),
        new THREE.Vector3(FUEL_TANKER_BAY_X, 0, FUEL_TANKER_BAY_Z),
      ],
      false,
      'centripetal',
    );
    route.arcLengthDivisions = 96;
    return route;
  }

  private createFuelDeliveryExitRoute(
    from: THREE.Vector3,
  ): THREE.CatmullRomCurve3 {
    const route = new THREE.CatmullRomCurve3(
      [
        new THREE.Vector3(from.x, 0, from.z),
        new THREE.Vector3(3.55, 0, FUEL_TANKER_BAY_Z + 0.45),
        new THREE.Vector3(3.45, 0, 17.0),
        new THREE.Vector3(4.7, 0, 17.9),
        new THREE.Vector3(6.25, 0, 17.7),
        new THREE.Vector3(OUTBOUND_TRAFFIC_X - 0.26, 0, 16.8),
        new THREE.Vector3(OUTBOUND_TRAFFIC_X, 0, 18.4),
        new THREE.Vector3(OUTBOUND_TRAFFIC_X, 0, FUEL_TANKER_ROUTE_LIMIT),
      ],
      false,
      'centripetal',
    );
    route.arcLengthDivisions = 128;
    return route;
  }

  /** Yolda yakıtı biten aracı, görünür bir çekiciyle istasyona getirir. */
  private startRescueDelivery(): boolean {
    if (
      this.rescueDelivery !== null ||
      this.fuelDelivery !== null ||
      this.emergencyVehicle !== null ||
      this.catEvent !== null ||
      this.trafficCars.some((trafficCar) => trafficCar.event?.kind === 'breakdown')
    ) {
      return false;
    }

    const startZ = RESCUE_ROUTE_LIMIT;
    const entryClear = this.trafficCars.every(
      (trafficCar) =>
        trafficCar.direction !== -1 ||
        Math.abs(trafficCar.mesh.position.z - startZ) > MIN_TRAFFIC_GAP * 2.3,
    );
    if (!entryClear) return false;

    const truck = createCar(0xd9952f, 'tow');
    const customerStyle = randomItem(
      ['compact', 'executive', 'classic'] as const,
    ) ?? 'compact';
    const color = randomItem([0x4d92c7, 0xdf5a4d, 0x8161b5, 0xe2e3dd]) ?? 0x4d92c7;
    const car = createCar(color, customerStyle);
    truck.scale.setScalar(0.88);
    car.scale.setScalar(0.68);
    truck.rotation.y = 0;
    car.rotation.y = 0;
    // Mesh'ler sahneye eklenmeden önce ilk pozlarını alır; aksi halde bir kare
    // boyunca varsayılan (0,0,0) noktasında parlayıp kaybolurlar.
    truck.position.set(INBOUND_TRAFFIC_X, VEHICLE_Y, startZ);
    car.position.set(INBOUND_TRAFFIC_X, VEHICLE_Y + 0.62, startZ + 0.72);
    truck.userData.trafficColor = 0xd9952f;
    car.userData.trafficColor = color;
    car.userData.vehicleStyle = customerStyle;
    setCarRunningLights(truck, this.nightTime);
    setCarRunningLights(car, this.nightTime);
    setCarLightBeamsEnabled(truck, false);
    setCarLightBeamsEnabled(car, false);
    setCarHazards(car, true);
    this.scene.add(truck, car);

    this.rescueDelivery = {
      truck,
      car,
      color,
      speed: randomBetween(3.1, 3.6),
      z: startZ,
      delivered: false,
      phase: 'road',
      progress: 0,
      elapsed: 0,
      customer: null,
      exitRoute: null,
      unloadStart: null,
      customerReleased: false,
    };
    return true;
  }

  private updateRescueDelivery(deltaSeconds: number): void {
    const delivery = this.rescueDelivery;
    if (delivery === null) return;

    delivery.elapsed += deltaSeconds;
    const signalPulse = Math.floor(delivery.elapsed * 2.4) % 2 === 0;

    if (delivery.phase === 'road') {
      const previousZ = delivery.z;
      let headway = Number.POSITIVE_INFINITY;
      for (const trafficCar of this.trafficCars) {
        if (trafficCar.direction !== -1 || trafficCar.laneX !== INBOUND_TRAFFIC_X) continue;
        const ahead = delivery.z - trafficCar.mesh.position.z;
        if (ahead > 0) headway = Math.min(headway, ahead);
      }

      let distance = Math.min(
        delivery.speed * deltaSeconds,
        Math.max(0, headway - MIN_TRAFFIC_GAP * 1.55),
      );
      // Ortak istasyon rotası doluyken çekici giriş ağzında görünür biçimde
      // sıraya girer; sahaya ışınlanmaz.
      if (this.stationRouteOwnerId !== null) {
        distance = Math.min(distance, Math.max(0, delivery.z - rescueEntryStopZ()));
      }
      delivery.z += flow() * distance;
      delivery.truck.position.set(INBOUND_TRAFFIC_X, VEHICLE_Y, delivery.z);
      delivery.car.position.set(
        INBOUND_TRAFFIC_X,
        VEHICLE_Y + 0.62,
        delivery.z + 0.72,
      );
      setCarHazards(delivery.car, Math.floor(delivery.elapsed * 2.2) % 2 === 0);
      setCarTurnSignal(delivery.truck, 'right', signalPulse);

      if (
        this.stationRouteOwnerId === null &&
        crossedAlongFlow(previousZ, delivery.z, ENTRY_Z)
      ) {
        const customer = this.onFuelRescueAtEntrance?.(delivery.color) ?? null;
        if (customer !== null) {
          this.beginRescueStationDelivery(delivery, customer);
          return;
        }
        // Boş pompa yoksa çekici kaybolmaz; giriş ağzında dörtlülerini yakıp
        // yer açılmasını bekler ve ardından aynı teslimatı tamamlar.
        delivery.phase = 'waiting';
        delivery.z = ENTRY_Z - flow() * 0.25;
        delivery.elapsed = 0;
        delivery.truck.position.set(INBOUND_TRAFFIC_X, VEHICLE_Y, delivery.z);
        delivery.car.position.set(
          INBOUND_TRAFFIC_X,
          VEHICLE_Y + 0.62,
          delivery.z + 0.72,
        );
        return;
      }

      if (delivery.z >= -RESCUE_ROUTE_LIMIT) return;
      this.scene.remove(delivery.truck, delivery.car);
      disposeEffect(delivery.truck);
      disposeEffect(delivery.car);
      this.rescueDelivery = null;
      return;
    }

    if (delivery.phase === 'waiting') {
      delivery.truck.position.set(INBOUND_TRAFFIC_X, VEHICLE_Y, delivery.z);
      delivery.car.position.set(
        INBOUND_TRAFFIC_X,
        VEHICLE_Y + 0.62,
        delivery.z + 0.72,
      );
      setCarHazards(delivery.car, Math.floor(delivery.elapsed * 2.2) % 2 === 0);
      setCarTurnSignal(delivery.truck, 'right', signalPulse);
      if (this.stationRouteOwnerId !== null || delivery.elapsed < 0.7) return;

      delivery.elapsed = 0;
      const customer = this.onFuelRescueAtEntrance?.(delivery.color) ?? null;
      if (customer !== null) this.beginRescueStationDelivery(delivery, customer);
      return;
    }

    const customer = delivery.customer;
    if (customer === null) return;

    if (delivery.phase === 'entering') {
      delivery.progress = Math.min(
        RESCUE_TRUCK_UNLOAD_PROGRESS,
        delivery.progress + deltaSeconds / 4.25,
      );
      this.positionRescueOnArrivalRoute(delivery, delivery.progress);
      setCarHazards(delivery.car, Math.floor(delivery.elapsed * 2.2) % 2 === 0);
      setCarTurnSignal(delivery.truck, 'right', signalPulse);

      if (delivery.progress < RESCUE_TRUCK_UNLOAD_PROGRESS) return;
      delivery.phase = 'unloading';
      delivery.elapsed = 0;
      delivery.unloadStart = {
        x: delivery.car.position.x,
        z: delivery.car.position.z,
        rotation: delivery.car.rotation.y,
      };
      return;
    }

    if (delivery.phase === 'unloading') {
      const unloadProgress = Math.min(1, delivery.elapsed / RESCUE_UNLOAD_SECONDS);
      const eased = smooth(unloadProgress);
      const slot = findSlot(customer.slotIndex);
      const unloadStart = delivery.unloadStart;
      if (slot === undefined || unloadStart === null) return;
      const arrivalRoute = stationRoute(slot, 'arriving');
      const truckTransform = sampleStationRoute(
        arrivalRoute,
        RESCUE_TRUCK_UNLOAD_PROGRESS,
      );
      const tangent = arrivalRoute.getTangentAt(smooth(RESCUE_TRUCK_UNLOAD_PROGRESS));
      const unloadTarget: CarTransform = {
        x: slot.carX,
        z: slot.z,
        rotation: parkedRotation(slot),
      };
      // Çekici, araç pompa tarafına gelecek şekilde yanaşır. Araç platformdan
      // önce bu açık yana iner; böylece çekici gövdesinin içinden geçmez.
      const sideDirection = Math.sign(unloadTarget.x - truckTransform.x) || 1;
      const sideDrop: CarTransform = {
        x: truckTransform.x + sideDirection * 2.12,
        z: truckTransform.z - tangent.z * 0.22,
        rotation: truckTransform.rotation,
      };
      delivery.truck.position.set(truckTransform.x, VEHICLE_Y, truckTransform.z);
      delivery.truck.rotation.y = truckTransform.rotation;
      if (eased < 0.62) {
        const progress = smooth(eased / 0.62);
        delivery.car.position.set(
          lerp(unloadStart.x, sideDrop.x, progress),
          lerp(VEHICLE_Y + 0.62, VEHICLE_Y + 0.02, progress),
          lerp(unloadStart.z, sideDrop.z, progress),
        );
        delivery.car.rotation.y = lerpAngle(unloadStart.rotation, sideDrop.rotation, progress);
      } else {
        const progress = smooth((eased - 0.62) / 0.38);
        delivery.car.position.set(
          lerp(sideDrop.x, unloadTarget.x, progress),
          VEHICLE_Y,
          lerp(sideDrop.z, unloadTarget.z, progress),
        );
        delivery.car.rotation.y = lerpAngle(
          sideDrop.rotation,
          unloadTarget.rotation,
          progress,
        );
      }
      const carScale = lerp(0.68, TRAFFIC_CAR_SCALE, eased);
      delivery.car.scale.setScalar(carScale);
      // Yan boşaltmada platform yalnızca hafif açılır; tam rampa hareketi
      // aracı gereksiz biçimde çekicinin arkasından geçiriyordu.
      setTowPlatformUnload(delivery.truck, eased * 0.32);
      setCarHazards(delivery.car, Math.floor(delivery.elapsed * 3) % 2 === 0);

      if (unloadProgress < 1) return;
      customer.progress = 1;
      delivery.customerReleased = true;
      this.onRescueCarDelivered?.(customer);
      delivery.phase = 'departing';
      delivery.progress = 0;
      delivery.elapsed = 0;
      delivery.exitRoute = this.createRescueExitRoute(delivery.truck.position);
      setCarHazards(delivery.car, false);
      setCarTurnSignal(delivery.car, null, false);
      return;
    }

    const exitRoute = delivery.exitRoute;
    if (exitRoute === null) return;
    delivery.progress = Math.min(1, delivery.progress + deltaSeconds / 7.5);
    const truckTransform = sampleStationRoute(exitRoute, delivery.progress);
    delivery.truck.position.set(truckTransform.x, VEHICLE_Y, truckTransform.z);
    delivery.truck.rotation.y = truckTransform.rotation;
    setTowPlatformUnload(
      delivery.truck,
      0.32 * (1 - smooth(Math.min(1, delivery.progress / 0.13))),
    );
    setCarTurnSignal(delivery.truck, 'left', signalPulse);

    if (delivery.progress < 1) return;
    if (!delivery.customerReleased) {
      delivery.customerReleased = true;
      customer.progress = 1;
      this.onRescueCarDelivered?.(customer);
    }
    this.scene.remove(delivery.truck);
    disposeEffect(delivery.truck);
    this.rescueDelivery = null;
  }

  private transferRescueCarToCustomer(mesh: THREE.Group, customer: Car): void {
    mesh.userData.slotIndex = customer.slotIndex;
    mesh.userData.pickKind = 'car';
    setCarTurnSignal(mesh, 'right', true);
    this.carMeshes.set(customer.id, mesh);
    this.pickables.push(mesh);
  }

  private beginRescueStationDelivery(
    delivery: RescueDelivery,
    customer: Car,
  ): void {
    delivery.delivered = true;
    delivery.customer = customer;
    delivery.phase = 'entering';
    delivery.progress = 0;
    delivery.elapsed = 0;
    this.stationRouteOwnerId = customer.id;
    this.transferRescueCarToCustomer(delivery.car, customer);
    this.positionRescueOnArrivalRoute(delivery, 0);
  }

  private positionRescueOnArrivalRoute(
    delivery: RescueDelivery,
    truckProgress: number,
  ): void {
    const customer = delivery.customer;
    if (customer === null) return;
    const slot = findSlot(customer.slotIndex);
    if (slot === undefined) return;
    const route = stationRoute(slot, 'arriving');
    const truckTransform = sampleStationRoute(route, truckProgress);
    const tangent = route.getTangentAt(smooth(truckProgress));
    delivery.truck.position.set(truckTransform.x, VEHICLE_Y, truckTransform.z);
    delivery.truck.rotation.y = truckTransform.rotation;
    delivery.car.position.set(
      truckTransform.x - tangent.x * 0.72,
      VEHICLE_Y + 0.62,
      truckTransform.z - tangent.z * 0.72,
    );
    delivery.car.rotation.y = truckTransform.rotation;
  }

  private createRescueExitRoute(from: THREE.Vector3): THREE.CatmullRomCurve3 {
    const route = new THREE.CatmullRomCurve3(
      [
        new THREE.Vector3(from.x, 0, from.z),
        new THREE.Vector3(LANE_X, 0, from.z + flow() * 1.25),
        new THREE.Vector3(
          LANE_X,
          0,
          furthestAlongFlow(from.z + flow() * 2.55, gateOut() - flow() * 2.1),
        ),
        new THREE.Vector3(LANE_X + 2.05, 0, gateOut() - flow() * 1.05),
        new THREE.Vector3(ROAD_X - ROAD_WIDTH / 2 + 0.1, 0, gateOut() - flow() * 0.15),
        new THREE.Vector3(OUTBOUND_TRAFFIC_X, 0, gateOut()),
        new THREE.Vector3(OUTBOUND_TRAFFIC_X, 0, gateOut() - flow() * 9),
        new THREE.Vector3(OUTBOUND_TRAFFIC_X, 0, -flow() * RESCUE_ROUTE_LIMIT),
      ],
      false,
      'centripetal',
    );
    route.arcLengthDivisions = 128;
    return route;
  }

  /**
   * Müşteri aracı yoldan ayrılır ayrılmaz normal trafik havuzundan çıkar. Bu
   * ek takip hesabı, arkadan gelenlerin dönüş yapan arabanın içinden geçmesini
   * ve çıkış yapan araçla yol trafiğinin üst üste binmesini engeller.
   */
  private stationCarHeadway(trafficCar: TrafficCar): number {
    let nearest = Number.POSITIVE_INFINITY;

    const consider = (stationCar: THREE.Group): void => {
      if (stationCar === trafficCar.mesh) return;
      if (
        Math.abs(stationCar.position.x - trafficCar.mesh.position.x) >
        STATION_CAR_REACTION_WIDTH
      ) {
        return;
      }

      const forwardDistance = trafficCar.direction === -1
        ? trafficCar.mesh.position.z - stationCar.position.z
        : stationCar.position.z - trafficCar.mesh.position.z;
      if (forwardDistance > 0) nearest = Math.min(nearest, forwardDistance);
    };

    for (const stationCar of this.carMeshes.values()) consider(stationCar);

    const rescue = this.rescueDelivery;
    if (rescue !== null) {
      const sharesTrafficDirection =
        (
          (rescue.phase === 'road' || rescue.phase === 'waiting') &&
          trafficCar.direction === -1
        ) ||
        (rescue.phase === 'departing' && trafficCar.direction === 1);
      if (sharesTrafficDirection) {
        consider(rescue.truck);
        if (!rescue.delivered) consider(rescue.car);
      }
    }

    const fuelDelivery = this.fuelDelivery;
    if (fuelDelivery !== null) {
      const sharesTrafficDirection =
        (
          (fuelDelivery.phase === 'road' || fuelDelivery.phase === 'waiting') &&
          trafficCar.direction === -1
        ) ||
        (fuelDelivery.phase === 'departing' && trafficCar.direction === 1);
      if (sharesTrafficDirection) consider(fuelDelivery.truck);
    }

    return nearest;
  }

  /** Her birkaç saniyede bir, sahnede okunabilir tek bir mikro-olay başlatır. */
  private startRandomTrafficEvent(): void {
    // Acil koridor açıkken sollama, arıza ve kedi olayı başlatma; tek sahne
    // odağı acil araca ve iki şeridin yol vermesine kalsın.
    if (this.emergencyVehicle !== null) return;

    const activeVehicleEvents = this.trafficCars.filter((trafficCar) => trafficCar.event !== null).length;
    if (activeVehicleEvents >= 2) return;

    const starters: Array<() => boolean> = [
      () => this.startCatEvent(),
      () => this.startBassEvent(),
      () => this.startHornEvent(),
      () => this.startSwerveEvent(),
      () => this.startRushEvent(),
      () => this.startOvertakeEvent(),
      () => this.startBreakdownEvent(),
    ];

    while (starters.length > 0) {
      const index = Math.floor(Math.random() * starters.length);
      const starter = starters.splice(index, 1)[0];
      if (starter?.()) return;
    }
  }

  /** Polis ya da ambulans için markasız, orta şeritten geçen acil koridor olayı. */
  private startEmergencyVehicle(): boolean {
    // Kedi yoldayken ayrı bir olay başlatmıyoruz; kedi biter bitmez kısa süre
    // içinde yeniden denenir. Böylece iki davranış birbirini okunmaz yapmaz.
    if (
      this.emergencyVehicle !== null ||
      this.catEvent !== null ||
      this.rescueDelivery !== null ||
      this.fuelDelivery !== null ||
      this.trafficCars.some((trafficCar) => trafficCar.event?.kind === 'breakdown')
    ) {
      return false;
    }
    const drivewayBusy = [...this.carMeshes.values()].some(
      (car) => car.position.x > ROAD_X - ROAD_WIDTH / 2 - 0.35,
    );
    if (drivewayBusy) return false;

    // Aktif mikro-olayları kapatınca herkes kendi şeridine döner; ardından iki
    // taraf da aynı anda yol kenarına çekilebilir.
    for (const trafficCar of this.trafficCars) this.finishTrafficEvent(trafficCar);

    const style: Extract<VehicleStyle, 'police' | 'ambulance'> =
      Math.random() < 0.52 ? 'police' : 'ambulance';
    const direction: TrafficDirection = Math.random() < 0.5 ? -1 : 1;
    const mesh = createCar(style === 'police' ? 0xe4e8ed : 0xf2f0e8, style);
    mesh.scale.setScalar(style === 'police' ? 0.9 : 0.84);
    mesh.position.set(
      ROAD_X,
      VEHICLE_Y,
      direction === -1 ? EMERGENCY_ROUTE_LIMIT : -EMERGENCY_ROUTE_LIMIT,
    );
    mesh.rotation.y = direction === -1 ? 0 : Math.PI;
    setCarRunningLights(mesh, this.nightTime);
    setCarLightBeamsEnabled(mesh, false);
    this.scene.add(mesh);

    this.emergencyVehicle = {
      mesh,
      direction,
      speed: randomBetween(9.4, 11.2),
      elapsed: 0,
    };
    this.onEmergencySiren?.(true);
    return true;
  }

  /** Acil aracın tepe lambasını yakar, görünür yolun sonunda güvenle kaldırır. */
  private updateEmergencyVehicle(deltaSeconds: number): void {
    const emergency = this.emergencyVehicle;
    if (emergency === null) return;

    emergency.elapsed += deltaSeconds;
    setCarEmergencyLights(
      emergency.mesh,
      true,
      Math.floor(emergency.elapsed * 8) % 2 === 0,
    );
    emergency.mesh.position.z += emergency.direction * emergency.speed * deltaSeconds;

    const hasLeftRoad =
      emergency.direction === -1
        ? emergency.mesh.position.z < -EMERGENCY_ROUTE_LIMIT
        : emergency.mesh.position.z > EMERGENCY_ROUTE_LIMIT;
    if (!hasLeftRoad) return;

    setCarEmergencyLights(emergency.mesh, false);
    this.scene.remove(emergency.mesh);
    disposeEffect(emergency.mesh);
    this.emergencyVehicle = null;
    this.onEmergencySiren?.(false);
    for (const trafficCar of this.trafficCars) setCarHazards(trafficCar.mesh, false);
  }

  /**
   * Acil araç yaklaştığında iki yönün araçları da dış kaldırıma yönelir ve
   * gerektiğinde neredeyse durur. Araç geçince şerit merkezine yumuşak döner.
   */
  private emergencyYieldMultiplier(trafficCar: TrafficCar, deltaSeconds: number): number {
    const emergency = this.emergencyVehicle;
    if (emergency === null) {
      // Bu olaylar x konumunu kendi mutlak eğrilerinden yönetir. Aynı karede
      // şerit merkezine lerp etmek iki hedef arasında mikro titremeye yol açar.
      if (
        trafficCar.event?.kind === 'breakdown' ||
        trafficCar.event?.kind === 'swerve' ||
        trafficCar.event?.kind === 'overtake'
      ) {
        return 1;
      }
      trafficCar.mesh.position.x = lerp(
        trafficCar.mesh.position.x,
        trafficCar.laneX,
        Math.min(1, deltaSeconds * 3.6),
      );
      return 1;
    }

    const distance = Math.abs(trafficCar.mesh.position.z - emergency.mesh.position.z);
    if (distance > EMERGENCY_YIELD_DISTANCE) {
      setCarHazards(trafficCar.mesh, false);
      trafficCar.mesh.position.x = lerp(
        trafficCar.mesh.position.x,
        trafficCar.laneX,
        Math.min(1, deltaSeconds * 3.6),
      );
      return 1;
    }

    const side = trafficCar.laneX < ROAD_X ? -1 : 1;
    const shoulderX = ROAD_X + side * (ROAD_WIDTH / 2 - EMERGENCY_SHOULDER_INSET);
    setCarHazards(
      trafficCar.mesh,
      Math.floor(emergency.elapsed * 2.6) % 2 === 0,
    );
    trafficCar.mesh.position.x = lerp(
      trafficCar.mesh.position.x,
      shoulderX,
      Math.min(1, deltaSeconds * 6.4),
    );

    if (distance <= EMERGENCY_STOP_DISTANCE) return 0.04;

    const resumeProgress =
      (distance - EMERGENCY_STOP_DISTANCE) /
      (EMERGENCY_YIELD_DISTANCE - EMERGENCY_STOP_DISTANCE);
    return lerp(0.04, 0.64, resumeProgress);
  }

  private startCatEvent(): boolean {
    if (this.catEvent !== null) return false;

    // Kedi, tam tamponun önünde belirmesin: ilk fren için gerçekçi mesafe bırak.
    const safeCrossings = CAT_CROSSING_ZS.filter((z) =>
      this.trafficCars.every((trafficCar) =>
        Math.abs(trafficCar.mesh.position.z - z) >= CAT_SPAWN_CLEARANCE,
      ),
    );
    const z = randomItem(safeCrossings);
    if (z === null) return false;

    const mesh = createCat();
    mesh.position.set(CAT_START_X, 0.13, z);
    this.scene.add(mesh);
    this.catEvent = { mesh, z, elapsed: 0, duration: 3.6 };
    return true;
  }

  private startBassEvent(): boolean {
    const convertible = randomItem(
      this.trafficCars.filter(
        (trafficCar) => trafficCar.event === null && trafficCar.style === 'convertible',
      ),
    );
    if (convertible === null) return false;

    const effect = createBassEffect();
    convertible.mesh.add(effect);
    convertible.event = { kind: 'bass', elapsed: 0, duration: 5.5, effect };
    this.onBassMusic?.(true);
    return true;
  }

  /** Sıkışan bir sürücünün kısa korna tepkisi. */
  private startHornEvent(): boolean {
    const candidates = this.trafficCars.filter((trafficCar) => {
      if (trafficCar.event !== null) return false;
      const lead = this.trafficAhead(trafficCar);
      return lead !== null && lead.distance < 10;
    });
    const trafficCar = randomItem(candidates);
    if (trafficCar === null) return false;

    trafficCar.event = { kind: 'horn', elapsed: 0, duration: 0.7 };
    this.onTrafficHorn?.();
    return true;
  }

  /** Çukur/bozuk zemin hissi veren kısa şerit içi kaçınma manevrası. */
  private startSwerveEvent(): boolean {
    const trafficCar = randomItem(
      this.trafficCars.filter(
        (candidate) =>
          candidate.event === null &&
          Math.abs(candidate.mesh.position.z - gateIn()) > 9,
      ),
    );
    if (trafficCar === null) return false;

    const roadMin = ROAD_X - ROAD_WIDTH / 2 + 0.42;
    const roadMax = ROAD_X + ROAD_WIDTH / 2 - 0.42;
    const offset = Math.random() < 0.5 ? -0.42 : 0.42;
    trafficCar.event = {
      kind: 'swerve',
      elapsed: 0,
      duration: 2.15,
      originX: trafficCar.mesh.position.x,
      targetX: Math.max(roadMin, Math.min(roadMax, trafficCar.mesh.position.x + offset)),
    };
    return true;
  }

  /** Spor aracın kısa süre hızlanıp yeniden akış hızına dönmesi. */
  private startRushEvent(): boolean {
    const trafficCar = randomItem(
      this.trafficCars.filter(
        (candidate) =>
          candidate.event === null &&
          candidate.style === 'sport' &&
          Math.abs(candidate.mesh.position.z - gateIn()) > 10,
      ),
    );
    if (trafficCar === null) return false;

    trafficCar.event = { kind: 'rush', elapsed: 0, duration: 3.2 };
    return true;
  }

  private startOvertakeEvent(): boolean {
    const candidates = this.trafficCars.filter((trafficCar) => {
      if (trafficCar.event !== null) return false;
      const lead = this.trafficAhead(trafficCar);
      if (lead === null || lead.distance > 12 || lead.distance < MIN_TRAFFIC_GAP + 1.2) return false;
      if (trafficCar.baseSpeed * trafficCar.pace <= lead.trafficCar.baseSpeed * lead.trafficCar.pace * 1.1) {
        return false;
      }
      return this.isOppositeLaneClear(trafficCar, 18);
    });
    const trafficCar = randomItem(candidates);
    if (trafficCar === null) return false;

    const targetX =
      trafficCar.laneX === INBOUND_TRAFFIC_X ? OUTBOUND_TRAFFIC_X : INBOUND_TRAFFIC_X;
    trafficCar.event = {
      kind: 'overtake',
      elapsed: 0,
      duration: 2.7,
      originX: trafficCar.mesh.position.x,
      targetX,
    };
    return true;
  }

  private startBreakdownEvent(): boolean {
    if (this.rescueDelivery !== null || this.fuelDelivery !== null) return false;
    const candidates = this.trafficCars.filter(
      (trafficCar) =>
        trafficCar.event === null &&
        trafficCar.direction === -flow() &&
        trafficCar.style !== 'sport' &&
        Math.abs(trafficCar.mesh.position.z - gateIn()) > 8,
    );
    const trafficCar = randomItem(candidates);
    if (trafficCar === null) return false;

    const effect = createSmokeEffect();
    trafficCar.mesh.add(effect);
    trafficCar.event = {
      kind: 'breakdown',
      elapsed: 0,
      duration: 10.8,
      originX: trafficCar.mesh.position.x,
      targetX: ROAD_X + ROAD_WIDTH / 2 + 0.32,
      effect,
    };
    return true;
  }

  /** Yoldaki çukur için belediye ekibi gelir; ilgili şerit gerçek anlamda kapanır. */
  private startRoadwork(): boolean {
    if (
      this.roadwork !== null ||
      this.emergencyVehicle !== null ||
      this.rescueDelivery !== null ||
      this.fuelDelivery !== null ||
      this.catEvent !== null ||
      this.trafficCars.some((trafficCar) => trafficCar.event?.kind === 'breakdown')
    ) {
      return false;
    }

    const z = randomItem(ROADWORK_ZS);
    if (z === null) return false;
    const laneX = Math.random() < 0.5 ? INBOUND_TRAFFIC_X : OUTBOUND_TRAFFIC_X;
    const direction: TrafficDirection = laneX === INBOUND_TRAFFIC_X ? -1 : 1;
    const site = createRoadworkSite();
    site.position.set(laneX, 0, z);
    this.scene.add(site);

    const truck = createCar(0xe79a32, 'tow');
    truck.scale.setScalar(0.78);
    const truckStart = new THREE.Vector3(ROAD_X + ROAD_WIDTH / 2 + 0.85, VEHICLE_Y, z + 10.5);
    const truckPark = new THREE.Vector3(ROAD_X + ROAD_WIDTH / 2 + 0.48, VEHICLE_Y, z + 1.8);
    const truckExit = new THREE.Vector3(ROAD_X + ROAD_WIDTH / 2 + 0.85, VEHICLE_Y, z - 9.5);
    truck.position.copy(truckStart);
    truck.rotation.y = 0;
    setCarRunningLights(truck, this.nightTime);
    setCarLightBeamsEnabled(truck, false);
    setCarHazards(truck, true);
    this.scene.add(truck);

    // Kapanan şeritte yalnız frenleme değil, görünür bir kuyruk da oluşur.
    const queue: TrafficCar[] = [];
    for (let index = 0; index < 2; index += 1) {
      const mesh = createCar(index === 0 ? 0x7b94b2 : 0xd6d3ca, index === 0 ? 'executive' : 'compact');
      this.scene.add(mesh);
      const preferredZ = direction === -1
        ? Math.min(TRAFFIC_MAX_Z - 4, z + 17 + index * 5)
        : Math.max(TRAFFIC_MIN_Z + 4, z - 17 - index * 5);
      queue.push(
        this.registerTrafficCar(
          mesh,
          direction,
          laneX,
          preferredZ,
          index === 0 ? 3.35 : 3.7,
          index === 0 ? 0x7b94b2 : 0xd6d3ca,
          index === 0 ? 'executive' : 'compact',
        ),
      );
    }

    this.roadwork = {
      site,
      truck,
      laneX,
      z,
      truckStart,
      truckPark,
      truckExit,
      queue,
      phase: 'arriving',
      elapsed: 0,
    };
    return true;
  }

  private updateRoadwork(deltaSeconds: number): void {
    const roadwork = this.roadwork;
    if (roadwork === null) return;
    roadwork.elapsed += deltaSeconds;

    if (roadwork.phase === 'arriving') {
      const progress = Math.min(1, roadwork.elapsed / ROADWORK_ARRIVAL_SECONDS);
      roadwork.truck.position.lerpVectors(
        roadwork.truckStart,
        roadwork.truckPark,
        smooth(progress),
      );
      setCarHazards(roadwork.truck, Math.floor(roadwork.elapsed * 3) % 2 === 0);
      if (progress < 1) return;
      roadwork.phase = 'repairing';
      roadwork.elapsed = 0;
      return;
    }

    if (roadwork.phase === 'repairing') {
      const patch = roadwork.site.userData.patch;
      if (patch instanceof THREE.Mesh && patch.material instanceof THREE.MeshStandardMaterial) {
        const repaired = roadwork.elapsed / ROADWORK_REPAIR_SECONDS;
        patch.material.color.setHex(repaired > 0.72 ? 0x3e4246 : 0x1c1d1e);
      }
      const fill = roadwork.site.userData.fill;
      if (fill instanceof THREE.Mesh) {
        const repaired = roadwork.elapsed / ROADWORK_REPAIR_SECONDS;
        fill.visible = repaired > 0.68;
        fill.scale.setScalar(Math.max(0.08, Math.min(1, (repaired - 0.62) / 0.38)));
      }
      const worker = roadwork.site.userData.worker;
      if (worker instanceof THREE.Group && !this.reduceMotion) {
        worker.rotation.z = Math.sin(this.elapsedWorldTime * 4.5) * 0.08;
      }
      setCarHazards(roadwork.truck, Math.floor(roadwork.elapsed * 3) % 2 === 0);
      if (roadwork.elapsed < ROADWORK_REPAIR_SECONDS) return;
      roadwork.phase = 'departing';
      roadwork.elapsed = 0;
      roadwork.site.visible = false;
      setCarHazards(roadwork.truck, false);
      return;
    }

    const progress = Math.min(1, roadwork.elapsed / 3.4);
    roadwork.truck.position.lerpVectors(
      roadwork.truckPark,
      roadwork.truckExit,
      smooth(progress),
    );
    if (progress < 1) return;

    for (const queued of roadwork.queue) {
      const index = this.trafficCars.indexOf(queued);
      if (index < 0) continue;
      this.trafficCars.splice(index, 1);
      this.scene.remove(queued.mesh);
      disposeEffect(queued.mesh);
    }
    this.scene.remove(roadwork.site, roadwork.truck);
    disposeEffect(roadwork.site);
    disposeEffect(roadwork.truck);
    this.roadwork = null;
  }

  private roadworkStoppingDistance(trafficCar: TrafficCar): number | null {
    const roadwork = this.roadwork;
    if (
      roadwork === null ||
      roadwork.phase === 'departing' ||
      Math.abs(trafficCar.laneX - roadwork.laneX) > 0.12
    ) {
      return null;
    }

    const stoppingZ =
      trafficCar.direction === -1
        ? roadwork.z + ROADWORK_STOP_BUFFER
        : roadwork.z - ROADWORK_STOP_BUFFER;
    const distance =
      trafficCar.direction === -1
        ? trafficCar.mesh.position.z - stoppingZ
        : stoppingZ - trafficCar.mesh.position.z;
    if (distance > 0) return distance;

    const hasPassed =
      trafficCar.direction === -1
        ? trafficCar.mesh.position.z <= roadwork.z - 0.55
        : trafficCar.mesh.position.z >= roadwork.z + 0.55;
    return hasPassed ? null : 0;
  }

  private roadworkBrakeMultiplier(stoppingDistance: number | null): number {
    if (stoppingDistance === null) return 1;
    return Math.max(0.08, Math.min(1, stoppingDistance / ROADWORK_BRAKE_DISTANCE));
  }

  private updateCatEvent(deltaSeconds: number): void {
    const cat = this.catEvent;
    if (cat === null) return;

    cat.elapsed += deltaSeconds;
    const progress = Math.min(1, cat.elapsed / cat.duration);
    cat.mesh.position.x = lerp(CAT_START_X, CAT_END_X, smooth(progress));
    cat.mesh.position.y = 0.13 + Math.abs(Math.sin(cat.elapsed * 8)) * 0.04;

    if (progress < 1) return;
    this.scene.remove(cat.mesh);
    disposeEffect(cat.mesh);
    this.catEvent = null;
  }

  /** Kedinin bulunduğu şeritteki aracın ön tamponu için güvenli durma mesafesi. */
  private catStoppingDistance(trafficCar: TrafficCar): number | null {
    const cat = this.catEvent;
    if (cat === null) return null;

    // Kedi henüz bu şeride girmediyse diğer yöndeki araç gereksiz durmaz.
    if (Math.abs(cat.mesh.position.x - trafficCar.mesh.position.x) > CAT_LANE_REACTION_WIDTH) {
      return null;
    }

    const stoppingZ =
      trafficCar.direction === -1 ? cat.z + CAT_STOP_BUFFER : cat.z - CAT_STOP_BUFFER;
    const distance =
      trafficCar.direction === -1
        ? trafficCar.mesh.position.z - stoppingZ
        : stoppingZ - trafficCar.mesh.position.z;

    if (distance > 0) return distance;

    // Beklenmedik yakın bir durumda geri kaçırmak yerine acil fren yap: araç,
    // kedinin üzerinden devam etmez. Kedi şeritten çıktıktan sonra bu kısıt kalkar.
    const hasPassedCat =
      trafficCar.direction === -1
        ? trafficCar.mesh.position.z <= cat.z - CAT_PASS_CLEARANCE
        : trafficCar.mesh.position.z >= cat.z + CAT_PASS_CLEARANCE;
    return hasPassedCat ? null : 0;
  }

  /** Kediye yaklaşırken doğal biçimde frenler; son metrelerde hareket tamamen kesilir. */
  private catBrakeMultiplier(stoppingDistance: number | null): number {
    if (stoppingDistance === null) return 1;

    return Math.max(0.1, Math.min(1, stoppingDistance / CAT_BRAKE_DISTANCE));
  }

  /** Şerit değiştirme ve kenara çekme sırasında araç gövdesi hareket yönüne döner. */
  private updateTrafficHeading(
    trafficCar: TrafficCar,
    lateralDistance: number,
    longitudinalDistance: number,
    deltaSeconds: number,
  ): void {
    if (Math.abs(lateralDistance) + Math.abs(longitudinalDistance) < 0.0001) return;

    const targetRotation = Math.atan2(-lateralDistance, -longitudinalDistance);
    trafficCar.mesh.rotation.y = lerpAngle(
      trafficCar.mesh.rotation.y,
      targetRotation,
      Math.min(1, deltaSeconds * 8),
    );
  }

  /** Takipte sıkışan sürücü gece selektör, gündüz kısa korna ile tepki verir. */
  private updateFollowerHighBeam(
    trafficCar: TrafficCar,
    desiredDistance: number,
    actualDistance: number,
    headway: number,
    deltaSeconds: number,
  ): void {
    trafficCar.highBeamTimer = Math.max(0, trafficCar.highBeamTimer - deltaSeconds);
    trafficCar.highBeamCooldown = Math.max(0, trafficCar.highBeamCooldown - deltaSeconds);

    const lead = this.trafficAhead(trafficCar);
    const leadIsStoppingForCat = lead !== null && this.catStoppingDistance(lead.trafficCar) !== null;
    const leadIsStopped = lead?.trafficCar.event?.kind === 'breakdown';
    const wasForcedToBrake = desiredDistance > 0.01 && actualDistance < desiredDistance * 0.56;
    const shouldWarn =
      headway < FOLLOWER_FLASH_HEADWAY &&
      (wasForcedToBrake || leadIsStoppingForCat || leadIsStopped);

    if (shouldWarn && trafficCar.highBeamCooldown <= 0) {
      if (this.nightTime) {
        trafficCar.highBeamTimer = 0.52;
        trafficCar.highBeamCooldown = randomBetween(0.82, 1.45);
      } else {
        trafficCar.highBeamTimer = 0;
        trafficCar.highBeamCooldown = randomBetween(1.35, 2.15);
        this.onTrafficHorn?.();
      }
    }

    if (!this.nightTime) {
      setCarHeadlights(trafficCar.mesh, false);
      return;
    }

    if (trafficCar.highBeamTimer <= 0) {
      setCarHeadlights(trafficCar.mesh, false);
      return;
    }

    const flashOn = Math.floor(trafficCar.highBeamTimer * 12) % 2 === 0;
    setCarHeadlights(trafficCar.mesh, flashOn);
  }

  /** Aktif bir olayı günceller ve araca uygulanacak hız katsayısını döndürür. */
  private updateTrafficEvent(trafficCar: TrafficCar, deltaSeconds: number): number {
    const event = trafficCar.event;
    if (event === null) return 1;

    event.elapsed += deltaSeconds;

    switch (event.kind) {
      case 'bass':
        if (event.effect !== undefined) {
          this.updateBassEffect(trafficCar, event.effect, event.elapsed);
        }
        if (event.elapsed >= event.duration) this.finishTrafficEvent(trafficCar);
        return 1;

      case 'horn':
        if (event.elapsed >= event.duration) this.finishTrafficEvent(trafficCar);
        return 0.96;

      case 'rush': {
        const progress = Math.min(1, event.elapsed / event.duration);
        if (progress >= 1) this.finishTrafficEvent(trafficCar);
        return progress < 0.58
          ? lerp(1, 1.38, smooth(progress / 0.58))
          : lerp(1.38, 1, smooth((progress - 0.58) / 0.42));
      }

      case 'swerve': {
        const progress = Math.min(1, event.elapsed / event.duration);
        const originX = event.originX ?? trafficCar.laneX;
        const targetX = event.targetX ?? trafficCar.laneX;
        const lateralProgress =
          progress < 0.42
            ? smooth(progress / 0.42)
            : 1 - smooth((progress - 0.42) / 0.58);
        trafficCar.mesh.position.x = lerp(originX, targetX, lateralProgress);

        const movesToLowerX = targetX < originX;
        const signalDirection =
          trafficCar.direction === -1
            ? movesToLowerX
              ? 'right'
              : 'left'
            : movesToLowerX
              ? 'left'
              : 'right';
        setCarTurnSignal(
          trafficCar.mesh,
          signalDirection,
          Math.floor(event.elapsed * 2.8) % 2 === 0,
        );

        if (progress >= 1) this.finishTrafficEvent(trafficCar);
        return 0.88;
      }

      case 'overtake': {
        const progress = Math.min(1, event.elapsed / event.duration);
        const originX = event.originX ?? trafficCar.laneX;
        const targetX = event.targetX ?? trafficCar.laneX;
        const canReturn = this.canReturnToTrafficLane(trafficCar);
        if (!this.isOppositeLaneClear(trafficCar, 5)) {
          trafficCar.mesh.position.x = originX;
          this.finishTrafficEvent(trafficCar);
          return 1;
        }
        const lateralProgress =
          progress < 0.24
            ? smooth(progress / 0.24)
            : progress > 0.76 && canReturn
              ? 1 - smooth((progress - 0.76) / 0.24)
              : 1;
        trafficCar.mesh.position.x = lerp(originX, targetX, lateralProgress);
        if (progress >= 1 && canReturn) this.finishTrafficEvent(trafficCar);
        return 1.26;
      }

      case 'breakdown':
        return this.updateBreakdownEvent(trafficCar, event);
    }
  }

  private updateBreakdownEvent(trafficCar: TrafficCar, event: TrafficEvent): number {
    const pullOverDuration = 0.9;
    const towArrivalTime = 1.6;
    const hookTime = 4.7;
    const towingTime = 5.25;
    const originX = event.originX ?? trafficCar.laneX;
    const targetX = event.targetX ?? trafficCar.laneX;
    const flashing = Math.floor(event.elapsed * 3) % 2 === 0;
    setCarHazards(trafficCar.mesh, flashing);

    if (event.elapsed < pullOverDuration) {
      trafficCar.mesh.position.x = lerp(originX, targetX, smooth(event.elapsed / pullOverDuration));
      return 0.28;
    }

    trafficCar.mesh.position.x = targetX;
    if (event.effect !== undefined && event.elapsed < towingTime) {
      this.updateSmokeEffect(event.effect, event.elapsed);
    }

    if (event.elapsed >= towArrivalTime && event.towTruck === undefined) {
      const towTruck = createCar(0xd9952f, 'tow');
      towTruck.scale.setScalar(0.88);
      towTruck.position.set(targetX, VEHICLE_Y, trafficCar.mesh.position.z + 10);
      towTruck.rotation.y = Math.PI;
      setCarRunningLights(towTruck, this.nightTime);
      setCarLightBeamsEnabled(towTruck, false);
      this.scene.add(towTruck);
      event.towTruck = towTruck;
    }

    if (event.elapsed < hookTime) {
      const towTruck = event.towTruck;
      if (towTruck !== undefined) {
        const progress = smooth(
          (event.elapsed - towArrivalTime) / (hookTime - towArrivalTime),
        );
        towTruck.position.set(
          targetX,
          VEHICLE_Y,
          lerp(
            trafficCar.mesh.position.z + 10,
            trafficCar.mesh.position.z + 2.75,
            progress,
          ),
        );
      }
      return 0;
    }

    if (event.elapsed < towingTime) {
      return 0;
    }

    event.towAttached = true;
    if (event.effect !== undefined) event.effect.visible = false;
    if (event.elapsed >= event.duration) {
      event.towComplete = true;
      return 0;
    }
    return 1.28;
  }

  private syncBreakdownTowTruck(trafficCar: TrafficCar): void {
    const event = trafficCar.event;
    if (
      event?.kind !== 'breakdown' ||
      event.towAttached !== true ||
      event.towTruck === undefined
    ) {
      return;
    }
    event.towTruck.position.set(
      event.targetX ?? trafficCar.mesh.position.x,
      VEHICLE_Y,
      trafficCar.mesh.position.z + trafficCar.direction * 2.75,
    );
    event.towTruck.rotation.y = trafficCar.direction === -1 ? 0 : Math.PI;
  }

  private completeBreakdownTow(trafficCar: TrafficCar, event: TrafficEvent): void {
    if (event.towTruck !== undefined) {
      this.scene.remove(event.towTruck);
      disposeEffect(event.towTruck);
    }
    if (event.effect !== undefined) {
      trafficCar.mesh.remove(event.effect);
      disposeEffect(event.effect);
    }
    setCarHeadlights(trafficCar.mesh, false);
    setCarHazards(trafficCar.mesh, false);
    setCarTurnSignal(trafficCar.mesh, null, false);
    trafficCar.event = null;
    this.recycleTrafficCar(trafficCar, -1, TRAFFIC_MAX_Z);
  }

  private updateBassEffect(
    trafficCar: TrafficCar,
    effect: THREE.Group,
    elapsed: number,
  ): void {
    const beat = Math.pow(Math.max(0, Math.sin(elapsed * Math.PI * 4.2)), 4);
    setCarBassPulse(trafficCar.mesh, beat);
    effect.children.forEach((child, index) => {
      if (!(child instanceof THREE.Mesh) || !(child.material instanceof THREE.MeshBasicMaterial)) return;
      const pulse = (elapsed * 1.9 + index * 0.32) % 1;
      child.scale.setScalar(0.8 + pulse * 1.45 + beat * 0.18);
      child.material.opacity = (0.4 + beat * 0.18) * (1 - pulse);
    });
  }

  private updateSmokeEffect(effect: THREE.Group, elapsed: number): void {
    effect.children.forEach((child, index) => {
      if (!(child instanceof THREE.Mesh) || !(child.material instanceof THREE.MeshBasicMaterial)) return;
      const offset = (elapsed * 0.7 + index * 0.25) % 1;
      child.position.set((index - 1) * 0.1 + offset * 0.12, 0.25 + offset * 0.72, 0.18);
      child.scale.setScalar(0.65 + offset * 0.9);
      child.material.opacity = 0.48 * (1 - offset);
    });
  }

  private finishTrafficEvent(trafficCar: TrafficCar): void {
    const event = trafficCar.event;
    if (event === null) return;

    if (event.kind === 'bass') setCarBassPulse(trafficCar.mesh, 0);
    setCarHeadlights(trafficCar.mesh, false);
    setCarHazards(trafficCar.mesh, false);
    setCarTurnSignal(trafficCar.mesh, null, false);
    if (event.originX !== undefined) trafficCar.mesh.position.x = event.originX;
    if (event.effect !== undefined) {
      trafficCar.mesh.remove(event.effect);
      disposeEffect(event.effect);
    }
    if (event.towTruck !== undefined) {
      this.scene.remove(event.towTruck);
      disposeEffect(event.towTruck);
    }
    trafficCar.event = null;

    if (
      event.kind === 'bass' &&
      !this.trafficCars.some((candidate) => candidate.event?.kind === 'bass')
    ) {
      this.onBassMusic?.(false);
    }
  }

  private trafficAhead(trafficCar: TrafficCar): { trafficCar: TrafficCar; distance: number } | null {
    const roadSpan = TRAFFIC_MAX_Z - TRAFFIC_MIN_Z;
    let closest: { trafficCar: TrafficCar; distance: number } | null = null;

    for (const other of this.trafficCars) {
      if (
        other === trafficCar ||
        other.direction !== trafficCar.direction ||
        other.laneX !== trafficCar.laneX
      ) {
        continue;
      }

      let distance =
        trafficCar.direction === -1
          ? trafficCar.mesh.position.z - other.mesh.position.z
          : other.mesh.position.z - trafficCar.mesh.position.z;
      while (distance <= 0) distance += roadSpan;

      if (closest === null || distance < closest.distance) closest = { trafficCar: other, distance };
    }

    return closest;
  }

  private isOppositeLaneClear(trafficCar: TrafficCar, minimumGap: number): boolean {
    return this.trafficCars.every(
      (other) =>
        other === trafficCar ||
        other.direction === trafficCar.direction ||
        Math.abs(other.mesh.position.z - trafficCar.mesh.position.z) >= minimumGap,
    );
  }

  /** Sollama tamamlanırken araç kendi şeridine aralık bırakmadan dönmez. */
  private canReturnToTrafficLane(trafficCar: TrafficCar): boolean {
    return this.trafficCars.every(
      (other) =>
        other === trafficCar ||
        other.direction !== trafficCar.direction ||
        other.laneX !== trafficCar.laneX ||
        Math.abs(other.mesh.position.z - trafficCar.mesh.position.z) >= MIN_TRAFFIC_GAP,
    );
  }

  private updateTrafficPace(trafficCar: TrafficCar, deltaSeconds: number): void {
    trafficCar.paceTimer -= deltaSeconds;
    if (trafficCar.paceTimer <= 0) {
      // Şehir trafiği sabit ritimde akmasın: kısa duraksama ve hızlanmalar olur.
      trafficCar.targetPace = randomBetween(0.58, 1.24);
      trafficCar.paceTimer = randomBetween(1.3, 3.8);
    }

    const change = Math.min(1, deltaSeconds * 1.8);
    trafficCar.pace += (trafficCar.targetPace - trafficCar.pace) * change;
  }

  /** Aynı yöndeki en yakın aracın ön tamponuna olan dairesel mesafeyi döndürür. */
  private trafficHeadway(trafficCar: TrafficCar): number {
    const roadSpan = TRAFFIC_MAX_Z - TRAFFIC_MIN_Z;
    let closest = roadSpan;

    for (const other of this.trafficCars) {
      if (
        other === trafficCar ||
        other.direction !== trafficCar.direction ||
        other.laneX !== trafficCar.laneX
      ) {
        continue;
      }

      let distance =
        trafficCar.direction === -1
          ? trafficCar.mesh.position.z - other.mesh.position.z
          : other.mesh.position.z - trafficCar.mesh.position.z;

      while (distance <= 0) distance += roadSpan;
      closest = Math.min(closest, distance);
    }

    return closest;
  }

  /** Yolun görünmeyen ucunda şehir bloğunun etrafından dönüp ters şeride geçer. */
  private recycleTrafficCar(
    trafficCar: TrafficCar,
    direction: TrafficDirection,
    preferredZ: number,
  ): void {
    // İstasyona komşu şerit akış yönünü taşır; diğeri karşı yönü.
    const laneX = direction === flow() ? INBOUND_TRAFFIC_X : OUTBOUND_TRAFFIC_X;
    trafficCar.direction = direction;
    trafficCar.laneX = laneX;
    trafficCar.mesh.position.x = laneX;
    trafficCar.mesh.position.z = this.findClearTrafficPosition(
      direction,
      laneX,
      preferredZ,
      trafficCar,
    );
    trafficCar.mesh.rotation.y = direction === -1 ? 0 : Math.PI;
    trafficCar.targetPace = randomBetween(0.75, 1.15);
    trafficCar.paceTimer = randomBetween(1.2, 3.2);
  }

  /** Bir arabanın ekran üstündeki yeri — sipariş etiketi için. */
  carScreenPosition(car: Car): { x: number; y: number } | null {
    const mesh = this.carMeshes.get(car.id);
    if (mesh === undefined) return null;

    this.projectionScratch.copy(mesh.position);
    this.projectionScratch.y = 1.9;
    return this.projectToScreen(this.projectionScratch);
  }

  resize(): void {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (width === 0 || height === 0) return;
    this.viewportWidth = width;
    this.viewportHeight = height;

    const aspect = width / height;

    // Önce genişliği hedefe sabitle; yatay ekranlarda derinlik sığmıyorsa yüksekliğe geç.
    let frustumWidth = TARGET_WIDTH;
    let frustumHeight = frustumWidth / aspect;

    if (frustumHeight < TARGET_HEIGHT) {
      frustumHeight = TARGET_HEIGHT;
      frustumWidth = frustumHeight * aspect;
    }

    this.frustumWidth = frustumWidth;
    this.frustumHeight = frustumHeight;
    this.updateProjection();

    this.renderer.setSize(width, height, false);
  }

  // ---------- Görünüm denetimi (kaydırma / yakınlaştırma) ----------

  private updateProjection(): void {
    const halfWidth = this.frustumWidth / (2 * this.zoomLevel);
    const halfHeight = this.frustumHeight / (2 * this.zoomLevel);

    this.camera.left = -halfWidth;
    this.camera.right = halfWidth;
    this.camera.top = halfHeight;
    this.camera.bottom = -halfHeight;
    this.camera.updateProjectionMatrix();
  }

  private applyCamera(): void {
    this.camera.position.copy(this.cameraTarget).add(this.cameraOffset);
    this.camera.lookAt(this.cameraTarget);
  }

  /** Ekran noktasının zemindeki (y=0) karşılığı; imlece göre yakınlaştırmak için. */
  private groundPointAt(clientX: number, clientY: number): THREE.Vector3 | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);

    return this.raycaster.ray.intersectPlane(this.groundPlane, this.groundHit);
  }

  /** İmlecin altındaki zemin noktası sabit kalacak şekilde yakınlaştırır. */
  zoomAt(factor: number, clientX: number, clientY: number): void {
    const next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, this.zoomLevel * factor));
    if (next === this.zoomLevel) return;

    const before = this.groundPointAt(clientX, clientY)?.clone() ?? null;
    this.zoomLevel = next;
    this.updateProjection();

    if (before !== null) {
      const after = this.groundPointAt(clientX, clientY);
      if (after !== null) {
        this.cameraTarget.x += before.x - after.x;
        this.cameraTarget.z += before.z - after.z;
        this.clampTarget();
        this.applyCamera();
      }
    }
  }

  /** Ekran pikseli cinsinden sürüklemeyi dünya düzleminde kaydırmaya çevirir. */
  panByScreen(deltaX: number, deltaY: number): void {
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const worldPerPixelX = this.frustumWidth / this.zoomLevel / rect.width;
    const worldPerPixelY = this.frustumHeight / this.zoomLevel / rect.height;

    // Kameranın sağ ekseni ve zemine izdüşen ileri ekseni.
    const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
    right.y = 0;
    right.normalize();

    const forward = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1);
    forward.y = 0;
    forward.normalize();

    // İçerik parmağı takip etsin: parmak sağa giderse görüş alanı sola kayar.
    // Dikeyde forward zaten kameradan uzağa (ekranda yukarı) baktığı için
    // işaret yatayın tersidir; ikisini aynı yazmak aşağı/yukarıyı ters çeviriyordu.
    this.cameraTarget.addScaledVector(right, -deltaX * worldPerPixelX);
    this.cameraTarget.addScaledVector(forward, deltaY * worldPerPixelY);

    this.clampTarget();
    this.applyCamera();
  }

  private clampTarget(): void {
    this.cameraTarget.x = Math.max(
      this.homeTarget.x - PAN_LIMIT_X,
      Math.min(this.homeTarget.x + PAN_LIMIT_X, this.cameraTarget.x),
    );
    this.cameraTarget.z = Math.max(
      this.homeTarget.z - PAN_LIMIT_Z,
      Math.min(this.homeTarget.z + PAN_LIMIT_Z, this.cameraTarget.z),
    );
  }

  /** Görünümü başlangıç çerçevesine döndürür. */
  resetView(): void {
    this.cameraTarget.copy(this.homeTarget);
    this.zoomLevel = 1;
    this.updateProjection();
    this.applyCamera();
  }

  /** İki parmak veya sürükleme sürüyor mu — dokunma/basılı tutma bunu beklemeli. */
  get isGesturing(): boolean {
    return this.panning || this.activePointers.size > 1;
  }

  private attachViewControls(): void {
    const canvas = this.renderer.domElement;

    canvas.addEventListener(
      'wheel',
      (event) => {
        event.preventDefault();
        this.zoomAt(Math.pow(0.999, event.deltaY), event.clientX, event.clientY);
      },
      { passive: false },
    );

    canvas.addEventListener('pointerdown', (event) => {
      this.activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

      if (this.activePointers.size === 1) {
        this.panPointerId = event.pointerId;
        this.panStart = { x: event.clientX, y: event.clientY };
        this.panning = false;
        return;
      }

      // İkinci parmak indi: tek parmak kaydırmasını bırak, kıstırmaya geç.
      this.panPointerId = null;
      this.panning = false;
      this.pinchDistance = this.currentPinchDistance();
    });

    canvas.addEventListener('pointermove', (event) => {
      const tracked = this.activePointers.get(event.pointerId);
      if (tracked === undefined) return;

      const previous = { ...tracked };
      tracked.x = event.clientX;
      tracked.y = event.clientY;

      if (this.activePointers.size >= 2) {
        const distance = this.currentPinchDistance();
        if (this.pinchDistance > 0 && distance > 0) {
          const center = this.pinchCenter();
          this.zoomAt(distance / this.pinchDistance, center.x, center.y);
        }
        this.pinchDistance = distance;
        return;
      }

      if (this.panPointerId !== event.pointerId) return;

      if (!this.panning) {
        const travelled = Math.hypot(
          event.clientX - this.panStart.x,
          event.clientY - this.panStart.y,
        );
        if (travelled <= PAN_THRESHOLD_PX) return;
        this.panning = true;
      }

      this.panByScreen(event.clientX - previous.x, event.clientY - previous.y);
    });

    const release = (event: PointerEvent): void => {
      this.activePointers.delete(event.pointerId);

      if (this.activePointers.size < 2) this.pinchDistance = 0;
      if (this.panPointerId === event.pointerId) {
        this.panPointerId = null;
        this.panning = false;
      }
    };

    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);
    canvas.addEventListener('pointerleave', release);
  }

  private currentPinchDistance(): number {
    const [first, second] = [...this.activePointers.values()];
    if (first === undefined || second === undefined) return 0;

    return Math.hypot(first.x - second.x, first.y - second.y);
  }

  private pinchCenter(): { x: number; y: number } {
    const [first, second] = [...this.activePointers.values()];
    if (first === undefined || second === undefined) return { x: 0, y: 0 };

    return { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  /** Ekran koordinatından pompa indeksi bulur. Boşluğa dokunulduysa null. */
  pick(clientX: number, clientY: number): number | null {
    return this.pickTarget(clientX, clientY)?.slotIndex ?? null;
  }

  /** Uzun basma için ışının arabaya mı pompa adasına mı değdiğini de döndürür. */
  pickTarget(clientX: number, clientY: number): WorldPick | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObjects(this.pickables, true)[0];
    if (hit === undefined) return null;

    let slotIndex: number | null = null;
    let kind: WorldPick['kind'] = 'pump';
    let node: THREE.Object3D | null = hit.object;
    while (node !== null) {
      const index: unknown = node.userData.slotIndex;
      if (typeof index === 'number') slotIndex = index;
      if (node.userData.pickKind === 'car') kind = 'car';
      if (node.userData.pickKind === 'market') kind = 'market';
      node = node.parent;
    }

    if (kind === 'market') return { slotIndex: null, kind };
    return slotIndex === null ? null : { slotIndex, kind };
  }

  projectToScreen(position: THREE.Vector3): { x: number; y: number } {
    const projected = this.projectionScratch === position
      ? position.project(this.camera)
      : this.projectionScratch.copy(position).project(this.camera);

    return {
      x: (projected.x * 0.5 + 0.5) * this.viewportWidth,
      y: (-projected.y * 0.5 + 0.5) * this.viewportHeight,
    };
  }
}

interface CarTransform {
  readonly x: number;
  readonly z: number;
  readonly rotation: number;
  /** Özel araçlarda (tanker gibi) varsayılan gövde ölçüsünü geçersiz kılar. */
  readonly halfWidth?: number;
  readonly halfLength?: number;
}

type StationRouteKind = 'arriving' | 'leaving';

const stationRoutes = {
  arriving: new Map<string, THREE.CatmullRomCurve3>(),
  leaving: new Map<string, THREE.CatmullRomCurve3>(),
};
const parkedRotations = new Map<number, number>();

/**
 * İstasyona giriş ve çıkışları tek karede sağa/sola kırmak yerine kavisli yol
 * üzerinden örnekler. GetPointAt eşit aralıklı hız verdiği için mobilde de akıcıdır.
 */
/**
 * Rota noktaları elle ayarlandığı için trafik yönü değişince yeniden çizilmez;
 * kapıya göre olan z ofsetleri akış yönüyle çarpılarak aynalanır. x değerleri
 * aynı kalır — yol ve istasyon yerinde durur.
 */
function stationRoute(slot: SlotDefinition, kind: StationRouteKind): THREE.CatmullRomCurve3 {
  const key = `${activeTrafficSide}:${slot.index}`;
  const cached = stationRoutes[kind].get(key);
  if (cached !== undefined) return cached;

  const f = flow();
  const entry = gateIn();
  const exit = gateOut();

  const points = kind === 'arriving'
    ? [
        new THREE.Vector3(INBOUND_TRAFFIC_X, 0, entry),
        new THREE.Vector3(INBOUND_TRAFFIC_X - 0.95, 0, entry + f * 0.32),
        new THREE.Vector3(LANE_X + 2.15, 0, entry + f * 1.18),
        new THREE.Vector3(LANE_X + 0.35, 0, entry + f * 2.35),
        new THREE.Vector3(LANE_X, 0, slot.z - f * 1.15),
        new THREE.Vector3(slot.carX, 0, slot.z - f * 0.85),
        new THREE.Vector3(slot.carX, 0, slot.z),
      ]
    : [
        new THREE.Vector3(slot.carX, 0, slot.z),
        new THREE.Vector3(slot.carX, 0, slot.z + f * 0.85),
        new THREE.Vector3(LANE_X, 0, slot.z + f * 1.15),
        new THREE.Vector3(
          LANE_X,
          0,
          furthestAlongFlow(slot.z + f * 2.55, exit - f * 2.1),
        ),
        new THREE.Vector3(LANE_X + 1.95, 0, exit - f * 1.1),
        new THREE.Vector3(ROAD_X - ROAD_WIDTH / 2 + 0.12, 0, exit - f * 0.24),
        new THREE.Vector3(OUTBOUND_TRAFFIC_X - 0.42, 0, exit),
        new THREE.Vector3(OUTBOUND_TRAFFIC_X, 0, exit),
      ];
  const route = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  route.arcLengthDivisions = 96;
  stationRoutes[kind].set(key, route);
  return route;
}

function sampleStationRoute(route: THREE.CatmullRomCurve3, progress: number): CarTransform {
  const pointProgress = smooth(progress);
  const point = route.getPointAt(pointProgress);
  const tangent = route.getTangentAt(pointProgress);
  return {
    x: point.x,
    z: point.z,
    rotation: Math.atan2(-tangent.x, -tangent.z),
  };
}

function parkedRotation(slot: SlotDefinition): number {
  const cached = parkedRotations.get(slot.index);
  if (cached !== undefined) return cached;

  const rotation = sampleStationRoute(stationRoute(slot, 'arriving'), 1).rotation;
  parkedRotations.set(slot.index, rotation);
  return rotation;
}

/** Belirli bir sonraki ilerleme değeri için arabanın rota pozunu hesaplar. */
function carTransformAt(
  car: Car,
  slot: SlotDefinition,
  progress: number,
): CarTransform {
  if (car.phase === 'arriving') {
    return sampleStationRoute(stationRoute(slot, 'arriving'), progress);
  }

  const parkingRotation = parkedRotation(slot);
  if (car.phase === 'leaving') {
    const transform = sampleStationRoute(stationRoute(slot, 'leaving'), progress);
    // Park yerinden çıkışta kısa geri manevra/teker çevirme süresi: araç 180°
    // bir karede dönmez, görünür biçimde yönünü toparlayıp yola katılır.
    const turnProgress = smooth(Math.min(1, progress / 0.24));
    return {
      ...transform,
      rotation: lerpAngle(parkingRotation, transform.rotation, turnProgress),
    };
  }

  return { x: slot.carX, z: slot.z, rotation: parkingRotation };
}

/** Arabanın yol üzerindeki konumu ve yönü — dönüşler rota teğetinden alınır. */
function carTransform(car: Car, slot: SlotDefinition): CarTransform {
  return carTransformAt(car, slot, car.progress);
}

/**
 * İki aracın XZ düzlemindeki yönlü gövdelerini SAT ile karşılaştırır. Dairesel
 * mesafe kullanmamak, merkez şeridin yanındaki park halindeki araçların gereksiz
 * yere rotayı kilitlemesini önler.
 */
function vehicleBodiesOverlap(
  first: CarTransform,
  second: CarTransform,
  margin: number,
): boolean {
  const firstHalfWidth = first.halfWidth ?? 0.75;
  const firstHalfLength = first.halfLength ?? 1.62;
  const secondHalfWidth = second.halfWidth ?? 0.75;
  const secondHalfLength = second.halfLength ?? 1.62;
  const firstAxes = [
    { x: Math.cos(first.rotation), z: -Math.sin(first.rotation) },
    { x: Math.sin(first.rotation), z: Math.cos(first.rotation) },
  ] as const;
  const secondAxes = [
    { x: Math.cos(second.rotation), z: -Math.sin(second.rotation) },
    { x: Math.sin(second.rotation), z: Math.cos(second.rotation) },
  ] as const;
  const deltaX = second.x - first.x;
  const deltaZ = second.z - first.z;

  for (const axis of [...firstAxes, ...secondAxes]) {
    const centerDistance = Math.abs(deltaX * axis.x + deltaZ * axis.z);
    const firstRadius =
      firstHalfWidth * Math.abs(firstAxes[0].x * axis.x + firstAxes[0].z * axis.z) +
      firstHalfLength * Math.abs(firstAxes[1].x * axis.x + firstAxes[1].z * axis.z);
    const secondRadius =
      secondHalfWidth * Math.abs(secondAxes[0].x * axis.x + secondAxes[0].z * axis.z) +
      secondHalfLength * Math.abs(secondAxes[1].x * axis.x + secondAxes[1].z * axis.z);
    if (centerDistance > firstRadius + secondRadius + margin) return false;
  }
  return true;
}

function createGroundPatch(
  points: readonly (readonly [number, number])[],
  material: THREE.Material,
  y: number,
): THREE.Mesh {
  const first = points[0];
  if (first === undefined) throw new Error('Zemin parçası için en az bir nokta gerekir');

  const shape = new THREE.Shape();
  shape.moveTo(first[0], -first[1]);
  for (const [x, z] of points.slice(1)) shape.lineTo(x, -z);
  shape.closePath();

  const geometry = new THREE.ShapeGeometry(shape);
  geometry.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = y;
  mesh.receiveShadow = true;
  return mesh;
}

function createConstructionCone(): THREE.Group {
  const group = new THREE.Group();
  const orange = new THREE.MeshStandardMaterial({ color: 0xf07b25, roughness: 0.72 });
  const white = new THREE.MeshStandardMaterial({ color: 0xf1eee3, roughness: 0.76 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x25282a, roughness: 0.92 });

  const base = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.055, 0.38), rubber);
  base.position.y = 0.09;
  base.castShadow = true;
  group.add(base);

  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.52, 10), orange);
  cone.position.y = 0.365;
  cone.castShadow = true;
  group.add(cone);

  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.137, 0.095, 10), white);
  band.position.y = 0.32;
  band.castShadow = true;
  group.add(band);
  return group;
}

function createConstructionBarrier(): THREE.Group {
  const group = new THREE.Group();
  const orange = new THREE.MeshStandardMaterial({ color: 0xe86f28, roughness: 0.72 });
  const white = new THREE.MeshStandardMaterial({ color: 0xf1eee3, roughness: 0.78 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x333538, roughness: 0.9 });

  for (const x of [-0.76, 0.76]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.68, 0.09), orange);
    post.position.set(x, 0.41, 0);
    post.castShadow = true;
    group.add(post);

    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.055, 0.2), dark);
    foot.position.set(x, 0.09, 0);
    group.add(foot);
  }

  for (let index = 0; index < 6; index += 1) {
    const rail = new THREE.Mesh(
      new THREE.BoxGeometry(0.255, 0.17, 0.075),
      index % 2 === 0 ? orange : white,
    );
    rail.position.set(-0.6375 + index * 0.255, 0.49, 0);
    rail.castShadow = true;
    group.add(rail);
  }
  return group;
}

/** Market satın alınana kadar görünen düşük poligonlu kazı ve güvenlik alanı. */
function createMarketConstructionSite(): THREE.Group {
  const group = new THREE.Group();
  const soilMaterial = new THREE.MeshStandardMaterial({ color: 0x75502f, roughness: 1 });
  const freshSoilMaterial = new THREE.MeshStandardMaterial({ color: 0x94663a, roughness: 1 });
  const pitMaterial = new THREE.MeshStandardMaterial({ color: 0x38281f, roughness: 1 });

  group.add(
    createGroundPatch(
      [
        [-3.65, -0.55],
        [-3.2, -1.18],
        [-1.65, -1.34],
        [-0.25, -1.18],
        [1.25, -1.35],
        [3.18, -1.08],
        [3.62, -0.38],
        [3.38, 0.8],
        [2.2, 1.24],
        [0.55, 1.12],
        [-1.1, 1.3],
        [-2.85, 1.03],
        [-3.72, 0.35],
      ],
      soilMaterial,
      0.072,
    ),
  );

  // Koyu merkez ve etrafındaki yığınlar gerçek geometriyi delmeden çukur hissi verir.
  group.add(
    createGroundPatch(
      [
        [-2.45, -0.45],
        [-1.6, -0.76],
        [-0.2, -0.67],
        [1.05, -0.82],
        [2.48, -0.38],
        [2.28, 0.42],
        [0.9, 0.66],
        [-0.5, 0.55],
        [-1.85, 0.72],
        [-2.58, 0.25],
      ],
      pitMaterial,
      0.078,
    ),
  );

  const moundGeometry = new THREE.DodecahedronGeometry(0.58, 0);
  for (const [x, z, sx, sz] of [
    [-2.75, 0.72, 1.25, 0.72],
    [-1.75, 0.98, 0.92, 0.58],
    [2.55, -0.68, 1.18, 0.7],
    [3.0, 0.42, 0.82, 0.56],
  ] as const) {
    const mound = new THREE.Mesh(moundGeometry, freshSoilMaterial);
    mound.position.set(x, 0.23, z);
    mound.scale.set(sx, 0.34, sz);
    mound.rotation.y = x * 0.31;
    mound.castShadow = true;
    mound.receiveShadow = true;
    group.add(mound);
  }

  const stoneGeometry = new THREE.DodecahedronGeometry(0.12, 0);
  const stoneMaterial = new THREE.MeshStandardMaterial({ color: 0x655b4d, roughness: 1 });
  for (const [x, z, scale] of [
    [-2.15, -0.92, 1],
    [-0.75, 0.88, 0.8],
    [1.75, 0.92, 1.15],
    [2.25, -1.02, 0.72],
  ] as const) {
    const stone = new THREE.Mesh(stoneGeometry, stoneMaterial);
    stone.position.set(x, 0.15, z);
    stone.scale.setScalar(scale);
    stone.castShadow = true;
    group.add(stone);
  }

  const conePrototype = createConstructionCone();
  for (const [x, z, rotation] of [
    [-3.65, -1.35, -0.12],
    [-1.25, -1.55, 0.08],
    [1.35, -1.52, -0.06],
    [3.62, -1.2, 0.1],
    [-3.72, 1.25, 0.08],
    [-0.45, 1.5, -0.08],
    [3.55, 1.22, 0.12],
  ] as const) {
    const cone = conePrototype.clone(true);
    cone.position.set(x, 0, z);
    cone.rotation.y = rotation;
    group.add(cone);
  }

  const frontBarrier = createConstructionBarrier();
  frontBarrier.position.set(1.6, 0, 1.48);
  frontBarrier.rotation.y = 0.05;
  group.add(frontBarrier);

  const sideBarrier = createConstructionBarrier();
  sideBarrier.position.set(-3.75, 0, -0.05);
  sideBarrier.rotation.y = Math.PI / 2;
  group.add(sideBarrier);

  // Temel için bırakılmış birkaç kısa donatı çubuğu.
  const rebarGeometry = new THREE.CylinderGeometry(0.025, 0.025, 0.72, 6);
  const rebarMaterial = new THREE.MeshStandardMaterial({
    color: 0x4a3d35,
    roughness: 0.82,
    metalness: 0.35,
  });
  for (const [x, z] of [[-1.1, 0.05], [-0.92, 0.2], [0.95, -0.12]] as const) {
    const rebar = new THREE.Mesh(rebarGeometry, rebarMaterial);
    rebar.position.set(x, 0.4, z);
    rebar.castShadow = true;
    group.add(rebar);
  }

  return group;
}

/** Şerit kapanışında görünen çukur, koniler ve çalışan belediye ekibi. */
function createRoadworkSite(): THREE.Group {
  const group = new THREE.Group();
  const asphalt = new THREE.MeshStandardMaterial({ color: 0x1c1d1e, roughness: 1 });
  const freshAsphalt = new THREE.MeshStandardMaterial({ color: 0x3e4246, roughness: 0.96 });
  const vest = new THREE.MeshStandardMaterial({ color: 0xf2a13c, roughness: 0.84 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xd9a478, roughness: 0.88 });
  const trouser = new THREE.MeshStandardMaterial({ color: 0x2f3840, roughness: 0.9 });

  const patch = new THREE.Mesh(new THREE.CircleGeometry(0.53, 7), asphalt);
  patch.rotation.x = -Math.PI / 2;
  patch.scale.set(1, 1.22, 1);
  patch.position.y = 0.094;
  patch.receiveShadow = true;
  group.add(patch);
  group.userData.patch = patch;

  const fill = new THREE.Mesh(new THREE.CircleGeometry(0.28, 7), freshAsphalt);
  fill.rotation.x = -Math.PI / 2;
  fill.position.y = 0.098;
  fill.scale.set(1, 1.1, 1);
  fill.visible = false;
  group.add(fill);
  group.userData.fill = fill;

  for (const [x, z] of [
    [-0.72, -0.82],
    [0.72, -0.82],
    [-0.72, 0.82],
    [0.72, 0.82],
  ] as const) {
    const cone = createConstructionCone();
    cone.scale.setScalar(0.78);
    cone.position.set(x, 0, z);
    group.add(cone);
  }

  const barrier = createConstructionBarrier();
  barrier.scale.setScalar(0.8);
  barrier.position.set(0, 0, 1.03);
  group.add(barrier);

  const worker = new THREE.Group();
  worker.position.set(0.88, 0, -0.16);
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.46, 0.18), vest);
  body.position.y = 0.73;
  body.castShadow = true;
  worker.add(body);
  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.14, 1), skin);
  head.position.y = 1.08;
  head.castShadow = true;
  worker.add(head);
  for (const x of [-0.07, 0.07]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.35, 0.09), trouser);
    leg.position.set(x, 0.29, 0);
    worker.add(leg);
  }
  const shovel = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.82, 0.035), freshAsphalt);
  shovel.position.set(-0.16, 0.64, 0.1);
  shovel.rotation.z = 0.35;
  worker.add(shovel);
  group.userData.worker = worker;
  group.add(worker);

  return group;
}

/** Çevre cezaları ve kaçak satışlardan sonra girişte beliren hafif protesto kalabalığı. */
function createProtestGroup(): THREE.Group {
  const crowd = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: 0xd6a276, roughness: 0.88 });
  const trouser = new THREE.MeshStandardMaterial({ color: 0x303842, roughness: 0.92 });
  const sign = new THREE.MeshStandardMaterial({ color: 0xe8ddbc, roughness: 0.94 });
  const ink = new THREE.MeshStandardMaterial({ color: 0x3d714b, roughness: 0.8 });
  const stick = new THREE.MeshStandardMaterial({ color: 0x785436, roughness: 0.9 });
  const shirtColors = [0xb74942, 0x3e6f9b, 0xd18b2f, 0x687c48, 0x76528f] as const;

  for (const [index, position] of ([
    [-0.7, 0.28],
    [0.05, -0.08],
    [0.78, 0.35],
    [-0.15, 0.72],
    [0.65, 0.98],
  ] as const).entries()) {
    const person = new THREE.Group();
    person.position.set(position[0], 0, position[1]);
    person.rotation.y = -0.28;
    person.userData.protestOffset = index * 1.37;
    person.userData.protestHomeX = position[0];
    person.userData.protestHomeZ = position[1];
    // Kadraj dışında sol çimenlikten yürüyerek gelirler; grup görünür olduğu
    // anda birden belirmez.
    person.userData.protestSpawnX = -5.8 - index * 0.38;
    person.userData.protestSpawnZ = -1.9 + index * 0.55;
    person.userData.protestState = 'outside';
    person.visible = false;

    const shirt = new THREE.MeshStandardMaterial({
      color: shirtColors[index] ?? 0x687c48,
      roughness: 0.9,
    });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.48, 0.2), shirt);
    body.position.y = 0.72;
    body.castShadow = true;
    person.add(body);

    const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.15, 1), skin);
    head.position.y = 1.12;
    head.castShadow = true;
    person.add(head);

    for (const x of [-0.085, 0.085]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.38, 0.11), trouser);
      leg.position.set(x, 0.3, 0);
      leg.castShadow = true;
      person.add(leg);
    }

    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.035, 1.02, 0.035), stick);
    pole.position.set(0.24, 1.17, 0.04);
    pole.rotation.z = -0.08;
    person.add(pole);

    const placard = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.42, 0.055), sign);
    placard.position.set(0.2, 1.62, 0.04);
    placard.castShadow = true;
    person.add(placard);

    for (const y of [1.68, 1.56]) {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.045, 0.062), ink);
      stripe.position.set(0.2, y, 0.012);
      person.add(stripe);
    }

    crowd.add(person);
  }

  crowd.scale.setScalar(0.92);
  return crowd;
}

/** Düşük fiyatta stoklama yatırımının sahadaki dört büyük tanklık karşılığı. */
function createStorageTankSite(): THREE.Group {
  const site = new THREE.Group();
  const shell = new THREE.MeshStandardMaterial({
    color: 0xadb3b1,
    roughness: 0.62,
    metalness: 0.42,
  });
  const darkMetal = new THREE.MeshStandardMaterial({
    color: 0x444d50,
    roughness: 0.72,
    metalness: 0.35,
  });
  const warning = new THREE.MeshStandardMaterial({
    color: 0xd69232,
    roughness: 0.78,
  });
  const concrete = new THREE.MeshStandardMaterial({ color: 0x83847e, roughness: 0.96 });

  for (const [index, [x, z]] of ([
    [-0.72, 0],
    [0.72, -0.22],
    [-0.72, -2.15],
    [0.72, -2.37],
  ] as const).entries()) {
    const tank = new THREE.Group();
    tank.position.set(x, 0, z);

    const pad = new THREE.Mesh(new THREE.CylinderGeometry(1.03, 1.08, 0.12, 16), concrete);
    pad.position.y = 0.08;
    pad.receiveShadow = true;
    tank.add(pad);

    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.82, 0.86, 1.48, 16), shell);
    body.position.y = 0.86;
    body.castShadow = true;
    body.receiveShadow = true;
    tank.add(body);

    const roof = new THREE.Mesh(new THREE.ConeGeometry(0.84, 0.28, 16), darkMetal);
    roof.position.y = 1.74;
    roof.castShadow = true;
    tank.add(roof);

    const band = new THREE.Mesh(new THREE.TorusGeometry(0.835, 0.035, 6, 16), warning);
    band.position.y = 1.08;
    band.rotation.x = Math.PI / 2;
    tank.add(band);

    const ladderRailGeometry = new THREE.BoxGeometry(0.035, 1.32, 0.035);
    for (const railX of [-0.11, 0.11]) {
      const rail = new THREE.Mesh(ladderRailGeometry, darkMetal);
      rail.position.set(railX, 0.92, 0.86);
      tank.add(rail);
    }
    for (let rung = 0; rung < 6; rung += 1) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.025, 0.035), darkMetal);
      step.position.set(0, 0.37 + rung * 0.22, 0.86);
      tank.add(step);
    }

    tank.rotation.y = index % 2 === 0 ? -0.18 : 0.16;
    tank.visible = false;
    site.add(tank);
  }

  return site;
}

function createBush(scale = 1): THREE.Group {
  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ color: 0x427541, roughness: 1 });

  for (const [x, z, size] of [[0, 0, 0.52], [0.3, 0.08, 0.34], [-0.28, 0.14, 0.38]] as const) {
    const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(size, 1), material);
    leaf.position.set(x, size * 0.72, z);
    leaf.castShadow = true;
    leaf.receiveShadow = true;
    group.add(leaf);
  }

  group.scale.setScalar(scale);
  return group;
}

/** Küçük, okunabilir kedi silueti: gövde, baş, iki kulak ve kuyruk. */
function createCat(): THREE.Group {
  const group = new THREE.Group();
  const fur = new THREE.MeshStandardMaterial({ color: 0x3f4349, roughness: 0.9 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.22, 0.24), fur);
  body.position.y = 0.16;
  group.add(body);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), fur);
  head.position.set(0.23, 0.27, 0);
  group.add(head);

  for (const z of [-0.07, 0.07]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.15, 3), fur);
    ear.position.set(0.25, 0.42, z);
    group.add(ear);
  }

  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.04, 0.42, 6), fur);
  tail.position.set(-0.28, 0.3, 0);
  tail.rotation.z = -0.82;
  group.add(tail);

  return group;
}

/** Synth loop ile aynı ritimde yayılan mobil dostu bass halkaları. */
function createBassEffect(): THREE.Group {
  const group = new THREE.Group();
  group.position.y = 0.08;

  for (const radius of [0.42, 0.62]) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(radius - 0.028, radius + 0.028, 20),
      new THREE.MeshBasicMaterial({ color: 0xb172ff, transparent: true, opacity: 0.4, depthWrite: false }),
    );
    ring.rotation.x = -Math.PI / 2;
    group.add(ring);
  }

  return group;
}

function createSmokeEffect(): THREE.Group {
  const group = new THREE.Group();
  group.position.set(0, 1.0, 0.18);

  for (let index = 0; index < 3; index += 1) {
    const puff = new THREE.Mesh(
      new THREE.SphereGeometry(0.17, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0x6f7378, transparent: true, opacity: 0.4, depthWrite: false }),
    );
    puff.position.set((index - 1) * 0.1, index * 0.2, 0);
    group.add(puff);
  }

  return group;
}
