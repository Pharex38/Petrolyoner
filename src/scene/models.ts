import * as THREE from 'three';
import { FUELS, findFuel, type FuelType } from '../game/fuel';

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

/** Marka ya da logo taşımayan, şehir trafiğinde okunabilir araç siluetleri. */
export type VehicleStyle =
  | 'compact'
  | 'executive'
  | 'sport'
  | 'classic'
  | 'convertible'
  | 'police'
  | 'ambulance';

interface VehicleDimensions {
  readonly width: number;
  readonly bodyHeight: number;
  readonly length: number;
  readonly cabinWidth: number;
  readonly cabinHeight: number;
  readonly cabinLength: number;
}

const VEHICLE_DIMENSIONS: Record<VehicleStyle, VehicleDimensions> = {
  compact: { width: 1.35, bodyHeight: 0.5, length: 2.9, cabinWidth: 1.18, cabinHeight: 0.44, cabinLength: 1.4 },
  executive: { width: 1.45, bodyHeight: 0.52, length: 3.3, cabinWidth: 1.25, cabinHeight: 0.48, cabinLength: 1.62 },
  sport: { width: 1.5, bodyHeight: 0.36, length: 2.85, cabinWidth: 1.18, cabinHeight: 0.28, cabinLength: 1.08 },
  classic: { width: 1.4, bodyHeight: 0.58, length: 3.15, cabinWidth: 1.16, cabinHeight: 0.52, cabinLength: 1.32 },
  convertible: { width: 1.48, bodyHeight: 0.42, length: 3.05, cabinWidth: 1.22, cabinHeight: 0.22, cabinLength: 1.5 },
  police: { width: 1.45, bodyHeight: 0.52, length: 3.25, cabinWidth: 1.24, cabinHeight: 0.48, cabinLength: 1.58 },
  ambulance: { width: 1.62, bodyHeight: 0.68, length: 3.55, cabinWidth: 1.46, cabinHeight: 0.76, cabinLength: 1.9 },
};

export class PumpIsland {
  readonly group = new THREE.Group();

  private readonly concreteMaterial: THREE.MeshStandardMaterial;
  private readonly bodyMaterial: THREE.MeshStandardMaterial;
  private readonly dispenser = new THREE.Group();
  private readonly barrier = new THREE.Group();
  private readonly refueling = new THREE.Group();
  private readonly nozzle = new THREE.Group();
  private readonly fuelDrops = new THREE.Group();
  private readonly fillBarMaterial = new THREE.MeshStandardMaterial({
    color: 0x000000,
    emissive: 0x000000,
    roughness: 0.4,
  });
  private readonly fillBar = new THREE.Mesh(
    new THREE.BoxGeometry(0.05, 0.06, 0.46),
    this.fillBarMaterial,
  );

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

    // Dolum sırasında ekranda ilerleyen renkli sayaç, hortum ve nozulu göster.
    // Pompanın araç tarafı sol adada sağ, sağ adada soldur.
    const pumpSide = x < 0 ? 1 : -1;
    this.fillBar.position.set(pumpSide * 0.335, 0.93, -0.215);
    this.fillBar.scale.z = 0.001;
    this.fillBar.visible = false;
    this.dispenser.add(this.fillBar);

    const hose = new THREE.Mesh(
      new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3([
          new THREE.Vector3(pumpSide * 0.3, 1.02, 0.26),
          new THREE.Vector3(pumpSide * 0.43, 0.82, 0.28),
          new THREE.Vector3(pumpSide * 0.61, 0.63, 0.29),
          new THREE.Vector3(pumpSide * 0.8, 0.62, 0.3),
        ]),
        18,
        0.035,
        6,
        false,
      ),
      new THREE.MeshStandardMaterial({ color: 0x20242a, roughness: 0.9 }),
    );
    hose.castShadow = true;
    this.refueling.add(hose);

    this.nozzle.position.set(pumpSide * 0.8, 0.62, 0.3);
    const handle = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.12, 0.1),
      new THREE.MeshStandardMaterial({ color: 0x30353b, roughness: 0.65 }),
    );
    const tip = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.045, 0.18, 8),
      new THREE.MeshStandardMaterial({ color: 0x90989f, roughness: 0.45, metalness: 0.35 }),
    );
    tip.rotation.z = Math.PI / 2;
    tip.position.x = pumpSide * 0.16;
    this.nozzle.add(handle, tip);
    this.refueling.add(this.nozzle);

    this.fuelDrops.position.set(pumpSide * 0.89, 0.5, 0.3);
    for (let index = 0; index < 3; index += 1) {
      const drop = new THREE.Mesh(
        new THREE.SphereGeometry(0.045, 8, 6),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.8, depthWrite: false }),
      );
      drop.position.z = (index - 1) * 0.045;
      this.fuelDrops.add(drop);
    }
    this.refueling.add(this.fuelDrops);
    this.refueling.visible = false;
    this.dispenser.add(this.refueling);

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

  /** Hortum, nozul ve sayaç yalnızca ilgili araç gerçekten doldurulurken görünür. */
  setFueling(fuel: FuelType | null, progress = 0): void {
    const active = fuel !== null;
    this.refueling.visible = active;
    this.fillBar.visible = active;
    if (!active || fuel === null) return;

    const clampedProgress = Math.max(0, Math.min(1, progress));
    const fuelInfo = findFuel(fuel);
    this.fillBarMaterial.color.setHex(fuelInfo.color);
    this.fillBarMaterial.emissive.setHex(fuelInfo.color);
    this.fillBarMaterial.emissiveIntensity = 1.2;
    this.fillBar.scale.z = Math.max(0.001, clampedProgress);
    this.fillBar.position.z = -0.215 + 0.215 * clampedProgress;

    const pulse = clampedProgress * 28;
    this.nozzle.rotation.z = Math.sin(pulse) * 0.05;
    this.fuelDrops.children.forEach((child, index) => {
      if (!(child instanceof THREE.Mesh) || !(child.material instanceof THREE.MeshBasicMaterial)) return;
      const dropProgress = (pulse * 0.22 + index * 0.34) % 1;
      child.position.y = -dropProgress * 0.18;
      child.scale.setScalar(0.72 + (1 - dropProgress) * 0.4);
      child.material.color.setHex(fuelInfo.color);
      child.material.opacity = 0.82 * (1 - dropProgress);
    });
  }
}

