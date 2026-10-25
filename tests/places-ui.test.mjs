import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseHTML } from "linkedom";
import { readData } from "../scripts/read-data.mjs";
import { compileCampus } from "../.checks/data/compile.js";
import { validateSources } from "../.checks/data/validate.js";
import {
  buildingCatalog,
  placeIndex,
  searchPlaces,
} from "../.checks/data/places.js";
import { LocationState } from "../.checks/ui/LocationState.js";
import { FloorControl } from "../.checks/ui/FloorControl.js";
import { FloorMap } from "../.checks/ui/FloorMap.js";
import { SearchPanel } from "../.checks/ui/SearchPanel.js";
import { StepGuide } from "../.checks/ui/StepGuide.js";
import { ThemeManager } from "../.checks/ui/ThemeManager.js";
import { AStarPathfinder } from "../.checks/pathfinding/AStar.js";

const source = await readData(),
  campus = compileCampus(source.manifest, source.buildings, source.floors),
  places = placeIndex(campus);
const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
function dom() {
  const { document, window } = parseHTML(html);
  globalThis.document = document;
  globalThis.window = window;
  return { document, window };
}
function key(window, el, key) {
  const event = new window.Event("keydown", {
    bubbles: true,
    cancelable: true,
  });
  Object.defineProperty(event, "key", { value: key });
  el.dispatchEvent(event);
}
function secondBuilding() {
  const d = structuredClone(source),
    second = structuredClone(d.buildings.find((b) => b.id === "b3"));
  second.id = "b99";
  second.name = "99号館";
  second.code = "99";
  second.origin = [200, 0, 10];
  second.connections = second.connections.map((e) => ({
    ...e,
    from: e.from.replace("b3/", "b99/"),
    to: e.to.replace("b3/", "b99/"),
  }));
  d.manifest.buildingIds.push("b99");
  d.buildings.push(second);
  d.floors.push(
    ...structuredClone(d.floors.filter((f) => f.buildingId === "b3")).map((f) => ({
      ...f,
      buildingId: "b99",
      rooms: f.rooms.map((r) => ({ ...r, id: r.id.replace("3-", "99-") })),
    })),
  );
  return d;
}
const validate = (d) =>
  validateSources(d.manifest, d.buildings, d.floors, d.sources, d.overview);

test("17 WCs and AED have explicit provisional connections; every linked place is reachable in four modes", () => {
  const b3Places = places.filter((p) => p.buildingId === "b3");
  assert.equal(b3Places.filter((p) => p.kind === "restroom").length, 17);
  assert.equal(b3Places.filter((p) => p.kind === "aed").length, 1);
  assert.equal(new Set(places.map((p) => p.id)).size, places.length);
  const finder = new AStarPathfinder(campus);
  for (const mode of ["shortest", "accessible", "indoor", "stairs"])
    for (const place of b3Places.filter((p) => p.nodeId)) {
      assert.ok(
        finder.findPath("b3/f1/room-103", place.nodeId, mode),
        `${mode} ${place.id}`,
      );
      assert.ok(finder.findPath(place.nodeId, "b3/f1/room-103", mode));
      if (place.kind === "restroom" || place.kind === "aed")
        assert.equal(
          finder.findPath("b3/f1/room-103", place.nodeId, mode, false),
          null,
        );
    }
  assert.equal(searchPlaces(b3Places, "ＷＣ").length, 17);
  assert.equal(searchPlaces(places, "3号館 2F 女性")[0].restroomType, "female");
  assert.ok(
    searchPlaces(places, "トイレ", "b3", 3)
      .slice(0, 3)
      .every((p) => p.floorLevel === 3),
  );
  assert.equal(searchPlaces(b3Places, "多目的").length, 5);
  assert.ok(searchPlaces(places, "B202").some((p) => !p.nodeId));
});

