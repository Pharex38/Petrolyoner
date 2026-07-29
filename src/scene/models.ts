import * as THREE from 'three';
import { FUELS, findFuel, type FuelType } from '../game/fuel';
import { MARKET_ROTATION_Y, MARKET_X, MARKET_Z } from '../game/slots';

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
const CHROME_COLOR = 0xaeb6bb;
const RUBBER_COLOR = 0x1c1e21;

/** Marka ya da logo taşımayan, şehir trafiğinde okunabilir araç siluetleri. */
export type VehicleStyle =
  | 'compact'
  | 'executive'
  | 'sport'
  | 'classic'
  | 'convertible'
  | 'tow'
  | 'tanker'
  | 'police'
  | 'ambulance';

export type TurnSignalDirection = 'left' | 'right' | null;

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
  tow: { width: 1.58, bodyHeight: 0.56, length: 3.75, cabinWidth: 1.32, cabinHeight: 0.58, cabinLength: 1.12 },
  tanker: { width: 1.62, bodyHeight: 0.54, length: 4.15, cabinWidth: 1.36, cabinHeight: 0.62, cabinLength: 1.12 },
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
      new THREE.MeshStandardMaterial({
        color: PUMP_SCREEN_COLOR,
        emissive: 0x102820,
        emissiveIntensity: 0.5,
        roughness: 0.28,
      }),
    );
    screen.position.set(x < 0 ? 0.31 : -0.31, 0.95, 0);
    this.dispenser.add(screen);

    // Pompa ekranındaki fiyat/sayaç satırları; yazı dokusu olmadan da çalışan
    // bir ekran olduğu okunur.
    for (const [index, width] of [0.34, 0.24, 0.29].entries()) {
      const displayLine = new THREE.Mesh(
        new THREE.BoxGeometry(0.012, 0.035, width),
        new THREE.MeshBasicMaterial({ color: index === 0 ? 0xaee9c8 : 0x7da895 }),
      );
      displayLine.position.set(x < 0 ? 0.337 : -0.337, 1.06 - index * 0.1, -0.04);
      this.dispenser.add(displayLine);
    }

    const crown = new THREE.Mesh(
      new THREE.BoxGeometry(0.72, 0.16, 0.9),
      new THREE.MeshStandardMaterial({ color: 0x35695a, roughness: 0.5, metalness: 0.12 }),
    );
    crown.position.y = 1.36;
    crown.castShadow = true;
    this.dispenser.add(crown);

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

    // Ada uçlarındaki metal korumalar pompayı araç yolundan ayırır.
    const bollardMaterial = new THREE.MeshStandardMaterial({
      color: 0xe2a438,
      roughness: 0.62,
      metalness: 0.2,
    });
    for (const z of [-1.08, 1.08]) {
      const bollard = new THREE.Mesh(
        new THREE.CylinderGeometry(0.09, 0.11, 0.48, 10),
        bollardMaterial,
      );
      bollard.position.set(x < 0 ? 0.42 : -0.42, 0.32, z);
      bollard.castShadow = true;
      this.group.add(bollard);
    }

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

  if (style !== 'convertible' && style !== 'tow' && style !== 'tanker') {
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

    // Yan camlar, otomobilin tek renkli iki kutu gibi görünmesini engeller.
    for (const glassX of [-dimensions.cabinWidth / 2 - 0.012, dimensions.cabinWidth / 2 + 0.012]) {
      const sideWindows = new THREE.Mesh(
        new THREE.BoxGeometry(0.035, dimensions.cabinHeight - 0.12, dimensions.cabinLength * 0.68),
        glassMaterial,
      );
      sideWindows.position.set(glassX, cabin.position.y + 0.02, 0.08);
      group.add(sideWindows);
    }
  } else if (style === 'convertible') {
    addConvertibleInterior(group, dimensions, glassMaterial);
  } else if (style === 'tow') {
    addTowTruckBody(group, dimensions, bodyMaterial, glassMaterial);
  } else {
    addFuelTankerBody(group, dimensions, bodyMaterial, glassMaterial);
  }

  addVehicleTrim(group, dimensions, style, color);
  addVehicleLights(group, dimensions);
  if (style === 'police' || style === 'ambulance') addEmergencyLightbar(group, dimensions, style);

  const wheelRadius = style === 'sport' ? 0.27 : 0.28;
  const wheelGeometry = new THREE.CylinderGeometry(wheelRadius, wheelRadius, 0.2, 14);
  const wheelMaterial = new THREE.MeshStandardMaterial({ color: RUBBER_COLOR, roughness: 0.85 });
  const hubGeometry = new THREE.CylinderGeometry(wheelRadius * 0.46, wheelRadius * 0.46, 0.215, 10);
  const hubMaterial = new THREE.MeshStandardMaterial({
    color: CHROME_COLOR,
    roughness: 0.34,
    metalness: 0.72,
  });

  for (const wheelX of [-dimensions.width * 0.52, dimensions.width * 0.52]) {
    for (const wheelZ of [-dimensions.length * 0.32, dimensions.length * 0.32]) {
      const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(wheelX, wheelRadius, wheelZ);
      group.add(wheel);

      const hub = new THREE.Mesh(hubGeometry, hubMaterial);
      hub.rotation.z = Math.PI / 2;
      hub.position.set(wheelX, wheelRadius, wheelZ);
      group.add(hub);
    }
  }

  return group;
}

