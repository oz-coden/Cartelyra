import type { CampusData, NavEdge, NavNode, RouteFilterType, WeatherCover } from "../types/campus";

export const edgeCover = (edge: NavEdge): WeatherCover =>
  edge.cover ?? (edge.isIndoor ? "indoor" : "open");

export interface Traversal {
  edge: NavEdge;
  reversed: boolean;
  targetId: string;
  length: number;
  floorChanges: number;
  unmeasuredVertical: number;
  boundaryChanges: number;
  fromLevel?: number;
  toLevel?: number;
}
export interface SearchCost { vertical: number; floorDetours: number; boundaries: number; cost: number; }

/** Routing preferences use authored costs; drawing transforms cannot change reference routes. */
export class RoutePolicy {
  private indices = new Map<string, number>();
  private domains = new Map<string, string>();
  readonly schematic: boolean;
  constructor(data: CampusData) {
    this.schematic = data.coordinateUnit === "schematic";
    for (const b of data.buildings) {
      this.domains.set(b.id, b.id);
      for (const f of b.floors) this.indices.set(`${b.id}/${f.level}`, f.stackIndex ?? f.level);
    }
    for (const group of data.viewGroups ?? []) if (group.status === "ready")
      for (const id of group.buildingIds) this.domains.set(id, `group/${group.id}`);
  }
  domain(node: NavNode) { return node.buildingId ? this.domains.get(node.buildingId) ?? node.buildingId : undefined; }
  traversal(edge: NavEdge, a: NavNode, b: NavNode): Traversal {
    const length = this.schematic
      ? edge.routingCost ?? edge.distance ?? 1
      : edge.distance ?? Math.hypot(...a.position.map((p, i) => p - b.position[i]));
    if (!Number.isFinite(length) || length < 0) throw new Error(`Invalid edge distance/cost: ${edge.from}`);
    if (edge.floorChanges !== undefined && (!Number.isInteger(edge.floorChanges) || edge.floorChanges < 0))
      throw new Error(`Invalid explicit floor changes: ${edge.from}`);
    const aIndex = this.indices.get(`${a.buildingId}/${a.floor}`);
    const bIndex = this.indices.get(`${b.buildingId}/${b.floor}`);
    const vertical = edge.type === "stairs" || edge.type === "ramp" || edge.type === "elevator";
    // A stair drawn within one display floor can reach an unnumbered landing.
    const known = edge.floorChanges ?? (a.buildingId && a.buildingId === b.buildingId && aIndex !== undefined && bIndex !== undefined &&
      (!vertical || aIndex !== bIndex) ? Math.abs(aIndex - bIndex) : undefined);
    return { edge, targetId: b.id, reversed: false, length,
      floorChanges: known ?? 0, unmeasuredVertical: vertical && known === undefined ? 1 : 0,
      fromLevel: aIndex, toLevel: bIndex,
      boundaryChanges: this.domain(a) !== this.domain(b) ? 1 : 0 };
  }
  permitted(edge: NavEdge, filter: RouteFilterType, allowInferred: boolean) {
    return !edge.blocked && (allowInferred || edge.verification === "verified") &&
      (filter !== "accessible" || edge.isAccessible && edge.type !== "stairs");
  }
  cost(link: Traversal, filter: RouteFilterType) {
    let cost = link.length;
    if (filter === "indoor") {
      const cover = edgeCover(link.edge);
      cost *= cover === "indoor" ? 1 : cover === "covered" ? 1.4 : 4.5;
    }
    if (filter === "stairs" && link.edge.type === "elevator") cost += 35;
    return cost;
  }
  floorDetourCounter(start: NavNode, goal: NavNode) {
    if (!this.schematic || start.buildingId === goal.buildingId || this.domain(start) !== this.domain(goal)) return () => 0;
    const a = this.indices.get(`${start.buildingId}/${start.floor}`);
    const b = this.indices.get(`${goal.buildingId}/${goal.floor}`);
    if (a === undefined || b === undefined) return () => 0;
    const direction = b < a ? -1 : 1, low = Math.min(a, b), high = Math.max(a, b);
    const progress = (level: number) => direction * Math.max(low, Math.min(high, level));
    return (link: Traversal) => {
      if (!link.floorChanges || link.fromLevel === undefined || link.toLevel === undefined) return 0;
      const from = link.reversed ? link.toLevel : link.fromLevel, to = link.reversed ? link.fromLevel : link.toLevel;
      // Penalize known backtracking and overshoots, not necessary progress or unmeasured landings.
      return Math.max(0, link.floorChanges - (progress(to) - progress(from)));
    };
  }
  comparator(start: NavNode, goal: NavNode) {
    // Keep local guidance stable; connected wings may use shorter outdoor stair approaches.
    const within = !!this.domain(start) && this.domain(start) === this.domain(goal);
    const sameBuilding = !!start.buildingId && start.buildingId === goal.buildingId;
    return (a: SearchCost, b: SearchCost) =>
      this.schematic && sameBuilding && a.vertical !== b.vertical ? a.vertical - b.vertical :
      this.schematic && sameBuilding && a.boundaries !== b.boundaries ? a.boundaries - b.boundaries :
      this.schematic && within && !sameBuilding && a.floorDetours !== b.floorDetours ? a.floorDetours - b.floorDetours : a.cost - b.cost;
  }
}
