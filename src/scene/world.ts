import * as THREE from 'three';
import type { Car } from '../game/station';
import type { SlotDefinition } from '../game/slots';
import { ENTRY_Z, LANE_X, SLOTS, findSlot } from '../game/slots';
import {
  PumpIsland,
  createCar,
  createStationBuilding,
  setCarEmergencyLights,
  setCarHazards,
  setCarHeadlights,
  type VehicleStyle,
} from './models';

/**
 * Kuş bakışı istasyon: ortografik kamera sağ ön taraftan çapraz bakar.
 * Perspektif yerine ortografik seçildi — uzaktaki pompa yakındakiyle aynı
 * ölçekte görünür, oyuncu hepsini eşit kolaylıkta seçebilir.
 */

const GRASS_COLOR = 0x6f985a;
const LOT_COLOR = 0x50545b;
const ROAD_COLOR = 0x2c3139;
const LINE_COLOR = 0xd9d5c8;
const ROAD_LINE_COLOR = 0xf0d27d;
const CURB_COLOR = 0xb9bbb4;
const SKY_COLOR = 0x8fb4cc;

/** Sağdaki ana yolu da gösterecek, dikey ekrana göre ayarlanmış referans genişlik. */
const TARGET_WIDTH = 10.4;
/** Yatay ekranda derinlik sığsın diye referans yükseklik. */
const TARGET_HEIGHT = 15;

/** İstasyonun sağındaki, NPC'lerin kullandığı ana yol. */
const ROAD_X = 5.45;
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
const FOLLOWER_FLASH_HEADWAY = 9;
/** Acil araçlar görünür yol kesitini baştan başa, orta koridordan geçer. */
const EMERGENCY_ROUTE_LIMIT = 28;
const EMERGENCY_YIELD_DISTANCE = 16;
const EMERGENCY_STOP_DISTANCE = 6.5;
const EMERGENCY_SHOULDER_INSET = 0.24;

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

type TrafficEventKind = 'bass' | 'overtake' | 'breakdown';

interface TrafficEvent {
  readonly kind: TrafficEventKind;
  elapsed: number;
  readonly duration: number;
  readonly originX?: number;
  readonly targetX?: number;
  readonly effect?: THREE.Group;
}

interface CatEvent {
  readonly mesh: THREE.Group;
  readonly z: number;
  elapsed: number;
  readonly duration: number;
}

