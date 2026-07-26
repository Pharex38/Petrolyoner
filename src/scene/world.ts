import * as THREE from 'three';
import { WELLS } from '../game/wells';
import { PumpjackRig } from './pumpjack';

/**
 * Kuş bakışı saha: ortografik kamera yukarıdan ~53° eğimle bakar (klasik tycoon açısı).
 * Perspektif yerine ortografik seçildi — parseller aynı ölçekte görünür, oyuncu
 * uzaktaki kuyuyu yakındakiyle karşılaştırabilir.
 */

const SAND_COLOR = 0xc9b184;
const SITE_COLOR = 0xb49a6d;
const ROAD_COLOR = 0x6f675c;
const SKY_COLOR = 0x9dc4dd;

/** Dikey ekranda sahanın genişliği ekranı doldursun diye referans genişlik. */
const TARGET_WIDTH = 9.2;
/** Yatay ekranda sahanın derinliği sığsın diye referans yükseklik. */
const TARGET_HEIGHT = 12;

export class World {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.OrthographicCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly rigs = new Map<string, PumpjackRig>();

  private readonly container: HTMLElement;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly pickables: THREE.Object3D[] = [];

  constructor(container: HTMLElement) {
    this.container = container;

    this.scene.background = new THREE.Color(SKY_COLOR);

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 120);
    this.camera.position.set(0, 20, 15);
    this.camera.lookAt(0, 0, -0.8);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.addLights();
    this.addGround();
    this.addWells();

    this.resize();
  }

  private addLights(): void {
    this.scene.add(new THREE.HemisphereLight(0xcfe4ff, 0x9c8a63, 1.5));

    const sun = new THREE.DirectionalLight(0xfff0d4, 2.2);
    sun.position.set(7, 14, 5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);

    // Gölge kamerası sahanın tamamını kapsamalı, yoksa kenarlarda gölge kesilir.
    const shadowCamera = sun.shadow.camera;
    shadowCamera.left = -10;
    shadowCamera.right = 10;
    shadowCamera.top = 10;
    shadowCamera.bottom = -10;
    shadowCamera.near = 1;
    shadowCamera.far = 40;
    shadowCamera.updateProjectionMatrix();

    this.scene.add(sun);
  }

  private addGround(): void {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(60, 60),
      new THREE.MeshStandardMaterial({ color: SAND_COLOR, roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // Saha dikey bir şerit halinde ekranın altına ve üstüne taşıyor: dikey
    // ekranda boş kum görünmüyor ve arazi "devam ediyor" hissi veriyor —
    // ileride eklenecek kuyular için hazır parseller.
    const site = new THREE.Mesh(
      new THREE.BoxGeometry(10.4, 0.08, 32),
      new THREE.MeshStandardMaterial({ color: SITE_COLOR, roughness: 1 }),
    );
    site.position.set(0, 0.04, -1);
    site.receiveShadow = true;
    this.scene.add(site);

    const roadMaterial = new THREE.MeshStandardMaterial({ color: ROAD_COLOR, roughness: 1 });

    const roadZ = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.1, 32), roadMaterial);
    roadZ.position.set(0, 0.09, -1);
    roadZ.receiveShadow = true;
    this.scene.add(roadZ);

    // Parselleri ayıran yatay yollar.
    for (const roadZPosition of [-11, -1, 9]) {
      const roadX = new THREE.Mesh(new THREE.BoxGeometry(10.4, 0.1, 1.1), roadMaterial);
      roadX.position.set(0, 0.09, roadZPosition);
      roadX.receiveShadow = true;
      this.scene.add(roadX);
    }
  }

  private addWells(): void {
    for (const definition of WELLS) {
      const [x, z] = definition.position;
      const rig = new PumpjackRig(definition.id, x, z);

      this.rigs.set(definition.id, rig);
      this.scene.add(rig.group);
      this.pickables.push(rig.group);
    }
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

  /** Ekran koordinatından kuyu id'si bulur. Boşluğa tıklandıysa null. */
  pick(clientX: number, clientY: number): string | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObjects(this.pickables, true)[0];
    if (hit === undefined) return null;

    // Vurulan alt parçadan yukarı yürüyüp kuyu id'sini taşıyan gruba ulaş.
    let node: THREE.Object3D | null = hit.object;
    while (node !== null) {
      const id: unknown = node.userData.wellId;
      if (typeof id === 'string') return id;
      node = node.parent;
    }

    return null;
  }

  /** Dünya konumunu ekran pikseline çevirir — uçuşan "+₺" yazıları için. */
  projectToScreen(position: THREE.Vector3): { x: number; y: number } {
    const projected = position.clone().project(this.camera);
    const rect = this.renderer.domElement.getBoundingClientRect();

    return {
      x: (projected.x * 0.5 + 0.5) * rect.width,
      y: (-projected.y * 0.5 + 0.5) * rect.height,
    };
  }
}
