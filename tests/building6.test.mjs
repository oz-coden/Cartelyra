import {surveyNotes,notesFor} from './fixtures/survey-notes.mjs';
import test from "node:test";
import assert from "node:assert/strict";
import { readData } from "../scripts/read-data.mjs";
import { compileCampus } from "../.checks/data/compile.js";
import { placeIndex, searchPlaces } from "../.checks/data/places.js";
import { validateSources } from "../.checks/data/validate.js";
import { bounds, pointInPolygon, pointInInterior } from "../.checks/data/geometry.js";
import { AStarPathfinder } from "../.checks/pathfinding/AStar.js";
const source = await readData();
const campus = compileCampus(source.manifest, source.buildings, source.floors);
const floors = source.floors.filter((f) => f.buildingId === "b6");
const places = placeIndex(campus).filter((p) => p.buildingId === "b6");
const finder = new AStarPathfinder(campus);

test("Building 6 omits the unconfirmed 1F right stair and keeps the 3F same-floor split", () => {
  const first = floors.find(f => f.level === 1);
  assert.ok(!first.features.some(f => f.id === "stairs-right"));
  assert.ok(!first.navigation.nodes.some(n => n.id === "stairs-right"));
  assert.ok(!places.some(p => p.floorLevel === 1 && p.featureId === "stairs-right"));
  assert.ok(!source.buildings.find(b => b.id === "b6").connections.some(e =>
    [e.from,e.to].includes("b6/f1/stairs-right")));
  for (const level of [2,3,4]) assert.ok(finder.getNode(`b6/f${level}/stairs-right`));
  const route = finder.findPath("b6/f1/room-118", "b6/f2/room-208-1");
  assert.ok(route.pathNodes.some(n => n.id === "b6/f1/stairs-left"));
  assert.equal(route.floorChanges,1);
  assert.equal(finder.findPath("b6/f3/room-303", "b6/f3/room-308", "accessible"),null);
  assert.match(notesFor("b6"),/階内段差.*現地確認待ち/);
});

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

test("Building 6 reaches all registered room destinations by inferred stairs and explicit front-room endpoints", () => {
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
  assert.ok(places.filter((p) => p.kind === "room").every((p) => p.nodeId));
  assert.equal(places.find((p) => p.featureId === "stairs-lab").nodeId, undefined);
  assert.equal(finder.findPath(entry.nodeId, "b1/f1/entry-top"), null);
});

test("Building 6 avoids unknown grey areas and keeps the 3F right wing separate from its left corridor", () => {
  const start = "b6/f3/room-303", goal = "b6/f3/room-308";
  const route = finder.findPath(start, goal);
  assert.ok(route);
  assert.ok(route.pathNodes.some((n) => n.floor !== 3), "a missing same-floor link must not be replaced by a shortcut through the grey area");
  assert.ok(route.inferredConnections > 0);
  assert.match(notesFor("b6"),/同じ階.*特定できず/);
  assert.ok(source.buildings.find((b) => b.id === "b6").connections.every((e) => e.verification === "inferred"));
  assert.ok(floors.find((f) => f.level === 3).features.filter((f) => f.type === "service").length >= 2);
  assert.ok(!source.buildings.find((b) => b.id === "b6").connections.some((e) => e.from.includes("stairs-lab") || e.to.includes("stairs-lab")));
});


test("Building 6 revised approaches stop at 118/306-1 and enter 204 beside the WC", () => {
  for (const [id, front] of [["6-117", "6-118"], ["6-306", "6-306-1"]]) {
    const target = places.find((p) => p.id === id), approach = places.find((p) => p.id === front);
    assert.equal(target.approachRoomId, front);
    assert.equal(target.nodeId, approach.nodeId);
    assert.equal(finder.findPath("b6/f1/entry-left", target.nodeId).pathNodes.at(-1).id, approach.nodeId);
  }
  assert.equal(places.filter((p) => p.approachRoomId).length, 2);
  const second = floors.find((f) => f.level === 2);
  const entry = second.navigation.nodes.find((n) => n.id === "room-204");
  const wc = bounds(second.features.find((f) => f.id === "wc-left").polygon);
  assert.ok(entry.position[0] > wc.x + wc.w / 2, "204 enters through the portion extending beyond the WC");
  assert.ok(finder.findPath("b6/f2/entry-left", "b6/f2/room-204", "accessible"));
});

test("Building 6 revised room outlines remove artificial passage strips and keep entrances on exposed faces", () => {
  const third = floors.find((f) => f.level === 3), fourth = floors.find((f) => f.level === 4);
  const room = (f, id) => f.rooms.find((r) => r.id === id);
  const box305 = bounds(room(third, "6-305").polygon);
  for (const id of ["6-306", "6-306-1"]) {
    const b = bounds(room(third, id).polygon);
    assert.equal(b.x - b.w / 2, box305.x + box305.w / 2, "306 areas adjoin 305 without a corridor strip");
  }
  const front = third.navigation.nodes.find((n) => n.id === "room-306-1");
  assert.ok(front.position[1] < box305.z - box305.d / 2);
  assert.ok(!third.navigation.nodes.some((n) => n.id === "room-306"));
  const b407 = bounds(room(fourth, "6-407").polygon), b408 = bounds(room(fourth, "6-408").polygon), b406 = bounds(room(fourth, "6-406").polygon);
  assert.equal(b407.z + b407.d / 2, b408.z - b408.d / 2);
  const entry407 = fourth.navigation.nodes.find((n) => n.id === "room-407");
  assert.equal(entry407.position[0], b407.x + b407.w / 2);
  assert.ok(entry407.position[1] > b406.z + b406.d / 2);
  const second = floors.find((f) => f.level === 2), r208 = room(second, "6-208-2"), b208 = bounds(r208.polygon);
  let outerSegments = 0;
  for (let i = 0; i < second.outline.length; i++) {
    const a = second.outline[i], b = second.outline[(i + 1) % second.outline.length];
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    if (mid[0] > b208.x && mid[1] >= b208.z - b208.d / 2 && mid[1] < b208.z + b208.d / 2) {
      assert.ok(pointInPolygon(mid, r208.polygon), "208-2 reaches the stepped outer wall");
      assert.ok(!pointInInterior(mid, r208.polygon));
      outerSegments++;
    }
  }
  assert.ok(outerSegments >= 3);
  for (const id of ["6-412", "6-413"])
    assert.equal(places.find((p) => p.id === id).name, id + " 工学研究科演習室");
});
