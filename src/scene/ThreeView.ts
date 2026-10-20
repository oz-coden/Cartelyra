import * as THREE from "three";
import type {
  CampusData,
  Place,
  RouteResult,
  RouteStep,
} from "../types/campus";
import { localToWorld } from "../data/geometry";
import { SceneManager } from "./SceneManager";
import { BuildingRenderer } from "./BuildingRenderer";
import { ExplodeController } from "./ExplodeController";
import { RouteRenderer } from "./RouteRenderer";
import { RaycastPicker } from "./RaycastPicker";

/** Loaded only when selected; the default SVG map never needs WebGL. */
export class ThreeView {
  private scene: SceneManager;
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
  public onPlaceSelect: ((id: string) => void) | null = null;
  constructor(
    private data: CampusData,
    container: HTMLElement,
  ) {
    this.scene = new SceneManager(container);
    this.buildings = new BuildingRenderer(data);
    this.scene.scene.add(this.buildings.rootGroup);
    this.explode = new ExplodeController(this.buildings);
    this.explode.onUpdateCallback = () =>
      this.routes.forEach((r) => r.updatePositions());
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
      this.reset();
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
  public focusPlace(place: Place) {
    this.buildings.highlightRoom(place.roomId ?? null);
    const building = this.data.buildings.find((b) => b.id === place.buildingId),
      floor = building?.floors.find((f) => f.level === place.floorLevel);
    if (building && floor) {
      const point = localToWorld(building, place.position, floor.elevation);
      const group = this.buildings.floorGroups.get(
        `${building.id}_f${floor.level}`,
      );
      point[1] += (group?.position.y ?? floor.elevation) - floor.elevation;
      this.flyTo(new THREE.Vector3(...point));
    }
  }
  public focusStep(step: RouteStep) {
    const node = this.data.navigation.nodes.find((n) => n.id === step.nodeId);
    if (node) this.flyTo(this.buildings.getNodeWorldPosition(node));
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
  private flyTo(point: THREE.Vector3) {
    this.scene.flyTo(
      point,
      point.clone().add(new THREE.Vector3(36, 42, 42)),
      500,
    );
  }
}
