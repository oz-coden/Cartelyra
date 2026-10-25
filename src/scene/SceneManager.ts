import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import * as TWEEN from "@tweenjs/tween.js";

export interface ThemeColors {
  background: number;
  fog: number;
  ambientLight: number;
  dirLight: number;
  gridLine: number;
  gridSub: number;
}

export const LIGHT_THEME: ThemeColors = {
  background: 0xf3f4f6,
  fog: 0xf3f4f6,
  ambientLight: 0xffffff,
  dirLight: 0xfffaf0,
  gridLine: 0xd1d5db,
  gridSub: 0xe5e7eb,
};

export const DARK_THEME: ThemeColors = {
  background: 0x0f172a,
  fog: 0x0f172a,
  ambientLight: 0x64748b,
  dirLight: 0x93c5fd,
  gridLine: 0x334155,
  gridSub: 0x1e293b,
};

/** Rendering boundary: state and picking can be tested without a GPU. */
export interface SceneHost {
  onFrame?: (() => void) | null;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: { domElement: HTMLElement };
  controls: { maxDistance: number };
  setActive(active: boolean): void;
  setDarkTheme(dark: boolean): void;
  resize(): void;
  setSceneBounds?(bounds: THREE.Box3): void;
  flyTo(
    target: THREE.Vector3,
    position?: THREE.Vector3,
    duration?: number,
  ): void;
}

export class SceneManager {
  public onFrame: (() => void) | null = null;
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public renderer: THREE.WebGLRenderer;
  public controls: OrbitControls;
  public gridHelper: THREE.GridHelper | null = null;

  private ambientLight: THREE.AmbientLight;
  private dirLight: THREE.DirectionalLight;
  private hemiLight: THREE.HemisphereLight;
  private isDark: boolean = false;
  private cameraTweens: TWEEN.Tween<THREE.Vector3>[] = [];
  private cameraAnimations = new TWEEN.Group();
  private ground!: THREE.Mesh;
  private referenceCenter = new THREE.Vector3(0, -0.05, 0);
  private gridSize = 300;
  private gridDivisions = 60;
  private active = true;
  private animationId: number | null = null;

  private defaultCameraPos = new THREE.Vector3(120, 155, 160);
  private defaultTarget = new THREE.Vector3(0, 24, 0);

