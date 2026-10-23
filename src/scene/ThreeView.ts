import * as THREE from "three";
import type { CampusData, DisplayScope, NavNode, RouteResult, RouteStep } from "../types/campus";
import type { ScreenPoint } from "../ui/SelectionPopover";
import type { SceneHost } from "./SceneManager";
import { SceneManager } from "./SceneManager";
import { BuildingRenderer } from "./BuildingRenderer";
import { ExplodeController } from "./ExplodeController";
import { RouteRenderer } from "./RouteRenderer";
import { RaycastPicker } from "./RaycastPicker";

/** Loaded only when selected; the default SVG map never needs WebGL. */
export class ThreeView {
  private scene: SceneHost;
  private buildings: BuildingRenderer;
  private routes: RouteRenderer[] = [];
  private result: RouteResult | null = null;
  private buildingId: string | null = null;
  private floor: number | null = null;
  private all = false;
  private active = true;
  private dark = false;
  private scope?: DisplayScope;
  private connections = new THREE.Group();
  public explode: ExplodeController;
  public picker: RaycastPicker;
  public onViewChange: (() => void) | null = null;
  public onPlaceSelect: ((id: string) => void) | null = null;
  constructor(
    private data: CampusData,
    container: HTMLElement,
    scene?: SceneHost,
  ) {
    this.scene = scene ?? new SceneManager(container);
    this.scene.onFrame = () => this.onViewChange?.();
    this.buildings = new BuildingRenderer(data);
    this.scene.scene.add(this.buildings.rootGroup);
    this.connections.userData.type = "building-connections";
    this.scene.scene.add(this.connections);
    this.explode = new ExplodeController(this.buildings);
    this.explode.onUpdateCallback = () => {
      this.routes.forEach((r) => r.updatePositions());
      this.renderConnections();
      this.onViewChange?.();
    };
    this.picker = new RaycastPicker(
      this.scene.camera,
      this.scene.renderer.domElement,
      this.buildings,
    );
    this.picker.onPlaceSelect = (id) => this.onPlaceSelect?.(id);
  }
  public setLocation(
    buildingId: string | null,
    floor: number | null,
    all: boolean,
    scope?: DisplayScope,
  ) {
    const changed =
      this.buildingId !== buildingId ||
      this.floor !== floor ||
      this.all !== all || JSON.stringify(this.scope) !== JSON.stringify(scope);
    this.buildingId = buildingId;
    this.floor = floor;
    this.all = all;
    this.scope = scope;
    this.explode.setLocation(buildingId, floor, all, scope);
    if (changed) {
      this.renderRoute(this.result);
    }
  }
  public setActive(active: boolean) {
    this.active = active;
    this.scene.setActive(active);
    this.routes.forEach((r) => r.setActive(active));
  }
  public setTheme(dark: boolean) {
    this.dark = dark;
    this.scene.setDarkTheme(dark);
    this.buildings.setDarkTheme(dark);
    this.renderConnections();
    this.routes.forEach((r) => r.setDarkTheme(dark));
  }
  public renderRoute(result: RouteResult | null) {
    this.result = result;
    this.routes.forEach((r) => r.dispose());
    this.routes = [];
    let segment: RouteResult["pathNodes"] = [];
    const flush = () => {
      if (segment.length) {
        const renderer = new RouteRenderer(this.scene.scene);
        renderer.setDarkTheme(this.dark);
        renderer.setActive(this.active);
        renderer.renderRoute(
          segment,
          (node) => this.buildings.getNodeWorldPosition(node),
          { startId: result!.pathNodes[0].id, goalId: result!.pathNodes.at(-1)!.id },
        );
        this.routes.push(renderer);
      }
      segment = [];
    };
    for (const node of result?.pathNodes ?? []) {
      if (this.nodeVisible(node))
        segment.push(node);
      else flush();
    }
    flush();
  }
  private nodeVisible(node: NavNode) {
    const group = this.buildings.floorGroups.get(`${node.buildingId}_f${node.floor}`);
    return !!group?.visible && !!group.parent?.visible;
  }
  private renderConnections() {
    for (const object of [...this.connections.children]) {
      if (object instanceof THREE.Line || object instanceof THREE.Mesh) { object.geometry.dispose(); (object.material as THREE.Material).dispose(); }
      this.connections.remove(object);
    }
    const nodes = new Map(this.data.navigation.nodes.map(n => [n.id, n]));
    for (const edge of this.data.navigation.edges) {
      const a = nodes.get(edge.from)!, b = nodes.get(edge.to)!;
      if (edge.blocked || !a.buildingId || !b.buildingId || a.buildingId === b.buildingId ||
        !this.nodeVisible(a) || !this.nodeVisible(b)) continue;
      if (edge.passageWidth !== undefined) {
        const p = this.buildings.getNodeWorldPosition(a), q = this.buildings.getNodeWorldPosition(b);
        const dx = q.x - p.x, dz = q.z - p.z, length = Math.hypot(dx, dz);
        if (length < 1e-7) continue;
        const nx = -dz / length * edge.passageWidth / 2, nz = dx / length * edge.passageWidth / 2;
        const vertices = [p.x+nx,p.y,p.z+nz, q.x+nx,q.y,q.z+nz, q.x-nx,q.y,q.z-nz, p.x-nx,p.y,p.z-nz];
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
        geometry.setIndex([0, 2, 1, 0, 3, 2]); geometry.computeVertexNormals();
        const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({color: this.dark ? 0x354357 : 0xdde3eb, side: THREE.DoubleSide}));
        mesh.userData.passage = true; mesh.userData.cover = edge.cover;
        this.connections.add(mesh); continue;
      }
      const geometry = new THREE.BufferGeometry().setFromPoints([a, b].map(n => this.buildings.getNodeWorldPosition(n).add(new THREE.Vector3(0, .2, 0))));
      this.connections.add(new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0x8a99af })));
    }
  }
  public getPlaceAnchor(id: string): ScreenPoint | null {
    const mesh = this.buildings.placeMeshes.find(
      (m) => m.userData.placeId === id,
    );
    if (!mesh) return null;
    for (let parent: THREE.Object3D | null = mesh; parent; parent = parent.parent)
      if (!parent.visible) return null;
    mesh.updateWorldMatrix(true, false);
    const box = new THREE.Box3().setFromObject(mesh);
    const point = mesh.userData.labelAnchor
      ? mesh.localToWorld(new THREE.Vector3().fromArray(mesh.userData.labelAnchor))
      : box.getCenter(new THREE.Vector3()).setY(box.max.y);
    this.scene.camera.updateMatrixWorld();
    point.project(this.scene.camera);
    if (
      point.z < -1 || point.z > 1 ||
      Math.abs(point.x) > 1 || Math.abs(point.y) > 1
    ) return null;
    const rect = this.scene.renderer.domElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return {
      x: rect.left + (point.x + 1) * rect.width / 2,
      y: rect.top + (1 - point.y) * rect.height / 2,
    };
  }
  public selectPlace(id: string | null) {
    this.buildings.highlightPlace(id);
  }
  public focusStep(step: RouteStep) {
    const node = this.data.navigation.nodes.find((n) => n.id === step.nodeId);
    if (node) {
      const point = this.buildings.getNodeWorldPosition(node);
      this.scene.flyTo(
        point,
        point.clone().add(new THREE.Vector3(36, 42, 42)),
        500,
      );
    }
  }
  public reset() {
    this.scene.resize();
    const box = new THREE.Box3();
    for (const group of this.buildings.floorGroups.values())
      if (group.visible && group.parent?.visible)
        box.union(new THREE.Box3().setFromObject(group));
    if (box.isEmpty()) return;
    const center = box.getCenter(new THREE.Vector3()),
      size = box.getSize(new THREE.Vector3());
    const angle = (this.scene.camera.fov * Math.PI) / 360,
      fit =
        (Math.max(
          size.y,
          size.x / Math.max(this.scene.camera.aspect, 0.3),
          size.z,
        ) /
          Math.tan(angle)) *
        0.8;
    this.scene.controls.maxDistance = Math.max(450, fit * 3);
    this.scene.camera.far = Math.max(1500, fit * 6);
    this.scene.camera.updateProjectionMatrix();
    this.scene.flyTo(
      center,
      center.clone().add(new THREE.Vector3(fit * 0.55, fit * 0.7, fit * 0.65)),
      500,
    );
  }
}
