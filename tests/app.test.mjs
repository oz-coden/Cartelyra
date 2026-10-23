import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseHTML } from "linkedom";
import { createServer } from "vite";

// Vite applies the same JSON glob and CSS transforms as the browser entry point.
// This checks application wiring in a DOM, without claiming layout or WebGL coverage.
test("application selects buildings, focuses WC details and routes from a room to a WC", async () => {
  const { document, window } = parseHTML(
    await readFile(new URL("../index.html", import.meta.url), "utf8"),
  );
  globalThis.document = document;
  globalThis.window = window;
  // linkedom has no writable select.value implementation.
  Object.defineProperty(window.HTMLSelectElement.prototype, "value", {
    configurable: true,
    get() {
      return (
        [...this.options].find((option) => option.hasAttribute("selected"))
          ?.value ??
        this.options[0]?.value ??
        ""
      );
    },
    set(value) {
      for (const option of this.options)
        option.toggleAttribute("selected", option.value === value);
    },
  });
  const server = await createServer({
    server: { middlewareMode: true, hmr: false, ws: false },
    optimizeDeps: { noDiscovery: true, include: [] },
    appType: "custom",
  });
  try {
    await server.ssrLoadModule("/src/main.ts");
    window.dispatchEvent(new window.Event("DOMContentLoaded"));
    const select = document.getElementById("building-select");
    // linkedom does not initialize the checkbox's checked property from HTML.
    document.getElementById("allow-inferred").checked = true;
    assert.equal(select.options.length, 30);
    assert.equal(select.value, "b1");
    select.value = "b3";
    select.dispatchEvent(new window.Event("change"));
    document
      .querySelector('[data-place="b3/f1/feature/wc-w"]')
      .dispatchEvent(new window.Event("click", { bubbles: true }));
    assert.equal(
      document.getElementById("tooltip-title").textContent,
      "女性用トイレ",
    );
    document.getElementById("btn-tooltip-set-dest").click();
    assert.match(
      document.getElementById("input-dest").value,
      /女性用トイレ.*3号館 1F/,
    );
    document
      .querySelector('[data-place="3-103"]')
      .dispatchEvent(new window.Event("click", { bubbles: true }));
    document.getElementById("btn-tooltip-set-start").click();
    assert.ok(document.querySelectorAll(".map-route").length > 0);
    assert.ok(
      !document.getElementById("step-guide").classList.contains("hidden"),
    );
    document.getElementById("btn-view-campus").click();
    assert.equal(document.body.dataset.view, "campus");
    const empty = [...document.querySelectorAll(".map-campus-building")].find(
      (g) => g.getAttribute("aria-label").startsWith("2号館"),
    );
    empty.dispatchEvent(new window.Event("click", { bubbles: true }));
    assert.equal(document.body.dataset.view, "floor");
    assert.equal(select.value, "b2");
    assert.match(document.getElementById("map-caption").textContent, /未登録/);
    assert.equal(document.querySelectorAll("[data-place]").length, 0);
    select.value = "b3";
    select.dispatchEvent(new window.Event("change"));
    assert.match(
      document.getElementById("map-heading").textContent,
      /3号館.*1F/,
    );
    document
      .querySelector('#facility-filters [data-category="restroom"]')
      .click();
    assert.equal(document.querySelectorAll("#facility-list button").length, 3);
    document.getElementById("btn-pick-start").click();
    document
      .querySelector('[data-place="b3/f1/feature/wc-m"]')
      .dispatchEvent(new window.Event("click", { bubbles: true }));
    assert.equal(
      document.getElementById("btn-pick-start").getAttribute("aria-pressed"),
      "false",
    );
    select.value = "b20";
    select.dispatchEvent(new window.Event("change"));
    assert.equal(document.querySelectorAll("#floor-buttons button").length, 4);
    assert.equal(document.querySelectorAll(".map-room").length, 20);
    document.querySelector('[data-place="20-113"]').dispatchEvent(new window.Event("click", { bubbles: true }));
    document.getElementById("btn-tooltip-set-dest").click();
    assert.match(document.getElementById("input-dest").value, /20-113.*20号館 1F/);
    assert.match(document.getElementById("route-confidence").textContent, /屋外はキャンパス図/);
    assert.ok(document.querySelectorAll(".map-route").length > 0);
    const outdoorStep = [...document.querySelectorAll("#step-guide-list button")]
      .find((b) => b.textContent.includes("屋外へ出る"));
    outdoorStep.click();
    assert.equal(document.body.dataset.view, "campus");
    assert.ok(document.querySelectorAll(".map-route").length > 0);
    assert.match(select.value, /b20/);
    const indoorStep = [...document.querySelectorAll("#step-guide-list button")]
      .find((b) => b.textContent.includes("へ入る"));
    indoorStep.click();
    assert.equal(document.body.dataset.view, "floor");
    assert.equal(select.value, "b20");
    document.querySelector('[data-place="b20/f1/feature/entrance-left"]').dispatchEvent(new window.Event("click", { bubbles: true }));
    document.getElementById("btn-tooltip-set-start").click();
    assert.ok(document.querySelectorAll(".map-route").length > 0);
    const third = [...document.querySelectorAll("#floor-buttons button")].find((b) => b.textContent === "3F");
    third.click();
    document.querySelector('[data-place="20-306"]').dispatchEvent(new window.Event("click", { bubbles: true }));
    assert.match(document.getElementById("tooltip-desc").textContent, /20-306-1.*入口まで/);
    document.getElementById("btn-tooltip-set-dest").click();
    assert.match(document.getElementById("input-dest").value, /20-306 教授室/);
    assert.match(document.getElementById("route-confidence").textContent, /20-306-1.*入口まで/);
    assert.match(document.getElementById("step-guide-list").textContent, /20-306.*20-306-1入口.*に到着/);
    document.getElementById("btn-swap-points").click();
    assert.match(document.getElementById("step-guide-list").textContent, /20-306.*20-306-1入口.*から出発/);
    document.querySelector('[data-place="20-306-1"]').dispatchEvent(new window.Event("click", { bubbles: true }));
    document.getElementById("btn-tooltip-set-dest").click();
    assert.match(document.getElementById("route-confidence").textContent, /案内地点は同じ/);
    assert.match(document.getElementById("step-guide-list").textContent, /20-306-1の入口まで/);
    const fourth = [...document.querySelectorAll("#floor-buttons button")].find((b) => b.textContent === "4F");
    fourth.click();
    assert.match(document.getElementById("map-heading").textContent, /20号館.*4F/);
    assert.equal(document.querySelectorAll(".map-room").length, 28);
    document.querySelector('[data-place="20-420"]').dispatchEvent(new window.Event("click", { bubbles: true }));
    assert.match(document.getElementById("tooltip-title").textContent, /20-420 研究室/);

    // A restricted route is distinct from an unregistered connection.
    const chooseRoom = (buildingId, level, roomId, action) => {
      select.value = buildingId; select.dispatchEvent(new window.Event("change"));
      [...document.querySelectorAll("#floor-buttons button")].find(b => b.textContent === level).click();
      document.querySelector(`[data-place="${roomId}"]`).dispatchEvent(new window.Event("click", { bubbles: true }));
      document.getElementById(`btn-tooltip-set-${action}`).click();
    };
    chooseRoom("b5", "2F", "5-201", "start");
    chooseRoom("b23", "1F", "23-101", "dest");
    assert.ok(!document.getElementById("step-guide").classList.contains("hidden"));
    document.querySelector('[data-filter="accessible"]').click();
    assert.match(document.getElementById("route-status").textContent, /階段なしの経路はありません.*最少/);
    assert.ok(!document.getElementById("route-status").classList.contains("hidden"));
    assert.ok(!document.getElementById("step-guide").classList.contains("hidden"));
    assert.equal(document.querySelector('[data-filter="accessible"]').getAttribute('aria-pressed'),'true');
    document.getElementById('btn-close-guide').click();
    assert.ok(!document.getElementById('route-status').classList.contains('hidden'));
    document.getElementById('allow-inferred').checked=false;
    document.getElementById('allow-inferred').dispatchEvent(new window.Event('change'));
    assert.equal(document.getElementById('route-status').dataset.kind,'error');
    assert.equal(document.querySelectorAll('.map-route').length,0);
    document.getElementById('allow-inferred').checked=true;
    document.getElementById('allow-inferred').dispatchEvent(new window.Event('change'));
    assert.equal(document.getElementById('route-status').dataset.kind,'warning');
    chooseRoom('b6','1F','6-101','dest');
    assert.match(document.getElementById('route-status').textContent,/未登録/);
    assert.ok(document.getElementById('step-guide').classList.contains('hidden'));
    chooseRoom('b23','1F','23-101','dest');
    document.querySelector('[data-filter="shortest"]').click();
    assert.ok(document.getElementById("route-status").classList.contains("hidden"));
    assert.ok(document.getElementById("toast").classList.contains("hidden"));
    assert.ok(!document.getElementById("step-guide").classList.contains("hidden"));
    assert.match(document.getElementById("step-guide-list").textContent, /連絡橋/);

  } finally {
    await server.close();
  }
});

