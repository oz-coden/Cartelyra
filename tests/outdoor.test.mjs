import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseHTML } from "linkedom";
import { readData } from "../scripts/read-data.mjs";
import { compileCampus } from "../.checks/data/compile.js";
import { validateSources } from "../.checks/data/validate.js";
import { placeIndex, buildingCatalog } from "../.checks/data/places.js";
import { AStarPathfinder } from "../.checks/pathfinding/AStar.js";
import { FloorMap } from "../.checks/ui/FloorMap.js";
import { SearchPanel } from "../.checks/ui/SearchPanel.js";
const source = await readData();
const compile = (s) => compileCampus(s.manifest, s.buildings, s.floors);
const validate = (s) => validateSources(s.manifest, s.buildings, s.floors, s.sources, s.overview);
const campus = compile(source), places = placeIndex(campus, source.overview);

test("Building 3 has distinct Building 8/New East Gate-facing entrances; the outdoor route joins the Building 8 side to Building 20 via West Gate", () => {
  const entries = places.filter((p) => p.buildingId === "b3" && p.kind === "entrance");
  assert.deepEqual(entries.map((p) => p.featureId), ["entrance-north", "entrance-south"]);
  const finder = new AStarPathfinder(campus);
  for (const mode of ["shortest", "accessible", "indoor", "stairs"])
    for (const [a, b] of [["b3/f4/room-401", "b20/f4/room-420"], ["b20/f4/room-420", "b3/f4/room-401"]]) {
      const route = finder.findPath(a, b, mode);
      assert.ok(route, `${a} -> ${b} ${mode}`);
      const ids = route.pathNodes.map((n) => n.id);
      for (const id of ["b3/f1/entrance-north", "campus/outdoor/west-gate", "b20/f1/entrance-right"])
        assert.ok(ids.includes(id), id);
      assert.equal(route.floorChanges, 6);
      assert.equal(route.distanceUnit, "schematic");
      assert.equal(route.estimatedMinutes, 0);
      assert.ok(route.steps.some((s) => s.instruction.includes("屋外へ出る")));
      assert.ok(route.steps.some((s) => s.instruction.includes("建物に入る")));
      assert.ok(route.steps.every((s) => !/undefined|NaN/.test(s.instruction)));
      for (const n of route.pathNodes.filter((n) => !n.buildingId)) {
        assert.equal(n.floor, undefined);
        assert.equal(n.outdoorLayer, "ground");
      }
      if (mode === "accessible") assert.ok(!route.steps.some((s) => s.edgeType === "stairs"));
      assert.equal(finder.findPath(a, b, mode, false), null);
    }
  const west = places.find((p) => p.id === "campus/gate/west");
  assert.equal(west.nodeId, "campus/outdoor/west-gate");
  assert.ok(finder.findPath(west.nodeId, "b20/f1/room-113"));
  for (const p of places.filter((p) => p.kind === "gate" && p !== west)) assert.equal(p.nodeId, undefined);
  assert.ok(finder.findPath("b3/f1/entrance-south", "b3/f1/entrance-north"));
});

test("Outdoor costs and topology are independent of arbitrary indoor 3D origins and floor numbers", () => {
  const changed = structuredClone(source);
  for (const b of changed.buildings) { b.origin = [50000, 700, -30000]; b.rotation = 1.25; }
  const route = (s) => new AStarPathfinder(compile(s)).findPath("b3/f1/room-103", "b20/f2/room-210");
  const a = route(source), b = route(changed);
  assert.deepEqual(a.pathNodes.map((n) => n.id), b.pathNodes.map((n) => n.id));
  assert.equal(a.totalDistance, b.totalDistance);
});

