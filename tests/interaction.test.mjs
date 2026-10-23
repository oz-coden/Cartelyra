import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseHTML } from "linkedom";
import { createServer } from "vite";
import * as THREE from "three";

async function setup() {
  const { document, window } = parseHTML(
    await readFile(new URL("../index.html", import.meta.url), "utf8"),
  );
  globalThis.document = document;
  globalThis.window = window;
  globalThis.requestAnimationFrame = () => 1;
  globalThis.cancelAnimationFrame = () => {};
  Object.defineProperty(window.HTMLSelectElement.prototype, "value", {
    configurable: true,
    get() {
      return (
        [...this.options].find((o) => o.hasAttribute("selected"))?.value ??
        this.options[0]?.value ??
        ""
      );
    },
    set(value) {
      for (const option of this.options)
        option.toggleAttribute("selected", option.value === value);
    },
  });
  window.HTMLCanvasElement.prototype.getContext = () => ({
    beginPath() {},
    roundRect() {},
    fill() {},
    stroke() {},
    fillText() {},
    fillRect() {},
    createLinearGradient() {
      return { addColorStop() {} };
    },
  });
  const server = await createServer({
    server: { middlewareMode: true, hmr: false, ws: false },
    optimizeDeps: { noDiscovery: true, include: [] },
    appType: "custom",
  });
  return { document, window, server };
}
const click = (window, element) =>
  element.dispatchEvent(new window.Event("click", { bubbles: true }));