  constructor(private container: HTMLElement, renderer?: THREE.WebGLRenderer) {
    // 1. Scene
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(LIGHT_THEME.fog, 0.002);

    // 2. Camera
    this.camera = new THREE.PerspectiveCamera(
      45,
      Math.max(1, container.clientWidth) / Math.max(1, container.clientHeight),
      0.5,
      1500,
    );
    this.camera.position.copy(this.defaultCameraPos);

    // 3. Renderer
    this.renderer = renderer ?? new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
      alpha: false,
    });
    this.renderer.setSize(
      Math.max(1, this.container.clientWidth),
      Math.max(1, this.container.clientHeight),
    );
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    container.appendChild(this.renderer.domElement);

    // 4. Controls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.05; // Don't go below ground
    this.controls.minDistance = 5;
    this.controls.maxDistance = 450;
    this.controls.target.copy(this.defaultTarget);
    this.controls.addEventListener("start", () => this.stopCameraMotion());

    // 5. Lights
    this.ambientLight = new THREE.AmbientLight(LIGHT_THEME.ambientLight, 1.2);
    this.scene.add(this.ambientLight);

    this.hemiLight = new THREE.HemisphereLight(0xffffff, 0xdfe3e8, 0.6);
    this.scene.add(this.hemiLight);

    this.dirLight = new THREE.DirectionalLight(LIGHT_THEME.dirLight, 1.8);
    this.dirLight.position.set(40, 70, 30);
    this.dirLight.castShadow = true;
    this.dirLight.shadow.mapSize.width = 2048;
    this.dirLight.shadow.mapSize.height = 2048;
    this.dirLight.shadow.camera.near = 10;
    this.dirLight.shadow.camera.far = 200;
    const shadowD = 65;
    this.dirLight.shadow.camera.left = -shadowD;
    this.dirLight.shadow.camera.right = shadowD;
    this.dirLight.shadow.camera.top = shadowD;
    this.dirLight.shadow.camera.bottom = -shadowD;
    this.dirLight.shadow.bias = -0.0005;
    this.scene.add(this.dirLight);
    this.scene.add(this.dirLight.target);

    // 6. Ground & Grid
    this.setupGround();

    // 7. Event listeners
    new ResizeObserver(() => this.onWindowResize()).observe(container);

    // 8. Start Loop
    this.animate = this.animate.bind(this);
    this.animationId = requestAnimationFrame(this.animate);
  }

  private setupGround() {
    this.rebuildGrid();

    // Subtle ground plane to catch shadows
    const groundGeo = new THREE.PlaneGeometry(1, 1);
    const groundMat = new THREE.ShadowMaterial({ opacity: 0.15 });
    this.ground = new THREE.Mesh(groundGeo, groundMat);
    this.ground.userData.type = "reference-ground";
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.copy(this.referenceCenter).add(new THREE.Vector3(0, -0.01, 0));
    this.ground.scale.set(this.gridSize * 2, this.gridSize * 2, 1);
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);
  }

  private rebuildGrid() {
    if (this.gridHelper) {
      this.scene.remove(this.gridHelper);
      this.gridHelper.geometry.dispose();
      const materials = Array.isArray(this.gridHelper.material) ? this.gridHelper.material : [this.gridHelper.material];
      materials.forEach(material => material.dispose());
    }
    const theme = this.isDark ? DARK_THEME : LIGHT_THEME;
    this.gridHelper = new THREE.GridHelper(this.gridSize, this.gridDivisions, theme.gridLine, theme.gridSub);
    this.gridHelper.position.copy(this.referenceCenter);
    this.scene.add(this.gridHelper);
  }

  /** Grid, shadow receiver and lighting share the bounds of the visible building scope. */
  public setSceneBounds(bounds: THREE.Box3) {
    if (bounds.isEmpty()) return;
    const center = bounds.getCenter(new THREE.Vector3()), size = bounds.getSize(new THREE.Vector3());
    this.referenceCenter.set(center.x, bounds.min.y - 0.05, center.z);
    const extent = Math.max(size.x, size.z) * 1.4 + 20;
    const step = 5 * 10 ** Math.max(0, Math.ceil(Math.log10(extent / 500)));
    const divisions = Math.ceil(extent / step), gridSize = divisions * step;
    if (gridSize !== this.gridSize || divisions !== this.gridDivisions) {
      this.gridSize = gridSize;
      this.gridDivisions = divisions;
      this.rebuildGrid();
    } else this.gridHelper?.position.copy(this.referenceCenter);
    this.ground.position.copy(this.referenceCenter).add(new THREE.Vector3(0, -0.01, 0));
    this.ground.scale.set(gridSize * 2, gridSize * 2, 1);
    const lightExtent = Math.max(size.x, size.y, size.z, 60);
    this.dirLight.target.position.copy(center);
    this.dirLight.position.copy(center).add(new THREE.Vector3(0.4, 0.7, 0.3).multiplyScalar(lightExtent));
    const camera = this.dirLight.shadow.camera;
    camera.left = camera.bottom = -lightExtent * 0.8;
    camera.right = camera.top = lightExtent * 0.8;
    camera.near = 0.5;
    camera.far = lightExtent * 4;
    camera.updateProjectionMatrix();
  }

  public setDarkTheme(isDark: boolean) {
    this.isDark = isDark;
    const theme = isDark ? DARK_THEME : LIGHT_THEME;

    this.scene.background = new THREE.Color(theme.background);
    if (this.scene.fog instanceof THREE.FogExp2) {
      this.scene.fog.color.setHex(theme.fog);
    }

    this.ambientLight.color.setHex(theme.ambientLight);
    this.ambientLight.intensity = isDark ? 0.7 : 1.2;

    this.dirLight.color.setHex(theme.dirLight);
    this.dirLight.intensity = isDark ? 1.2 : 1.8;

    this.hemiLight.intensity = isDark ? 0.3 : 0.6;

    this.rebuildGrid();
  }

  public getIsDark(): boolean {
    return this.isDark;
  }

  public flyTo(
    targetLookAt: THREE.Vector3,
    desiredCameraPos?: THREE.Vector3,
    duration: number = 1000,
  ) {
    this.stopCameraMotion();
    // Drain pending orbit/pan damping before taking control of the camera.
    const damping = this.controls.enableDamping;
    this.controls.enableDamping = false;
    this.controls.update();
    this.controls.enableDamping = damping;
    const currentTarget = this.controls.target.clone();
    const currentPos = this.camera.position.clone();

    const endPos =
      desiredCameraPos ||
      currentPos.clone().add(targetLookAt.clone().sub(currentTarget));

    if (duration <= 0) {
      this.controls.target.copy(targetLookAt);
      this.camera.position.copy(endPos);
      this.controls.update();
      return;
    }

    this.cameraTweens.push(
      new TWEEN.Tween(currentTarget, this.cameraAnimations)
        .to(targetLookAt, duration)
        .easing(TWEEN.Easing.Cubic.Out)
        .onUpdate(() => {
          this.controls.target.copy(currentTarget);
        })
        .start(),
    );

    this.cameraTweens.push(
      new TWEEN.Tween(currentPos, this.cameraAnimations)
        .to(endPos, duration)
        .easing(TWEEN.Easing.Cubic.Out)
        .onUpdate(() => {
          this.camera.position.copy(currentPos);
        })
        .start(),
    );
  }

  private stopCameraMotion() {
    this.cameraTweens.forEach(tween => tween.stop());
    this.cameraTweens = [];
  }

  public resetCamera(duration: number = 900) {
    this.flyTo(this.defaultTarget, this.defaultCameraPos, duration);
  }

  public setActive(active: boolean) {
    if (this.active === active) return;
    this.active = active;
    if (!active) this.stopCameraMotion();
    if (active) this.onWindowResize();
    if (active) this.animationId = requestAnimationFrame(this.animate);
    else if (this.animationId !== null) cancelAnimationFrame(this.animationId);
  }

  public resize() {
    this.onWindowResize();
  }

  private onWindowResize() {
    this.camera.aspect =
      Math.max(1, this.container.clientWidth) /
      Math.max(1, this.container.clientHeight);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(
      Math.max(1, this.container.clientWidth),
      Math.max(1, this.container.clientHeight),
    );
  }

  private animate(time: number) {
    if (!this.active) return;
    this.animationId = requestAnimationFrame(this.animate);
    this.cameraAnimations.update(time);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.onFrame?.();
  }
}
