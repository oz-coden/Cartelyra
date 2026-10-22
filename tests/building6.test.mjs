import test from "node:test";
import assert from "node:assert/strict";
import { readData } from "../scripts/read-data.mjs";
import { compileCampus } from "../.checks/data/compile.js";
import { placeIndex, searchPlaces } from "../.checks/data/places.js";
import { validateSources } from "../.checks/data/validate.js";
import { AStarPathfinder } from "../.checks/pathfinding/AStar.js";
const source = await readData();
const campus = compileCampus(source.manifest, source.buildings, source.floors);
const floors = source.floors.filter((f) => f.buildingId === "b6");
const places = placeIndex(campus).filter((p) => p.buildingId === "b6");
const finder = new AStarPathfinder(campus);

test("Building 6 preserves four floors, lettered room numbers, courtyards and generic research names", () => {
  assert.deepEqual(validateSources(source.manifest, source.buildings, source.floors, source.sources, source.overview), []);
  assert.deepEqual(campus.buildings.find((b) => b.id === "b6").floors.map((f) => f.rooms.length), [20, 13, 9, 26]);
  assert.equal(places.filter((p) => p.kind === "room").length, 68);
  assert.equal(places.filter((p) => p.kind === "restroom").length, 4);
  assert.equal(places.filter((p) => p.restroomType === "female").length, 1);
  assert.equal(places.filter((p) => p.kind === "elevator").length, 0);
  assert.equal(floors.find((f) => f.level === 4).voids.length, 2);
  assert.equal(floors.find((f) => f.level === 3).voids.length, 0);
  for (const id of ["6-206A", "6-206B", "6-206C", "6-208-1", "6-208-2", "6-109-1", "6-306-1"])
    assert.ok(places.some((p) => p.id === id), id);
  for (const id of ["6-210", "6-402", "6-411"])
    assert.ok(!places.some((p) => p.id === id), id);
  assert.equal(searchPlaces(places, "6号館 MNS")[0].id, "6-206C");
  for (const place of places.filter((p) => p.name.endsWith("教授室")))
    assert.match(place.name, /^6-\d+ 教授室$/);
});

test("Building 6 reaches linked destinations by inferred stairs and preserves unregistered entrances", () => {
  const entry = places.find((p) => p.kind === "entrance" && p.floorLevel === 1);
  assert.ok(entry);
  assert.deepEqual(places.filter((p) => p.kind === "entrance").map((p) => p.floorLevel), [1, 2]);
  for (const place of places.filter((p) => p.nodeId)) {
    for (const mode of ["shortest", "indoor", "stairs"]) {
      const route = finder.findPath(entry.nodeId, place.nodeId, mode);
      assert.ok(route, `${place.id}: ${mode}`);
      assert.ok(route.pathNodes.every((n) => n.buildingId === "b6"));
      assert.equal(route.distanceUnit, "schematic");
    }
    const flat = finder.findPath(entry.nodeId, place.nodeId, "accessible");
    assert.equal(!!flat, place.floorLevel === 1, place.id);
    if (place.nodeId !== entry.nodeId)
      assert.equal(finder.findPath(entry.nodeId, place.nodeId, "shortest", false), null);
  }
  assert.deepEqual(places.filter((p) => p.kind === "room" && !p.nodeId).map((p) => p.id).sort(), ["6-117", "6-204"]);
  assert.equal(places.find((p) => p.featureId === "stairs-lab").nodeId, undefined);
  assert.equal(finder.findPath(entry.nodeId, "b1/f1/entry-top"), null);
});

test("Building 6 avoids unknown grey areas and keeps the 3F right wing separate from its left corridor", () => {
  const start = "b6/f3/room-303", goal = "b6/f3/room-308";
  const route = finder.findPath(start, goal);
  assert.ok(route);
  assert.ok(route.pathNodes.some((n) => n.floor !== 3), "a missing same-floor link must not be replaced by a shortcut through the grey area");
  assert.ok(route.inferredConnections > 0);
  assert.match(places.find((p) => p.id === "6-308").description, /同じ階.*特定できず/);
  assert.ok(source.buildings.find((b) => b.id === "b6").connections.every((e) => e.verification === "inferred"));
  assert.ok(floors.find((f) => f.level === 3).features.filter((f) => f.type === "service").length >= 2);
  assert.ok(!source.buildings.find((b) => b.id === "b6").connections.some((e) => e.from.includes("stairs-lab") || e.to.includes("stairs-lab")));
});
