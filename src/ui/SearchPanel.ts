import type { Place, RouteFilterType, RouteResult } from "../types/campus";
import {
  placeContext,
  placeDisplayName,
  searchPlaces,
} from "../data/places.js";

import { SelectionState } from "./SelectionState.js";
import type { EndpointTarget as Target } from "./SelectionState.js";
export class SearchPanel {
  private selected: Record<Target, { id: string; name: string } | null> = {
    start: null,
    dest: null,
  };
  private filter: RouteFilterType = "shortest";
  private buildingId?: string;
  private floorLevel?: number;
  private statusMessage = "";
  private statusKind: "warning" | "error" = "error";
  public onStateChange: (() => void) | null = null;
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
  constructor(
    private places: Place[],
    private selection = new SelectionState(),
  ) {
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
          this.setPick(this.selection.pickTarget === target ? "none" : target),
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
      sub.textContent = `${placeContext(place)}${place.approachRoomId ? " / 手前の部屋まで案内" : place.nodeId ? "" : " / 経路未登録"}`;
      row.append(name, sub);
      row.addEventListener("click", () => {
        this.onPlaceFocus?.(place);
        this.setPlace(target, place);
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
    if (target !== "none") {
      for (const key of ["start", "dest"] as const) {
        const input = this.input(key);
        input.blur?.();
        input.setAttribute("aria-expanded", "false");
        input.removeAttribute("aria-activedescendant");
        this.suggestions(key).classList.add("hidden");
      }
    }
    this.selection.pickTarget = target;
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
  public setPlace(target: Target, place: Place) {
    this.setPoint(
      target,
      place.approachRoomId ? place.id : place.nodeId ?? place.id,
      placeDisplayName(place),
    );
  }
  public cancelPick() {
    this.setPick("none");
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
    this.onStateChange?.();
  }
  public getState() {
    return {
      start: this.selected.start?.name ?? this.input("start").value,
      dest: this.selected.dest?.name ?? this.input("dest").value,
      startConfirmed: !!this.selected.start,
      destConfirmed: !!this.selected.dest,
      filter: this.filter,
      inferred: (document.getElementById("allow-inferred") as HTMLInputElement).checked,
      status: this.statusMessage,
      statusKind: this.statusKind,
    };
  }
  public updateSummary(result: RouteResult) {
    document.getElementById("summary-distance")!.textContent =
      result.distanceUnit === "meters" ? `${result.totalDistance} m` : "未測定";
    document.getElementById("summary-time")!.textContent =
      result.distanceUnit === "meters"
        ? `約 ${result.estimatedMinutes} 分`
        : "未測定";
    const movement = result.verticalMovements;
    document.getElementById("summary-vertical")!.textContent = [
      ...(result.floorChanges ? [`${result.floorChanges} フロア移動`] : []),
      ...(movement?.stairs ? ["階段あり"] : []),
      ...(movement?.ramps ? ["スロープあり"] : []),
      ...(movement?.elevators ? ["EVあり"] : []),
      ...(movement?.unmeasured ? ["昇降量未確認"] : []),
    ].join(" / ") || "階移動なし";
    const confidence = result.pathNodes.length === 1
        ? result.endpointNotes?.length
          ? "案内地点は同じです"
          : "同じ場所です"
        : result.inferredConnections
          ? "参考ルート"
          : "確認済みルート";
    document.getElementById("route-confidence")!.textContent =
      [confidence,
        ...(result.pathNodes.some((n) => !n.buildingId)
          ? ["屋外はキャンパス図で確認"] : []),
        ...(result.endpointNotes ?? [])].join(" / ");
    document.getElementById("route-summary-panel")!.classList.remove("hidden");
  }
  public hideSummary() {
    document.getElementById("route-summary-panel")!.classList.add("hidden");
  }
  public setStatus(message = "", kind: "warning" | "error" = "error") {
    this.statusMessage = message;
    this.statusKind = kind;
    const element = document.getElementById("route-status")!;
    element.textContent = message;
    element.classList.toggle("hidden", !message);
    element.dataset.kind = kind;
    this.onStateChange?.();
  }
}