interface EmergencyVehicle {
  readonly mesh: THREE.Group;
  readonly direction: TrafficDirection;
  readonly speed: number;
  elapsed: number;
}

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
    style === 'convertible'
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

  private readonly container: HTMLElement;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly pickables: THREE.Object3D[] = [];
  private readonly carMeshes = new Map<number, THREE.Group>();
  private readonly trafficCars: TrafficCar[] = [];
  private readonly isMobileDevice = window.matchMedia('(pointer: coarse)').matches;
  private catEvent: CatEvent | null = null;
  private emergencyVehicle: EmergencyVehicle | null = null;
  private nextTrafficEventIn = randomBetween(4.5, 8.5);
  private nextEmergencyVehicleIn = randomBetween(9, 15);

  constructor(container: HTMLElement) {
    this.container = container;

    this.scene.background = new THREE.Color(SKY_COLOR);

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 120);
    // Referanstaki izometrik hissi, istasyonun sağ önünden alıyoruz. Ana yol
    // bu yüzden ekranın sağında akıyor; pompalar ve müşteri arabaları açıkta kalıyor.
    this.camera.position.set(14, 21, 15);
    this.camera.lookAt(-0.45, 0, -0.8);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    // Trafik varken mobil GPU'da gereksiz yüksek çözünürlüklü render yapma.
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.isMobileDevice ? 1.5 : 2));
    this.renderer.shadowMap.enabled = true;
    // r185'te PCFSoftShadowMap kullanımdan kaldırıldı; PCF zaten yumuşatıyor.
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(this.renderer.domElement);

    this.addLights();
    this.addGround();
    this.scene.add(createStationBuilding());
    this.addIslands();
    this.addTraffic();

    this.resize();
  }

  private addLights(): void {
    this.scene.add(new THREE.HemisphereLight(0xdce9f5, 0x5a5f66, 1.6));

    const sun = new THREE.DirectionalLight(0xfff3dd, 2.1);
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

    // İstasyon betonu ekranın altına ve üstüne taşar; kamera döndüğünde arazi
    // veya otoparkın keskin bir bitişi görünmez.
    const lot = new THREE.Mesh(
      new THREE.BoxGeometry(7.4, 0.06, 120),
      new THREE.MeshStandardMaterial({ color: LOT_COLOR, roughness: 1 }),
    );
    lot.position.set(0, 0.03, -1);
    lot.receiveShadow = true;
    this.scene.add(lot);

    const lineMaterial = new THREE.MeshStandardMaterial({ color: LINE_COLOR, roughness: 0.9 });

    // Sürüş şeridinin kenar çizgileri.
    for (const lineX of [-0.82, 0.82]) {
      const line = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.02, 108), lineMaterial);
      line.position.set(lineX, 0.07, -1);
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

    this.addRoad();
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

    // Yolun iki kenarındaki kaldırım şeritleri, asfaltın zeminden ayrışmasını sağlar.
    for (const xOffset of [-ROAD_WIDTH / 2, ROAD_WIDTH / 2]) {
      const curb = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, ROAD_LENGTH), curbMaterial);
      curb.position.set(ROAD_X + xOffset, 0.06, ROAD_CENTER_Z);
      curb.receiveShadow = true;
      this.scene.add(curb);
    }

    // Ortadaki kesik sarı çizgi: araçların çift yönlü aktığı ilk bakışta anlaşılır.
    for (let z = ROAD_CENTER_Z - ROAD_LENGTH / 2 + 1.4; z < ROAD_CENTER_Z + ROAD_LENGTH / 2; z += 3.2) {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.025, 1.3), roadLineMaterial);
      stripe.position.set(ROAD_X, 0.095, z);
      this.scene.add(stripe);
    }

    this.addRoadsideBushes();
  }

  /** Kedi olayının okunabilmesi için yol kenarında birkaç çalı ekler. */
  private addRoadsideBushes(): void {
    for (const z of [-18, -9, -2, 6, 14, 23]) {
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
        seed.direction,
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
  ): void {
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

    this.trafficCars.push({
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
    });
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

  /** Trafikteki mesh'i yeni oluşan müşteriyle eşleştirir; yeni mesh yaratılmaz. */
  private transferTrafficCarToCustomer(trafficCar: TrafficCar, customer: Car): void {
    const trafficIndex = this.trafficCars.indexOf(trafficCar);
    if (trafficIndex >= 0) this.trafficCars.splice(trafficIndex, 1);

    const mesh = trafficCar.mesh;
    mesh.position.z = ENTRY_Z;
    mesh.userData.slotIndex = customer.slotIndex;
    this.carMeshes.set(customer.id, mesh);
    this.pickables.push(mesh);
  }

  /** İstasyonu terk eden müşteri aracını giden şeride geri verir. */
  private returnCustomerToTraffic(mesh: THREE.Group): void {
    const pickableIndex = this.pickables.indexOf(mesh);
    if (pickableIndex >= 0) this.pickables.splice(pickableIndex, 1);

    const color = typeof mesh.userData.trafficColor === 'number' ? mesh.userData.trafficColor : 0xe8e6e1;
    delete mesh.userData.slotIndex;
    this.registerTrafficCar(
      mesh,
      1,
      OUTBOUND_TRAFFIC_X,
      ENTRY_Z,
      randomBetween(3.35, 4.25),
      color,
      vehicleStyleOf(mesh),
    );
  }

  private addIslands(): void {
    for (const slot of SLOTS) {
      const island = new PumpIsland(slot.index, slot.pumpX, slot.z);
      this.islands.set(slot.index, island);
      this.scene.add(island.group);
      this.pickables.push(island.group);
    }
  }

  /** Motordaki arabalarla sahnedeki mesh'leri eşitler. */
  syncCars(cars: Iterable<Car>): void {
    const alive = new Set<number>();

    // Bir önceki karede dolan hortumu kapat; aktif dolum aşağıda yeniden açılır.
    for (const island of this.islands.values()) island.setFueling(null);

    for (const car of cars) {
      alive.add(car.id);

      let mesh = this.carMeshes.get(car.id);
      if (mesh === undefined) {
        // Normal akışta bu dal çalışmaz: müşteri mesh'i trafikten devralınır.
        // Geliştirme konsolundan elle araba eklenirse sahne yine çalışsın.
        mesh = createCar(car.color);
        mesh.scale.setScalar(TRAFFIC_CAR_SCALE);
        mesh.userData.trafficColor = car.color;
        mesh.userData.slotIndex = car.slotIndex;
        this.carMeshes.set(car.id, mesh);
        this.scene.add(mesh);
        this.pickables.push(mesh);
      }

      const slot = findSlot(car.slotIndex);
      if (slot === undefined) continue;

      const transform = carTransform(car, slot);
      mesh.position.set(transform.x, VEHICLE_Y, transform.z);
      mesh.rotation.y = transform.rotation;

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
    this.updateCatEvent(deltaSeconds);
    this.updateEmergencyVehicle(deltaSeconds);

    this.nextEmergencyVehicleIn -= deltaSeconds;
    if (this.nextEmergencyVehicleIn <= 0) {
      const emergencyStarted = this.startEmergencyVehicle();
      this.nextEmergencyVehicleIn = emergencyStarted
        ? randomBetween(16, 28)
        : randomBetween(2.5, 5.5);
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
      const catStoppingDistance = this.catStoppingDistance(trafficCar);
      const catBrake = this.catBrakeMultiplier(catStoppingDistance);
      const emergencyBrake = this.emergencyYieldMultiplier(trafficCar, deltaSeconds);
      const desiredDistance =
        trafficCar.baseSpeed *
        trafficCar.pace *
        eventSpeed *
        catBrake *
        emergencyBrake *
        deltaSeconds;
      const headway = trafficCar.event?.kind === 'overtake'
        ? TRAFFIC_MAX_Z - TRAFFIC_MIN_Z
        : this.trafficHeadway(trafficCar);
      const distance = Math.min(
        desiredDistance,
        Math.max(0, headway - MIN_TRAFFIC_GAP),
        catStoppingDistance ?? Number.POSITIVE_INFINITY,
      );
      const nextZ = previousZ + trafficCar.direction * distance;

      // İstasyona sadece giriş şeridinden, gerçek bir araç eriştiğinde müşteri gelir.
      if (
        this.emergencyVehicle === null &&
        trafficCar.event === null &&
        trafficCar.direction === -1 &&
        previousZ >= ENTRY_Z &&
        nextZ <= ENTRY_Z
      ) {
        const customer = this.onTrafficCarAtEntrance?.(trafficCar.color) ?? null;
        if (customer !== null) {
          this.transferTrafficCarToCustomer(trafficCar, customer);
          continue;
        }
      }

      trafficCar.mesh.position.z = nextZ;
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
    if (this.emergencyVehicle !== null || this.catEvent !== null) return false;

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
    this.scene.add(mesh);

    this.emergencyVehicle = {
      mesh,
      direction,
      speed: randomBetween(9.4, 11.2),
      elapsed: 0,
    };
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
  }

  /**
   * Acil araç yaklaştığında iki yönün araçları da dış kaldırıma yönelir ve
   * gerektiğinde neredeyse durur. Araç geçince şerit merkezine yumuşak döner.
   */
  private emergencyYieldMultiplier(trafficCar: TrafficCar, deltaSeconds: number): number {
    const emergency = this.emergencyVehicle;
    if (emergency === null) {
      trafficCar.mesh.position.x = lerp(
        trafficCar.mesh.position.x,
        trafficCar.laneX,
        Math.min(1, deltaSeconds * 3.6),
      );
      return 1;
    }

    const distance = Math.abs(trafficCar.mesh.position.z - emergency.mesh.position.z);
    if (distance > EMERGENCY_YIELD_DISTANCE) {
      trafficCar.mesh.position.x = lerp(
        trafficCar.mesh.position.x,
        trafficCar.laneX,
        Math.min(1, deltaSeconds * 3.6),
      );
      return 1;
    }

    const side = trafficCar.laneX < ROAD_X ? -1 : 1;
    const shoulderX = ROAD_X + side * (ROAD_WIDTH / 2 - EMERGENCY_SHOULDER_INSET);
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

    const targetX = trafficCar.direction === -1 ? OUTBOUND_TRAFFIC_X : INBOUND_TRAFFIC_X;
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
    const candidates = this.trafficCars.filter(
      (trafficCar) =>
        trafficCar.event === null &&
        trafficCar.direction === 1 &&
        trafficCar.style !== 'sport' &&
        Math.abs(trafficCar.mesh.position.z - ENTRY_Z) > 8,
    );
    const trafficCar = randomItem(candidates);
    if (trafficCar === null) return false;

    const effect = createSmokeEffect();
    trafficCar.mesh.add(effect);
    trafficCar.event = {
      kind: 'breakdown',
      elapsed: 0,
      duration: 7.4,
      originX: trafficCar.mesh.position.x,
      targetX: ROAD_X + ROAD_WIDTH / 2 + 0.32,
      effect,
    };
    return true;
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

  /**
   * Öndeki araç fren yaptığında arkasındaki sürücü kısa kısa sellektör yapar.
   * Bu artık rastgele değil, gerçek takip mesafesi ve frenleme sonucunda tetiklenir.
   */
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
      trafficCar.highBeamTimer = 0.52;
      trafficCar.highBeamCooldown = randomBetween(0.82, 1.45);
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
        if (event.effect !== undefined) this.updateBassEffect(event.effect, event.elapsed);
        if (event.elapsed >= event.duration) this.finishTrafficEvent(trafficCar);
        return 1;

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
    const stoppedUntil = 5.8;
    const originX = event.originX ?? trafficCar.laneX;
    const targetX = event.targetX ?? trafficCar.laneX;
    const flashing = Math.floor(event.elapsed * 3) % 2 === 0;
    setCarHazards(trafficCar.mesh, flashing);

    if (event.elapsed < pullOverDuration) {
      trafficCar.mesh.position.x = lerp(originX, targetX, smooth(event.elapsed / pullOverDuration));
      return 0.28;
    }

    if (event.elapsed < stoppedUntil) {
      trafficCar.mesh.position.x = targetX;
      if (event.effect !== undefined) this.updateSmokeEffect(event.effect, event.elapsed);
      return 0;
    }

    if (event.elapsed < event.duration) {
      const progress = (event.elapsed - stoppedUntil) / (event.duration - stoppedUntil);
      trafficCar.mesh.position.x = lerp(targetX, originX, smooth(progress));
      return 0.34;
    }

    this.finishTrafficEvent(trafficCar);
    return 1;
  }

  private updateBassEffect(effect: THREE.Group, elapsed: number): void {
    effect.children.forEach((child, index) => {
      if (!(child instanceof THREE.Mesh) || !(child.material instanceof THREE.MeshBasicMaterial)) return;
      const pulse = (elapsed * 1.9 + index * 0.32) % 1;
      child.scale.setScalar(0.8 + pulse * 1.45);
      child.material.opacity = 0.52 * (1 - pulse);
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

    setCarHeadlights(trafficCar.mesh, false);
    setCarHazards(trafficCar.mesh, false);
    if (event.originX !== undefined) trafficCar.mesh.position.x = event.originX;
    if (event.effect !== undefined) {
      trafficCar.mesh.remove(event.effect);
      disposeEffect(event.effect);
    }
    trafficCar.event = null;
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
    const laneX = direction === -1 ? INBOUND_TRAFFIC_X : OUTBOUND_TRAFFIC_X;
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

    const anchor = mesh.position.clone();
    anchor.y = 1.9;
    return this.projectToScreen(anchor);
  }

  resize(): void {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (width === 0 || height === 0) return;

    const aspect = width / height;

    // Önce genişliği hedefe sabitle; yatay ekranlarda derinlik sığmıyorsa yüksekliğe geç.
    let frustumWidth = TARGET_WIDTH;
    let frustumHeight = frustumWidth / aspect;

    if (frustumHeight < TARGET_HEIGHT) {
      frustumHeight = TARGET_HEIGHT;
      frustumWidth = frustumHeight * aspect;
    }

    this.camera.left = -frustumWidth / 2;
    this.camera.right = frustumWidth / 2;
    this.camera.top = frustumHeight / 2;
    this.camera.bottom = -frustumHeight / 2;
    this.camera.updateProjectionMatrix();

    this.renderer.setSize(width, height, false);
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  /** Ekran koordinatından pompa indeksi bulur. Boşluğa dokunulduysa null. */
  pick(clientX: number, clientY: number): number | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObjects(this.pickables, true)[0];
    if (hit === undefined) return null;

    let node: THREE.Object3D | null = hit.object;
    while (node !== null) {
      const index: unknown = node.userData.slotIndex;
      if (typeof index === 'number') return index;
      node = node.parent;
    }

    return null;
  }

  projectToScreen(position: THREE.Vector3): { x: number; y: number } {
    const projected = position.clone().project(this.camera);
    const rect = this.renderer.domElement.getBoundingClientRect();

    return {
      x: (projected.x * 0.5 + 0.5) * rect.width,
      y: (-projected.y * 0.5 + 0.5) * rect.height,
    };
  }
}

interface CarTransform {
  readonly x: number;
  readonly z: number;
  readonly rotation: number;
}

type StationRouteKind = 'arriving' | 'leaving';

const stationRoutes = {
  arriving: new Map<number, THREE.CatmullRomCurve3>(),
  leaving: new Map<number, THREE.CatmullRomCurve3>(),
};
const parkedRotations = new Map<number, number>();

/**
 * İstasyona giriş ve çıkışları tek karede sağa/sola kırmak yerine kavisli yol
 * üzerinden örnekler. GetPointAt eşit aralıklı hız verdiği için mobilde de akıcıdır.
 */
function stationRoute(slot: SlotDefinition, kind: StationRouteKind): THREE.CatmullRomCurve3 {
  const cached = stationRoutes[kind].get(slot.index);
  if (cached !== undefined) return cached;

  const points = kind === 'arriving'
    ? [
        new THREE.Vector3(INBOUND_TRAFFIC_X, 0, ENTRY_Z),
        new THREE.Vector3(INBOUND_TRAFFIC_X, 0, ENTRY_Z - 1.05),
        new THREE.Vector3(LANE_X + 1.55, 0, ENTRY_Z - 1.9),
        new THREE.Vector3(LANE_X + 0.18, 0, ENTRY_Z - 3.05),
        new THREE.Vector3(LANE_X, 0, slot.z + 1.25),
        new THREE.Vector3(slot.carX, 0, slot.z),
      ]
    : [
        new THREE.Vector3(slot.carX, 0, slot.z),
        new THREE.Vector3(LANE_X, 0, slot.z),
        new THREE.Vector3(LANE_X, 0, slot.z + 1.15),
        new THREE.Vector3(LANE_X + 0.18, 0, ENTRY_Z - 2.8),
        new THREE.Vector3(OUTBOUND_TRAFFIC_X - 1.35, 0, ENTRY_Z - 1.15),
        new THREE.Vector3(OUTBOUND_TRAFFIC_X, 0, ENTRY_Z - 0.75),
        new THREE.Vector3(OUTBOUND_TRAFFIC_X, 0, ENTRY_Z),
      ];
  const route = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  route.arcLengthDivisions = 96;
  stationRoutes[kind].set(slot.index, route);
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

/** Arabanın yol üzerindeki konumu ve yönü — dönüşler rota teğetinden alınır. */
function carTransform(car: Car, slot: SlotDefinition): CarTransform {
  if (car.phase === 'arriving') {
    return sampleStationRoute(stationRoute(slot, 'arriving'), car.progress);
  }

  const parkingRotation = parkedRotation(slot);
  if (car.phase === 'leaving') {
    const transform = sampleStationRoute(stationRoute(slot, 'leaving'), car.progress);
    // Park yerinden çıkışta kısa geri manevra/teker çevirme süresi: araç 180°
    // bir karede dönmez, görünür biçimde yönünü toparlayıp yola katılır.
    const turnProgress = smooth(Math.min(1, car.progress / 0.24));
    return {
      ...transform,
      rotation: lerpAngle(parkingRotation, transform.rotation, turnProgress),
    };
  }

  return { x: slot.carX, z: slot.z, rotation: parkingRotation };
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

/** Üstü açık araçtan yayılan, ses yerine kullanılan mobil dostu bas halkaları. */
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