test("registered gates are searchable, selectable and routable on the overview", async () => {
  const { document, window, server } = await setup();
  try {
    const { UniviewApp } = await server.ssrLoadModule("/src/main.ts");
    new UniviewApp();
    document.getElementById("btn-view-campus").click();
    assert.equal(document.querySelectorAll(".map-campus-gate").length, 4);
    document.getElementById("btn-pick-start").click();
    const gate = document.querySelector('[data-place="campus/gate/main"]');
    const enter = new window.Event("keydown", {
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(enter, "key", { value: "Enter" });
    gate.dispatchEvent(enter);
    assert.equal(document.body.dataset.view, "campus");
    assert.match(document.getElementById("input-start").value, /正門/);
    assert.equal(
      document.getElementById("btn-pick-start").getAttribute("aria-pressed"),
      "false",
    );
    assert.ok(gate.classList.contains("selected"));
    const input = document.getElementById("input-dest");
    input.value = "西門";
    input.dispatchEvent(new window.Event("input"));
    document.querySelector("#suggestions-dest button").click();
    assert.match(input.value, /西門/);
    assert.ok(!document.getElementById("route-summary-panel").classList.contains("hidden"));
    assert.ok(document.querySelectorAll(".map-route").length>0);
    assert.equal(document.querySelectorAll("#gate-list button").length, 4);
    document.getElementById("btn-view-floor").click();
    document.querySelector("#gate-list button").click();
    assert.equal(document.body.dataset.view, "campus");
    assert.equal(document.getElementById("tooltip-title").textContent, "正門");
  } finally {
    await server.close();
  }
});

test("3D picking, anchored action bubble, endpoint routing, highlighting and gap controls work together without moving the camera", async () => {
  const { document, window, server } = await setup();
  try {
    const [{ UniviewApp }, { ThreeView }] = await Promise.all([
      server.ssrLoadModule("/src/main.ts"),
      server.ssrLoadModule("/src/scene/ThreeView.ts"),
    ]);
    const canvas = document.createElement("canvas");
    canvas.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      width: 1000,
      height: 700,
    });
    const host = {
      scene: new THREE.Scene(),
      camera: new THREE.PerspectiveCamera(45, 1000 / 700, 0.1, 1500),
      renderer: { domElement: canvas },
      controls: { maxDistance: 450 },
      moves: 0,
      setActive() {},
      setDarkTheme() {},
      resize() {},
      flyTo(target, position) {
        this.moves++;
        this.camera.position.copy(position);
        this.camera.lookAt(target);
        this.camera.updateMatrixWorld(true);
      },
    };
    let view;
    const app = new UniviewApp(async (data, container) => {
      container.append(canvas);
      view = new ThreeView(data, container, host);
      return view;
    });
    const select = document.getElementById("building-select");
    select.value = "b3";
    select.dispatchEvent(new window.Event("change"));
    document.getElementById("btn-view-3d").click();
    // setView awaits the lazy view factory; drain those microtasks before observing it.
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(document.body.dataset.view, "3d");
    assert.ok(view);
    assert.equal(document.getElementById("show-all-floors").checked, true);
    const allGroups = host.scene.children
      .flatMap((g) => g.children)
      .flatMap((g) => g.children)
      .filter((g) => g.userData.type === "floor");
    assert.equal(allGroups.filter((g) => g.visible).length, 6);
    const showAll = document.getElementById("show-all-floors");
    showAll.checked = false;
    showAll.dispatchEvent(new window.Event("change"));
    assert.equal(allGroups.filter((g) => g.visible).length, 1);
    const findMesh = (id) => {
      let found;
      host.scene.traverse((o) => {
        if (o.userData.placeId === id) found = o;
      });
      return found;
    };
    const pick = (id) => {
      const mesh = findMesh(id);
      host.scene.updateMatrixWorld(true);
      const world = new THREE.Box3()
        .setFromObject(mesh)
        .getCenter(new THREE.Vector3());
      world.y += 4;
      // A top-down camera makes the chosen mesh the first ray hit; moving it is a test setup operation.
      host.camera.position.copy(world).add(new THREE.Vector3(0, 100, 0));
      host.camera.up.set(0, 0, -1);
      host.camera.lookAt(world);
      host.camera.updateMatrixWorld(true);
      const before = host.camera.position.clone(),
        moves = host.moves;
      for (const type of ["pointerdown", "pointerup"]) {
        const e = new window.Event(type);
        Object.assign(e, {
          clientX: 500,
          clientY: 350,
          pointerId: 1,
          button: 0,
        });
        canvas.dispatchEvent(e);
      }
      assert.ok(host.camera.position.equals(before));
      assert.equal(
        host.moves,
        moves,
        "selecting a place must not request camera movement",
      );
      const anchor = view.getPlaceAnchor(id);
      assert.ok(anchor, "visible selected meshes need a projected bubble anchor");
      assert.ok(Math.abs(anchor.x - 500) < 0.01);
      assert.ok(Math.abs(anchor.y - 350) < 0.01);
      return mesh;
    };
    document.getElementById("btn-pick-start").click();
    const room = pick("3-103");
    assert.match(document.getElementById("input-start").value, /3-103/);
    assert.ok(room.material.emissiveIntensity > 0);
    assert.equal(
      document.getElementById("btn-pick-start").getAttribute("aria-pressed"),
      "false",
    );
    document.getElementById("btn-pick-dest").click();
    const wc = pick("b3/f1/feature/wc-w");
    assert.match(document.getElementById("input-dest").value, /女性用トイレ/);
    assert.ok(wc.material.emissiveIntensity > 0);
    assert.equal(room.material.emissiveIntensity, 0);
    assert.equal(
      document.getElementById("room-tooltip").closest("main")?.className,
      "map-workspace",
    );
    assert.ok(
      !document.getElementById("room-tooltip").classList.contains("hidden"),
    );
    assert.ok(
      !document.getElementById("step-guide").classList.contains("hidden"),
    );
    // The same action card remains usable after direct 3D picking and route calculation.
    document.getElementById("btn-tooltip-set-start").click();
    assert.match(document.getElementById("input-start").value, /女性用トイレ/);
    const gap = document.getElementById("explode-slider");
    gap.value = "100";
    gap.dispatchEvent(new window.Event("input"));
    assert.equal(showAll.checked, true);
    assert.equal(allGroups.filter((g) => g.visible).length, 6);
    for (const group of allGroups)
      assert.equal(
        group.position.y,
        group.userData.baseElevation + group.userData.stackIndex * 9,
      );
    assert.equal(document.getElementById("explode-value").textContent, "100%");
    const anchorBefore = view.getPlaceAnchor("b3/f1/feature/wc-w");
    showAll.checked = false;
    showAll.dispatchEvent(new window.Event("change"));
    assert.equal(view.getPlaceAnchor("3-401"), null, "hidden floors have no bubble anchor");
    showAll.checked = true;
    showAll.dispatchEvent(new window.Event("change"));
    const anchorAfter = view.getPlaceAnchor("b3/f1/feature/wc-w");
    assert.deepEqual(anchorAfter, anchorBefore);
    let viewChanges = 0;
    const update = view.onViewChange;
    view.onViewChange = () => { viewChanges++; update?.(); };
    host.onFrame();
    assert.equal(viewChanges, 1, "render frames update the bubble after camera motion");
    const moves = host.moves;
    pick("3-401");
    assert.equal(host.moves, moves);
    assert.equal(document.getElementById("explode-slider").value, "100");
    assert.equal(showAll.checked, true);
    assert.equal(allGroups.filter((g) => g.visible).length, 6);
    // Setting a point on another floor must retain the viewed floor and expanded model.
    document.getElementById("btn-tooltip-set-dest").click();
    assert.match(
      document.getElementById("explode-level-badge").textContent,
      /4F/,
    );
    assert.equal(showAll.checked, true);
    view.setTheme(true);
    assert.ok(findMesh("3-401").material.emissiveIntensity > 0);
    assert.equal(wc.material.emissiveIntensity, 0);
    document.getElementById("btn-close-selection").click();
    assert.equal(findMesh("3-401").material.emissiveIntensity, 0);
    document.getElementById("btn-pick-start").click();
    document.getElementById("btn-cancel-pick").click();
    assert.equal(
      document.getElementById("btn-pick-start").getAttribute("aria-pressed"),
      "false",
    );
    gap.value = "0";
    gap.dispatchEvent(new window.Event("input"));
    for (const group of allGroups)
      assert.equal(group.position.y, group.userData.baseElevation);
    let selections = 0;
    const onSelect = view.onPlaceSelect;
    view.onPlaceSelect = (id) => {
      selections++;
      onSelect(id);
    };
    const pointer = (type, id, x = 500, button = 0) => {
      const e = new window.Event(type);
      Object.assign(e, { clientX: x, clientY: 350, pointerId: id, button });
      canvas.dispatchEvent(e);
    };
    pointer("pointerdown", 1);
    pointer("pointermove", 1, 600);
    pointer("pointermove", 1);
    pointer("pointerup", 1);
    pointer("pointerdown", 1);
    pointer("pointerdown", 2);
    pointer("pointerup", 2);
    pointer("pointerup", 1);
    pointer("pointerdown", 1, 500, 2);
    pointer("pointerup", 1, 500, 2);
    pointer("pointerdown", 1);
    pointer("pointercancel", 1);
    pointer("pointerup", 1);
    assert.equal(
      selections,
      0,
      "drag, multi-touch, right button and cancellation must not choose a place",
    );
    pick("3-401");
    assert.equal(selections, 1);
    assert.ok(app);
  } finally {
    await server.close();
  }
});

