import * as THREE from "three";
import type { BuildingRenderer } from "./BuildingRenderer";

/** A click is one primary pointer without a drag or multi-touch gesture. */
export class RaycastPicker {
  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();
  private pointers = new Set<number>();
  private gesture: { id: number; x: number; y: number; moved: boolean } | null =
    null;
  public onPlaceSelect: ((id: string) => void) | null = null;
  public onBackgroundClick: (() => void) | null = null;
  constructor(
    private camera: THREE.Camera,
    private element: HTMLElement,
    private renderer: BuildingRenderer,
  ) {
    element.addEventListener("pointerdown", (event) => {
      const id = event.pointerId ?? 0;
      this.pointers.add(id);
      if (this.pointers.size > 1) {
        this.gesture = null;
        return;
      }
      if (event.button !== undefined && event.button !== 0) return;
      this.gesture = { id, x: event.clientX, y: event.clientY, moved: false };
    });
    element.addEventListener("pointermove", (event) => {
      if (
        this.gesture &&
        (event.pointerId ?? 0) === this.gesture.id &&
        Math.hypot(
          event.clientX - this.gesture.x,
          event.clientY - this.gesture.y,
        ) > 6
      )
        this.gesture.moved = true;
      element.style.cursor = this.hit(event.clientX, event.clientY)
        ? "pointer"
        : "default";
    });
    element.addEventListener("pointercancel", (event) => {
      this.pointers.delete(event.pointerId ?? 0);
      this.gesture = null;
    });
    element.addEventListener("pointerup", (event) => {
      const id = event.pointerId ?? 0,
        gesture = this.gesture;
      this.pointers.delete(id);
      this.gesture = null;
      if (
        !gesture ||
        gesture.id !== id ||
        gesture.moved ||
        this.pointers.size ||
        Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 6
      )
        return;
      const hit = this.hit(event.clientX, event.clientY);
      if (hit) this.onPlaceSelect?.(hit.userData.placeId);
      else this.onBackgroundClick?.();
    });
  }
  private hit(x: number, y: number): THREE.Object3D | null {
    const rect = this.element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    this.mouse.set(
      ((x - rect.left) / rect.width) * 2 - 1,
      (-(y - rect.top) / rect.height) * 2 + 1,
    );
    this.camera.updateMatrixWorld(true);
    this.renderer.rootGroup.updateMatrixWorld(true);
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const meshes = this.renderer.placeMeshes.filter((mesh) => {
      for (
        let parent: THREE.Object3D | null = mesh;
        parent;
        parent = parent.parent
      )
        if (!parent.visible) return false;
      return true;
    });
    return this.raycaster.intersectObjects(meshes, false)[0]?.object ?? null;
  }
}
