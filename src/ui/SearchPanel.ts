import type { Place, RouteFilterType, RouteResult } from "../types/campus";
import { placeDisplayName, searchPlaces } from "../data/places.js";

type Target = "start" | "dest";
export class SearchPanel {
  private selected: Record<Target, { id: string; name: string } | null> = {
    start: null,
    dest: null,
  };
  private pick: Target | "none" = "none";
  private filter: RouteFilterType = "shortest";
  private buildingId?: string;
  private floorLevel?: number;
  public onRouteSearch:
    | ((
        start: string,
        end: string,
        filter: RouteFilterType,
        inferred: boolean,
      ) => void)
    | null = null;
  public onRouteClear: (() => void) | null = null;
  public onPlaceFocus: ((place: Place) => void) | null = null;
  public onPickModeToggle: ((target: Target | "none") => void) | null = null;
  constructor(private places: Place[]) {
    for (const target of ["start", "dest"] as const) {
      const input = this.input(target),
        suggestions = this.suggestions(target);
      let active = -1;
      const close = () => {
        suggestions.classList.add("hidden");
        input.setAttribute("aria-expanded", "false");
        input.removeAttribute("aria-activedescendant");
        active = -1;
      };
      input.addEventListener("input", () => {
        this.selected[target] = null;
        this.checkAndTriggerSearch();
        this.renderSuggestions(target);
        active = -1;
      });
      input.addEventListener("focus", () => {
        if (input.value && !this.selected[target])
          this.renderSuggestions(target);
      });
      input.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          close();
          this.setPick("none");
          return;
        }
        const rows = [
          ...suggestions.querySelectorAll<HTMLButtonElement>("button"),
        ];
        if (suggestions.classList.contains("hidden") || !rows.length) return;
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          active =
            active < 0
              ? e.key === "ArrowDown"
                ? 0
                : rows.length - 1
              : (active + (e.key === "ArrowDown" ? 1 : -1) + rows.length) %
                rows.length;
          rows.forEach((r, i) => {
            r.classList.toggle("active", i === active);
            r.setAttribute("aria-selected", String(i === active));
          });
          input.setAttribute("aria-activedescendant", rows[active].id);
        } else if (e.key === "Enter") {
          e.preventDefault();
          rows[Math.max(0, active)].click();
          close();
        }
      });
      document
        .getElementById(`btn-clear-${target}`)!
        .addEventListener("click", () => {
          this.selected[target] = null;
          input.value = "";
          close();
          this.setPick("none");
          this.checkAndTriggerSearch();
          input.focus();
        });
      document
        .getElementById(`btn-pick-${target}`)!
        .addEventListener("click", () =>
          this.setPick(this.pick === target ? "none" : target),
        );
      document.addEventListener("click", (e) => {
        const node = e.target as Node;
        if (!input.contains(node) && !suggestions.contains(node)) close();
      });
    }
    document
      .getElementById("btn-swap-points")!
      .addEventListener("click", () => {
        [this.selected.start, this.selected.dest] = [
          this.selected.dest,
          this.selected.start,
        ];
        const a = this.input("start"),
          b = this.input("dest");
        [a.value, b.value] = [b.value, a.value];
        this.setPick("none");
        this.checkAndTriggerSearch();
      });
    document
      .getElementById("allow-inferred")!
      .addEventListener("change", () => this.checkAndTriggerSearch());
    document
      .querySelectorAll<HTMLButtonElement>(".filter-btn")
      .forEach((button) =>
        button.addEventListener("click", () => {
          this.filter = button.dataset.filter as RouteFilterType;
          document
            .querySelectorAll<HTMLButtonElement>(".filter-btn")
            .forEach((b) => {
              const selected = b === button;
              b.classList.toggle("active", selected);
              b.setAttribute("aria-pressed", String(selected));
            });
          this.checkAndTriggerSearch();
        }),
      );
  }
  private input(target: Target) {
    return document.getElementById(`input-${target}`) as HTMLInputElement;
  }
  private suggestions(target: Target) {
    return document.getElementById(`suggestions-${target}`)!;
  }
  public setContext(buildingId?: string, floorLevel?: number) {
    this.buildingId = buildingId;
    this.floorLevel = floorLevel;
  }
  private renderSuggestions(target: Target) {
    const container = this.suggestions(target),
      input = this.input(target);
    container.replaceChildren();
    input.removeAttribute("aria-activedescendant");
    const matches = searchPlaces(
      this.places,
      input.value,
      this.buildingId,
      this.floorLevel,
    ).slice(0, 12);
    if (!matches.length) {
      const empty = document.createElement("p");
      empty.className = "suggestion-item";
      empty.textContent = "該当する場所が見つかりません";
      container.append(empty);
    }
    matches.forEach((place, i) => {
      const row = document.createElement("button");
      row.type = "button";
      row.setAttribute("role", "option");
      row.setAttribute("aria-selected", "false");
      row.tabIndex = -1;
      row.className = "suggestion-item";
      row.id = `suggestion-${target}-${i}`;
      const name = document.createElement("span"),
        sub = document.createElement("span");
      name.className = "suggestion-name";
      name.textContent = place.name;
      sub.className = "suggestion-sub";
      sub.textContent = `${place.buildingName} ${place.floorLabel}${place.nodeId ? "" : " / 経路未登録"}`;
      row.append(name, sub);
      row.addEventListener("click", () => {
        this.onPlaceFocus?.(place);
        if (place.nodeId)
          this.setPoint(target, place.nodeId, placeDisplayName(place));
        container.classList.add("hidden");
        input.setAttribute("aria-expanded", "false");
        input.removeAttribute("aria-activedescendant");
      });
      container.append(row);
    });
    container.classList.remove("hidden");
    input.setAttribute("aria-expanded", "true");
  }
  private setPick(target: Target | "none") {
    this.pick = target;
    for (const key of ["start", "dest"] as const) {
      const b = document.getElementById(`btn-pick-${key}`)!;
      b.classList.toggle("active", key === target);
      b.setAttribute("aria-pressed", String(key === target));
    }
    this.onPickModeToggle?.(target);
  }
  private setPoint(target: Target, id: string, name: string) {
    this.selected[target] = { id, name };
    this.input(target).value = name;
    this.suggestions(target).classList.add("hidden");
    this.input(target).setAttribute("aria-expanded", "false");
    this.input(target).removeAttribute("aria-activedescendant");
    this.setPick("none");
    this.checkAndTriggerSearch();
  }
  public setStart(id: string, name: string) {
    this.setPoint("start", id, name);
  }
  public setDest(id: string, name: string) {
    this.setPoint("dest", id, name);
  }
  public checkAndTriggerSearch() {
    for (const t of ["start", "dest"] as const)
      document
        .getElementById(`btn-clear-${t}`)!
        .classList.toggle("hidden", !this.input(t).value);
    if (this.selected.start && this.selected.dest)
      this.onRouteSearch?.(
        this.selected.start.id,
        this.selected.dest.id,
        this.filter,
        (document.getElementById("allow-inferred") as HTMLInputElement).checked,
      );
    else {
      this.hideSummary();
      this.onRouteClear?.();
    }
  }
  public updateSummary(result: RouteResult) {
    document.getElementById("summary-distance")!.textContent =
      result.distanceUnit === "meters" ? `${result.totalDistance} m` : "未測定";
    document.getElementById("summary-time")!.textContent =
      result.distanceUnit === "meters"
        ? `約 ${result.estimatedMinutes} 分`
        : "未測定";
    document.getElementById("summary-vertical")!.textContent =
      result.floorChanges ? `${result.floorChanges} フロア移動` : "階移動なし";
    document.getElementById("route-confidence")!.textContent =
      result.pathNodes.length === 1
        ? "出発地と目的地は同じ場所です"
        : result.inferredConnections
          ? "参考ルート（現地未確認の接続を含みます）"
          : "現地確認済みの接続";
    document.getElementById("route-summary-panel")!.classList.remove("hidden");
  }
  public hideSummary() {
    document.getElementById("route-summary-panel")!.classList.add("hidden");
  }
}
