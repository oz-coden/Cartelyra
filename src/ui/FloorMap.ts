import type {
  CampusData,
  Building,
  DisplayScope,
  Floor,
  NavNode,
  Point2,
  Place,
  RouteResult,
} from "../types/campus";
import type { ScreenPoint } from "./SelectionPopover";
import type { CampusOverview } from "../data/schema";
import { displayFloors, displayPoint, nodeInScope, soloScope } from "../data/display.js";
import { OVERVIEW_ROAD_WIDTH, overviewPoints, overviewBuildingLabel } from "../data/overview-layout.js";
import { bounds, worldToLocal } from "../data/geometry.js";
import {
  buildingCatalog,
  placeIndex,
  type BuildingEntry,
} from "../data/places.js";

const NS = "http://www.w3.org/2000/svg";
function element<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attributes: Record<string, string> = {},
  text?: string,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  Object.entries(attributes).forEach(([key, value]) =>
    node.setAttribute(key, value),
  );
  if (text !== undefined) node.textContent = text;
  return node;
}
const points = (polygon: Point2[]) => polygon.map((p) => p.join(",")).join(" ");

/** Coordinates stay in the selected building's local frame. SVG also works without WebGL. */
export class FloorMap {
  private svg = element("svg", { role: "group", "aria-label": "平面図" });
  private floor?: Floor;
  private scope: DisplayScope = soloScope(undefined, undefined);
  private layer: SVGElement = this.svg;
  private focused: string | null = null;
  private emphasis = element("g", { class: "map-emphasis", "pointer-events": "none", "aria-hidden": "true" });
  private places: Place[];
  private result: RouteResult | null = null;
  private selected: string | null = null;
  private overviewMode = false;
  private viewBox = [-8, -8, 141, 112];
  private cancelPanZoom = () => {};
  private isGestureClick = (_event: MouseEvent) => false;
  private overlay = element("g", {
    class: "route-overlay",
    "pointer-events": "none",
  });
  public onViewChange: (() => void) | null = null;
  public onPlaceSelect: ((place: Place) => void) | null = null;
  public onBuildingSelect: ((id: string) => void) | null = null;
  public onBackgroundClick: (() => void) | null = null;

