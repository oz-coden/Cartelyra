import * as THREE from 'three';
import type { CampusData, Room, RouteResult, RouteStep } from '../types/campus';
import { SceneManager } from './SceneManager';
import { BuildingRenderer } from './BuildingRenderer';
import { ExplodeController } from './ExplodeController';
import { RouteRenderer } from './RouteRenderer';
import { RaycastPicker } from './RaycastPicker';

/** Loaded only when the visitor selects 3D; the default SVG map never needs WebGL. */
export class ThreeView {
  private scene: SceneManager;
  private buildings: BuildingRenderer;
  private routes: RouteRenderer;
  public explode: ExplodeController;
  public picker: RaycastPicker;

  constructor(data: CampusData, container: HTMLElement) {
    this.scene = new SceneManager(container);
    this.buildings = new BuildingRenderer(data); this.scene.scene.add(this.buildings.rootGroup);
    this.routes = new RouteRenderer(this.scene.scene);
    this.explode = new ExplodeController(this.buildings);
    this.explode.onUpdateCallback = () => this.routes.updatePositions();
    this.picker = new RaycastPicker(this.scene.camera, this.scene.renderer.domElement, this.buildings);
  }
  public setActive(active: boolean) { this.scene.setActive(active); this.routes.setActive(active); }
  public setTheme(dark: boolean) { this.scene.setDarkTheme(dark); this.buildings.setDarkTheme(dark); this.routes.setDarkTheme(dark); }
  public renderRoute(result: RouteResult | null) {
    if (result) this.routes.renderRoute(result.pathNodes, node => this.buildings.getNodeWorldPosition(node)); else this.routes.clearRoute();
  }
  public focusRoom(room: Room) {
    this.buildings.highlightRoom(room.id);
    const position = this.buildings.getRoomPosition(room.id); if (position) this.flyTo(position);
  }
  public focusStep(step: RouteStep) { this.flyTo(new THREE.Vector3(step.position[0], step.position[1] + 2, step.position[2])); }
  public reset() { this.scene.resetCamera(); }
  private flyTo(position: THREE.Vector3) { this.scene.flyTo(position, position.clone().add(new THREE.Vector3(36, 42, 42)), 700); }
}
