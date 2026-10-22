import type { Building, CampusData, DisplayScope, Floor, NavNode, Point2 } from "../types/campus";
import { localToWorld } from "./geometry.js";

export interface DisplayFloor { building: Building; floor: Floor; }
export function displayFloors(data: CampusData, scope: DisplayScope): DisplayFloor[] {
  return scope.floors.flatMap(ref => {
    const building = data.buildings.find(b => b.id === ref.buildingId);
    const floor = building?.floors.find(f => f.id === ref.floorId);
    return building && floor ? [{ building, floor }] : [];
  });
}
export const soloScope = (building: Building | undefined, floor: Floor | undefined): DisplayScope => ({
  key: building?.id ?? "empty", label: building?.name ?? "建物",
  buildingIds: building ? [building.id] : [],
  floors: building && floor ? [{ buildingId: building.id, floorId: floor.id }] : [],
});
export function displayPoint(building: Building, point: Point2, grouped: boolean): Point2 {
  if (!grouped) return point;
  const p = localToWorld(building, point, 0);
  return [p[0], p[2]];
}
export function nodeInScope(data: CampusData, scope: DisplayScope, node: NavNode) {
  return displayFloors(data, scope).some(({ building, floor }) => building.id === node.buildingId && floor.level === node.floor);
}
