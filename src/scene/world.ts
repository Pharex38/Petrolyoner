import * as THREE from 'three';
import type { Car } from '../game/station';
import type { SlotDefinition } from '../game/slots';
import { ENTRY_Z, EXIT_Z, LANE_X, SLOTS, findSlot } from '../game/slots';
import { PumpIsland, createCar, createStationBuilding } from './models';

/**
 * Kuş bakışı istasyon: ortografik kamera yukarıdan ~53° eğimle bakar.
 * Perspektif yerine ortografik seçildi — uzaktaki pompa yakındakiyle aynı
 * ölçekte görünür, oyuncu hepsini eşit kolaylıkta seçebilir.
 */

const ASPHALT_COLOR = 0x3c3f45;
const LOT_COLOR = 0x50545b;
const LINE_COLOR = 0xd9d5c8;
const SKY_COLOR = 0x8fb4cc;

/** Dikey ekranda istasyonun genişliği ekranı doldursun diye referans genişlik. */
const TARGET_WIDTH = 7.6;
/** Yatay ekranda derinlik sığsın diye referans yükseklik. */
const TARGET_HEIGHT = 12;

/** Giriş yolunun ne kadarı şeritte geçiyor, kalanı yana yanaşma. */
const LANE_FRACTION = 0.72;

function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

/** Hızlanıp yavaşlayan geçiş — araba hareketi mekanik görünmesin. */
function smooth(t: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  return clamped * clamped * (3 - 2 * clamped);
}

export class World {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.OrthographicCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly islands = new Map<number, PumpIsland>();

  private readonly container: HTMLElement;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly pickables: THREE.Object3D[] = [];
  private readonly carMeshes = new Map<number, THREE.Group>();

  constructor(container: HTMLElement) {
    this.container = container;

    this.scene.background = new THREE.Color(SKY_COLOR);

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 120);
    this.camera.position.set(0, 21, 12);
    this.camera.lookAt(0, 0, -0.5);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    // r185'te PCFSoftShadowMap kullanımdan kaldırıldı; PCF zaten yumuşatıyor.
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(this.renderer.domElement);

    this.addLights();
    this.addGround();
    this.scene.add(createStationBuilding());
    this.addIslands();

    this.resize();
  }

  private addLights(): void {
    this.scene.add(new THREE.HemisphereLight(0xdce9f5, 0x5a5f66, 1.6));

    const sun = new THREE.DirectionalLight(0xfff3dd, 2.1);
    sun.position.set(6, 14, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);

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
      new THREE.PlaneGeometry(80, 80),
      new THREE.MeshStandardMaterial({ color: ASPHALT_COLOR, roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // İstasyon betonu ekranın altına ve üstüne taşıyor: dikey ekranda boş
    // asfalt görünmüyor, yol devam ediyor hissi kalıyor.
    const lot = new THREE.Mesh(
      new THREE.BoxGeometry(7.4, 0.06, 34),
      new THREE.MeshStandardMaterial({ color: LOT_COLOR, roughness: 1 }),
    );
    lot.position.set(0, 0.03, -1);
    lot.receiveShadow = true;
    this.scene.add(lot);

    const lineMaterial = new THREE.MeshStandardMaterial({ color: LINE_COLOR, roughness: 0.9 });

    // Sürüş şeridinin kenar çizgileri.
    for (const lineX of [-0.82, 0.82]) {
      const line = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.02, 26), lineMaterial);
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

    for (const car of cars) {
      alive.add(car.id);

      let mesh = this.carMeshes.get(car.id);
      if (mesh === undefined) {
        mesh = createCar(car.color);
        mesh.userData.slotIndex = car.slotIndex;
        this.carMeshes.set(car.id, mesh);
        this.scene.add(mesh);
        this.pickables.push(mesh);
      }

      const slot = findSlot(car.slotIndex);
      if (slot === undefined) continue;

      const position = carPosition(car, slot);
      mesh.position.set(position.x, 0, position.z);
    }

    for (const [id, mesh] of [...this.carMeshes]) {
      if (alive.has(id)) continue;

      this.scene.remove(mesh);
      this.carMeshes.delete(id);

      const index = this.pickables.indexOf(mesh);
      if (index >= 0) this.pickables.splice(index, 1);
    }
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

/**
 * Arabanın yol üzerindeki konumu.
 * Giriş: şeritte yukarı çık, sonra yana kayıp pompaya yanaş.
 * Çıkış: önce şeride dön, sonra yukarıdan çık.
 * Araba hep -z yönüne baktığı için dönüş animasyonu gerekmiyor.
 */
function carPosition(car: Car, slot: SlotDefinition): { x: number; z: number } {
  if (car.phase === 'arriving') {
    if (car.progress < LANE_FRACTION) {
      const t = smooth(car.progress / LANE_FRACTION);
      return { x: LANE_X, z: lerp(ENTRY_Z, slot.z, t) };
    }

    const t = smooth((car.progress - LANE_FRACTION) / (1 - LANE_FRACTION));
    return { x: lerp(LANE_X, slot.carX, t), z: slot.z };
  }

  if (car.phase === 'leaving') {
    const sidewaysFraction = 1 - LANE_FRACTION;

    if (car.progress < sidewaysFraction) {
      const t = smooth(car.progress / sidewaysFraction);
      return { x: lerp(slot.carX, LANE_X, t), z: slot.z };
    }

    const t = smooth((car.progress - sidewaysFraction) / LANE_FRACTION);
    return { x: LANE_X, z: lerp(slot.z, EXIT_Z, t) };
  }

  return { x: slot.carX, z: slot.z };
}
