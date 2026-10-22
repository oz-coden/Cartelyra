import type { BuildingViewGroup, DisplayScope, Floor, NavNode } from "../types/campus";
import type { BuildingEntry } from "../data/places";

/** Building and floor are one location; equal floor numbers in different buildings are distinct. */
export class LocationState {
  public buildingId: string | null;
  public floorLevel: number | null = null;
  private remembered = new Map<string, number>();
  public grouped = true;

  constructor(public readonly buildings: BuildingEntry[], public readonly groups: BuildingViewGroup[] = []) {
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
  public get declaredGroup() { return this.groups.find(g => g.buildingIds.includes(this.buildingId ?? "")); }
  public get group() { return this.grouped && this.declaredGroup?.status === "ready" ? this.declaredGroup : undefined; }
  public get groupLevel() {
    return this.group?.levels.find(l => l.floors.some(f => f.buildingId === this.buildingId && f.floorId === this.floor?.id));
  }
  public get scope(): DisplayScope {
    const group = this.group, level = this.groupLevel;
    return group && level ? { key: group.id, label: group.name, buildingIds: group.buildingIds,
      floors: level.floors, group, levelId: level.id } : {
      key: this.buildingId ?? "empty", label: this.building?.name ?? "建物", buildingIds: this.buildingId ? [this.buildingId] : [],
      floors: this.buildingId && this.floor ? [{ buildingId: this.buildingId, floorId: this.floor.id }] : [],
    };
  }
  public selectGroupLevel(id: string): boolean {
    const level = this.group?.levels.find(l => l.id === id);
    const ref = level?.floors.find(f => f.buildingId === this.buildingId) ?? level?.floors[0];
    if (!ref) return false;
    const floor = this.buildings.find(b => b.id === ref.buildingId)?.data?.floors.find(f => f.id === ref.floorId);
    if (!floor || !this.selectBuilding(ref.buildingId)) return false;
    return this.selectFloor(floor.level);
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
