import * as THREE from 'three';
import { FUELS } from '../game/fuel';

/**
 * Tüm modeller primitif geometriden kuruluyor — dış dosya yok, repo hafif kalıyor.
 * Sanat aşamasında burası glTF yükleyen bir sürümle değiştirilecek.
 */

const CONCRETE_COLOR = 0x9a978f;
const CONCRETE_LOCKED_COLOR = 0x6b6862;
const PUMP_BODY_COLOR = 0xe8e5df;
const PUMP_LOCKED_COLOR = 0x63605b;
const PUMP_SCREEN_COLOR = 0x24272c;
const BARRIER_COLOR = 0xc94f3d;
const GLASS_COLOR = 0x2a3138;

export class PumpIsland {
  readonly group = new THREE.Group();

  private readonly concreteMaterial: THREE.MeshStandardMaterial;
  private readonly bodyMaterial: THREE.MeshStandardMaterial;
  private readonly dispenser = new THREE.Group();
  private readonly barrier = new THREE.Group();

  private unlocked = false;

  constructor(slotIndex: number, x: number, z: number) {
    this.group.position.set(x, 0, z);
    this.group.userData.slotIndex = slotIndex;

    this.concreteMaterial = new THREE.MeshStandardMaterial({
      color: CONCRETE_LOCKED_COLOR,
      roughness: 0.95,
    });

    this.bodyMaterial = new THREE.MeshStandardMaterial({
      color: PUMP_LOCKED_COLOR,
      roughness: 0.55,
      metalness: 0.1,
    });

    // Beton ada
    const island = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.18, 2.7), this.concreteMaterial);
    island.position.y = 0.09;
    island.receiveShadow = true;
    island.castShadow = true;
    this.group.add(island);

    // Pompa gövdesi
    this.group.add(this.dispenser);

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.1, 0.8), this.bodyMaterial);
    body.position.y = 0.73;
    body.castShadow = true;
    this.dispenser.add(body);

    // Ekran paneli — hangi yöne baktığı belli olsun diye arabaya dönük yüzde.
    const screen = new THREE.Mesh(
      new THREE.BoxGeometry(0.04, 0.42, 0.56),
      new THREE.MeshStandardMaterial({ color: PUMP_SCREEN_COLOR, roughness: 0.4 }),
    );
    screen.position.set(x < 0 ? 0.31 : -0.31, 0.95, 0);
    this.dispenser.add(screen);

    // Üç yakıt türünün renk şeritleri — pompa olduğu ilk bakışta anlaşılsın.
    FUELS.forEach((fuel, index) => {
      const stripe = new THREE.Mesh(
        new THREE.BoxGeometry(0.62, 0.09, 0.2),
        new THREE.MeshStandardMaterial({ color: fuel.color, roughness: 0.6 }),
      );
      stripe.position.set(0, 0.34, (index - 1) * 0.24);
      this.dispenser.add(stripe);
    });

    // Kilitliyken önüne konan bariyer
    this.group.add(this.barrier);

    const barrierMaterial = new THREE.MeshStandardMaterial({
      color: BARRIER_COLOR,
      roughness: 0.7,
    });

    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 2.4), barrierMaterial);
    rail.position.set(x < 0 ? 0.78 : -0.78, 0.62, 0);
    rail.castShadow = true;
    this.barrier.add(rail);

    for (const postZ of [-0.95, 0.95]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.62, 0.13), barrierMaterial);
      post.position.set(x < 0 ? 0.78 : -0.78, 0.31, postZ);
      post.castShadow = true;
      this.barrier.add(post);
    }

    this.setUnlocked(false);
  }

  setUnlocked(unlocked: boolean): void {
    if (this.unlocked === unlocked) return;

    this.unlocked = unlocked;
    this.concreteMaterial.color.setHex(unlocked ? CONCRETE_COLOR : CONCRETE_LOCKED_COLOR);
    this.bodyMaterial.color.setHex(unlocked ? PUMP_BODY_COLOR : PUMP_LOCKED_COLOR);
    this.barrier.visible = !unlocked;
  }
}

/** Basit araba: gövde, kabin, dört tekerlek. Hep -z yönüne bakar. */
export function createCar(color: number): THREE.Group {
  const group = new THREE.Group();

  const bodyMaterial = new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.25 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.5, 2.9), bodyMaterial);
  body.position.y = 0.55;
  body.castShadow = true;
  group.add(body);

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.44, 1.4), bodyMaterial);
  cabin.position.set(0, 0.99, 0.1);
  cabin.castShadow = true;
  group.add(cabin);

  const glassMaterial = new THREE.MeshStandardMaterial({
    color: GLASS_COLOR,
    roughness: 0.2,
    metalness: 0.5,
  });

  for (const glassZ of [-0.62, 0.82]) {
    const glass = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.34, 0.06), glassMaterial);
    glass.position.set(0, 1.0, glassZ);
    group.add(glass);
  }

  const wheelGeometry = new THREE.CylinderGeometry(0.28, 0.28, 0.2, 14);
  const wheelMaterial = new THREE.MeshStandardMaterial({ color: 0x1c1e21, roughness: 0.85 });

  for (const wheelX of [-0.7, 0.7]) {
    for (const wheelZ of [-0.95, 0.95]) {
      const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(wheelX, 0.28, wheelZ);
      wheel.castShadow = true;
      group.add(wheel);
    }
  }

  return group;
}

/** İstasyon binası — sahanın üst ucunda, market/ofis. */
export function createStationBuilding(): THREE.Group {
  const group = new THREE.Group();
  group.position.set(0, 0, -6.6);

  const wall = new THREE.Mesh(
    new THREE.BoxGeometry(5.8, 1.7, 2.2),
    new THREE.MeshStandardMaterial({ color: 0xe4e0d6, roughness: 0.85 }),
  );
  wall.position.y = 0.85;
  wall.castShadow = true;
  wall.receiveShadow = true;
  group.add(wall);

  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(6.2, 0.25, 2.6),
    new THREE.MeshStandardMaterial({ color: 0x35695a, roughness: 0.8 }),
  );
  roof.position.y = 1.82;
  roof.castShadow = true;
  group.add(roof);

  // Vitrin camları
  for (const glassX of [-1.7, 0, 1.7]) {
    const glass = new THREE.Mesh(
      new THREE.BoxGeometry(1.5, 0.9, 0.08),
      new THREE.MeshStandardMaterial({ color: GLASS_COLOR, roughness: 0.2, metalness: 0.5 }),
    );
    glass.position.set(glassX, 0.85, 1.14);
    group.add(glass);
  }

  return group;
}
