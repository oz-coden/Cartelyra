import test from "node:test";
import assert from "node:assert/strict";
import { readData } from "../scripts/read-data.mjs";
import { compileCampus } from "../.checks/data/compile.js";
import { placeIndex, searchPlaces } from "../.checks/data/places.js";
import { validateSources } from "../.checks/data/validate.js";
import { AStarPathfinder } from "../.checks/pathfinding/AStar.js";
import { pointInPolygon, pointInInterior } from "../.checks/data/geometry.js";

const source = await readData();
const campus = compileCampus(source.manifest, source.buildings, source.floors);
const building = campus.buildings.find((b) => b.id === "b5");
const places = placeIndex(campus, source.overview).filter((p) => p.buildingId === "b5");
const finder = new AStarPathfinder(campus);

test("Building 5 preserves four floors, numbered subrooms, WC types and generic office names", () => {
  assert.deepEqual(validateSources(source.manifest, source.buildings, source.floors, source.sources, source.overview), []);
  assert.deepEqual(building.floors.map((f) => f.level), [1, 2, 3, 4]);
  assert.deepEqual(building.floors.map((f) => f.rooms.length), [10, 5, 15, 9]);
  const rooms = building.floors.flatMap((f) => f.rooms);
  assert.equal(new Set(rooms.map((r) => r.id)).size, 39);
  for (const id of ["5-104-1", "5-302-1", "5-401-1", "5-402-1", "5-21", "5-313"])
    assert.ok(rooms.some((r) => r.id === id), id);
  for (const id of ["5-107", "5-205", "5-407"])
    assert.ok(!rooms.some((r) => r.id === id), id);
  for (const room of rooms.filter((r) => r.name.includes("教授室")))
    assert.equal(room.name, `${room.id} 教授室`);
  assert.equal(places.filter((p) => p.restroomType === "male").length, 3);
  assert.equal(places.filter((p) => p.restroomType === "female").length, 1);
  assert.equal(places.filter((p) => p.kind === "elevator").length, 0);
  assert.equal(searchPlaces(places, "5号館 2F CAD")[0].id, "5-201");
  assert.equal(searchPlaces(places, "5号館 3F 302-1")[0].id, "5-302-1");
  assert.equal(searchPlaces(places, "5号館 暗室")[0].id, "5-313");
  const first = source.floors.find((f) => f.buildingId === "b5" && f.id === "f1");
  assert.ok(!first.features.some((f) => f.id === "unlabelled-top"));
  assert.equal(pointInPolygon([38, -5], first.outline), false);
  assert.ok(places.some((p) => p.id === "5-11"));
  assert.deepEqual(searchPlaces(places, "5号館 外階段").map((p) => p.id), ["b5/f2/feature/entrance-side"]);
});

test("Building 5 enters on 2F; its external stairs do not become a fictitious indoor 1F transfer", () => {
  const entries = places.filter((p) => p.kind === "entrance");
  assert.equal(entries.length, 1);
  assert.equal(entries[0].floorLevel, 2);
  assert.equal(entries[0].nodeId, "b5/f2/entrance-side");
  const floor = source.floors.find((f) => f.buildingId === "b5" && f.id === "f2");
  const entry = floor.navigation.nodes.find((n) => n.id === "entrance-side");
  assert.ok(pointInPolygon(entry.position, floor.outline));
  assert.equal(pointInInterior(entry.position, floor.outline), false);
  assert.ok(!places.some((p) => p.featureId === "stairs-side"));
  assert.equal(places.filter((p) => p.kind === "stairs").length, 8);
  assert.ok(source.buildings.find((b) => b.id === "b5").connections.every((e) =>
    !e.from.includes("stairs-side") && !e.to.includes("stairs-side")));
  for (const place of places.filter((p) => p.nodeId)) {
    for (const mode of ["shortest", "indoor", "stairs"]) {
      const route = finder.findPath(entries[0].nodeId, place.nodeId, mode);
      assert.ok(route, `${place.id}: ${mode}`);
      assert.ok(route.pathNodes.every((n) => n.buildingId === "b5"));
      assert.equal(route.floorChanges, Math.abs(place.floorLevel - 2));
      assert.equal(route.distanceUnit, "schematic");
    }
    const flat = finder.findPath(entries[0].nodeId, place.nodeId, "accessible");
    assert.equal(!!flat, place.floorLevel === 2, place.id);
    if (place.nodeId !== entries[0].nodeId)
      assert.equal(finder.findPath(entries[0].nodeId, place.nodeId, "shortest", false), null);
  }
  assert.ok(finder.findPath("b3/f1/room-103", entries[0].nodeId));
  assert.equal(finder.findPath("b3/f1/room-103", entries[0].nodeId, "accessible"), null);
});

test("Building 5 inner-room guidance ends at explicit provisional front rooms without traversing them", () => {
  for (const [id, front] of [["104-1", "104"], ["302-1", "302"], ["308", "307"], ["310", "307"], ["311", "309"], ["312", "309"]]) {
    const room = places.find((p) => p.id === `5-${id}`);
    assert.equal(room.approachRoomId, `5-${front}`);
    assert.equal(room.nodeId, places.find((p) => p.id === `5-${front}`).nodeId);
  }
  for (const id of ["5-308", "5-310", "5-311", "5-312"]) {
    const place = places.find((p) => p.id === id);
    assert.match(place.description, /暫定推定/);
    const route = finder.findPath("b5/f2/entrance-side", place.nodeId);
    assert.ok(route.inferredConnections > 0);
    assert.equal(route.pathNodes.at(-1).id, place.nodeId);
    assert.equal(finder.findPath("b5/f2/entrance-side", place.nodeId, "shortest", false), null);
  }
  for (const num of ["403", "404"]) {
    const route = finder.findPath("b5/f2/entrance-side", `b5/f4/room-${num}`);
    assert.ok(route.pathNodes.some((n) => n.id === "b5/f4/office-hall-turn"));
  }
});