/** Tampon, ızgara, ayna ve modele özgü küçük ayrıntılar. */
function addVehicleTrim(
  group: THREE.Group,
  dimensions: VehicleDimensions,
  style: VehicleStyle,
  color: number,
): void {
  const darkMaterial = new THREE.MeshStandardMaterial({
    color: 0x20252a,
    roughness: 0.72,
    metalness: 0.18,
  });
  const chromeMaterial = new THREE.MeshStandardMaterial({
    color: style === 'classic' ? 0xc7ced1 : 0x798087,
    roughness: 0.34,
    metalness: 0.72,
  });
  const plateMaterial = new THREE.MeshStandardMaterial({ color: 0xe7e3d6, roughness: 0.64 });

  for (const zDirection of [-1, 1]) {
    const bumper = new THREE.Mesh(
      new THREE.BoxGeometry(dimensions.width * 0.82, 0.1, 0.11),
      style === 'classic' ? chromeMaterial : darkMaterial,
    );
    bumper.position.set(0, 0.34, zDirection * (dimensions.length / 2 + 0.035));
    group.add(bumper);

    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.13, 0.025), plateMaterial);
    plate.position.set(0, 0.48, zDirection * (dimensions.length / 2 + 0.095));
    group.add(plate);
  }

  const grille = new THREE.Mesh(
    new THREE.BoxGeometry(dimensions.width * 0.38, 0.16, 0.035),
    darkMaterial,
  );
  grille.position.set(0, 0.48, -dimensions.length / 2 - 0.085);
  group.add(grille);

  // Kaput ve bagaj yüzeyi ışığı ayrı yakalar; kutu siluete katman ekler.
  const panelMaterial = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.36,
    metalness: 0.32,
  });
  for (const z of [-dimensions.length * 0.34, dimensions.length * 0.36]) {
    const panel = new THREE.Mesh(
      new THREE.BoxGeometry(dimensions.width * 0.82, 0.035, dimensions.length * 0.24),
      panelMaterial,
    );
    panel.position.set(0, 0.32 + dimensions.bodyHeight, z);
    group.add(panel);
  }

  const mirrorY = 0.35 + dimensions.bodyHeight + dimensions.cabinHeight * 0.58;
  for (const x of [-dimensions.cabinWidth / 2 - 0.11, dimensions.cabinWidth / 2 + 0.11]) {
    const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.1, 0.24), darkMaterial);
    mirror.position.set(x, mirrorY, -dimensions.cabinLength * 0.28);
    group.add(mirror);
  }

  if (style === 'sport') {
    const wing = new THREE.Mesh(
      new THREE.BoxGeometry(dimensions.width * 0.82, 0.07, 0.22),
      darkMaterial,
    );
    wing.position.set(0, 0.3 + dimensions.bodyHeight + 0.19, dimensions.length * 0.43);
    group.add(wing);
    for (const x of [-dimensions.width * 0.25, dimensions.width * 0.25]) {
      const support = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.18, 0.06), darkMaterial);
      support.position.set(x, wing.position.y - 0.09, wing.position.z);
      group.add(support);
    }
  }

  if (style === 'compact') {
    const antenna = new THREE.Mesh(
      new THREE.CylinderGeometry(0.018, 0.025, 0.28, 6),
      darkMaterial,
    );
    antenna.position.set(0, 0.48 + dimensions.bodyHeight + dimensions.cabinHeight, 0.4);
    antenna.rotation.x = 0.18;
    group.add(antenna);
  }
}

