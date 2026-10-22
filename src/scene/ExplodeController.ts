import { BuildingRenderer } from "./BuildingRenderer";
import type { DisplayScope } from "../types/campus";

/** Expands the display scope using common group levels or the individual building's stack order. */
export class ExplodeController {
  private ratio = 0;
  private buildingId: string | null = null;
  private floor: number | null = null;
  private all = false;
  private scope?: DisplayScope;
  public onUpdateCallback: (() => void) | null = null;
  constructor(private renderer: BuildingRenderer) {}
  public setLocation(
    buildingId: string | null,
    floor: number | null,
    all: boolean,
    scope?: DisplayScope,
  ) {
    this.buildingId = buildingId;
    this.floor = floor;
    this.all = all;
    this.scope = scope;
    this.apply();
  }
  public setExplodeRatio(ratio: number) {
    this.ratio = Math.max(0, Math.min(1, ratio));
    this.apply();
  }
  private apply() {
    const ids = this.scope?.buildingIds ?? (this.buildingId ? [this.buildingId] : []);
    for (const group of this.renderer.rootGroup.children)
      if (group.userData.type === "building")
        group.visible = ids.includes(group.userData.id);
    for (const group of this.renderer.floorGroups.values()) {
      const ref = this.scope?.floors.some(f => f.buildingId === group.userData.buildingId &&
        group.userData.floorId === f.floorId);
      group.visible =
        ids.includes(group.userData.buildingId) &&
        (this.all || (this.scope ? !!ref : group.userData.level === this.floor));
      const commonIndex = this.scope?.group?.levels.findIndex(l => l.floors.some(f =>
        f.buildingId === group.userData.buildingId && group.userData.floorId === f.floorId));
      group.position.y =
        Number(group.userData.baseElevation) +
        (this.all ? (commonIndex !== undefined && commonIndex >= 0 ? commonIndex : Number(group.userData.stackIndex)) * 9 * this.ratio : 0);
    }
    this.renderer.rootGroup.updateMatrixWorld(true);
    this.onUpdateCallback?.();
  }
}