test("building catalog includes all overview buildings; floor state is scoped and supports level zero", () => {
  const d = secondBuilding(),
    data = compileCampus(d.manifest, d.buildings, d.floors),
    catalog = buildingCatalog(data, d.overview),
    state = new LocationState(catalog);
  assert.equal(catalog.length, 31);
  assert.equal(state.buildingId, "b1");
  state.selectBuilding("b3");
  state.selectFloor(4);
  state.selectBuilding("b99");
  assert.equal(state.floorLevel, 1);
  state.selectFloor(-1);
  state.selectBuilding("b3");
  assert.equal(state.floorLevel, 4);
  state.selectBuilding("b99");
  assert.equal(state.floorLevel, -1);
  assert.equal(state.selectFloor(99), false);
  state.selectBuilding("b2");
  assert.equal(state.floorLevel, null);
  assert.equal(state.floor, undefined);
  assert.equal(state.selectBuilding("missing"), false);
  assert.equal(state.buildingId, "b2");
  const zeroFloor = structuredClone(data.buildings.find((b) => b.id === "b99").floors[0]);
  zeroFloor.level = 0;
  zeroFloor.label = "G";
  const only = new LocationState([
    {
      id: "b99",
      name: "99号館",
      data: { ...data.buildings.find((b) => b.id === "b99"), floors: [zeroFloor] },
    },
  ]);
  assert.equal(only.floorLevel, 0);
});

test("campus connections compile and route between buildings; steps retain building identity", () => {
  const d = secondBuilding();
  d.manifest.connections = [
    {
      from: "b3/f1/nw",
      to: "b99/f1/nw",
      type: "outdoor",
      routingCost: 20,
      verification: "inferred",
      isIndoor: false,
      isAccessible: true,
    },
  ];
  assert.deepEqual(validate(d), []);
  const data = compileCampus(d.manifest, d.buildings, d.floors),
    result = new AStarPathfinder(data).findPath(
      "b3/f1/room-103",
      "b99/f2/wc-w-entrance",
    );
  assert.ok(result);
  assert.equal(result.steps[0].buildingId, "b3");
  assert.equal(result.steps.at(-1).buildingId, "b99");
  const state = new LocationState(buildingCatalog(data, d.overview));
  state.focusNode(result.pathNodes.at(-1));
  assert.equal(state.buildingId, "b99");
  assert.equal(state.floorLevel, 2);
  d.manifest.connections[0].to = "b99/f1/missing";
  assert.ok(
    validate(d).some((e) => e.includes("Missing campus edge endpoint")),
  );
});

test("facility reference errors are detected; closures do not invalidate structural authoring", () => {
  const d = structuredClone(source),
    floor = d.floors.find((f) => f.buildingId === "b3" && f.id === "f1"),
    wc = floor.features.find((f) => f.id === "wc-w");
  wc.entrance = "missing";
  assert.ok(validate(d).some((e) => e.includes("missing facility entrance")));
  wc.entrance = "wc-w-entrance";
  floor.navigation.edges.find((e) => e.from === wc.entrance).blocked = true;
  assert.deepEqual(validate(d), []);
  const finder = new AStarPathfinder(
    compileCampus(d.manifest, d.buildings, d.floors),
  );
  assert.equal(finder.findPath("b3/f1/room-103", "b3/f1/wc-w-entrance"), null);
  const f = structuredClone(source);
  f.floors.find((x) => x.buildingId === "b3" && x.id === "f1").level = 0;
  assert.deepEqual(validate(f), []);
});

test("SVG exposes WCs and all buildings to keyboard selection, with an honest empty state", () => {
  const { document, window } = dom(),
    map = new FloorMap(
      document.getElementById("map-canvas"),
      campus,
      source.overview,
    ),
    catalog = buildingCatalog(campus, source.overview);
  map.setLocation(
    catalog.find((b) => b.id === "b3"),
    campus.buildings[0].floors.find((f) => f.level === 1),
  );
  let chosen;
  map.onPlaceSelect = (p) => (chosen = p);
  const wc = document.querySelector('[data-place="b3/f1/feature/wc-w"]');
  assert.equal(wc.getAttribute("role"), "button");
  assert.match(wc.getAttribute("aria-label"), /女性用トイレ/);
  key(window, wc, "Enter");
  assert.equal(chosen.kind, "restroom");
  map.selectPlace(chosen.id);
  assert.ok(wc.classList.contains("selected"));
  const finder = new AStarPathfinder(campus);
  map.setRoute(finder.findPath("b3/f1/room-103", chosen.nodeId));
  assert.equal(document.querySelector('[data-place="b3/f1/feature/wc-w"]'), wc);
  assert.ok(document.querySelectorAll(".map-route").length > 0);
  map.showOverview(true);
  let building;
  map.onBuildingSelect = (id) => (building = id);
  const groups = [...document.querySelectorAll(".map-campus-building")];
  assert.equal(groups.length, 30);
  assert.ok(groups.every((g) => g.getAttribute("role") === "button"));
  key(
    window,
    groups.find((g) => g.getAttribute("aria-label").startsWith("2号館")),
    " ",
  );
  assert.equal(building, "b2");
  map.setLocation(catalog.find((b) => b.id === "b2"));
  map.showOverview(false);
  assert.match(document.getElementById("map-caption").textContent, /未登録/);
  assert.equal(document.querySelectorAll("[data-place]").length, 0);
});