/** Çekici kabini, eğimli platformu, vinç kolu ve sarı tepe lambası. */
function addTowTruckBody(
  group: THREE.Group,
  dimensions: VehicleDimensions,
  bodyMaterial: THREE.MeshStandardMaterial,
  glassMaterial: THREE.MeshStandardMaterial,
): void {
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(dimensions.cabinWidth, dimensions.cabinHeight, dimensions.cabinLength),
    bodyMaterial,
  );
  cabin.position.set(0, 0.3 + dimensions.bodyHeight + dimensions.cabinHeight / 2, -1.0);
  cabin.castShadow = true;
  group.add(cabin);

  const windshield = new THREE.Mesh(
    new THREE.BoxGeometry(dimensions.cabinWidth - 0.1, dimensions.cabinHeight - 0.14, 0.06),
    glassMaterial,
  );
  windshield.position.set(0, cabin.position.y + 0.02, -1.59);
  group.add(windshield);

  const platformMaterial = new THREE.MeshStandardMaterial({
    color: 0x30363a,
    roughness: 0.72,
    metalness: 0.48,
  });
  const platform = new THREE.Mesh(
    new THREE.BoxGeometry(dimensions.width * 0.94, 0.12, 1.95),
    platformMaterial,
  );
  platform.position.set(0, 0.82, 0.73);
  platform.rotation.x = -0.055;
  platform.castShadow = true;
  group.add(platform);
  const platformParts: THREE.Mesh[] = [platform];

  for (const x of [-dimensions.width * 0.36, dimensions.width * 0.36]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.17, 1.9), platformMaterial);
    rail.position.set(x, 0.91, 0.73);
    rail.rotation.x = platform.rotation.x;
    group.add(rail);
    platformParts.push(rail);
  }

  const towArm = new THREE.Mesh(
    new THREE.BoxGeometry(0.16, 0.16, 1.25),
    new THREE.MeshStandardMaterial({ color: 0xd7982e, roughness: 0.6, metalness: 0.25 }),
  );
  towArm.position.set(0, 1.02, 0.54);
  towArm.rotation.x = -0.34;
  group.add(towArm);

  const beaconMaterial = new THREE.MeshStandardMaterial({
    color: 0xf2a33b,
    emissive: 0xf2a33b,
    emissiveIntensity: 1.3,
    roughness: 0.35,
  });
  const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.12, 10), beaconMaterial);
  beacon.position.set(0, 1.56, -0.93);
  group.add(beacon);
  group.userData.towPlatformParts = platformParts;
}

