import test from "node:test";
import assert from "node:assert/strict";
import { readData } from "../scripts/read-data.mjs";
import { compileCampus } from "../.checks/data/compile.js";
import { placeIndex, searchPlaces, placeRouteNotice } from "../.checks/data/places.js";
import { validateSources } from "../.checks/data/validate.js";
import { AStarPathfinder } from "../.checks/pathfinding/AStar.js";
import { pointInInterior } from "../.checks/data/geometry.js";

const source = await readData();
const campus = compileCampus(source.manifest, source.buildings, source.floors);
const building = campus.buildings.find((b) => b.id === "b1");
const floors = source.floors.filter((f) => f.buildingId === "b1");
const places = placeIndex(campus).filter((p) => p.buildingId === "b1");
const finder = new AStarPathfinder(campus);

test("Building 1 preserves nine floor layouts, occupied centres and corrected labels", () => {
  assert.deepEqual(validateSources(source.manifest, source.buildings, source.floors, source.sources, source.overview), []);
  assert.deepEqual(building.floors.map((f) => f.level), [-1, 1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(building.floors.map((f) => f.rooms.length), [19, 5, 11, 11, 19, 19, 25, 25, 5]);
  assert.equal(places.filter((p) => p.kind === "restroom").length, 23);
  assert.equal(places.filter((p) => p.restroomType === "multipurpose").length, 3);
  assert.equal(places.filter((p) => p.kind === "elevator").length, 18);
  assert.equal(places.filter((p) => p.kind === "stairs").length, 18);
  const third = floors.find((f) => f.level === 3), fourth = floors.find((f) => f.level === 4);
  assert.equal(third.voids.length, 0);
  assert.equal(fourth.voids.length, 0);
  assert.ok(third.rooms.some((r) => r.id === "1-308-1"));
  assert.ok(third.rooms.some((r) => r.id === "1-308-2"));
  assert.ok(fourth.rooms.some((r) => r.id === "1-401"));
  for (const floor of floors.filter((f) => [2, 5, 6, 7, 8].includes(f.level)))
    assert.equal(floor.voids.length, 1);
  for (const id of ["1-103", "1-309", "1-412", "1-419", "1-803"])
    assert.ok(!places.some((p) => p.id === id), id);
  assert.equal(searchPlaces(places, "1号館 多目的会議室")[0].id, "1-804");
  for (const id of ["1-618", "1-619", "1-620", "1-607"])
    assert.match(places.find((p) => p.id === id).description, /照合済み/);
  assert.match(places.find((p) => p.id === "1-501").description, /仮転記/);
  for (const id of ["1-515", "1-516-2", "1-516-3"])
    assert.equal(places.find((p) => p.id === id).name, id);
  assert.deepEqual(searchPlaces(places, "1号館 515").map((p) => p.id), ["1-515"]);
  assert.ok(!places.some((p) => p.id.includes("unknown")));
});

test("Building 1 reaches registered corridor endpoints by stairs and EV without bridging unknown areas", () => {
  const entry = "b1/f1/entry-top-left";
  for (const place of places.filter((p) => p.nodeId)) {
    for (const mode of ["shortest", "indoor", "stairs", "accessible"]) {
      const route = finder.findPath(entry, place.nodeId, mode);
      assert.ok(route, `${place.id}: ${mode}`);
      assert.ok(route.pathNodes.every((n) => n.buildingId === "b1"));
      assert.equal(route.distanceUnit, "schematic");
      const index = place.floorLevel === -1 ? 0 : place.floorLevel;
      assert.equal(route.floorChanges, Math.abs(index - 1), place.id);
      if (mode === "accessible") {
        assert.ok(route.steps.every((step) => step.edgeType !== "stairs"));
        if (place.floorLevel !== 1)
          assert.ok(route.steps.some((step) => step.edgeType === "elevator"));
      }
    }
    if (place.nodeId !== entry)
      assert.equal(finder.findPath(entry, place.nodeId, "shortest", false), null);
  }
  assert.equal(places.filter((p) => p.kind === "room").length, 139);
  assert.ok(places.filter((p) => p.kind === "room").every((p) => p.nodeId));
  assert.equal(finder.findPath(entry, "b3/f1/room-103"), null);
  assert.equal(finder.findPath("b1/b1/ev-1", "b1/f1/ev-1", "accessible").floorChanges, 1);
});

test("Building 1 keeps the numbered entrance hall walkable and does not turn emergency signs into entrances", () => {
  const first = floors.find((f) => f.level === 1);
  assert.ok(!first.rooms.some((r) => r.id === "1-106"));
  assert.ok(!first.rooms.some((r) => pointInInterior([55, 0], r.polygon)));
  const entries = places.filter((p) => p.kind === "entrance");
  assert.equal(entries.length, 3);
  assert.ok(entries.every((p) => p.floorLevel === 1));
  assert.equal(searchPlaces(places, "1号館 106").filter((p) => p.kind === "entrance").length, 2);
  const firstNode = first.navigation.nodes.find((n) => n.id === "entry-top-left");
  assert.equal(pointInInterior(firstNode.position, first.outline), false);
  const route = finder.findPath("b1/f1/entry-top-left", "b1/f1/room-101");
  assert.ok(route.pathNodes.some((n) => n.position[2] < 0));
  assert.ok(source.buildings.find((b) => b.id === "b1").connections.every((e) => e.verification === "inferred"));
});


test("Building 1 provisional approaches stop at front rooms and use the B107/B109 gap for B108", () => {
  for (const [id, front] of [["1-516-2", "1-516"], ["1-B111-1", "1-B111"], ["1-B113-1", "1-B113"]]) {
    const place = places.find((p) => p.id === id), approach = places.find((p) => p.id === front);
    assert.equal(place.approachRoomId, front);
    assert.equal(place.nodeId, approach.nodeId);
    assert.match(place.description, /暫定推定/);
    assert.match(placeRouteNotice(place), new RegExp(front));
    const route = finder.findPath("b1/f1/entry-top-left", place.nodeId);
    assert.equal(route.pathNodes.at(-1).id, approach.nodeId);
  }
  assert.equal(places.filter((p) => p.approachRoomId).length, 3);
  const basement = floors.find((f) => f.id === "b1");
  const b108 = places.find((p) => p.id === "1-B108");
  const route = finder.findPath("b1/b1/room-B109", b108.nodeId);
  assert.ok(route.pathNodes.some((n) => n.id === "b1/b1/hall-B108"));
  const end = basement.navigation.nodes.find((n) => n.id === "room-B108");
  assert.deepEqual(end.position, [78, 105]);
  assert.match(b108.description, /1-B107・1-B109間.*暫定推定/);
  for (const id of ["1-515", "1-516-3"]) {
    const place = places.find((p) => p.id === id);
    assert.ok(place.nodeId);
    assert.equal(place.approachRoomId, undefined);
  }
  const left = places.find((p) => p.id === "1-308-1"), right = places.find((p) => p.id === "1-308-2");
  assert.notEqual(left.nodeId, right.nodeId);
  for (const place of [left, right]) {
    assert.match(place.description, /暫定.*現地調査で見直す/);
    assert.equal(finder.findPath("b1/f1/entry-top-left", place.nodeId).pathNodes.at(-1).id, place.nodeId);
  }
});