async function setupThree() {
  const env = await setup();
  try {
    const [{ UniviewApp }, { ThreeView }, { campusData }, { AStarPathfinder }] = await Promise.all([
      env.server.ssrLoadModule("/src/main.ts"),
      env.server.ssrLoadModule("/src/scene/ThreeView.ts"),
      env.server.ssrLoadModule("/src/data/load.ts"),
      env.server.ssrLoadModule("/src/pathfinding/AStar.ts"),
    ]);
    const canvas = env.document.createElement("canvas");
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 700 });
    const host = {
      scene: new THREE.Scene(),
      camera: new THREE.PerspectiveCamera(45, 1000 / 700, 0.1, 1500),
      renderer: { domElement: canvas },
      controls: { maxDistance: 450 },
      moves: 0,
      setActive() {}, setDarkTheme() {}, resize() {},
      flyTo(target, position) {
        this.moves++;
        this.camera.position.copy(position);
        this.camera.lookAt(target);
        this.camera.updateMatrixWorld(true);
      },
    };
    let view;
    new UniviewApp(async (data, container) => {
      container.append(canvas);
      return view = new ThreeView(data, container, host);
    });
    env.document.getElementById("allow-inferred").checked = true;
    env.document.getElementById("btn-view-3d").click();
    await new Promise((resolve) => setImmediate(resolve));
    return { ...env, host, view, data: campusData, finder: new AStarPathfinder(campusData) };
  } catch (error) {
    await env.server.close();
    throw error;
  }
}

test("3D search fits a different building and retains camera and gap state for selections within that building", async () => {
  const { document, window, server, view, host } = await setupThree();
  try {
    const search = (target, query) => {
      const input = document.getElementById(`input-${target}`);
      input.value = query;
      input.dispatchEvent(new window.Event("input"));
      document.querySelector(`#suggestions-${target} button`).click();
    };
    const gap = document.getElementById("explode-slider");
    gap.value = "80"; gap.dispatchEvent(new window.Event("input"));
    const moves = host.moves;
    search("dest", "20-420");
    assert.equal(document.body.dataset.view, "3d");
    assert.equal(document.getElementById("building-select").value, "b20");
    assert.equal(host.moves, moves + 1);
    assert.ok(view.getPlaceAnchor("20-420"), "the selected room must be inside the new building view");
    assert.equal(document.getElementById("tooltip-title").textContent, "20-420 研究室");
    assert.equal(gap.value, "80");
    assert.equal(document.getElementById("show-all-floors").checked, true);
    const before = host.camera.position.clone();
    search("dest", "20-421");
    search("dest", "20-306");
    assert.equal(host.moves, moves + 1);
    assert.ok(host.camera.position.equals(before), "same-building selection retains the camera even across floors");
    search("start", "3-401");
    assert.equal(host.moves, moves + 2);
    assert.ok(view.getPlaceAnchor("3-401"));
    assert.ok(!document.getElementById("route-summary-panel").classList.contains("hidden"));
    document.getElementById("btn-swap-points").click();
    assert.equal(host.moves, moves + 2, "route calculation and swapping endpoints must not reframe the view");
    const all = document.getElementById("show-all-floors");
    all.checked = false; all.dispatchEvent(new window.Event("change"));
    search("dest", "20-420");
    assert.equal(host.moves, moves + 3);
    assert.equal(all.checked, false);
    assert.equal(gap.value, "80");
    assert.ok(view.getPlaceAnchor("20-420"), "single-floor mode also fits the destination building");
  } finally { await server.close(); }
});