/** Çekici platformunu indirip kaldırır; 0=seyir, 1=rampa zeminde. */
export function setTowPlatformUnload(towTruck: THREE.Group, progress: number): void {
  const parts = towTruck.userData.towPlatformParts;
  if (!Array.isArray(parts)) return;
  const clamped = Math.max(0, Math.min(1, progress));
  const rotation = -0.055 + clamped * 0.275;
  for (const part of parts) {
    if (part instanceof THREE.Mesh) part.rotation.x = rotation;
  }
}

/** Yakıt türünün renk bandını taşıyan, hortumlu düşük poligon tanker. */
export function createFuelTanker(fuel: FuelType): THREE.Group {
  const tanker = createCar(findFuel(fuel).color, 'tanker');
  tanker.userData.fuelType = fuel;
  return tanker;
}

/** Tanker boşaltırken yan hortumu yere indirir; 0=kapalı, 1=bağlı. */
export function setFuelTankerUnloading(
  tanker: THREE.Group,
  progress: number,
): void {
  const hose = tanker.userData.tankerHose;
  if (!(hose instanceof THREE.Group)) return;
  const clamped = Math.max(0, Math.min(1, progress));
  hose.visible = clamped > 0.01;
  const segment = hose.userData.segment;
  if (segment instanceof THREE.Mesh) {
    segment.scale.y = Math.max(0.02, clamped);
    segment.position.y = 0.76 - clamped * 0.61;
    segment.rotation.z = 0.24 + clamped * 0.42;
  }
}

function addFuelTankerBody(
  group: THREE.Group,
  dimensions: VehicleDimensions,
  accentMaterial: THREE.MeshStandardMaterial,
  glassMaterial: THREE.MeshStandardMaterial,
): void {
  const cabinMaterial = new THREE.MeshStandardMaterial({
    color: 0xe5e2da,
    roughness: 0.55,
    metalness: 0.16,
  });
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(
      dimensions.cabinWidth,
      dimensions.cabinHeight,
      dimensions.cabinLength,
    ),
    cabinMaterial,
  );
  cabin.position.set(
    0,
    0.3 + dimensions.bodyHeight + dimensions.cabinHeight / 2,
    -1.35,
  );
  cabin.castShadow = true;
  group.add(cabin);

  const windshield = new THREE.Mesh(
    new THREE.BoxGeometry(
      dimensions.cabinWidth - 0.1,
      dimensions.cabinHeight - 0.14,
      0.06,
    ),
    glassMaterial,
  );
  windshield.position.set(0, cabin.position.y + 0.02, -1.93);
  group.add(windshield);

  const tankMaterial = new THREE.MeshStandardMaterial({
    color: 0xb8bdbe,
    roughness: 0.32,
    metalness: 0.72,
  });
  const tank = new THREE.Mesh(
    new THREE.CylinderGeometry(0.58, 0.58, 2.25, 14),
    tankMaterial,
  );
  tank.rotation.x = Math.PI / 2;
  tank.position.set(0, 1.02, 0.58);
  tank.castShadow = true;
  group.add(tank);

  for (const z of [-0.18, 1.32]) {
    const band = new THREE.Mesh(
      new THREE.TorusGeometry(0.59, 0.055, 7, 16),
      accentMaterial,
    );
    band.position.set(0, 1.02, z);
    band.castShadow = true;
    group.add(band);
  }

  const hazard = new THREE.Mesh(
    new THREE.BoxGeometry(0.06, 0.36, 0.42),
    accentMaterial,
  );
  hazard.position.set(dimensions.width / 2 + 0.02, 1.05, 0.55);
  hazard.rotation.x = Math.PI / 4;
  group.add(hazard);

  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.13, 0.13, 0.1, 10),
    new THREE.MeshStandardMaterial({
      color: 0x343a3e,
      roughness: 0.46,
      metalness: 0.55,
    }),
  );
  cap.position.set(0, 1.64, 0.55);
  group.add(cap);

  const hose = new THREE.Group();
  hose.position.set(dimensions.width / 2 + 0.08, 0, 0.58);
  hose.visible = false;
  const hoseMaterial = new THREE.MeshStandardMaterial({
    color: 0x202326,
    roughness: 0.88,
  });
  const reel = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.055, 7, 14), hoseMaterial);
  reel.rotation.y = Math.PI / 2;
  reel.position.y = 0.96;
  hose.add(reel);
  const segment = new THREE.Mesh(
    new THREE.CylinderGeometry(0.045, 0.045, 1.35, 7),
    hoseMaterial,
  );
  segment.position.y = 0.76;
  hose.add(segment);
  hose.userData.segment = segment;
  group.userData.tankerHose = hose;
  group.add(hose);

  const beaconMaterial = new THREE.MeshStandardMaterial({
    color: 0xf1a83b,
    emissive: 0xf1a83b,
    emissiveIntensity: 1.1,
    roughness: 0.36,
  });
  for (const x of [-0.38, 0.38]) {
    const beacon = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.09, 0.1, 8),
      beaconMaterial,
    );
    beacon.position.set(x, 1.55, -1.35);
    group.add(beacon);
  }
}