test("Outdoor authoring rejects shortcuts through buildings, false layer transfers and non-entrance links", () => {
  assert.deepEqual(validate(source), []);
  const check = (mutate, pattern) => {
    const s = structuredClone(source); mutate(s.manifest.outdoor);
    assert.ok(validate(s).some((e) => pattern.test(e)), validate(s).join("\n"));
  };
  check((o) => o.edges.push({ ...o.edges[0], from: "b3-front", to: "avenue-west" }), /Outdoor edge crosses building/);
  check((o) => o.nodes.find((n) => n.id === "b12-east").layer = "bridge", /layer transfer needs explicit/);
  check((o) => o.links[0].to = "b3/f1/room-103", /must use a building entrance/);
  check((o) => o.links[0].to = "b3/f1/missing", /Missing outdoor entrance endpoint/);
  check((o) => o.edges[0].widthClass = "10m", /Invalid outdoor width/);
  check((o) => o.nodes.find((n) => n.gateId).gateId = "main", /Invalid outdoor gate binding/);
  check((o) => o.nodes[0].position = [o.nodes[0].position[0] - 1, o.nodes[0].position[1]], /must be on building overview boundary/);
  const closed = structuredClone(source);
  closed.manifest.outdoor.edges.find((e) => e.to === "west-gate").blocked = true;
  assert.deepEqual(validate(closed), []);
  assert.equal(new AStarPathfinder(compile(closed)).findPath("b3/f1/room-103", "b20/f1/room-113"), null);
});

test("Overview renders outdoor route segments while indoor plans keep their own coordinates", async () => {
  const { document, window } = parseHTML(await readFile(new URL("../index.html", import.meta.url), "utf8"));
  globalThis.document = document; globalThis.window = window;
  const map = new FloorMap(document.getElementById("map-canvas"), campus, source.overview);
  const route = new AStarPathfinder(campus).findPath("b3/f1/room-103", "b20/f1/room-113");
  map.setRoute(route); map.showOverview(true);
  assert.equal(document.querySelectorAll(".map-outdoor-path").length, source.manifest.outdoor.edges.length);
  assert.ok(document.querySelectorAll(".map-route").length > 0);
  assert.equal(document.querySelectorAll(".map-route-marker").length, 2);
  assert.match(document.querySelector("#map-canvas svg").getAttribute("aria-label"), /北が上/);
  assert.equal(document.querySelectorAll(".map-north-arrow").length, 1);
  assert.equal(document.querySelector("#map-caption a").getAttribute("href"), "https://maps.gsi.go.jp/development/ichiran.html");
  assert.match(document.querySelector('[data-place="campus/gate/west"]').getAttribute("aria-label"), /参考経路あり/);
  assert.match(document.querySelector('[data-place="campus/gate/main"]').getAttribute("aria-label"), /未登録/);
  const catalog = buildingCatalog(campus, source.overview);
  for (const id of ["b3", "b20"]) {
    const building = catalog.find((b) => b.id === id);
    map.setLocation(building, building.data.floors.find((f) => f.level === 1));
    map.showOverview(false);
    assert.equal(document.querySelectorAll(".map-north-arrow,#map-caption a").length, 0);
    assert.ok(document.querySelectorAll(".map-route").length > 0);
    assert.equal(document.querySelectorAll(".map-outdoor-path").length, 0);
  }
  const panel = new SearchPanel(places); panel.updateSummary(route);
  assert.equal(document.getElementById("summary-distance").textContent, "未測定");
  assert.equal(document.getElementById("summary-time").textContent, "未測定");
  assert.match(document.getElementById("route-confidence").textContent, /屋外区間はキャンパス図/);
  map.showOverview(true); map.setRoute(null);
  assert.equal(document.querySelectorAll(".map-route,.map-route-marker").length, 0);
});

test("Aerial reference metadata preserves attribution and rejects invalid scales, dates and source bindings", () => {
  assert.equal(source.manifest.coordinateUnit, "schematic");
  assert.equal(source.overview.reference.imageryDate, null);
  for (const [mutate, pattern] of [
    [(s) => s.overview.reference.pixelsPerUnit = 0, /Invalid overview reference scale/],
    [(s) => s.overview.reference.tileOrigin = [2 ** 18, 0], /Invalid overview reference tile origin/],
    [(s) => s.overview.reference.retrievedAt = "unknown", /Invalid overview reference date/],
    [(s) => s.overview.reference.attribution.url = "javascript:alert(1)", /Invalid overview attribution/],
    [(s) => s.manifest.outdoor.positionSourceId = "missing", /Unknown outdoor position source/],
  ]) {
    const s = structuredClone(source); mutate(s);
    assert.ok(validate(s).some((error) => pattern.test(error)));
  }
});
