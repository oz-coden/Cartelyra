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

test("Building 20 has four schematic floors, 108 numbered room areas and a non-traversable outdoor area", () => {
  assert.deepEqual(validateSources(source.manifest, source.buildings, source.floors, source.sources, source.overview), []);
  assert.deepEqual(building.floors.map((f) => f.level), [1, 2, 3, 4]);
  assert.deepEqual(building.floors.map((f) => f.rooms.length), [20, 19, 41, 28]);
  const rooms = building.floors.flatMap((f) => f.rooms);
  assert.equal(new Set(rooms.map((r) => r.id)).size, 108);
  assert.equal(rooms.filter((r) => r.mapLabel === "番号未確認").length, 0);
  assert.ok(rooms.some((r) => r.id === "20-306-1" && r.name.includes("準備室")));
  for (const absent of ["20-107", "20-108", "20-204"])
    assert.ok(!rooms.some((r) => r.id === absent), `${absent} must not be inferred from a numbering sequence`);
  assert.ok(rooms.some((r) => r.id === "20-321-1"));
  const fourth = building.floors.find((f) => f.level === 4);
  const outdoor = fourth.features.find((f) => f.id === "unlabelled-center");
  assert.equal(outdoor.label, "屋外区画（立入不可）");
  assert.equal(outdoor.type, "service");
  assert.deepEqual(fourth.voids, []);
  assert.ok(!places.some((p) => p.featureId === outdoor.id && p.buildingId === "b20"));
  for (const room of rooms.filter((r) => r.name.includes("研究室"))) {
    assert.equal(room.name, `${room.id} 研究室`);
    assert.deepEqual(room.aliases, [room.id, room.id.replace(/^20-/, "")]);
  }
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
  assert.equal(result[0].name, "20-420 研究室");
  assert.deepEqual(searchPlaces(places, "上原研究室"), []);
  assert.deepEqual(searchPlaces(places, "音楽情報処理"), []);
  assert.equal(searchPlaces(places, "20号館 計算機科学準備室2")[0].id, "20-413");
  assert.equal(searchPlaces(places, "20-306-1")[0].id, "20-306-1");
  for (const [name, id] of [["受付・事務室", "20-101"], ["倉庫1A", "20-114"], ["計算機科学準備室1", "20-414"], ["計算機科学準備室3", "20-425"]])
    assert.equal(searchPlaces(places, `20号館 ${name}`)[0].id, id);
  assert.ok(searchPlaces(places, "20号館 1F 多目的").some((p) => p.id === "b20/f1/feature/wc-a"));
  const finder = new AStarPathfinder(campus);
  for (const place of places.filter((p) => p.buildingId === "b20")) {
    assert.equal(place.nodeId, undefined);
    assert.equal(finder.findPath("b3/f1/room-103", place.id), null);
  }
  assert.equal(campus.navigation.nodes.some((n) => n.buildingId === "b20"), false);
  assert.ok(finder.findPath("b3/f1/room-103", "b3/f4/room-401"));
});
