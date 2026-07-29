import * as THREE from 'three';

interface BirdFlight {
  readonly root: THREE.Group;
  readonly wings: THREE.Mesh[];
  readonly direction: -1 | 1;
  readonly speed: number;
  readonly baseHeight: number;
  readonly flapSpeed: number;
  readonly stork: boolean;
  elapsed: number;
}

interface NestDelivery {
  readonly twig: THREE.Group;
  elapsed: number;
}

interface StorkNest {
  readonly anchor: THREE.Vector3;
  readonly nest: THREE.Group;
  readonly stork: ReturnType<typeof createStork>;
  readonly twigGeometry: THREE.CylinderGeometry;
  readonly twigMaterial: THREE.MeshStandardMaterial;
  branchCount: number;
  nextDeliveryIn: number;
  delivery: NestDelivery | null;
}

/** Yağmur çizgisi ile gerçek hareket aynı vektörü kullanır; ekranda kaymaz. */
const RAIN_WIND_X = 3.1;
const RAIN_WIND_Z = -1.55;
const RAIN_STREAK_SECONDS = 0.082;

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function smooth(value: number): number {
  const clamped = Math.max(0, Math.min(1, value));
  return clamped * clamped * (3 - 2 * clamped);
}

function createWing(
  side: -1 | 1,
  reach: number,
  material: THREE.Material,
): THREE.Mesh {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.BufferAttribute(
      new Float32Array([
        0, 0, 0,
        -reach * 0.38, 0, side * reach * 0.3,
        -reach * 0.12, 0, side * reach,
      ]),
      3,
    ),
  );
  geometry.computeVertexNormals();
  const wing = new THREE.Mesh(geometry, material);
  wing.castShadow = false;
  return wing;
}

function createSmallBird(scale: number): { root: THREE.Group; wings: THREE.Mesh[] } {
  const root = new THREE.Group();
  const feather = new THREE.MeshStandardMaterial({
    color: 0x26313a,
    roughness: 0.9,
    side: THREE.DoubleSide,
  });
  const pale = new THREE.MeshStandardMaterial({ color: 0x9ca8aa, roughness: 0.9 });

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.18, 6, 4), feather);
  body.scale.set(1.55, 0.62, 0.62);
  root.add(body);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.105, 6, 4), pale);
  head.position.x = 0.28;
  root.add(head);

  const wings = [
    createWing(-1, 0.62, feather),
    createWing(1, 0.62, feather),
  ];
  for (const wing of wings) {
    wing.position.y = 0.03;
    root.add(wing);
  }
  root.scale.setScalar(scale);
  return { root, wings };
}

function createBirdFlock(): { root: THREE.Group; wings: THREE.Mesh[] } {
  const root = new THREE.Group();
  const wings: THREE.Mesh[] = [];
  for (const [x, y, z, scale] of [
    [0, 0, 0, 1],
    [-0.95, 0.18, 0.75, 0.82],
    [-1.15, -0.08, -0.78, 0.74],
  ] as const) {
    const bird = createSmallBird(scale);
    bird.root.position.set(x, y, z);
    root.add(bird.root);
    wings.push(...bird.wings);
  }
  return { root, wings };
}

function createStork(): { root: THREE.Group; wings: THREE.Mesh[] } {
  const root = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: 0xf0eee3, roughness: 0.86 });
  const black = new THREE.MeshStandardMaterial({
    color: 0x24282b,
    roughness: 0.9,
    side: THREE.DoubleSide,
  });
  const red = new THREE.MeshStandardMaterial({ color: 0xc95a43, roughness: 0.82 });

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.28, 7, 5), white);
  body.scale.set(1.65, 0.62, 0.72);
  root.add(body);

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.09, 0.74, 7), white);
  neck.rotation.z = -Math.PI / 2;
  neck.position.set(0.58, 0.08, 0);
  root.add(neck);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 7, 5), white);
  head.position.set(0.96, 0.08, 0);
  root.add(head);

  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.065, 0.55, 7), red);
  beak.rotation.z = -Math.PI / 2;
  beak.position.set(1.28, 0.08, 0);
  root.add(beak);

  for (const z of [-0.09, 0.09]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.72, 5), red);
    leg.rotation.z = Math.PI / 2;
    leg.position.set(-0.55, -0.05, z);
    root.add(leg);
  }

  const wings = [createWing(-1, 1.45, black), createWing(1, 1.45, black)];
  for (const wing of wings) {
    wing.position.set(0.08, 0.04, 0);
    root.add(wing);
  }
  return { root, wings };
}