/** Üstü açık araçtaki yolcular, görünür subwoofer'lar, neon ve ön cam. */
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

  const speakerCones: THREE.Mesh[] = [];
  const speakerMaterial = new THREE.MeshStandardMaterial({
    color: 0x17141c,
    emissive: 0x2e1448,
    emissiveIntensity: 0.35,
    roughness: 0.58,
  });
  for (const x of [-0.33, 0.33]) {
    const speaker = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.18, 0.09, 16),
      speakerMaterial.clone(),
    );
    speaker.position.set(x, 0.77, 0.78);
    group.add(speaker);
    speakerCones.push(speaker);
  }

  const bassGlowMaterial = new THREE.MeshBasicMaterial({
    color: 0xa656ff,
    transparent: true,
    opacity: 0.05,
    depthWrite: false,
  });
  const bassGlow = new THREE.Mesh(new THREE.CircleGeometry(1.05, 24), bassGlowMaterial);
  bassGlow.rotation.x = -Math.PI / 2;
  bassGlow.scale.y = 1.55;
  bassGlow.position.y = 0.03;
  group.add(bassGlow);
  group.userData.bassSpeakerCones = speakerCones;
  group.userData.bassGlowMaterial = bassGlowMaterial;
}

/** Bass olayı görseli; gövdeyi titretmeden hoparlör ve neon ritmini değiştirir. */
export function setCarBassPulse(car: THREE.Group, strength: number): void {
  const pulse = Math.max(0, Math.min(1, strength));
  const speakers = car.userData.bassSpeakerCones;
  if (Array.isArray(speakers)) {
    for (const speaker of speakers) {
      if (!(speaker instanceof THREE.Mesh)) continue;
      speaker.scale.setScalar(1 + pulse * 0.16);
      if (speaker.material instanceof THREE.MeshStandardMaterial) {
        speaker.material.emissiveIntensity = 0.35 + pulse * 2.2;
      }
    }
  }

  const glow = car.userData.bassGlowMaterial;
  if (glow instanceof THREE.MeshBasicMaterial) {
    glow.opacity = 0.05 + pulse * 0.34;
  }
}

