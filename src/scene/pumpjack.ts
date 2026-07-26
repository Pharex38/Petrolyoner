import * as THREE from 'three';

/**
 * Tek bir petrol kuyusunun 3B modeli: beton saha, kule, sallanan denge kolu
 * (walking beam) ve dönen karşı ağırlık çarkı.
 *
 * Hepsi primitif geometriden kuruluyor — dış model dosyası yok, repo hafif kalıyor.
 * Sanat aşamasında bu sınıf glTF yükleyen bir sürümle değiştirilecek.
 */

const BODY_COLOR = 0xf0b429;
const BODY_LOCKED_COLOR = 0x7d7565;
const PAD_COLOR = 0x3d3b36;
const PAD_LOCKED_COLOR = 0x5c574c;
const METAL_COLOR = 0x394049;
const TANK_COLOR = 0xd6d1c4;
const ACCENT_COLOR = 0x27b7a8;

export class PumpjackRig {
  readonly group = new THREE.Group();

  private readonly beamPivot = new THREE.Group();
  private readonly crank = new THREE.Group();
  private readonly ring: THREE.Mesh;

  private readonly bodyMaterial: THREE.MeshStandardMaterial;
  private readonly padMaterial: THREE.MeshStandardMaterial;

  private phase = 0;
  private locked = true;

  constructor(wellId: string, x: number, z: number) {
    this.group.position.set(x, 0, z);
    this.group.userData.wellId = wellId;

    this.bodyMaterial = new THREE.MeshStandardMaterial({
      color: BODY_LOCKED_COLOR,
      roughness: 0.55,
      metalness: 0.15,
    });

    this.padMaterial = new THREE.MeshStandardMaterial({
      color: PAD_LOCKED_COLOR,
      roughness: 0.95,
    });

    const metalMaterial = new THREE.MeshStandardMaterial({
      color: METAL_COLOR,
      roughness: 0.4,
      metalness: 0.6,
    });

    // --- Beton saha ---
    const pad = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.16, 3.4), this.padMaterial);
    pad.position.y = 0.08;
    pad.receiveShadow = true;
    this.group.add(pad);

    // --- Seçim halkası ---
    this.ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.78, 0.06, 8, 44),
      new THREE.MeshStandardMaterial({
        color: ACCENT_COLOR,
        emissive: ACCENT_COLOR,
        emissiveIntensity: 0.6,
        roughness: 0.4,
      }),
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.2;
    this.ring.visible = false;
    this.group.add(this.ring);

    // --- Taban ---
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.32, 0.85), metalMaterial);
    base.position.set(0, 0.32, 0);
    base.castShadow = true;
    this.group.add(base);

    // --- Kule (Sampson post) — 4 kenarlı, klasik kule silueti ---
    const tower = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.26, 1.78, 4),
      this.bodyMaterial,
    );
    tower.position.set(0, 1.3, 0);
    tower.rotation.y = Math.PI / 4;
    tower.castShadow = true;
    this.group.add(tower);

    // --- Depo tankları: kuş bakışından "burası petrol sahası" diyen en net işaret ---
    // Açık renk şart: koyu olunca taban bloğuyla birleşip tek kara kütle oluyor.
    const tankMaterial = new THREE.MeshStandardMaterial({
      color: TANK_COLOR,
      roughness: 0.6,
      metalness: 0.25,
    });

    for (const tankZ of [0.66, 1.3]) {
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.54, 16), tankMaterial);
      tank.position.set(1.12, 0.43, tankZ);
      tank.castShadow = true;
      tank.receiveShadow = true;
      this.group.add(tank);
    }

    // --- Denge kolu: kule tepesinde tahterevalli gibi sallanır ---
    this.beamPivot.position.set(0, 2.08, 0);
    this.group.add(this.beamPivot);

    const beam = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.2, 0.24), this.bodyMaterial);
    beam.castShadow = true;
    this.beamPivot.add(beam);

    // Ön uçtaki "at kafası"
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.58, 0.3), this.bodyMaterial);
    head.position.set(1.32, -0.16, 0);
    head.castShadow = true;
    this.beamPivot.add(head);

    // --- Karşı ağırlık çarkı ---
    // Kolun arka ucunun tam altında duruyor; böylece aradaki biyel kolunu
    // modellemeden de mekanizma bağlantılı görünüyor.
    this.crank.position.set(-1.24, 0.62, 0);
    this.group.add(this.crank);

    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.12, 22), metalMaterial);
    wheel.rotation.x = Math.PI / 2;
    wheel.castShadow = true;
    this.crank.add(wheel);

    // Merkezden kaçık ağırlık — dönüşün görünmesini sağlıyor.
    const weight = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.36, 0.18), this.bodyMaterial);
    weight.position.set(0.24, 0, 0);
    weight.castShadow = true;
    this.crank.add(weight);
  }

  get position(): THREE.Vector3 {
    return this.group.position;
  }

  setLocked(locked: boolean): void {
    if (this.locked === locked) return;

    this.locked = locked;
    this.bodyMaterial.color.setHex(locked ? BODY_LOCKED_COLOR : BODY_COLOR);
    this.padMaterial.color.setHex(locked ? PAD_LOCKED_COLOR : PAD_COLOR);
  }

  setSelected(selected: boolean): void {
    this.ring.visible = selected;
  }

  /**
   * @param deltaSeconds geçen süre
   * @param speed salınım hızı (rad/sn). Kilitliyken pompa durur.
   */
  update(deltaSeconds: number, speed: number): void {
    if (this.locked) {
      this.beamPivot.rotation.z = 0;
      return;
    }

    this.phase += deltaSeconds * speed;
    this.beamPivot.rotation.z = Math.sin(this.phase) * 0.22;
    this.crank.rotation.z = -this.phase;
  }
}
