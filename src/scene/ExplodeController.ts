import { BuildingRenderer } from "./BuildingRenderer";

/** Expands only the active building, using stack order rather than floor numbers. */
export class ExplodeController {
  private ratio = 0;
  private buildingId: string | null = null;
  private floor: number | null = null;
  private all = false;
  public onUpdateCallback: (() => void) | null = null;
  constructor(private renderer: BuildingRenderer) {}
  public setLocation(
    buildingId: string | null,
    floor: number | null,
    all: boolean,
  ) {
    this.buildingId = buildingId;
    this.floor = floor;
    this.all = all;
    this.apply();
  }
  public setExplodeRatio(ratio: number) {
    this.ratio = Math.max(0, Math.min(1, ratio));
    this.apply();
  }
  private apply() {
    for (const group of this.renderer.rootGroup.children)
      if (group.userData.type === "building")
        group.visible = group.userData.id === this.buildingId;
    for (const group of this.renderer.floorGroups.values()) {
      group.visible =
        group.userData.buildingId === this.buildingId &&
        (this.all || group.userData.level === this.floor);
      group.position.y =
        Number(group.userData.baseElevation) +
        (this.all ? Number(group.userData.stackIndex) * 9 * this.ratio : 0);
    }
    this.renderer.rootGroup.updateMatrixWorld(true);
    this.onUpdateCallback?.();
  }
}