/** Far ve arka sinyalleri, trafik olaylarının emissive efektleri için saklanır. */
function addVehicleLights(group: THREE.Group, dimensions: VehicleDimensions): void {
  const headlightMaterials: THREE.MeshStandardMaterial[] = [];
  const indicatorMaterials: THREE.MeshStandardMaterial[] = [];
  const tailLightMaterials: THREE.MeshStandardMaterial[] = [];

  for (const [index, x] of [-dimensions.width * 0.28, dimensions.width * 0.28].entries()) {
    const headlightMaterial = new THREE.MeshStandardMaterial({
      color: 0xfff1bd,
      emissive: 0x000000,
      roughness: 0.45,
    });
    const headlight = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.05), headlightMaterial);
    headlight.position.set(x, 0.58, -dimensions.length / 2 - 0.02);
    group.add(headlight);
    headlightMaterials.push(headlightMaterial);

    const tailLightMaterial = new THREE.MeshStandardMaterial({
      color: 0xc74636,
      emissive: 0x000000,
      roughness: 0.5,
    });
    const tailLight = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.11, 0.05),
      tailLightMaterial,
    );
    tailLight.position.set(x, 0.56, dimensions.length / 2 + 0.02);
    group.add(tailLight);
    tailLightMaterials.push(tailLightMaterial);

    const indicatorMaterial = new THREE.MeshStandardMaterial({
      color: 0xf2a33b,
      emissive: 0x000000,
      roughness: 0.42,
    });
    const sideSign = index === 0 ? -1 : 1;
    const rearIndicator = new THREE.Mesh(
      new THREE.BoxGeometry(0.09, 0.09, 0.055),
      indicatorMaterial,
    );
    rearIndicator.position.set(
      x + sideSign * 0.13,
      0.55,
      dimensions.length / 2 + 0.025,
    );
    group.add(rearIndicator);

    // Ön köşedeki sinyal aynı tarafın arka lambasıyla birlikte yanar.
    const frontIndicator = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.08, 0.055),
      indicatorMaterial,
    );
    frontIndicator.position.set(x, 0.49, -dimensions.length / 2 - 0.052);
    group.add(frontIndicator);
    indicatorMaterials.push(indicatorMaterial);
  }

  // Sağ ve sol farın yolu ayrı havuzlarla aydınlatması için iki dar, gölgesiz spot.
  // World görünür alan dışındaki spotları kapatarak ışık maliyetini sınırlıyor.
  const headlightBeams: THREE.SpotLight[] = [];
  for (const x of [-dimensions.width * 0.25, dimensions.width * 0.25]) {
    const beam = new THREE.SpotLight(0xffe3a0, 0, 10.5, Math.PI / 8.5, 0.48, 1.35);
    beam.position.set(x, 0.6, -dimensions.length / 2);
    beam.castShadow = false;
    beam.visible = false;
    const target = new THREE.Object3D();
    target.position.set(x, 0.03, -7.5);
    beam.target = target;
    group.add(beam, target);
    headlightBeams.push(beam);
  }

  group.userData.headlightMaterials = headlightMaterials;
  group.userData.indicatorMaterials = indicatorMaterials;
  group.userData.tailLightMaterials = tailLightMaterials;
  group.userData.headlightBeams = headlightBeams;
  group.userData.lightBeamsEnabled = true;
  group.userData.runningLights = false;
  group.userData.headlightFlash = false;
  group.userData.hazardPulse = false;
  group.userData.turnSignalDirection = null;
  group.userData.turnSignalPulse = false;
}

function applyCarHeadlights(car: THREE.Group): void {
  const materials = car.userData.headlightMaterials;
  if (!Array.isArray(materials)) return;

  const running = car.userData.runningLights === true;
  const flashing = car.userData.headlightFlash === true;
  const active = running || flashing;
  for (const material of materials) {
    if (!(material instanceof THREE.MeshStandardMaterial)) continue;
    material.emissive.setHex(active ? 0xffe58a : 0x000000);
    material.emissiveIntensity = flashing ? 4.8 : running ? 1.65 : 0;
  }

  const beams = car.userData.headlightBeams;
  if (Array.isArray(beams)) {
    const beamsEnabled = car.userData.lightBeamsEnabled === true;
    for (const beam of beams) {
      if (!(beam instanceof THREE.SpotLight)) continue;
      beam.visible = active && beamsEnabled;
      beam.intensity = flashing ? 42 : running ? 12 : 0;
      beam.distance = flashing ? 13 : 9.5;
    }
  }
}