test("equal floor numbers in another building cannot leak route markers into an SVG map", () => {
  const { document } = dom(),
    d = secondBuilding(),
    data = compileCampus(d.manifest, d.buildings, d.floors),
    catalog = buildingCatalog(data, d.overview);
  const map = new FloorMap(
    document.getElementById("map-canvas"),
    data,
    d.overview,
  );
  map.setLocation(
    catalog.find((b) => b.id === "b3"),
    data.buildings[0].floors.find((f) => f.level === 1),
  );
  map.setRoute(
    new AStarPathfinder(data).findPath(
      "b99/f1/room-103",
      "b99/f1/wc-m-entrance",
    ),
  );
  assert.equal(
    document.querySelectorAll(".map-route-marker,.map-route").length,
    0,
  );
  map.setLocation(
    catalog.find((b) => b.id === "b99"),
    data.buildings.find((b) => b.id === "b99").floors.find((f) => f.level === 1),
  );
  assert.ok(document.querySelectorAll(".map-route-marker").length > 0);
  assert.match(document.getElementById("map-heading").textContent, /99号館/);
});

test("floor controls list only the selected building and do not invent a ground floor", () => {
  const { document } = dom(),
    controls = new FloorControl(),
    floor = structuredClone(campus.buildings[0].floors[0]);
  floor.level = 0;
  floor.label = "G";
  let chosen;
  controls.onFloorChange = (n) => (chosen = n);
  controls.render([floor], 0);
  const buttons = document.querySelectorAll("#floor-buttons button");
  assert.equal(buttons.length, 1);
  assert.equal(buttons[0].textContent, "G");
  buttons[0].click();
  assert.equal(chosen, 0);
  controls.render([], null);
  assert.equal(document.querySelectorAll("#floor-buttons button").length, 0);
  assert.equal(
    document.getElementById("explode-level-badge").textContent,
    "未登録",
  );
});

test("WC search supports keyboard choice, route results, editing and pick-mode reset", () => {
  const { document, window } = dom(),
    panel = new SearchPanel(places),
    finder = new AStarPathfinder(campus);
  panel.setContext("b3", 1);
  let mode,
    result,
    clearCount = 0;
  panel.onPickModeToggle = (x) => (mode = x);
  panel.onRouteSearch = (a, b, filter, inferred) =>
    (result = finder.findPath(a, b, filter, inferred));
  panel.onRouteClear = () => clearCount++;
  document.getElementById("btn-pick-dest").click();
  assert.equal(mode, "dest");
  panel.setStart("b3/f1/room-103", "展示ホール");
  const input = document.getElementById("input-dest");
  input.value = "WC 女性";
  input.dispatchEvent(new window.Event("input"));
  assert.ok(document.querySelectorAll("#suggestions-dest button").length > 0);
  key(window, input, "ArrowDown");
  key(window, input, "Enter");
  assert.equal(mode, "none");
  assert.ok(result);
  assert.equal(result.pathNodes.at(-1).id, "b3/f1/wc-w-entrance");
  assert.match(input.value, /3号館 1F/);
  panel.updateSummary(result);
  assert.equal(
    document.getElementById("summary-distance").textContent,
    "未測定",
  );
  input.value = "別の場所";
  input.dispatchEvent(new window.Event("input"));
  assert.ok(clearCount > 0);
  assert.ok(
    document.getElementById("route-summary-panel").classList.contains("hidden"),
  );
  document.getElementById("btn-pick-start").click();
  key(window, input, "Escape");
  assert.equal(mode, "none");
});