/**
 * Basit, markasız araç: gövde, kabin, dört tekerlek ve etkinliklerde kullanılan
 * far/dörtlü materyalleri. Araçlar varsayılan olarak -z yönüne bakar.
 */
export function createCar(color: number, style: VehicleStyle = 'compact'): THREE.Group {
  const group = new THREE.Group();
  const dimensions = VEHICLE_DIMENSIONS[style];
  group.userData.vehicleStyle = style;

  const bodyMaterial = new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.25 });

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(dimensions.width, dimensions.bodyHeight, dimensions.length),
    bodyMaterial,
  );
  body.position.y = 0.3 + dimensions.bodyHeight / 2;
  body.castShadow = true;
  group.add(body);

  const glassMaterial = new THREE.MeshStandardMaterial({
    color: GLASS_COLOR,
    roughness: 0.2,
    metalness: 0.5,
  });

  if (style !== 'convertible') {
    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(dimensions.cabinWidth, dimensions.cabinHeight, dimensions.cabinLength),
      bodyMaterial,
    );
    cabin.position.set(0, 0.3 + dimensions.bodyHeight + dimensions.cabinHeight / 2, 0.08);
    cabin.castShadow = true;
    group.add(cabin);

    const windshieldOffset = dimensions.cabinLength * 0.38;
    for (const glassZ of [-windshieldOffset, windshieldOffset]) {
      const glass = new THREE.Mesh(
        new THREE.BoxGeometry(dimensions.cabinWidth - 0.08, dimensions.cabinHeight - 0.1, 0.06),
        glassMaterial,
      );
      glass.position.set(0, cabin.position.y + 0.02, glassZ + 0.08);
      group.add(glass);
    }
  } else {
    addConvertibleInterior(group, dimensions, glassMaterial);
  }

  addVehicleLights(group, dimensions);
  if (style === 'police' || style === 'ambulance') addEmergencyLightbar(group, dimensions, style);

  const wheelRadius = style === 'sport' ? 0.27 : 0.28;
  const wheelGeometry = new THREE.CylinderGeometry(wheelRadius, wheelRadius, 0.2, 14);
  const wheelMaterial = new THREE.MeshStandardMaterial({ color: 0x1c1e21, roughness: 0.85 });

  for (const wheelX of [-dimensions.width * 0.52, dimensions.width * 0.52]) {
    for (const wheelZ of [-dimensions.length * 0.32, dimensions.length * 0.32]) {
      const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(wheelX, wheelRadius, wheelZ);
      wheel.castShadow = true;
      group.add(wheel);
    }
  }

  return group;
}

/** Üstü açık araçtaki sade, yetişkin yolcu siluetleri ve ön cam. */
function addConvertibleInterior(
  group: THREE.Group,
  dimensions: VehicleDimensions,
  glassMaterial: THREE.MeshStandardMaterial,
): void {
  const seatMaterial = new THREE.MeshStandardMaterial({ color: 0x25272b, roughness: 0.8 });
  const passengerSkin = new THREE.MeshStandardMaterial({ color: 0xe2ad8c, roughness: 0.8 });
  const shirtColors = [0x6cc4d0, 0xf0b14f];

  // İki yolcu aynı sırada oturur; önde-arkada dizilmiş görünmezler.
  for (const [index, x] of [-0.3, 0.3].entries()) {
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.52), seatMaterial);
    seat.position.set(x, 0.68, 0.06);
    group.add(seat);

    const torso = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.36, 0.24),
      new THREE.MeshStandardMaterial({ color: shirtColors[index] ?? 0x6cc4d0, roughness: 0.75 }),
    );
    torso.position.set(x, 0.95, 0.06);
    group.add(torso);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), passengerSkin);
    head.position.set(x, 1.24, 0.02);
    group.add(head);
  }

  const windshield = new THREE.Mesh(
    new THREE.BoxGeometry(dimensions.cabinWidth, 0.34, 0.06),
    glassMaterial,
  );
  windshield.position.set(0, 1.0, -dimensions.cabinLength * 0.45);
  windshield.rotation.x = -0.28;
  group.add(windshield);
}