test("3D geometry selects WC meshes, hides other floors/buildings and supports level zero", async () => {
  const { document, window } = parseHTML(
    '<html><body><div id="canvas"></div></body></html>',
  );
  globalThis.document = document;
  globalThis.window = window;
  window.HTMLCanvasElement.prototype.getContext = () => ({
    beginPath() {},
    roundRect() {},
    fill() {},
    stroke() {},
    fillText() {},
  });
  const server = await createServer({
    server: { middlewareMode: true, hmr: false, ws: false },
    optimizeDeps: { noDiscovery: true, include: [] },
    appType: "custom",
  });
  try {
    const [
      { BuildingRenderer },
      { ExplodeController },
      { RaycastPicker },
      THREE,
      { campusData },
    ] = await Promise.all([
      server.ssrLoadModule("/src/scene/BuildingRenderer.ts"),
      server.ssrLoadModule("/src/scene/ExplodeController.ts"),
      server.ssrLoadModule("/src/scene/RaycastPicker.ts"),
      import("three"),
      server.ssrLoadModule("/src/data/load.ts"),
    ]);
    const data = structuredClone(campusData),
      other = structuredClone(data.buildings[0]);
    other.id = "b99";
    other.origin = [250, 0, 0];
    other.floors = other.floors.slice(0, 1);
    other.floors[0].level = 0;
    other.floors[0].rooms = [];
    data.buildings.push(other);
    const renderer = new BuildingRenderer(data),
      explode = new ExplodeController(renderer);
    explode.setLocation("b3", 1, false);
    const mesh = renderer.placeMeshes.find(
      (m) => m.userData.placeId === "b3/f1/feature/wc-w",
    );
    assert.ok(mesh);
    for (const id of ["left", "center", "right"])
      assert.ok(renderer.placeMeshes.some((m) => m.userData.placeId === `b20/f1/feature/entrance-${id}`));
    const box = new THREE.Box3().setFromObject(mesh),
      point = box.getCenter(new THREE.Vector3());
    const camera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 200);
    camera.position.copy(point).add(new THREE.Vector3(0, 40, 0));
    camera.up.set(0, 0, -1);
    camera.lookAt(point);
    camera.updateMatrixWorld(true);
    const element = document.getElementById("canvas");
    element.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      width: 100,
      height: 100,
    });
    const picker = new RaycastPicker(camera, element, renderer);
    let selected;
    picker.onPlaceSelect = (id) => (selected = id);
    const click = () => {
      for (const type of ["pointerdown", "pointerup"]) {
        const event = new window.Event(type);
        Object.assign(event, { clientX: 50, clientY: 50 });
        element.dispatchEvent(event);
      }
    };
    click();
    assert.equal(selected, "b3/f1/feature/wc-w");
    selected = undefined;
    explode.setLocation("b99", 0, false);
    click();
    assert.equal(selected, undefined);
    assert.equal(renderer.floorGroups.get("b99_f0").visible, true);
    assert.equal(renderer.floorGroups.get("b3_f1").visible, false);
    const node = {
      id: "zero",
      buildingId: "b99",
      floor: 0,
      position: [250, 0, 0],
      type: "corridor",
      name: "G",
    };
    const group = renderer.floorGroups.get("b99_f0");
    group.position.y += 5;
    assert.equal(renderer.getNodeWorldPosition(node).y, 5);
  } finally {
    await server.close();
  }
});
