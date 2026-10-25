import "./style.css";
import { campusData } from "./data/load";
import overviewJson from "./data/overview.json";
import type { CampusOverview } from "./data/schema";
import { displayFloors } from "./data/display";
import {
  buildingCatalog,
  placeContext,
  placeIndex,
  placeRouteNotice,
} from "./data/places";
import type { CampusData, Place, RouteFilterType, RouteResult } from "./types/campus";
import { AStarPathfinder } from "./pathfinding/AStar";
import { ThemeManager } from "./ui/ThemeManager";
import { SearchPanel } from "./ui/SearchPanel";
import { FloorControl } from "./ui/FloorControl";
import { LocationState } from "./ui/LocationState";
import { StepGuide } from "./ui/StepGuide";
import { FloorMap } from "./ui/FloorMap";
import { SelectionPopover } from "./ui/SelectionPopover";
import { SelectionState } from "./ui/SelectionState";
import { ThreeDisplayState } from "./ui/ThreeDisplayState";
import type { ThreeView } from "./scene/ThreeView";

type View = "campus" | "floor" | "3d";
type ThreeFactory = (
  data: CampusData,
  container: HTMLElement,
) => Promise<ThreeView>;
const createThreeView: ThreeFactory = async (data, container) => {
  const { ThreeView } = await import("./scene/ThreeView");
  return new ThreeView(data, container);
};
export class UniviewApp {
  private three?: ThreeView;
  private loading3D?: Promise<ThreeView>;
  private viewRequest = 0;
  private theme = new ThemeManager();
  private places: Place[];
  private selection = new SelectionState();
  private display3D = new ThreeDisplayState();
  private location: LocationState;
  private search: SearchPanel;
  private floors = new FloorControl(this.display3D);
  private guide = new StepGuide();
  private pathfinder: AStarPathfinder;
  private map: FloorMap;
  private popover: SelectionPopover;
  private view: View = "floor";
  private category = "all";
  private result: RouteResult | null = null;
  private toastTimer?: number;
  constructor(private threeFactory: ThreeFactory = createThreeView,
    private data: CampusData = campusData,
    overview: CampusOverview = overviewJson as unknown as CampusOverview) {
    this.places = placeIndex(data, overview);
    this.location = new LocationState(buildingCatalog(data, overview), data.viewGroups);
    this.search = new SearchPanel(this.places, this.selection);
    this.pathfinder = new AStarPathfinder(data);
    this.map = new FloorMap(document.getElementById("map-canvas")!, data, overview);
    this.popover = new SelectionPopover(document.getElementById("room-tooltip")!, document.getElementById("map-stage")!,
      () => document.getElementById(this.view === "3d" ? "canvas-container" : "map-canvas")!,
      () => {
        const id = this.selection.selected?.id;
        return !id ? null : this.view === "3d" ? this.three?.getPlaceAnchor(id) ?? null : this.map.getPlaceAnchor(id);
      });
    document.getElementById("show-connected")!.addEventListener("change", e => {
      this.location.grouped = (e.target as HTMLInputElement).checked;
      this.applyLocation();
      if (this.view === "3d") this.three?.reset();
    });
    this.floors.onGroupLevelChange = id => { this.location.selectGroupLevel(id); this.applyLocation(); };
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
      const previousScope = this.location.scope.key;
      this.location.selectBuilding(select.value);
      this.applyLocation();
      if (this.view === "3d" && previousScope !== this.location.scope.key) this.three?.reset();
    });
    this.theme.onThemeChange((dark) => this.three?.setTheme(dark));
    this.floors.onFloorChange = (level) => {
      this.location.selectFloor(level);
      this.applyLocation();
    };
    this.floors.onExplodeChange = () => this.sync3D();
    this.floors.onShowAllChange = () => this.sync3D();
    this.map.onViewChange = () => this.popover.update();
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
      this.search.setStatus();
      this.map.setRoute(null);
      this.three?.renderRoute(null);
      this.guide.hide();
    };
    this.search.onPlaceFocus = (place) => this.focusPlace(place, true);
    this.search.onPickModeToggle = (target) => {
      document
        .getElementById("pick-banner")!
        .classList.toggle("hidden", target === "none");
      document.getElementById("pick-banner-text")!.textContent =
        target === "start"
          ? "出発地を選択中：地図の部屋・設備・門を選んでください"
          : "目的地を選択中：地図の部屋・設備・門を選んでください";
      if (target !== "none") {
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
          if (this.selection.selected)
            this.setPoint(target, this.selection.selected);
        });
    this.guide.onStepClick = (step) => {
      if (!step.buildingId) {
        void this.setView("campus");
        return;
      }
      if (step.buildingId) this.location.selectBuilding(step.buildingId);
      if (step.floor !== undefined) this.location.selectFloor(step.floor);
      this.applyLocation();
      if (this.view === "campus") void this.setView("floor");
      if (this.view === "3d") this.three?.focusStep(step);
    };
    document
      .getElementById("btn-close-selection")!
      .addEventListener("click", () => this.hideDetails());
    document
      .getElementById("btn-cancel-pick")!
      .addEventListener("click", () => this.search.cancelPick());
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        this.search.cancelPick();
        this.hideDetails();
      }
    });
    for (const gate of this.places.filter((p) => p.kind === "gate")) {
      const button = document.createElement("button");
      button.textContent = gate.name;
      button.addEventListener("click", () => this.selectPlace(gate));
      document.getElementById("gate-list")!.append(button);
    }
    const filters = document.getElementById("facility-filters")!;
    for (const [id, label] of [
      ["all", "すべて"],
      ["room", "部屋"],
      ["restroom", "WC"],
      ["elevator", "EV"],
      ["stairs", "階段"],
      ["aed", "AED"],
      ["entrance", "出入口"],
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
      ? `${building.data.floors.length} フロア`
      : "フロア未登録";
    const group = this.location.declaredGroup;
    document.getElementById("group-display-option")!.classList.toggle("hidden", !group || group.status !== "ready");
    (document.getElementById("show-connected") as HTMLInputElement).checked = this.location.grouped;
    document.getElementById("group-status")!.textContent = group
      ? group.status === "pending" ? `${group.name}：連絡棟の館内図・接続階は準備中` : `${group.name} / ${this.location.group ? "連絡棟を表示" : "単棟表示"}` : "";
    if (this.location.group) this.floors.renderGroup(this.location.group, this.location.groupLevel?.id);
    else this.floors.render(building?.data?.floors ?? [], this.location.floorLevel);
    this.map.setLocation(building, floor, this.location.scope);
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
    const shown = displayFloors(this.data, this.location.scope);
    const places = this.places.filter(
      (p) =>
        shown.some(({ building, floor }) => building.id === p.buildingId && floor.level === p.floorLevel) &&
        (this.category === "all" || p.kind === this.category),
    );
    for (const place of places) {
      const button = document.createElement("button");
      button.textContent = this.location.group ? `${place.buildingName} ${place.name}` : place.name;
      const state = document.createElement("small");
      state.textContent = place.approachRoomId
        ? "手前の部屋まで案内"
        : place.nodeId ? "参考経路あり" : "経路未登録";
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
      this.display3D.showAll,
      this.location.scope,
    );
    this.three.explode.setExplodeRatio(this.display3D.gapRatio);
  }
  private initialize3D() {
    if (this.three) return Promise.resolve(this.three);
    if (!this.loading3D)
      this.loading3D = this.threeFactory(
        this.data,
        document.getElementById("canvas-container")!,
      )
        .then((view) => {
          this.three = view;
          view.onViewChange = () => this.popover.update();
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
    const previous = this.view;
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
    if (view === "3d" && !this.location.floor) {
      this.three?.setActive(false);
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
      if (previous !== "3d") this.three?.reset();
    }
    if (this.selection.selected) this.highlightSelected();
    this.popover.update();
  }
  private searchRoute(
    a: string,
    b: string,
    filter: RouteFilterType,
    inferred: boolean,
  ) {
    this.search.setStatus();
    const endpoints = [a, b].map((id) =>
      this.places.find((p) => p.id === id) ??
      this.places.find((p) => p.nodeId === id && !p.approachRoomId),
    );
    const unavailable = endpoints.filter((p): p is Place => !!p && !p.nodeId);
    this.result = unavailable.length
      ? null
      : this.pathfinder.findPath(
          endpoints[0]?.nodeId ?? a,
          endpoints[1]?.nodeId ?? b,
          filter,
          inferred,
        );
    if (!this.result && !unavailable.length && filter === "accessible") {
      this.result = this.pathfinder.findPath(endpoints[0]?.nodeId ?? a, endpoints[1]?.nodeId ?? b,
        "shortest", inferred, "fewest-stairs");
      if (this.result) {
        const count = this.result.verticalMovements?.stairs ?? 0;
        this.search.setStatus(count
          ? `階段なしの経路はありません。階段が最少の経路を表示中（${count}区間）。`
          : "階段回避に対応する経路は未登録です。代替経路を表示中。", "warning");
      }
    }
    if (this.result) {
      window.clearTimeout(this.toastTimer);
      document.getElementById("toast")!.classList.add("hidden");
      this.result.endpointNotes = endpoints
        .filter((p): p is Place => !!p)
        .map(placeRouteNotice)
        .filter(Boolean);
      if (this.result.endpointNotes.length) {
        const start = endpoints[0], dest = endpoints[1];
        if (this.result.steps.length === 1)
          this.result.steps[0].instruction = `案内地点は同じです。${this.result.endpointNotes.join(" ")}`;
        else {
          if (start?.approachRoomName)
            this.result.steps[0].instruction = `${start.name}（${start.approachRoomId}入口）から出発`;
          if (dest?.approachRoomName)
            this.result.steps[this.result.steps.length - 1].instruction = `${dest.name}（${dest.approachRoomId}入口）に到着`;
        }
      }
    }
    this.map.setRoute(this.result);
    this.three?.renderRoute(this.result);
    if (!this.result) {
      this.search.hideSummary();
      this.guide.hide();
      this.search.setStatus(
        unavailable.length
          ? `${unavailable.map((p) => `${p.name}の接続は未登録です`).join("。")}。`
          : inferred ? "この条件でつながる経路は未登録です。"
            : "確認済みの接続だけではつながりません。参考ルートを有効にしてください。",
      );
      return;
    }
    this.search.updateSummary(this.result);
    this.guide.showSteps(this.result.steps);
    // Computing a route must not change the selected place, displayed floor or camera.
  }
  private focusPlace(place: Place, details = false) {
    if (place.scope === "campus") {
      if (this.view !== "campus") void this.setView("campus");
    } else {
      const previousScope = this.location.scope.key;
      const buildingChanged = this.location.buildingId !== place.buildingId;
      if (
        buildingChanged ||
        this.location.floorLevel !== place.floorLevel
      ) {
        this.location.selectBuilding(place.buildingId);
        this.location.selectFloor(place.floorLevel);
        this.applyLocation();
      }
      if (previousScope !== this.location.scope.key && this.view === "3d") this.three?.reset();
      if (this.view === "campus") void this.setView("floor");
    }
    if (details) this.showDetails(place);
  }
  private selectPlace(place: Place) {
    this.focusPlace(place, true);
    const target = this.selection.pickTarget;
    if (target !== "none") this.setPoint(target, place);
  }
  private setPoint(target: "start" | "dest", place: Place) {
    this.search.setPlace(target, place);
  }
  private highlightSelected() {
    this.map.selectPlace(this.selection.selected?.id ?? null);
    this.three?.selectPlace(this.selection.selected?.id ?? null);
  }
  private showDetails(place: Place) {
    this.selection.selected = place;
    this.highlightSelected();
    document.getElementById("tooltip-title")!.textContent = place.name;
    document.getElementById("tooltip-desc")!.textContent =
      [placeContext(place), place.description, placeRouteNotice(place), place.nodeId ? "" : "経路未登録"].filter(Boolean).join(" / ");
    this.popover.show();
  }
  private hideDetails() {
    this.popover.hide();
    this.selection.selected = null;
    this.highlightSelected();
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
