import type {
  CampusData,
  NavNode,
  NavEdge,
  RouteFilterType,
  RouteResult,
  RouteStep,
} from "../types/campus";

interface GraphEdge {
  targetId: string;
  distance: number;
  edge: NavEdge;
  reversed: boolean;
  floorChanges: number;
}

/** Exact non-negative cost search. h=0 remains valid even with explicit distances and preference costs. */
export class AStarPathfinder {
  private nodes = new Map<string, NavNode>();
  private adjacency = new Map<string, GraphEdge[]>();

  constructor(private data: CampusData) {
    const floorIndices = new Map<string, number>(data.buildings.flatMap(b => b.floors.map(f =>
      [`${b.id}/${f.level}`, f.stackIndex ?? f.level] as const)));
    for (const node of data.navigation.nodes) {
      if (this.nodes.has(node.id))
        throw new Error(`Duplicate navigation node: ${node.id}`);
      this.nodes.set(node.id, node);
      this.adjacency.set(node.id, []);
    }
    for (const edge of data.navigation.edges) {
      const a = this.nodes.get(edge.from),
        b = this.nodes.get(edge.to);
      if (!a || !b)
        throw new Error(`Unknown edge endpoint: ${edge.from} -> ${edge.to}`);
      const distance =
        edge.distance ??
        Math.hypot(...a.position.map((p, i) => p - b.position[i]));
      if (!Number.isFinite(distance) || distance < 0)
        throw new Error(`Invalid edge distance: ${edge.from}`);
      if (edge.blocked) continue;
      const floorChanges = a.buildingId && a.buildingId === b.buildingId
        ? Math.abs((floorIndices.get(`${a.buildingId}/${a.floor}`) ?? a.floor ?? 0) -
          (floorIndices.get(`${b.buildingId}/${b.floor}`) ?? b.floor ?? 0)) : 0;
      this.adjacency
        .get(a.id)!
        .push({ targetId: b.id, distance, edge, reversed: false, floorChanges });
      if (edge.bidirectional !== false)
        this.adjacency
          .get(b.id)!
          .push({ targetId: a.id, distance, edge, reversed: true, floorChanges });
    }
  }

  public getNode(id: string) {
    return this.nodes.get(id);
  }
  public getAllNodes() {
    return [...this.nodes.values()];
  }

  public findPath(
    startId: string,
    goalId: string,
    filter: RouteFilterType = "shortest",
    allowInferred = true,
  ): RouteResult | null {
    if (!this.nodes.has(startId) || !this.nodes.has(goalId)) return null;
    const open = new Set([startId]),
      costs = new Map([[startId, 0]]);
    // Drawing lengths are not calibrated distances. Prefer fewer floor changes
    // before comparing schematic lengths; measured maps retain distance costs.
    const preferFloors = this.data.coordinateUnit === "schematic";
    const changes = new Map([[startId, 0]]);
    const precedes = (aChanges: number, aCost: number, bChanges: number, bCost: number) =>
      (preferFloors && aChanges !== bChanges) ? aChanges < bChanges : aCost < bCost;
    const previous = new Map<string, { from: string; link: GraphEdge }>();
    while (open.size) {
      const current = [...open].reduce((a, b) =>
        precedes(changes.get(b)!, costs.get(b)!, changes.get(a)!, costs.get(a)!) ? b : a,
      );
      open.delete(current);
      if (current === goalId)
        return this.reconstruct(startId, goalId, previous);
      for (const link of this.adjacency.get(current)!) {
        const edge = link.edge;
        if (!allowInferred && edge.verification !== "verified") continue;
        if (
          filter === "accessible" &&
          (!edge.isAccessible || edge.type === "stairs")
        )
          continue;
        // Within the floor-change preference, shortest has no facility penalties.
        let cost = link.distance;
        if (filter === "indoor" && !edge.isIndoor) cost *= 4.5;
        if (filter === "stairs" && edge.type === "elevator") cost += 35;
        const nextCost = costs.get(current)! + cost;
        const nextChanges = changes.get(current)! + link.floorChanges;
        if (precedes(nextChanges, nextCost, changes.get(link.targetId) ?? Infinity,
          costs.get(link.targetId) ?? Infinity)) {
          costs.set(link.targetId, nextCost);
          changes.set(link.targetId, nextChanges);
          previous.set(link.targetId, { from: current, link });
          open.add(link.targetId);
        }
      }
    }
    return null;
  }