test("3D route markers distinguish global endpoints, transfers and isolated visible points across buildings and floors", async () => {
  const { server, view, host, data, finder } = await setupThree();
  try {
    const markers = () => {
      const result = [];
      host.scene.traverse((o) => { if (o.userData.type === "route-marker") result.push(o); });
      return result;
    };
    const route = finder.findPath("b3/f4/room-401", "b20/f4/room-420");
    view.renderRoute(route);
    view.setLocation("b3", 1, false);
    assert.equal(markers().length, 2);
    assert.ok(markers().every((m) => m.userData.role === "transfer"));
    assert.ok(markers().every((m) => m.children[0].geometry.type === "OctahedronGeometry"));
    for (const [building, floor, expected] of [
      ["b3", 4, ["start", "transfer"]],
      ["b20", 4, ["goal", "transfer"]],
    ]) {
      view.setLocation(building, floor, false);
      assert.deepEqual(markers().map((m) => m.userData.role).sort(), expected);
      for (const marker of markers()) {
        if (marker.userData.role === "start") assert.equal(marker.userData.nodeId, route.pathNodes[0].id);
        if (marker.userData.role === "goal") assert.equal(marker.userData.nodeId, route.pathNodes.at(-1).id);
      }
    }
    view.setLocation("b20", 4, true);
    view.explode.setExplodeRatio(0);
    const before = markers().map((m) => ({ data: { ...m.userData }, position: m.position.clone() }));
    view.explode.setExplodeRatio(1);
    for (const marker of markers()) {
      const previous = before.find((m) => m.data.nodeId === marker.userData.nodeId);
      assert.deepEqual(marker.userData, previous.data);
      const node = route.pathNodes.find((n) => n.id === marker.userData.nodeId);
      const floor = data.buildings.find((b) => b.id === node.buildingId).floors.find((f) => f.level === node.floor);
      assert.equal(marker.position.y - previous.position.y, floor.stackIndex * 9);
    }
    const reversed = finder.findPath("b20/f4/room-420", "b3/f4/room-401");
    view.renderRoute(reversed);
    assert.deepEqual(markers().map((m) => m.userData.role).sort(), ["start", "transfer"]);
    const entrances = finder.findPath("b3/f1/entrance-north", "b20/f1/entrance-right");
    view.renderRoute(entrances);
    for (const [building, role] of [["b3", "start"], ["b20", "goal"]]) {
      view.setLocation(building, 1, false);
      assert.equal(markers().length, 1, "a single visible entrance still gets its endpoint marker");
      assert.equal(markers()[0].userData.role, role);
    }
    view.setLocation("b3", 4, false);
    view.renderRoute(finder.findPath("b3/f4/room-401", "b3/f4/room-401"));
    assert.equal(markers().length, 1);
    assert.equal(markers()[0].userData.role, "start-goal");
    view.renderRoute(null);
    assert.equal(markers().length, 0);
  } finally { await server.close(); }
});

test("3D concave-room labels and bubbles share an interior anchor through floor expansion", async () => {
  const { server, view, host, data } = await setupThree();
  try {
    const { pointInInterior } = await server.ssrLoadModule('/src/data/geometry.ts');
    view.setLocation('b6',1,true);
    let mesh;
    host.scene.traverse(o=>{if(o.userData.placeId==='6-111')mesh=o;});
    assert.ok(mesh);
    const room=data.buildings.find(b=>b.id==='b6').floors.find(f=>f.level===1).rooms.find(r=>r.id==='6-111');
    const local=new THREE.Vector3().fromArray(mesh.userData.labelAnchor).add(mesh.position);
    assert.ok(pointInInterior([local.x,local.z],room.polygon));
    const sprite=mesh.parent.children.find(o=>o.isSprite);
    assert.equal(sprite.position.x,local.x);assert.equal(sprite.position.z,local.z);
    for(const gap of [0,1]){
      view.explode.setExplodeRatio(gap);host.scene.updateMatrixWorld(true);
      const world=mesh.localToWorld(new THREE.Vector3().fromArray(mesh.userData.labelAnchor));
      host.camera.position.copy(world).add(new THREE.Vector3(0,100,0));
      host.camera.up.set(0,0,-1);host.camera.lookAt(world);host.camera.updateMatrixWorld(true);
      const anchor=view.getPlaceAnchor('6-111');
      assert.ok(anchor);assert.ok(Math.abs(anchor.x-500)<1e-6);assert.ok(Math.abs(anchor.y-350)<1e-6);
    }
  } finally { await server.close(); }
});
