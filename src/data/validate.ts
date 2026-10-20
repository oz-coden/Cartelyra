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
          if (node && feature.type === "restroom")
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
          ...floor.rooms.map((r) => r.polygon),
          ...floor.features
            .filter((f) => ["restroom", "service", "pit"].includes(f.type))
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
          check(
            Math.abs(a.floor.stackIndex - b.floor.stackIndex) === 1,
            `Vertical edge skips a floor ${edge.from}`,
          );
        }
      }
    }
    const nodeIds = [...allNodes.keys()].filter((id) =>
      id.startsWith(`${building.id}/`),
    );
    if (nodeIds.length) {
      const reached = new Set([nodeIds[0]]),
        queue = [nodeIds[0]];
      for (let i = 0; i < queue.length; i++)
        for (const next of adjacent.get(queue[i]) ?? [])
          if (!reached.has(next)) {
            reached.add(next);
            queue.push(next);
          }
      for (const id of nodeIds)
        check(reached.has(id), `Disconnected navigation node ${id}`);
    }
  }
  const campusEdges = new Set<string>();
  for (const edge of manifest.connections ?? []) {
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
  check(
    unique(overview.buildings.map((b) => b.id)),
    "Duplicate overview building ID",
  );
  overview.buildings.forEach((b) => polygon(b.polygon, `overview/${b.id}`));
  overview.gates.forEach((g) =>
    check(finitePoint(g.position), `Invalid gate ${g.name}`),
  );
  return errors;
}