/**
 * Hava, kuşlar ve yol aydınlatmasını tek güncellemede toplar. Yağmur tek bir
 * LineSegments çizimi kullanır; lambaların yalnızca bir kısmı gerçek ışık saçar.
 */
export class AmbientSystem {
  readonly group = new THREE.Group();

  private readonly reduceMotion: boolean;
  private readonly rain: THREE.LineSegments;
  private readonly rainPositions: Float32Array;
  private readonly rainSpeeds: Float32Array;
  private readonly rainMaterial: THREE.LineBasicMaterial;
  private readonly streetLights: THREE.SpotLight[] = [];
  private readonly puddles: THREE.Mesh[] = [];
  private readonly puddleMaterials: THREE.MeshBasicMaterial[] = [];
  private readonly flockVisual = createBirdFlock();
  private readonly storkVisual = createStork();
  private readonly lampMaterial = new THREE.MeshStandardMaterial({
    color: 0xf0e7d3,
    emissive: 0xffe1ad,
    emissiveIntensity: 0.05,
    roughness: 0.58,
  });
  private birdFlight: BirdFlight | null = null;
  private storkNest: StorkNest | null = null;
  private nextBirdIn = randomBetween(5, 10);
  private weatherTimer = randomBetween(20, 38);
  private rainTarget = 0;
  private rainLevel = 0;
  private puddleLevel = 0;
  private elapsed = 0;

