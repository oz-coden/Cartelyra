import type { CampusData, NavEdge, Place, Point2, RouteFilterType } from "../types/campus";
import type { FloorSource } from "./schema";
import { polygonArea, polygonOverlapArea, segmentIntersections } from "./geometry.js";
import { placeIndex } from "./places.js";
import { AStarPathfinder } from "../pathfinding/AStar.js";

export interface AuditFinding {
  code: "room-contained" | "room-overlap" | "room-coincident" | "unjoined-junction" |
    "floor-components" | "building-components" | "route-unreachable" | "route-floor-detour" |
    "view-group-pending" | "view-group-disconnected" | "view-level-height" | "unmeasured-vertical";
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

/** Independent integer-cost reference: known floor changes plus unmeasured vertical links. */
export function minimumFloorChanges(data: CampusData, start: string, mode: RouteFilterType = "shortest") {
  const indices = new Map<string, number>(data.buildings.flatMap(b => b.floors.map(f => [`${b.id}/${f.level}`, f.stackIndex ?? f.level] as const)));
  const nodes = new Map(data.navigation.nodes.map(n => [n.id, n]));
  const adjacent = new Map([...nodes.keys()].map(id => [id, [] as Array<[string, number]>]));
  for (const edge of data.navigation.edges.filter(e => permitted(e, mode))) {
    const a = nodes.get(edge.from)!, b = nodes.get(edge.to)!;
    const vertical = edge.type === "stairs" || edge.type === "ramp" || edge.type === "elevator";
    const cost = edge.floorChanges ?? (a.buildingId && a.buildingId === b.buildingId && (!vertical || a.floor !== b.floor)
      ? Math.abs((indices.get(`${a.buildingId}/${a.floor}`) ?? a.floor ?? 0) -
        (indices.get(`${b.buildingId}/${b.floor}`) ?? b.floor ?? 0)) :
      vertical ? 1 : 0);
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
        else if (route.floorChanges + (route.verticalMovements?.unmeasured ?? 0) > minimum.get(b.nodeId!)!) findings.push({
          code: "route-floor-detour", buildingId: building.id, roomIds: [a.id, b.id],
          nodeIds: route.pathNodes.map(n => n.id),
          detail: `${route.floorChanges} floor changes; a route with ${minimum.get(b.nodeId!)} is registered (${mode}).`,
        });
      }
    }
  }
  return { findings, checkedPairs, mode };
}

export type CoverageReason = "missing-endpoint" | "disconnected" | "filtered";
export interface CoverageCounts {
  checkedPairs: number;
  reachablePairs: number;
  missingEndpointPairs: number;
  disconnectedPairs: number;
  filteredPairs: number;
}
export interface CampusCoverageGroup extends CoverageCounts {
  fromBuildingId: string;
  toBuildingId: string;
  examples: Array<{ from: string; to: string; reason: CoverageReason }>;
}

/** Exhaustive directed cross-building room coverage, independent of weighted path selection.
 * Missing approaches, missing topology and mode restrictions are reported separately.
 * Reachability is cached per node; shared front-room endpoints retain their room identities.
 */
export function auditCampusCoverage(data: CampusData, mode: RouteFilterType = "shortest") {
  const rooms = placeIndex(data).filter((p): p is Place & { buildingId: string } =>
    p.kind === "room" && p.buildingId !== undefined);
  const counts = (): CoverageCounts => ({ checkedPairs: 0, reachablePairs: 0,
    missingEndpointPairs: 0, disconnectedPairs: 0, filteredPairs: 0 });
  const makeReachability = (filter: RouteFilterType) => {
    const adjacent = new Map(data.navigation.nodes.map(n => [n.id, [] as string[]]));
    for (const edge of data.navigation.edges.filter(e => permitted(e, filter))) {
      adjacent.get(edge.from)!.push(edge.to);
      if (edge.bidirectional !== false) adjacent.get(edge.to)!.push(edge.from);
    }
    const cache = new Map<string, Set<string>>();
    return (start: string) => {
      if (!cache.has(start)) {
        const seen = new Set<string>(), queue = adjacent.has(start) ? [start] : [];
        if (queue.length) seen.add(start);
        for (let i = 0; i < queue.length; i++) for (const next of adjacent.get(queue[i])!)
          if (!seen.has(next)) { seen.add(next); queue.push(next); }
        cache.set(start, seen);
      }
      return cache.get(start)!;
    };
  };
  const connected = makeReachability("shortest");
  const allowed = mode === "accessible" ? makeReachability(mode) : connected;
  const total = counts(), groups = new Map<string, CampusCoverageGroup>();
  for (const a of rooms) for (const b of rooms) {
    if (a.buildingId === b.buildingId) continue;
    const key = `${a.buildingId}/${b.buildingId}`;
    if (!groups.has(key)) groups.set(key, { ...counts(), fromBuildingId: a.buildingId,
      toBuildingId: b.buildingId, examples: [] });
    const group = groups.get(key)!;
    const reason: CoverageReason | undefined = !a.nodeId || !b.nodeId ? "missing-endpoint"
      : !connected(a.nodeId).has(b.nodeId) ? "disconnected"
      : !allowed(a.nodeId).has(b.nodeId) ? "filtered" : undefined;
    const field: keyof CoverageCounts = reason === "missing-endpoint" ? "missingEndpointPairs"
      : reason === "disconnected" ? "disconnectedPairs" : reason === "filtered" ? "filteredPairs" : "reachablePairs";
    total.checkedPairs++; group.checkedPairs++; total[field]++; group[field]++;
    if (reason && group.examples.filter(e => e.reason === reason).length < 3)
      group.examples.push({ from: a.id, to: b.id, reason });
  }
  return { mode, ...total, unlinkedRooms: rooms.filter(p => !p.nodeId).map(p => p.id), groups: [...groups.values()] };
}

