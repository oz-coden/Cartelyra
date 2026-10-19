import * as THREE from 'three';
import { NavNode } from '../types/campus';

export class RouteRenderer {
  public group: THREE.Group;
  private currentTubeMesh: THREE.Mesh | null = null;
  private glowMesh: THREE.Mesh | null = null;
  private startMarker: THREE.Group | null = null;
  private goalMarker: THREE.Group | null = null;
  private pulseTexture: THREE.CanvasTexture | null = null;
  private animationId: number | null = null;
  private active = true;

  private currentPathNodes: NavNode[] = [];
  private getNodePosFn: ((node: NavNode) => THREE.Vector3) | null = null;
  private isDarkTheme: boolean = false;

  constructor(private scene: THREE.Scene) {
    this.group = new THREE.Group();
    this.scene.add(this.group);
    this.setupPulseTexture();
    this.startAnimation();
  }

  private setupPulseTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;

    // High contrast gradient pattern for clear directional pulses
    const grad = ctx.createLinearGradient(0, 0, 512, 0);
    grad.addColorStop(0, 'rgba(255, 255, 255, 0.1)');
    grad.addColorStop(0.3, 'rgba(255, 255, 255, 0.95)');
    grad.addColorStop(0.5, 'rgba(56, 189, 248, 1.0)');
    grad.addColorStop(0.7, 'rgba(37, 99, 235, 1.0)');
    grad.addColorStop(1, 'rgba(255, 255, 255, 0.1)');

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 64);

    this.pulseTexture = new THREE.CanvasTexture(canvas);
    this.pulseTexture.wrapS = THREE.RepeatWrapping;
    this.pulseTexture.wrapT = THREE.RepeatWrapping;
    this.pulseTexture.repeat.set(10, 1);
  }

  public setDarkTheme(isDark: boolean) {
    this.isDarkTheme = isDark;

    if (this.currentTubeMesh) {
      const tubeMat = this.currentTubeMesh.material as THREE.MeshBasicMaterial;
      tubeMat.color.setHex(isDark ? 0x00f5ff : 0x1d4ed8);
      tubeMat.opacity = isDark ? 1.0 : 0.95;
    }

    if (this.glowMesh) {
      const glowMat = this.glowMesh.material as THREE.MeshBasicMaterial;
      glowMat.color.setHex(isDark ? 0x00f5ff : 0x3b82f6);
      glowMat.opacity = isDark ? 0.48 : 0.32;
    }
  }

  public renderRoute(
    pathNodes: NavNode[],
    getNodePosFn?: (node: NavNode) => THREE.Vector3
  ) {
    this.clearRoute();

    if (pathNodes.length < 2) return;

    this.currentPathNodes = [...pathNodes];
    if (getNodePosFn) {
      this.getNodePosFn = getNodePosFn;
    }

    this.buildRouteGeometry();
  }

  public updatePositions() {
    if (this.currentPathNodes.length < 2 || !this.getNodePosFn) return;
    this.buildRouteGeometry();
  }

  private buildRouteGeometry() {
    if (this.currentPathNodes.length < 2) return;

    // Resolve 3D coordinates using dynamic position resolver
    const points = this.currentPathNodes.map(node => {
      if (this.getNodePosFn) {
        const p = this.getNodePosFn(node);
        return new THREE.Vector3(p.x, p.y + 0.5, p.z);
      }
      return new THREE.Vector3(node.position[0], node.position[1] + 0.5, node.position[2]);
    });

    // Keep corridor corners. Smoothing can cut across rooms and atrium voids.
    const curve = new THREE.CurvePath<THREE.Vector3>();
    for (let i = 1; i < points.length; i++) curve.add(new THREE.LineCurve3(points[i - 1], points[i]));

    // Tube radius and glow parameters
    const tubeRadius = 0.45;
    const glowRadius = 0.85;

    // Tube material
    const tubeColorHex = this.isDarkTheme ? 0x00f5ff : 0x1d4ed8;
    const glowColorHex = this.isDarkTheme ? 0x00f5ff : 0x3b82f6;

    if (!this.currentTubeMesh) {
      const tubeGeo = new THREE.TubeGeometry(curve, points.length * 10, tubeRadius, 10, false);
      const tubeMat = new THREE.MeshBasicMaterial({
        map: this.pulseTexture,
        transparent: true,
        opacity: this.isDarkTheme ? 1.0 : 0.95,
        color: tubeColorHex
      });
      this.currentTubeMesh = new THREE.Mesh(tubeGeo, tubeMat);
      this.group.add(this.currentTubeMesh);

      const outerGeo = new THREE.TubeGeometry(curve, points.length * 8, glowRadius, 10, false);
      const outerMat = new THREE.MeshBasicMaterial({
        color: glowColorHex,
        transparent: true,
        opacity: this.isDarkTheme ? 0.48 : 0.32,
        wireframe: false
      });
      this.glowMesh = new THREE.Mesh(outerGeo, outerMat);
      this.group.add(this.glowMesh);
    } else {
      // Refresh existing geometry in place to prevent garbage collection stutter
      this.currentTubeMesh.geometry.dispose();
      this.currentTubeMesh.geometry = new THREE.TubeGeometry(curve, points.length * 10, tubeRadius, 10, false);

      if (this.glowMesh) {
        this.glowMesh.geometry.dispose();
        this.glowMesh.geometry = new THREE.TubeGeometry(curve, points.length * 8, glowRadius, 10, false);
      }
    }

    // Update or create markers
    if (!this.startMarker) {
      this.startMarker = this.createPinMarker(points[0], 0x10b981);
      this.group.add(this.startMarker);
    } else {
      this.startMarker.position.copy(points[0]);
    }

    if (!this.goalMarker) {
      this.goalMarker = this.createPinMarker(points[points.length - 1], 0xf43f5e);
      this.group.add(this.goalMarker);
    } else {
      this.goalMarker.position.copy(points[points.length - 1]);
    }
  }

  private createPinMarker(pos: THREE.Vector3, colorHex: number): THREE.Group {
    const markerGroup = new THREE.Group();
    markerGroup.position.copy(pos);

    // Pin head sphere
    const sphereGeo = new THREE.SphereGeometry(0.75, 16, 16);
    const sphereMat = new THREE.MeshStandardMaterial({
      color: colorHex,
      emissive: colorHex,
      emissiveIntensity: 0.8,
      roughness: 0.2
    });
    const sphere = new THREE.Mesh(sphereGeo, sphereMat);
    sphere.position.y = 2.4;
    markerGroup.add(sphere);

    // Pin needle cone
    const coneGeo = new THREE.ConeGeometry(0.5, 1.8, 16);
    const coneMat = new THREE.MeshStandardMaterial({
      color: colorHex,
      roughness: 0.3
    });
    const cone = new THREE.Mesh(coneGeo, coneMat);
    cone.rotation.x = Math.PI; // point down
    cone.position.y = 1.0;
    markerGroup.add(cone);

    // Ground ripple ring
    const ringGeo = new THREE.RingGeometry(0.8, 1.6, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity: 0.65,
      side: THREE.DoubleSide
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.05;
    markerGroup.add(ring);

    return markerGroup;
  }

  public clearRoute() {
    this.currentPathNodes = [];
    if (this.currentTubeMesh) {
      this.group.remove(this.currentTubeMesh);
      this.currentTubeMesh.geometry.dispose();
      this.currentTubeMesh = null;
    }
    if (this.glowMesh) {
      this.group.remove(this.glowMesh);
      this.glowMesh.geometry.dispose();
      this.glowMesh = null;
    }
    if (this.startMarker) {
      this.group.remove(this.startMarker);
      this.startMarker = null;
    }
    if (this.goalMarker) {
      this.group.remove(this.goalMarker);
      this.goalMarker = null;
    }
  }

  private startAnimation() {
    const loop = () => {
      if (!this.active) return;
      this.animationId = requestAnimationFrame(loop);
      if (this.pulseTexture) {
        // Move pulse along path
        this.pulseTexture.offset.x -= 0.018;
      }
      if (this.startMarker) {
        this.startMarker.rotation.y += 0.02;
      }
      if (this.goalMarker) {
        this.goalMarker.rotation.y += 0.02;
      }
    };
    loop();
  }

  public setActive(active: boolean) {
    if (this.active === active) return;
    this.active = active;
    if (active) this.startAnimation();
    else if (this.animationId !== null) cancelAnimationFrame(this.animationId);
  }

  public dispose() {
    if (this.animationId) cancelAnimationFrame(this.animationId);
    this.clearRoute();
  }
}
