import {surveyNotes,notesFor} from './fixtures/survey-notes.mjs';
import test from "node:test";
import assert from "node:assert/strict";
import { readData } from "../scripts/read-data.mjs";
import { compileCampus } from "../.checks/data/compile.js";
import { placeIndex, searchPlaces, placeRouteNotice } from "../.checks/data/places.js";
import { validateSources } from "../.checks/data/validate.js";
import { AStarPathfinder } from "../.checks/pathfinding/AStar.js";
import { pointInInterior, bounds, segmentIsWalkable } from "../.checks/data/geometry.js";

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
    assert.ok(notesFor("b1").includes(id));
  assert.match(notesFor("b1"), /仮転記/);
  for (const id of ["1-515", "1-516-2", "1-516-3"])
    assert.equal(places.find((p) => p.id === id).name, id);
  assert.deepEqual(searchPlaces(places, "1号館 515").map((p) => p.id), ["1-515"]);
  assert.ok(!places.some((p) => p.id.includes("unknown")));
});

test("Building 1 reaches registered corridor endpoints by stairs and EV without bridging unknown areas", () => {
  const entry = "b1/f1/entry-top";
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
  assert.ok(finder.findPath(entry, "b3/f1/room-103"));
  assert.equal(finder.findPath("b1/b1/ev-1", "b1/f1/ev-1", "accessible").floorChanges, 1);
});

test("Building 1 keeps the numbered entrance hall walkable and does not turn emergency signs into entrances", () => {
  const first = floors.find((f) => f.level === 1);
  assert.ok(!first.rooms.some((r) => r.id === "1-106"));
  assert.ok(!first.rooms.some((r) => pointInInterior([55, 0], r.polygon)));
  const entries = places.filter((p) => p.kind === "entrance");
  assert.equal(entries.length, 2);
  assert.ok(entries.every((p) => p.floorLevel === 1));
  assert.equal(searchPlaces(places, "1号館 106").filter((p) => p.kind === "entrance").length, 1);
  const top = entries.find(p => p.featureId === "entry-top");
  assert.match(top.description,/2号館側/);
  assert.doesNotMatch([top.description,...top.aliases].join(" "),/自動/);
  assert.match(entries.find(p => p.featureId === "entry-right").description,/東門側/);
  const firstNode = first.navigation.nodes.find((n) => n.id === "entry-top");
  assert.equal(pointInInterior(firstNode.position, first.outline), false);
  const route = finder.findPath("b1/f1/entry-top", "b1/f1/room-101");
  assert.ok(route.pathNodes.some((n) => n.position[2] < 0));
  assert.ok(source.buildings.find((b) => b.id === "b1").connections.every((e) => e.verification === "inferred"));
});


test("Building 1 provisional approaches stop at front rooms and use the B107/B109 gap for B108", () => {
  for (const [id, front] of [["1-516-1", "1-516"], ["1-516-2", "1-516"], ["1-B111-1", "1-B111"], ["1-B113-1", "1-B113"]]) {
    const place = places.find((p) => p.id === id), approach = places.find((p) => p.id === front);
    assert.equal(place.approachRoomId, front);
    assert.equal(place.nodeId, approach.nodeId);
    assert.ok(surveyNotes.includes(place.id));
    assert.match(placeRouteNotice(place), new RegExp(front));
    const route = finder.findPath("b1/f1/entry-top", place.nodeId);
    assert.equal(route.pathNodes.at(-1).id, approach.nodeId);
  }
  assert.equal(places.filter((p) => p.approachRoomId).length, 4);
  const basement = floors.find((f) => f.id === "b1");
  const b108 = places.find((p) => p.id === "1-B108");
  const route = finder.findPath("b1/b1/room-B109", b108.nodeId);
  assert.ok(route.pathNodes.some((n) => n.id === "b1/b1/hall-B108"));
  const end = basement.navigation.nodes.find((n) => n.id === "room-B108");
  assert.deepEqual(end.position, [78, 105]);
  assert.match(notesFor("b1"), /1-B107・1-B109間.*暫定推定/);
  for (const id of ["1-515", "1-516-3"]) {
    const place = places.find((p) => p.id === id);
    assert.ok(place.nodeId);
    assert.equal(place.approachRoomId, undefined);
  }
  const left = places.find((p) => p.id === "1-308-1"), right = places.find((p) => p.id === "1-308-2");
  assert.notEqual(left.nodeId, right.nodeId);
  for (const place of [left, right]) {
    assert.ok(notesFor("b1").includes(place.id));
    assert.equal(finder.findPath("b1/f1/entry-top", place.nodeId).pathNodes.at(-1).id, place.nodeId);
  }
});


test("Building 1 5F left rooms share a boundary and small rooms occupy 514 corners without overlapping it", () => {
  const fifth = floors.find((f) => f.id === "f5");
  const room = (id) => fifth.rooms.find((r) => r.id === id);
  const main = room("1-514"), upper = room("1-516-1");
  const cornerTop = room("1-515"), cornerBottom = room("1-512");
  const box = (r) => bounds(r.polygon);
  const top = (r) => box(r).z - box(r).d / 2;
  const bottom = (r) => box(r).z + box(r).d / 2;
  const right = (r) => box(r).x + box(r).w / 2;
  assert.equal(top(main), bottom(upper), "514 touches 516-1 without an intervening corridor");
  assert.equal(top(cornerTop), top(main));
  assert.equal(bottom(cornerBottom), bottom(main));
  for (const corner of [cornerTop, cornerBottom]) {
    assert.equal(right(corner), right(main));
    const b = box(corner);
    assert.ok(!pointInInterior([b.x, b.z], main.polygon), "small corner room is a notch, not an overlapping room");
  }
  assert.ok(!upper.entrance);
  assert.equal(upper.approachRoomId, "1-516");
  assert.ok(!fifth.navigation.nodes.some((n) => n.id === "room-516-1"));
});


test('1F lobby separates stairs from elevators with a through passage while adjoining room 1-105',()=>{
  const floor=floors.find(f=>f.id==='f1'),feature=id=>floor.features.find(f=>f.id===id);
  const stairs=bounds(feature('stairs-core').polygon),room=bounds(floor.rooms.find(r=>r.id==='1-105').polygon);
  assert.equal(stairs.z-stairs.d/2,room.z+room.d/2);
  assert.ok(stairs.x-stairs.w/2>=room.x-room.w/2&&stairs.x+stairs.w/2<=room.x+room.w/2);
  const obstacles=[...floor.rooms.map(r=>r.polygon),...floor.features.filter(f=>['stairs','elevator','restroom','service','pit'].includes(f.type)).map(f=>f.polygon)];
  assert.ok(segmentIsWalkable([71,55.5],[90,55.5],floor.outline,obstacles));
  for(const id of ['ev-1','ev-2']){
    const ev=bounds(feature(id).polygon);assert.ok(ev.z-ev.d/2>stairs.z+stairs.d/2);
    const entrance=floor.navigation.nodes.find(n=>n.id===id).position;assert.equal(entrance[1],ev.z-ev.d/2);
    const r=finder.findPath('b1/f1/entry-right',`b1/f1/${id}`,'accessible');assert.ok(r);
    assert.ok(r.pathNodes.some(n=>n.id.includes('hall-ev')));
    assert.ok(!r.pathNodes.some(n=>n.type==='stairs'));assert.equal(r.floorChanges,0);
  }
  const r=finder.findPath('b1/f1/entry-right','b1/f1/stairs-core');assert.ok(r);
  assert.ok(r.pathNodes.some(n=>Math.abs(n.position[2]-55.5)<1e-8));
});