test("explicit building and floor queries do not match longer numbers or basement labels", () => {
  assert.deepEqual(searchPlaces(places, "3号館 B202").map(p=>p.id), ["3-B202"]);
  assert.deepEqual(searchPlaces(places, "２３号館 B202").map(p=>p.id), ["23-B202"]);
  for(const level of [2,-2]){
    const matches=searchPlaces(places, `23号館 ${level===2?'2F':'B2F'}`);
    assert.ok(matches.length>0);
    assert.ok(matches.every(p=>p.buildingId==='b23'&&p.floorLevel===level));
  }
  assert.ok(searchPlaces(places, "1号館").every(p=>p.buildingId==='b1'));
});

test("exact room numbers, names and aliases outrank nearby partial matches", () => {
  for (const query of ["3-101", "３−１０１", " 3-101 ", "3号館 3-101"])
    assert.equal(searchPlaces(places, query, "b23", 1)[0].id, "3-101");
  assert.equal(searchPlaces(places, "7-21", "b17", 2)[0].id, "7-21");
  assert.equal(searchPlaces(places, "3-B202", "b23", -2)[0].id, "3-B202",
    "an exact unlinked room still precedes routable partial matches");
  const exact = { ...places[0], id: "exact", name: "受付", aliases: ["案内所"], roomId: undefined, buildingId: "b3" };
  const nearby = { ...exact, id: "nearby", name: "受付前の案内所", aliases: [], buildingId: "b23" };
  for (const query of ["受付", "案内所"])
    assert.equal(searchPlaces([nearby, exact], query, "b23", 1)[0].id, "exact");
  assert.ok(searchPlaces(places, "WC", "b3", 2).slice(0, 3)
    .every(p => p.buildingId === "b3" && p.floorLevel === 2));
});

test("Enter selects the exact room number while a different building is displayed", () => {
  const { document, window } = dom(), panel = new SearchPanel(places);
  panel.setContext("b23", 1);
  let focused, destination;
  panel.onPlaceFocus = place => { focused = place; };
  panel.onRouteSearch = (_start, dest) => { destination = dest; };
  panel.setStart("b23/f1/room-101", "23-101");
  const input = document.getElementById("input-dest");
  input.value = "3-101";
  input.dispatchEvent(new window.Event("input"));
  key(window, input, "Enter");
  assert.equal(focused.id, "3-101");
  assert.equal(destination, "b3/f1/room-101");
  assert.match(input.value, /^3-101 .*3号館 1F/);
});

test("unlinked rooms can be named as endpoints without inventing navigation nodes", () => {
  const { document, window } = dom(),
    panel = new SearchPanel(places);
  let focus,
    searches = 0;
  panel.onPlaceFocus = (p) => (focus = p);
  panel.onRouteSearch = (_start, dest) => {
    searches++;
    assert.equal(dest, "3-B202");
  };
  panel.setStart("b3/f1/room-103", "展示ホール");
  const input = document.getElementById("input-dest");
  input.value = "3号館 B202";
  input.dispatchEvent(new window.Event("input"));
  document.querySelector("#suggestions-dest button").click();
  assert.equal(focus.roomId, "3-B202");
  assert.equal(searches, 1);
});

test("step instructions render as text in keyboard-operable buttons; theme survives blocked storage", () => {
  const { document } = dom(),
    guide = new StepGuide();
  let clicked;
  guide.onStepClick = (s) => (clicked = s);
  const step = {
    stepNumber: 1,
    instruction: "<img src=x onerror=alert(1)>",
    nodeId: "x",
    position: [0, 0, 0],
    floor: 1,
    buildingId: "b3",
    distance: 0,
  };
  guide.showSteps([step]);
  const button = document.querySelector("#step-guide-list button");
  assert.ok(button);
  assert.equal(document.querySelector("#step-guide-list img"), null);
  assert.ok(button.textContent.includes("<img"));
  button.click();
  assert.equal(clicked, step);
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    get() {
      throw new Error("Storage disabled");
    },
  });
  const theme = new ThemeManager();
  assert.doesNotThrow(() => theme.toggleTheme());
  assert.equal(theme.getIsDark(), true);
  delete globalThis.localStorage;
});