/** Selektör kanalı; gece kısa far durumu bundan bağımsız korunur. */
export function setCarHeadlights(car: THREE.Group, active: boolean): void {
  if (car.userData.headlightFlash === active) return;
  car.userData.headlightFlash = active;
  applyCarHeadlights(car);
}

export function setCarRunningLights(car: THREE.Group, active: boolean): void {
  if (car.userData.runningLights === active) return;
  car.userData.runningLights = active;
  applyCarHeadlights(car);
  applyCarIndicators(car);
}

/** Render bütçesi: görünmeyen araçların gerçek spotları shader ışık listesine girmez. */
export function setCarLightBeamsEnabled(car: THREE.Group, enabled: boolean): void {
  if (car.userData.lightBeamsEnabled === enabled) return;
  car.userData.lightBeamsEnabled = enabled;
  applyCarHeadlights(car);
}

function applyCarIndicators(car: THREE.Group): void {
  const hazards = car.userData.hazardPulse === true;
  const direction = car.userData.turnSignalDirection as TurnSignalDirection;
  const signalPulse = car.userData.turnSignalPulse === true;
  const running = car.userData.runningLights === true;

  const tailLights = car.userData.tailLightMaterials;
  if (Array.isArray(tailLights)) {
    for (const material of tailLights) {
      if (!(material instanceof THREE.MeshStandardMaterial)) continue;
      material.emissive.setHex(running ? 0xb5241f : 0x000000);
      material.emissiveIntensity = running ? 1.25 : 0;
    }
  }

  const indicators = car.userData.indicatorMaterials;
  if (!Array.isArray(indicators)) return;
  for (const [index, material] of indicators.entries()) {
    if (!(material instanceof THREE.MeshStandardMaterial)) continue;
    // Varsayılan araç yönünde -x sürücünün sağı, +x soludur.
    const side: Exclude<TurnSignalDirection, null> = index === 0 ? 'right' : 'left';
    const blinking = hazards || (signalPulse && direction === side);
    material.emissive.setHex(blinking ? 0xff9a32 : 0x000000);
    material.emissiveIntensity = blinking ? 4.2 : 0;
  }
}

export function setCarHazards(car: THREE.Group, active: boolean): void {
  if (car.userData.hazardPulse === active) return;
  car.userData.hazardPulse = active;
  applyCarIndicators(car);
}

export function setCarTurnSignal(
  car: THREE.Group,
  direction: TurnSignalDirection,
  active: boolean,
): void {
  if (
    car.userData.turnSignalDirection === direction &&
    car.userData.turnSignalPulse === active
  ) {
    return;
  }
  car.userData.turnSignalDirection = direction;
  car.userData.turnSignalPulse = active;
  applyCarIndicators(car);
}

/** Polis/ambulans için dönüşümlü mavi-kırmızı tepe lambaları. */
function addEmergencyLightbar(
  group: THREE.Group,
  dimensions: VehicleDimensions,
  style: 'police' | 'ambulance',
): void {
  const lightMaterials: THREE.MeshStandardMaterial[] = [];
  const sceneLights: THREE.PointLight[] = [];
  const lightY = 0.3 + dimensions.bodyHeight + dimensions.cabinHeight + 0.08;

  for (const [index, color] of [0x3c80ff, 0xff4d45].entries()) {
    const material = new THREE.MeshStandardMaterial({ color, emissive: 0x000000, roughness: 0.35 });
    const light = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.12, 0.16), material);
    light.position.set(index === 0 ? -0.23 : 0.23, lightY, 0.04);
    group.add(light);
    lightMaterials.push(material);

    const sceneLight = new THREE.PointLight(color, 0, 5.4, 1.9);
    sceneLight.position.set(index === 0 ? -0.23 : 0.23, lightY + 0.08, 0.04);
    sceneLight.castShadow = false;
    sceneLight.visible = false;
    group.add(sceneLight);
    sceneLights.push(sceneLight);
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
  group.userData.emergencySceneLights = sceneLights;
  group.userData.emergencyLightsActive = false;
  group.userData.emergencyLightsAlternate = false;
}

