import type { CampusData, NavEdge, Point2, RouteFilterType } from "../types/campus";
import type { FloorSource } from "./schema";
import { polygonArea, polygonOverlapArea, segmentIntersections } from "./geometry.js";
import { placeIndex } from "./places.js";
import { AStarPathfinder } from "../pathfinding/AStar.js";

export interface AuditFinding {
  code: "room-contained" | "room-overlap" | "room-coincident" | "unjoined-junction" |
    "floor-components" | "route-unreachable" | "route-floor-detour";
  buildingId: string;
  floorId?: string;
  roomIds?: string[];
  nodeIds?: string[];
  position?: Point2;
  detail: string;
}

/** Review candidates only: containment, overlaps and missing links can be intentional. */
export function auditGeometry(floors: FloorSource[]): AuditFinding[] {
  const findings: AuditFinding[] = [];
  for (const floor of floors) {
    const context = { buildingId: floor.buildingId, floorId: floor.id };
    for (let i = 0; i < floor.rooms.length; i++) for (let j = i + 1; j < floor.rooms.length; j++) {
      const a = floor.rooms[i], b = floor.rooms[j];
      const overlap = polygonOverlapArea(a.polygon, b.polygon);
      const aArea = polygonArea(a.polygon), bArea = polygonArea(b.polygon);
      const tolerance = Math.max(1e-8, Math.min(aArea, bArea) * 1e-8);
      if (overlap <= tolerance) continue;
      const containsA = Math.abs(overlap - aArea) <= tolerance;
      const containsB = Math.abs(overlap - bArea) <= tolerance;
      findings.push({ ...context, roomIds: [a.id, b.id],
        code: containsA && containsB ? "room-coincident" : containsA || containsB ? "room-contained" : "room-overlap",
        detail: containsA && containsB ? `${a.id} and ${b.id} have coincident footprints.`
          : containsA ? `${a.id} is contained in ${b.id}; confirm the intended room and approach relationship.`
          : containsB ? `${b.id} is contained in ${a.id}; confirm the intended room and approach relationship.`
          : `${a.id} and ${b.id} overlap; confirm the intended partition.`,
      });
    }
    const nodes = new Map(floor.navigation.nodes.map(n => [n.id, n]));
    const edges = floor.navigation.edges.filter(e => !e.blocked && e.type === "walk");
    // Different IDs at one position may be joined by an explicit zero-length approach.
    const equivalents = new Map([...nodes.keys()].map(id => [id, id]));
    const root = (id: string): string => {
      let next = id;
      while (equivalents.get(next) !== next) next = equivalents.get(next)!;
      return next;
    };
    for (const edge of edges) {
      const a = nodes.get(edge.from)!, b = nodes.get(edge.to)!;
      if (Math.hypot(a.position[0] - b.position[0], a.position[1] - b.position[1]) < 1e-8)
        equivalents.set(root(a.id), root(b.id));
    }
    const junctions = new Map<string, AuditFinding>();
    const near = (a: Point2, b: Point2) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-7;
    for (let i = 0; i < edges.length; i++) for (let j = i + 1; j < edges.length; j++) {
      const a = edges[i], b = edges[j];
      const as = [nodes.get(a.from)!, nodes.get(a.to)!], bs = [nodes.get(b.from)!, nodes.get(b.to)!];
      for (const position of segmentIntersections(as[0].position, as[1].position, bs[0].position, bs[1].position)) {
        const endsA = as.filter(n => near(n.position, position));
        const endsB = bs.filter(n => near(n.position, position));
        if (endsA.some(x => endsB.some(y => root(x.id) === root(y.id)))) continue;
        const key = position.map(n => n.toFixed(7)).join(",");
        const existing = junctions.get(key);
        const nodeIds = [...new Set([...(existing?.nodeIds ?? []), a.from, a.to, b.from, b.to])];
        junctions.set(key, { ...context, code: "unjoined-junction", position, nodeIds,
          detail: "Walk segments meet without a shared routing junction; check whether they should connect." });
      }
    }
    findings.push(...junctions.values());
    const adjacency = new Map([...nodes.keys()].map(id => [id, [] as string[]]));
    for (const edge of floor.navigation.edges.filter(e => !e.blocked)) {
      adjacency.get(edge.from)!.push(edge.to);
      adjacency.get(edge.to)!.push(edge.from);
    }
    const remaining = new Set(nodes.keys()), components: string[][] = [];
    while (remaining.size) {
      const queue = [remaining.values().next().value!]; remaining.delete(queue[0]);
      for (let i = 0; i < queue.length; i++) for (const next of adjacency.get(queue[i])!)
        if (remaining.delete(next)) queue.push(next);
      components.push(queue);
    }
    if (components.length > 1) {
      const roomGroups = components.map(c => floor.rooms.filter(r => {
        const approach = floor.rooms.find(front => front.id === r.approachRoomId);
        return c.includes(approach?.entrance ?? r.entrance ?? "");
      }).map(r => r.id));
      findings.push({ ...context, code: "floor-components", nodeIds: components.map(c => c[0]),
        roomIds: roomGroups.flat(),
        detail: `${components.length} same-floor components (${roomGroups.map(ids => ids.join(", ") || "facilities only").join(" | ")}); check intentional separation and off-floor approaches.`,
      });
    }
  }
  return findings;
}