/** Declared groups and unknown heights remain visible without inventing bridges or floor numbers. */
export function auditConnections(data: CampusData): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const nodes = new Map(data.navigation.nodes.map(n => [n.id, n]));
  for (const building of data.buildings) {
    const local = data.navigation.nodes.filter(n => n.buildingId === building.id);
    const adjacent = new Map(local.map(n => [n.id, [] as string[]]));
    for (const e of data.navigation.edges) {
      if (e.blocked || !adjacent.has(e.from) || !adjacent.has(e.to)) continue;
      adjacent.get(e.from)!.push(e.to);adjacent.get(e.to)!.push(e.from);
    }
    const remaining = new Set(adjacent.keys()), representatives: string[] = [];
    while (remaining.size) {
      const first = remaining.values().next().value!;
      const queue = [first];representatives.push(first);remaining.delete(first);
      for (let i = 0; i < queue.length; i++) for (const next of adjacent.get(queue[i])!)
        if (remaining.delete(next)) queue.push(next);
    }
    if (representatives.length > 1) findings.push({code: "building-components", buildingId: building.id,
      nodeIds: representatives, detail: `${representatives.length} separate within-building navigation components; check pending links or required outdoor transfers.`});
  }
  for (const edge of data.navigation.edges) {
    const a = nodes.get(edge.from)!, b = nodes.get(edge.to)!;
    if ((edge.type === "stairs" || edge.type === "ramp" || edge.type === "elevator") && edge.floorChanges === undefined &&
      (!a.buildingId || a.buildingId !== b.buildingId || a.floor === b.floor))
      findings.push({ code: "unmeasured-vertical", buildingId: a.buildingId ?? b.buildingId ?? "campus",
        nodeIds: [a.id, b.id], detail: "A vertical connection has no confirmed floor-change count; guidance identifies the facility without claiming level travel." });
  }
  for (const group of data.viewGroups ?? []) {
    const context = { buildingId: group.buildingIds[0] };
    if (group.status === "pending") {
      findings.push({ ...context, code: "view-group-pending", detail: `${group.name}: floor plans and connection-level mappings remain pending; membership does not create routes.` });
      continue;
    }
    const adjacent = new Map(group.buildingIds.map(id => [id, new Set<string>()]));
    for (const e of data.navigation.edges) {
      const a = nodes.get(e.from)!.buildingId, b = nodes.get(e.to)!.buildingId;
      if (!e.blocked && a && b && adjacent.has(a) && adjacent.has(b) && (e.cover === "indoor" || e.cover === "covered" || e.isIndoor)) {
        adjacent.get(a)!.add(b); adjacent.get(b)!.add(a);
      }
    }
    const seen = new Set([group.buildingIds[0]]), queue = [...seen];
    for (let i = 0; i < queue.length; i++) for (const next of adjacent.get(queue[i])!)
      if (!seen.has(next)) { seen.add(next); queue.push(next); }
    if (seen.size !== group.buildingIds.length) findings.push({ ...context, code: "view-group-disconnected",
      detail: `${group.name}: active indoor/covered connections do not join all members; confirm missing connections or closures.` });
    for (const level of group.levels) {
      const heights = level.floors.map(ref => {
        const b = data.buildings.find(b => b.id === ref.buildingId)!;
        return b.origin[1] + b.floors.find(f => f.id === ref.floorId)!.elevation;
      });
      if (Math.max(...heights) - Math.min(...heights) > 1e-6) findings.push({ ...context, code: "view-level-height",
        detail: `${group.name}/${level.label}: mapped floors have different drawing elevations; confirm alignment or an intentional ramp/step.` });
    }
  }
  return findings;
}
