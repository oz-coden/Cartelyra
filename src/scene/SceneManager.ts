import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import * as TWEEN from '@tweenjs/tween.js';

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
  gridSub: 0xe5e7eb
};

export const DARK_THEME: ThemeColors = {
  background: 0x0f172a,
  fog: 0x0f172a,
  ambientLight: 0x64748b,
  dirLight: 0x93c5fd,
  gridLine: 0x334155,
  gridSub: 0x1e293b
};

export class SceneManager {
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public renderer: THREE.WebGLRenderer;
  public controls: OrbitControls;
  public gridHelper: THREE.GridHelper | null = null;

  private ambientLight: THREE.AmbientLight;
  private dirLight: THREE.DirectionalLight;
  private hemiLight: THREE.HemisphereLight;
  private isDark: boolean = false;
  private active = true;
  private animationId: number | null = null;

  private defaultCameraPos = new THREE.Vector3(120, 155, 160);
  private defaultTarget = new THREE.Vector3(0, 24, 0);

  constructor(container: HTMLElement) {
    // 1. Scene
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(LIGHT_THEME.fog, 0.002);

    // 2. Camera
    this.camera = new THREE.PerspectiveCamera(
      45,
      window.innerWidth / window.innerHeight,
      0.5,
      1500
    );
    this.camera.position.copy(this.defaultCameraPos);

    // 3. Renderer
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      alpha: false
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
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

    // 6. Ground & Grid
    this.setupGround();

    // 7. Event listeners
    window.addEventListener('resize', this.onWindowResize.bind(this));

    // 8. Start Loop
    this.animate = this.animate.bind(this);
    this.animationId = requestAnimationFrame(this.animate);
  }

  private setupGround() {
    // Infinite grid helper
    if (this.gridHelper) this.scene.remove(this.gridHelper);
    this.gridHelper = new THREE.GridHelper(300, 60, LIGHT_THEME.gridLine, LIGHT_THEME.gridSub);
    this.gridHelper.position.y = -0.05;
    this.scene.add(this.gridHelper);

    // Subtle ground plane to catch shadows
    const groundGeo = new THREE.PlaneGeometry(600, 600);
    const groundMat = new THREE.ShadowMaterial({ opacity: 0.15 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.06;
    ground.receiveShadow = true;
    this.scene.add(ground);
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

    if (this.gridHelper) {
      this.scene.remove(this.gridHelper);
      this.gridHelper = new THREE.GridHelper(300, 60, theme.gridLine, theme.gridSub);
      this.gridHelper.position.y = -0.05;
      this.scene.add(this.gridHelper);
    }
  }

  public getIsDark(): boolean {
    return this.isDark;
  }

  public flyTo(
    targetLookAt: THREE.Vector3,
    desiredCameraPos?: THREE.Vector3,
    duration: number = 1000
  ) {
    const currentTarget = this.controls.target.clone();
    const currentPos = this.camera.position.clone();

    const endPos = desiredCameraPos || currentPos.clone().add(
      targetLookAt.clone().sub(currentTarget)
    );

    new TWEEN.Tween(currentTarget)
      .to(targetLookAt, duration)
      .easing(TWEEN.Easing.Cubic.Out)
      .onUpdate(() => {
        this.controls.target.copy(currentTarget);
      })
      .start();

    new TWEEN.Tween(currentPos)
      .to(endPos, duration)
      .easing(TWEEN.Easing.Cubic.Out)
      .onUpdate(() => {
        this.camera.position.copy(currentPos);
      })
      .start();
  }

  public resetCamera(duration: number = 900) {
    this.flyTo(this.defaultTarget, this.defaultCameraPos, duration);
  }

  public setActive(active: boolean) {
    if (this.active === active) return;
    this.active = active;
    if (active) this.animationId = requestAnimationFrame(this.animate);
    else if (this.animationId !== null) cancelAnimationFrame(this.animationId);
  }

  private onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  private animate(time: number) {
    if (!this.active) return;
    this.animationId = requestAnimationFrame(this.animate);
    TWEEN.update(time);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}