export function setCarEmergencyLights(car: THREE.Group, active: boolean, alternate = false): void {
  if (
    car.userData.emergencyLightsActive === active &&
    car.userData.emergencyLightsAlternate === alternate
  ) {
    return;
  }
  car.userData.emergencyLightsActive = active;
  car.userData.emergencyLightsAlternate = alternate;

  const materials = car.userData.emergencyLightMaterials;
  if (!Array.isArray(materials)) return;

  for (const [index, material] of materials.entries()) {
    if (!(material instanceof THREE.MeshStandardMaterial)) continue;
    const lit = active && (alternate ? index % 2 === 0 : index % 2 === 1);
    material.emissive.setHex(index % 2 === 0 ? 0x3c80ff : 0xff4d45);
    material.emissiveIntensity = lit ? 3.5 : 0;
  }

  const sceneLights = car.userData.emergencySceneLights;
  if (!Array.isArray(sceneLights)) return;
  for (const [index, light] of sceneLights.entries()) {
    if (!(light instanceof THREE.PointLight)) continue;
    const lit = active && (alternate ? index % 2 === 0 : index % 2 === 1);
    light.visible = lit;
    light.intensity = lit ? 18 : 0;
  }
}

/** İstasyon binası — sahanın üst ucunda, market/ofis. */
export function createStationBuilding(): THREE.Group {
  const group = new THREE.Group();
  group.position.set(MARKET_X, 0, MARKET_Z);
  group.rotation.y = MARKET_ROTATION_Y;

  const wall = new THREE.Mesh(
    new THREE.BoxGeometry(7.2, 1.7, 2.2),
    new THREE.MeshStandardMaterial({ color: 0xe4e0d6, roughness: 0.85 }),
  );
  wall.position.y = 0.85;
  wall.castShadow = true;
  wall.receiveShadow = true;
  group.add(wall);

  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(7.65, 0.25, 2.7),
    new THREE.MeshStandardMaterial({ color: 0x35695a, roughness: 0.8 }),
  );
  roof.position.y = 1.82;
  roof.castShadow = true;
  group.add(roof);

  // Vitrin camları
  for (const glassX of [-2.35, -0.72, 0.91]) {
    const glass = new THREE.Mesh(
      new THREE.BoxGeometry(1.5, 0.9, 0.08),
      new THREE.MeshStandardMaterial({ color: GLASS_COLOR, roughness: 0.2, metalness: 0.5 }),
    );
    glass.position.set(glassX, 0.85, 1.14);
    group.add(glass);
  }

  const door = new THREE.Mesh(
    new THREE.BoxGeometry(0.92, 1.42, 0.1),
    new THREE.MeshStandardMaterial({
      color: 0x22363b,
      emissive: 0x0e1d20,
      emissiveIntensity: 0.35,
      roughness: 0.25,
      metalness: 0.35,
    }),
  );
  door.position.set(2.72, 0.72, 1.16);
  group.add(door);

  const handle = new THREE.Mesh(
    new THREE.SphereGeometry(0.055, 8, 6),
    new THREE.MeshStandardMaterial({ color: CHROME_COLOR, metalness: 0.75, roughness: 0.3 }),
  );
  handle.position.set(2.98, 0.72, 1.24);
  group.add(handle);

  // Saçak altındaki sıcak ışık şeridi gece vardiyası hissini güçlendirir.
  const lightStrip = new THREE.Mesh(
    new THREE.BoxGeometry(6.9, 0.07, 0.08),
    new THREE.MeshStandardMaterial({
      color: 0xffe4a6,
      emissive: 0xffcf70,
      emissiveIntensity: 1.5,
      roughness: 0.35,
    }),
  );
  lightStrip.position.set(0, 1.67, 1.18);
  group.add(lightStrip);

  return group;
}
