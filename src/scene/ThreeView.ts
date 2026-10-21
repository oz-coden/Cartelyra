import * as THREE from "three";
import type { CampusData, RouteResult, RouteStep } from "../types/campus";
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
    this.explode = new ExplodeController(this.buildings);
    this.explode.onUpdateCallback = () => {
      this.routes.forEach((r) => r.updatePositions());
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
  ) {
    const changed =
      this.buildingId !== buildingId ||
      this.floor !== floor ||
      this.all !== all;
    this.buildingId = buildingId;
    this.floor = floor;
    this.all = all;
    this.explode.setLocation(buildingId, floor, all);
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
    this.routes.forEach((r) => r.setDarkTheme(dark));
  }
  public renderRoute(result: RouteResult | null) {
    this.result = result;
    this.routes.forEach((r) => r.dispose());
    this.routes = [];
    let segment: RouteResult["pathNodes"] = [];
    const flush = () => {
      if (segment.length > 1) {
        const renderer = new RouteRenderer(this.scene.scene);
        renderer.setDarkTheme(this.dark);
        renderer.setActive(this.active);
        renderer.renderRoute(segment, (node) =>
          this.buildings.getNodeWorldPosition(node),
        );
        this.routes.push(renderer);
      }
      segment = [];
    };
    for (const node of result?.pathNodes ?? []) {
      if (
        node.buildingId === this.buildingId &&
        (this.all || node.floor === this.floor)
      )
        segment.push(node);
      else flush();
    }
    flush();
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
    const point = box.getCenter(new THREE.Vector3());
    point.y = box.max.y;
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
    const building = this.data.buildings.find((b) => b.id === this.buildingId);
    if (!building) return;
    const box = new THREE.Box3();
    for (const group of this.buildings.floorGroups.values())
      if (group.visible && group.userData.buildingId === building.id)
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