function permitted(edge: NavEdge, mode: RouteFilterType) {
  return !edge.blocked && (mode !== "accessible" || edge.isAccessible && edge.type !== "stairs");
}

/** Independent integer-cost reference: minimum registered floor changes, without drawing lengths. */
export function minimumFloorChanges(data: CampusData, start: string, mode: RouteFilterType = "shortest") {
  const indices = new Map<string, number>(data.buildings.flatMap(b => b.floors.map(f => [`${b.id}/${f.level}`, f.stackIndex ?? f.level] as const)));
  const nodes = new Map(data.navigation.nodes.map(n => [n.id, n]));
  const adjacent = new Map([...nodes.keys()].map(id => [id, [] as Array<[string, number]>]));
  for (const edge of data.navigation.edges.filter(e => permitted(e, mode))) {
    const a = nodes.get(edge.from)!, b = nodes.get(edge.to)!;
    const cost = a.buildingId && a.buildingId === b.buildingId
      ? Math.abs((indices.get(`${a.buildingId}/${a.floor}`) ?? a.floor ?? 0) -
        (indices.get(`${b.buildingId}/${b.floor}`) ?? b.floor ?? 0)) : 0;
    adjacent.get(a.id)!.push([b.id, cost]);
    if (edge.bidirectional !== false) adjacent.get(b.id)!.push([a.id, cost]);
  }
  const costs = new Map([[start, 0]]), queue = [start];
  // Queue relaxation provides a reference independent of weighted route search.
  for (let i = 0; i < queue.length; i++) for (const [next, cost] of adjacent.get(queue[i]) ?? []) {
    const distance = costs.get(queue[i])! + cost;
    if (distance < (costs.get(next) ?? Infinity)) { costs.set(next, distance); queue.push(next); }
  }
  return costs;
}

export function auditRoutes(data: CampusData, mode: RouteFilterType = "shortest") {
  const findings: AuditFinding[] = [], finder = new AStarPathfinder(data);
  const rooms = placeIndex(data).filter(p => p.kind === "room" && p.nodeId);
  const directed = data.navigation.edges.some(e => e.bidirectional === false);
  let checkedPairs = 0;
  for (const building of data.buildings) {
    const local = rooms.filter(p => p.buildingId === building.id);
    for (let i = 0; i < local.length; i++) {
      const a = local[i], minimum = minimumFloorChanges(data, a.nodeId!, mode);
      for (let j = directed ? 0 : i + 1; j < local.length; j++) {
        if (i === j) continue;
        const b = local[j], route = finder.findPath(a.nodeId!, b.nodeId!, mode);
        checkedPairs++;
        if (!route) findings.push({ code: "route-unreachable", buildingId: building.id,
          roomIds: [a.id, b.id], detail: `No registered route in ${mode} mode.` });
        else if (route.floorChanges > minimum.get(b.nodeId!)!) findings.push({
          code: "route-floor-detour", buildingId: building.id, roomIds: [a.id, b.id],
          nodeIds: route.pathNodes.map(n => n.id),
          detail: `${route.floorChanges} floor changes; a route with ${minimum.get(b.nodeId!)} is registered (${mode}).`,
        });
      }
    }
  }
  return { findings, checkedPairs, mode };
}