  constructor(
    container: HTMLElement,
    private campus: CampusData,
    private overview: CampusOverview,
  ) {
    this.places = placeIndex(campus, overview);
    container.append(this.svg);
    this.setupPanZoom();
  }
  public setLocation(building: BuildingEntry | undefined, floor?: Floor, scope = soloScope(building?.data, floor)) {
    const changed = this.scope.key !== scope.key || this.scope.levelId !== scope.levelId ||
      (!scope.group && this.floor?.id !== floor?.id);
    this.scope = scope;
    this.floor = floor;
    if (changed) this.resetView();
    this.render();
  }
  public showOverview(show: boolean) {
    this.overviewMode = show;
    this.resetView();
    this.render();
  }
  public setRoute(result: RouteResult | null) {
    this.result = result;
    this.renderRoute();
  }
  public selectPlace(id: string | null) {
    this.selected = id;
    this.svg.querySelectorAll<SVGElement>("[data-place]").forEach((g) => {
      const selected = g.dataset.place === id;
      g.classList.toggle("selected", selected);
      g.setAttribute("aria-pressed", String(selected));
    });
    this.renderEmphasis();
  }
  private renderEmphasis() {
    this.emphasis.replaceChildren();
    for (const [id, className] of [[this.selected, "map-selection-outline"], [this.focused, "map-focus-outline"]]) {
      const source = [...this.svg.querySelectorAll<SVGGElement>("[data-place]")].find(g => g.dataset.place === id);
      const shape = source?.querySelector("polygon, circle, rect");
      if (!shape) continue;
      const group = element("g", { transform: source?.closest(".map-floor")?.getAttribute("transform") ?? "" });
      const clone = shape.cloneNode(true) as SVGElement;
      clone.setAttribute("class", className!);
      group.append(clone); this.emphasis.append(group);
    }
    this.svg.append(this.emphasis);
  }
  public getPlaceAnchor(id: string): ScreenPoint | null {
    const place = this.places.find((p) => p.id === id);
    if (
      !place ||
      (this.overviewMode
        ? place.scope !== "campus"
        : place.scope === "campus" ||
          !displayFloors(this.campus, this.scope).some(({ building, floor }) =>
            place.buildingId === building.id && place.floorLevel === floor.level))
    ) return null;
    const building = this.campus.buildings.find(b => b.id === place.buildingId);
    const position = this.scope.group && building && !this.overviewMode ? displayPoint(building, place.position, true) : place.position;
    const rect = this.svg.getBoundingClientRect();
    const [x, y, w, h] = this.viewBox;
    const scale = Math.min(rect.width / w, rect.height / h);
    if (scale <= 0) return null;
    const point = {
      x: rect.left + (rect.width - w * scale) / 2 + (position[0] - x) * scale,
      y: rect.top + (rect.height - h * scale) / 2 + (position[1] - y) * scale,
    };
    return point.x >= rect.left && point.x <= rect.right &&
      point.y >= rect.top && point.y <= rect.bottom ? point : null;
  }
  public resetView() {
    this.cancelPanZoom();
    const polygons = this.overviewMode
      ? overviewPoints(this.overview)
      : displayFloors(this.campus, this.scope).flatMap(({ building, floor }) =>
          floor.outline?.map(p => displayPoint(building, p, !!this.scope.group)) ?? []);
    if (polygons?.length) {
      const b = bounds(polygons);
      this.viewBox = [b.x - b.w / 2 - 8, b.z - b.d / 2 - 8, b.w + 16, b.d + 16];
    } else this.viewBox = [0, 0, 100, 80];
    this.applyViewBox();
  }
  public zoom(factor: number) {
    this.cancelPanZoom();
    const [x, z, w, h] = this.viewBox,
      newW = Math.min(2000, Math.max(8, w * factor)),
      ratio = newW / w;
    this.viewBox = [
      x + (w - newW) / 2,
      z + (h - h * ratio) / 2,
      newW,
      h * ratio,
    ];
    this.applyViewBox();
  }
  private applyViewBox() {
    this.svg.setAttribute("viewBox", this.viewBox.join(" "));
    this.onViewChange?.();
  }
  private setupPanZoom() {
    const pointers = new Map<number, Point2>();
    let start: { box: number[]; points: Array<[number, Point2]> } | null = null;
    let dragged = false;
    this.isGestureClick = event => dragged && event.detail !== 0;
    const restart = () => {
      start = pointers.size ? { box: [...this.viewBox], points: [...pointers].slice(0, 2) } : null;
    };
    const capture = () => {
      for (const id of pointers.keys()) this.svg.setPointerCapture(id);
    };
    this.cancelPanZoom = () => {
      if (pointers.size) dragged = true;
      const ids = [...pointers.keys()];
      pointers.clear(); start = null;
      for (const id of ids)
        if (this.svg.hasPointerCapture?.(id)) this.svg.releasePointerCapture(id);
    };
    this.svg.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      if (!pointers.size) dragged = false;
      pointers.set(e.pointerId, [e.clientX, e.clientY]);
      if (pointers.size > 1) { dragged = true; capture(); }
      restart();
    });
    this.svg.addEventListener("pointermove", (e) => {
      if (!start || !pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, [e.clientX, e.clientY]);
      const rect = this.svg.getBoundingClientRect();
      const [x, y, w, h] = start.box;
      const scale = Math.min(rect.width / w, rect.height / h);
      if (scale <= 0) return;
      const original = start.points.map(([, point]) => point);
      const current = start.points.map(([id]) => pointers.get(id)!);
      if (current.length === 2) {
        const distance = (points: Point2[]) => Math.hypot(points[1][0] - points[0][0], points[1][1] - points[0][1]);
        const initialDistance = distance(original), nextDistance = distance(current);
        if (initialDistance < 1) { restart(); return; }
        if (nextDistance < 1) return;
        const midpoint = (points: Point2[]): Point2 => [(points[0][0] + points[1][0]) / 2, (points[0][1] + points[1][1]) / 2];
        const initialCenter = midpoint(original), center = midpoint(current);
        const anchor = [
          x + (initialCenter[0] - rect.left - (rect.width - w * scale) / 2) / scale,
          y + (initialCenter[1] - rect.top - (rect.height - h * scale) / 2) / scale,
        ];
        const width = Math.min(2000, Math.max(8, w * initialDistance / nextDistance)), height = h * width / w;
        const nextScale = Math.min(rect.width / width, rect.height / height);
        this.viewBox = [
          anchor[0] - (center[0] - rect.left - (rect.width - width * nextScale) / 2) / nextScale,
          anchor[1] - (center[1] - rect.top - (rect.height - height * nextScale) / 2) / nextScale,
          width, height,
        ];
      } else {
        const dx = current[0][0] - original[0][0], dy = current[0][1] - original[0][1];
        if (Math.hypot(dx, dy) < 6 && !dragged) return;
        dragged = true; capture();
        this.viewBox = [x - dx / scale, y - dy / scale, w, h];
      }
      this.applyViewBox();
    });
    const finish = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) return;
      if (e.type !== "pointerup") dragged = true;
      pointers.delete(e.pointerId);
      restart();
    };
    this.svg.addEventListener("pointerup", finish);
    this.svg.addEventListener("pointercancel", finish);
    this.svg.addEventListener("lostpointercapture", e => {
      if (e.target === this.svg && !this.svg.hasPointerCapture(e.pointerId)) finish(e);
    });
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
    window.addEventListener("blur", () => this.cancelPanZoom());
    this.svg.addEventListener("click", (e) => {
      if (this.isGestureClick(e)) return;
      if (
        e.target === this.svg ||
        (e.target as Element).classList.contains("map-slab")
      )
        this.onBackgroundClick?.();
    });
    this.svg.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        this.zoom(e.deltaY > 0 ? 1.12 : 1 / 1.12);
      },
      { passive: false },
    );
    document
      .getElementById("map-zoom-in")!
      .addEventListener("click", () => this.zoom(0.8));
    document
      .getElementById("map-zoom-out")!
      .addEventListener("click", () => this.zoom(1.25));
  }
  private label(text: string, p: Point2, className = "map-label", maxWidth?: number) {
    this.layer.append(
      element(
        "text",
        {
          x: String(p[0]),
          y: String(p[1]),
          class: className,
          "text-anchor": "middle",
          "dominant-baseline": "middle",
          ...(maxWidth === undefined ? {} : {
            style: `font-size:${Math.min(2.6, maxWidth / (text.length + 1))}px`,
          }),
        },
        text,
      ),
    );
  }
  private interactive(group: SVGGElement, label: string, select: () => void) {
    group.setAttribute("role", "button");
    group.setAttribute("tabindex", "0");
    group.setAttribute("aria-label", label);
    group.addEventListener("click", event => {
      if (!this.isGestureClick(event)) select();
    });
    group.addEventListener("focus", () => { this.focused = group.dataset.place ?? null; this.renderEmphasis(); });
    group.addEventListener("blur", () => { this.focused = null; this.renderEmphasis(); });
    group.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        select();
      }
    });
  }
  private render() {
    this.svg.replaceChildren();
    this.layer = this.svg;
    this.focused = null;
    this.applyViewBox();
    if (this.overviewMode) {
      this.renderOverview();
      return;
    }
    const name = this.scope.label;
    const level = this.scope.group?.levels.find(l => l.id === this.scope.levelId)?.label ?? this.floor?.label;
    const shown = displayFloors(this.campus, this.scope);
    document.getElementById("map-subtitle")!.textContent = this.scope.group ? "連絡棟" : "平面図";
    document.getElementById("map-legend")!.textContent = "青：部屋　" +
      (shown.some(({ floor }) => floor.rooms.some(r => r.spaceType === "area"))
        ? "淡色：利用エリア　" : "") +
      (shown.some(({ floor }) => floor.rooms.some(r => r.passThrough === true))
        ? "青緑：共用区画　" : "") +
      "緑：WC　水色：EV　黄：階段　紫：参考ルート";
    document.getElementById("map-heading")!.textContent = `${name}${level ? ` / ${level}` : ""}`;
    this.svg.setAttribute("aria-label", `${name} ${level ?? "フロア未登録"} 平面図（模式図）`);
    document.getElementById("map-caption")!.textContent = shown.length
      ? "模式図・距離未測定"
      : "フロア未登録";
    if (!shown.length) {
      this.label("フロア未登録", [50, 35], "map-label empty-label");
      this.label("資料の確認後に順次追加予定", [50, 45]);
      return;
    }
    this.renderConnections();
    for (const { building, floor } of shown) {
      const angle = building.rotation ?? 0, c = Math.cos(angle), sn = Math.sin(angle);
      const group = element("g", { class: "map-floor", "data-building": building.id,
        ...(this.scope.group ? { transform: `matrix(${c} ${-sn} ${sn} ${c} ${building.origin[0]} ${building.origin[2]})` } : {}) });
      this.svg.append(group); this.layer = group;
      this.renderFloor(building, floor);
      if (this.scope.group) {
        const b = bounds(floor.outline!);
        this.label(`${building.name} ${floor.label}`, [b.x, b.z - b.d / 2 - 3], "map-label map-building-label");
      }
    }
    this.layer = this.svg;
    this.svg.append(this.overlay);
    this.renderRoute();
    this.selectPlace(this.selected);
  }
  private renderFloor(building: Building, floor: Floor) {
    this.layer.append(
      element("polygon", {
        points: points(floor.outline!),
        class: "map-slab",
      }),
    );
    for (const hole of floor.voids ?? []) {
      this.layer.append(
        element("polygon", { points: points(hole), class: "map-void" }),
      );
      const b = bounds(hole);
      this.label("吹抜", [b.x, b.z], "map-label map-void-label");
    }
    for (const place of this.places.filter(
      (p) =>
        p.buildingId === building.id &&
        p.floorLevel === floor.level,
    )) {
      const group = element("g", {
        class:
          place.kind === "room"
            ? "map-room"
            : `map-place map-feature-${place.kind}`,
        "data-place": place.id,
      });
      if (place.polygon)
        group.append(
          element("polygon", {
            points: points(place.polygon),
            class: place.nodeId ? "" : "map-room-unlinked",
          }),
        );
      else
        group.append(
          element("circle", {
            cx: String(place.position[0]),
            cy: String(place.position[1]),
            r: "2",
          }),
        );
      const room = place.kind === "room"
        ? floor.rooms.find((r) => r.id === place.roomId)
        : undefined;
      if (room?.spaceType === "area") group.classList.add("map-open-area");
      if (room?.passThrough === true) group.classList.add("map-public-area");
      const label =
        place.kind === "room"
          ? room?.mapLabel ?? place.roomId!
          : floor.features?.find(f => f.id === place.featureId)?.mapLabel ?? (place.kind === "restroom"
            ? place.restroomType
              ? {
                  male: "WC 男",
                  female: "WC 女",
                  multipurpose: "WC ♿",
                  "all-gender": "WC 共用",
                }[place.restroomType]
              : "WC"
            : place.name.split("（")[0]);
      group.append(
        element(
          "text",
          {
            x: String(place.position[0]),
            y: String(place.position[1]),
            class:
              place.kind === "room"
                ? "map-room-label"
                : "map-label map-feature-label",
            "text-anchor": "middle",
            "dominant-baseline": "middle",
            ...(room ? {
              style: `font-size:${Math.min(2.5, room.box.w / (label.length * 0.65 + 1), room.box.d / 1.8)}px`,
            } : {}),
          },
          label,
        ),
      );
      group.append(element("title", {}, place.name));
      this.interactive(
        group,
        `${place.name} ${place.buildingName} ${place.floorLabel}${place.nodeId ? "" : "（経路未登録）"}`,
        () => this.onPlaceSelect?.(place),
      );
      this.layer.append(group);
    }
    // Keep non-selectable obstacles visible over public circulation zones.
    for (const feature of floor.features ?? []) {
      if (
        this.places.some(
          (p) =>
            p.buildingId === building.id &&
            p.floorLevel === floor.level &&
            p.featureId === feature.id,
        )
      )
        continue;
      this.layer.append(
        element("polygon", {
          points: points(feature.polygon),
          class: "map-feature",
        }),
      );
      const b = bounds(feature.polygon);
      this.label(feature.label, [b.x, b.z], "map-label map-feature-label", b.w);
    }
  }
  private renderConnections() {
    if (!this.scope.group) return;
    const nodes = new Map(this.campus.navigation.nodes.map(n => [n.id, n]));
    for (const e of this.campus.navigation.edges) {
      const a = nodes.get(e.from)!, b = nodes.get(e.to)!;
      if (e.blocked || !a.buildingId || !b.buildingId || a.buildingId === b.buildingId ||
        !nodeInScope(this.campus, this.scope, a) || !nodeInScope(this.campus, this.scope, b)) continue;
      const vertical = ["stairs", "ramp", "elevator"].includes(e.type);
      if (e.passageWidth !== undefined) {
        const [p, q] = [this.local(a), this.local(b)], dx = q[0] - p[0], dz = q[1] - p[1];
        const length = Math.hypot(dx, dz);
        if (length < 1e-7) continue; // The two floor polygons already share their corridor boundary.
        const nx = -dz / length * e.passageWidth / 2, nz = dx / length * e.passageWidth / 2;
        this.svg.append(element("polygon", { points: points([[p[0]+nx,p[1]+nz], [q[0]+nx,q[1]+nz],
          [q[0]-nx,q[1]-nz], [p[0]-nx,p[1]-nz]]), class: "map-passage",
          "data-edge-type": e.type, "data-cover": e.cover ?? "unknown", "pointer-events": "none" }));
        continue;
      }
      this.svg.append(element("polyline", { points: points([this.local(a), this.local(b)]),
        class: `map-connection${vertical ? " map-connection-transition" : ""}`,
        "data-edge-type": e.type, "pointer-events": "none" }));
    }
  }
  private local(node: NavNode): Point2 {
    if (this.scope.group) return [node.position[0], node.position[2]];
    return worldToLocal(
      this.campus.buildings.find((b) => b.id === node.buildingId)!,
      node.position,
    );
  }
  private renderRoute() {
    this.overlay.replaceChildren();
    if (!this.result) return;
    if (this.overviewMode) {
      const nodes = this.result.pathNodes;
      for (let i = 1; i < nodes.length; i++) {
        const a = nodes[i - 1], b = nodes[i];
        if (a.overviewPosition && b.overviewPosition && (!a.buildingId || !b.buildingId))
          this.overlay.append(element("polyline", {
            points: points([a.overviewPosition, b.overviewPosition]), class: "map-route",
          }));
      }
      for (const node of nodes.filter((n) => n.overviewPosition &&
        (n.buildingId || n === nodes[0] || n === nodes.at(-1)))) {
        const p = node.overviewPosition!;
        this.overlay.append(element("circle", {
          cx: String(p[0]), cy: String(p[1]), r: "1.1",
          class: `map-route-marker ${node === nodes[0] ? "start" : node === nodes.at(-1) ? "goal" : "transfer"}`,
        }));
      }
      return;
    }
    if (!this.floor) return;
    const nodes = this.result.pathNodes,
      matches = (n: NavNode) =>
        nodeInScope(this.campus, this.scope, n);
    for (let i = 1; i < nodes.length; i++)
      if (matches(nodes[i - 1]) && matches(nodes[i]))
        this.overlay.append(
          element("polyline", {
            points: points([this.local(nodes[i - 1]), this.local(nodes[i])]),
            class: "map-route",
          }),
        );
    for (const node of nodes.filter(
      (n, i) => matches(n) &&
        (i === 0 || i === nodes.length - 1 || !matches(nodes[i - 1]) || !matches(nodes[i + 1])),
    )) {
      const p = this.local(node);
      this.overlay.append(
        element("circle", {
          cx: String(p[0]),
          cy: String(p[1]),
          r: "1.6",
          class: `map-route-marker ${node === nodes[0] ? "start" : node === nodes.at(-1) ? "goal" : "transfer"}`,
        }),
      );
    }
  }
  private renderOverview() {
    this.svg.setAttribute("aria-label", this.overview.reference
      ? "横浜キャンパス 空中写真を参考にした建物配置の概略図（北が上）"
      : "横浜キャンパス 建物配置の模式図");
    document.getElementById("map-heading")!.textContent = "横浜キャンパス";
    document.getElementById("map-subtitle")!.textContent = this.overview.reference
      ? "北が上"
      : "建物配置";
    document.getElementById("map-legend")!.textContent =
      "水色：平面図あり　灰：未登録　細線：道路　破線：通路　青：橋　紫点線：地下　橙：階段・スロープ　紫：参考ルート";
    const caption = document.getElementById("map-caption")!;
    caption.textContent = "建物を選ぶと平面図へ。";
    if (this.overview.reference) {
      const attribution = document.createElement("a");
      attribution.textContent = `出典：${this.overview.reference.attribution.label}`;
      attribution.href = this.overview.reference.attribution.url;
      attribution.target = "_blank";
      attribution.rel = "noopener noreferrer";
      caption.append(" ", attribution);
      const box = bounds(this.overview.buildings.flatMap((b) => b.polygon));
      const x = box.x + box.w / 2 + 3, y = box.z - box.d / 2 + 2;
      this.svg.append(element("path", {
        d: `M ${x} ${y + 6} V ${y} m -1.3 2 1.3 -2 1.3 2`,
        class: "map-north-arrow", "aria-hidden": "true",
      }));
      this.label("北", [x, y - 2], "map-label map-north-label");
    }
    const roadLayer = element("g", { class: "map-context-roads", "aria-hidden": "true" });
    for (const road of this.overview.contextRoads ?? [])
      roadLayer.append(element("polyline", {
        points: points(road.points), class: "map-context-road", "data-road": road.id,
        "stroke-width": String(OVERVIEW_ROAD_WIDTH),
        "aria-hidden": "true",
      }));
    this.svg.append(roadLayer);
    const outdoorNodes = new Map(this.campus.navigation.nodes.map((n) => [n.id, n]));
    for (const edge of this.campus.navigation.edges) {
      const a = outdoorNodes.get(edge.from), b = outdoorNodes.get(edge.to);
      if (!a?.buildingId && !b?.buildingId && a?.overviewPosition && b?.overviewPosition && !edge.blocked)
      this.svg.append(element("polyline", {
          points: points([a.overviewPosition, b.overviewPosition]),
          class: `map-outdoor-path${["stairs", "ramp", "elevator"].includes(edge.type) ? " map-outdoor-transition" : a.outdoorLayer === "bridge" && b.outdoorLayer === "bridge" ? " map-outdoor-bridge" : a.outdoorLayer === "underground" && b.outdoorLayer === "underground" ? " map-outdoor-underground" : ""}`,
          "data-from": a.id, "data-to": b.id, "data-edge-type": edge.type,
          "data-from-layer": a.outdoorLayer ?? "ground", "data-to-layer": b.outdoorLayer ?? "ground",
        }));
    }
    const catalog = buildingCatalog(this.campus, this.overview);
    for (const building of this.overview.buildings) {
      const supported = !!catalog.find((b) => b.id === building.id)?.data
        ?.floors.length;
      const group = element("g", {
        class: `map-campus-building${supported ? " supported" : ""}`,
      });
      group.append(element("polygon", { points: points(building.polygon) }));
      const label = overviewBuildingLabel(building.polygon, building.name);
      const [labelX, labelY] = label.position;
      const text = element("text", {
        x: String(labelX), y: String(labelY), "text-anchor": "middle", "dominant-baseline": "middle",
        transform: `rotate(${label.angle} ${labelX} ${labelY})`, style: `font-size:${label.fontSize}px`,
      });
      label.lines.forEach((line, i) => text.append(element("tspan", {
        x: String(labelX), y: String(labelY + (i - (label.lines.length - 1) / 2) * label.fontSize * 1.2),
      }, line)));
      group.append(text);
      this.interactive(
        group,
        `${building.name}（${supported ? "フロア登録済み" : "フロア未登録"}）`,
        () => this.onBuildingSelect?.(building.id),
      );
      this.svg.append(group);
    }
    for (const gate of this.places.filter((p) => p.kind === "gate")) {
      const [x, z] = gate.position;
      const group = element("g", {
        class: "map-campus-gate",
        "data-place": gate.id,
      });
      group.append(
        element("rect", {
          x: String(x - 3),
          y: String(z - 1.7),
          width: "6",
          height: "3.4",
          rx: "1",
        }),
      );
      group.append(
        element(
          "text",
          {
            x: String(x),
            y: String(z),
            class: "map-label map-gate",
            "text-anchor": "middle",
            "dominant-baseline": "middle",
          },
          gate.name,
        ),
      );
      this.interactive(group, `${gate.name}（${gate.nodeId ? "屋外参考ルートあり" : "屋外経路未登録"}）`, () =>
        this.onPlaceSelect?.(gate),
      );
      this.svg.append(group);
    }
    this.svg.append(this.overlay);
    this.renderRoute();
    this.selectPlace(this.selected);
  }
}
