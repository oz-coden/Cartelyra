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

test("gates are searchable and selectable on the overview and can be named endpoints without invented routes", async () => {
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
    assert.match(
      document.getElementById("toast").textContent,
      /屋外経路は未登録/,
    );
    assert.ok(
      document
        .getElementById("route-summary-panel")
        .classList.contains("hidden"),
    );
    assert.equal(document.querySelectorAll(".map-route").length, 0);
    assert.equal(document.querySelectorAll("#gate-list button").length, 4);
    document.getElementById("btn-view-floor").click();
    document.querySelector("#gate-list button").click();
    assert.equal(document.body.dataset.view, "campus");
    assert.equal(document.getElementById("tooltip-title").textContent, "正門");
  } finally {
    await server.close();
  }
});

test("3D picking, shared action card, endpoint routing, highlighting and gap controls work together without moving the camera", async () => {
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
