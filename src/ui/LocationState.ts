import type { Floor, NavNode } from "../types/campus";
import type { BuildingEntry } from "../data/places";

/** Building and floor are one location; equal floor numbers in different buildings are distinct. */
export class LocationState {
  public buildingId: string | null;
  public floorLevel: number | null = null;
  private remembered = new Map<string, number>();

  constructor(public readonly buildings: BuildingEntry[]) {
    this.buildingId =
      buildings.find((b) => b.data?.floors.length)?.id ??
      buildings[0]?.id ??
      null;
    if (this.buildingId) this.selectBuilding(this.buildingId);
  }
  public get building() {
    return this.buildings.find((b) => b.id === this.buildingId);
  }
  public get floor(): Floor | undefined {
    return this.building?.data?.floors.find((f) => f.level === this.floorLevel);
  }
  public selectBuilding(id: string): boolean {
    const entry = this.buildings.find((b) => b.id === id);
    if (!entry) return false;
    this.buildingId = id;
    const floors = [...(entry.data?.floors ?? [])].sort(
      (a, b) => (a.stackIndex ?? a.level) - (b.stackIndex ?? b.level),
    );
    const remembered = this.remembered.get(id);
    this.floorLevel =
      floors.find((f) => f.level === remembered)?.level ??
      floors.find((f) => f.level === 1)?.level ??
      floors[0]?.level ??
      null;
    if (this.floorLevel !== null) this.remembered.set(id, this.floorLevel);
    return true;
  }
  public selectFloor(level: number): boolean {
    if (!this.building?.data?.floors.some((f) => f.level === level))
      return false;
    this.floorLevel = level;
    this.remembered.set(this.buildingId!, level);
    return true;
  }
  public focusNode(node: NavNode): boolean {
    if (!node.buildingId || node.floor === undefined || !this.selectBuilding(node.buildingId)) return false;
    return this.selectFloor(node.floor);
  }
}
