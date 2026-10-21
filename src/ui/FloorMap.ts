import type {
  CampusData,
  Floor,
  NavNode,
  Point2,
  Place,
  RouteResult,
} from "../types/campus";
import type { ScreenPoint } from "./SelectionPopover";
import type { CampusOverview } from "../data/schema";
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
  private building?: BuildingEntry;
  private places: Place[];
  private result: RouteResult | null = null;
  private selected: string | null = null;
  private overviewMode = false;
  private viewBox = [-8, -8, 141, 112];
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
  public setLocation(building: BuildingEntry | undefined, floor?: Floor) {
    const changed =
      this.building?.id !== building?.id || this.floor?.id !== floor?.id;
    this.building = building;
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
  }
  public getPlaceAnchor(id: string): ScreenPoint | null {
    const place = this.places.find((p) => p.id === id);
    if (
      !place ||
      (this.overviewMode
        ? place.scope !== "campus"
        : place.scope === "campus" ||
          place.buildingId !== this.building?.id ||
          place.floorLevel !== this.floor?.level)
    ) return null;
    const rect = this.svg.getBoundingClientRect();
    const [x, y, w, h] = this.viewBox;
    const scale = Math.min(rect.width / w, rect.height / h);
    if (scale <= 0) return null;
    const point = {
      x: rect.left + (rect.width - w * scale) / 2 + (place.position[0] - x) * scale,
      y: rect.top + (rect.height - h * scale) / 2 + (place.position[1] - y) * scale,
    };
    return point.x >= rect.left && point.x <= rect.right &&
      point.y >= rect.top && point.y <= rect.bottom ? point : null;
  }
  public resetView() {
    const polygons = this.overviewMode
      ? this.overview.buildings.flatMap((b) => b.polygon)
      : this.floor?.outline;
    if (polygons?.length) {
      const b = bounds(polygons);
      this.viewBox = [b.x - b.w / 2 - 8, b.z - b.d / 2 - 8, b.w + 16, b.d + 16];
    } else this.viewBox = [0, 0, 100, 80];
    this.applyViewBox();
  }
  public zoom(factor: number) {
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
    let start: { x: number; y: number; box: number[] } | null = null,
      dragged = false;
    this.svg.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      start = { x: e.clientX, y: e.clientY, box: [...this.viewBox] };
      dragged = false;
    });
    this.svg.addEventListener("pointermove", (e) => {
      if (!start) return;
      const dx = e.clientX - start.x,
        dy = e.clientY - start.y;
      if (Math.hypot(dx, dy) < 6 && !dragged) return;
      dragged = true;
      this.svg.setPointerCapture(e.pointerId);
      const rect = this.svg.getBoundingClientRect(),
        scale = Math.min(rect.width / start.box[2], rect.height / start.box[3]);
      if (scale <= 0) return;
      this.viewBox = [
        start.box[0] - dx / scale,
        start.box[1] - dy / scale,
        start.box[2],
        start.box[3],
      ];
      this.applyViewBox();
    });
    this.svg.addEventListener("pointerup", () => {
      start = null;
    });
    this.svg.addEventListener("pointercancel", () => {
      start = null;
      dragged = false;
    });
    this.svg.addEventListener(
      "click",
      (e) => {
        if (dragged) {
          e.stopImmediatePropagation();
          dragged = false;
        }
      },
      true,
    );
    this.svg.addEventListener("click", (e) => {
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
  private label(text: string, p: Point2, className = "map-label") {
    this.svg.append(
      element(
        "text",
        {
          x: String(p[0]),
          y: String(p[1]),
          class: className,
          "text-anchor": "middle",
          "dominant-baseline": "middle",
        },
        text,
      ),
    );
  }
  private interactive(group: SVGGElement, label: string, select: () => void) {
    group.setAttribute("role", "button");
    group.setAttribute("tabindex", "0");
    group.setAttribute("aria-label", label);
    group.addEventListener("click", select);
    group.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        select();
      }
    });
  }
  private render() {
    this.svg.replaceChildren();
    this.applyViewBox();
    if (this.overviewMode) {
      this.renderOverview();
      return;
    }
    const name = this.building?.name ?? "建物";
    document.getElementById("map-subtitle")!.textContent = "掲示図に基づく模式図";
    document.getElementById("map-legend")!.textContent =
      "青：部屋　緑：WC　水色：EV　黄：階段　紫：参考ルート";
    document.getElementById("map-heading")!.textContent =
      `${name}${this.floor ? ` / ${this.floor.label}` : ""}`;
    this.svg.setAttribute(
      "aria-label",
      `${name} ${this.floor?.label ?? "フロア未登録"} 平面図（模式図）`,
    );
    document.getElementById("map-caption")!.textContent =
      this.floor?.notes?.join(" ") ??
      "この建物のフロア・設備・経路は未登録です。建物配置はキャンパス表示で確認できます。";
    if (!this.floor) {
      this.label("フロア未登録", [50, 35], "map-label empty-label");
      this.label("資料の確認後に順次追加予定", [50, 45]);
      return;
    }
    this.svg.append(
      element("polygon", {
        points: points(this.floor.outline!),
        class: "map-slab",
      }),
    );
    for (const hole of this.floor.voids ?? []) {
      this.svg.append(
        element("polygon", { points: points(hole), class: "map-void" }),
      );
      const b = bounds(hole);
      this.label("吹抜", [b.x, b.z], "map-label map-void-label");
    }
    for (const feature of this.floor.features ?? []) {
      if (
        this.places.some(
          (p) =>
            p.buildingId === this.building?.id &&
            p.floorLevel === this.floor!.level &&
            p.featureId === feature.id,
        )
      )
        continue;
      this.svg.append(
        element("polygon", {
          points: points(feature.polygon),
          class: "map-feature",
        }),
      );
      const b = bounds(feature.polygon);
      this.label(feature.label, [b.x, b.z], "map-label map-feature-label");
    }
    for (const place of this.places.filter(
      (p) =>
        p.buildingId === this.building?.id &&
        p.floorLevel === this.floor!.level,
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
        ? this.floor.rooms.find((r) => r.id === place.roomId)
        : undefined;
      const label =
        place.kind === "room"
          ? room?.mapLabel ?? place.roomId!
          : place.kind === "restroom"
            ? place.restroomType
              ? {
                  male: "WC 男",
                  female: "WC 女",
                  multipurpose: "WC ♿",
                  "all-gender": "WC 共用",
                }[place.restroomType]
              : "WC"
            : place.name.split("（")[0];
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
      this.svg.append(group);
    }
    this.svg.append(this.overlay);
    this.renderRoute();
    this.selectPlace(this.selected);
  }
  private local(node: NavNode): Point2 {
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
        n.floor === this.floor!.level && n.buildingId === this.building?.id;
    for (let i = 1; i < nodes.length; i++)
      if (matches(nodes[i - 1]) && matches(nodes[i]))
        this.overlay.append(
          element("polyline", {
            points: points([this.local(nodes[i - 1]), this.local(nodes[i])]),
            class: "map-route",
          }),
        );
    for (const node of nodes.filter(
      (n) =>
        matches(n) &&
        (n === nodes[0] ||
          n === nodes.at(-1) ||
          n.type === "stairs" ||
          n.type === "elevator"),
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
      ? "空中写真を参考にした概略図・北が上"
      : "建物配置の模式図";
    document.getElementById("map-legend")!.textContent =
      "水色：フロア登録済み　灰：フロア未登録　破線：屋外参考経路　紫：選択中の経路";
    const caption = document.getElementById("map-caption")!;
    caption.textContent = this.overview.notes?.join(" ") ??
      "建物を選ぶと館内図を表示。屋外の経路・実寸・方位は未校正です。";
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
    const outdoorNodes = new Map(this.campus.navigation.nodes.map((n) => [n.id, n]));
    for (const edge of this.campus.navigation.edges) {
      const a = outdoorNodes.get(edge.from), b = outdoorNodes.get(edge.to);
      if (!a?.buildingId && !b?.buildingId && a?.overviewPosition && b?.overviewPosition && !edge.blocked)
        this.svg.append(element("polyline", {
          points: points([a.overviewPosition, b.overviewPosition]), class: "map-outdoor-path",
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
      const b = bounds(building.polygon);
      group.append(
        element(
          "text",
          {
            x: String(b.x),
            y: String(b.z),
            "text-anchor": "middle",
            "dominant-baseline": "middle",
            style: `font-size:${Math.min(2.1, b.w / (building.name.length * 0.65 + 1), b.d / 1.8)}px`,
          },
          building.name,
        ),
      );
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
      this.interactive(group, `${gate.name}（${gate.nodeId ? "屋外参考経路あり" : "屋外経路未登録"}）`, () =>
        this.onPlaceSelect?.(gate),
      );
      this.svg.append(group);
    }
    this.svg.append(this.overlay);
    this.renderRoute();
    this.selectPlace(this.selected);
  }
}