  private floorInfo(node: NavNode) {
    return this.data.buildings
      .find((b) => b.id === node.buildingId)
      ?.floors.find((f) => f.level === node.floor);
  }

  private reconstruct(
    start: string,
    goal: string,
    previous: Map<string, { from: string; link: GraphEdge }>,
  ): RouteResult {
    const pathNodes = [this.nodes.get(goal)!],
      links: GraphEdge[] = [];
    let id = goal;
    while (id !== start) {
      const p = previous.get(id)!;
      links.unshift(p.link);
      id = p.from;
      pathNodes.unshift(this.nodes.get(id)!);
    }
    let floorChanges = 0;
    for (let i = 1; i < pathNodes.length; i++) {
      const a = this.floorInfo(pathNodes[i - 1]),
        b = this.floorInfo(pathNodes[i]);
      if (a && b && pathNodes[i - 1].buildingId === pathNodes[i].buildingId)
        floorChanges += Math.abs(
          (a.stackIndex ?? a.level) - (b.stackIndex ?? b.level),
        );
    }
    const totalDistance = links.reduce((sum, link) => sum + link.distance, 0);
    const distanceUnit = this.data.coordinateUnit ?? "meters";
    const steps: RouteStep[] = [
      {
        stepNumber: 1,
        instruction: `「${pathNodes[0].name}」から出発`,
        nodeId: start,
        position: pathNodes[0].position,
        floor: pathNodes[0].floor,
        buildingId: pathNodes[0].buildingId,
        distance: 0,
      },
    ];
    links.forEach((link, i) => {
      const to = pathNodes[i + 1];
      const floor = `${this.data.buildings.find((b) => b.id === to.buildingId)?.name ?? ""} ${this.floorInfo(to)?.label ?? String(to.floor)}`;
      let instruction = link.reversed
        ? link.edge.reverseInstruction
        : link.edge.instruction;
      if (!instruction) {
        if (pathNodes[i].buildingId && !to.buildingId)
          instruction = `「${pathNodes[i].name}」から屋外へ出る`;
        else if (!pathNodes[i].buildingId && to.buildingId)
          instruction = `${floor} の「${to.name}」から建物に入る`;
        else if (pathNodes[i].buildingId !== to.buildingId)
          instruction = `${floor} の「${to.name}」へ移動`;
        else if (link.edge.type === "stairs" || link.edge.type === "elevator") {
          instruction = `${link.edge.type === "stairs" ? "階段" : "EV"}で ${floor} へ移動`;
        } else if (i === links.length - 1) instruction = `「${to.name}」に到着`;
        else instruction = `${to.name} へ進む`;
      }
      steps.push({
        stepNumber: i + 2,
        instruction,
        nodeId: to.id,
        position: to.position,
        floor: to.floor,
        buildingId: to.buildingId,
        edgeType: link.edge.type,
        distance:
          distanceUnit === "meters" ? Math.round(link.distance * 10) / 10 : 0,
      });
    });
    if (!links.length)
      steps[0].instruction = `「${pathNodes[0].name}」に到着しています`;
    return {
      pathNodes,
      totalDistance: Math.round(totalDistance * 10) / 10,
      estimatedMinutes:
        distanceUnit === "meters" && links.length
          ? Math.round((totalDistance / 80 + floorChanges * 0.5) * 10) / 10
          : 0,
      floorChanges,
      steps,
      distanceUnit,
      inferredConnections: links.filter(
        (l) => l.edge.verification !== "verified",
      ).length,
    };
  }
}
