import type {
  BuildingSource,
  CampusSource,
  FloorSource,
  SourceDocument,
  CampusOverview,
} from "./schema";
import type { Point2 } from "../types/campus";
import {
  pointInPolygon,
  pointInInterior,
  segmentIsWalkable,
} from "./geometry.js";

const finitePoint = (p: unknown): p is Point2 =>
  Array.isArray(p) && p.length === 2 && p.every(Number.isFinite);
const unique = (values: string[]) => new Set(values).size === values.length;

/** Checks authoring files before production build. Invalid references are never silently dropped. */
export function validateSources(
  manifest: CampusSource,
  buildings: BuildingSource[],
  floors: FloorSource[],
  sources: SourceDocument[],
  overview: CampusOverview,
): string[] {
  const errors: string[] = [];
  const check = (condition: unknown, message: string) => {
    if (!condition) errors.push(message);
  };
  const metadata = (edge: { routingCost?: number; cover?: string; floorChanges?: number; isIndoor?: boolean;
    blocked?: boolean; bidirectional?: boolean }, context: string) => {
    if (manifest.coordinateUnit === "schematic")
      check(Number.isFinite(edge.routingCost) && edge.routingCost! >= 0, `Missing/invalid reference routing cost ${context}`);
    else if (edge.routingCost !== undefined)
      check(Number.isFinite(edge.routingCost) && edge.routingCost >= 0, `Invalid reference routing cost ${context}`);
    if (edge.cover !== undefined) {
      check(["indoor", "covered", "open", "unknown"].includes(edge.cover), `Invalid weather cover ${context}`);
      if (edge.isIndoor !== undefined)
        check(edge.isIndoor === (edge.cover === "indoor"), `Weather cover conflicts with indoor flag ${context}`);
    }
    if (edge.floorChanges !== undefined)
      check(Number.isInteger(edge.floorChanges) && edge.floorChanges >= 0, `Invalid explicit floor changes ${context}`);
    for (const flag of ["blocked", "bidirectional"] as const)
      check(edge[flag] === undefined || typeof edge[flag] === "boolean", `Invalid ${flag} flag ${context}`);
  };
  const polygon = (p: Point2[], context: string): boolean => {
    const valid = Array.isArray(p) && p.length >= 3 && p.every(finitePoint);
    check(
      valid,
      `${context}: polygon needs at least three finite [x,z] points`,
    );
    if (!valid) return false;
    const area = p.reduce((sum, a, i) => {
      const b = p[(i + 1) % p.length];
      return sum + a[0] * b[1] - b[0] * a[1];
    }, 0);
    check(Math.abs(area) > 1e-7, `${context}: polygon has zero area`);
    return Math.abs(area) > 1e-7;
  };
  check(manifest.schemaVersion === 1, "Unsupported schemaVersion");
  check(
    ["schematic", "meters"].includes(manifest.coordinateUnit),
    "Invalid coordinateUnit",
  );
  for (const [name, ids] of [
    ["building", buildings.map((b) => b.id)],
    ["floor", floors.map((f) => `${f.buildingId}/${f.id}`)],
    ["source", sources.map((s) => s.id)],
    ["manifest building", manifest.buildingIds],
  ] as const) {
    check(
      ids.every((id) => typeof id === "string" && id.length > 0),
      `${name}: empty ID`,
    );
    check(unique([...ids]), `${name}: duplicate IDs`);
  }
  const sourceIds = new Set(sources.map((s) => s.id)),
    allNodes = new Map<
      string,
      { floor: FloorSource; node: FloorSource["navigation"]["nodes"][number] }
    >();
  const placeIds: string[] = [];
  const roomIds: string[] = [],
    referencedFloors: string[] = [];
  for (const id of manifest.buildingIds)
    check(
      buildings.some((b) => b.id === id),
      `Unknown building ${id}`,
    );
  for (const building of buildings) {
    check(
      manifest.buildingIds.includes(building.id),
      `Unreferenced building ${building.id}`,
    );
    check(
      building.origin.length === 3 &&
        building.origin.every(Number.isFinite) &&
        Number.isFinite(building.rotation),
      `${building.id}: invalid transform`,
    );
    check(
      unique(building.floorIds),
      `${building.id}: duplicate floor reference`,
    );
    const used = floors.filter(
      (f) => f.buildingId === building.id && building.floorIds.includes(f.id),
    );
    check(
      unique(used.map((f) => String(f.level))),
      `${building.id}: duplicate floor level`,
    );
    for (let i = 0; i < building.floorIds.length; i++) {
      const floor = floors.find(
        (f) => f.id === building.floorIds[i] && f.buildingId === building.id,
      );
      if (!floor) {
        errors.push(`Unknown floor ${building.floorIds[i]}`);
        continue;
      }
      referencedFloors.push(`${building.id}/${floor.id}`);
      const ctx = `${building.id}/${floor.id}`;
      check(
        Number.isInteger(floor.level) &&
          Number.isInteger(floor.stackIndex) &&
          Number.isFinite(floor.elevation),
        `${ctx}: invalid floor level/order/elevation`,
      );
      const previous = floors.find(
        (f) =>
          f.id === building.floorIds[i - 1] && f.buildingId === building.id,
      );
      if (previous)
        check(
          floor.stackIndex === previous.stackIndex + 1 &&
            floor.elevation > previous.elevation,
          `${ctx}: floors must have consecutive stackIndex and increasing elevation`,
        );
      check(
        sourceIds.has(floor.sourceId),
        `${ctx}: missing source ${floor.sourceId}`,
      );
      const validOutline = polygon(floor.outline, ctx);
      const validVoids = floor.voids.every((p, j) =>
        polygon(p, `${ctx}/void${j}`),
      );
      check(
        unique(floor.features.map((f) => f.id)),
        `${ctx}: duplicate feature IDs`,
      );
      for (const feature of floor.features) {
        placeIds.push(`${ctx}/feature/${feature.id}`);
        if (feature.restroomType !== undefined)
          check(
            ["male", "female", "multipurpose", "all-gender"].includes(
              feature.restroomType,
            ),
            `${ctx}/${feature.id}: invalid restroom type`,
          );
        polygon(feature.polygon, `${ctx}/${feature.id}`);
        if (feature.entrance) {
          const node = floor.navigation.nodes.find(
            (n) => n.id === feature.entrance,
          );
          check(
            node,
            `${ctx}/${feature.id}: missing facility entrance ${feature.entrance}`,
          );
          if (node)
            check(
              pointInPolygon(node.position, feature.polygon),
              `${ctx}/${feature.id}: entrance is not on facility`,
            );
        }
      }
      check(
        unique(floor.navigation.nodes.map((n) => n.id)),
        `${ctx}: duplicate navigation node IDs`,
      );
      for (const room of floor.rooms) {
        check(room.passThrough === undefined || typeof room.passThrough === "boolean",
          `${room.id}: passThrough must be a boolean`);
        if (room.passThrough === true)
          check(room.entrance && !room.approachRoomId,
            `${room.id}: public circulation area requires its own registered approach`);
        if (room.approachRoomId !== undefined) {
          const approach = floor.rooms.find((r) => r.id === room.approachRoomId);
          check(
            approach && approach.id !== room.id && approach.entrance &&
              !approach.approachRoomId && !room.entrance,
            `${room.id}: approach room must have a direct entrance on the same floor; chains and direct entrance overrides are invalid`,
          );
        }
        roomIds.push(room.id);
        placeIds.push(room.id);
        const validRoom = polygon(room.polygon, room.id);
        if (validRoom && validOutline && validVoids) {
          for (let j = 0; j < room.polygon.length; j++)
            check(
              segmentIsWalkable(
                room.polygon[j],
                room.polygon[(j + 1) % room.polygon.length],
                floor.outline,
                floor.voids,
              ),
              `${room.id}: geometry leaves floor or crosses void`,
            );
        }
        if (room.entrance) {
          const entrance = floor.navigation.nodes.find(
            (n) => n.id === room.entrance,
          );
          check(
            entrance?.type === "room_entrance",
            `${room.id}: missing room entrance ${room.entrance}`,
          );
          if (entrance && validRoom)
            check(
              pointInPolygon(entrance.position, room.polygon),
              `${room.id}: entrance is not on the room`,
            );
        }
      }
      for (const node of floor.navigation.nodes) {
        check(
          finitePoint(node.position),
          `${ctx}/${node.id}: invalid position`,
        );
        if (finitePoint(node.position) && validOutline && validVoids) {
          check(
            pointInPolygon(node.position, floor.outline) &&
              !floor.voids.some((p) => pointInInterior(node.position, p)),
            `${ctx}/${node.id}: node outside floor or inside void`,
          );
        }
        allNodes.set(`${ctx}/${node.id}`, { floor, node });
      }
    }
  }
  check(unique(roomIds), "Duplicate room IDs");
  check(unique(placeIds), "Duplicate place IDs");
  check(
    unique(referencedFloors),
    "A floor is referenced by multiple buildings",
  );
  for (const floor of floors)
    check(
      referencedFloors.includes(`${floor.buildingId}/${floor.id}`),
      `Unreferenced floor ${floor.buildingId}/${floor.id}`,
    );
  for (const building of buildings) {
    const qualifiedEdges = [
      ...building.connections,
      ...floors
        .filter(
          (f) =>
            f.buildingId === building.id && building.floorIds.includes(f.id),
        )
        .flatMap((f) =>
          f.navigation.edges.map((e) => ({
            ...e,
            from: `${building.id}/${f.id}/${e.from}`,
            to: `${building.id}/${f.id}/${e.to}`,
          })),
        ),
    ];
    const seen = new Set<string>(),
      adjacent = new Map<string, Set<string>>();
    for (const edge of qualifiedEdges) {
      metadata(edge, `${edge.from} -> ${edge.to}`);
      const key =
        edge.bidirectional === false
          ? `${edge.from}>${edge.to}`
          : [edge.from, edge.to].sort().join("|");
      check(!seen.has(key), `Duplicate edge ${key}`);
      seen.add(key);
      check(
        edge.from.startsWith(`${building.id}/`) &&
          edge.to.startsWith(`${building.id}/`),
        `Building connection leaves ${building.id}`,
      );
      const a = allNodes.get(edge.from),
        b = allNodes.get(edge.to);
      check(a && b, `Missing edge endpoint ${edge.from} -> ${edge.to}`);
      check(edge.from !== edge.to, `Self edge ${edge.from}`);
      check(
        ["walk", "stairs", "elevator", "bridge", "outdoor"].includes(edge.type),
        `Invalid edge type ${edge.from}`,
      );
      check(
        ["diagram", "inferred", "verified"].includes(edge.verification),
        `Missing/invalid verification ${edge.from}`,
      );
      check(
        typeof edge.isIndoor === "boolean" &&
          typeof edge.isAccessible === "boolean",
        `Missing edge flags ${edge.from}`,
      );
      check(
        edge.type !== "stairs" || !edge.isAccessible,
        `Stairs marked accessible ${edge.from}`,
      );
      if (edge.distance !== undefined)
        check(
          Number.isFinite(edge.distance) && edge.distance > 0,
          `Invalid edge distance ${edge.from}`,
        );
      if (!a || !b) continue;
      if (edge.floorChanges !== undefined)
        check(edge.floorChanges === Math.abs(a.floor.stackIndex - b.floor.stackIndex), `Explicit floor changes conflict with floor order ${edge.from}`);
      for (const [from, to] of [
        [edge.from, edge.to],
        [edge.to, edge.from],
      ]) {
        const set = adjacent.get(from) ?? new Set<string>();
        set.add(to);
        adjacent.set(from, set);
      }
      if (a.floor === b.floor) {
        const floor = a.floor;
        const obstacles = [
          ...floor.voids,
          ...floor.rooms.filter((r) => r.passThrough !== true).map((r) => r.polygon),
          ...floor.features
            .filter((f) => ["restroom", "service", "pit", "stairs", "elevator"].includes(f.type))
            .map((f) => f.polygon),
        ];
        if (
          Array.isArray(floor.outline) &&
          floor.outline.every(finitePoint) &&
          obstacles.every((p) => Array.isArray(p) && p.every(finitePoint))
        ) {
          check(
            segmentIsWalkable(
              a.node.position,
              b.node.position,
              floor.outline,
              obstacles,
            ),
            `Edge crosses room, void or service area: ${edge.from} -> ${edge.to}`,
          );
        }
      } else {
        check(
          ["stairs", "elevator", "bridge", "outdoor"].includes(edge.type),
          `Cross-floor walk edge ${edge.from}`,
        );
        if (edge.type === "stairs" || edge.type === "elevator") {
          check(
            a.node.type === edge.type && b.node.type === edge.type,
            `Vertical facility mismatch ${edge.from}`,
          );
          const changes = Math.abs(a.floor.stackIndex - b.floor.stackIndex);
          check(
            changes === 1 || edge.type === "elevator" && edge.floorChanges === changes,
            `Vertical edge skips a floor ${edge.from}`,
          );
        }
      }
    }
    const nodeIds = [...allNodes.keys()].filter((id) =>
      id.startsWith(`${building.id}/`),
    );
    const components = new Map<string, number>();
    let componentCount = 0;
    for (const id of nodeIds) {
      if (components.has(id)) continue;
      const queue = [id];components.set(id, componentCount);
      for (let i = 0; i < queue.length; i++)
        for (const next of adjacent.get(queue[i]) ?? [])
          if (!components.has(next)) {
            components.set(next, componentCount);queue.push(next);
          }
      componentCount++;
    }
    if (building.navigationComponents !== undefined) {
      const declarations = building.navigationComponents;
      check(Array.isArray(declarations) && declarations.length === componentCount,
        `${building.id}: navigationComponents must describe every separate component`);
      if (Array.isArray(declarations)) {
        const represented = new Set<number>();
        for (const entry of declarations) {
          const component = entry && components.get(entry.nodeId);
          check(component !== undefined && !represented.has(component) &&
            typeof entry?.description === "string" && entry.description.trim().length > 0,
            `${building.id}: invalid or duplicate navigation component ${entry?.nodeId}`);
          if (component !== undefined) represented.add(component);
        }
        check(represented.size === componentCount,
          `${building.id}: unreported disconnected navigation component`);
      }
    } else {
      for (const id of nodeIds)
        check(components.get(id) === 0, `Disconnected navigation node ${id}`);
    }
  }
  const campusEdges = new Set<string>();
  for (const edge of manifest.connections ?? []) {
    metadata(edge, `${edge.from} -> ${edge.to}`);
    const a = allNodes.get(edge.from),
      b = allNodes.get(edge.to);
    check(a && b, `Missing campus edge endpoint ${edge.from} -> ${edge.to}`);
    check(
      edge.from.split("/")[0] !== edge.to.split("/")[0],
      `Campus connection must join different buildings ${edge.from}`,
    );
    check(
      ["bridge", "outdoor"].includes(edge.type),
      `Invalid campus edge type ${edge.from}`,
    );
    check(
      ["diagram", "inferred", "verified"].includes(edge.verification),
      `Invalid campus verification ${edge.from}`,
    );
    check(
      typeof edge.isIndoor === "boolean" &&
        typeof edge.isAccessible === "boolean",
      `Missing campus edge flags ${edge.from}`,
    );
    if (edge.distance !== undefined)
      check(
        Number.isFinite(edge.distance) && edge.distance > 0,
        `Invalid campus distance ${edge.from}`,
      );
    const key =
      edge.bidirectional === false
        ? `${edge.from}>${edge.to}`
        : [edge.from, edge.to].sort().join("|");
    check(!campusEdges.has(key), `Duplicate campus edge ${key}`);
    campusEdges.add(key);
  }
  check(
    sourceIds.has(overview.sourceId),
    `Unknown overview source ${overview.sourceId}`,
  );
  if (overview.reference) {
    const r = overview.reference;
    check(r.type === "gsi-xyz" && r.orientation === "north-up", "Invalid overview reference type or orientation");
    check(Number.isInteger(r.zoom) && r.zoom >= 0 && r.zoom <= 24, "Invalid overview reference zoom");
    check(finitePoint(r.tileOrigin) && r.tileOrigin.every((v) => Number.isInteger(v) && v >= 0 && v < 2 ** r.zoom), "Invalid overview reference tile origin");
    check(finitePoint(r.pixelOffset), "Invalid overview reference pixel offset");
    check(Number.isFinite(r.pixelsPerUnit) && r.pixelsPerUnit > 0, "Invalid overview reference scale");
    check(Number.isFinite(Date.parse(r.retrievedAt)) &&
      (r.imageryDate === null || Number.isFinite(Date.parse(r.imageryDate))), "Invalid overview reference date");
    check(typeof r.attribution?.label === "string" && !!r.attribution.label &&
      typeof r.attribution?.url === "string" && r.attribution.url.startsWith("https://"), "Invalid overview attribution");
  }
  check(
    unique(overview.buildings.map((b) => b.id)),
    "Duplicate overview building ID",
  );
  overview.buildings.forEach((b) => polygon(b.polygon, `overview/${b.id}`));
  check(unique(overview.gates.map((g) => g.id)), "Duplicate gate IDs");
  check(
    unique([...placeIds, ...overview.gates.map((g) => `campus/gate/${g.id}`)]),
    "Duplicate place IDs",
  );
  overview.gates.forEach((g) =>
    check(
      typeof g.id === "string" && g.id.length > 0,
      `Invalid gate ID ${g.name}`,
    ),
  );
  overview.gates.forEach((g) =>
    check(finitePoint(g.position), `Invalid gate ${g.name}`),
  );
  const outdoor = manifest.outdoor;
  if (outdoor) {
    check(manifest.coordinateUnit === "schematic", "Outdoor overview coordinates require schematic units");
    check(sourceIds.has(outdoor.sourceId), "Unknown outdoor source");
    if (outdoor.positionSourceId !== undefined)
      check(sourceIds.has(outdoor.positionSourceId), "Unknown outdoor position source");
    check(unique(outdoor.nodes.map((n) => n.id)), "Duplicate outdoor node IDs");
    const nodes = new Map(outdoor.nodes.map((n) => [n.id, n]));
    const gates = outdoor.nodes.flatMap((n) => n.gateId ? [n.gateId] : []);
    check(unique(gates), "Duplicate outdoor gate binding");
    const obstacles = overview.buildings.map((b) => b.polygon);
    const area: Point2[] = [[-1000, -1000], [1000, -1000], [1000, 1000], [-1000, 1000]];
    for (const node of outdoor.nodes) {
      check(typeof node.id === "string" && !!node.id && !node.id.includes("/"), "Invalid outdoor node ID");
      check(finitePoint(node.position), `Invalid outdoor position ${node.id}`);
      check(["ground", "bridge", "underground"].includes(node.layer), `Invalid outdoor layer ${node.id}`);
      if (finitePoint(node.position) && node.layer === "ground")
        check(!obstacles.some((p) => pointInInterior(node.position, p)), `Outdoor node inside building ${node.id}`);
      if (node.gateId) {
        const gate = overview.gates.find((g) => g.id === node.gateId);
        check(gate && gate.position.every((p, i) => p === node.position[i]), `Invalid outdoor gate binding ${node.id}`);
      }
    }
    const seen = new Set<string>(), adjacent = new Map<string, Set<string>>();
    for (const edge of outdoor.edges) {
      metadata(edge, `outdoor/${edge.from} -> ${edge.to}`);
      const a = nodes.get(edge.from), b = nodes.get(edge.to);
      check(a && b, `Missing outdoor edge endpoint ${edge.from} -> ${edge.to}`);
      check(edge.from !== edge.to, `Outdoor self edge ${edge.from}`);
      const key = edge.bidirectional === false ? `${edge.from}>${edge.to}` : [edge.from, edge.to].sort().join("|");
      check(!seen.has(key), `Duplicate outdoor edge ${key}`);
      seen.add(key);
      check(["outdoor", "bridge", "stairs", "elevator"].includes(edge.type), `Invalid outdoor edge type ${edge.from}`);
      check(["inferred", "diagram", "verified"].includes(edge.verification), `Invalid outdoor verification ${edge.from}`);
      check(edge.isIndoor === false && typeof edge.isAccessible === "boolean" &&
        (edge.type !== "stairs" || !edge.isAccessible), `Invalid outdoor flags ${edge.from}`);
      check(["unknown", "wide", "narrow"].includes(edge.widthClass), `Invalid outdoor width class ${edge.from}`);
      if (edge.distance !== undefined)
        check(Number.isFinite(edge.distance) && edge.distance > 0, `Invalid outdoor distance ${edge.from}`);
      if (!a || !b) continue;
      check(a.layer === b.layer || ["stairs", "elevator"].includes(edge.type), `Outdoor layer transfer needs explicit vertical connection ${edge.from}`);
      if (a.layer === "ground" && b.layer === "ground" && finitePoint(a.position) && finitePoint(b.position))
        check(segmentIsWalkable(a.position, b.position, area, obstacles), `Outdoor edge crosses building ${edge.from} -> ${edge.to}`);
      for (const [from, to] of [[edge.from, edge.to], [edge.to, edge.from]]) {
        const set = adjacent.get(from) ?? new Set<string>(); set.add(to); adjacent.set(from, set);
      }
    }
    const linked = new Set<string>();
    for (const link of outdoor.links) {
      metadata(link, `entrance/${link.from} -> ${link.to}`);
      const outside = nodes.get(link.from), inside = allNodes.get(link.to);
      check(outside && inside, `Missing outdoor entrance endpoint ${link.from} -> ${link.to}`);
      check(!linked.has(link.to), `Duplicate outdoor entrance binding ${link.to}`);
      linked.add(link.to);
      check(["inferred", "diagram", "verified"].includes(link.verification) && typeof link.isAccessible === "boolean", `Invalid outdoor entrance flags ${link.to}`);
      if (!inside || !outside) continue;
      check(inside.floor.features.some((f) => f.type === "entrance" && f.entrance === inside.node.id), `Outdoor link must use a building entrance ${link.to}`);
      check(pointInPolygon(inside.node.position, inside.floor.outline) && !pointInInterior(inside.node.position, inside.floor.outline), `Indoor entrance must be on floor boundary ${link.to}`);
      const footprint = overview.buildings.find((b) => b.id === inside.floor.buildingId)?.polygon;
      check(footprint && pointInPolygon(outside.position, footprint) && !pointInInterior(outside.position, footprint), `Outdoor entrance must be on building overview boundary ${link.to}`);
    }
    if (outdoor.nodes.length) {
      const reached = new Set([outdoor.nodes[0].id]), queue = [...reached];
      for (let i = 0; i < queue.length; i++)
        for (const next of adjacent.get(queue[i]) ?? [])
          if (!reached.has(next)) { reached.add(next); queue.push(next); }
      for (const node of outdoor.nodes)
        check(reached.has(node.id), `Disconnected outdoor node ${node.id}`);
    }
  }
  const groups = manifest.viewGroups ?? [];
  check(unique(groups.map(g => g.id)), "Duplicate view group IDs");
  check(unique(groups.flatMap(g => g.buildingIds)), "Building belongs to multiple view groups");
  for (const group of groups) {
    const ctx = `view group/${group.id}`;
    check(typeof group.id === "string" && !!group.id && typeof group.name === "string" && !!group.name, `Invalid ${ctx} identity`);
    check(["pending", "ready"].includes(group.status), `Invalid ${ctx} status`);
    check(["diagram", "inferred", "verified"].includes(group.verification), `Invalid ${ctx} verification`);
    check(group.buildingIds.length >= 2 && unique(group.buildingIds), `Invalid ${ctx} members`);
    for (const id of group.buildingIds) {
      check(overview.buildings.some(b => b.id === id) || buildings.some(b => b.id === id), `Unknown ${ctx} building ${id}`);
      if (group.status === "ready") check(buildings.some(b => b.id === id), `Ready ${ctx} missing building data ${id}`);
    }
    check(unique(group.levels.map(l => l.id)), `Duplicate ${ctx} level IDs`);
    const assigned = group.levels.flatMap(l => l.floors.map(f => `${f.buildingId}/${f.floorId}`));
    check(unique(assigned), `Duplicate ${ctx} floor assignment`);
    for (const level of group.levels) {
      check(!!level.id && !!level.label && level.floors.length > 0, `Invalid ${ctx} display level`);
      for (const ref of level.floors)
        check(group.buildingIds.includes(ref.buildingId) && floors.some(f => f.buildingId === ref.buildingId && f.id === ref.floorId),
          `Unknown ${ctx} floor ${ref.buildingId}/${ref.floorId}`);
    }
    if (group.status === "ready") {
      check(group.levels.length > 0, `Ready ${ctx} needs display levels`);
      for (const floor of floors.filter(f => group.buildingIds.includes(f.buildingId)))
        check(assigned.includes(`${floor.buildingId}/${floor.id}`), `Ready ${ctx} missing floor assignment ${floor.buildingId}/${floor.id}`);
    }
  }
  return errors;
}
