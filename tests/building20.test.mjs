import test from "node:test";
import assert from "node:assert/strict";
import { readData } from "../scripts/read-data.mjs";
import { compileCampus } from "../.checks/data/compile.js";
import { placeIndex, searchPlaces } from "../.checks/data/places.js";
import { validateSources } from "../.checks/data/validate.js";
import { AStarPathfinder } from "../.checks/pathfinding/AStar.js";

const source = await readData();
const campus = compileCampus(source.manifest, source.buildings, source.floors);
const building = campus.buildings.find((b) => b.id === "b20");
const places = placeIndex(campus);

test("Building 20 has four schematic floors, 108 room areas and distinct pending labels", () => {
  assert.deepEqual(validateSources(source.manifest, source.buildings, source.floors, source.sources, source.overview), []);
  assert.deepEqual(building.floors.map((f) => f.level), [1, 2, 3, 4]);
  assert.deepEqual(building.floors.map((f) => f.rooms.length), [20, 19, 41, 28]);
  const rooms = building.floors.flatMap((f) => f.rooms);
  assert.equal(new Set(rooms.map((r) => r.id)).size, 108);
  assert.equal(rooms.filter((r) => r.mapLabel === "番号未確認").length, 1);
  for (const absent of ["20-107", "20-108", "20-204", "20-306-1"])
    assert.ok(!rooms.some((r) => r.id === absent), `${absent} must not be inferred from a numbering sequence`);
  assert.ok(rooms.some((r) => r.id === "20-321-1"));
  const facilities = places.filter((p) => p.buildingId === "b20");
  assert.equal(facilities.filter((p) => p.kind === "restroom").length, 9);
  assert.equal(facilities.filter((p) => p.restroomType === "multipurpose").length, 1);
  assert.equal(facilities.filter((p) => p.kind === "stairs").length, 12);
  assert.equal(facilities.filter((p) => p.kind === "elevator").length, 4);
});

test("Building 20 search and endpoint selection retain unknown connectivity without invented routes", () => {
  const result = searchPlaces(places, "20号館 4F 420");
  assert.equal(result[0].id, "20-420");
  assert.equal(result[0].floorLevel, 4);
  assert.equal(result[0].nodeId, undefined);
  assert.ok(searchPlaces(places, "20号館 1F 多目的").some((p) => p.id === "b20/f1/feature/wc-a"));
  const finder = new AStarPathfinder(campus);
  for (const place of places.filter((p) => p.buildingId === "b20")) {
    assert.equal(place.nodeId, undefined);
    assert.equal(finder.findPath("b3/f1/room-103", place.id), null);
  }
  assert.equal(campus.navigation.nodes.some((n) => n.buildingId === "b20"), false);
  assert.ok(finder.findPath("b3/f1/room-103", "b3/f4/room-401"));
});