/** Far ve arka sinyalleri, trafik olaylarının emissive efektleri için saklanır. */
function addVehicleLights(group: THREE.Group, dimensions: VehicleDimensions): void {
  const headlightMaterials: THREE.MeshStandardMaterial[] = [];
  const hazardMaterials: THREE.MeshStandardMaterial[] = [];

  for (const x of [-dimensions.width * 0.28, dimensions.width * 0.28]) {
    const headlightMaterial = new THREE.MeshStandardMaterial({
      color: 0xfff1bd,
      emissive: 0x000000,
      roughness: 0.45,
    });
    const headlight = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.05), headlightMaterial);
    headlight.position.set(x, 0.58, -dimensions.length / 2 - 0.02);
    group.add(headlight);
    headlightMaterials.push(headlightMaterial);

    const hazardMaterial = new THREE.MeshStandardMaterial({
      color: 0xdf5d34,
      emissive: 0x000000,
      roughness: 0.5,
    });
    const hazard = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.11, 0.05), hazardMaterial);
    hazard.position.set(x, 0.56, dimensions.length / 2 + 0.02);
    group.add(hazard);
    hazardMaterials.push(hazardMaterial);
  }

  group.userData.headlightMaterials = headlightMaterials;
  group.userData.hazardMaterials = hazardMaterials;
}

export function setCarHeadlights(car: THREE.Group, active: boolean): void {
  const materials = car.userData.headlightMaterials;
  if (!Array.isArray(materials)) return;

  for (const material of materials) {
    if (!(material instanceof THREE.MeshStandardMaterial)) continue;
    material.emissive.setHex(active ? 0xffe58a : 0x000000);
    material.emissiveIntensity = active ? 2.5 : 0;
  }
}

export function setCarHazards(car: THREE.Group, active: boolean): void {
  const materials = car.userData.hazardMaterials;
  if (!Array.isArray(materials)) return;

  for (const material of materials) {
    if (!(material instanceof THREE.MeshStandardMaterial)) continue;
    material.emissive.setHex(active ? 0xff9a32 : 0x000000);
    material.emissiveIntensity = active ? 2.8 : 0;
  }
}

/** Polis/ambulans için dönüşümlü mavi-kırmızı tepe lambaları. */
function addEmergencyLightbar(
  group: THREE.Group,
  dimensions: VehicleDimensions,
  style: 'police' | 'ambulance',
): void {
  const lightMaterials: THREE.MeshStandardMaterial[] = [];
  const lightY = 0.3 + dimensions.bodyHeight + dimensions.cabinHeight + 0.08;

  for (const [index, color] of [0x3c80ff, 0xff4d45].entries()) {
    const material = new THREE.MeshStandardMaterial({ color, emissive: 0x000000, roughness: 0.35 });
    const light = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.12, 0.16), material);
    light.position.set(index === 0 ? -0.23 : 0.23, lightY, 0.04);
    group.add(light);
    lightMaterials.push(material);
  }

  // Ambulansın sade kırmızı yan bandı; yazı/logo kullanmadan sınıfını ayırt eder.
  if (style === 'ambulance') {
    const stripeMaterial = new THREE.MeshStandardMaterial({ color: 0xd84a44, roughness: 0.6 });
    for (const x of [-dimensions.width / 2 - 0.01, dimensions.width / 2 + 0.01]) {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.14, dimensions.length * 0.65), stripeMaterial);
      stripe.position.set(x, 0.73, 0.12);
      group.add(stripe);
    }
  }

  group.userData.emergencyLightMaterials = lightMaterials;
}

export function setCarEmergencyLights(car: THREE.Group, active: boolean, alternate = false): void {
  const materials = car.userData.emergencyLightMaterials;
  if (!Array.isArray(materials)) return;

  for (const [index, material] of materials.entries()) {
    if (!(material instanceof THREE.MeshStandardMaterial)) continue;
    const lit = active && (alternate ? index % 2 === 0 : index % 2 === 1);
    material.emissive.setHex(index % 2 === 0 ? 0x3c80ff : 0xff4d45);
    material.emissiveIntensity = lit ? 3.5 : 0;
  }
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