  constructor(
    roadX: number,
    roadWidth: number,
    isMobile: boolean,
    reduceMotion: boolean,
  ) {
    this.reduceMotion = reduceMotion;
    const dropCount = reduceMotion ? 36 : isMobile ? 82 : 138;
    this.rainPositions = new Float32Array(dropCount * 2 * 3);
    this.rainSpeeds = new Float32Array(dropCount);
    for (let index = 0; index < dropCount; index += 1) {
      this.resetRainDrop(index, true);
    }

    const rainGeometry = new THREE.BufferGeometry();
    rainGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(this.rainPositions, 3),
    );
    this.rainMaterial = new THREE.LineBasicMaterial({
      color: 0xb9deee,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    this.rain = new THREE.LineSegments(rainGeometry, this.rainMaterial);
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    this.rain.renderOrder = 8;
    this.group.add(this.rain);

    this.addRoadPuddles(roadX, roadWidth);
    this.addStreetLights(roadX, roadWidth);
  }

  get isRaining(): boolean {
    return this.rainLevel > 0.08 || this.rainTarget > 0;
  }

  get rainStrength(): number {
    return this.rainLevel;
  }

  get trafficSpeedMultiplier(): number {
    return 1 - this.rainLevel * 0.17;
  }

  update(deltaSeconds: number): void {
    this.elapsed += deltaSeconds;
    this.updateWeather(deltaSeconds);
    this.updateBirds(deltaSeconds);
  }

  setDaylight(daylight: number): void {
    const nightStrength = 1 - Math.max(0, Math.min(1, daylight));
    this.lampMaterial.emissiveIntensity = 0.05 + nightStrength * 3.1;
    for (const light of this.streetLights) {
      light.intensity = nightStrength * 17;
    }
    for (const material of this.puddleMaterials) {
      material.color.setHex(daylight < 0.34 ? 0x774f2f : 0x638b9d);
    }
  }

  private updateWeather(deltaSeconds: number): void {
    this.weatherTimer -= deltaSeconds;
    if (this.weatherTimer <= 0) {
      if (this.rainTarget > 0) {
        this.rainTarget = 0;
        this.weatherTimer = randomBetween(34, 62);
      } else {
        this.rainTarget = 1;
        this.weatherTimer = randomBetween(15, 27);
        this.rain.visible = true;
      }
    }

    const response = this.rainTarget > this.rainLevel ? 0.82 : 0.55;
    this.rainLevel +=
      (this.rainTarget - this.rainLevel) *
      Math.min(1, deltaSeconds * response);
    if (this.rainTarget === 0 && this.rainLevel < 0.012) {
      this.rainLevel = 0;
      this.rain.visible = false;
    }

    this.rainMaterial.opacity =
      this.rainLevel * (this.reduceMotion ? 0.22 : 0.36);
    const puddleTarget = this.rainTarget > 0 || this.rainLevel > 0.16 ? 1 : 0;
    const puddleResponse = puddleTarget > this.puddleLevel ? 0.19 : 0.028;
    this.puddleLevel +=
      (puddleTarget - this.puddleLevel) * Math.min(1, deltaSeconds * puddleResponse);
    this.updatePuddles();
    if (!this.rain.visible) return;

    const position = this.rainPositions;
    const dropCount = this.rainSpeeds.length;
    for (let index = 0; index < dropCount; index += 1) {
      const offset = index * 6;
      const speed = this.rainSpeeds[index] ?? 10;
      const x = (position[offset] ?? 0) + deltaSeconds * RAIN_WIND_X;
      const y = (position[offset + 1] ?? 0) - deltaSeconds * speed;
      const z = (position[offset + 2] ?? 0) + deltaSeconds * RAIN_WIND_Z;
      position[offset] = x;
      position[offset + 1] = y;
      position[offset + 2] = z;
      // İkinci uç hareketin gerisinde ve yukarıda kalır. Önceki sürümde çizgi
      // başka yöne bakarken damla dikey hareket ettiği için yanlamasına kayıyordu.
      position[offset + 3] = x - RAIN_WIND_X * RAIN_STREAK_SECONDS;
      position[offset + 4] = y + speed * RAIN_STREAK_SECONDS;
      position[offset + 5] = z - RAIN_WIND_Z * RAIN_STREAK_SECONDS;
      if (y < 0.18 || x > 18 || z < -25) this.resetRainDrop(index, false);
    }
    const attribute = this.rain.geometry.getAttribute('position');
    if (attribute instanceof THREE.BufferAttribute) attribute.needsUpdate = true;
  }

  private resetRainDrop(index: number, randomHeight: boolean): void {
    const offset = index * 6;
    const x = randomBetween(-12, 16);
    const y = randomHeight ? randomBetween(0.4, 14) : randomBetween(10, 15);
    const z = randomBetween(-23, 23);
    this.rainPositions[offset] = x;
    this.rainPositions[offset + 1] = y;
    this.rainPositions[offset + 2] = z;
    const speed = randomBetween(9.5, 13.5);
    this.rainPositions[offset + 3] = x - RAIN_WIND_X * RAIN_STREAK_SECONDS;
    this.rainPositions[offset + 4] = y + speed * RAIN_STREAK_SECONDS;
    this.rainPositions[offset + 5] = z - RAIN_WIND_Z * RAIN_STREAK_SECONDS;
    this.rainSpeeds[index] = speed;
  }

  private updateBirds(deltaSeconds: number): void {
    this.updateStorkNest(deltaSeconds);
    const flight = this.birdFlight;
    if (flight === null) {
      this.nextBirdIn -= deltaSeconds;
      if (this.nextBirdIn <= 0) this.startBirdFlight();
      return;
    }

    flight.elapsed += deltaSeconds;
    flight.root.position.x += flight.direction * flight.speed * deltaSeconds;
    flight.root.position.y =
      flight.baseHeight + Math.sin(flight.elapsed * 1.7) * (flight.stork ? 0.12 : 0.2);
    const flap = this.reduceMotion
      ? 0.08
      : Math.sin(flight.elapsed * flight.flapSpeed) * (flight.stork ? 0.34 : 0.58);
    for (let index = 0; index < flight.wings.length; index += 1) {
      const side = index % 2 === 0 ? -1 : 1;
      const wing = flight.wings[index];
      if (wing !== undefined) wing.rotation.x = flap * side;
    }

    if (
      (flight.direction === 1 && flight.root.position.x > 19) ||
      (flight.direction === -1 && flight.root.position.x < -17)
    ) {
      this.group.remove(flight.root);
      this.birdFlight = null;
      this.nextBirdIn = randomBetween(12, 25);
    }
  }

  private startBirdFlight(): void {
    const stork = Math.random() < 0.34;
    const bird = stork ? this.storkVisual : this.flockVisual;
    const direction: -1 | 1 = Math.random() < 0.5 ? -1 : 1;
    const baseHeight = randomBetween(stork ? 7.5 : 6.2, stork ? 9.3 : 8.4);
    bird.root.position.set(
      direction === 1 ? -16 : 18,
      baseHeight,
      randomBetween(-14, 13),
    );
    bird.root.rotation.y = direction === 1 ? 0 : Math.PI;
    for (const wing of bird.wings) wing.rotation.x = 0;
    this.group.add(bird.root);
    this.birdFlight = {
      root: bird.root,
      wings: bird.wings,
      direction,
      speed: stork ? 2.2 : 3.2,
      baseHeight,
      flapSpeed: stork ? 3.1 : 7.4,
      stork,
      elapsed: 0,
    };
  }

  /** Yağmur sonrası asfaltta yavaşça kaybolan, düşük maliyetli su birikintileri. */
  private addRoadPuddles(roadX: number, roadWidth: number): void {
    const puddleGeometry = new THREE.CircleGeometry(0.58, 14);
    for (const [xOffset, z, scaleX, scaleZ] of [
      [-0.58, -17.5, 0.92, 1.55],
      [0.56, -9.8, 0.68, 1.2],
      [-0.2, -1.5, 1.05, 0.8],
      [0.52, 7.6, 0.78, 1.36],
      [-0.5, 18.2, 1.14, 0.75],
    ] as const) {
      const material = new THREE.MeshBasicMaterial({
        color: 0x638b9d,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const puddle = new THREE.Mesh(puddleGeometry, material);
      puddle.rotation.x = -Math.PI / 2;
      puddle.position.set(
        roadX + Math.max(-roadWidth * 0.28, Math.min(roadWidth * 0.28, xOffset)),
        0.092,
        z,
      );
      puddle.scale.set(scaleX, scaleZ, 1);
      puddle.visible = false;
      puddle.renderOrder = 1;
      this.puddles.push(puddle);
      this.puddleMaterials.push(material);
      this.group.add(puddle);
    }
  }

  private updatePuddles(): void {
    const visible = this.puddleLevel > 0.025;
    for (const [index, puddle] of this.puddles.entries()) {
      puddle.visible = visible;
      const material = this.puddleMaterials[index];
      if (material === undefined) continue;
      const ripple = this.reduceMotion ? 0 : Math.sin(this.elapsed * 1.8 + index * 1.93) * 0.035;
      material.opacity = this.puddleLevel * (0.17 + (index % 2) * 0.045 + ripple);
    }
  }

  /** Aynı lambaya düzenli uğrayan leylek, dal bıraktıkça görünür bir yuva örer. */
  private addStorkNest(lampX: number, z: number): void {
    const root = new THREE.Group();
    const anchor = new THREE.Vector3(lampX, 3.63, z);
    root.position.copy(anchor);

    const twigMaterial = new THREE.MeshStandardMaterial({
      color: 0x69442a,
      roughness: 0.96,
    });
    const nest = new THREE.Group();
    root.add(nest);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.34, 0.038, 5, 14),
      twigMaterial,
    );
    ring.rotation.x = Math.PI / 2;
    ring.scale.set(1.18, 0.82, 1);
    nest.add(ring);

    this.group.add(root);
    this.storkNest = {
      anchor,
      nest,
      stork: createStork(),
      twigGeometry: new THREE.CylinderGeometry(0.018, 0.026, 1, 5),
      twigMaterial,
      branchCount: 0,
      nextDeliveryIn: randomBetween(8, 14),
      delivery: null,
    };
    this.storkNest.stork.root.scale.setScalar(0.48);
    this.storkNest.stork.root.visible = false;
    this.group.add(this.storkNest.stork.root);
  }

  private createNestTwig(nest: StorkNest, branchIndex: number): THREE.Group {
    const twig = new THREE.Group();
    const length = 0.48 + (branchIndex % 4) * 0.1;
    const branch = new THREE.Mesh(nest.twigGeometry, nest.twigMaterial);
    branch.scale.y = length;
    branch.rotation.z = Math.PI / 2;
    twig.rotation.y = branchIndex * 1.71 + 0.3;
    twig.position.copy(this.nestTwigPosition(branchIndex));
    branch.castShadow = true;
    twig.add(branch);
    return twig;
  }

  private nestTwigPosition(branchIndex: number): THREE.Vector3 {
    const angle = branchIndex * 1.71;
    const radius = 0.08 + (branchIndex % 3) * 0.075;
    return new THREE.Vector3(
      Math.cos(angle) * radius,
      0.045 + Math.floor(branchIndex / 5) * 0.026,
      Math.sin(angle) * radius,
    );
  }

  private startStorkNestDelivery(nest: StorkNest): void {
    const stork = nest.stork;
    stork.root.position.set(nest.anchor.x - 10.5, nest.anchor.y + 3.3, nest.anchor.z + 2.8);
    stork.root.rotation.y = 0;
    stork.root.visible = true;
    for (const wing of stork.wings) wing.rotation.x = 0;

    const twig = this.createNestTwig(nest, nest.branchCount + 1);
    twig.position.copy(stork.root.position).add(new THREE.Vector3(0.45, -0.05, 0));
    this.group.add(twig);
    nest.delivery = { twig, elapsed: 0 };
  }

  private updateStorkNest(deltaSeconds: number): void {
    const nest = this.storkNest;
    if (nest === null) return;
    const delivery = nest.delivery;
    if (delivery === null) {
      nest.nextDeliveryIn -= deltaSeconds;
      if (nest.nextDeliveryIn <= 0) this.startStorkNestDelivery(nest);
      return;
    }

    delivery.elapsed += deltaSeconds;
    const stork = nest.stork;
    const start = new THREE.Vector3(nest.anchor.x - 10.5, nest.anchor.y + 3.3, nest.anchor.z + 2.8);
    const hover = new THREE.Vector3(nest.anchor.x + 0.18, nest.anchor.y + 1.38, nest.anchor.z - 0.34);
    const exit = new THREE.Vector3(nest.anchor.x + 9.5, nest.anchor.y + 4.1, nest.anchor.z - 2.5);
    const flap = this.reduceMotion ? 0.08 : Math.sin(delivery.elapsed * 4.1) * 0.35;
    for (let index = 0; index < stork.wings.length; index += 1) {
      const wing = stork.wings[index];
      if (wing !== undefined) wing.rotation.x = flap * (index % 2 === 0 ? -1 : 1);
    }

    if (delivery.elapsed < 2.5) {
      stork.root.position.lerpVectors(start, hover, smooth(delivery.elapsed / 2.5));
      stork.root.rotation.y = 0;
      delivery.twig.position.copy(stork.root.position).add(new THREE.Vector3(0.5, -0.08, 0));
      return;
    }

    const landingLocal = this.nestTwigPosition(nest.branchCount + 1);
    const landing = nest.anchor.clone().add(landingLocal);
    if (delivery.elapsed < 3.12) {
      stork.root.position.copy(hover);
      const drop = smooth((delivery.elapsed - 2.5) / 0.62);
      delivery.twig.position.lerpVectors(
        hover.clone().add(new THREE.Vector3(0.5, -0.08, 0)),
        landing,
        drop,
      );
      return;
    }

    if (delivery.twig.parent === this.group) {
      this.group.remove(delivery.twig);
      nest.nest.add(delivery.twig);
      delivery.twig.position.copy(landingLocal);
      nest.branchCount += 1;
    }

    if (delivery.elapsed < 5.5) {
      stork.root.position.lerpVectors(hover, exit, smooth((delivery.elapsed - 3.12) / 2.38));
      stork.root.rotation.y = Math.PI;
      return;
    }

    stork.root.visible = false;
    nest.delivery = null;
    nest.nextDeliveryIn = randomBetween(20, 38);
  }

  private addStreetLights(roadX: number, roadWidth: number): void {
    const poleMaterial = new THREE.MeshStandardMaterial({
      color: 0x4d555b,
      roughness: 0.7,
      metalness: 0.34,
    });
    const poleGeometry = new THREE.CylinderGeometry(0.055, 0.075, 3.5, 8);
    const armGeometry = new THREE.BoxGeometry(0.62, 0.055, 0.055);
    const headGeometry = new THREE.BoxGeometry(0.3, 0.1, 0.2);
    const baseGeometry = new THREE.CylinderGeometry(0.13, 0.16, 0.18, 8);
    const roadEdge = roadWidth / 2 + 0.34;

    for (const [index, z] of [-22, -16, -12.5, -5, 2, 8, 19, 25].entries()) {
      const side = index % 2 === 0 ? -1 : 1;
      const x = roadX + side * roadEdge;
      const inward = -side;

      const pole = new THREE.Mesh(poleGeometry, poleMaterial);
      pole.position.set(x, 1.84, z);
      pole.castShadow = true;
      this.group.add(pole);

      const base = new THREE.Mesh(baseGeometry, poleMaterial);
      base.position.set(x, 0.16, z);
      base.castShadow = true;
      this.group.add(base);

      const arm = new THREE.Mesh(armGeometry, poleMaterial);
      arm.position.set(x + inward * 0.27, 3.55, z);
      arm.castShadow = true;
      this.group.add(arm);

      const lampX = x + inward * 0.57;
      const head = new THREE.Mesh(headGeometry, this.lampMaterial);
      head.position.set(lampX, 3.48, z);
      head.castShadow = false;
      this.group.add(head);

      // Her direğe ayrı ışık pahalıdır; görünen dört direkte gölgesiz SpotLight
      // kullanmak, zemine çizilmiş yapay bir disk olmadan doğal yol konisi verir.
      if (index % 2 === 0) {
        const light = new THREE.SpotLight(0xffe4b8, 0, 10.4, Math.PI / 4.4, 0.72, 1.5);
        light.position.set(lampX, 3.34, z);
        light.target.position.set(lampX, 0, z + 0.3);
        light.castShadow = false;
        this.streetLights.push(light);
        this.group.add(light, light.target);
      }

      // Sabit yuva noktası kameranın gördüğü orta yola yakın seçilir.
      if (index === 4) this.addStorkNest(lampX, z);
    }
  }
}
