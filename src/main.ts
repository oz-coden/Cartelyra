import "./style.css";
import { campusData } from "./data/load";
import overviewJson from "./data/overview.json";
import type { CampusOverview } from "./data/schema";
import { buildingCatalog, placeDisplayName, placeIndex } from "./data/places";
import type { Place, RouteFilterType, RouteResult } from "./types/campus";
import { AStarPathfinder } from "./pathfinding/AStar";
import { ThemeManager } from "./ui/ThemeManager";
import { SearchPanel } from "./ui/SearchPanel";
import { FloorControl } from "./ui/FloorControl";
import { LocationState } from "./ui/LocationState";
import { StepGuide } from "./ui/StepGuide";
import { FloorMap } from "./ui/FloorMap";
import type { ThreeView } from "./scene/ThreeView";

type View = "campus" | "floor" | "3d";
class UniviewApp {
  private three?: ThreeView;
  private loading3D?: Promise<ThreeView>;
  private viewRequest = 0;
  private theme = new ThemeManager();
  private places = placeIndex(campusData);
  private location = new LocationState(
    buildingCatalog(campusData, overviewJson as CampusOverview),
  );
  private search = new SearchPanel(this.places);
  private floors = new FloorControl();
  private guide = new StepGuide();
  private pathfinder = new AStarPathfinder(campusData);
  private map = new FloorMap(
    document.getElementById("map-canvas")!,
    campusData,
    overviewJson as CampusOverview,
  );
  private view: View = "floor";
  private pick: "start" | "dest" | "none" = "none";
  private selected: Place | null = null;
  private category = "all";
  private result: RouteResult | null = null;
  private toastTimer?: number;
  constructor() {
    const select = document.getElementById(
      "building-select",
    ) as HTMLSelectElement;
    for (const building of this.location.buildings) {
      const option = document.createElement("option");
      option.value = building.id;
      option.textContent = `${building.name}${building.data?.floors.length ? "" : "（フロア未登録）"}`;
      select.append(option);
    }
    select.addEventListener("change", () => {
      this.location.selectBuilding(select.value);
      this.applyLocation();
    });
    this.theme.onThemeChange((dark) => this.three?.setTheme(dark));
    this.floors.onFloorChange = (level) => {
      this.location.selectFloor(level);
      this.applyLocation();
    };
    this.floors.onExplodeChange = (ratio) => {
      this.three?.explode.setExplodeRatio(ratio);
    };
    this.floors.onShowAllChange = () => this.sync3D();
    this.map.onPlaceSelect = (place) => this.selectPlace(place);
    this.map.onBackgroundClick = () => this.hideDetails();
    this.map.onBuildingSelect = (id) => {
      this.location.selectBuilding(id);
      this.applyLocation();
      void this.setView("floor");
    };
    this.search.onRouteSearch = (a, b, filter, inferred) =>
      this.searchRoute(a, b, filter, inferred);
    this.search.onRouteClear = () => {
      this.result = null;
      this.map.setRoute(null);
      this.three?.renderRoute(null);
      this.guide.hide();
    };
    this.search.onPlaceFocus = (place) => this.focusPlace(place, true);
    this.search.onPickModeToggle = (target) => {
      this.pick = target;
      if (target !== "none") {
        if (this.view === "campus") void this.setView("floor");
        this.toast(
          `地図の場所を選んで${target === "start" ? "出発地" : "目的地"}に設定してください`,
        );
      }
    };
    for (const view of ["campus", "floor", "3d"] as View[])
      document
        .getElementById(`btn-view-${view}`)!
        .addEventListener("click", () => void this.setView(view));
    document
      .getElementById("btn-reset-camera")!
      .addEventListener("click", () => {
        this.three?.reset();
        this.map.resetView();
      });
    for (const target of ["start", "dest"] as const)
      document
        .getElementById(`btn-tooltip-set-${target}`)!
        .addEventListener("click", () => {
          if (this.selected?.nodeId) this.setPoint(target, this.selected);
        });
    this.guide.onStepClick = (step) => {
      if (step.buildingId) this.location.selectBuilding(step.buildingId);
      this.location.selectFloor(step.floor);
      this.applyLocation();
      if (this.view === "campus") void this.setView("floor");
      if (this.view === "3d") this.three?.focusStep(step);
    };
    const filters = document.getElementById("facility-filters")!;
    for (const [id, label] of [
      ["all", "すべて"],
      ["restroom", "WC"],
      ["elevator", "EV"],
      ["stairs", "階段"],
      ["aed", "AED"],
    ]) {
      const button = document.createElement("button");
      button.textContent = label;
      button.dataset.category = id;
      button.addEventListener("click", () => {
        this.category = id;
        this.renderFacilities();
      });
      filters.append(button);
    }
    this.applyLocation();
    void this.setView("floor");
  }
  private applyLocation() {
    (document.getElementById("building-select") as HTMLSelectElement).value =
      this.location.buildingId ?? "";
    const building = this.location.building,
      floor = this.location.floor;
    document.getElementById("building-status")!.textContent = building?.data
      ?.floors.length
      ? `${building.data.floors.length} フロア登録済み / 出入口・利用条件は現地未確認`
      : "配置のみ登録 / フロア・設備・経路は準備中";
    this.floors.render(building?.data?.floors ?? [], this.location.floorLevel);
    this.map.setLocation(building, floor);
    this.search.setContext(building?.id, floor?.level);
    this.hideDetails();
    this.renderFacilities();
    this.sync3D();
    if (this.view === "3d" && !floor) void this.setView("floor");
  }
  private renderFacilities() {
    document
      .querySelectorAll<HTMLButtonElement>("[data-category]")
      .forEach((b) =>
        b.setAttribute(
          "aria-pressed",
          String(b.dataset.category === this.category),
        ),
      );
    const list = document.getElementById("facility-list")!;
    list.replaceChildren();
    const places = this.places.filter(
      (p) =>
        p.buildingId === this.location.buildingId &&
        p.floorLevel === this.location.floorLevel &&
        p.kind !== "room" &&
        (this.category === "all" || p.kind === this.category),
    );
    for (const place of places) {
      const button = document.createElement("button");
      button.textContent = place.name;
      const state = document.createElement("small");
      state.textContent = place.nodeId ? "参考経路あり" : "経路未登録";
      button.append(state);
      button.addEventListener("click", () => this.selectPlace(place));
      list.append(button);
    }
    if (!places.length) {
      const text = document.createElement("p");
      text.textContent = this.location.floor
        ? "この種類の設備は登録されていません。"
        : "フロア資料の確認後に設備を追加します。";
      list.append(text);
    }
  }
  private sync3D() {
    if (!this.three) return;
    this.three.setLocation(
      this.location.buildingId,
      this.location.floorLevel,
      (document.getElementById("show-all-floors") as HTMLInputElement).checked,
    );
    this.three.explode.setExplodeRatio(
      Number(
        (document.getElementById("explode-slider") as HTMLInputElement).value,
      ) / 100,
    );
  }
  private initialize3D() {
    if (this.three) return Promise.resolve(this.three);
    if (!this.loading3D)
      this.loading3D = import("./scene/ThreeView")
        .then(({ ThreeView }) => {
          const view = new ThreeView(
            campusData,
            document.getElementById("canvas-container")!,
          );
          this.three = view;
          view.onPlaceSelect = (id) => {
            const place = this.places.find((p) => p.id === id);
            if (place) this.selectPlace(place);
          };
          view.picker.onBackgroundClick = () => this.hideDetails();
          view.setTheme(this.theme.getIsDark());
          view.renderRoute(this.result);
          this.sync3D();
          return view;
        })
        .catch((error) => {
          this.loading3D = undefined;
          throw error;
        });
    return this.loading3D;
  }
  private async setView(view: View) {
    const request = ++this.viewRequest;
    if (view === "3d") {
      if (!this.location.floor) {
        this.toast("この建物の3Dフロアは未登録です。");
        return;
      }
      try {
        await this.initialize3D();
      } catch {
        this.toast("3D表示を開始できませんでした。平面図を利用できます。");
        return;
      }
    }
    if (request !== this.viewRequest) {
      this.three?.setActive(this.view === "3d");
      return;
    }
    this.view = view;
    document.body.dataset.view = view;
    document
      .getElementById("map-panel")!
      .classList.toggle("hidden", view === "3d");
    document
      .getElementById("canvas-container")!
      .classList.toggle("hidden", view !== "3d");
    document
      .getElementById("floor-control")!
      .classList.toggle("hidden", view === "campus");
    for (const key of ["campus", "floor", "3d"])
      document
        .getElementById(`btn-view-${key}`)!
        .setAttribute("aria-pressed", String(key === view));
    this.three?.setActive(view === "3d");
    if (view !== "3d") this.map.showOverview(view === "campus");
    else {
      this.sync3D();
      this.three?.reset();
    }
  }
  private searchRoute(
    a: string,
    b: string,
    filter: RouteFilterType,
    inferred: boolean,
  ) {
    this.result = this.pathfinder.findPath(a, b, filter, inferred);
    this.map.setRoute(this.result);
    this.three?.renderRoute(this.result);
    if (!this.result) {
      this.search.hideSummary();
      this.guide.hide();
      this.toast(
        inferred
          ? "この条件で接続する経路は未登録です。"
          : "現地確認済みの接続だけでは経路がつながりません。参考ルートを有効にすると推定経路を確認できます。",
        6500,
      );
      return;
    }
    this.search.updateSummary(this.result);
    this.guide.showSteps(this.result.steps);
    this.location.focusNode(this.result.pathNodes[0]);
    this.applyLocation();
    if (this.view === "campus") void this.setView("floor");
  }
  private focusPlace(place: Place, details = false) {
    if (
      this.location.buildingId !== place.buildingId ||
      this.location.floorLevel !== place.floorLevel
    ) {
      this.location.selectBuilding(place.buildingId);
      this.location.selectFloor(place.floorLevel);
      this.applyLocation();
    }
    if (this.view === "campus") void this.setView("floor");
    this.map.selectPlace(place.id);
    if (this.view === "3d") this.three?.focusPlace(place);
    if (details) this.showDetails(place);
  }
  private selectPlace(place: Place) {
    this.focusPlace(place, true);
    if (this.pick !== "none") {
      if (place.nodeId) this.setPoint(this.pick, place);
      else this.toast("この場所の入口・接続は未登録です。");
    }
  }
  private setPoint(target: "start" | "dest", place: Place) {
    if (!place.nodeId) return;
    if (target === "start")
      this.search.setStart(place.nodeId, placeDisplayName(place));
    else this.search.setDest(place.nodeId, placeDisplayName(place));
  }
  private showDetails(place: Place) {
    this.selected = place;
    document.getElementById("tooltip-title")!.textContent = place.name;
    document.getElementById("tooltip-desc")!.textContent =
      `${place.buildingName} ${place.floorLabel} / ${place.description ?? (place.nodeId ? "入口は推定位置・利用条件未確認" : "入口の接続先が未確認のため経路未登録")}`;
    for (const target of ["start", "dest"])
      (
        document.getElementById(
          `btn-tooltip-set-${target}`,
        ) as HTMLButtonElement
      ).disabled = !place.nodeId;
    document.getElementById("room-tooltip")!.classList.remove("hidden");
  }
  private hideDetails() {
    document.getElementById("room-tooltip")!.classList.add("hidden");
    this.selected = null;
    this.map.selectPlace(null);
  }
  private toast(message: string, duration = 4500) {
    const el = document.getElementById("toast")!;
    el.textContent = message;
    el.classList.remove("hidden");
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(
      () => el.classList.add("hidden"),
      duration,
    );
  }
}
window.addEventListener("DOMContentLoaded", () => new UniviewApp());
